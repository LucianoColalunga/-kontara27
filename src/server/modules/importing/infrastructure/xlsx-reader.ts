import "server-only";
import { unzipSync } from "fflate";

/**
 * Lector mínimo de Office Open XML (.xlsx) sobre fflate, sin dependencias transitivas.
 *
 * Seguridad (el archivo lo sube un usuario):
 *  - límite de tamaño descomprimido total y por parte, y de relación de compresión (zip bombs);
 *  - solo se descomprimen las partes que se usan;
 *  - el XML se recorre con expresiones acotadas: no hay DTD ni entidades externas (XXE imposible),
 *    y un DOCTYPE hace fallar la lectura;
 *  - los números se conservan como el texto exacto del XML: «13579.29» nunca pasa por coma flotante.
 */

export type CellType = "number" | "string" | "boolean" | "error" | "date";

export interface Cell {
  ref: string;
  row: number;
  col: number;
  type: CellType;
  /** Texto exacto: el número tal como está en el XML, el texto ya decodificado, o la fecha ISO (YYYY-MM-DD). */
  value: string;
  formula: string | null;
  /**
   * true si la celda pertenece a una fórmula compartida (Excel guarda así las fórmulas arrastradas):
   * `formula` tiene el texto de la celda maestra, sin desplazar referencias relativas.
   */
  formulaShared?: boolean;
  numberFormat: string | null;
}

export interface Sheet {
  name: string;
  state: "visible" | "hidden" | "veryHidden";
  cells: Map<string, Cell>;
  maxRow: number;
  maxCol: number;
}

export interface Workbook {
  sheets: Sheet[];
  date1904: boolean;
  application: string | null;
  creator: string | null;
}

export class WorkbookReadError extends Error {}

const LIMITS = { totalUncompressed: 60 * 1024 * 1024, perPart: 40 * 1024 * 1024, ratio: 200, cells: 500_000 };

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

export function columnIndex(letters: string): number {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

export function columnLetters(index: number): string {
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity] ?? "";
  });
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match ? decodeXml(match[1]!) : null;
}

/** Texto de un nodo <si> o <is>: concatena todos los <t>, ignora la fonética (<rPh>). */
function richText(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const match of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decodeXml(match[1] ?? "");
  return out;
}

function isDateFormatCode(code: string): boolean {
  // Quita literales, colores/condiciones entre corchetes y escapes antes de buscar tokens de fecha.
  const cleaned = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(cleaned) && !/^[#0.,% ]*$/.test(cleaned);
}

/** Número de serie de Excel → fecha ISO. Corrige el 29/02/1900 inexistente del sistema 1900. */
export function serialToIsoDate(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  const whole = Math.floor(serial);
  const days = date1904 ? whole + 1462 : whole > 59 ? whole - 1 : whole;
  const ms = Date.UTC(1899, 11, 31) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

export function readWorkbook(data: Uint8Array): Workbook {
  if (data.byteLength < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new WorkbookReadError("El archivo no es un .xlsx válido.");
  let declaredTotal = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        const wanted = file.name === "xl/workbook.xml" || file.name === "xl/_rels/workbook.xml.rels" || file.name === "xl/sharedStrings.xml" || file.name === "xl/styles.xml" || file.name === "docProps/app.xml" || file.name === "docProps/core.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name);
        if (!wanted) return false;
        declaredTotal += file.originalSize;
        if (file.originalSize > LIMITS.perPart || declaredTotal > LIMITS.totalUncompressed) throw new WorkbookReadError("El archivo es demasiado grande una vez descomprimido.");
        if (file.size > 0 && file.originalSize / file.size > LIMITS.ratio) throw new WorkbookReadError("El archivo tiene una compresión sospechosa y no se procesa.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof WorkbookReadError) throw error;
    throw new WorkbookReadError("No se pudo abrir el archivo. ¿Es un .xlsx de Excel o Google Sheets?");
  }
  const actualTotal = Object.values(entries).reduce((acc, b) => acc + b.byteLength, 0);
  if (actualTotal > LIMITS.totalUncompressed) throw new WorkbookReadError("El archivo es demasiado grande una vez descomprimido.");

  const text = (name: string) => {
    const bytes = entries[name];
    if (!bytes) return null;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (/<!DOCTYPE/i.test(xml)) throw new WorkbookReadError("El archivo contiene declaraciones XML no permitidas.");
    return xml;
  };

  const workbookXml = text("xl/workbook.xml");
  if (!workbookXml) throw new WorkbookReadError("Falta xl/workbook.xml: el archivo no es un libro de Excel.");
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbookXml);

  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, resolvePath("xl/workbook.xml", target));
  }

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(richText(m[1] ?? ""));

  // Estilos: índice de xf → código de formato numérico.
  const stylesXml = text("xl/styles.xml") ?? "";
  const customFormats = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = attr(m[0], "formatCode");
    if (code !== null) customFormats.set(id, code);
  }
  const xfFormats: Array<{ code: string | null; isDate: boolean }> = [];
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? "";
  for (const m of cellXfs.matchAll(/<xf\b[^>]*\/?>/g)) {
    const id = Number(attr(m[0], "numFmtId") ?? 0);
    const code = customFormats.get(id) ?? null;
    xfFormats.push({ code: code ?? (id === 0 ? "General" : `builtin:${id}`), isDate: BUILTIN_DATE_FORMATS.has(id) || (code !== null && isDateFormatCode(code)) });
  }

  const meta = text("docProps/app.xml") ?? "";
  const core = text("docProps/core.xml") ?? "";
  const application = /<Application>([^<]*)<\/Application>/.exec(meta)?.[1] ?? null;
  const creator = /<dc:creator>([^<]*)<\/dc:creator>/.exec(core)?.[1] ?? null;

  let totalCells = 0;
  const sheets: Sheet[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = attr(m[0], "name") ?? `Hoja${sheets.length + 1}`;
    const state = (attr(m[0], "state") as Sheet["state"] | null) ?? "visible";
    const relId = attr(m[0], "r:id");
    const path = relId ? rels.get(relId) : undefined;
    const xml = path ? text(path) : null;
    const sheet: Sheet = { name: decodeXml(name), state, cells: new Map(), maxRow: 0, maxCol: 0 };
    const sharedFormulas = new Map<string, string>();
    if (xml) {
      const sheetData = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>|<sheetData\/>/.exec(xml)?.[1] ?? "";
      for (const c of sheetData.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1] ?? "";
        const inner = c[2] ?? "";
        const ref = /\sr="([A-Z]+)(\d+)"/.exec(attrs);
        if (!ref) continue;
        const t = /\st="([^"]+)"/.exec(attrs)?.[1] ?? "n";
        const styleIndex = Number(/\ss="(\d+)"/.exec(attrs)?.[1] ?? 0);
        const formulaMatch = /<f\b([^>]*)>([\s\S]*?)<\/f>|<f\b([^>]*)\/>/.exec(inner);
        let formula: string | null = null;
        let formulaShared = false;
        if (formulaMatch) {
          const fAttrs = formulaMatch[1] ?? formulaMatch[3] ?? "";
          const text = formulaMatch[2] !== undefined ? decodeXml(formulaMatch[2]) : "";
          const si = /\st="shared"/.test(fAttrs) ? /\ssi="(\d+)"/.exec(fAttrs)?.[1] : undefined;
          if (si !== undefined && text) sharedFormulas.set(si, text);
          if (si !== undefined) {
            formulaShared = true;
            formula = text || sharedFormulas.get(si) || "(fórmula compartida)";
          } else formula = text || "(fórmula)";
        }
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const style = xfFormats[styleIndex] ?? { code: null, isDate: false };
        let type: CellType = "number";
        let value: string | null = null;
        if (t === "s") {
          type = "string";
          value = v !== undefined ? (shared[Number(v)] ?? "") : null;
        } else if (t === "inlineStr") {
          type = "string";
          value = richText(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
        } else if (t === "str") {
          type = "string";
          value = v !== undefined ? decodeXml(v) : null;
        } else if (t === "b") {
          type = "boolean";
          value = v === "1" ? "true" : v === "0" ? "false" : null;
        } else if (t === "e") {
          type = "error";
          value = v !== undefined ? decodeXml(v) : "#ERROR";
        } else if (t === "d") {
          type = "date";
          value = v ? v.slice(0, 10) : null;
        } else if (v !== undefined) {
          const raw = v.trim();
          if (style.isDate) {
            const iso = serialToIsoDate(Number(raw), date1904);
            type = iso ? "date" : "number";
            value = iso ?? raw;
          } else {
            type = "number";
            value = raw;
          }
        }
        if (value === null && formula === null) continue;
        const col = columnIndex(ref[1]!);
        const row = Number(ref[2]);
        sheet.cells.set(`${ref[1]}${ref[2]}`, { ref: `${ref[1]}${ref[2]}`, row, col, type, value: value ?? "", formula, formulaShared, numberFormat: style.code });
        sheet.maxRow = Math.max(sheet.maxRow, row);
        sheet.maxCol = Math.max(sheet.maxCol, col);
        if (++totalCells > LIMITS.cells) throw new WorkbookReadError("El archivo tiene demasiadas celdas para importarlo.");
      }
    }
    sheets.push(sheet);
  }
  if (!sheets.length) throw new WorkbookReadError("El libro no tiene hojas.");
  return { sheets, date1904, application, creator };
}

export function cellAt(sheet: Sheet, col: number, row: number): Cell | undefined {
  return sheet.cells.get(`${columnLetters(col)}${row}`);
}
