import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Callout, Card } from "@/components/ui/primitives";
import { COUNTRIES, TIMEZONES } from "@/lib/geo";
import { getServices } from "@/server/container";
import { requireUser } from "@/server/http/session";
import { SUPPORTED_CURRENCIES, TAX_ID_TYPES } from "@/server/modules/tenancy";
import { logoutAction } from "@/app/(auth)/actions";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Registrar empresa" };

export default async function NewOrganizationPage() {
  const session = await requireUser();
  const services = await getServices();
  const [organizations, invitations] = await Promise.all([services.tenancy.listMyOrganizations(session.user.id), services.tenancy.pendingInvitations(session.user.id)]);
  return (
    <div className="min-h-dvh px-4 py-8 sm:px-8">
      <div className="mx-auto mb-10 flex max-w-2xl items-center justify-between">
        <Link href="/app">
          <Logo size={28} />
        </Link>
        <form action={logoutAction}>
          <button className="text-[13px] font-semibold text-muted hover:text-text" type="submit">
            Salir
          </button>
        </form>
      </div>
      <div className="mx-auto max-w-2xl fade-in">
        <h1 className="font-display text-[28px] font-semibold tracking-[-0.01em]">{organizations.length ? "Registrar otra empresa" : `Hola, ${session.user.name.split(" ")[0]}. Registrá tu empresa`}</h1>
        <p className="mt-1 mb-6 text-sm text-text-2">Cada empresa tiene sus propios datos, categorías, cuentas y equipo. Nadie de otra empresa puede verlos.</p>
        {invitations.length ? (
          <Callout tone="info" title="Tenés invitaciones pendientes" className="mb-6">
            {invitations.map((i) => `${i.organizationName} (${i.roleName})`).join(", ")}. Abrí el enlace del correo de invitación para sumarte.
          </Callout>
        ) : null}
        <Card className="p-5 sm:p-7">
          <OrganizationForm countries={COUNTRIES} currencies={SUPPORTED_CURRENCIES} timezones={TIMEZONES} taxIdTypes={TAX_ID_TYPES} />
        </Card>
        {organizations.length ? (
          <p className="mt-6 text-sm text-muted">
            <Link href={`/app/${organizations[0]!.slug}`} className="font-semibold text-accent">
              Volver a {organizations[0]!.name}
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
