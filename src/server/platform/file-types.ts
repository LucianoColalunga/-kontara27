import "server-only";

export interface DetectedType {
  mime: string;
  extension: string;
}

/**
 * Detecta el tipo real por la firma de bytes («magic numbers»). Nunca se confía en el nombre ni en
 * el Content-Type que manda el navegador: un .pdf puede ser un HTML con scripts.
 */
export function sniffFileType(bytes: Uint8Array): DetectedType | null {
  const b = (i: number) => bytes[i] ?? -1;
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  if (ascii(0, 5) === "%PDF-") return { mime: "application/pdf", extension: "pdf" };
  if (b(0) === 0x89 && ascii(1, 3) === "PNG") return { mime: "image/png", extension: "png" };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return { mime: "image/webp", extension: "webp" };
  if (ascii(4, 4) === "ftyp" && ["heic", "heix", "mif1", "msf1"].includes(ascii(8, 4))) return { mime: "image/heic", extension: "heic" };
  // XLSX (Office Open XML) es un ZIP: PK\x03\x04. La validación del contenido la hace el lector.
  if (b(0) === 0x50 && b(1) === 0x4b && b(2) === 0x03 && b(3) === 0x04) return { mime: "application/zip", extension: "zip" };
  return null;
}

export const ATTACHMENT_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"]);
export const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Nombre seguro para mostrar y para Content-Disposition. */
export function safeFilename(name: string, fallbackExtension: string): string {
  const base = name
    .normalize("NFC")
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return base || `archivo.${fallbackExtension}`;
}
