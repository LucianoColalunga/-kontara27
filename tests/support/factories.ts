import { randomBytes } from "node:crypto";
import type { TenantContext } from "@/server/modules/tenancy";
import { meta, type TestEnvironment } from "./test-db";

let counter = 0;

/** Usuario registrado y verificado por el flujo real (registro + enlace del correo). */
export async function createVerifiedUser(env: TestEnvironment, overrides: { name?: string; email?: string; password?: string } = {}) {
  counter += 1;
  const email = overrides.email ?? `persona${counter}.${randomBytes(3).toString("hex")}@example.test`;
  const password = overrides.password ?? `Clave-larga-${randomBytes(6).toString("hex")}`;
  const name = overrides.name ?? `Persona Prueba ${counter}`;
  // IP distinta por alta: el límite real de registros por IP sigue activo en las pruebas.
  await env.services.auth.register({ name, email, password, acceptTerms: true }, { ...meta, ip: `10.${counter % 250}.${randomBytes(1)[0]}.${randomBytes(1)[0]}` });
  const mail = [...env.email.sent].reverse().find((m) => m.to === email && m.tag === "verification");
  const token = /token=([^\s"&]+)/.exec(mail?.text ?? "")?.[1];
  if (!token) throw new Error("No llegó el correo de verificación");
  await env.services.auth.verifyEmail(decodeURIComponent(token), meta);
  const user = await env.services.users.findByEmail(email.toLowerCase());
  return { id: user!.id, email, password, name };
}

export async function createOrganization(env: TestEnvironment, userId: string, overrides: Record<string, unknown> = {}) {
  const { id, slug } = await env.services.tenancy.createOrganization(
    userId,
    { name: `Empresa ${randomBytes(3).toString("hex")}`, country: "AR", currency: "ARS", timezone: "America/Argentina/Buenos_Aires", ...overrides },
    meta,
  );
  const ctx = await env.services.tenancy.resolveContext(userId, slug);
  if (!ctx) throw new Error("No se resolvió el contexto de la organización");
  return { id, slug, ctx };
}

/** Agrega a un usuario existente con un rol de sistema, por el flujo real de invitación. */
export async function addMember(env: TestEnvironment, owner: TenantContext, user: { id: string; email: string }, roleKey: string): Promise<TenantContext> {
  const roles = await env.services.tenancy.listRoles(owner);
  const role = roles.find((r) => r.key === roleKey);
  if (!role) throw new Error(`Rol ${roleKey} inexistente`);
  await env.services.tenancy.invite(owner, { email: user.email, roleId: role.id }, "Dueña", meta);
  const mail = [...env.email.sent].reverse().find((m) => m.to === user.email && m.tag === "invitation");
  const token = decodeURIComponent(/token=([^\s"&]+)/.exec(mail!.text)![1]!);
  const slug = await env.services.tenancy.acceptInvitation(user.id, token, meta);
  return (await env.services.tenancy.resolveContext(user.id, slug))!;
}

export async function typeId(env: TestEnvironment, ctx: TenantContext, baseKind: string) {
  const types = await env.services.catalog.listMovementTypes(ctx);
  return types.find((t) => t.baseKind === baseKind && t.isSystem)!.id;
}

export async function categoryId(env: TestEnvironment, ctx: TenantContext, name: string) {
  const list = await env.services.catalog.listCategories(ctx);
  return list.find((c) => c.name === name)!.id;
}
