import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { files, movementAttachments, movements, organizations } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { constantTimeEqual, hmacSha256, sha256Hex } from "@/server/platform/crypto";
import { type Database, withTenant } from "@/server/platform/db";
import { NotFoundError, ValidationError } from "@/server/platform/errors";
import { ATTACHMENT_TYPES, IMAGE_TYPES, MAX_ATTACHMENT_BYTES, safeFilename, sniffFileType } from "@/server/platform/file-types";
import { uuidv7 } from "@/server/platform/ids";
import type { FileStorage } from "@/server/platform/storage";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";

const LINK_TTL_SECONDS = 5 * 60;

export interface DocumentDeps {
  db: Database;
  storage: FileStorage;
  signingKey: Buffer;
  clock: Clock;
}

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

export class DocumentService {
  constructor(private readonly deps: DocumentDeps) {}

  /** Guarda un archivo privado de la organización y devuelve su id. Uso interno de otros módulos. */
  async storeFile(ctx: TenantContext, upload: UploadedFile, purpose: "attachment" | "import_source" | "logo", allowed: Set<string>, maxBytes: number): Promise<{ id: string; mime: string; sha256: string }> {
    if (upload.bytes.byteLength === 0) throw new ValidationError("El archivo está vacío.");
    if (upload.bytes.byteLength > maxBytes) throw new ValidationError(`El archivo supera el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    const detected = sniffFileType(upload.bytes);
    if (!detected || !allowed.has(detected.mime)) throw new ValidationError("Tipo de archivo no permitido. Usá PDF, PNG, JPG, WEBP o HEIC.");
    const id = uuidv7();
    const sha256 = sha256Hex(upload.bytes);
    const storageKey = `org/${ctx.organizationId}/${id}`;
    await this.deps.storage.put(storageKey, upload.bytes, detected.mime);
    try {
      await withTenant(this.deps.db, tenantScope(ctx), (tx) =>
        tx.insert(files).values({ id, organizationId: ctx.organizationId, storageKey, originalName: safeFilename(upload.name, detected.extension), contentType: detected.mime, sizeBytes: upload.bytes.byteLength, sha256, purpose, uploadedBy: ctx.userId }),
      );
    } catch (error) {
      await this.deps.storage.delete(storageKey);
      throw error;
    }
    return { id, mime: detected.mime, sha256 };
  }

  async attachToMovement(ctx: TenantContext, movementId: string, upload: UploadedFile, meta: RequestMeta): Promise<string> {
    authorize(ctx, "documents.upload");
    const exists = await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [m] = await tx.select({ id: movements.id }).from(movements).where(and(eq(movements.id, movementId), isNull(movements.deletedAt))).limit(1);
      return Boolean(m);
    });
    if (!exists) throw new NotFoundError("El movimiento no existe.");
    const stored = await this.storeFile(ctx, upload, "attachment", ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES);
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await tx.insert(movementAttachments).values({ organizationId: ctx.organizationId, movementId, fileId: stored.id });
      await recordAudit(tx, { action: "document.attached", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "movement", entityId: movementId, metadata: { fileId: stored.id, mime: stored.mime }, request: meta });
    });
    return stored.id;
  }

  async listForMovement(ctx: TenantContext, movementId: string) {
    authorize(ctx, "documents.view");
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: files.id, name: files.originalName, contentType: files.contentType, sizeBytes: files.sizeBytes, createdAt: files.createdAt })
        .from(movementAttachments)
        .innerJoin(files, eq(files.id, movementAttachments.fileId))
        .where(and(eq(movementAttachments.movementId, movementId), isNull(files.deletedAt)))
        .orderBy(desc(files.createdAt)),
    );
  }

  async removeAttachment(ctx: TenantContext, fileId: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "documents.delete");
    const key = await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [file] = await tx.select().from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt), eq(files.purpose, "attachment"))).limit(1);
      if (!file) throw new NotFoundError();
      await tx.delete(movementAttachments).where(eq(movementAttachments.fileId, fileId));
      await tx.update(files).set({ deletedAt: this.deps.clock.now() }).where(eq(files.id, fileId));
      await recordAudit(tx, { action: "document.deleted", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "file", entityId: fileId, request: meta });
      return file.storageKey;
    });
    await this.deps.storage.delete(key);
  }

  async setLogo(ctx: TenantContext, upload: UploadedFile, meta: RequestMeta): Promise<void> {
    authorize(ctx, "org.manage");
    const stored = await this.storeFile(ctx, upload, "logo", IMAGE_TYPES, 2 * 1024 * 1024);
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await tx.update(organizations).set({ logoFileId: stored.id, updatedAt: this.deps.clock.now() }).where(eq(organizations.id, ctx.organizationId));
      await recordAudit(tx, { action: "organization.logo_updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "file", entityId: stored.id, request: meta });
    });
  }

  // ---------------------------------------------------------------- Enlaces temporales

  private signature(fileId: string, userId: string, expires: number) {
    return hmacSha256(this.deps.signingKey, `file:${fileId}:${userId}:${expires}`);
  }

  /**
   * Enlace firmado, ligado al usuario y válido 5 minutos. La ruta además vuelve a verificar la sesión,
   * RLS y el permiso según el tipo de archivo (comprobante o planilla de importación).
   */
  createDownloadLink(ctx: TenantContext, fileId: string, purpose: "attachment" | "import_source" = "attachment"): string {
    authorize(ctx, purpose === "import_source" ? "imports.run" : "documents.view");
    const expires = Math.floor(this.deps.clock.now().getTime() / 1000) + LINK_TTL_SECONDS;
    const sig = this.signature(fileId, ctx.userId, expires);
    return `/api/files/${fileId}?org=${encodeURIComponent(ctx.organization.slug)}&exp=${expires}&sig=${sig}`;
  }

  verifyDownloadLink(fileId: string, userId: string, expires: number, signature: string): boolean {
    if (!Number.isFinite(expires) || expires < Math.floor(this.deps.clock.now().getTime() / 1000)) return false;
    return constantTimeEqual(this.signature(fileId, userId, expires), signature);
  }

  async readFile(ctx: TenantContext, fileId: string): Promise<{ name: string; contentType: string; bytes: Uint8Array } | { redirect: string }> {
    const file = await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [row] = await tx.select().from(files).where(and(eq(files.id, fileId), isNull(files.deletedAt))).limit(1);
      return row;
    });
    if (!file) throw new NotFoundError();
    if (file.purpose === "import_source") authorize(ctx, "imports.run");
    else if (file.purpose === "attachment") authorize(ctx, "documents.view");
    if (this.deps.storage.presignedDownloadUrl) {
      return { redirect: await this.deps.storage.presignedDownloadUrl(file.storageKey, 60, file.originalName) };
    }
    const bytes = await this.deps.storage.get(file.storageKey);
    if (!bytes) throw new NotFoundError();
    return { name: file.originalName, contentType: file.contentType, bytes };
  }
}
