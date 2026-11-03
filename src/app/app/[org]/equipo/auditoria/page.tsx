import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, PageHeader, scrollable } from "@/components/ui/primitives";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";

export const metadata: Metadata = { title: "Registro de auditoría" };

const LABELS: Record<string, string> = {
  "organization.created": "Creó la empresa",
  "organization.updated": "Editó los datos de la empresa",
  "member.invited": "Invitó a una persona",
  "member.joined": "Se sumó a la empresa",
  "member.role_changed": "Cambió un rol",
  "member.suspended": "Suspendió a un miembro",
  "member.removed": "Quitó a un miembro",
  "role.created": "Creó un rol",
  "role.updated": "Editó permisos de un rol",
  "movement.created": "Registró un movimiento",
  "movement.updated": "Editó un movimiento",
  "movement.deleted": "Eliminó un movimiento",
  "movement.restored": "Restauró un movimiento",
  "movement.reconciled": "Concilió movimientos",
  "import.previewed": "Subió una planilla",
  "import.committed": "Confirmó una importación",
  "export.movements": "Exportó movimientos",
  "export.report": "Exportó un reporte",
  "document.attached": "Adjuntó un comprobante",
  "document.deleted": "Eliminó un comprobante",
};

export default async function AuditPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const { pagina } = await searchParams;
  const { ctx } = await requireTenant(org, "audit.view");
  const page = Math.max(1, Number(pagina) || 1);
  const events = await (await getServices()).tenancy.listAuditEvents(ctx, page);
  const base = `/app/${ctx.organization.slug}`;
  return (
    <>
      <Link href={`${base}/equipo`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Equipo
      </Link>
      <PageHeader title="Registro de auditoría" description="Quién hizo qué y cuándo. Es de solo inserción: nadie, ni siquiera la aplicación, puede editarlo o borrarlo." />
      <Card>
        <div className="overflow-x-auto" {...scrollable("Registro de auditoría")}>
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                <th className="px-5 py-3">Fecha</th>
                <th className="py-3 pr-4">Persona</th>
                <th className="py-3 pr-4">Acción</th>
                <th className="py-3 pr-5">Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-2.5 whitespace-nowrap text-text-2 tabular">{e.createdAt.toLocaleString(ctx.organization.locale, { timeZone: ctx.organization.timezone })}</td>
                  <td className="py-2.5 pr-4">{e.actorName ?? "Sistema"}</td>
                  <td className="py-2.5 pr-4">{LABELS[e.action] ?? e.action}</td>
                  <td className="py-2.5 pr-5 text-muted">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="flex justify-between border-t border-border px-5 py-3 text-[13px]" aria-label="Paginación">
          {page > 1 ? <Link href={`${base}/equipo/auditoria?pagina=${page - 1}`} className="font-semibold text-accent">Más recientes</Link> : <span />}
          {events.length === 100 ? <Link href={`${base}/equipo/auditoria?pagina=${page + 1}`} className="font-semibold text-accent">Anteriores</Link> : null}
        </nav>
      </Card>
    </>
  );
}
