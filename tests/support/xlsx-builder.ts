import { strToU8, zipSync } from "fflate";

/**
 * Construye .xlsx sintéticos con fórmulas y valores en caché, como los que guarda Excel.
 * Sirve para probar el lector y el importador sin usar planillas reales de clientes.
 */
export interface FixtureCell {
  /** número (texto exacto), texto, o fecha ISO si `date` es true. */
  v?: string | number;
  f?: string;
  date?: boolean;
}

export interface FixtureSheet {
  name: string;
  cells: Record<string, FixtureCell | string | number>;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function isoToSerial(iso: string) {
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 31)) / 86_400_000);
  return days >= 60 ? days + 1 : days;
}

export function buildXlsx(sheets: FixtureSheet[], options: { creator?: string } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = (s: string) => {
    const i = shared.indexOf(s);
    if (i >= 0) return i;
    shared.push(s);
    return shared.length - 1;
  };
  const sheetXml = (sheet: FixtureSheet) => {
    const byRow = new Map<number, string[]>();
    const entries = Object.entries(sheet.cells).sort(([a], [b]) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]) || a.localeCompare(b));
    for (const [ref, input] of entries) {
      const cell: FixtureCell = typeof input === "object" ? input : { v: input };
      const row = Number(/\d+/.exec(ref)![0]);
      const f = cell.f ? `<f>${esc(cell.f)}</f>` : "";
      let xml: string;
      if (cell.date && typeof cell.v === "string") xml = `<c r="${ref}" s="1">${f}<v>${isoToSerial(cell.v)}</v></c>`;
      else if (typeof cell.v === "number" || (typeof cell.v === "string" && /^-?\d+(\.\d+)?$/.test(cell.v))) xml = `<c r="${ref}">${f}<v>${cell.v}</v></c>`;
      else if (typeof cell.v === "string") xml = `<c r="${ref}" t="s">${f}<v>${sharedIndex(cell.v)}</v></c>`;
      else xml = `<c r="${ref}">${f}</c>`;
      byRow.set(row, [...(byRow.get(row) ?? []), xml]);
    }
    const rows = [...byRow.entries()].map(([r, cells]) => `<row r="${r}">${cells.join("")}</row>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  };
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="d/MM/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>${esc(options.creator ?? "Microsoft Office User")}</dc:creator></cp:coreProperties>`),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  // sharedStrings se arma después de recorrer todas las hojas.
  files["xl/sharedStrings.xml"] = strToU8(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

/**
 * Libro sintético con la estructura típica de una plantilla mensual (datos inventados):
 * dos meses con movimientos, un «AHORROS» escrito a mano, una suma que arranca en la fila 7,
 * un TOTAL que omite meses, una fila incompleta y una devolución cargada como ingreso.
 */
export function monthlyTemplateFixture(): Uint8Array {
  const header = { A1: "Fecha", B1: "Categoria", C1: "Descripcion", D1: "Gasto", E1: "Ingreso" };
  const empty = (name: string): FixtureSheet => ({ name, cells: { ...header, G31: "GASTOS TOTALES", I31: { f: "SUM(D2:D99)", v: 0 }, G32: "INGRESOS TOTALES", I32: { f: "SUM(E2:E99)", v: 0 }, G33: "AHORROS", I33: { f: "I32-I31", v: 0 } } });
  const marzo: FixtureSheet = {
    name: "MARZO",
    cells: {
      ...header,
      A2: { v: "2026-03-02", date: true }, B2: "Servicio técnico", C2: "Reparación de equipo", D2: 0, E2: 45000,
      A3: { v: "2026-03-05", date: true }, B3: "Insumos", C3: "Compra de etiquetas", D3: "12500.5", E3: 0,
      A4: { v: "2026-03-09", date: true }, B4: "Servicios ", C4: "Hosting ", D4: "9999.99",
      A5: { v: "2026-03-20", date: true }, B5: "Insumos", C5: "Devolucion de etiquetas", E5: "12500.5",
      J10: "GASTOS", K10: "TOTAL", K11: { f: "SUMIFS($D$2:$D99,$B$2:$B99,J11)", v: "9999.99" }, J11: "Servicios ",
      G31: "GASTOS TOTALES", I31: { f: "SUM(D2:D99)", v: "22500.49" },
      G32: "INGRESOS TOTALES", I32: { f: "SUM(E2:E99)", v: "57500.5" },
      G33: "AHORROS", I33: { f: "I32-I31", v: "35000.01" },
    },
  };
  const abril: FixtureSheet = {
    name: "ABRIL",
    cells: {
      ...header,
      A2: { v: "2026-04-01", date: true }, B2: "Servicio técnico", C2: "Soporte mensual", E2: 30000,
      A3: { v: "2026-04-03", date: true }, B3: "Servicios ", C3: "Luz", D3: "7000",
      C4: "Pendiente de cargar importe",
      A5: { v: "2026-03-28", date: true }, B5: "Insumos", C5: "Cable", D5: 800,
      G40: "GASTOS TOTALES", I40: { f: "SUM(D3:D108)", v: "7800" },
      G41: "INGRESOS TOTALES", I41: { f: "SUM(E2:E108)", v: "30000" },
      G42: "AHORROS", I42: 0,
    },
  };
  const total: FixtureSheet = {
    name: "TOTAL",
    cells: {
      A3: "GASTOS TOTALES", C3: { f: "MARZO!I31+ABRIL!I40", v: "30300.49" },
      A4: "INGRESOS TOTALES", C4: { f: "MARZO!I32+ABRIL!I41", v: "87500.5" },
      A6: "DIFERENCIA TOTAL", C6: { f: "MARZO!I33+ABRIL!I42", v: "35000.01" },
    },
  };
  return buildXlsx([empty("ENERO"), empty("FEBRERO"), marzo, abril, total, { name: "Config", cells: { G1: "INGRESOS", G2: "Servicio técnico", I1: "GASTOS", I2: "Insumos", I3: "Servicios " } }]);
}
