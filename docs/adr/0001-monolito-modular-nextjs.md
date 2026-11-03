# ADR 0001 — Monolito modular en Next.js con TypeScript

- Estado: aceptado
- Fecha: 2026-11-03

## Contexto

Hace falta una aplicación web, instalable en celulares (PWA), con backend propio, multiempresa, segura y
mantenible por un equipo chico. El brief pide separar frontend, backend, servicios y repositorios, y
evitar microservicios innecesarios.

## Opciones

1. **SPA (React) + API separada (NestJS/Fastify)**: dos deployables, dos pipelines, CORS, contrato HTTP
   duplicado. Separación física fuerte, más costo operativo.
2. **Microservicios**: complejidad de red, transacciones distribuidas y observabilidad que el producto
   no necesita hoy.
3. **Monolito modular en Next.js (App Router)**: un solo deployable; React Server Components y Server
   Actions como capa de presentación; dominio y aplicación en TypeScript puro dentro de
   `src/server/modules`.

## Decisión

Opción 3. La separación frontend/backend se hace con límites de código verificados automáticamente, no
con procesos separados:

- `src/server/**` lleva `import "server-only"`; importarlo desde un componente cliente rompe el build.
- Cada módulo publica una sola API (`index.ts`); ESLint prohíbe importar archivos internos de otro
  módulo.
- Las capas de dominio y aplicación no importan Next.js ni Drizzle: dependen de interfaces (puertos).

## Consecuencias

- Un solo pipeline y un solo despliegue en Vercel; tipos compartidos de punta a punta sin generar
  clientes HTTP.
- Si un módulo necesita escalar aparte (por ejemplo, importaciones pesadas), puede extraerse a un worker
  porque ya depende de puertos y no de la infraestructura.
- Una API pública futura (`/api/v1`) reutiliza los mismos servicios de aplicación.
- Versiones fijadas: Next.js 16.4, React 19.3, TypeScript 6.0 (el último compilador en JavaScript; la
  versión 7 todavía no es compatible con `typescript-eslint`).
