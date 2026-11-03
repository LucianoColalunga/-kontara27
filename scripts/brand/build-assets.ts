/**
 * Genera los archivos de marca a partir de src/config/brand.ts y src/lib/isotype.ts:
 *   public/brand/*.svg   logotipos (texto convertido a trazos: no dependen de fuentes instaladas)
 *   public/icons/*       favicon, íconos de la PWA (incluido «maskable») y apple-touch-icon
 *
 * Uso: npm run brand:build   (volver a correrlo si cambia el nombre en brand.ts)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";
import sharp from "sharp";
import { brand } from "../../src/config/brand";
import { ISOTYPE_PALETTES, isotypeFaces, isotypeSvg, MONO_OPACITY, type IsotypePalette } from "../../src/lib/isotype";

const root = path.resolve(import.meta.dirname, "../..");
const out = (...p: string[]) => path.join(root, ...p);
mkdirSync(out("public/brand"), { recursive: true });
mkdirSync(out("public/icons"), { recursive: true });

const loadFont = (file: string) => {
  const buffer = readFileSync(out("node_modules/@fontsource/sora/files", file));
  return opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
};
const sora = loadFont("sora-latin-600-normal.woff");

/** Texto → trazo SVG con tracking manual y kerning de la fuente. */
function textPath(text: string, x: number, baseline: number, fontSize: number, tracking: number): { d: string; width: number } {
  const scale = fontSize / sora.unitsPerEm;
  const glyphs = sora.stringToGlyphs(text);
  let cursor = x;
  const parts: string[] = [];
  glyphs.forEach((glyph, i) => {
    parts.push(glyph.getPath(cursor, baseline, fontSize).toPathData(2));
    const next = glyphs[i + 1];
    const kern = next ? sora.getKerningValue(glyph, next) * scale : 0;
    cursor += (glyph.advanceWidth ?? 0) * scale + kern + (next ? tracking : 0);
  });
  return { d: parts.join(""), width: cursor - x };
}

function isotypeGroup(x: number, y: number, size: number, palette: IsotypePalette, options: { tile?: string; mono?: boolean } = {}) {
  const faces = isotypeFaces(x + size / 2, y + size / 2, size * (options.tile ? 0.375 : 0.43));
  const tile = options.tile ? `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${(size * 14) / 64}" fill="${options.tile}"/>` : "";
  return tile + faces.map((f) => `<polygon points="${f.points}" fill="${palette[f.role]}"${options.mono ? ` fill-opacity="${MONO_OPACITY[f.role]}"` : ""}/>`).join("");
}

interface LogoVariant {
  file: string;
  text: string;
  numeral: string;
  palette: IsotypePalette;
  mono?: boolean;
}

function horizontal(v: LogoVariant) {
  const iso = 64;
  const fontSize = 30;
  const word = textPath(brand.wordmark, iso + 18, 43, fontSize, fontSize * 0.1);
  const num = textPath(brand.numeral, iso + 18 + word.width + fontSize * 0.42, 43, fontSize, fontSize * 0.02);
  const width = Math.ceil(iso + 18 + word.width + fontSize * 0.42 + num.width + 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${iso}" width="${width}" height="${iso}" role="img" aria-label="${brand.name}"><title>${brand.name}</title>${isotypeGroup(0, 0, iso, v.palette, { mono: v.mono })}<path d="${word.d}" fill="${v.text}"/><path d="${num.d}" fill="${v.numeral}"/></svg>`;
  writeFileSync(out("public/brand", v.file), svg);
}

function vertical(v: LogoVariant) {
  const iso = 96;
  const fontSize = 26;
  const word = textPath(brand.wordmark, 0, 0, fontSize, fontSize * 0.1);
  const num = textPath(brand.numeral, 0, 0, fontSize, fontSize * 0.02);
  const total = word.width + fontSize * 0.36 + num.width;
  const width = Math.ceil(Math.max(iso, total) + 8);
  const startX = (width - total) / 2;
  const w = textPath(brand.wordmark, startX, iso + 40, fontSize, fontSize * 0.1);
  const n = textPath(brand.numeral, startX + word.width + fontSize * 0.36, iso + 40, fontSize, fontSize * 0.02);
  const height = iso + 52;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${brand.name}"><title>${brand.name}</title>${isotypeGroup((width - iso) / 2, 0, iso, v.palette, { mono: v.mono })}<path d="${w.d}" fill="${v.text}"/><path d="${n.d}" fill="${v.numeral}"/></svg>`;
  writeFileSync(out("public/brand", v.file), svg);
}

const ink = brand.colors.ink;
const accent = brand.colors.accent;
horizontal({ file: "logo-horizontal.svg", text: ink, numeral: accent, palette: ISOTYPE_PALETTES.onLight });
horizontal({ file: "logo-horizontal-negativo.svg", text: "#FFFFFF", numeral: "#7FA6FF", palette: ISOTYPE_PALETTES.onDark });
horizontal({ file: "logo-horizontal-mono.svg", text: ink, numeral: ink, palette: ISOTYPE_PALETTES.monoInk, mono: true });
horizontal({ file: "logo-horizontal-mono-negativo.svg", text: "#FFFFFF", numeral: "#FFFFFF", palette: ISOTYPE_PALETTES.monoWhite, mono: true });
vertical({ file: "logo-vertical.svg", text: ink, numeral: accent, palette: ISOTYPE_PALETTES.onLight });
vertical({ file: "logo-vertical-negativo.svg", text: "#FFFFFF", numeral: "#7FA6FF", palette: ISOTYPE_PALETTES.onDark });

writeFileSync(out("public/brand/isotipo.svg"), isotypeSvg({ size: 512 }));
writeFileSync(out("public/brand/isotipo-sin-fondo.svg"), isotypeSvg({ size: 512, tile: null, palette: ISOTYPE_PALETTES.onLight, padding: 0 }));
writeFileSync(out("public/brand/isotipo-mono.svg"), isotypeSvg({ size: 512, tile: null, palette: ISOTYPE_PALETTES.monoInk, mono: true, padding: 0 }));
writeFileSync(out("public/brand/isotipo-mono-negativo.svg"), isotypeSvg({ size: 512, tile: null, palette: ISOTYPE_PALETTES.monoWhite, mono: true, padding: 0 }));
writeFileSync(out("public/icons/favicon.svg"), isotypeSvg({ size: 64 }));

// Íconos raster de la PWA. El «maskable» deja el dibujo dentro de la zona segura (80 % central).
const png = async (svg: string, size: number, file: string) => {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out("public/icons", file));
};
const fullBleed = (size: number, edgeFactor: number) => {
  const faces = isotypeFaces(size / 2, size / 2, size * edgeFactor);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${ink}"/>${faces.map((f) => `<polygon points="${f.points}" fill="${ISOTYPE_PALETTES.onInk[f.role]}"/>`).join("")}</svg>`;
};
await png(isotypeSvg({ size: 512 }), 192, "icon-192.png");
await png(isotypeSvg({ size: 512 }), 512, "icon-512.png");
await png(fullBleed(512, 0.3), 512, "icon-maskable-512.png");
await png(fullBleed(180, 0.34), 180, "apple-touch-icon.png");
await png(isotypeSvg({ size: 64 }), 32, "favicon-32.png");

console.log("Archivos de marca generados en public/brand y public/icons.");
