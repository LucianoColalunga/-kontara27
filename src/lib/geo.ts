/** Países frecuentes (ISO 3166-1 alfa-2) y su zona horaria y moneda sugeridas al crear una empresa. */
export const COUNTRIES: Array<{ code: string; name: string; timezone: string; currency: string }> = [
  { code: "AR", name: "Argentina", timezone: "America/Argentina/Buenos_Aires", currency: "ARS" },
  { code: "UY", name: "Uruguay", timezone: "America/Montevideo", currency: "UYU" },
  { code: "CL", name: "Chile", timezone: "America/Santiago", currency: "CLP" },
  { code: "PY", name: "Paraguay", timezone: "America/Asuncion", currency: "PYG" },
  { code: "BO", name: "Bolivia", timezone: "America/La_Paz", currency: "BOB" },
  { code: "PE", name: "Perú", timezone: "America/Lima", currency: "PEN" },
  { code: "CO", name: "Colombia", timezone: "America/Bogota", currency: "COP" },
  { code: "MX", name: "México", timezone: "America/Mexico_City", currency: "MXN" },
  { code: "BR", name: "Brasil", timezone: "America/Sao_Paulo", currency: "BRL" },
  { code: "US", name: "Estados Unidos", timezone: "America/New_York", currency: "USD" },
  { code: "ES", name: "España", timezone: "Europe/Madrid", currency: "EUR" },
  { code: "IT", name: "Italia", timezone: "Europe/Rome", currency: "EUR" },
  { code: "DE", name: "Alemania", timezone: "Europe/Berlin", currency: "EUR" },
  { code: "FR", name: "Francia", timezone: "Europe/Paris", currency: "EUR" },
  { code: "PT", name: "Portugal", timezone: "Europe/Lisbon", currency: "EUR" },
  { code: "GB", name: "Reino Unido", timezone: "Europe/London", currency: "GBP" },
  { code: "ZZ", name: "Otro país", timezone: "UTC", currency: "USD" },
];

export const TIMEZONES = [...new Set([...COUNTRIES.map((c) => c.timezone), "America/Argentina/Cordoba", "America/Argentina/Mendoza", "America/Caracas", "America/Guayaquil", "America/Los_Angeles", "America/Chicago", "UTC"])].sort();
