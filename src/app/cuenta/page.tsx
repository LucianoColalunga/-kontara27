import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Laptop, Smartphone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/app-shell/app-shell";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { COUNTRIES } from "@/lib/geo";
import { getServices } from "@/server/container";
import { requireUser } from "@/server/http/session";
import { resolveJurisdiction } from "@/server/modules/privacy";
import { logoutAction } from "@/app/(auth)/actions";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";
import { DeleteAccountForm, ExportDataForm, MfaManage, MfaSetup, PasswordForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Mi cuenta" };

function describeDevice(userAgent: string | null) {
  const ua = userAgent ?? "";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Dispositivo";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return { label: `${browser} en ${os}`, mobile: os === "Android" || os === "iOS" };
}

export default async function AccountPage() {
  const session = await requireUser();
  const services = await getServices();
  const [mfaEnabled, remaining, sessions, organizations, requests] = await Promise.all([
    services.mfa.isEnabled(session.user.id),
    services.mfa.remainingRecoveryCodes(session.user.id),
    services.sessions.list(session.user.id),
    services.tenancy.listMyOrganizations(session.user.id),
    services.privacy.listRequests(session.user.id),
  ]);
  const jurisdiction = resolveJurisdiction(session.user.residenceCountry);
  const back = organizations[0] ? `/app/${organizations[0].slug}` : "/app";

  return (
    <div className="min-h-dvh px-4 py-6 sm:px-8">
      <header className="mx-auto mb-8 flex max-w-4xl items-center justify-between">
        <Link href={back}>
          <Logo size={28} />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeSwitch back="/cuenta" />
          <form action={logoutAction}>
            <button type="submit" className="text-[13px] font-semibold text-muted hover:text-text">
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl">
        <Link href={back} className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Volver
        </Link>
        <PageHeader title="Mi cuenta" description={`${session.user.email} · miembro de ${organizations.length} ${organizations.length === 1 ? "empresa" : "empresas"}`} />
        <div className="space-y-6">
          <Card>
            <CardHeader title="Perfil" />
            <div className="p-5">
              <ProfileForm name={session.user.name} country={session.user.residenceCountry} countries={COUNTRIES.map(({ code, name }) => ({ code, name }))} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Contraseña" description="Al cambiarla se cierran tus sesiones en otros dispositivos." />
            <div className="p-5">
              <PasswordForm />
            </div>
          </Card>

          <Card>
            <CardHeader title="Verificación en dos pasos" description={mfaEnabled ? `Activa · te quedan ${remaining} códigos de recuperación` : "Recomendada: protege la cuenta aunque alguien conozca tu contraseña."} action={mfaEnabled ? <Badge tone="good">Activa</Badge> : <Badge tone="warning">Desactivada</Badge>} />
            <div className="p-5">{mfaEnabled ? <MfaManage /> : <MfaSetup />}</div>
          </Card>

          <Card>
            <CardHeader
              title="Sesiones abiertas"
              description="Dispositivos donde tu cuenta está iniciada."
              action={
                sessions.length > 1 ? (
                  <form action={revokeOtherSessionsAction}>
                    <button type="submit" className="text-[13px] font-semibold text-critical hover:underline">
                      Cerrar las demás
                    </button>
                  </form>
                ) : null
              }
            />
            <ul className="mt-3 divide-y divide-border">
              {sessions.map((s) => {
                const device = describeDevice(s.userAgent);
                const current = s.id === session.session.id;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px]">
                    {device.mobile ? <Smartphone className="h-4 w-4 text-muted" aria-hidden /> : <Laptop className="h-4 w-4 text-muted" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{device.label}</span> {current ? <Badge tone="accent">Esta sesión</Badge> : null}
                      <span className="block text-[12px] text-muted">
                        Última actividad {s.lastSeenAt.toLocaleString("es-AR")} {s.ip ? `· IP ${s.ip}` : ""}
                      </span>
                    </span>
                    {!current ? (
                      <form action={revokeSessionAction}>
                        <input type="hidden" name="sessionId" value={s.id} />
                        <button type="submit" className="text-[13px] font-semibold text-critical hover:underline">
                          Cerrar
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Privacidad" description={`Normativa que te aplica según tu país de residencia: ${jurisdiction === "AR" ? "Ley 25.326 (Argentina)" : jurisdiction === "EU" ? "RGPD (Unión Europea)" : "criterio más estricto (RGPD)"}. Ver la política de privacidad.`} />
            <div className="space-y-6 p-5">
              <div>
                <h3 className="mb-1 text-[14px] font-semibold">Acceso y portabilidad</h3>
                <p className="mb-3 text-[13px] text-muted">Un archivo JSON con tus datos personales: perfil, empresas a las que pertenecés, sesiones, consentimientos y eventos de seguridad. Los datos financieros de cada empresa los exporta quien tenga permiso en ella.</p>
                <ExportDataForm />
              </div>
              <div>
                <h3 className="mb-1 text-[14px] font-semibold">Cookies</h3>
                <p className="text-[13px] text-muted">
                  Solo usamos cookies necesarias. <Link href="/legal/cookies" className="font-semibold text-accent">Ver y cambiar preferencias</Link>.
                </p>
              </div>
              {requests.length ? (
                <div>
                  <h3 className="mb-2 text-[14px] font-semibold">Tus solicitudes</h3>
                  <ul className="space-y-1 text-[13px] text-text-2">
                    {requests.map((r) => (
                      <li key={r.id}>
                        {r.createdAt.toLocaleDateString("es-AR")} · {r.type} · {r.status}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-xl border border-[color-mix(in_oklab,var(--critical)_40%,transparent)] p-4">
                <h3 className="mb-1 text-[14px] font-semibold text-critical">Eliminar mi cuenta</h3>
                <p className="mb-3 text-[13px] text-text-2">
                  Borramos tu nombre, correo, contraseña, verificación en dos pasos y sesiones. Los registros contables que cargaste en una empresa se conservan con autor anónimo, porque la empresa está obligada a guardarlos. Si sos la única persona propietaria de una empresa con otros miembros, primero asigná otro propietario.
                </p>
                <DeleteAccountForm />
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
