"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { clearSessionCookie, readSessionToken, requestMeta, requireUser, setSessionCookie } from "@/server/http/session";
import { ValidationError } from "@/server/platform/errors";

/** Solo rutas internas: evita redirecciones abiertas («?next=https://sitio-malicioso»). */
function safeNext(value: string): string {
  return /^\/(?!\/|\\)[\w\-/?=&%.]*$/.test(value) && !value.startsWith("/api") ? value : "/app";
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  let destination = "/app";
  const result = await runAction(async () => {
    const services = await getServices();
    const login = await services.auth.login({ email: formString(form, "email"), password: formString(form, "password") }, await requestMeta());
    await setSessionCookie(login.session.token, login.session.expiresAt);
    destination = login.status === "mfa_required" ? `/ingresar/verificacion?next=${encodeURIComponent(safeNext(formString(form, "next")))}` : safeNext(formString(form, "next"));
  });
  if (!result.ok) return result;
  redirect(destination);
}

export async function mfaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const token = await readSessionToken();
    if (!token) throw new ValidationError("La verificación venció. Volvé a iniciar sesión.");
    const issued = await (await getServices()).auth.completeMfa(token, formString(form, "code").replace(/\s/g, ""), await requestMeta());
    await setSessionCookie(issued.token, issued.expiresAt);
  });
  if (!result.ok) return result;
  redirect(safeNext(formString(form, "next")));
}

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    if (formString(form, "password") !== formString(form, "confirm")) throw new ValidationError("Las contraseñas no coinciden.", { confirm: "No coincide" });
    await (await getServices()).auth.register(
      {
        name: formString(form, "name"),
        email: formString(form, "email"),
        password: formString(form, "password"),
        residenceCountry: formString(form, "country") || null,
        acceptTerms: form.get("terms") === "on" ? true : undefined,
      },
      await requestMeta(),
    );
    return { ok: true, message: "Listo. Te enviamos un correo para confirmar tu cuenta; el enlace vence en 24 horas." };
  });
}

export async function verifyEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    await (await getServices()).auth.verifyEmail(formString(form, "token"), await requestMeta());
  });
  if (!result.ok) return result;
  redirect("/ingresar?verificado=1");
}

export async function resendVerificationAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await (await getServices()).auth.resendVerification(formString(form, "email"), await requestMeta());
    return { ok: true, message: "Si la cuenta existe y falta confirmarla, te enviamos un correo nuevo." };
  });
}

export async function requestResetAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await (await getServices()).auth.requestPasswordReset(formString(form, "email"), await requestMeta());
    return { ok: true, message: "Si hay una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña. Vence en 30 minutos." };
  });
}

export async function resetPasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    if (formString(form, "password") !== formString(form, "confirm")) throw new ValidationError("Las contraseñas no coinciden.", { confirm: "No coincide" });
    await (await getServices()).auth.resetPassword(formString(form, "token"), formString(form, "password"), await requestMeta());
  });
  if (!result.ok) return result;
  redirect("/ingresar?restablecida=1");
}

export async function acceptInvitationAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await runAction(async () => {
    const session = await requireUser();
    slug = await (await getServices()).tenancy.acceptInvitation(session.user.id, formString(form, "token"), await requestMeta());
  });
  if (!result.ok) return result;
  redirect(`/app/${slug}`);
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  await (await getServices()).auth.logout(token, await requestMeta());
  await clearSessionCookie();
  redirect("/ingresar");
}

export async function setThemeAction(form: FormData): Promise<void> {
  const theme = formString(form, "theme");
  const store = await cookies();
  if (theme === "light" || theme === "dark") store.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  else store.delete("theme");
  const back = safeNext(formString(form, "back") || "/app");
  redirect(back);
}
