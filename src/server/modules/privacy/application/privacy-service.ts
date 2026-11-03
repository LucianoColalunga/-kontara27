import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auditEvents, consentRecords, dataRequests, memberships, organizations, roles, sessions, userRecoveryCodes, users, userTotp } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { randomToken } from "@/server/platform/crypto";
import { type Database, withUser } from "@/server/platform/db";
import { ConflictError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";

export const COOKIE_POLICY_VERSION = "2026-11-03";

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

/**
 * Jurisdicción para privacidad: país de residencia declarado por el usuario o, si no hay, el país de la
 * organización. Nunca la IP (una IP no prueba residencia). Sin datos se aplica el criterio más estricto (RGPD).
 */
export function resolveJurisdiction(residenceCountry: string | null | undefined, organizationCountry?: string | null): "AR" | "EU" | "OTHER_STRICT" {
  const EU_EEA = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO"]);
  const country = residenceCountry ?? organizationCountry ?? null;
  if (country === "AR") return "AR";
  if (country && EU_EEA.has(country)) return "EU";
  return "OTHER_STRICT";
}

export class PrivacyService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** Registro probatorio del consentimiento (RGPD art. 7.1). La cookie guarda la elección; esto, la prueba. */
  async recordConsent(subjectId: string, userId: string | null, choice: ConsentChoice, jurisdiction: string, userAgent: string | null): Promise<void> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(subjectId)) throw new ValidationError("Identificador de consentimiento inválido.");
    await this.db.insert(consentRecords).values({ id: uuidv7(), subjectId, userId, policyVersion: COOKIE_POLICY_VERSION, necessary: true, analytics: choice.analytics, marketing: choice.marketing, jurisdiction, userAgent: userAgent?.slice(0, 300) ?? null });
  }

  /** Derecho de acceso y portabilidad: datos personales del titular en un JSON legible por máquina. */
  async exportUserData(userId: string) {
    const [profile] = await this.db.select({ id: users.id, email: users.email, name: users.name, locale: users.locale, residenceCountry: users.residenceCountry, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.id, userId));
    const orgs = await withUser(this.db, userId, (tx) =>
      tx.select({ organization: organizations.name, role: roles.name, status: memberships.status, since: memberships.createdAt }).from(memberships).innerJoin(organizations, eq(organizations.id, memberships.organizationId)).innerJoin(roles, eq(roles.id, memberships.roleId)).where(eq(memberships.userId, userId)),
    );
    const sessionList = await this.db.select({ createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent, revokedAt: sessions.revokedAt }).from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(200);
    const consents = await this.db.select().from(consentRecords).where(eq(consentRecords.userId, userId));
    const requests = await this.db.select().from(dataRequests).where(eq(dataRequests.userId, userId));
    const security = await withUser(this.db, userId, (tx) => tx.select({ action: auditEvents.action, at: auditEvents.createdAt, ip: auditEvents.ip }).from(auditEvents).where(and(isNull(auditEvents.organizationId), eq(auditEvents.actorUserId, userId))).orderBy(desc(auditEvents.createdAt)).limit(500));
    const [mfa] = await this.db.select({ confirmedAt: userTotp.confirmedAt }).from(userTotp).where(eq(userTotp.userId, userId));
    return {
      generatedAt: this.clock.now().toISOString(),
      notice: "Incluye tus datos personales. Los datos financieros pertenecen a cada organización y los exporta quien tenga permiso en ella.",
      profile,
      mfaEnabled: Boolean(mfa?.confirmedAt),
      memberships: orgs,
      sessions: sessionList,
      consents,
      dataRequests: requests,
      securityEvents: security,
    };
  }

  async listRequests(userId: string) {
    return this.db.select().from(dataRequests).where(eq(dataRequests.userId, userId)).orderBy(desc(dataRequests.createdAt));
  }

  async createRequest(userId: string, type: "access" | "rectification" | "objection", details: string, meta: RequestMeta): Promise<void> {
    await this.db.insert(dataRequests).values({ id: uuidv7(), userId, type, details: details.slice(0, 2000) });
    await recordAudit(this.db, { action: `privacy.request_${type}`, actorUserId: userId, request: meta });
  }

  /**
   * Derecho de supresión. Se anonimiza la identidad (nombre, correo, contraseña, MFA, sesiones) y se
   * conserva la autoría de los registros contables con un usuario anónimo, porque las empresas
   * deben conservarlos por obligación legal. Si la persona es la única propietaria de una empresa
   * con otros miembros, primero tiene que transferir la propiedad.
   */
  async eraseAccount(userId: string, meta: RequestMeta): Promise<void> {
    const ownedAlone = await withUser(this.db, userId, async (tx) => {
      const result = await tx.execute<{ name: string }>(sql`
        select o.name from memberships m
        join roles r on r.id = m.role_id and r.key = 'owner'
        join organizations o on o.id = m.organization_id
        where m.user_id = ${userId} and m.status = 'active'
          and (select count(*) from memberships m2 join roles r2 on r2.id = m2.role_id
               where m2.organization_id = m.organization_id and r2.key = 'owner' and m2.status = 'active') = 1
          and (select count(*) from memberships m3 where m3.organization_id = m.organization_id) > 1`);
      return result.rows.map((r) => r.name);
    });
    if (ownedAlone.length) {
      throw new ConflictError("sole_owner", `Sos la única persona propietaria de ${ownedAlone.join(", ")}. Asigná otro propietario antes de eliminar tu cuenta.`);
    }
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await tx.insert(dataRequests).values({ id: uuidv7(), userId, type: "erasure", status: "completed", details: "Supresión solicitada desde la cuenta", resolution: "Identidad anonimizada; registros contables conservados con autor anónimo.", resolvedAt: now });
      await tx.delete(userTotp).where(eq(userTotp.userId, userId));
      await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
      await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      await tx.update(sessions).set({ ip: null, userAgent: null }).where(eq(sessions.userId, userId));
      await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
      await tx.delete(memberships).where(eq(memberships.userId, userId));
      await tx
        .update(users)
        .set({ email: `eliminado-${userId}@invalid`, emailNormalized: `eliminado-${userId}@invalid`, name: "Usuario eliminado", passwordHash: `!disabled:${randomToken(16)}`, residenceCountry: null, deletedAt: now, updatedAt: now })
        .where(eq(users.id, userId));
      await recordAudit(tx, { action: "privacy.account_erased", actorUserId: userId, request: { ip: null, userAgent: null } });
    });
    void meta;
  }
}
