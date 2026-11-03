import "server-only";
import { strToU8, zipSync } from "fflate";
import { columnLetters } from "./xlsx-reader";

/**
 * Escritor mínimo de .xlsx (exportaciones). Cadenas en línea (sin sharedStrings), estilos fijos
 * para encabezado, fecha e importes. Sanea los textos que empiezan con = + - @ para que Excel no
 * los interprete como fórmulas (inyección de fórmulas / CSV injection).
 */

export type XlsxValue =
  | { kind: "text"; value: string }
  | { kind: "number"; value: string; style?: "amount" | "integer" | "percent" }
  | { kind: "date"; value: string }
  | { kind: "empty" };

export interface XlsxSheet {
  name: string;
  columns: Array<{ header: string; width?: number }>;
  rows: XlsxValue[][];
  /** Filas de totales al final, en negrita. */
  footer?: XlsxValue[][];
}

const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function isoToSerial(iso: string): number {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  const days = Math.round((ms - Date.UTC(1899, 11, 31)) / 86_400_000);
  return days >= 60 ? days + 1 : days; // compensa el 29/02/1900 de Excel
}

// Índices de estilo (cellXfs): 0 normal, 1 encabezado, 2 fecha, 3 importe, 4 entero, 5 porcentaje, 6 importe en negrita, 7 texto en negrita.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00;[Red]-#,##0.00"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B1A2E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref: string, cell: XlsxValue, bold: boolean): string {
  switch (cell.kind) {
    case "empty":
      return "";
    case "text":
      return `<c r="${ref}" t="inlineStr"${bold ? ' s="7"' : ""}><is><t xml:space="preserve">${escape(neutralizeFormula(cell.value))}</t></is></c>`;
    case "date":
      return `<c r="${ref}" s="2"><v>${isoToSerial(cell.value)}</v></c>`;
    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(cell.value)) return `<c r="${ref}" t="inlineStr"><is><t>${escape(cell.value)}</t></is></c>`;
      const style = cell.style === "integer" ? 4 : cell.style === "percent" ? 5 : bold ? 6 : 3;
      return `<c r="${ref}" s="${style}"><v>${cell.value}</v></c>`;
    }
  }
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`).join("");
  const header = `<row r="1">${sheet.columns.map((c, i) => `<c r="${columnLetters(i + 1)}1" t="inlineStr" s="1"><is><t>${escape(c.header)}</t></is></c>`).join("")}</row>`;
  const body = [...sheet.rows.map((r) => ({ r, bold: false })), ...(sheet.footer ?? []).map((r) => ({ r, bold: true }))]
    .map(({ r, bold }, i) => `<row r="${i + 2}">${r.map((cell, j) => cellXml(`${columnLetters(j + 1)}${i + 2}`, cell, bold)).join("")}</row>`)
    .join("");
  const lastCol = columnLetters(Math.max(1, sheet.columns.length));
  const lastRow = sheet.rows.length + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${header}${body}</sheetData>${sheet.rows.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : ""}</worksheet>`;
}

export function writeWorkbook(sheets: XlsxSheet[], meta: { title: string; creator: string }): Uint8Array {
  const names = sheets.map((s, i) => s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja${i + 1}`);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escape(meta.title)}</dc:title><dc:creator>${escape(meta.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${escape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files, { level: 6 });
}
