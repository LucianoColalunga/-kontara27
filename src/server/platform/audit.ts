import "server-only";
import { auditEvents } from "@/server/db/schema";
import type { Executor } from "./db";
import { uuidv7 } from "./ids";
import { logger } from "./logger";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: RequestMeta;
}

/**
 * Escribe en el registro de auditoría (append-only en la base). Se llama con la misma transacción
 * de la operación: si la operación se revierte, el evento también.
 */
export async function recordAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditEvents).values({
    id: uuidv7(),
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    organizationId: entry.organizationId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ip: entry.request?.ip ?? null,
    userAgent: entry.request?.userAgent?.slice(0, 400) ?? null,
  });
  logger.info("audit", { action: entry.action, org: entry.organizationId, actor: entry.actorUserId, entity: entry.entityType });
}
