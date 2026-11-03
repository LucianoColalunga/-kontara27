import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { requireUser } from "@/server/http/session";

/** Entrada a la app: lleva a la primera empresa o al alta de una nueva. */
export default async function AppIndex({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { accion } = await searchParams;
  const session = await requireUser();
  const services = await getServices();
  const organizations = await services.tenancy.listMyOrganizations(session.user.id);
  if (organizations.length === 0) {
    const invitations = await services.tenancy.pendingInvitations(session.user.id);
    redirect(invitations.length ? "/app/nueva?invitaciones=1" : "/app/nueva");
  }
  // Acceso directo de la app instalada: «Nuevo movimiento».
  redirect(accion === "nuevo" ? `/app/${organizations[0]!.slug}/movimientos/nuevo` : `/app/${organizations[0]!.slug}`);
}
