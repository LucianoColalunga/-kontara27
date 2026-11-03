import "server-only";
import { env } from "@/server/platform/env";
import { getDb } from "@/server/platform/db";
import { OutboxEmailSender, ResendEmailSender } from "@/server/platform/email";
import { LocalFileStorage, S3FileStorage } from "@/server/platform/storage";
import { buildServices, type Services } from "@/server/services";

let services: Promise<Services> | undefined;

/** Servicios del proceso con la configuración real del entorno. */
export function getServices(): Promise<Services> {
  services ??= (async () => {
    const config = env();
    const db = await getDb();
    const email = config.EMAIL_PROVIDER === "resend" ? new ResendEmailSender(config.RESEND_API_KEY!, config.EMAIL_FROM) : new OutboxEmailSender();
    const storage =
      config.STORAGE_PROVIDER === "s3"
        ? new S3FileStorage({ endpoint: config.S3_ENDPOINT!, bucket: config.S3_BUCKET!, region: config.S3_REGION, accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! })
        : new LocalFileStorage();
    return buildServices({
      db,
      email,
      storage,
      encryptionKey: Buffer.from(config.ENCRYPTION_KEY, "base64"),
      signingKey: Buffer.from(config.SIGNING_KEY, "base64"),
      appUrl: config.APP_URL,
    });
  })().catch((error) => {
    services = undefined;
    throw error;
  });
  return services;
}
