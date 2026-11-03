import { type NextRequest, NextResponse } from "next/server";

/**
 * Política de seguridad de contenido con nonce por request y cabeceras de transporte.
 * La autorización NO se decide acá: cada página y acción la verifica en el servidor (ver
 * src/server/http/session.ts). Así un bypass del proxy no expone datos.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV !== "production";
  const s3Origin = process.env.S3_PUBLIC_ORIGIN ? ` ${process.env.S3_PUBLIC_ORIGIN}` : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Desarrollo: el overlay y el indicador de Next.js inyectan estilos sin nonce. Producción: solo nonce.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:${s3Origin}`,
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  // Id para correlacionar logs de un mismo pedido.
  requestHeaders.set("x-request-id", crypto.randomUUID());
  // Ruta pedida, para volver a ella después de ingresar (ver requireUser). Pisa cualquier valor del cliente.
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  matcher: [
    // Todo menos estáticos, íconos y la API (sus respuestas fijan su propia política: JSON o descargas con «sandbox»).
    { source: "/((?!api/|_next/static|_next/image|favicon.ico|icons/|brand/|sw.js|manifest.webmanifest).*)", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
};
