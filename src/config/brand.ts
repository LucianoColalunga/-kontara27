/**
 * Identidad de la plataforma. Es el único lugar donde vive el nombre: cambiarlo acá (y volver a
 * correr `npm run brand:build`) renombra la interfaz, los correos, el manifest de la PWA y los logos.
 *
 * Usar siempre el nombre completo con el número (ver docs/brand/README.md).
 */
export const brand = {
  name: "KONTARA 27",
  /** Palabra del logotipo (sin el número). */
  wordmark: "KONTARA",
  numeral: "27",
  shortName: "Kontara 27",
  slug: "kontara27",
  tagline: "Finanzas claras para empresas que crecen.",
  description: "Gestión financiera multiempresa: ingresos, gastos, cuentas, presupuestos y reportes en un solo lugar.",
  colors: {
    ink: "#0B1A2E",
    accent: "#1D5BFF",
    accentSoft: "#E8EEFF",
    paper: "#F6F7F9",
  },
} as const;

export type Brand = typeof brand;
