# Modelo de amenazas — KONTARA 27

Versión 1.0 · 2026-11-03 · Método: STRIDE por límite de confianza. Se revisa en cada cambio de arquitectura y,
como mínimo, una vez por trimestre.

> KONTARA 27 sigue como referencia OWASP ASVS 5.0, OWASP Top 10, NIST SP 800-63B (autenticación), NIST SSDF
> (SP 800-218) e ISO/IEC 27001:2022 Anexo A. Es una **alineación de diseño**: no hay certificación ni
> auditoría formal de terceros.

## 1. Activos

| Activo | Por qué importa |
| --- | --- |
| Datos financieros de cada empresa (movimientos, cuentas, presupuestos, reportes) | Confidencialidad entre empresas competidoras; integridad contable |
| Datos personales (nombre, correo, IP, país de residencia) | Ley 25.326, RGPD |
| Credenciales y factores (hash de contraseñas, secretos TOTP, códigos de recuperación, sesiones) | Toma de cuentas |
| Archivos (comprobantes, planillas originales importadas) | Suelen contener datos sensibles de terceros |
| Registro de auditoría | Prueba de quién hizo qué; tiene que ser inalterable |
| Claves de la plataforma (`ENCRYPTION_KEY`, `SIGNING_KEY`, `CRON_SECRET`, credenciales de base y bucket) | Su robo anula varios controles a la vez |

## 2. Actores

1. Visitante anónimo en internet.
2. Usuario autenticado de la empresa A que intenta ver o modificar datos de la empresa B.
3. Miembro con un rol bajo (solo lectura, empleado) que intenta escalar permisos dentro de su empresa.
4. Atacante con una sesión robada o con la contraseña filtrada de otro servicio.
5. Dependencia comprometida (cadena de suministro).
6. Operador de infraestructura o proveedor de nube con acceso a discos, backups o logs.

## 3. Límites de confianza

```
Navegador ──HTTPS──▶ Borde (Vercel) ──▶ App Next.js (proxy CSP → páginas, acciones, API)
                                           ├──▶ PostgreSQL (rol app_user, sin BYPASSRLS; RLS forzada)
                                           ├──▶ Bucket privado S3/R2 (URLs firmadas de 5 min)
                                           └──▶ Resend (correo transaccional)
Vercel Cron ──Bearer CRON_SECRET──▶ /api/cron/daily
```

## 4. Amenazas y controles

| # | STRIDE | Amenaza | Controles implementados | Riesgo residual |
| --- | --- | --- | --- | --- |
| T1 | Spoofing | Fuerza bruta o relleno de credenciales | Argon2id (m=19 MiB, t=2, p=1); límites por cuenta (8/15 min) y por IP (30/15 min) persistidos en PostgreSQL; MFA TOTP opcional con códigos de recuperación | Ataques distribuidos lentos contra cuentas sin MFA → promover MFA; evaluar passkeys (WebAuthn) |
| T2 | Spoofing | Enumeración de cuentas | Mismo mensaje y tiempo para correo inexistente y contraseña incorrecta (hash señuelo); alta y recuperación responden igual exista o no la cuenta | — |
| T3 | Spoofing | Robo o fijación de sesión | Token opaco de 256 bits, en base solo su SHA-256; cookie `__Host-` HttpOnly, Secure, SameSite=Lax; rotación al completar MFA; vencimiento deslizante (14 días) y absoluto (30 días); se invalidan al cambiar la contraseña; listado y cierre de sesiones | Malware en el equipo del usuario |
| T4 | Spoofing | Falsear la IP para esquivar límites | La IP solo se toma de cabeceras detrás de un proxy de confianza; en producción fuera de Vercel hay que declarar `TRUST_PROXY_HEADERS` | — |
| T5 | Tampering | CSRF sobre acciones del servidor | Next.js rechaza acciones cuyo `Origin` no coincide con el host; cookies SameSite=Lax; prueba E2E con envío forjado | — |
| T6 | Tampering / Info. disclosure | Empresa A accede a datos de B (IDOR) | RLS forzada en todas las tablas de negocio con `app.current_org_id()`; FK compuestas `(organization_id, id)`; la app arranca solo si su rol no puede saltear RLS; 404 sin distinguir inexistente de ajeno; pruebas de integración y E2E de aislamiento | Error humano en una migración futura → toda tabla nueva debe sumar política y prueba |
| T7 | Elevation | Escalada de rol dentro de la empresa | Permisos por rol verificados en la acción y de nuevo en el servicio; solo propietarios gestionan propietarios; no se puede quitar el último propietario | — |
| T8 | Tampering | Inyección SQL | Consultas parametrizadas (Drizzle); sin `sql.raw` con datos del usuario | — |
| T9 | Tampering | XSS | React escapa por defecto; sin `dangerouslySetInnerHTML`; CSP con nonce y `strict-dynamic`, sin `unsafe-inline` ni `unsafe-eval` en producción | — |
| T10 | Tampering | Archivos maliciosos (planillas, comprobantes) | Tipo verificado por contenido (firma), límites de tamaño; lector XLSX propio con límites anti zip-bomb y sin DTD (sin XXE); descargas con `Content-Disposition: attachment` y CSP `sandbox` | Malware dentro de un PDF legítimo → evaluar escaneo antivirus en el bucket |
| T11 | Tampering | Inyección de fórmulas en exportaciones | Textos que empiezan con `= + - @` se neutralizan en CSV y XLSX | — |
| T12 | Tampering | Redirección abierta | `safeNext` acepta solo rutas internas (sin `//`, `\`, segmentos `.`/`..` ni `/api`) | — |
| T13 | Repudiation | Negar una operación | Registro de auditoría de solo inserción (sin UPDATE/DELETE para el rol de la app) e historial de versiones de cada movimiento | Un operador con acceso de superusuario a la base → backups con retención e integridad verificable |
| T14 | Info. disclosure | Robo de backups o discos | Cifrado del proveedor en reposo; identificaciones fiscales y secretos TOTP cifrados además con AES-256-GCM en la aplicación | `ENCRYPTION_KEY` vive en variables de entorno → evaluar KMS y procedimiento de rotación |
| T15 | Info. disclosure | Fugas en logs | Logger con redacción de contraseñas, tokens, cookies y claves; IDs de pedido para correlacionar | — |
| T16 | Info. disclosure | Datos financieros en caché del navegador o la PWA | El service worker guarda solo estáticos y la página sin conexión; respuestas privadas `no-store` | — |
| T17 | DoS | Abuso de importaciones, exportaciones o correos | Límites por empresa (importaciones), por usuario (exportaciones) y por destinatario (correos de alta y verificación) | Ataques volumétricos → protección del borde (Vercel Firewall o WAF) |
| T18 | Elevation | Dependencia comprometida | Versiones exactas y lockfile; scripts de instalación solo para paquetes permitidos; acciones de CI fijadas por commit e imágenes de los escáneres por digest; el checkout de CI no guarda el token; Dependabot con espera de 7–14 días ante versiones nuevas; `npm audit`, Trivy y Semgrep | Ataque a un paquete popular antes de ser detectado |
| T19 | Spoofing | Llamadas falsas al cron | `Authorization: Bearer CRON_SECRET` comparado en tiempo constante | — |

## 5. Próximos pasos recomendados

1. Correr por primera vez el workflow **Seguridad** (Gitleaks, Semgrep, Trivy, ZAP) y resolver lo que aparezca.
2. Prueba de penetración externa antes del lanzamiento comercial.
3. Passkeys (WebAuthn) como segundo factor y como alternativa a la contraseña.
4. Gestión de claves en un KMS con rotación documentada.
5. Restauración de backups probada periódicamente (punto de recuperación y tiempo de recuperación medidos).
6. Alertas sobre eventos de seguridad del registro de auditoría (muchos fallos de ingreso, MFA desactivado, cambios de rol).
