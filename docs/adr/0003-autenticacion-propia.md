# ADR 0003 — Autenticación propia con sesiones opacas, Argon2id y TOTP

- Estado: aceptado
- Fecha: 2026-11-03

## Contexto

Requisitos: Argon2id, MFA opcional, verificación de correo, recuperación segura, revocación de sesiones
y cierre en otros dispositivos, límite de intentos y protección contra enumeración de usuarios.

## Opciones

- **Proveedor gestionado (Auth0, Clerk, Supabase Auth)**: rápido, pero agrega un procesador de datos
  personales, costo por usuario activo y en algunos casos bcrypt en lugar de Argon2id.
- **Librería (Auth.js, Better Auth)**: menos código propio, pero mucha superficie configurable y
  dependencias que cambian rápido.
- **Implementación propia** con primitivas probadas.

## Decisión

Implementación propia, siguiendo OWASP ASVS v4 (cap. 2 y 3) y NIST SP 800-63B:

- Hash: `@node-rs/argon2` (Argon2id, m = 19 456 KiB, t = 2, p = 1). Para usuarios inexistentes se
  verifica contra un hash señuelo, así el tiempo de respuesta no revela si la cuenta existe.
- Sesiones: token de 32 bytes aleatorios en cookie; la base guarda `sha256(token)`. Vida de 14 días
  deslizante con tope absoluto de 30. Las acciones sensibles exigen reautenticación reciente.
- TOTP RFC 6238 implementado sobre `node:crypto` y verificado con los vectores del RFC; secretos cifrados
  con AES-256-GCM; protección contra reutilización del mismo código; 10 códigos de recuperación de un
  solo uso guardados como hash.
- Tokens de verificación y recuperación: aleatorios, hasheados, de un solo uso, con vencimiento (24 h y
  30 min). Cambiar la contraseña revoca todas las sesiones.
- Los enlaces de los correos se arman con `APP_URL` de la configuración, nunca con la cabecera `Host`.
- Límite de intentos persistido en PostgreSQL (ventana fija por IP y por cuenta), reemplazable por Redis
  detrás de la misma interfaz.

## Consecuencias

- Sin terceros procesando credenciales ni costo por usuario.
- Más código propio que auditar: por eso cada flujo tiene pruebas unitarias e integración, y la
  auditoría de seguridad lo revisa línea por línea.
- Inicio de sesión con Google/Microsoft (OIDC) queda como extensión futura del mismo módulo.
