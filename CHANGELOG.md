# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones según
[SemVer](https://semver.org/lang/es/).

## [0.1.0] — 2026-11-03

Primera versión funcional, sin instalación de producción todavía.

### Agregado

- Arquitectura modular sobre Next.js 16 y PostgreSQL con aislamiento por empresa mediante Row-Level
  Security, roles de base separados (`app_owner` / `app_user`) y verificación al arrancar.
- Identidad: alta con verificación de correo, ingreso, recuperación de contraseña, MFA TOTP con códigos de
  recuperación, sesiones con cierre remoto, reautenticación para operaciones sensibles.
- Empresas, equipo, invitaciones, roles del sistema y roles propios, registro de auditoría.
- Movimientos con tipos configurables, adjuntos, historial y borrado controlado; cuentas y cajas con
  conciliación; presupuestos con alertas; vencimientos y notificaciones.
- Reportes (estado de resultados, flujo de caja, categorías, comparaciones, saldos) con exportación a Excel,
  CSV y PDF.
- Importador de planillas con revisión fila por fila, exclusiones con motivo, conciliación contra los totales
  de la planilla e informe de migración.
- Privacidad: políticas en borrador, preferencias de cookies con registro de consentimiento, exportación y
  supresión de datos personales.
- Identidad visual KONTARA 27, sistema de diseño claro/oscuro, manual de marca en `/marca` y PWA instalable.
- Pruebas unitarias, de integración (PostgreSQL real) y E2E sobre el build de producción, con accesibilidad
  (axe) y diseño en celular.
- CI (calidad, integración, E2E), workflow de seguridad (Gitleaks, Semgrep, Trivy, npm audit, OWASP ZAP),
  CodeQL y Dependabot.
- Licencia: código público para lectura y auditoría, todos los derechos reservados.
- Documentación: arquitectura, ADR, despliegue, modelo de amenazas, informe de seguridad y marca.

### Seguridad

- La IP del cliente solo se toma de cabeceras detrás de un proxy de confianza (KS-01).
- Límite de correos de alta por destinatario (KS-02).
- Ids ajenos o mal formados en la URL responden 404 (KS-03).
- Marcas de tiempo de identidad desde un único reloj (KS-04).
- Cifrado AES-GCM con etiqueta de autenticación de largo fijo (KS-07).
- Aislamiento entre orígenes con COEP y CORP (KS-08).
- El destino `next` del ingreso se valida también al mostrar el formulario.
- Cadena de suministro: acciones de GitHub fijadas por commit, imágenes de los escáneres fijadas por versión y
  digest, checkout de CI sin token persistido, espera de Dependabot antes de proponer versiones nuevas y runners
  con imagen fija.
- esbuild de desarrollo actualizado por override (KS-05).

Detalle en el [informe de seguridad](docs/security/informe-2026-11-03.md).
