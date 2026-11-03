import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("destino después de ingresar", () => {
  it("acepta rutas internas con filtros", () => {
    expect(safeNext("/app/taller-norte/reportes?desde=2026-07-01&hasta=2026-11-30")).toBe("/app/taller-norte/reportes?desde=2026-07-01&hasta=2026-11-30");
    expect(safeNext("/invitacion?token=abc_DEF-123")).toBe("/invitacion?token=abc_DEF-123");
    expect(safeNext("/app/v1.2/x")).toBe("/app/v1.2/x");
  });

  it.each([
    "https://sitio.example",
    "//sitio.example",
    "/\\sitio.example",
    "\\\\sitio.example",
    "javascript:alert(1)",
    "app/taller-norte",
    "",
    "/app//sitio.example",
    "/.//sitio.example",
    "/app/../../sitio",
    "/app/./x",
    "/app\n//sitio.example",
    "/app\tx",
    "/api/cuenta/datos",
    "/api?x=1",
    "/app/taller-norte#fragmento",
  ])("rechaza %j", (value) => {
    expect(safeNext(value)).toBe("/app");
  });

  it("usa el destino alternativo pedido", () => {
    expect(safeNext("//sitio.example", "/cuenta")).toBe("/cuenta");
  });
});
