# ADR 0005 — PWA en lugar de apps nativas; servicios externos detrás de puertos

- Estado: aceptado
- Fecha: 2026-11-03

## PWA

Se necesita usar el sistema en Windows, macOS, Android, iPhone y tablets, con ícono propio y sin
duplicar la lógica de negocio.

**Decisión**: una sola aplicación web responsive instalable como PWA (manifest, íconos, service worker).

- Android y Chrome/Edge de escritorio ofrecen instalación directa; iOS/iPadOS 16.4+ la instala desde
  «Compartir → Agregar a inicio» y la abre a pantalla completa.
- El service worker solo cachea recursos estáticos versionados y una página sin conexión. **No cachea
  respuestas con datos financieros**: en un dispositivo compartido o perdido no queda información de la
  empresa fuera de la sesión.
- Si más adelante hace falta una app de tienda (notificaciones push en iOS antiguos, biometría), se
  empaqueta la misma PWA (Capacitor o TWA) sin reescribir lógica; en ese caso aplica OWASP MASVS.

## Servicios externos

Correo, almacenamiento de archivos y límite de intentos se usan a través de interfaces:

| Puerto | Desarrollo / CI | Producción |
|---|---|---|
| `EmailSender` | Archivos `.eml` en `.data/outbox` | Resend (API HTTPS, sin SDK) |
| `FileStorage` | Disco local en `storage/` | S3 compatible (Cloudflare R2, AWS S3) con `aws4fetch` |
| `RateLimiter` | PostgreSQL | PostgreSQL (Redis opcional) |

En producción, si un puerto obligatorio no está configurado, la aplicación lo informa en
`/api/health/ready` y la operación falla con un error explícito: nunca simula un envío ni guarda
archivos en un lugar temporal.
