import { AppShell } from "@/components/app-shell/app-shell";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";

export default async function OrganizationLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { session, ctx } = await requireTenant(org);
  const services = await getServices();
  const [organizations, unread] = await Promise.all([services.tenancy.listMyOrganizations(session.user.id), services.notifications.unreadCount(ctx)]);
  return (
    <AppShell slug={ctx.organization.slug} organizationName={ctx.organization.name} roleName={ctx.role.name} permissions={[...ctx.permissions]} user={{ name: session.user.name, email: session.user.email }} organizations={organizations} unread={unread}>
      {children}
    </AppShell>
  );
}
