import { expect, test } from "@playwright/test";
import { createMovement, newOwner } from "./support/helpers";

test("una empresa nunca ve ni toca los datos de otra", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const a = await newOwner(pageA, "aislamiento-a");
  const movementA = await createMovement(pageA, a.slug, { type: "Ingreso", amount: "999,99", description: "Dato reservado de A" });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  const b = await newOwner(pageB, "aislamiento-b");

  // Páginas de A con la sesión de B: 404, sin revelar que la empresa existe.
  for (const path of [`/app/${a.slug}`, `/app/${a.slug}/movimientos`, `/app/${a.slug}/movimientos/${movementA}`, `/app/${a.slug}/reportes`, `/app/${a.slug}/equipo`]) {
    const response = await pageB.goto(path);
    expect(response?.status(), path).toBe(404);
  }
  // El movimiento de A pedido dentro de la empresa de B tampoco aparece; un id mal formado responde igual.
  expect((await pageB.goto(`/app/${b.slug}/movimientos/${movementA}`))?.status()).toBe(404);
  expect((await pageB.goto(`/app/${b.slug}/movimientos/no-es-un-id`))?.status()).toBe(404);
  expect((await pageB.goto(`/app/${b.slug}/importar/${movementA}`))?.status()).toBe(404);
  await pageB.goto(`/app/${b.slug}/movimientos?q=reservado`);
  await expect(pageB.getByText("Dato reservado de A")).toHaveCount(0);

  // API de exportación de A con la sesión de B.
  for (const path of [`/api/orgs/${a.slug}/exports/movimientos?formato=csv`, `/api/orgs/${a.slug}/exports/reportes?tipo=estado&formato=csv`]) {
    const response = await pageB.request.get(path);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toContain("reservado");
  }

  await contextA.close();
  await contextB.close();
});
