import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { isMovementKind, MOVEMENT_KINDS, type MovementKind } from "@/lib/movement-kinds";
import { accounts, categories, movementRevisions, movements, movementTypes, paymentMethods, sectors, users } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import { type Database, type Tx, withTenant } from "@/server/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { authorize, can, type TenantContext, tenantScope } from "@/server/modules/tenancy";
import { movementInput, validateMovement } from "../domain/movement-rules";

export const movementFilters = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  kinds: z.array(z.enum(MOVEMENT_KINDS)).optional(),
  categoryId: z.uuid().optional(),
  accountId: z.uuid().optional(),
  sectorId: z.uuid().optional(),
  status: z.enum(["completed", "pending", "cancelled"]).optional(),
  reconciled: z.enum(["yes", "no"]).optional(),
  q: z.string().trim().max(100).optional(),
  importBatchId: z.uuid().optional(),
  deleted: z.enum(["exclude", "only"]).default("exclude"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc"),
});
export type MovementFilters = z.infer<typeof movementFilters>;

export interface MovementRow {
  id: string;
  occurredOn: string;
  kind: MovementKind;
  typeName: string;
  amountMinor: bigint;
  currency: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
  counterAccountName: string | null;
  sectorName: string | null;
  paymentMethodName: string | null;
  status: "completed" | "pending" | "cancelled";
  reconciled: boolean;
  reference: string | null;
  createdByName: string;
  deletedAt: Date | null;
  version: number;
  attachmentCount: number;
}

const counterAccounts = alias(accounts, "counter_accounts");

export class MovementService {
  constructor(private readonly db: Database) {}

  private async loadRuleContext(tx: Tx, ctx: TenantContext, input: z.infer<typeof movementInput>, allowArchived: boolean) {
    const [type] = await tx.select().from(movementTypes).where(eq(movementTypes.id, input.typeId)).limit(1);
    if (!type || (!allowArchived && type.isArchived)) throw new ValidationError("Elegí un tipo de movimiento válido.", { typeId: "Tipo inválido" });
    const [category] = input.categoryId ? await tx.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1) : [];
    const [account] = input.accountId ? await tx.select().from(accounts).where(eq(accounts.id, input.accountId)).limit(1) : [];
    const [counter] = input.counterAccountId ? await tx.select().from(accounts).where(eq(accounts.id, input.counterAccountId)).limit(1) : [];
    if (input.sectorId) {
      const [sector] = await tx.select({ id: sectors.id }).from(sectors).where(eq(sectors.id, input.sectorId)).limit(1);
      if (!sector) throw new ValidationError("El sector no existe.", { sectorId: "No existe" });
    }
    if (input.paymentMethodId) {
      const [pm] = await tx.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.id, input.paymentMethodId)).limit(1);
      if (!pm) throw new ValidationError("El medio de pago no existe.", { paymentMethodId: "No existe" });
    }
    const rules = validateMovement(input, {
      kind: type.baseKind,
      organizationCurrency: ctx.organization.currency,
      category: category ? { scope: category.scope, isArchived: category.isArchived } : null,
      account: account ? { currency: account.currency, isArchived: account.isArchived } : null,
      counterAccount: counter ? { currency: counter.currency, isArchived: counter.isArchived } : null,
      allowArchived,
    });
    return { type, ...rules };
  }

  async create(ctx: TenantContext, raw: unknown, meta: RequestMeta, options: { tx?: Tx; importBatchId?: string; importRowRef?: string } = {}): Promise<string> {
    authorize(ctx, "movements.create");
    const parsed = movementInput.safeParse(raw);
    if (!parsed.success) throw zodToValidation(parsed.error);
    const input = parsed.data;
    const id = uuidv7();
    const run = async (tx: Tx) => {
      const { type, amountMinor, currency } = await this.loadRuleContext(tx, ctx, input, false);
      await tx.insert(movements).values({
        id,
        organizationId: ctx.organizationId,
        typeId: type.id,
        kind: type.baseKind,
        occurredOn: input.occurredOn,
        amountMinor,
        currency,
        categoryId: input.categoryId,
        accountId: input.accountId,
        counterAccountId: type.baseKind === "transfer" ? input.counterAccountId : null,
        sectorId: input.sectorId,
        paymentMethodId: input.paymentMethodId,
        description: input.description,
        notes: input.notes,
        reference: input.reference,
        status: input.status,
        importBatchId: options.importBatchId ?? null,
        importRowRef: options.importRowRef ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      if (!options.importBatchId) {
        await recordAudit(tx, { action: "movement.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", entityId: id, metadata: { kind: type.baseKind, amountMinor: amountMinor.toString(), currency }, request: meta });
      }
    };
    if (options.tx) await run(options.tx);
    else await withTenant(this.db, tenantScope(ctx), run);
    return id;
  }

  /** Edición con control optimista: si otro usuario lo modificó antes, se rechaza en lugar de pisarlo. */
  async update(ctx: TenantContext, id: string, raw: unknown, expectedVersion: number, meta: RequestMeta): Promise<void> {
    authorize(ctx, "movements.update");
    const parsed = movementInput.safeParse(raw);
    if (!parsed.success) throw zodToValidation(parsed.error);
    const input = parsed.data;
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const [current] = await tx.select().from(movements).where(eq(movements.id, id)).limit(1).for("update");
      if (!current || current.deletedAt) throw new NotFoundError("El movimiento no existe o fue eliminado.");
      if (current.version !== expectedVersion) throw new ConflictError("stale_version", "Otra persona modificó este movimiento mientras lo editabas. Recargá para ver los cambios.");
      const { type, amountMinor, currency } = await this.loadRuleContext(tx, ctx, input, true);
      await tx
        .update(movements)
        .set({
          typeId: type.id,
          kind: type.baseKind,
          occurredOn: input.occurredOn,
          amountMinor,
          currency,
          categoryId: input.categoryId,
          accountId: input.accountId,
          counterAccountId: type.baseKind === "transfer" ? input.counterAccountId : null,
          sectorId: input.sectorId,
          paymentMethodId: input.paymentMethodId,
          description: input.description,
          notes: input.notes,
          reference: input.reference,
          status: input.status,
          // Un cambio de importe, fecha o cuenta invalida la conciliación anterior.
          ...(current.amountMinor !== amountMinor || current.occurredOn !== input.occurredOn || current.accountId !== input.accountId ? { reconciledAt: null, reconciledBy: null } : {}),
        })
        .where(eq(movements.id, id));
      await recordAudit(tx, { action: "movement.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", entityId: id, metadata: { fromVersion: current.version }, request: meta });
    });
  }

  async remove(ctx: TenantContext, id: string, reason: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "movements.delete");
    const cleanReason = reason.trim().slice(0, 300);
    if (cleanReason.length < 3) throw new ValidationError("Indicá el motivo de la eliminación.", { reason: "Requerido" });
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(movements).set({ deletedAt: new Date(), deletedBy: ctx.userId, deleteReason: cleanReason }).where(and(eq(movements.id, id), isNull(movements.deletedAt)));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "movement.deleted", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", entityId: id, metadata: { reason: cleanReason }, request: meta });
    });
  }

  async restore(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "movements.delete");
    await withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(movements).set({ deletedAt: null, deletedBy: null, deleteReason: null }).where(and(eq(movements.id, id), isNotNull(movements.deletedAt)));
      if (!result.rowCount) throw new NotFoundError();
      await recordAudit(tx, { action: "movement.restored", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", entityId: id, request: meta });
    });
  }

  async setReconciled(ctx: TenantContext, ids: string[], reconciled: boolean, meta: RequestMeta): Promise<number> {
    authorize(ctx, "movements.reconcile");
    const unique = [...new Set(ids)].slice(0, 500);
    if (!unique.length) return 0;
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const result = await tx
        .update(movements)
        .set(reconciled ? { reconciledAt: new Date(), reconciledBy: ctx.userId } : { reconciledAt: null, reconciledBy: null })
        .where(and(inArray(movements.id, unique), isNull(movements.deletedAt), eq(movements.status, "completed")));
      await recordAudit(tx, { action: reconciled ? "movement.reconciled" : "movement.unreconciled", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", metadata: { count: result.rowCount, ids: unique }, request: meta });
      return result.rowCount ?? 0;
    });
  }

  private where(filters: MovementFilters): SQL | undefined {
    const conditions: SQL[] = [];
    conditions.push(filters.deleted === "only" ? isNotNull(movements.deletedAt) : isNull(movements.deletedAt));
    if (filters.from) conditions.push(gte(movements.occurredOn, filters.from));
    if (filters.to) conditions.push(lte(movements.occurredOn, filters.to));
    if (filters.kinds?.length) conditions.push(inArray(movements.kind, filters.kinds));
    if (filters.categoryId) conditions.push(eq(movements.categoryId, filters.categoryId));
    if (filters.accountId) conditions.push(or(eq(movements.accountId, filters.accountId), eq(movements.counterAccountId, filters.accountId))!);
    if (filters.sectorId) conditions.push(eq(movements.sectorId, filters.sectorId));
    if (filters.status) conditions.push(eq(movements.status, filters.status));
    if (filters.reconciled === "yes") conditions.push(isNotNull(movements.reconciledAt));
    if (filters.reconciled === "no") conditions.push(isNull(movements.reconciledAt));
    if (filters.importBatchId) conditions.push(eq(movements.importBatchId, filters.importBatchId));
    if (filters.q) {
      // Escapa comodines de LIKE: buscar «50%» no debe convertirse en un patrón.
      const pattern = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(or(ilike(movements.description, pattern), ilike(movements.notes, pattern), ilike(movements.reference, pattern))!);
    }
    return and(...conditions);
  }

  async list(ctx: TenantContext, rawFilters: unknown): Promise<{ rows: MovementRow[]; total: number; page: number; pageSize: number; filters: MovementFilters }> {
    authorize(ctx, "movements.view");
    const filters = movementFilters.parse(rawFilters ?? {});
    if (filters.deleted === "only") authorize(ctx, "movements.delete");
    const orderBy = {
      date_desc: [desc(movements.occurredOn), desc(movements.createdAt)],
      date_asc: [asc(movements.occurredOn), asc(movements.createdAt)],
      amount_desc: [desc(movements.amountMinor)],
      amount_asc: [asc(movements.amountMinor)],
    }[filters.sort];
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const where = this.where(filters);
      const rows = await tx
        .select({
          id: movements.id,
          occurredOn: movements.occurredOn,
          kind: movements.kind,
          typeName: movementTypes.name,
          amountMinor: movements.amountMinor,
          currency: movements.currency,
          description: movements.description,
          categoryId: movements.categoryId,
          categoryName: categories.name,
          categoryColor: categories.color,
          accountName: accounts.name,
          counterAccountName: counterAccounts.name,
          sectorName: sectors.name,
          paymentMethodName: paymentMethods.name,
          status: movements.status,
          reconciledAt: movements.reconciledAt,
          reference: movements.reference,
          createdByName: users.name,
          deletedAt: movements.deletedAt,
          version: movements.version,
          attachmentCount: sql<number>`(select count(*)::int from movement_attachments ma where ma.movement_id = ${movements.id})`,
        })
        .from(movements)
        .innerJoin(movementTypes, eq(movementTypes.id, movements.typeId))
        .innerJoin(users, eq(users.id, movements.createdBy))
        .leftJoin(categories, eq(categories.id, movements.categoryId))
        .leftJoin(accounts, eq(accounts.id, movements.accountId))
        .leftJoin(counterAccounts, eq(counterAccounts.id, movements.counterAccountId))
        .leftJoin(sectors, eq(sectors.id, movements.sectorId))
        .leftJoin(paymentMethods, eq(paymentMethods.id, movements.paymentMethodId))
        .where(where)
        .orderBy(...orderBy)
        .limit(filters.pageSize)
        .offset((filters.page - 1) * filters.pageSize);
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(movements).where(where);
      return {
        rows: rows.map(({ reconciledAt, ...r }) => ({ ...r, reconciled: Boolean(reconciledAt) })),
        total: count?.n ?? 0,
        page: filters.page,
        pageSize: filters.pageSize,
        filters,
      };
    });
  }

  /** Todos los movimientos que cumplen un filtro, para exportar (con tope de seguridad). */
  async listAll(ctx: TenantContext, rawFilters: unknown, max = 50_000): Promise<MovementRow[]> {
    const filters = movementFilters.parse({ ...(rawFilters as object), page: 1, pageSize: 200 });
    const out: MovementRow[] = [];
    for (let page = 1; out.length < max; page++) {
      const chunk = await this.list(ctx, { ...filters, page, pageSize: 200 });
      out.push(...chunk.rows);
      if (chunk.rows.length < 200) break;
    }
    return out.slice(0, max);
  }

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "movements.view");
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const [movement] = await tx.select().from(movements).where(eq(movements.id, id)).limit(1);
      if (!movement || (movement.deletedAt && !can(ctx, "movements.delete"))) throw new NotFoundError();
      return movement;
    });
  }

  async history(ctx: TenantContext, id: string) {
    authorize(ctx, "movements.view");
    return withTenant(this.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: movementRevisions.id, revision: movementRevisions.revision, operation: movementRevisions.operation, changedAt: movementRevisions.changedAt, changedByName: users.name, snapshot: movementRevisions.snapshot })
        .from(movementRevisions)
        .leftJoin(users, eq(users.id, movementRevisions.changedBy))
        .where(eq(movementRevisions.movementId, id))
        .orderBy(desc(movementRevisions.revision)),
    );
  }
}

export function zodToValidation(error: z.ZodError): ValidationError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
  return new ValidationError(Object.values(fieldErrors)[0] ?? "Revisá los datos.", fieldErrors);
}

export function parseKinds(values: string[] | undefined): MovementKind[] | undefined {
  const kinds = (values ?? []).filter(isMovementKind);
  return kinds.length ? kinds : undefined;
}
