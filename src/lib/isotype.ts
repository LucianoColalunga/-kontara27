/**
 * Isotipo «Cubo 27»: un cubo de 3 × 3 × 3 unidades (3³ = 27) en proyección isométrica, con la
 * unidad central resaltada — cada unidad cuenta. La misma geometría alimenta el componente de
 * React y el generador de archivos de marca (scripts/brand/build-assets.ts).
 */

export type FaceRole = "top" | "left" | "right" | "coreTop" | "coreLeft" | "coreRight";

export interface IsotypePalette {
  top: string;
  left: string;
  right: string;
  coreTop: string;
  coreLeft: string;
  coreRight: string;
}

export const ISOTYPE_PALETTES = {
  /** Sobre el mosaico tinta (ícono de app, favicon). */
  onInk: { top: "#E9EEF6", left: "#A9B6CA", right: "#6F809C", coreTop: "#A9C2FF", coreLeft: "#5B8CFF", coreRight: "#1D5BFF" },
  /** Sobre fondos claros, sin mosaico. */
  onLight: { top: "#5E6E88", left: "#0B1A2E", right: "#2A3A55", coreTop: "#7FA6FF", coreLeft: "#1D5BFF", coreRight: "#1449D6" },
  /** Sobre fondos oscuros, sin mosaico. */
  onDark: { top: "#E9EEF6", left: "#A9B6CA", right: "#6F809C", coreTop: "#A9C2FF", coreLeft: "#5B8CFF", coreRight: "#3D72FF" },
  monoInk: { top: "#0B1A2E", left: "#0B1A2E", right: "#0B1A2E", coreTop: "#0B1A2E", coreLeft: "#0B1A2E", coreRight: "#0B1A2E" },
  monoWhite: { top: "#FFFFFF", left: "#FFFFFF", right: "#FFFFFF", coreTop: "#FFFFFF", coreLeft: "#FFFFFF", coreRight: "#FFFFFF" },
} satisfies Record<string, IsotypePalette>;

/** En las versiones monocromáticas las caras se distinguen por opacidad. */
export const MONO_OPACITY: Record<FaceRole, number> = { top: 0.55, left: 1, right: 0.78, coreTop: 1, coreLeft: 1, coreRight: 1 };

type Point = [number, number];

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Polígonos de las seis caras. `edge` es la arista del cubo grande; `gap` la separación entre
 * caras en unidades de la arista (el «espacio de superficie» del sistema de diseño).
 */
export function isotypeFaces(cx: number, cy: number, edge: number, gap = 0.028): Array<{ role: FaceRole; points: string }> {
  const C: Point = [cx, cy];
  const ur: Point = [0.8660254 * edge, -0.5 * edge];
  const ul: Point = [-0.8660254 * edge, -0.5 * edge];
  const down: Point = [0, edge];
  const f = 1 / 3;
  const map = (a: Point, b: Point) => (u: number, v: number): Point => [C[0] + u * a[0] + v * b[0], C[1] + u * a[1] + v * b[1]];
  const face = (a: Point, b: Point) => {
    const p = map(a, b);
    const g = gap;
    // Cara grande en forma de L (sin la esquina de la unidad central) y la unidad central.
    const big: Point[] = [p(f + g, g), p(1 - g, g), p(1 - g, 1 - g), p(g, 1 - g), p(g, f + g), p(f + g, f + g)];
    const core: Point[] = [p(g, g), p(f - g, g), p(f - g, f - g), p(g, f - g)];
    return { big, core };
  };
  const str = (pts: Point[]) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
  const top = face(ur, ul);
  const left = face(ul, down);
  const right = face(ur, down);
  return [
    { role: "top", points: str(top.big) },
    { role: "left", points: str(left.big) },
    { role: "right", points: str(right.big) },
    { role: "coreTop", points: str(top.core) },
    { role: "coreLeft", points: str(left.core) },
    { role: "coreRight", points: str(right.core) },
  ];
}

/** SVG completo del isotipo (para archivos de marca). */
export function isotypeSvg(options: { size?: number; tile?: string | null; palette?: IsotypePalette; mono?: boolean; padding?: number } = {}): string {
  const size = options.size ?? 64;
  const tile = options.tile === undefined ? "#0B1A2E" : options.tile;
  const palette = options.palette ?? ISOTYPE_PALETTES.onInk;
  const scale = size / 64;
  const edge = (options.padding !== undefined ? 26 * (1 - options.padding) : 24) * scale;
  const faces = isotypeFaces(size / 2, size / 2, edge);
  const polygons = faces
    .map((f) => `<polygon points="${f.points}" fill="${palette[f.role]}"${options.mono ? ` fill-opacity="${MONO_OPACITY[f.role]}"` : ""}/>`)
    .join("");
  const background = tile ? `<rect width="${size}" height="${size}" rx="${round(14 * scale)}" fill="${tile}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${background}${polygons}</svg>`;
}
