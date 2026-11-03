# ADR 0002 — PostgreSQL, Drizzle ORM y Row Level Security

- Estado: aceptado
- Fecha: 2026-11-03

## Contexto

La información de una empresa jamás debe verse desde otra, y el brief pide no confiar solo en filtros de
la aplicación. Los datos son financieros: necesitan transacciones, integridad referencial y precisión
decimal.

## Decisión

- **PostgreSQL** (17 en CI, 18 en desarrollo local, Neon en producción).
- **Drizzle ORM** en lugar de Prisma: SQL explícito y tipado, sin motor binario, soporte directo para
  definir roles y políticas, y transacciones interactivas simples donde fijar variables de sesión
  (`set_config(..., true)`) para RLS. Prisma requiere extensiones de cliente y es más difícil de auditar
  en este punto.
- **Aislamiento en tres capas**:
  1. La aplicación se conecta como `app_user` (sin `BYPASSRLS`, no dueño de las tablas).
  2. `ENABLE` + `FORCE ROW LEVEL SECURITY` en todas las tablas con `organization_id`.
  3. Políticas `USING/WITH CHECK (organization_id = (select app.current_org_id()))`, donde
     `app.current_org_id()` verifica la membresía activa del usuario de la transacción. El
     `(select …)` hace que PostgreSQL la evalúe una vez por consulta y no por fila.
- Las tablas globales de identidad (usuarios, sesiones, tokens) no son por organización: solo las usa el
  módulo `identity`, y `app_user` no puede leer hashes de contraseñas de otros usuarios fuera de las
  consultas parametrizadas de ese módulo.
- Registro de auditoría con `GRANT INSERT, SELECT` únicamente.
- Migraciones SQL versionadas (`drizzle/`), aplicadas con el rol `app_owner`.

## Desarrollo local

Docker Desktop está instalado pero no siempre corriendo. Para no depender de él, el entorno local usa
`embedded-postgres` (binarios oficiales de PostgreSQL distribuidos por npm) en `.data/postgres`. CI usa
el contenedor oficial `postgres:17`. El mismo código y las mismas migraciones corren en ambos.

## Consecuencias

- Un error en un filtro de la aplicación no expone datos de otra empresa: RLS es la red de seguridad.
- Cada consulta de negocio necesita contexto de tenant; las consultas sin contexto devuelven cero filas
  (falla cerrada).
- Hay que probar el aislamiento contra una base real: la suite de integración lo hace en cada push.
