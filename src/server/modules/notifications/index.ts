import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notifications } from "@/server/db/schema";
import { type Database, withTenant } from "@/server/platform/db";
import { type TenantContext, tenantScope } from "@/server/modules/tenancy";

/** Notificaciones dentro de la app (alertas de presupuesto, vencimientos). Cada usuario ve solo las suyas (RLS). */
export class NotificationService {
  constructor(private readonly db: Database) {}

  list(ctx: TenantContext, limit = 20) {
    return withTenant(this.db, tenantScope(ctx), (tx) => tx.select().from(notifications).where(eq(notifications.userId, ctx.userId)).orderBy(desc(notifications.createdAt)).limit(limit));
  }

  async unreadCount(ctx: TenantContext): Promise<number> {
    return withTenant(this.db, tenantScope(ctx), async (tx) => {
      const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
      return row?.n ?? 0;
    });
  }

  async markAllRead(ctx: TenantContext): Promise<void> {
    await withTenant(this.db, tenantScope(ctx), (tx) => tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt))));
  }
}
