import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractMonthlySheets, extractTabular } from "@/server/modules/importing/domain/extract";
import { monthFromSheetName, normalizeLabel, suggestCategoryName } from "@/server/modules/importing/domain/text";
import { parseLooseDate, validateRows } from "@/server/modules/importing/domain/validate-rows";
import { readWorkbook, serialToIsoDate, WorkbookReadError } from "@/server/modules/importing/infrastructure/xlsx-reader";
import { neutralizeFormula, writeWorkbook } from "@/server/modules/importing/infrastructure/xlsx-writer";
import { buildXlsx, monthlyTemplateFixture } from "@tests/support/xlsx-builder";

describe("lector XLSX", () => {
  it("lee números exactos, fechas, textos y fórmulas", () => {
    const wb = readWorkbook(buildXlsx([{ name: "Hoja", cells: { A1: { v: "2026-05-14", date: true }, B1: "Hosting", C1: "13579.29", D1: { f: "SUM(C1:C1)", v: "13579.29" } } }]));
    const sheet = wb.sheets[0]!;
    expect(sheet.cells.get("A1")).toMatchObject({ type: "date", value: "2026-05-14" });
    expect(sheet.cells.get("B1")).toMatchObject({ type: "string", value: "Hosting" });
    expect(sheet.cells.get("C1")).toMatchObject({ type: "number", value: "13579.29" });
    expect(sheet.cells.get("D1")).toMatchObject({ formula: "SUM(C1:C1)", value: "13579.29" });
  });

  it("reconoce fórmulas compartidas (arrastradas) y les asigna el texto de la maestra", () => {
    const wb = readWorkbook(
      buildXlsx([
        {
          name: "JUNIO",
          cells: {
            A1: "Fecha", B1: "Categoria", C1: "Descripcion", D1: "Gasto", E1: "Ingreso",
            A2: { v: "2026-06-23", date: true }, B2: "Insumos", C2: "Compra", D2: 580,
            J11: "Servicios", K11: { f: "SUMIFS($D$2:$D99,$B$2:$B99,J11)", v: 0, shared: { si: 0, ref: "K11:K12" } },
            J12: "Insumos", K12: { v: 580, shared: { si: 0 } },
          },
        },
      ]),
    );
    const follower = wb.sheets[0]!.cells.get("K12")!;
    expect(follower).toMatchObject({ formula: "SUMIFS($D$2:$D99,$B$2:$B99,J11)", formulaShared: true, value: "580" });
    // El resumen por categoría cubre todo: no debe informar una diferencia inexistente.
    expect(extractMonthlySheets(wb)!.findings.map((f) => f.code)).not.toContain("CATEGORY_SUMMARY_GAP");
  });

  it("convierte números de serie de Excel a fecha (incluido el bisiesto ficticio de 1900)", () => {
    expect(serialToIsoDate(46262, false)).toBe("2026-08-28");
    expect(serialToIsoDate(61, false)).toBe("1900-03-01");
    expect(serialToIsoDate(0, false)).toBeNull();
  });

  it("rechaza archivos que no son xlsx, con DOCTYPE o con compresión sospechosa", () => {
    expect(() => readWorkbook(strToU8("hola"))).toThrow(WorkbookReadError);
    const xxe = zipSync({ "xl/workbook.xml": strToU8('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><workbook/>') });
    expect(() => readWorkbook(xxe)).toThrow(/no permitidas/);
    const bomb = zipSync({ "xl/workbook.xml": strToU8("<workbook/>"), "xl/worksheets/sheet1.xml": new Uint8Array(30 * 1024 * 1024) }, { level: 9 });
    expect(() => readWorkbook(bomb)).toThrow(/compresión sospechosa|demasiado grande/);
  });

  it("el escritor produce un libro que el lector vuelve a leer y neutraliza fórmulas", () => {
    const bytes = writeWorkbook([{ name: "Movimientos", columns: [{ header: "Fecha" }, { header: "Descripción" }, { header: "Importe" }], rows: [[{ kind: "date", value: "2026-10-31" }, { kind: "text", value: "=HYPERLINK(\"http://x\")" }, { kind: "number", value: "-9400.00" }]] }], { title: "t", creator: "c" });
    const sheet = readWorkbook(bytes).sheets[0]!;
    expect(sheet.cells.get("A1")?.value).toBe("Fecha");
    expect(sheet.cells.get("B2")?.value).toBe("'=HYPERLINK(\"http://x\")");
    expect(sheet.cells.get("C2")).toMatchObject({ type: "number", value: "-9400.00" });
    expect(neutralizeFormula("+5")).toBe("'+5");
    expect(neutralizeFormula("Pago")).toBe("Pago");
  });
});

describe("textos y fechas", () => {
  it("reconoce meses y normaliza etiquetas", () => {
    expect(monthFromSheetName("SEPTIEMBRE")).toBe(9);
    expect(monthFromSheetName("Setiembre")).toBe(9);
    expect(monthFromSheetName("TOTAL")).toBeNull();
    expect(normalizeLabel("  Programación  ")).toBe("programacion");
    expect(suggestCategoryName("Trasporte")).toBe("Transporte");
    expect(suggestCategoryName("Programacion ")).toBe("Programación");
  });

  it("interpreta fechas escritas como texto", () => {
    expect(parseLooseDate("15/08/2026")).toBe("2026-08-15");
    expect(parseLooseDate("2026-08-15")).toBe("2026-08-15");
    expect(parseLooseDate("31/02/2026")).toBeNull();
  });
});

describe("plantilla de hojas mensuales", () => {
  const extraction = extractMonthlySheets(readWorkbook(monthlyTemplateFixture()))!;

  it("extrae todas las filas con contenido y su referencia de origen", () => {
    expect(extraction.format).toBe("monthly_sheets");
    expect(extraction.rows.map((r) => r.sourceRef)).toEqual(["MARZO!2", "MARZO!3", "MARZO!4", "MARZO!5", "ABRIL!2", "ABRIL!3", "ABRIL!4", "ABRIL!5"]);
    expect(extraction.detectedYear).toBe(2026);
  });

  it("detecta los errores de fórmula de la planilla", () => {
    const codes = extraction.findings.map((f) => `${f.code}:${f.sheet}`);
    expect(codes).toContain("TOTAL_HARDCODED:ABRIL");
    expect(codes).toContain("NET_MISMATCH:ABRIL");
    expect(codes).toContain("SUM_RANGE_SKIPS_ROWS:ABRIL");
    expect(codes).toContain("TOTAL_SHEET_SCOPE:TOTAL");
    expect(codes).toContain("WORKBOOK_TOTAL_MISMATCH:TOTAL");
    expect(codes).toContain("CATEGORY_SUMMARY_GAP:MARZO");
    const net = extraction.findings.find((f) => f.code === "WORKBOOK_TOTAL_MISMATCH")!;
    expect(net.impact).toBe("-22200");
  });

  it("valida cada fila sin inventar datos", () => {
    const drafts = validateRows(extraction.rows, { currency: "ARS" });
    const byRef = Object.fromEntries(drafts.map((d) => [d.sourceRef, d]));
    expect(byRef["MARZO!2"]).toMatchObject({ status: "ready", kind: "income", amountMinor: 4500000n });
    expect(byRef["MARZO!3"]).toMatchObject({ kind: "expense", amountMinor: 1250050n });
    expect(byRef["MARZO!4"]).toMatchObject({ categoryLabel: "Servicios", description: "Hosting" });
    expect(byRef["MARZO!5"]!.issues.map((i) => i.code)).toContain("POSSIBLE_REFUND");
    expect(byRef["ABRIL!4"]).toMatchObject({ status: "blocked", amountMinor: null, occurredOn: null });
    expect(byRef["ABRIL!5"]!.issues.map((i) => i.code)).toContain("DATE_SHEET_MISMATCH");
  });

  it("señala duplicados dentro del archivo y contra movimientos existentes", () => {
    const rows = extraction.rows.slice(0, 1);
    const twice = validateRows([rows[0]!, { ...rows[0]!, position: 2, sourceRef: "MARZO!9" }], { currency: "ARS" });
    expect(twice[1]!.issues.map((i) => i.code)).toContain("DUPLICATE_IN_FILE");
    const existing = validateRows(rows, { currency: "ARS", existingKeys: new Set(["2026-03-02|income|4500000|reparacion de equipo"]) });
    expect(existing[0]!.issues.map((i) => i.code)).toContain("DUPLICATE_EXISTING");
  });

  it("bloquea importes en ambas columnas, texto en importes y exceso de decimales", () => {
    const wb = readWorkbook(buildXlsx([{ name: "MAYO", cells: { A1: "Fecha", B1: "Categoria", C1: "Descripcion", D1: "Gasto", E1: "Ingreso", A2: { v: "2026-05-01", date: true }, B2: "X", C2: "a", D2: 10, E2: 20, A3: { v: "2026-05-02", date: true }, B3: "X", C3: "b", D3: "diez", A4: { v: "2026-05-03", date: true }, B4: "X", C4: "c", D4: "1.005" } }]));
    const drafts = validateRows(extractMonthlySheets(wb)!.rows, { currency: "ARS" });
    expect(drafts.map((d) => d.issues.find((i) => i.severity === "error")?.code)).toEqual(["AMOUNT_BOTH", "AMOUNT_NOT_NUMERIC", "AMOUNT_PRECISION"]);
  });
});

describe("plantilla tabular", () => {
  it("usa el signo del importe para distinguir ingresos de gastos", () => {
    const wb = readWorkbook(buildXlsx([{ name: "Banco", cells: { A1: "Fecha", B1: "Concepto", C1: "Importe", A2: { v: "2026-01-02", date: true }, B2: "Cobro cliente", C2: 1500, A3: { v: "2026-01-03", date: true }, B3: "Pago proveedor", C3: -700 } }]));
    const drafts = validateRows(extractTabular(wb)!.rows, { currency: "ARS" });
    expect(drafts.map((d) => [d.kind, d.amountMinor])).toEqual([["income", 150000n], ["expense", 70000n]]);
  });
});
