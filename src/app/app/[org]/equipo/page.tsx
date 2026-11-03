import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { initials } from "@/components/app-shell/app-shell";
import { Badge, buttonClass, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can, isOwner } from "@/server/modules/tenancy";
import { revokeInvitationAction } from "./actions";
import { InviteForm, MemberControls, RoleEditor } from "./forms";

export const metadata: Metadata = { title: "Equipo y permisos" };

export default async function TeamPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org, "members.view");
  const services = await getServices();
  const [members, invitations, roles] = await Promise.all([services.tenancy.listMembers(ctx), services.tenancy.listInvitations(ctx), services.tenancy.listRoles(ctx)]);
  const manage = can(ctx, "members.manage");
  // Solo un propietario puede asignar el rol de propietario.
  const assignable = roles.filter((r) => r.key !== "owner" || isOwner(ctx)).map((r) => ({ id: r.id, key: r.key, name: r.name }));
  const locale = ctx.organization.locale;

  return (
    <>
      <PageHeader
        title="Equipo y permisos"
        description="Cada persona entra con su propia cuenta y puede pertenecer a varias empresas. Los permisos de cada rol son configurables."
        actions={
          can(ctx, "audit.view") ? (
            <Link href={`/app/${ctx.organization.slug}/equipo/auditoria`} className={buttonClass("secondary")}>
              <ScrollText className="h-4 w-4" aria-hidden /> Registro de auditoría
            </Link>
          ) : null
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title={`Miembros (${members.length})`} />
          <ul className="mt-3 divide-y divide-border">
            {members.map((m) => (
              <li key={m.membershipId} className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{initials(m.name)}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {m.name} {m.userId === ctx.userId ? <span className="text-[12px] font-normal text-muted">(vos)</span> : null}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {m.email} · desde {m.since.toLocaleDateString(locale)}
                    </p>
                  </div>
                  <div className="ml-auto flex gap-1 lg:hidden">
                    <Badge tone={m.roleKey === "owner" ? "accent" : "neutral"}>{m.roleName}</Badge>
                  </div>
                </div>
                {manage && (m.roleKey !== "owner" || isOwner(ctx)) ? (
                  <MemberControls org={ctx.organization.slug} membershipId={m.membershipId} roleId={m.roleId} status={m.status} roles={assignable} isSelf={m.userId === ctx.userId} />
                ) : (
                  <div className="hidden gap-1 lg:flex">
                    <Badge tone={m.roleKey === "owner" ? "accent" : "neutral"}>{m.roleName}</Badge>
                    {m.status !== "active" ? <Badge tone="warning">Suspendido</Badge> : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {manage ? (
          <Card>
            <CardHeader title="Invitar a alguien" description="Le llega un enlace por correo. Tiene que entrar con ese mismo correo, ya verificado." />
            <div className="p-5">
              <InviteForm org={ctx.organization.slug} roles={assignable} />
            </div>
            {invitations.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px]">
                    <span className="min-w-0 flex-1 truncate">{i.email}</span>
                    <Badge>{i.roleName}</Badge>
                    <span className="text-[12px] text-muted">vence {i.expiresAt.toLocaleDateString(locale)}</span>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="org" value={ctx.organization.slug} />
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button type="submit" className="text-[13px] font-semibold text-critical hover:underline">
                        Revocar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Roles y permisos" description="Los roles del sistema se pueden ajustar (salvo el de propietario). También podés crear roles propios." />
          <ul className="mt-3 divide-y divide-border">
            {roles.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <span className="font-semibold">{r.name}</span>
                    {r.isSystem ? <Badge>Del sistema</Badge> : <Badge tone="accent">Personalizado</Badge>}
                    <span className="text-[13px] text-muted">{r.key === "owner" ? "todos los permisos" : `${r.permissions.length} permisos`}</span>
                    <span className="ml-auto text-[13px] font-semibold text-accent">{can(ctx, "roles.manage") && r.key !== "owner" ? "Editar" : "Ver"}</span>
                  </summary>
                  {r.description ? <p className="mt-2 text-[13px] text-text-2">{r.description}</p> : null}
                  <div className="mt-4">
                    <RoleEditor org={ctx.organization.slug} role={r} editable={can(ctx, "roles.manage")} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
          {can(ctx, "roles.manage") ? (
            <div className="border-t border-border p-5">
              <details>
                <summary className={buttonClass("secondary", "md", "w-fit list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>Crear un rol</summary>
                <div className="mt-4">
                  <RoleEditor org={ctx.organization.slug} editable />
                </div>
              </details>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
