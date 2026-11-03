import "server-only";
import { z } from "zod";

const base64Key = z
  .string()
  .min(1)
  .refine((v) => Buffer.from(v, "base64").length === 32, "debe ser una clave de 32 bytes en base64");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().startsWith("postgres"),
    ENCRYPTION_KEY: base64Key,
    SIGNING_KEY: base64Key,
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("KONTARA 27 <no-reply@example.com>"),
    RESEND_API_KEY: z.string().optional(),
    /** Con EMAIL_PROVIDER=console: carpeta de los correos (por defecto .data/outbox). Las pruebas E2E usan la suya. */
    EMAIL_OUTBOX_DIR: z.string().min(1).optional(),
    STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
    /** Con STORAGE_PROVIDER=local: carpeta de los archivos (por defecto ./storage). */
    LOCAL_STORAGE_DIR: z.string().min(1).optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    CRON_SECRET: z.string().min(16).optional(),
    /** Solo detrás de un proxy de confianza (Vercel lo es) se leen las cabeceras de IP del cliente. */
    TRUST_PROXY_HEADERS: z.enum(["true", "false"]).optional(),
    VERCEL: z.string().optional(),
    /**
     * Solo para probar el build de producción en la propia máquina (npm run start:local): admite http,
     * correo de consola y disco local. Se rechaza si APP_URL no es de loopback o si corre en Vercel.
     */
    LOCAL_PRODUCTION_PREVIEW: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    const localPreview = env.LOCAL_PRODUCTION_PREVIEW === "true";
    if (localPreview && (env.VERCEL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.APP_URL).hostname))) {
      ctx.addIssue({ code: "custom", path: ["LOCAL_PRODUCTION_PREVIEW"], message: "solo se permite con APP_URL local y fuera de Vercel" });
    }
    if (!localPreview) {
      if (!env.APP_URL.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "en producción debe ser https" });
      if (env.EMAIL_PROVIDER !== "resend") ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "en producción los correos se envían de verdad (resend)" });
      if (env.STORAGE_PROVIDER !== "s3") ctx.addIssue({ code: "custom", path: ["STORAGE_PROVIDER"], message: "en producción los archivos van a un bucket privado (s3)" });
      // Fuera de Vercel hay que decidirlo a conciencia: de esto depende de dónde sale la IP para los límites.
      if (!env.VERCEL && !env.TRUST_PROXY_HEADERS) ctx.addIssue({ code: "custom", path: ["TRUST_PROXY_HEADERS"], message: "definila: true detrás de un proxy que fije X-Real-IP; false si la app recibe el tráfico directo" });
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "requerida" });
    for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (env.STORAGE_PROVIDER === "s3" && !env[key]) ctx.addIssue({ code: "custom", path: [key], message: "requerida" });
    }
    if (!env.CRON_SECRET) ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "requerida" });
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Variables de entorno validadas. Falla al primer uso si falta algo: nunca arranca a medias. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => env().NODE_ENV === "production";
