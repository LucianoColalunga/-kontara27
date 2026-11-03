import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { organizations } from "./tenancy";

/** Naturalezas base (ADR 0004). Los tipos personalizados de cada organización heredan una de estas. */
export const movementKind = pgEnum("movement_kind", [
  "income",
  "expense",
  "refund_in",
  "refund_out",
  "adjustment_in",
  "adjustment_out",
  "transfer",
  "investment",
  "contribution",
  "withdrawal",
]);

export const movementStatus = pgEnum("movement_status", ["completed", "pending", "cancelled"]);
export const categoryScope = pgEnum("category_scope", ["income", "expense", "both"]);
export const accountType = pgEnum("account_type", ["cash", "bank", "wallet", "credit_card", "investment", "other"]);

const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

/**
 * Las referencias entre tablas de una organización usan claves foráneas compuestas
 * (organization_id, id): la base rechaza que un movimiento apunte a una categoría o cuenta
 * de otra organización aunque alguien conozca su UUID. Las FK simples no pasan por RLS.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    currency: text("currency").notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" }).notNull().default(sql`0`),
    institution: text("institution"),
    /** Solo los últimos dígitos: nunca se guarda el número completo de cuenta o tarjeta. */
    numberLast4: text("number_last4"),
    color: text("color"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("accounts_org_id_key").on(t.organizationId, t.id),
    uniqueIndex("accounts_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
    check("accounts_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    scope: categoryScope("scope").notNull().default("both"),
    color: text("color"),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("categories_org_id_key").on(t.organizationId, t.id),
    uniqueIndex("categories_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
    foreignKey({ name: "categories_parent_fk", columns: [t.organizationId, t.parentId], foreignColumns: [t.organizationId, t.id] }),
  ],
);

/** Sectores o centros de costo (para presupuestos y reportes por área). */
export const sectors = pgTable(
  "sectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("sectors_org_id_key").on(t.organizationId, t.id), uniqueIndex("sectors_org_name_key").on(t.organizationId, sql`lower(${t.name})`)],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("payment_methods_org_id_key").on(t.organizationId, t.id),
    uniqueIndex("payment_methods_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
  ],
);

export const movementTypes = pgTable(
  "movement_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    baseKind: movementKind("base_kind").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("movement_types_org_id_key").on(t.organizationId, t.id),
    uniqueIndex("movement_types_org_name_key").on(t.organizationId, sql`lower(${t.name})`),
  ],
);

export const movements = pgTable(
  "movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    typeId: uuid("type_id").notNull(),
    /** Copia de la naturaleza del tipo: los reportes agregan por este campo. */
    kind: movementKind("kind").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id"),
    accountId: uuid("account_id"),
    counterAccountId: uuid("counter_account_id"),
    sectorId: uuid("sector_id"),
    paymentMethodId: uuid("payment_method_id"),
    description: text("description").notNull().default(""),
    notes: text("notes"),
    reference: text("reference"),
    status: movementStatus("status").notNull().default("completed"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by").references(() => users.id),
    importBatchId: uuid("import_batch_id"),
    importRowRef: text("import_row_ref"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    deleteReason: text("delete_reason"),
  },
  (t) => [
    unique("movements_org_id_key").on(t.organizationId, t.id),
    index("movements_org_date_idx").on(t.organizationId, t.occurredOn),
    index("movements_org_kind_date_idx").on(t.organizationId, t.kind, t.occurredOn),
    index("movements_org_category_idx").on(t.organizationId, t.categoryId),
    index("movements_org_account_idx").on(t.organizationId, t.accountId),
    index("movements_org_counter_account_idx").on(t.organizationId, t.counterAccountId),
    index("movements_org_import_idx").on(t.organizationId, t.importBatchId),
    foreignKey({ name: "movements_type_fk", columns: [t.organizationId, t.typeId], foreignColumns: [movementTypes.organizationId, movementTypes.id] }),
    foreignKey({ name: "movements_category_fk", columns: [t.organizationId, t.categoryId], foreignColumns: [categories.organizationId, categories.id] }),
    foreignKey({ name: "movements_account_fk", columns: [t.organizationId, t.accountId], foreignColumns: [accounts.organizationId, accounts.id] }),
    foreignKey({ name: "movements_counter_account_fk", columns: [t.organizationId, t.counterAccountId], foreignColumns: [accounts.organizationId, accounts.id] }),
    foreignKey({ name: "movements_sector_fk", columns: [t.organizationId, t.sectorId], foreignColumns: [sectors.organizationId, sectors.id] }),
    foreignKey({ name: "movements_payment_method_fk", columns: [t.organizationId, t.paymentMethodId], foreignColumns: [paymentMethods.organizationId, paymentMethods.id] }),
    check("movements_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "movements_transfer_accounts",
      sql`(${t.kind} = 'transfer' and ${t.accountId} is not null and ${t.counterAccountId} is not null and ${t.accountId} <> ${t.counterAccountId})
          or (${t.kind} <> 'transfer' and ${t.counterAccountId} is null)`,
    ),
    check("movements_currency_format", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("movements_delete_reason", sql`${t.deletedAt} is null or ${t.deleteReason} is not null`),
  ],
);

/** Versiones anteriores de cada movimiento. Solo la escribe un trigger de la base (ver migración de seguridad). */
export const movementRevisions = pgTable(
  "movement_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    movementId: uuid("movement_id").notNull(),
    revision: integer("revision").notNull(),
    operation: text("operation", { enum: ["update", "delete", "restore"] }).notNull(),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("movement_revisions_movement_idx").on(t.organizationId, t.movementId)],
);
