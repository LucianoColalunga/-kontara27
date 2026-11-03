import { z } from "zod";

export const TAX_ID_TYPES = ["CUIT", "CUIL", "RUT", "RFC", "NIT", "RUC", "CNPJ", "NIF", "CIF", "VAT", "EIN", "OTRO"] as const;

/** Monedas habilitadas al crear una empresa (se puede ampliar sin migraciones). */
export const SUPPORTED_CURRENCIES = ["ARS", "USD", "EUR", "UYU", "CLP", "PYG", "BRL", "MXN", "COP", "PEN", "BOB", "GBP"] as const;

export const organizationInput = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre comercial.").max(120),
  legalName: z.string().trim().max(200).optional().transform((v) => v || null),
  taxIdType: z.enum(TAX_ID_TYPES).optional().nullable(),
  taxId: z.string().trim().max(40).optional().transform((v) => v || null),
  country: z.string().regex(/^[A-Z]{2}$/, "Elegí un país."),
  currency: z.enum(SUPPORTED_CURRENCIES, { error: "Elegí la moneda principal." }),
  timezone: z.string().min(3).max(64).refine(isValidTimeZone, "Zona horaria inválida."),
  locale: z.string().max(16).default("es-AR"),
  address: z
    .object({
      street: z.string().trim().max(200).optional(),
      city: z.string().trim().max(120).optional(),
      region: z.string().trim().max(120).optional(),
      postalCode: z.string().trim().max(20).optional(),
    })
    .optional(),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12).default(1),
});

export type OrganizationInput = z.infer<typeof organizationInput>;

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Valida el dígito verificador de un CUIT/CUIL argentino (módulo 11). */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "empresa"
  );
}

/** Slugs que chocarían con rutas de la aplicación. */
export const RESERVED_SLUGS = new Set(["nueva", "new", "admin", "api", "app", "cuenta", "settings", "ajustes", "invitaciones"]);
