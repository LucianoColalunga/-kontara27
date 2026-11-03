"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { clearSessionCookie, requestMeta, requireUser } from "@/server/http/session";
import { ValidationError } from "@/server/platform/errors";

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireUser();
    await (await getServices()).auth.updateProfile(session.user.id, { name: formString(form, "name"), residenceCountry: formString(form, "country") || null }, await requestMeta());
    revalidatePath("/cuenta");
    return { ok: true, message: "Perfil actualizado." };
  });
}

export async function changePasswordAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireUser();
    if (formString(form, "newPassword") !== formString(form, "confirm")) throw new ValidationError("Las contraseñas no coinciden.", { confirm: "No coincide" });
    await (await getServices()).auth.changePassword(session.session.id, session.user.id, formString(form, "currentPassword"), formString(form, "newPassword"), await requestMeta());
    revalidatePath("/cuenta");
    return { ok: true, message: "Contraseña cambiada. Cerramos tus sesiones en otros dispositivos." };
  });
}

export async function startMfaAction(_: ActionState): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireUser();
    const { secret, uri } = await (await getServices()).mfa.startEnrollment(session.user.id, session.user.email);
    const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { ok: true, data: { secret, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` } };
  });
}

export async function confirmMfaAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireUser();
    const services = await getServices();
    const codes = await services.mfa.confirmEnrollment(session.user.id, formString(form, "code").replace(/\s/g, ""));
    await services.auth.onMfaChanged(session.user.id, true, await requestMeta());
    return { ok: true, message: "Verificación en dos pasos activada.", data: { recoveryCodes: codes } };
  });
}

async function reauth(form: FormData) {
  const session = await requireUser();
  const services = await getServices();
  await services.auth.reauthenticate(session.session.id, session.user.id, formString(form, "password"), await requestMeta());
  return { session, services };
}

export async function disableMfaAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { session, services } = await reauth(form);
    await services.mfa.disable(session.user.id);
    await services.auth.onMfaChanged(session.user.id, false, await requestMeta());
    revalidatePath("/cuenta");
    return { ok: true, message: "Verificación en dos pasos desactivada." };
  });
}

export async function regenerateCodesAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { session, services } = await reauth(form);
    const codes = await services.mfa.regenerateRecoveryCodes(session.user.id);
    return { ok: true, message: "Códigos nuevos generados. Los anteriores dejaron de servir.", data: { recoveryCodes: codes } };
  });
}

export async function revokeSessionAction(form: FormData): Promise<void> {
  const session = await requireUser();
  await (await getServices()).sessions.revokeOwn(session.user.id, formString(form, "sessionId"));
  revalidatePath("/cuenta");
}

export async function revokeOtherSessionsAction(): Promise<void> {
  const session = await requireUser();
  await (await getServices()).sessions.revokeAll(session.user.id, session.session.id);
  revalidatePath("/cuenta");
}

/** Reautenticación y descarga de los datos personales (acceso y portabilidad). */
export async function exportDataAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    await reauth(form);
  });
  if (!result.ok) return result;
  redirect("/api/cuenta/datos");
}

export async function deleteAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    if (formString(form, "confirm") !== "ELIMINAR") throw new ValidationError("Escribí ELIMINAR para confirmar.", { confirm: "Requerido" });
    const { session, services } = await reauth(form);
    await services.privacy.eraseAccount(session.user.id, await requestMeta());
    await clearSessionCookie();
  });
  if (!result.ok) return result;
  redirect("/?cuenta-eliminada=1");
}
