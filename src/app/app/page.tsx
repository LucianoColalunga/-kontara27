import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { requireUser } from "@/server/http/session";

/** Entrada a la app: lleva a la primera empresa o al alta de una nueva. */
export default async function AppIndex() {
  const session = await requireUser();
  const services = await getServices();
  const organizations = await services.tenancy.listMyOrganizations(session.user.id);
  if (organizations.length === 0) {
    const invitations = await services.tenancy.pendingInvitations(session.user.id);
    redirect(invitations.length ? "/app/nueva?invitaciones=1" : "/app/nueva");
  }
  redirect(`/app/${organizations[0]!.slug}`);
}
