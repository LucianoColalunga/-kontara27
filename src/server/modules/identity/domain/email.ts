import { z } from "zod";

/** Normaliza para comparar y como clave única. No quita puntos ni sufijos «+»: eso cambia de dueño según el proveedor. */
export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFC").toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .max(254, "El correo es demasiado largo.")
  .pipe(z.email("Ingresá un correo válido."));
