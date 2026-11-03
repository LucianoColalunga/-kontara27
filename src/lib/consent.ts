/** Cookie de preferencias de consentimiento (necesaria: recuerda la elección). */
export const CONSENT_COOKIE = "consent";

export interface ConsentCookie {
  v: string;
  id: string;
  analytics: boolean;
  marketing: boolean;
}

export function parseConsent(raw: string | undefined): ConsentCookie | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentCookie>;
    if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(value.id)) return null;
    return { v: String(value.v ?? ""), id: value.id, analytics: value.analytics === true, marketing: value.marketing === true };
  } catch {
    return null;
  }
}
