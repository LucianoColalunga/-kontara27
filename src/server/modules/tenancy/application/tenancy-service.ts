import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { ALL_PERMISSIONS, isPermission, type Permission, SYSTEM_ROLES, type SystemRoleKey } from "@/lib/permissions";
import { accounts, auditEvents, categories, invitations, memberships, movementTypes, organizations, paymentMethods, roles, users } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { decryptString, encryptString, randomToken, sha256Hex } from "@/server/platform/crypto";
import { type Database, type Tx, withTenant, withUser } from "@/server/platform/db";
import type { EmailSender } from "@/server/platform/email";
import { emailTemplates } from "@/server/platform/email-templates";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { RATE_LIMITS, type RateLimiter } from "@/server/platform/rate-limit";
import { DEFAULT_CATEGORIES, DEFAULT_MOVEMENT_TYPES, DEFAULT_PAYMENT_METHODS } from "../domain/defaults";
import { isValidCuit, organizationInput, RESERVED_SLUGS, slugify } from "../domain/organization";
import { authorize, isOwner, type TenantContext, tenantScope } from "../domain/tenant-context";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TenancyDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  rateLimiter: RateLimiter;
  encryptionKey: Buffer;
  appUrl: string;
}

export interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  roleName: string;
}

const roleInput = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional().transform((v) => v || null),
  permissions: z.array(z.string()).transform((list) => [...new Set(list.filter(isPermission))]),
});

export class TenancyService {
  constructor(private readonly deps: TenancyDeps) {}

  // ------------------------------------------------------------------ Organizaciones

  async createOrganization(userId: string, input: unknown, meta: RequestMeta, options: { seedCategories?: boolean } = {}): Promise<{ id: string; slug: string }> {
    const parsed = organizationInput.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Revisá los datos.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
    const data = parsed.data;
    if (data.taxId && (data.taxIdType === "CUIT" || data.taxIdType === "CUIL") && !isValidCuit(data.taxId)) {
      throw new ValidationError("El CUIT/CUIL no es válido (revisá el dígito verificador).", { taxId: "Dígito verificador incorrecto" });
    }
    const organizationId = uuidv7();
    const slug = await this.availableSlug(slugify(data.name));

    await withUser(this.deps.db, userId, async (tx) => {
      await tx.insert(organizations).values({
        id: organizationId,
        slug,
        name: data.name,
        legalName: data.legalName,
        taxIdType: data.taxId ? (data.taxIdType ?? "OTRO") : null,
        taxIdEncrypted: data.taxId ? encryptString(this.deps.encryptionKey, data.taxId, `org-tax:${organizationId}`) : null,
        taxIdLast4: data.taxId ? data.taxId.replace(/\W/g, "").slice(-4) : null,
        address: data.address ?? null,
        country: data.country,
        currency: data.currency,
        timezone: data.timezone,
        locale: data.locale,
        fiscalYearStartMonth: data.fiscalYearStartMonth,
        createdBy: userId,
      });
      // Política de arranque: el creador inserta los roles y su membresía mientras la empresa no tiene miembros.
      const roleIds = {} as Record<SystemRoleKey, string>;
      for (const [key, role] of Object.entries(SYSTEM_ROLES) as Array<[SystemRoleKey, (typeof SYSTEM_ROLES)[SystemRoleKey]]>) {
        roleIds[key] = uuidv7();
        await tx.insert(roles).values({ id: roleIds[key], organizationId, key, name: role.name, description: role.description, permissions: role.permissions, isSystem: true });
      }
      await tx.insert(memberships).values({ id: uuidv7(), organizationId, userId, roleId: roleIds.owner });

      // A partir de acá rige la política normal de la organización.
      await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
      await tx.insert(movementTypes).values(DEFAULT_MOVEMENT_TYPES.map((t, i) => ({ id: uuidv7(), organizationId, name: t.name, baseKind: t.baseKind, isSystem: true, sortOrder: i })));
      await tx.insert(paymentMethods).values(DEFAULT_PAYMENT_METHODS.map((name, i) => ({ id: uuidv7(), organizationId, name, sortOrder: i })));
      if (options.seedCategories !== false) {
        await tx.insert(categories).values(DEFAULT_CATEGORIES.map((c, i) => ({ id: uuidv7(), organizationId, name: c.name, scope: c.scope, color: c.color, sortOrder: i })));
      }
      await tx.insert(accounts).values({ id: uuidv7(), organizationId, name: "Caja", type: "cash", currency: data.currency, createdBy: userId });
      await recordAudit(tx, { action: "organization.created", actorUserId: userId, organizationId, entityType: "organization", entityId: organizationId, request: meta });
    });
    return { id: organizationId, slug };
  }

  /**
   * Los slugs son globales, pero RLS oculta las empresas ajenas: la disponibilidad se consulta con
   * app.slug_available(), que solo responde sí/no y no expone ningún otro dato.
   */
  private async availableSlug(base: string): Promise<string> {
    const candidate = RESERVED_SLUGS.has(base) ? `${base}-empresa` : base;
    for (let attempt = 0; attempt < 6; attempt++) {
      const slug = attempt === 0 ? candidate : `${candidate}-${randomBytes(2).toString("hex")}`;
      const result = await this.deps.db.execute<{ ok: boolean }>(sql`select app.slug_available(${slug}) as ok`);
      if (result.rows[0]?.ok) return slug;
    }
    return `${candidate}-${uuidv7().slice(-6)}`;
  }

  async listMyOrganizations(userId: string): Promise<OrganizationSummary[]> {
    return withUser(this.deps.db, userId, (tx) =>
      tx
        .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, roleName: roles.name })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(and(eq(memberships.userId, userId), eq(memberships.status, "active"), eq(organizations.status, "active")))
        .orderBy(asc(organizations.name)),
    );
  }

  /** Resuelve la organización de la URL para el usuario de la sesión. null = no es miembro (o no existe). */
  async resolveContext(userId: string, slug: string): Promise<TenantContext | null> {
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
    const row = await withUser(this.deps.db, userId, async (tx) => {
      const [found] = await tx
        .select({
          organizationId: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          currency: organizations.currency,
          locale: organizations.locale,
          timezone: organizations.timezone,
          country: organizations.country,
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
          permissions: roles.permissions,
        })
        .from(organizations)
        .innerJoin(memberships, and(eq(memberships.organizationId, organizations.id), eq(memberships.userId, userId), eq(memberships.status, "active")))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(and(eq(organizations.slug, slug), eq(organizations.status, "active")))
        .limit(1);
      return found;
    });
    if (!row) return null;
    const permissions = new Set<Permission>(row.roleKey === "owner" ? ALL_PERMISSIONS : row.permissions.filter(isPermission));
    return {
      userId,
      organizationId: row.organizationId,
      organization: { slug: row.slug, name: row.name, currency: row.currency, locale: row.locale, timezone: row.timezone, country: row.country },
      role: { id: row.roleId, key: row.roleKey, name: row.roleName },
      permissions,
    };
  }

  async getOrganizationDetails(ctx: TenantContext) {
    return withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [org] = await tx.select().from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1);
      if (!org) throw new NotFoundError();
      const taxId = org.taxIdEncrypted && ctx.permissions.has("org.manage") ? decryptString(this.deps.encryptionKey, org.taxIdEncrypted, `org-tax:${org.id}`) : null;
      return { ...org, taxIdEncrypted: undefined, taxId };
    });
  }

  async updateOrganization(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "org.manage");
    const parsed = organizationInput.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Revisá los datos.");
    const data = parsed.data;
    if (data.taxId && (data.taxIdType === "CUIT" || data.taxIdType === "CUIL") && !isValidCuit(data.taxId)) {
      throw new ValidationError("El CUIT/CUIL no es válido (revisá el dígito verificador).", { taxId: "Dígito verificador incorrecto" });
    }
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await tx
        .update(organizations)
        .set({
          name: data.name,
          legalName: data.legalName,
          taxIdType: data.taxId ? (data.taxIdType ?? "OTRO") : null,
          taxIdEncrypted: data.taxId ? encryptString(this.deps.encryptionKey, data.taxId, `org-tax:${ctx.organizationId}`) : null,
          taxIdLast4: data.taxId ? data.taxId.replace(/\W/g, "").slice(-4) : null,
          address: data.address ?? null,
          country: data.country,
          currency: data.currency,
          timezone: data.timezone,
          locale: data.locale,
          fiscalYearStartMonth: data.fiscalYearStartMonth,
          updatedAt: this.deps.clock.now(),
        })
        .where(eq(organizations.id, ctx.organizationId));
      await recordAudit(tx, { action: "organization.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "organization", entityId: ctx.organizationId, request: meta });
    });
  }

  // ------------------------------------------------------------------ Miembros

  async listMembers(ctx: TenantContext) {
    authorize(ctx, "members.view");
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ membershipId: memberships.id, userId: users.id, name: users.name, email: users.email, roleId: roles.id, roleKey: roles.key, roleName: roles.name, status: memberships.status, since: memberships.createdAt })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(eq(memberships.organizationId, ctx.organizationId))
        .orderBy(asc(users.name)),
    );
  }

  private async countActiveOwners(tx: Tx, organizationId: string): Promise<number> {
    const result = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from memberships m join roles r on r.id = m.role_id
      where m.organization_id = ${organizationId} and m.status = 'active' and r.key = 'owner'`);
    return result.rows[0]?.n ?? 0;
  }

  async changeMemberRole(ctx: TenantContext, membershipId: string, roleId: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "members.manage");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [member] = await tx.select({ id: memberships.id, roleKey: roles.key }).from(memberships).innerJoin(roles, eq(roles.id, memberships.roleId)).where(eq(memberships.id, membershipId)).limit(1);
      const [target] = await tx.select({ id: roles.id, key: roles.key }).from(roles).where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.organizationId))).limit(1);
      if (!member || !target) throw new NotFoundError();
      if ((member.roleKey === "owner" || target.key === "owner") && !isOwner(ctx)) throw new ForbiddenError("Solo un propietario puede asignar o quitar el rol de propietario.");
      if (member.roleKey === "owner" && target.key !== "owner" && (await this.countActiveOwners(tx, ctx.organizationId)) <= 1) {
        throw new ConflictError("last_owner", "La empresa necesita al menos un propietario activo.");
      }
      await tx.update(memberships).set({ roleId, updatedAt: this.deps.clock.now() }).where(eq(memberships.id, membershipId));
      await recordAudit(tx, { action: "member.role_changed", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "membership", entityId: membershipId, metadata: { from: member.roleKey, to: target.key }, request: meta });
    });
  }

  async setMemberStatus(ctx: TenantContext, membershipId: string, status: "active" | "suspended" | "removed", meta: RequestMeta): Promise<void> {
    authorize(ctx, "members.manage");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [member] = await tx.select({ id: memberships.id, userId: memberships.userId, roleKey: roles.key }).from(memberships).innerJoin(roles, eq(roles.id, memberships.roleId)).where(eq(memberships.id, membershipId)).limit(1);
      if (!member) throw new NotFoundError();
      if (member.roleKey === "owner" && !isOwner(ctx)) throw new ForbiddenError("Solo un propietario puede suspender o quitar a otro propietario.");
      if (member.roleKey === "owner" && status !== "active" && (await this.countActiveOwners(tx, ctx.organizationId)) <= 1) {
        throw new ConflictError("last_owner", "La empresa necesita al menos un propietario activo.");
      }
      if (status === "removed") await tx.delete(memberships).where(eq(memberships.id, membershipId));
      else await tx.update(memberships).set({ status, updatedAt: this.deps.clock.now() }).where(eq(memberships.id, membershipId));
      await recordAudit(tx, { action: `member.${status}`, actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "membership", entityId: membershipId, metadata: { userId: member.userId }, request: meta });
    });
  }

  // ------------------------------------------------------------------ Roles

  async listRoles(ctx: TenantContext) {
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: roles.id, key: roles.key, name: roles.name, description: roles.description, permissions: roles.permissions, isSystem: roles.isSystem })
        .from(roles)
        .where(eq(roles.organizationId, ctx.organizationId))
        .orderBy(asc(roles.createdAt)),
    );
  }

  async createRole(ctx: TenantContext, input: unknown, meta: RequestMeta): Promise<string> {
    authorize(ctx, "roles.manage");
    const data = roleInput.parse(input);
    const id = uuidv7();
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await tx.insert(roles).values({ id, organizationId: ctx.organizationId, key: `custom-${id.slice(-8)}`, name: data.name, description: data.description, permissions: data.permissions });
      await recordAudit(tx, { action: "role.created", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "role", entityId: id, metadata: { permissions: data.permissions }, request: meta });
    });
    return id;
  }

  async updateRole(ctx: TenantContext, roleId: string, input: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "roles.manage");
    const data = roleInput.parse(input);
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) throw new NotFoundError();
      if (role.key === "owner") throw new ForbiddenError("Los permisos del propietario no se pueden modificar.");
      if (role.id === ctx.role.id && !isOwner(ctx) && data.permissions.length < role.permissions.length && !data.permissions.includes("roles.manage")) {
        throw new ConflictError("self_lockout", "No podés quitarte el permiso de administrar roles a vos mismo.");
      }
      await tx.update(roles).set({ name: data.name, description: data.description, permissions: data.permissions, updatedAt: this.deps.clock.now() }).where(eq(roles.id, roleId));
      await recordAudit(tx, { action: "role.updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "role", entityId: roleId, metadata: { before: role.permissions, after: data.permissions }, request: meta });
    });
  }

  async deleteRole(ctx: TenantContext, roleId: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "roles.manage");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [role] = await tx.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (!role) throw new NotFoundError();
      if (role.isSystem) throw new ForbiddenError("Los roles del sistema no se eliminan; podés editar sus permisos.");
      const inUse = await tx.execute<{ n: number }>(sql`select count(*)::int as n from memberships where role_id = ${roleId}`);
      if ((inUse.rows[0]?.n ?? 0) > 0) throw new ConflictError("role_in_use", "Hay miembros con este rol. Asignales otro antes de eliminarlo.");
      await tx.delete(roles).where(eq(roles.id, roleId));
      await recordAudit(tx, { action: "role.deleted", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "role", entityId: roleId, request: meta });
    });
  }

  // ------------------------------------------------------------------ Auditoría

  async listAuditEvents(ctx: TenantContext, page = 1, pageSize = 100) {
    authorize(ctx, "audit.view");
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: auditEvents.id, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, ip: auditEvents.ip, createdAt: auditEvents.createdAt, actorName: users.name })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(eq(auditEvents.organizationId, ctx.organizationId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(pageSize)
        .offset((Math.max(1, page) - 1) * pageSize),
    );
  }

  // ------------------------------------------------------------------ Invitaciones

  async invite(ctx: TenantContext, input: { email: string; roleId: string }, inviterName: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "members.manage");
    const email = z.email("Ingresá un correo válido.").safeParse(input.email.trim());
    if (!email.success) throw new ValidationError("Ingresá un correo válido.", { email: "Correo inválido" });
    await this.deps.rateLimiter.consume(RATE_LIMITS.invitationsByOrg, ctx.organizationId);
    const emailNormalized = email.data.toLowerCase();
    const token = randomToken(32);
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [role] = await tx.select().from(roles).where(and(eq(roles.id, input.roleId), eq(roles.organizationId, ctx.organizationId))).limit(1);
      if (!role) throw new ValidationError("Elegí un rol.", { roleId: "Rol inválido" });
      if (role.key === "owner" && !isOwner(ctx)) throw new ForbiddenError("Solo un propietario puede invitar propietarios.");
      const already = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from memberships m join users u on u.id = m.user_id
        where m.organization_id = ${ctx.organizationId} and u.email_normalized = ${emailNormalized}`);
      if ((already.rows[0]?.n ?? 0) > 0) throw new ConflictError("already_member", "Esa persona ya es miembro de la empresa.");
      await tx.update(invitations).set({ revokedAt: this.deps.clock.now() }).where(and(eq(invitations.organizationId, ctx.organizationId), eq(invitations.emailNormalized, emailNormalized), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const id = uuidv7();
      await tx.insert(invitations).values({ id, organizationId: ctx.organizationId, emailNormalized, roleId: role.id, tokenHash: sha256Hex(token), invitedBy: ctx.userId, expiresAt: new Date(this.deps.clock.now().getTime() + INVITATION_TTL_MS) });
      await recordAudit(tx, { action: "member.invited", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "invitation", entityId: id, metadata: { role: role.key }, request: meta });
      const url = `${this.deps.appUrl.replace(/\/$/, "")}/invitacion?token=${encodeURIComponent(token)}`;
      await this.deps.email.send(emailTemplates.invitation(email.data, inviterName, ctx.organization.name, role.name, url));
    });
  }

  async listInvitations(ctx: TenantContext) {
    authorize(ctx, "members.view");
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: invitations.id, email: invitations.emailNormalized, roleName: roles.name, expiresAt: invitations.expiresAt, createdAt: invitations.createdAt })
        .from(invitations)
        .innerJoin(roles, eq(roles.id, invitations.roleId))
        .where(and(eq(invitations.organizationId, ctx.organizationId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), sql`${invitations.expiresAt} > now()`)),
    );
  }

  async revokeInvitation(ctx: TenantContext, invitationId: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "members.manage");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const result = await tx.update(invitations).set({ revokedAt: this.deps.clock.now() }).where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)));
      if ((result.rowCount ?? 0) === 0) throw new NotFoundError();
      await recordAudit(tx, { action: "member.invitation_revoked", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "invitation", entityId: invitationId, request: meta });
    });
  }

  async acceptInvitation(userId: string, token: string, meta: RequestMeta): Promise<string> {
    try {
      return await withUser(this.deps.db, userId, async (tx) => {
        const result = await tx.execute<{ org: string }>(sql`select app.accept_invitation(${sha256Hex(token)}) as org`);
        const organizationId = result.rows[0]?.org;
        if (!organizationId) throw new NotFoundError();
        await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
        const [org] = await tx.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        await recordAudit(tx, { action: "member.joined", actorUserId: userId, organizationId, entityType: "organization", entityId: organizationId, request: meta });
        return org!.slug;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("invitation_email_mismatch")) throw new AppError("invitation_email_mismatch", "Esta invitación es para otro correo. Iniciá sesión con la cuenta invitada.", 403);
      if (message.includes("invitation_user_not_verified")) throw new AppError("invitation_unverified", "Confirmá tu correo antes de aceptar la invitación.", 403);
      if (message.includes("invitation_invalid")) throw new AppError("invitation_invalid", "La invitación no es válida, ya se usó o venció.", 400);
      throw error;
    }
  }

  async pendingInvitations(userId: string) {
    return withUser(this.deps.db, userId, async (tx) => {
      const result = await tx.execute<{ invitation_id: string; organization_name: string; role_name: string; expires_at: string }>(sql`select * from app.pending_invitations()`);
      return result.rows.map((r) => ({ id: r.invitation_id, organizationName: r.organization_name, roleName: r.role_name, expiresAt: r.expires_at }));
    });
  }
}
