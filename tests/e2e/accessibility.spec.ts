import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createMovement, newOwner } from "./support/helpers";

/** Reglas automáticas de WCAG 2.2 A/AA. No reemplazan una revisión manual con lector de pantalla. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function audit(page: Page, path: string): Promise<string[]> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return violations.map((v) => `${path} · ${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join(" | ")}`);
}

// Cada página carga y pasa por axe: más lento que el resto de las pruebas.
test.describe.configure({ timeout: 240_000 });

test("páginas públicas sin violaciones WCAG 2.2 AA detectables", async ({ page }) => {
  const problems: string[] = [];
  for (const path of ["/ingresar", "/registrarse", "/recuperar", "/verificar-correo", "/legal/privacidad", "/legal/terminos", "/legal/cookies", "/marca", "/offline"]) {
    problems.push(...(await audit(page, path)));
  }
  expect(problems).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`aplicación sin violaciones WCAG 2.2 AA detectables, tema ${theme === "light" ? "claro" : "oscuro"}`, async ({ page, context, baseURL }) => {
    const { slug } = await newOwner(page, `a11y-${theme}`);
    await createMovement(page, slug, { type: "Ingreso", amount: "1.500,00", category: "Ventas", description: "Cobro para revisar accesibilidad" });
    await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    const problems: string[] = [];
    for (const path of ["", "/movimientos", "/movimientos/nuevo", "/cuentas", "/presupuestos", "/reportes", "/vencimientos", "/importar", "/equipo", "/equipo/auditoria", "/configuracion", "/notificaciones"]) {
      problems.push(...(await audit(page, `/app/${slug}${path}`)));
    }
    problems.push(...(await audit(page, "/cuenta")));
    expect(problems).toEqual([]);
  });
}
