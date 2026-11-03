import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { parseMoney } from "@/lib/money";
import { accounts, categories, movements, movementTypes, paymentMethods, sectors } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import { type Database, withTenant } from "@/server/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";

const name = z.string().trim().min(1, "Ingresá un nombre.").max(80);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullish()
  .transform((v) => v ?? null);

const categoryInput = z.object({ name, scope: z.enum(["income", "expense", "both"]), color });
const accountInput = z.object({
  name,
  type: z.enum(["cash", "bank", "wallet", "credit_card", "investment", "other"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  openingBalance: z.string().trim().max(32).default("0"),
  institution: z.string().trim().max(80).nullish().transform((v) => v || null),
  numberLast4: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "Solo los últimos 4 dígitos.")
    .nullish()
    .transform((v) => v || null),
  color,
});

function isUniqueViolation(error: unknown) {
  const cause = (error as { cause?: { code?: string } })?.cause ?? (error as { code?: string });
  return cause?.code === "23505";
}

export class CatalogService {
  constructor(private readonly db: Database) {}

  private tx<T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[2]) {
    return withTenant(this.db, tenantScope(ctx), fn);
  }

  // ---------------------------------------------------------------- Categorías

  listCategories(ctx: TenantContext, options: { includeArchived?: boolean } = {}) {
    authorize(ctx, "movements.view");
    return this.tx(ctx, (tx) =>
      tx
        .select({
          id: categories.id,
          name: categories.name,
          scope: categories.scope,
          color: categories.color,
          isArchived: categories.isArchived,
          movementCount: sql<number>`(select count(*)::int from movements m where m.category_id = ${categories.id} and m.deleted_at is null)`,
        })
        .from(categories)
        .where(options.includeArchived ? undefined : eq(categories.isArchived, false))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
    );
  }

  async createCategory(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "catalog.manage");
    const data = categoryInput.parse(input);
    const id = uuidv7();
    try {
      await this.tx(ctx, async (tx) => {
        await tx.insert(categories).values({ id, organizationId: ctx.organizationId, ...data, sortOrder: 1000 });
        await recordAudit(tx, { action: "category.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "category", entityId: id, metadata: { name: data.name }, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe una categoría con ese nombre.");
      throw error;
    }
    return id;
  }

  async updateCategory(ctx: TenantContext, id: string, input: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "catalog.manage");
    const data = categoryInput.parse(input);
    try {
      await this.tx(ctx, async (tx) => {
        const result = await tx.update(categories).set({ ...data, updatedAt: new Date() }).where(eq(categories.id, id));
        if (!result.rowCount) throw new NotFoundError();
        await recordAudit(tx, { action: "category.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "category", entityId: id, metadata: data, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe una categoría con ese nombre.");
      throw error;
    }
  }

  async setCategoryArchived(ctx: TenantContext, id: string, archived: boolean, meta: RequestMeta): Promise<void> {
    authorize(ctx, "catalog.manage");
    await this.tx(ctx, async (tx) => {
      const result = await tx.update(categories).set({ isArchived: archived, updatedAt: new Date() }).where(eq(categories.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: archived ? "category.archived" : "category.unarchived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "category", entityId: id, request: meta });
    });
  }

  /**
   * Elimina una categoría. Si tiene movimientos, exige un destino: los movimientos se reasignan
   * (queda registrado en el historial de cada uno) y después se elimina.
   */
  async deleteCategory(ctx: TenantContext, id: string, reassignTo: string | null, meta: RequestMeta): Promise<{ reassigned: number }> {
    authorize(ctx, "catalog.manage", "movements.update");
    return this.tx(ctx, async (tx) => {
      const [category] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1);
      if (!category) throw new NotFoundError();
      const usage = await tx.execute<{ n: number }>(sql`select count(*)::int as n from movements where category_id = ${id}`);
      const count = usage.rows[0]?.n ?? 0;
      let reassigned = 0;
      if (count > 0) {
        if (!reassignTo || reassignTo === id) throw new ValidationError("La categoría tiene movimientos: elegí a qué categoría pasarlos.", { reassignTo: "Requerido" });
        const [target] = await tx.select().from(categories).where(eq(categories.id, reassignTo)).limit(1);
        if (!target) throw new ValidationError("La categoría de destino no existe.", { reassignTo: "No existe" });
        if (target.scope !== "both") {
          // Un gasto no puede quedar en una categoría solo de ingresos (y viceversa).
          const incompatible = target.scope === "income" ? sql`('expense','refund_in','investment')` : sql`('income','refund_out')`;
          const clash = await tx.execute<{ n: number }>(sql`select count(*)::int as n from movements where category_id = ${id} and kind in ${incompatible}`);
          if ((clash.rows[0]?.n ?? 0) > 0) {
            throw new ValidationError(`La categoría de destino es solo de ${target.scope === "income" ? "ingresos" : "gastos"} y hay movimientos que no corresponden. Elegí una categoría de alcance «ambos».`, { reassignTo: "Alcance incompatible" });
          }
        }
        const result = await tx.update(movements).set({ categoryId: reassignTo }).where(eq(movements.categoryId, id));
        reassigned = result.rowCount ?? 0;
        await tx.execute(sql`update budgets set category_id = ${reassignTo} where category_id = ${id}`);
        await tx.execute(sql`update reminders set category_id = ${reassignTo} where category_id = ${id}`);
      }
      await tx.execute(sql`update budgets set category_id = null where category_id = ${id}`);
      await tx.execute(sql`update reminders set category_id = null where category_id = ${id}`);
      await tx.delete(categories).where(eq(categories.id, id));
      await recordAudit(tx, { action: "category.deleted", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "category", entityId: id, metadata: { name: category.name, reassignTo, reassigned }, request: meta });
      return { reassigned };
    });
  }

  // ---------------------------------------------------------------- Cuentas y cajas

  /** Saldo = saldo inicial + movimientos realizados (las transferencias suman en destino y restan en origen). */
  listAccounts(ctx: TenantContext, options: { includeArchived?: boolean } = {}) {
    authorize(ctx, "accounts.view");
    return this.tx(ctx, async (tx) => {
      const result = await tx.execute<{
        id: string; name: string; type: string; currency: string; institution: string | null; number_last4: string | null;
        color: string | null; is_archived: boolean; opening_balance_minor: string; balance_minor: string; movement_count: number; unreconciled: number;
      }>(sql`
        select a.id, a.name, a.type, a.currency, a.institution, a.number_last4, a.color, a.is_archived, a.opening_balance_minor,
               a.opening_balance_minor + coalesce(sum(
                 case
                   when m.id is null then 0
                   when m.counter_account_id = a.id then m.amount_minor
                   when m.kind in ('income', 'refund_in', 'adjustment_in', 'contribution') then m.amount_minor
                   else -m.amount_minor
                 end), 0) as balance_minor,
               count(m.id)::int as movement_count,
               count(m.id) filter (where m.reconciled_at is null)::int as unreconciled
        from accounts a
        left join movements m on (m.account_id = a.id or m.counter_account_id = a.id)
                              and m.deleted_at is null and m.status = 'completed'
        ${options.includeArchived ? sql`` : sql`where a.is_archived = false`}
        group by a.id
        order by a.is_archived, a.name`);
      return result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        currency: r.currency,
        institution: r.institution,
        numberLast4: r.number_last4,
        color: r.color,
        isArchived: r.is_archived,
        openingBalanceMinor: BigInt(r.opening_balance_minor),
        balanceMinor: BigInt(r.balance_minor),
        movementCount: r.movement_count,
        unreconciled: r.unreconciled,
      }));
    });
  }

  async createAccount(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "accounts.manage");
    const data = accountInput.parse(input);
    const id = uuidv7();
    let opening: bigint;
    try {
      opening = parseMoney(data.openingBalance || "0", data.currency);
    } catch (error) {
      throw new ValidationError((error as Error).message, { openingBalance: (error as Error).message });
    }
    try {
      await this.tx(ctx, async (tx) => {
        await tx.insert(accounts).values({ id, organizationId: ctx.organizationId, name: data.name, type: data.type, currency: data.currency, openingBalanceMinor: opening, institution: data.institution, numberLast4: data.numberLast4, color: data.color, createdBy: ctx.userId });
        await recordAudit(tx, { action: "account.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "account", entityId: id, metadata: { name: data.name, type: data.type, currency: data.currency }, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe una cuenta con ese nombre.");
      throw error;
    }
    return id;
  }

  async updateAccount(ctx: TenantContext, id: string, input: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "accounts.manage");
    const data = accountInput.parse(input);
    await this.tx(ctx, async (tx) => {
      const [current] = await tx.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      if (!current) throw new NotFoundError();
      if (current.currency !== data.currency) {
        const used = await tx.execute<{ n: number }>(sql`select count(*)::int as n from movements where account_id = ${id} or counter_account_id = ${id}`);
        if ((used.rows[0]?.n ?? 0) > 0) throw new ConflictError("currency_locked", "La cuenta ya tiene movimientos: no se puede cambiar su moneda.");
      }
      const opening = parseMoney(data.openingBalance || "0", data.currency);
      await tx.update(accounts).set({ name: data.name, type: data.type, currency: data.currency, openingBalanceMinor: opening, institution: data.institution, numberLast4: data.numberLast4, color: data.color, updatedAt: new Date() }).where(eq(accounts.id, id));
      await recordAudit(tx, { action: "account.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "account", entityId: id, metadata: { name: data.name, openingBalanceMinor: opening.toString() }, request: meta });
    });
  }

  async setAccountArchived(ctx: TenantContext, id: string, archived: boolean, meta: RequestMeta): Promise<void> {
    authorize(ctx, "accounts.manage");
    await this.tx(ctx, async (tx) => {
      const result = await tx.update(accounts).set({ isArchived: archived, updatedAt: new Date() }).where(eq(accounts.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: archived ? "account.archived" : "account.unarchived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "account", entityId: id, request: meta });
    });
  }

  // ---------------------------------------------------------------- Tipos, sectores y medios de pago

  listMovementTypes(ctx: TenantContext) {
    return this.tx(ctx, (tx) => tx.select().from(movementTypes).where(eq(movementTypes.isArchived, false)).orderBy(asc(movementTypes.sortOrder), asc(movementTypes.name)));
  }

  async createMovementType(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "catalog.manage");
    const data = z.object({ name, baseKind: z.enum(MOVEMENT_KINDS) }).parse(input);
    const id = uuidv7();
    try {
      await this.tx(ctx, async (tx) => {
        await tx.insert(movementTypes).values({ id, organizationId: ctx.organizationId, name: data.name, baseKind: data.baseKind, sortOrder: 100 });
        await recordAudit(tx, { action: "movement_type.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement_type", entityId: id, metadata: data, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe un tipo con ese nombre.");
      throw error;
    }
    return id;
  }

  async archiveMovementType(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "catalog.manage");
    await this.tx(ctx, async (tx) => {
      const [type] = await tx.select().from(movementTypes).where(eq(movementTypes.id, id)).limit(1);
      if (!type) throw new NotFoundError();
      if (type.isSystem) throw new ConflictError("system_type", "Los tipos base no se archivan.");
      await tx.update(movementTypes).set({ isArchived: true }).where(eq(movementTypes.id, id));
      await recordAudit(tx, { action: "movement_type.archived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement_type", entityId: id, request: meta });
    });
  }

  listSectors(ctx: TenantContext) {
    return this.tx(ctx, (tx) => tx.select().from(sectors).where(eq(sectors.isArchived, false)).orderBy(asc(sectors.name)));
  }

  async createSector(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "catalog.manage");
    const data = z.object({ name }).parse(input);
    const id = uuidv7();
    try {
      await this.tx(ctx, async (tx) => {
        await tx.insert(sectors).values({ id, organizationId: ctx.organizationId, name: data.name });
        await recordAudit(tx, { action: "sector.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "sector", entityId: id, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe un sector con ese nombre.");
      throw error;
    }
    return id;
  }

  async archiveSector(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "catalog.manage");
    await this.tx(ctx, async (tx) => {
      const result = await tx.update(sectors).set({ isArchived: true }).where(eq(sectors.id, id));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "sector.archived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "sector", entityId: id, request: meta });
    });
  }

  listPaymentMethods(ctx: TenantContext) {
    return this.tx(ctx, (tx) => tx.select().from(paymentMethods).where(eq(paymentMethods.isArchived, false)).orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name)));
  }

  async createPaymentMethod(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "catalog.manage");
    const data = z.object({ name }).parse(input);
    const id = uuidv7();
    try {
      await this.tx(ctx, async (tx) => {
        await tx.insert(paymentMethods).values({ id, organizationId: ctx.organizationId, name: data.name, sortOrder: 100 });
        await recordAudit(tx, { action: "payment_method.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "payment_method", entityId: id, request: meta });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictError("duplicate_name", "Ya existe un medio de pago con ese nombre.");
      throw error;
    }
    return id;
  }

  async archivePaymentMethod(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "catalog.manage");
    await this.tx(ctx, async (tx) => {
      const result = await tx.update(paymentMethods).set({ isArchived: true }).where(and(eq(paymentMethods.id, id)));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "payment_method.archived", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "payment_method", entityId: id, request: meta });
    });
  }
}
