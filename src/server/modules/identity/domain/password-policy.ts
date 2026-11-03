/**
 * Política de contraseñas según NIST SP 800-63B: longitud antes que complejidad, sin reglas de
 * composición forzadas y con lista de contraseñas comunes o derivadas de los datos del usuario.
 */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// Contraseñas filtradas más frecuentes (subconjunto de listas públicas) y variantes locales.
const COMMON = new Set([
  "1234567890", "12345678910", "123456789012", "0123456789", "1111111111", "0000000000", "qwertyuiop",
  "password12", "password123", "passw0rd123", "contraseña", "contrasena", "contraseña1", "contrasena1",
  "contraseña123", "contrasena123", "iloveyou12", "abcdefghij", "asdfghjkl1", "zxcvbnm123", "qwerty1234",
  "1q2w3e4r5t", "1qaz2wsx3edc", "administrador", "administrator", "bienvenido1", "bienvenido123",
  "welcome123", "argentina1", "argentina123", "bocajuniors", "riverplate", "futbol1234", "dragon1234",
  "superman123", "monkey1234", "letmein123", "football12", "baseball12", "princesa12", "1234qwer",
  "q1w2e3r4t5", "aa12345678", "abc1234567", "password1!", "Password1!", "teamo12345", "estrella123",
]);

export interface PasswordContext {
  email?: string;
  name?: string;
}

/** Devuelve un mensaje de error o null si la contraseña es aceptable. */
export function checkPassword(password: string, context: PasswordContext = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Usá al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Usá como máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(password)) return "Esa contraseña es muy común. Elegí otra.";
  if (/^(.)\1+$/.test(password)) return "No uses un mismo carácter repetido.";
  if (isSequence(lower)) return "No uses secuencias como 1234567890 o abcdefghij.";
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "No uses tu correo dentro de la contraseña.";
  const names = (context.name ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (names.some((n) => lower.includes(n))) return "No uses tu nombre dentro de la contraseña.";
  return null;
}

function isSequence(value: string): boolean {
  const sequences = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiopasdfghjklzxcvbnm"];
  return sequences.some((s) => s.includes(value) || s.split("").reverse().join("").includes(value));
}
