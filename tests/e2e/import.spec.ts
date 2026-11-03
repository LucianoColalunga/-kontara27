import { expect, test } from "@playwright/test";
import { monthlyTemplateFixture } from "../support/xlsx-builder";
import { newOwner } from "./support/helpers";

test("importar una planilla: revisar, excluir con motivo, confirmar y conciliar", async ({ page }) => {
  const { slug } = await newOwner(page, "importa");
  await page.goto(`/app/${slug}/importar`);
  await page.getByLabel(/Elegí tu planilla/).setInputFiles({ name: "plantilla-sintetica.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(monthlyTemplateFixture()) });
  await page.getByRole("button", { name: "Analizar planilla" }).click();
  await page.waitForURL(/\/importar\/[0-9a-f-]{36}$/);

  // La fila incompleta bloquea la confirmación: no se inventa el importe que falta.
  await expect(page.getByRole("link", { name: "Con errores (1)" })).toBeVisible();
  await page.getByRole("link", { name: "Con errores (1)" }).click();
  await page.getByText("Pendiente de cargar importe", { exact: true }).click();
  await page.getByLabel("Motivo para excluir (queda en el informe)").fill("Fila sin importe en la planilla; se carga aparte.");
  await page.getByRole("button", { name: "Excluir fila" }).click();
  await expect(page.getByRole("link", { name: "Con errores (0)" })).toBeVisible();

  await page.getByRole("button", { name: /Confirmar importación de 7 movimientos/ }).click();
  await page.waitForURL(/\?confirmada=1/);
  await expect(page.getByText("Importación confirmada y conciliada")).toBeVisible();

  await page.goto(`/app/${slug}/movimientos?desde=2026-03-01&hasta=2026-04-30`);
  await expect(page.getByText("Reparación de equipo")).toBeVisible();
  await expect(page.getByText("Pendiente de cargar importe")).toHaveCount(0);
});
