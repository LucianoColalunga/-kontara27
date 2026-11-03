import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { budgetAlerts, budgets, categories, memberships, notifications, roles, sectors } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { type Database, type Tx, withTenant } from "@/server/platform/db";
import { NotFoundError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";

const budgetInput = z.object({
  name: z.string().trim().min(2, "Ingresá un nombre.").max(80),
  period: z.enum(["monthly", "annual"]),
  amount: z.string().trim().min(1).max(32),
  currency: z.string().regex(/^[A-Z]{3}$/),
  categoryId: z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  sectorId: z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  alertThresholdPct: z.coerce.number().int().min(1).max(100).default(80),
  startsOn: z.iso.date(),
  endsOn: z.union([z.iso.date(), z.literal(""), z.null()]).optional().transform((v) => v || null),
});

export interface BudgetProgress {
  id: string;
  name: string;
  period: "monthly" | "annual";
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  amountMinor: bigint;
  spentMinor: bigint;
  remainingMinor: bigint;
  pct: number;
  currency: string;
  categoryName: string | null;
  sectorName: string | null;
  alertThresholdPct: number;
  state: "ok" | "warning" | "exceeded";
}

/** Rango del período que contiene `on` (YYYY-MM-DD). */
export function budgetPeriod(period: "monthly" | "annual", on: string): { from: string; to: string; key: string; label: string } {
  const [y, m] = on.split("-").map(Number) as [number, number];
  if (period === "annual") return { from: `${y}-01-01`, to: `${y}-12-31`, key: String(y), label: String(y) };
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last}`, key: `${y}-${mm}`, label };
}

export function budgetState(pct: number, threshold: number): BudgetProgress["state"] {
  if (pct >= 100) return "exceeded";
  if (pct >= threshold) return "warning";
  return "ok";
}

export class BudgetService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  private today(ctx: TenantContext): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: ctx.organization.timezone }).format(this.clock.now());
  }

  async create(ctx: TenantContext, raw: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "budgets.manage");
    const data = this.parse(raw);
    const id = uuidv7();
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      await this.assertRefs(tx, data.categoryId, data.sectorId);
      await tx.insert(budgets).values({ id, organizationId: ctx.organizationId, name: data.name, period: data.period, amountMinor: data.amountMinor, currency: data.currency, categoryId: data.categoryId, sectorId: data.sectorId, alertThresholdPct: data.alertThresholdPct, startsOn: data.startsOn, endsOn: data.endsOn, createdBy: ctx.userId });
      await recordAudit(tx, { action: "budget.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "budget", entityId: id, request: meta });
    });
    return id;
  }

  async update(ctx: TenantContext, id: string, raw: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "budgets.manage");
    const data = this.parse(raw);
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      await this.assertRefs(tx, data.categoryId, data.sectorId);
      const result = await tx.update(budgets).set({ name: data.name, period: data.period, amountMinor: data.amountMinor, currency: data.currency, categoryId: data.categoryId, sectorId: data.sectorId, alertThresholdPct: data.alertThresholdPct, startsOn: data.startsOn, endsOn: data.endsOn, updatedAt: this.clock.now() }).where(eq(budgets.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "budget.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "budget", entityId: id, request: meta });
    });
  }

  async archive(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "budgets.manage");
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(budgets).set({ isArchived: true, updatedAt: this.clock.now() }).where(eq(budgets.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "budget.archived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "budget", entityId: id, request: meta });
    });
  }

  private parse(raw: unknown) {
    const parsed = budgetInput.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Revisá los datos.");
    const data = parsed.data;
    let amountMinor: bigint;
    try {
      amountMinor = parseMoney(data.amount, data.currency);
    } catch (error) {
      throw new ValidationError((error as Error).message, { amount: (error as Error).message });
    }
    if (amountMinor <= 0n) throw new ValidationError("El monto del presupuesto tiene que ser mayor a cero.", { amount: "Mayor a cero" });
    if (data.endsOn && data.endsOn < data.startsOn) throw new ValidationError("La fecha de fin es anterior al inicio.", { endsOn: "Fecha inválida" });
    return { ...data, amountMinor };
  }

  private async assertRefs(tx: Tx, categoryId: string | null, sectorId: string | null) {
    if (categoryId) {
      const [c] = await tx.select({ id: categories.id, scope: categories.scope }).from(categories).where(eq(categories.id, categoryId)).limit(1);
      if (!c) throw new ValidationError("La categoría no existe.", { categoryId: "No existe" });
      if (c.scope === "income") throw new ValidationError("Los presupuestos controlan gastos: elegí una categoría de gastos.", { categoryId: "Categoría de ingresos" });
    }
    if (sectorId) {
      const [s] = await tx.select({ id: sectors.id }).from(sectors).where(eq(sectors.id, sectorId)).limit(1);
      if (!s) throw new ValidationError("El sector no existe.", { sectorId: "No existe" });
    }
  }

  /** Progreso de cada presupuesto vigente en el período que contiene `on`. Gasto = gastos + inversiones − devoluciones recibidas. */
  async progress(ctx: TenantContext, on?: string): Promise<BudgetProgress[]> {
    authorize(ctx, "budgets.view");
    const date = on ?? this.today(ctx);
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const list = await tx
        .select({ budget: budgets, categoryName: categories.name, sectorName: sectors.name })
        .from(budgets)
        .leftJoin(categories, eq(categories.id, budgets.categoryId))
        .leftJoin(sectors, eq(sectors.id, budgets.sectorId))
        .where(and(eq(budgets.isArchived, false), sql`${budgets.startsOn} <= ${date}`, sql`(${budgets.endsOn} is null or ${budgets.endsOn} >= ${date})`))
        .orderBy(asc(budgets.name));
      const out: BudgetProgress[] = [];
      for (const { budget, categoryName, sectorName } of list) {
        const period = budgetPeriod(budget.period, date);
        const spent = await this.spent(tx, budget.currency, period.from, period.to, budget.categoryId, budget.sectorId);
        const pct = Number((spent * 1000n) / budget.amountMinor) / 10;
        out.push({
          id: budget.id,
          name: budget.name,
          period: budget.period,
          periodLabel: period.label,
          periodFrom: period.from,
          periodTo: period.to,
          amountMinor: budget.amountMinor,
          spentMinor: spent,
          remainingMinor: budget.amountMinor - spent,
          pct,
          currency: budget.currency,
          categoryName,
          sectorName,
          alertThresholdPct: budget.alertThresholdPct,
          state: budgetState(pct, budget.alertThresholdPct),
        });
      }
      return out;
    });
  }

  private async spent(tx: Tx, currency: string, from: string, to: string, categoryId: string | null, sectorId: string | null): Promise<bigint> {
    const result = await tx.execute<{ total: string }>(sql`
      select coalesce(sum(case when kind = 'refund_in' then -amount_minor else amount_minor end), 0)::text as total
      from movements
      where deleted_at is null and status = 'completed' and currency = ${currency}
        and kind in ('expense', 'investment', 'refund_in')
        and occurred_on between ${from} and ${to}
        ${categoryId ? sql`and category_id = ${categoryId}` : sql``}
        ${sectorId ? sql`and sector_id = ${sectorId}` : sql``}`);
    return BigInt(result.rows[0]?.total ?? "0");
  }

  /**
   * Registra alertas nuevas (umbral configurable y 100 %) y notifica a quienes pueden ver presupuestos.
   * Idempotente: el índice único impide alertar dos veces el mismo umbral en el mismo período.
   */
  async evaluateAlerts(ctx: TenantContext): Promise<number> {
    if (!ctx.permissions.has("budgets.view")) return 0;
    const progress = await this.progress(ctx);
    let created = 0;
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      for (const b of progress) {
        const thresholds = [b.alertThresholdPct, 100].filter((t, i, a) => b.pct >= t && a.indexOf(t) === i);
        for (const threshold of thresholds) {
          const periodKey = budgetPeriod(b.period, b.periodFrom).key;
          const inserted = await tx.insert(budgetAlerts).values({ id: uuidv7(), organizationId: ctx.organizationId, budgetId: b.id, periodKey, thresholdPct: threshold, spentMinor: b.spentMinor }).onConflictDoNothing().returning({ id: budgetAlerts.id });
          if (!inserted.length) continue;
          created += 1;
          const recipients = await tx
            .select({ userId: memberships.userId })
            .from(memberships)
            .innerJoin(roles, eq(roles.id, memberships.roleId))
            .where(and(eq(memberships.status, "active"), sql`(${roles.key} = 'owner' or 'budgets.view' = any(${roles.permissions}))`));
          if (recipients.length) {
            await tx
              .insert(notifications)
              .values(recipients.map((r) => ({ id: uuidv7(), organizationId: ctx.organizationId, userId: r.userId, type: "budget_alert", title: threshold >= 100 ? `Presupuesto «${b.name}» superado` : `Presupuesto «${b.name}» al ${threshold}%`, body: `Período ${b.periodLabel}.`, href: `/app/${ctx.organization.slug}/presupuestos`, dedupeKey: `budget:${b.id}:${periodKey}:${threshold}` })))
              .onConflictDoNothing();
          }
        }
      }
    });
    return created;
  }
}
