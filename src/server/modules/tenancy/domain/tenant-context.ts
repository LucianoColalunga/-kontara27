import type { Permission, SystemRoleKey } from "@/lib/permissions";
import { ForbiddenError } from "@/server/platform/errors";

/** Todo lo que un caso de uso necesita saber de quién pide y en qué empresa. */
export interface TenantContext {
  userId: string;
  organizationId: string;
  organization: {
    slug: string;
    name: string;
    currency: string;
    locale: string;
    timezone: string;
    country: string;
  };
  role: { id: string; key: string; name: string };
  permissions: ReadonlySet<Permission>;
}

export function can(ctx: TenantContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function authorize(ctx: TenantContext, ...permissions: Permission[]): void {
  for (const permission of permissions) {
    if (!ctx.permissions.has(permission)) throw new ForbiddenError();
  }
}

export const isOwner = (ctx: TenantContext) => (ctx.role.key as SystemRoleKey) === "owner";

export function tenantScope(ctx: TenantContext) {
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}
