import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { E2E_OUTBOX_DIR } from "../../../scripts/e2e/paths";

export const PASSWORD = "Mañanas de invierno 2026";

interface Mail {
  to: string;
  subject: string;
  text: string;
  tag: string;
}

let counter = 0;
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}@example.test`;
}

/** Fecha de hoy en la zona horaria de las empresas de prueba (AAAA-MM-DD). */
export function today(timeZone = "America/Argentina/Buenos_Aires"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Último correo de un tipo para un destinatario, leído del buzón local del servidor E2E. */
export async function waitForEmail(to: string, tag: string): Promise<Mail> {
  const dir = path.resolve(E2E_OUTBOX_DIR);
  for (let attempt = 0; attempt < 50; attempt++) {
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.includes(`-${tag}-`)).sort().reverse();
    for (const file of files) {
      const mail = JSON.parse(await readFile(path.join(dir, file), "utf8")) as Mail;
      if (mail.to === to) return mail;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No llegó el correo «${tag}» para ${to}`);
}

export function linkIn(mail: Mail, pathname: string): string {
  const match = /https?:\/\/\S+?\?token=[\w-]+/.exec(mail.text);
  if (!match || new URL(match[0]).pathname !== pathname) throw new Error(`El correo no tiene un enlace a ${pathname}`);
  return match[0];
}

export async function signUp(page: Page, user: { name: string; email: string }): Promise<void> {
  await page.goto("/registrarse");
  await page.getByLabel("Nombre y apellido").fill(user.name);
  await page.getByLabel("Correo electrónico").fill(user.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repetí la contraseña").fill(PASSWORD);
  await page.getByLabel("País de residencia").selectOption("AR");
  await page.getByRole("checkbox", { name: /Acepto los términos/ }).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(/Te enviamos un correo para confirmar tu cuenta/)).toBeVisible();
}

export async function confirmEmail(page: Page, email: string): Promise<void> {
  await page.goto(linkIn(await waitForEmail(email, "verification"), "/verificar-correo"));
  await page.getByRole("button", { name: "Confirmar mi correo" }).click();
  await expect(page).toHaveURL(/\/ingresar\?verificado=1/);
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith("/ingresar")) await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

export async function createCompany(page: Page, name: string): Promise<string> {
  await page.goto("/app/nueva");
  await page.getByLabel("Nombre comercial").fill(name);
  await page.getByRole("button", { name: "Crear empresa" }).click();
  await page.waitForURL(/\/app\/[a-z0-9-]+\?bienvenida=1/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

/** Usuario nuevo, verificado, con sesión iniciada y una empresa propia. */
export async function newOwner(page: Page, label: string, company = `Empresa ${label}`): Promise<{ email: string; slug: string }> {
  const email = uniqueEmail(label);
  await signUp(page, { name: `Persona ${label}`, email });
  await confirmEmail(page, email);
  await signIn(page, email);
  await page.waitForURL(/\/app\/nueva/);
  return { email, slug: await createCompany(page, company) };
}

export async function createMovement(page: Page, slug: string, movement: { type: string; amount: string; description: string; category?: string; date?: string }): Promise<string> {
  await page.goto(`/app/${slug}/movimientos/nuevo`);
  await page.getByLabel("Tipo").selectOption({ label: movement.type });
  await page.getByLabel("Fecha").fill(movement.date ?? today());
  await page.getByLabel("Importe").fill(movement.amount);
  if (movement.category) await page.getByLabel("Categoría").selectOption({ label: movement.category });
  // Cuenta que crea el alta de la empresa (las de prueba son argentinas, en pesos).
  await page.getByLabel("Cuenta o caja").selectOption({ label: "Caja (ARS)" });
  await page.getByLabel("Descripción").fill(movement.description);
  await page.getByRole("button", { name: "Guardar movimiento" }).click();
  await page.waitForURL(/\/movimientos\/[0-9a-f-]{36}\?creado=1/);
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
