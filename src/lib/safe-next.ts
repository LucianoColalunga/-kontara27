const INTERNAL_PATH = /^\/[\w\-/?=&%.~]*$/;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|\?|$)/;

/**
 * Destino después de ingresar (o de cambiar el tema): solo rutas internas de la app. Evita redirecciones
 * abiertas como «?next=https://sitio», «//sitio» o «/\sitio», y rutas que se reescriben al normalizarse.
 */
export function safeNext(value: string, fallback = "/app"): string {
  if (!INTERNAL_PATH.test(value) || value.includes("//") || DOT_SEGMENT.test(value) || /^\/api(\/|\?|$)/.test(value)) return fallback;
  return value;
}
