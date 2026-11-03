import "server-only";
import { and, asc, between, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { categories, reminders } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { type Database, withTenant } from "@/server/platform/db";
import { NotFoundError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";
import type { MovementService } from "@/server/modules/ledger";

const reminderInput = z.object({
  title: z.string().trim().min(2, "Ingresá un título.").max(120),
  kind: z.enum(["rent", "utility", "tax", "supplier", "recurring_payment", "receivable", "other"]),
  dueOn: z.iso.date({ error: "Ingresá la fecha de vencimiento." }),
  amount: z.string().trim().max(32).optional().transform((v) => v || null),
  currency: z.string().regex(/^[A-Z]{3}$/),
  categoryId: z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  accountId: z.union([z.uuid(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  recurrence: z.enum(["none", "weekly", "monthly", "quarterly", "yearly"]).default("none"),
  recurrenceUntil: z.union([z.iso.date(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  notifyDaysBefore: z.coerce.number().int().min(0).max(60).default(3),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
});

export const REMINDER_KIND_LABELS = {
  rent: "Alquiler",
  utility: "Servicio",
  tax: "Impuesto",
  supplier: "Proveedor",
  recurring_payment: "Pago recurrente",
  receivable: "Cobro pendiente",
  other: "Otro",
} as const;

/** Próxima fecha de una serie recurrente. Los meses cortos usan su último día (31/01 → 28/02). */
export function nextOccurrence(date: string, recurrence: "weekly" | "monthly" | "quarterly" | "yearly"): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (recurrence === "weekly") return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
  const add = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
  const targetMonth = m - 1 + add;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export class ReminderService {
  constructor(
    private readonly db: Database,
    private readonly movements: MovementService,
    private readonly clock: Clock,
  ) {}

  private parse(raw: unknown) {
    const parsed = reminderInput.safeParse(raw);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Revisá los datos.");
    const data = parsed.data;
    let amountMinor: bigint | null = null;
    if (data.amount) {
      try {
        amountMinor = parseMoney(data.amount, data.currency);
      } catch (error) {
        throw new ValidationError((error as Error).message, { amount: (error as Error).message });
      }
      if (amountMinor <= 0n) throw new ValidationError("El importe tiene que ser mayor a cero.", { amount: "Mayor a cero" });
    }
    return { ...data, amountMinor, direction: data.kind === "receivable" ? ("receivable" as const) : ("payable" as const) };
  }

  async create(ctx: TenantContext, raw: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "reminders.manage");
    const data = this.parse(raw);
    const id = uuidv7();
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      await tx.insert(reminders).values({ id, organizationId: ctx.organizationId, title: data.title, kind: data.kind, direction: data.direction, dueOn: data.dueOn, amountMinor: data.amountMinor, currency: data.currency, categoryId: data.categoryId, accountId: data.accountId, recurrence: data.recurrence, recurrenceUntil: data.recurrenceUntil, notifyDaysBefore: data.notifyDaysBefore, notes: data.notes, createdBy: ctx.userId });
      await recordAudit(tx, { action: "reminder.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "reminder", entityId: id, request: meta });
    });
    return id;
  }

  async update(ctx: TenantContext, id: string, raw: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "reminders.manage");
    const data = this.parse(raw);
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(reminders).set({ title: data.title, kind: data.kind, direction: data.direction, dueOn: data.dueOn, amountMinor: data.amountMinor, currency: data.currency, categoryId: data.categoryId, accountId: data.accountId, recurrence: data.recurrence, recurrenceUntil: data.recurrenceUntil, notifyDaysBefore: data.notifyDaysBefore, notes: data.notes, updatedAt: this.clock.now() }).where(eq(reminders.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "reminder.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "reminder", entityId: id, request: meta });
    });
  }

  async list(ctx: TenantContext, range: { from: string; to: string }, status: "open" | "all" = "open") {
    authorize(ctx, "reminders.view");
    return withTenant(this.db, tenantScope(ctx), (tx) =>
      tx
        .select({ reminder: reminders, categoryName: categories.name })
        .from(reminders)
        .leftJoin(categories, eq(categories.id, reminders.categoryId))
        .where(and(between(reminders.dueOn, range.from, range.to), status === "open" ? eq(reminders.status, "open") : undefined))
        .orderBy(asc(reminders.dueOn)),
    );
  }

  /** Vencidos y próximos (hasta `days` días), para el panel. */
  async upcoming(ctx: TenantContext, days = 14) {
    if (!ctx.permissions.has("reminders.view")) return [];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.organization.timezone }).format(this.clock.now());
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    return withTenant(this.db, tenantScope(ctx), (tx) =>
      tx.select().from(reminders).where(and(eq(reminders.status, "open"), sql`${reminders.dueOn} <= ${until}`)).orderBy(asc(reminders.dueOn)).limit(20),
    ).then((rows) => rows.map((r) => ({ ...r, overdue: r.dueOn < today })));
  }

  /**
   * Marca un vencimiento como resuelto. Si se pide, registra el movimiento en la misma transacción;
   * si es recurrente, crea la próxima ocurrencia.
   */
  async complete(ctx: TenantContext, id: string, movement: unknown | null, meta: RequestMeta): Promise<{ movementId: string | null; nextId: string | null }> {
    authorize(ctx, "reminders.manage");
    if (movement) authorize(ctx, "movements.create");
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const [reminder] = await tx.select().from(reminders).where(eq(reminders.id, id)).limit(1).for("update");
      if (!reminder || reminder.status !== "open") throw new NotFoundError("El vencimiento no existe o ya se resolvió.");
      const movementId = movement ? await this.movements.create(ctx, movement, meta, { tx }) : null;
      await tx.update(reminders).set({ status: "done", completedAt: this.clock.now(), completedBy: ctx.userId, movementId, updatedAt: this.clock.now() }).where(eq(reminders.id, id));
      let nextId: string | null = null;
      if (reminder.recurrence !== "none") {
        const nextDue = nextOccurrence(reminder.dueOn, reminder.recurrence);
        if (!reminder.recurrenceUntil || nextDue <= reminder.recurrenceUntil) {
          nextId = uuidv7();
          const { id: _old, completedAt: _c, completedBy: _cb, movementId: _m, createdAt: _ca, updatedAt: _u, status: _s, ...rest } = reminder;
          await tx.insert(reminders).values({ ...rest, id: nextId, dueOn: nextDue, status: "open", createdBy: ctx.userId });
        }
      }
      await recordAudit(tx, { action: "reminder.completed", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "reminder", entityId: id, metadata: { movementId, nextId }, request: meta });
      return { movementId, nextId };
    });
  }

  async dismiss(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "reminders.manage");
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(reminders).set({ status: "dismissed", updatedAt: this.clock.now() }).where(and(eq(reminders.id, id), eq(reminders.status, "open")));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "reminder.dismissed", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "reminder", entityId: id, request: meta });
    });
  }
}
