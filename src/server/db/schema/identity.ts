import { bigint, boolean, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Usuarios de la plataforma. Globales: una persona puede pertenecer a varias organizaciones. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    locale: text("locale").notNull().default("es-AR"),
    /** País de residencia declarado por el usuario (no se deduce de la IP). */
    residenceCountry: text("residence_country"),
    failedLoginCount: smallint("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_normalized_key").on(t.emailNormalized)],
);

/** Sesiones opacas: `id` es el SHA-256 del token que viaja en la cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** false mientras falta el segundo factor. */
    mfaSatisfied: boolean("mfa_satisfied").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    /** Última vez que el usuario volvió a ingresar la contraseña (acciones sensibles). */
    reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Tokens de un solo uso (verificación de correo, recuperación). Se guarda solo el hash. */
export const userTokens = pgTable(
  "user_tokens",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["email_verification", "password_reset"] }).notNull(),
    /** Correo al que se envió (si el usuario cambia su correo, los tokens viejos dejan de servir). */
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_tokens_user_purpose_idx").on(t.userId, t.purpose)],
);

/** Segundo factor TOTP. El secreto se guarda cifrado con AES-256-GCM. */
export const userTotp = pgTable("user_totp", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEncrypted: text("secret_encrypted").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  /** Último paso de 30 s aceptado: impide reutilizar el mismo código. */
  lastUsedStep: bigint("last_used_step", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRecoveryCodes = pgTable(
  "user_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_recovery_codes_user_idx").on(t.userId)],
);

export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  grantedBy: uuid("granted_by"),
});

/** Límite de intentos en ventana fija. La clave ya viene hasheada (no guarda IPs ni correos en claro). */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("rate_limit_buckets_pk").on(t.key, t.windowStart), index("rate_limit_buckets_window_idx").on(t.windowStart)],
);

export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Identificador aleatorio de la cookie de consentimiento para visitantes sin cuenta. */
    subjectId: text("subject_id").notNull(),
    policyVersion: text("policy_version").notNull(),
    necessary: boolean("necessary").notNull().default(true),
    analytics: boolean("analytics").notNull(),
    marketing: boolean("marketing").notNull(),
    jurisdiction: text("jurisdiction").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_records_subject_idx").on(t.subjectId)],
);

export const dataRequests = pgTable(
  "data_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type", { enum: ["access", "rectification", "erasure", "portability", "objection"] }).notNull(),
    status: text("status", { enum: ["received", "in_progress", "completed", "rejected"] }).notNull().default("received"),
    details: text("details"),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("data_requests_user_idx").on(t.userId)],
);
