import { expect, test } from "@playwright/test";
import { E2E_PORT } from "../../scripts/e2e/paths";
import { newOwner, PASSWORD, signIn, uniqueEmail } from "./support/helpers";

test("cabeceras de seguridad y CSP estricta con nonce", async ({ request }) => {
  const response = await request.get("/ingresar");
  const headers = response.headers();
  const csp = headers["content-security-policy"]!;
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toMatch(/style-src 'self' 'nonce-/);
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("la página no tiene violaciones de CSP ni errores en consola", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  for (const path of ["/ingresar", "/registrarse", "/legal/cookies", "/marca"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(problems).toEqual([]);
});

test("ingreso: mismo mensaje para correo inexistente y contraseña incorrecta; cookie de sesión protegida", async ({ page, context }) => {
  const { email } = await newOwner(page, "seguridad");
  await page.getByRole("button", { name: "Salir" }).click();

  const failedLoginMessage = async (address: string, password: string) => {
    await page.goto("/ingresar");
    await signIn(page, address, password);
    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible();
    return alert.textContent();
  };
  const unknown = await failedLoginMessage(uniqueEmail("nadie"), "Una clave cualquiera 123");
  const wrong = await failedLoginMessage(email, "Clave equivocada 12345");
  expect(unknown).toBeTruthy();
  expect(unknown).toBe(wrong);

  // Destino externo en «next»: ni siquiera llega al formulario, y al ingresar se queda dentro de la app.
  await page.goto("/ingresar?next=//sitio-externo.example/robar");
  await expect(page.locator('input[name="next"]')).toHaveValue("/app");
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => url.pathname.startsWith("/app/"));
  expect(new URL(page.url()).host).toBe(`localhost:${E2E_PORT}`);

  const session = (await context.cookies()).find((c) => c.name === "sid" || c.name === "__Host-sid")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
});

test("las acciones del servidor rechazan envíos desde otro origen (CSRF)", async ({ page, request, baseURL }) => {
  const { email } = await newOwner(page, "csrf");
  // Reproduce el formulario real de ingreso (con los campos ocultos de React) como lo enviaría otro sitio.
  const html = await (await request.get("/ingresar")).text();
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes('name="email"'))!;
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const fields: Record<string, string> = {};
  for (const [tag] of form.matchAll(/<input\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    if (name && /type="hidden"/.test(tag)) fields[decode(name)] = decode(/value="([^"]*)"/.exec(tag)?.[1] ?? "");
  }
  const submit = (origin: string) => request.post("/ingresar", { headers: { Origin: origin }, multipart: { ...fields, email, password: PASSWORD }, maxRedirects: 0 });
  const sessionCookie = /(^|[\s,])(__Host-)?sid=[^;]/;

  const forged = await submit("https://sitio-externo.example");
  expect(forged.headers()["set-cookie"] ?? "").not.toMatch(sessionCookie);
  // Control: el mismo envío desde el propio origen sí inicia sesión, así que el rechazo anterior es por el origen.
  const legit = await submit(baseURL!);
  expect(legit.headers()["set-cookie"] ?? "").toMatch(sessionCookie);
});

test("las API exigen sesión y las descargas se sirven aisladas", async ({ page, request }) => {
  expect((await request.get("/api/cuenta/datos")).status()).toBe(401);
  expect((await request.get("/api/orgs/cualquiera/exports/movimientos?formato=csv")).status()).toBe(401);

  const { slug } = await newOwner(page, "descargas");
  const response = await page.request.get(`/api/orgs/${slug}/exports/movimientos?formato=csv`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect(response.headers()["content-security-policy"]).toContain("sandbox");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
