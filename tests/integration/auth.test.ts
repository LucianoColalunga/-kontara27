import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hotp, base32Decode, timeStep } from "@/server/modules/identity/domain/totp";
import { InvalidCredentialsError, InvalidTokenError, SessionService } from "@/server/modules/identity";
import { RateLimitedError, ValidationError } from "@/server/platform/errors";
import { RATE_LIMITS } from "@/server/platform/rate-limit";
import { createVerifiedUser } from "@tests/support/factories";
import { createTestEnvironment, meta, type TestEnvironment } from "@tests/support/test-db";

const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s"&]+)/.exec(text)![1]!);

describe("autenticación", () => {
  let env: TestEnvironment;
  beforeAll(async () => {
    env = await createTestEnvironment();
  });
  afterAll(() => env.dispose());

  it("registro → verificación → login → sesión", async () => {
    await env.services.auth.register({ name: "Carla Gómez", email: "Carla@Example.test", password: "Tardes de otoño 2026", acceptTerms: true }, meta);
    const mail = env.email.sent.find((m) => m.to === "Carla@Example.test" && m.tag === "verification")!;
    expect(mail.text).toContain("https://app.test/verificar-correo?token=");
    // Antes de verificar: la contraseña correcta informa que falta confirmar el correo.
    await expect(env.services.auth.login({ email: "carla@example.test", password: "Tardes de otoño 2026" }, meta)).rejects.toThrow(/Confirmá tu correo/);
    await env.services.auth.verifyEmail(tokenFrom(mail.text), meta);
    await expect(env.services.auth.verifyEmail(tokenFrom(mail.text), meta)).rejects.toBeInstanceOf(InvalidTokenError);

    const login = await env.services.auth.login({ email: "CARLA@example.test", password: "Tardes de otoño 2026" }, meta);
    expect(login.status).toBe("authenticated");
    const resolved = await env.services.sessions.resolve(login.session.token);
    expect(resolved?.user.name).toBe("Carla Gómez");
    // La base guarda el hash del token, nunca el token.
    expect(login.session.sessionId).toBe(SessionService.idFromToken(login.session.token));
    expect(login.session.sessionId).not.toContain(login.session.token);
  });

  it("no revela si un correo existe", async () => {
    const user = await createVerifiedUser(env);
    const unknown = env.services.auth.login({ email: "nadie@example.test", password: "Cualquier clave 123" }, meta);
    const wrong = env.services.auth.login({ email: user.email, password: "Clave equivocada 123" }, meta);
    const [a, b] = await Promise.allSettled([unknown, wrong]);
    expect(a.status === "rejected" && a.reason).toBeInstanceOf(InvalidCredentialsError);
    expect(b.status === "rejected" && b.reason).toBeInstanceOf(InvalidCredentialsError);
    expect((a as PromiseRejectedResult).reason.userMessage).toBe((b as PromiseRejectedResult).reason.userMessage);

    // Registrarse con un correo existente responde igual y avisa al dueño por correo.
    const before = env.email.sent.length;
    await expect(env.services.auth.register({ name: "Impostor", email: user.email, password: "Otra clave segura 99", acceptTerms: true }, meta)).resolves.toBeUndefined();
    expect(env.email.sent.slice(before).map((m) => m.tag)).toEqual(["account_exists"]);
  });

  it("limita los correos de alta que recibe una misma dirección, aunque cambie la IP", async () => {
    // El primer intento crea la cuenta y los siguientes la encuentran: todos cuentan igual (no revela si existe).
    const attempt = (i: number) => env.services.auth.register({ name: "Julia Paz", email: "limite-alta@example.test", password: "Tardes de otoño 2026", acceptTerms: true }, { ip: `203.0.113.${i}`, userAgent: "t" });
    const before = env.email.sent.length;
    for (let i = 0; i < RATE_LIMITS.registerByEmail.limit; i++) await attempt(i);
    await expect(attempt(99)).rejects.toBeInstanceOf(RateLimitedError);
    expect(env.email.sent.length - before).toBe(RATE_LIMITS.registerByEmail.limit);
  });

  it("limita los intentos por cuenta", async () => {
    const user = await createVerifiedUser(env);
    let limited = false;
    for (let i = 0; i < 12; i++) {
      try {
        await env.services.auth.login({ email: user.email, password: `mala-${i}-clave-x` }, { ip: `198.51.100.${i}`, userAgent: "t" });
      } catch (error) {
        if (error instanceof RateLimitedError) {
          limited = true;
          break;
        }
      }
    }
    expect(limited).toBe(true);
    // Incluso con la contraseña correcta, mientras dure la ventana.
    await expect(env.services.auth.login({ email: user.email, password: user.password }, meta)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("rechaza contraseñas débiles", async () => {
    await expect(env.services.auth.register({ name: "Débil", email: "debil@example.test", password: "1234567890", acceptTerms: true }, meta)).rejects.toBeInstanceOf(ValidationError);
    await expect(env.services.auth.register({ name: "Sin términos", email: "t@example.test", password: "Tardes de otoño 2026" }, meta)).rejects.toThrow(/términos/);
  });

  it("recuperación: token de un solo uso, revoca sesiones y avisa", async () => {
    const user = await createVerifiedUser(env);
    const login = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    await env.services.auth.requestPasswordReset(user.email, meta);
    await env.services.auth.requestPasswordReset("inexistente@example.test", meta); // misma respuesta, sin correo
    const resetMails = env.email.sent.filter((m) => m.tag === "password_reset" && m.to === user.email);
    expect(resetMails).toHaveLength(1);
    expect(env.email.sent.some((m) => m.to === "inexistente@example.test")).toBe(false);
    const token = tokenFrom(resetMails[0]!.text);
    // Una contraseña débil no gasta el enlace.
    await expect(env.services.auth.resetPassword(token, "corta", meta)).rejects.toBeInstanceOf(ValidationError);
    await env.services.auth.resetPassword(token, "Nueva frase de acceso 2027", meta);
    await expect(env.services.auth.resetPassword(token, "Otra frase de acceso 2028", meta)).rejects.toBeInstanceOf(InvalidTokenError);
    expect(await env.services.sessions.resolve(login.session.token)).toBeNull();
    await expect(env.services.auth.login({ email: user.email, password: user.password }, meta)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect((await env.services.auth.login({ email: user.email, password: "Nueva frase de acceso 2027" }, meta)).status).toBe("authenticated");
    expect(env.email.sent.some((m) => m.tag === "password_changed" && m.to === user.email)).toBe(true);
  });

  it("dos usos simultáneos del mismo token: solo uno gana", async () => {
    const user = await createVerifiedUser(env);
    await env.services.auth.requestPasswordReset(user.email, meta);
    const token = tokenFrom(env.email.sent.filter((m) => m.tag === "password_reset" && m.to === user.email).at(-1)!.text);
    const results = await Promise.allSettled([env.services.auth.resetPassword(token, "Primera frase segura 11", meta), env.services.auth.resetPassword(token, "Segunda frase segura 22", meta)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("MFA TOTP: alta, login en dos pasos, rotación de sesión y códigos de recuperación", async () => {
    const user = await createVerifiedUser(env);
    const { secret } = await env.services.mfa.startEnrollment(user.id, user.email);
    const code = () => hotp(base32Decode(secret), timeStep(env.clock.now()));
    await expect(env.services.mfa.confirmEnrollment(user.id, "000000")).rejects.toBeInstanceOf(ValidationError);
    const recovery = await env.services.mfa.confirmEnrollment(user.id, code());
    expect(recovery).toHaveLength(10);

    env.clock.advance(31_000);
    const first = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    expect(first.status).toBe("mfa_required");
    // La sesión provisoria no sirve para la app.
    expect((await env.services.sessions.resolve(first.session.token))?.session.mfaSatisfied).toBe(false);
    await expect(env.services.auth.completeMfa(first.session.token, "123456", meta)).rejects.toBeInstanceOf(ValidationError);
    const full = await env.services.auth.completeMfa(first.session.token, code(), meta);
    expect(full.token).not.toBe(first.session.token);
    expect(await env.services.sessions.resolve(first.session.token)).toBeNull();
    expect((await env.services.sessions.resolve(full.token))?.session.mfaSatisfied).toBe(true);

    // El mismo código no se acepta dos veces; un código de recuperación sirve una sola vez.
    const second = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    await expect(env.services.auth.completeMfa(second.session.token, code(), meta)).rejects.toBeInstanceOf(ValidationError);
    await env.services.auth.completeMfa(second.session.token, recovery[0]!, meta);
    const third = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    await expect(env.services.auth.completeMfa(third.session.token, recovery[0]!, meta)).rejects.toBeInstanceOf(ValidationError);
    expect(await env.services.mfa.remainingRecoveryCodes(user.id)).toBe(9);
  });

  it("cierra sesiones en otros dispositivos", async () => {
    const user = await createVerifiedUser(env);
    const a = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    const b = await env.services.auth.login({ email: user.email, password: user.password }, { ip: "192.0.2.1", userAgent: "otro" });
    expect(await env.services.sessions.list(user.id)).toHaveLength(2);
    await env.services.sessions.revokeAll(user.id, a.session.sessionId);
    expect(await env.services.sessions.resolve(a.session.token)).not.toBeNull();
    expect(await env.services.sessions.resolve(b.session.token)).toBeNull();
    // No se puede revocar la sesión de otra persona.
    const other = await createVerifiedUser(env);
    expect(await env.services.sessions.revokeOwn(other.id, a.session.sessionId)).toBe(false);
    expect(await env.services.sessions.resolve(a.session.token)).not.toBeNull();
  });

  it("las sesiones vencen", async () => {
    const user = await createVerifiedUser(env);
    const login = await env.services.auth.login({ email: user.email, password: user.password }, meta);
    env.clock.advance(15 * 24 * 60 * 60 * 1000);
    expect(await env.services.sessions.resolve(login.session.token)).toBeNull();
  });
});
