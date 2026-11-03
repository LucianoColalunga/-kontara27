# Despliegue a producción

Guía para la primera instalación. Arquitectura de referencia: Vercel (aplicación y cron), Neon (PostgreSQL),
Cloudflare R2 (archivos) y Resend (correo). Se puede reemplazar cada pieza por un equivalente: lo que importa
son las propiedades que se piden en cada paso.

> Antes de abrirla al público revisá el
> [criterio para pasar a producción](../security/informe-2026-11-03.md#criterio-para-pasar-a-producción).

## 1. Cuentas y servicios (los contrata la persona responsable)

| Servicio | Para qué | Plan |
| --- | --- | --- |
| Vercel | Aplicación, HTTPS, cron diario | **Pro**: el plan Hobby no admite uso comercial |
| Neon | PostgreSQL 17 con backups y restauración a un punto en el tiempo | Según volumen; región São Paulo (`sa-east-1`) para Argentina |
| Cloudflare R2 (o S3) | Comprobantes y planillas originales, en un bucket **privado** | Según volumen |
| Resend | Correos de verificación, recuperación e invitaciones | Requiere un dominio propio verificado |
| Dominio | `kontara27.com` / `kontara27.app` (pendiente de compra) | — |

## 2. Base de datos

La aplicación usa dos roles. Crealos en Neon (SQL Editor, con el rol administrador del proyecto) con
contraseñas largas y aleatorias, distintas entre sí:

```sql
CREATE ROLE app_owner LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS PASSWORD '<contraseña-owner>';
CREATE ROLE app_user  LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS NOINHERIT PASSWORD '<contraseña-app>';
CREATE DATABASE kontara OWNER app_owner;
REVOKE ALL ON DATABASE kontara FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE kontara TO app_user;
```

Si `CREATE DATABASE … OWNER app_owner` responde que no tenés permiso para ese rol (PostgreSQL 16+ exige ser
miembro), ejecutá antes `GRANT app_owner TO CURRENT_USER;`. Creá `app_user` por SQL y no desde la consola,
para que no herede privilegios de otros roles.

- `app_owner` es dueño del esquema y **solo** lo usan las migraciones.
- `app_user` es el de la aplicación: no puede saltear RLS ni cambiar el esquema. Si por error se le diera
  `BYPASSRLS` o fuera dueño de las tablas, la aplicación se niega a arrancar.

Migraciones, desde una máquina de confianza o desde el pipeline, con la URL del dueño:

```bash
DATABASE_OWNER_URL="postgres://app_owner:...@<host-directo>/kontara?sslmode=require" npm run db:migrate
```

Usá la conexión **directa** de Neon para migrar y la del **pooler** para `DATABASE_URL` de la aplicación.

## 3. Archivos

Creá un bucket privado (sin acceso público ni listado) y una credencial limitada a ese bucket con lectura y
escritura. Las descargas salen por URLs prefirmadas de 5 minutos.

## 4. Correo

Verificá el dominio en Resend (registros SPF, DKIM y DMARC) y usá un remitente de ese dominio en
`EMAIL_FROM`, por ejemplo `KONTARA 27 <no-reply@kontara27.com>`.

## 5. Variables de entorno (Vercel → Settings → Environment Variables, entorno Production)

| Variable | Valor |
| --- | --- |
| `APP_URL` | `https://<tu-dominio>` (se usa en los enlaces de los correos; nunca se toma del pedido) |
| `DATABASE_URL` | URL del pooler con `app_user` y `sslmode=require` |
| `ENCRYPTION_KEY` | 32 bytes aleatorios en base64. **Guardala también fuera de Vercel**: sin ella no se pueden leer los datos cifrados |
| `SIGNING_KEY` | 32 bytes aleatorios en base64, distinta de la anterior |
| `CRON_SECRET` | 32 o más caracteres aleatorios; Vercel Cron la envía sola |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | Remitente del dominio verificado |
| `RESEND_API_KEY` | Clave de Resend con permiso solo de envío |
| `STORAGE_PROVIDER` | `s3` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Del bucket privado (en R2, `S3_REGION=auto`) |
| `S3_PUBLIC_ORIGIN` | Opcional: origen de las URLs prefirmadas (p. ej. `https://<cuenta>.r2.cloudflarestorage.com`) para previsualizar imágenes; se agrega a la CSP |

`TRUST_PROXY_HEADERS` no hace falta en Vercel. Fuera de Vercel es obligatoria (ver `.env.example`).

La aplicación valida todo al arrancar y **se niega a funcionar** en producción con valores de desarrollo
(http, correo de consola, disco local) o si falta algo. `/api/health/ready` informa el estado sin mostrar
valores.

Generá las claves con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 6. Despliegue

1. Conectá el repositorio a Vercel (framework detectado: Next.js; comando de build `npm run build`).
2. Configurá el dominio; Vercel emite el certificado. La app envía HSTS con `preload`: agregá el dominio a
   la lista de precarga solo cuando estés seguro de servir siempre HTTPS, incluidos los subdominios.
3. `vercel.json` programa la tarea diaria (`/api/cron/daily`, 10:00 UTC = 07:00 en Argentina): alertas de
   presupuesto, avisos de vencimientos y limpieza de sesiones, tokens y contadores de intentos vencidos.
4. Verificá después de cada despliegue:
   - `GET /api/health` → `{"status":"ok"}`
   - `GET /api/health/ready` → `200` con `config`, `database` y `migrations` en `ok`

## 7. Primera persona administradora de la plataforma

La superadministración no se asigna desde la interfaz. Registrá la cuenta normalmente y, con el rol dueño:

```sql
INSERT INTO platform_admins (user_id)
SELECT id FROM users WHERE email_normalized = lower('<correo>');
```

## 8. Operación

- **Backups:** Neon guarda historial para restaurar a un punto en el tiempo según el plan. Además, un
  volcado lógico periódico (`pg_dump` con el rol dueño) a un almacenamiento separado y cifrado. Probá la
  restauración al menos una vez por trimestre y anotá cuánto tardó.
- **Monitoreo:** un chequeo externo de `/api/health/ready` cada minuto; logs en Vercel (JSON, con
  `requestId` y sin datos sensibles).
- **Rotación de claves:** `SIGNING_KEY` y `CRON_SECRET` se pueden rotar en cualquier momento (los enlaces
  temporales vigentes dejan de valer). `ENCRYPTION_KEY` **no** se cambia sin un proceso de recifrado.
- **Seguridad continua:** workflow **Seguridad** en cada push y semanal; Dependabot los lunes.
