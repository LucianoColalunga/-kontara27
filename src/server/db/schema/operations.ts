import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { accounts, categories, movementKind, movements, sectors } from "./ledger";
import { organizations } from "./tenancy";

const orgId = () =>
  uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });

// ---------------------------------------------------------------- Presupuestos

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    name: text("name").notNull(),
    /** monthly: el importe aplica a cada mes; annual: a cada año calendario. */
    period: text("period", { enum: ["monthly", "annual"] }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id"),
    sectorId: uuid("sector_id"),
    alertThresholdPct: smallint("alert_threshold_pct").notNull().default(80),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("budgets_org_id_key").on(t.organizationId, t.id),
    foreignKey({ name: "budgets_category_fk", columns: [t.organizationId, t.categoryId], foreignColumns: [categories.organizationId, categories.id] }),
    foreignKey({ name: "budgets_sector_fk", columns: [t.organizationId, t.sectorId], foreignColumns: [sectors.organizationId, sectors.id] }),
    check("budgets_amount_positive", sql`${t.amountMinor} > 0`),
    check("budgets_threshold_range", sql`${t.alertThresholdPct} between 1 and 100`),
  ],
);

/** Una alerta por presupuesto, período y umbral: evita notificar dos veces lo mismo. */
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    budgetId: uuid("budget_id").notNull(),
    periodKey: text("period_key").notNull(),
    thresholdPct: smallint("threshold_pct").notNull(),
    spentMinor: bigint("spent_minor", { mode: "bigint" }).notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("budget_alerts_once_key").on(t.budgetId, t.periodKey, t.thresholdPct),
    foreignKey({ name: "budget_alerts_budget_fk", columns: [t.organizationId, t.budgetId], foreignColumns: [budgets.organizationId, budgets.id] }).onDelete("cascade"),
  ],
);

// ---------------------------------------------------------------- Vencimientos y recordatorios

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["rent", "utility", "tax", "supplier", "recurring_payment", "receivable", "other"] }).notNull(),
    direction: text("direction", { enum: ["payable", "receivable"] }).notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    currency: text("currency").notNull(),
    categoryId: uuid("category_id"),
    accountId: uuid("account_id"),
    recurrence: text("recurrence", { enum: ["none", "weekly", "monthly", "quarterly", "yearly"] }).notNull().default("none"),
    recurrenceUntil: date("recurrence_until", { mode: "string" }),
    notifyDaysBefore: smallint("notify_days_before").notNull().default(3),
    status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    movementId: uuid("movement_id"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reminders_org_due_idx").on(t.organizationId, t.status, t.dueOn),
    foreignKey({ name: "reminders_category_fk", columns: [t.organizationId, t.categoryId], foreignColumns: [categories.organizationId, categories.id] }),
    foreignKey({ name: "reminders_account_fk", columns: [t.organizationId, t.accountId], foreignColumns: [accounts.organizationId, accounts.id] }),
    foreignKey({ name: "reminders_movement_fk", columns: [t.organizationId, t.movementId], foreignColumns: [movements.organizationId, movements.id] }),
    check("reminders_amount_positive", sql`${t.amountMinor} is null or ${t.amountMinor} > 0`),
  ],
);

// ---------------------------------------------------------------- Documentos

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    /** Clave aleatoria en el almacenamiento: nunca deriva del nombre que mandó el usuario. */
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    purpose: text("purpose", { enum: ["attachment", "import_source", "logo"] }).notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("files_storage_key_key").on(t.storageKey), unique("files_org_id_key").on(t.organizationId, t.id)],
);

export const movementAttachments = pgTable(
  "movement_attachments",
  {
    organizationId: orgId(),
    movementId: uuid("movement_id").notNull(),
    fileId: uuid("file_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.movementId, t.fileId] }),
    foreignKey({ name: "movement_attachments_movement_fk", columns: [t.organizationId, t.movementId], foreignColumns: [movements.organizationId, movements.id] }).onDelete("cascade"),
    foreignKey({ name: "movement_attachments_file_fk", columns: [t.organizationId, t.fileId], foreignColumns: [files.organizationId, files.id] }).onDelete("cascade"),
  ],
);

// ---------------------------------------------------------------- Importaciones

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    sourceFileId: uuid("source_file_id"),
    sourceFilename: text("source_filename").notNull(),
    sourceSha256: text("source_sha256").notNull(),
    format: text("format").notNull(),
    status: text("status", { enum: ["review", "committed", "cancelled"] }).notNull().default("review"),
    currency: text("currency").notNull(),
    defaultAccountId: uuid("default_account_id"),
    /** Mapeo de etiquetas de la planilla a categorías de la organización. */
    categoryMapping: jsonb("category_mapping").$type<Record<string, string | null>>().notNull().default({}),
    /** Totales que declara la planilla (para conciliar). */
    sourceTotals: jsonb("source_totals").$type<Record<string, unknown>>().notNull(),
    workbookFindings: jsonb("workbook_findings").$type<Array<Record<string, unknown>>>().notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    committedBy: uuid("committed_by").references(() => users.id),
  },
  (t) => [
    unique("import_batches_org_id_key").on(t.organizationId, t.id),
    foreignKey({ name: "import_batches_file_fk", columns: [t.organizationId, t.sourceFileId], foreignColumns: [files.organizationId, files.id] }),
    foreignKey({ name: "import_batches_account_fk", columns: [t.organizationId, t.defaultAccountId], foreignColumns: [accounts.organizationId, accounts.id] }),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    batchId: uuid("batch_id").notNull(),
    position: integer("position").notNull(),
    sourceRef: text("source_ref").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    occurredOn: date("occurred_on", { mode: "string" }),
    kind: movementKind("kind"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }),
    categoryLabel: text("category_label"),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["ready", "needs_review", "blocked", "excluded", "imported"] }).notNull(),
    issues: jsonb("issues").$type<Array<{ code: string; severity: string; message: string }>>().notNull().default([]),
    excludeReason: text("exclude_reason"),
    movementId: uuid("movement_id"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("import_rows_batch_idx").on(t.batchId, t.position),
    foreignKey({ name: "import_rows_batch_fk", columns: [t.organizationId, t.batchId], foreignColumns: [importBatches.organizationId, importBatches.id] }).onDelete("cascade"),
    foreignKey({ name: "import_rows_movement_fk", columns: [t.organizationId, t.movementId], foreignColumns: [movements.organizationId, movements.id] }),
    check("import_rows_amount_positive", sql`${t.amountMinor} is null or ${t.amountMinor} > 0`),
  ],
);

// ---------------------------------------------------------------- Notificaciones y auditoría

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_idx").on(t.organizationId, t.userId, t.readAt), uniqueIndex("notifications_dedupe_key").on(t.userId, t.dedupeKey)],
);

/** Registro inmutable: el rol de la aplicación solo puede insertar y leer. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_org_idx").on(t.organizationId, t.createdAt), index("audit_events_actor_idx").on(t.actorUserId, t.createdAt)],
);
