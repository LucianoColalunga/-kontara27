import { boolean, foreignKey, index, jsonb, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export interface OrganizationAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Nombre comercial. */
    name: text("name").notNull(),
    /** Razón social (opcional). */
    legalName: text("legal_name"),
    /** Tipo de identificación fiscal configurable: CUIT, RUT, RFC, NIF, EIN, VAT… */
    taxIdType: text("tax_id_type"),
    /** Identificación fiscal cifrada (puede contener datos personales en monotributistas). */
    taxIdEncrypted: text("tax_id_encrypted"),
    taxIdLast4: text("tax_id_last4"),
    address: jsonb("address").$type<OrganizationAddress>(),
    country: text("country").notNull(),
    currency: text("currency").notNull(),
    timezone: text("timezone").notNull(),
    locale: text("locale").notNull().default("es-AR"),
    fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(1),
    logoFileId: uuid("logo_file_id"),
    plan: text("plan").notNull().default("free"),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organizations_slug_key").on(t.slug)],
);

/** Roles por organización. Los de sistema se crean al dar de alta la organización; sus permisos son editables (salvo «owner»). */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions").array().notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roles_org_key").on(t.organizationId, t.key), unique("roles_org_id_key").on(t.organizationId, t.id)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    invitedBy: uuid("invited_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_key").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
    foreignKey({ name: "memberships_role_fk", columns: [t.organizationId, t.roleId], foreignColumns: [roles.organizationId, roles.id] }),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    emailNormalized: text("email_normalized").notNull(),
    roleId: uuid("role_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_key").on(t.tokenHash),
    index("invitations_org_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.emailNormalized),
    foreignKey({ name: "invitations_role_fk", columns: [t.organizationId, t.roleId], foreignColumns: [roles.organizationId, roles.id] }),
  ],
);
