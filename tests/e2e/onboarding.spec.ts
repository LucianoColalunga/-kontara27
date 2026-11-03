import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createMovement, newOwner } from "./support/helpers";

test("alta completa: registro, correo, empresa, movimientos, panel, reportes y exportación", async ({ page }) => {
  const { slug } = await newOwner(page, "alta", "Taller Norte E2E");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola");

  await createMovement(page, slug, { type: "Ingreso", amount: "1.234,56", category: "Ventas", description: "Venta de mostrador E2E" });
  // Por rol: el anunciador de rutas de Next.js repite el título de la página y getByText lo encontraría dos veces.
  await expect(page.getByRole("heading", { level: 1, name: "Venta de mostrador E2E" })).toBeVisible();
  await createMovement(page, slug, { type: "Gasto", amount: "234,56", category: "Proveedores", description: "Compra a proveedor E2E" });

  // Panel: resultado del mes = ingresos − gastos, con decimales exactos.
  await page.goto(`/app/${slug}`);
  await expect(page.getByText(/1\.000,00/).first()).toBeVisible();

  // Listado con búsqueda.
  await page.goto(`/app/${slug}/movimientos?q=proveedor`);
  await expect(page.getByText("Compra a proveedor E2E")).toBeVisible();
  await expect(page.getByText("Venta de mostrador E2E")).toHaveCount(0);

  // Saldo de la caja.
  await page.goto(`/app/${slug}/cuentas`);
  await expect(page.getByText(/1\.000,00/).first()).toBeVisible();

  // Exportación CSV del listado completo: separador «;», coma decimal y los dos movimientos.
  await page.goto(`/app/${slug}/movimientos`);
  await page.getByText("Exportar").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "CSV" }).click()]);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Venta de mostrador E2E");
  expect(csv).toContain("1234,56");
  expect(csv).toContain("-234,56");

  // Salir y volver: la sesión se cierra y se vuelve a la página pedida al ingresar.
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/ingresar/);
  await page.goto(`/app/${slug}/reportes`);
  await expect(page).toHaveURL(new RegExp(`/ingresar\\?next=${encodeURIComponent(`/app/${slug}/reportes`)}`));
});
