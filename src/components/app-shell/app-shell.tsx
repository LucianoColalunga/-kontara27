import Link from "next/link";
import { ArrowLeftRight, Bell, CalendarClock, ChevronsUpDown, CircleUser, FileSpreadsheet, LayoutDashboard, LogOut, Moon, PiggyBank, Plus, Settings, Sun, Users, Wallet, BarChart3, Check, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/permissions";
import { Logo } from "@/components/brand/logo";
import { logoutAction, setThemeAction } from "@/app/(auth)/actions";
import { NavLink } from "./nav-link";

export interface ShellProps {
  slug: string;
  organizationName: string;
  roleName: string;
  permissions: Permission[];
  user: { name: string; email: string };
  organizations: Array<{ slug: string; name: string; roleName: string }>;
  unread: number;
  children: ReactNode;
}

function navItems(slug: string, can: (p: Permission) => boolean) {
  const base = `/app/${slug}`;
  return [
    { href: base, label: "Panel", icon: LayoutDashboard, exact: true, show: true },
    { href: `${base}/movimientos`, label: "Movimientos", icon: ArrowLeftRight, show: can("movements.view") },
    { href: `${base}/cuentas`, label: "Cuentas y cajas", icon: Wallet, show: can("accounts.view") },
    { href: `${base}/presupuestos`, label: "Presupuestos", icon: PiggyBank, show: can("budgets.view") },
    { href: `${base}/reportes`, label: "Reportes", icon: BarChart3, show: can("reports.view") },
    { href: `${base}/vencimientos`, label: "Vencimientos", icon: CalendarClock, show: can("reminders.view") },
    { href: `${base}/importar`, label: "Importar planilla", icon: FileSpreadsheet, show: can("imports.run") },
    { href: `${base}/equipo`, label: "Equipo y permisos", icon: Users, show: can("members.view") },
    { href: `${base}/configuracion`, label: "Configuración", icon: Settings, show: can("org.manage") || can("catalog.manage") },
  ].filter((i) => i.show);
}

const itemClass = "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text";
const itemActive = "bg-accent-soft !text-accent";

export function AppShell({ slug, organizationName, roleName, permissions, user, organizations, unread, children }: ShellProps) {
  const set = new Set(permissions);
  const can = (p: Permission) => set.has(p);
  const items = navItems(slug, can);
  const base = `/app/${slug}`;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-4 lg:flex" aria-label="Navegación principal">
        <Link href="/app" className="mb-5 px-2">
          <Logo size={28} />
        </Link>
        <OrgSwitcher current={{ slug, name: organizationName, roleName }} organizations={organizations} />
        <nav className="mt-4 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact} className={itemClass} activeClassName={itemActive}>
              <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <UserMenu user={user} back={base} />
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <Link href="/app" aria-label="Inicio">
              <Logo size={26} showText={false} />
            </Link>
            <span className="truncate text-[14px] font-semibold">{organizationName}</span>
          </div>
          <div className="hidden min-w-0 items-center gap-2 text-[13px] text-muted lg:flex">
            <span className="truncate font-semibold text-text">{organizationName}</span>
            <span aria-hidden>·</span>
            <span>{roleName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {can("movements.create") ? (
              <Link href={`${base}/movimientos/nuevo`} className="hidden h-9 items-center gap-1.5 rounded-[10px] bg-accent px-3 text-[13px] font-semibold text-accent-fg hover:bg-accent-hover sm:inline-flex">
                <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
              </Link>
            ) : null}
            <Link href={`${base}/notificaciones`} className="relative grid h-9 w-9 place-items-center rounded-[10px] text-text-2 hover:bg-surface-2" aria-label={unread ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}>
              <Bell className="h-[18px] w-[18px]" aria-hidden />
              {unread ? <span className="absolute top-1.5 right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-fg">{unread > 9 ? "9+" : unread}</span> : null}
            </Link>
            <Link href="/cuenta" className="grid h-9 w-9 place-items-center rounded-[10px] text-text-2 hover:bg-surface-2 lg:hidden" aria-label="Mi cuenta">
              <CircleUser className="h-[18px] w-[18px]" aria-hidden />
            </Link>
          </div>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Navegación inferior (celular y tablet) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Navegación">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {[
            { href: base, label: "Panel", icon: LayoutDashboard, exact: true, show: true },
            { href: `${base}/movimientos`, label: "Movimientos", icon: ArrowLeftRight, show: can("movements.view") },
            { href: `${base}/movimientos/nuevo`, label: "Nuevo", icon: Plus, show: can("movements.create"), primary: true },
            { href: `${base}/cuentas`, label: "Cuentas", icon: Wallet, show: can("accounts.view") },
            { href: `${base}/mas`, label: "Más", icon: Settings, show: true },
          ]
            .filter((i) => i.show)
            .map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} exact={item.exact ?? item.primary} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted" activeClassName="!text-accent">
                  {item.primary ? (
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-fg">
                      <item.icon className="h-5 w-5" aria-hidden />
                    </span>
                  ) : (
                    <item.icon className="h-5 w-5" aria-hidden />
                  )}
                  <span className={item.primary ? "sr-only" : undefined}>{item.label}</span>
                </NavLink>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}

function OrgSwitcher({ current, organizations }: { current: { slug: string; name: string; roleName: string }; organizations: Array<{ slug: string; name: string; roleName: string }> }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 hover:border-border-strong [&::-webkit-details-marker]:hidden">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-[13px] font-bold text-ink-fg">{current.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-text">{current.name}</span>
          <span className="block truncate text-[12px] text-muted">{current.roleName}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
      </summary>
      <div className="card absolute inset-x-0 top-full z-50 mt-2 p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">Tus empresas</p>
        <ul>
          {organizations.map((org) => (
            <li key={org.slug}>
              <Link href={`/app/${org.slug}`} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {org.slug === current.slug ? <Check className="h-4 w-4 text-accent" aria-label="Actual" /> : <span className="text-[12px] text-muted">{org.roleName}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/app/nueva" className="mt-1 flex items-center gap-2 rounded-lg border-t border-border px-2.5 py-2 text-[14px] font-semibold text-accent hover:bg-surface-2">
          <Plus className="h-4 w-4" aria-hidden /> Registrar otra empresa
        </Link>
      </div>
    </details>
  );
}

function UserMenu({ user, back }: { user: { name: string; email: string }; back: string }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <Link href="/cuenta" className="flex items-center gap-3 rounded-[10px] px-2 py-2 hover:bg-surface-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-accent">{initials(user.name)}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold">{user.name}</span>
          <span className="block truncate text-[12px] text-muted">{user.email}</span>
        </span>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <ThemeSwitch back={back} />
        <form action={logoutAction}>
          <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-text-2 hover:bg-surface-2">
            <LogOut className="h-4 w-4" aria-hidden /> Salir
          </button>
        </form>
      </div>
    </div>
  );
}

export function ThemeSwitch({ back }: { back: string }) {
  const options = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Sistema", icon: Monitor },
  ];
  return (
    <form action={setThemeAction} className="flex rounded-lg border border-border p-0.5" aria-label="Tema">
      <input type="hidden" name="back" value={back} />
      {options.map((o) => (
        <button key={o.value} type="submit" name="theme" value={o.value} title={`Tema ${o.label.toLowerCase()}`} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-text">
          <o.icon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{o.label}</span>
        </button>
      ))}
    </form>
  );
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
