import { expect, test, type Page } from "@playwright/test";
import { createMovement, newOwner } from "./support/helpers";

async function horizontalOverflow(page: Page, path: string): Promise<number> {
  await page.goto(path);
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test("páginas públicas sin desplazamiento horizontal en el celular", async ({ page }) => {
  for (const path of ["/", "/ingresar", "/registrarse", "/recuperar", "/legal/privacidad", "/legal/terminos", "/legal/cookies", "/marca", "/offline"]) {
    expect(await horizontalOverflow(page, path), `desborde horizontal en ${path}`).toBeLessThanOrEqual(0);
  }
});

test("en el celular no hay desplazamiento horizontal y la navegación inferior lleva a todo", async ({ page }) => {
  const { slug } = await newOwner(page, "celular");
  // Con datos: las tablas y gráficos tienen contenido real que medir.
  await createMovement(page, slug, { type: "Ingreso", amount: "1.250.000,00", category: "Ventas", description: "Cobro de un proyecto con una descripción bastante larga para medir" });
  for (const path of ["", "/movimientos", "/movimientos/nuevo", "/cuentas", "/presupuestos", "/reportes", "/vencimientos", "/importar", "/mas", "/equipo", "/equipo/auditoria", "/configuracion", "/notificaciones"]) {
    expect(await horizontalOverflow(page, `/app/${slug}${path}`), `desborde horizontal en ${path || "/"}`).toBeLessThanOrEqual(0);
  }
  expect(await horizontalOverflow(page, "/cuenta"), "desborde horizontal en /cuenta").toBeLessThanOrEqual(0);

  await page.goto(`/app/${slug}`);
  const nav = page.getByRole("navigation", { name: "Navegación", exact: true });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: /Más/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${slug}/mas`));
  await expect(page.getByRole("link", { name: /Reportes/ })).toBeVisible();
});
