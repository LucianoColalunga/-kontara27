# KONTARA 27

Gestión financiera multiempresa: ingresos, gastos, cuentas y cajas, presupuestos, vencimientos y reportes,
con los datos de cada empresa aislados en la base de datos.

**Estado:** versión 0.1.0, en desarrollo. Todavía no hay una instalación de producción (ver
[criterio para pasar a producción](docs/security/informe-2026-11-03.md#criterio-para-pasar-a-producción)).

## Qué incluye

- **Multiempresa real.** Cada empresa con su nombre comercial, razón social opcional, identificación fiscal
  configurable (cifrada), moneda, zona horaria, categorías, cuentas y equipo. Una persona puede pertenecer a
  varias empresas y cambiar entre ellas sin volver a ingresar. El aislamiento lo garantiza PostgreSQL con
  Row-Level Security, no solo la aplicación.
- **Roles y permisos:** propietario, administrador, contador, empleado y solo lectura, más roles propios
  con los permisos que elija cada empresa. La superadministración de plataforma está preparada en la base
  (funciones con auditoría), todavía sin panel.
- **Movimientos:** ingresos, gastos, devoluciones, ajustes, transferencias entre cuentas, inversiones,
  aportes y retiros de socios; tipos configurables, búsqueda y filtros, comprobantes adjuntos, historial de
  cambios, borrado controlado y restauración. Importes exactos (enteros en centavos, sin coma flotante).
- **Cuentas y cajas** con saldos y conciliación; las transferencias no cuentan como ingreso ni gasto.
- **Presupuestos** mensuales o anuales por categoría, sector o empresa, con alertas por porcentaje.
- **Reportes:** estado de resultados, flujo de caja, por categoría, comparaciones mensuales y saldos;
  exportación a Excel, CSV y PDF.
- **Importador de planillas** con validación, detección de duplicados y fechas dudosas, corrección antes de
  confirmar, copia privada del original, informe de migración y conciliación contra los totales de la
  planilla. No inventa importes que no se pueden determinar.
- **Vencimientos y avisos** (alquileres, servicios, impuestos, proveedores, cobros).
- **Cuenta y privacidad:** verificación de correo, recuperación segura, MFA (TOTP) opcional, sesiones
  abiertas y cierre remoto, exportación de datos personales, supresión de la cuenta, preferencias de cookies.
- **PWA instalable**, diseño propio en claro y oscuro, accesible (WCAG 2.2 AA en las pruebas automáticas).

## Tecnología

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · PostgreSQL 17 con RLS · Drizzle ORM ·
Tailwind CSS 4 · Vitest · Playwright + axe. Decisiones y motivos en [docs/adr/](docs/adr/).

## Puesta en marcha local

Requisitos: Node.js 22.12 o superior. No hace falta Docker: la base local usa los binarios oficiales de
PostgreSQL.

```bash
npm ci
```

```bash
cp .env.example .env.local
```

Completá en `.env.local` las contraseñas locales y las claves. Cada clave se genera con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

En una terminal, la base local (queda corriendo):

```bash
npm run db:local
```

En otra, las migraciones y la aplicación:

```bash
npm run db:migrate
```

```bash
npm run dev
```

La app queda en http://localhost:3000. Los correos de desarrollo no se envían: se guardan en `.data/outbox/`.

En Windows, `scripts/abrir-kontara.ps1` hace todo eso de una vez con el build de producción (base, migraciones,
build si cambió el código, app y navegador) y sirve como destino de un acceso directo del escritorio:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File <ruta>\scripts\abrir-kontara.ps1`. Al cerrar su ventana
se apaga la base en orden y se cierra la app.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start:local` | Build de producción en esta máquina (CSP estricta, sin servicios externos) |
| `npm run check` | Lint + tipos + pruebas unitarias |
| `npm test` | Pruebas unitarias |
| `npm run test:integration` | Pruebas de integración contra PostgreSQL (requiere `db:local`) |
| `npm run test:e2e` | Punta a punta, accesibilidad y celular (requiere `db:local` y `build`) |
| `npm run db:local` | PostgreSQL local (`-- stop` lo detiene, `-- reset` lo recrea) |
| `npm run db:generate` | Genera una migración a partir del esquema |
| `npm run db:migrate` | Aplica migraciones con el rol dueño |
| `npm run import:workbook` | Carga una planilla en revisión desde la terminal |
| `npm run brand:build` | Regenera logos e íconos desde `src/config/brand.ts` |

## Pruebas

- **Unitarias** (`tests/unit`): dinero, TOTP con los vectores del RFC 6238, reglas de dominio, importador,
  redirecciones seguras.
- **Integración** (`tests/integration`): cada archivo clona una base migrada y prueba con el rol real de la
  aplicación; incluye la batería de aislamiento entre empresas.
- **E2E** (`tests/e2e`): contra el build de producción y una base propia (`kontara_e2e`, se recrea en cada
  corrida): alta completa, importación, aislamiento, seguridad (CSP, CSRF, enumeración, cookies),
  accesibilidad con axe en tema claro y oscuro, y diseño en celular.

## Estructura

```
src/app/            páginas, Server Actions y rutas API (finas: delegan en los servicios)
src/components/     interfaz: primitivas, gráficos, layout
src/server/modules/ dominio por módulo (identidad, empresas, libro, documentos, reportes, presupuestos,
                    vencimientos, privacidad, notificaciones, importación)
src/server/platform/ base de datos, cifrado, correo, archivos, límites, auditoría, configuración
drizzle/            migraciones SQL versionadas (incluye políticas RLS)
scripts/            base local, migraciones, marca, servidor E2E
tests/              unitarias, integración, E2E
docs/               arquitectura, ADR, seguridad, despliegue, marca, investigación
```

## Documentación

- [Arquitectura](docs/architecture/README.md) y [decisiones (ADR)](docs/adr/)
- [Despliegue a producción](docs/deploy/produccion.md)
- [Seguridad](SECURITY.md): [modelo de amenazas](docs/security/modelo-de-amenazas.md) e
  [informe](docs/security/informe-2026-11-03.md)
- [Marca](docs/brand/README.md) (manual completo en `/marca` dentro de la app)
- [Cambios por versión](CHANGELOG.md)

## Licencia

Código público para lectura y auditoría, sin licencia de uso: © 2026 Luciano Colalunga, todos los derechos
reservados. Ver [LICENSE](LICENSE).
