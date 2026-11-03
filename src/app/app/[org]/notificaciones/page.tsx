import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Bell } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getServices } from "@/server/container";
import { formString } from "@/server/http/action";
import { requireTenant } from "@/server/http/session";

export const metadata: Metadata = { title: "Notificaciones" };

async function markAllRead(form: FormData) {
  "use server";
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).notifications.markAllRead(ctx);
  revalidatePath(`/app/${slug}`, "layout");
}

export default async function NotificationsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org);
  const list = await (await getServices()).notifications.list(ctx, 50);
  const unread = list.some((n) => !n.readAt);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notificaciones"
        description="Alertas de presupuesto y vencimientos de esta empresa."
        actions={
          unread ? (
            <form action={markAllRead}>
              <input type="hidden" name="org" value={ctx.organization.slug} />
              <button type="submit" className="text-[13px] font-semibold text-accent">
                Marcar todo como leído
              </button>
            </form>
          ) : null
        }
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title="Sin notificaciones" description="Cuando un presupuesto llegue a su umbral o se acerque un vencimiento, aparece acá." />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((n) => (
              <li key={n.id} className={n.readAt ? "" : "bg-accent-soft/40"}>
                <Link href={n.href?.startsWith("/app/") ? n.href : `/app/${ctx.organization.slug}`} className="flex items-start gap-3 px-5 py-4 hover:bg-surface-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} aria-label={n.readAt ? undefined : "Sin leer"} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{n.title}</span>
                    {n.body ? <span className="block text-[13px] text-muted">{n.body}</span> : null}
                  </span>
                  <span className="text-[12px] text-muted">{n.createdAt.toLocaleDateString(ctx.organization.locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
