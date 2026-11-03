"use server";

import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { getServices } from "@/server/container";
import { type ActionState, runAction } from "@/server/http/action";
import { getSession, requestMeta } from "@/server/http/session";
import { randomToken } from "@/server/platform/crypto";
import { env } from "@/server/platform/env";
import { COOKIE_POLICY_VERSION, resolveJurisdiction } from "@/server/modules/privacy";

/** Guarda la elección en la cookie y deja constancia en la base (prueba del consentimiento). */
export async function saveConsentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const store = await cookies();
    const previous = parseConsent(store.get(CONSENT_COOKIE)?.value);
    const choice = { analytics: form.get("analytics") === "on", marketing: form.get("marketing") === "on" };
    const id = previous?.id ?? randomToken(18);
    const session = await getSession();
    const meta = await requestMeta();
    await (await getServices()).privacy.recordConsent(id, session?.user.id ?? null, choice, resolveJurisdiction(session?.user.residenceCountry), meta.userAgent);
    store.set(CONSENT_COOKIE, JSON.stringify({ v: COOKIE_POLICY_VERSION, id, ...choice }), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: env().APP_URL.startsWith("https://"), httpOnly: true });
    return { ok: true, message: "Preferencias guardadas." };
  });
}
