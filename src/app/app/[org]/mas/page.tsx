import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Bell, CalendarClock, ChevronRight, CircleUser, FileSpreadsheet, PiggyBank, Settings, Users } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireTenant } from "@/server/http/session";
import { can } from "@/server/modules/tenancy";
import { ThemeSwitch } from "@/components/app-shell/app-shell";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "Más" };

/** Menú completo para celular (la barra inferior muestra solo lo más usado). */
export default async function MorePage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org);
  const base = `/app/${ctx.organization.slug}`;
  const items = [
    { href: `${base}/presupuestos`, label: "Presupuestos", icon: PiggyBank, show: can(ctx, "budgets.view") },
    { href: `${base}/reportes`, label: "Reportes", icon: BarChart3, show: can(ctx, "reports.view") },
    { href: `${base}/vencimientos`, label: "Vencimientos", icon: CalendarClock, show: can(ctx, "reminders.view") },
    { href: `${base}/importar`, label: "Importar planilla", icon: FileSpreadsheet, show: can(ctx, "imports.run") },
    { href: `${base}/equipo`, label: "Equipo y permisos", icon: Users, show: can(ctx, "members.view") },
    { href: `${base}/configuracion`, label: "Configuración", icon: Settings, show: can(ctx, "org.manage") || can(ctx, "catalog.manage") },
    { href: `${base}/notificaciones`, label: "Notificaciones", icon: Bell, show: true },
    { href: "/cuenta", label: "Mi cuenta y seguridad", icon: CircleUser, show: true },
  ].filter((i) => i.show);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Más" />
      <Card>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex items-center gap-3 px-5 py-4 text-[15px] hover:bg-surface-2">
                <item.icon className="h-5 w-5 text-text-2" aria-hidden />
                <span className="flex-1 font-medium">{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-6 flex items-center justify-between">
        <ThemeSwitch back={`${base}/mas`} />
        <form action={logoutAction}>
          <button type="submit" className="text-[14px] font-semibold text-critical">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
