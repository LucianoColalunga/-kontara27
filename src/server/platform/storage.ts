import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

/** Almacenamiento de archivos privados. Las claves las genera siempre el servidor. */
export interface FileStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  /** URL prefirmada de descarga directa si el proveedor la soporta; si no, la app sirve el archivo. */
  presignedDownloadUrl?(key: string, expiresInSeconds: number, filename: string): Promise<string>;
  readonly kind: "local" | "s3" | "memory";
}

const KEY_RE = /^[a-z0-9][a-z0-9/_-]{8,200}$/;

function assertKey(key: string) {
  // Sin «..», sin barras invertidas ni rutas absolutas: imposible salir del directorio o bucket.
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new Error("Clave de almacenamiento inválida");
}

export class LocalFileStorage implements FileStorage {
  readonly kind = "local" as const;
  constructor(private readonly root = path.resolve("storage")) {}

  private resolve(key: string) {
    assertKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Clave fuera del almacenamiento");
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.resolve(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export class MemoryFileStorage implements FileStorage {
  readonly kind = "memory" as const;
  readonly files = new Map<string, Uint8Array>();
  async put(key: string, data: Uint8Array) {
    assertKey(key);
    this.files.set(key, data);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

/** Bucket privado compatible con S3 (Cloudflare R2, AWS S3, MinIO) firmado con SigV4. */
export class S3FileStorage implements FileStorage {
  readonly kind = "s3" as const;
  private readonly client: AwsClient;

  constructor(private readonly config: { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string }) {
    this.client = new AwsClient({ accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region, service: "s3" });
  }

  private url(key: string) {
    assertKey(key);
    return `${this.config.endpoint.replace(/\/$/, "")}/${this.config.bucket}/${key}`;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), { method: "PUT", body: new Blob([new Uint8Array(data)]), headers: { "Content-Type": contentType } });
    if (!response.ok) throw new Error(`S3 PUT ${response.status}`);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`S3 GET ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`S3 DELETE ${response.status}`);
  }

  async presignedDownloadUrl(key: string, expiresInSeconds: number, filename: string): Promise<string> {
    const url = new URL(this.url(key));
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
    url.searchParams.set("response-content-disposition", `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"`);
    const signed = await this.client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
    return signed.url;
  }
}
