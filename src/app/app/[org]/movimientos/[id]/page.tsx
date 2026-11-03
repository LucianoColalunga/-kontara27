import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle, FileText, History, RotateCcw } from "lucide-react";
import { Money } from "@/components/ui/money";
import { Badge, buttonClass, Callout, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { KIND_INFO, type MovementKind } from "@/lib/movement-kinds";
import { minorToDecimalString } from "@/lib/money";
import { formatDate } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can } from "@/server/modules/tenancy";
import { reconcileAction, removeAttachmentAction, restoreMovementAction } from "../actions";
import { MovementForm } from "../movement-form";
import { loadMovementFormOptions } from "../options";
import { DeleteMovementForm, UploadAttachmentForm } from "./client-forms";

export const metadata: Metadata = { title: "Movimiento" };

const FIELD_LABELS: Record<string, string> = { occurred_on: "Fecha", amount_minor: "Importe", description: "Descripción", category_id: "Categoría", account_id: "Cuenta", counter_account_id: "Cuenta de destino", kind: "Tipo", status: "Estado", notes: "Notas", reference: "Comprobante", sector_id: "Sector", payment_method_id: "Medio de pago" };

export default async function MovementPage({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org, id } = await params;
  const { creado } = await searchParams;
  const { ctx } = await requireTenant(org, "movements.view");
  const services = await getServices();
  const movement = await services.movements.get(ctx, id);
  const [history, attachments, options] = await Promise.all([services.movements.history(ctx, id), can(ctx, "documents.view") ? services.documents.listForMovement(ctx, id) : [], loadMovementFormOptions(ctx)]);
  const base = `/app/${ctx.organization.slug}`;
  const locale = ctx.organization.locale;
  const kind = movement.kind as MovementKind;
  const direction = KIND_INFO[kind].direction;
  const editable = can(ctx, "movements.update") && !movement.deletedAt;

  // Cambios entre versiones consecutivas: cada revisión guarda el estado ANTERIOR al cambio.
  const versions = [...history].reverse().map((h) => h.snapshot as Record<string, unknown>);
  versions.push({ ...movement, occurred_on: movement.occurredOn, amount_minor: movement.amountMinor.toString(), category_id: movement.categoryId, account_id: movement.accountId, counter_account_id: movement.counterAccountId, sector_id: movement.sectorId, payment_method_id: movement.paymentMethodId });
  const diffs = history.map((h, index) => {
    const before = versions[history.length - 1 - index]!;
    const after = versions[history.length - index]!;
    const changed = Object.keys(FIELD_LABELS).filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""));
    return { ...h, changed };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`${base}/movimientos`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Movimientos
      </Link>
      <PageHeader
        eyebrow={KIND_INFO[kind].label}
        title={movement.description || KIND_INFO[kind].label}
        description={
          <>
            {formatDate(movement.occurredOn, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
            <Money minor={direction === 0 ? movement.amountMinor : BigInt(direction) * movement.amountMinor} currency={movement.currency} locale={locale} signed={direction !== 0} className="font-semibold text-text" />
          </>
        }
        actions={
          <>
            {can(ctx, "movements.reconcile") && !movement.deletedAt && movement.status === "completed" ? (
              <form action={reconcileAction}>
                <input type="hidden" name="org" value={ctx.organization.slug} />
                <input type="hidden" name="id" value={movement.id} />
                <input type="hidden" name="value" value={movement.reconciledAt ? "0" : "1"} />
                <button type="submit" className={buttonClass(movement.reconciledAt ? "secondary" : "ink")}>
                  {movement.reconciledAt ? <CheckCircle2 className="h-4 w-4 text-good" aria-hidden /> : <Circle className="h-4 w-4" aria-hidden />}
                  {movement.reconciledAt ? "Conciliado" : "Marcar conciliado"}
                </button>
              </form>
            ) : null}
            {can(ctx, "movements.delete") && !movement.deletedAt ? <DeleteMovementForm org={ctx.organization.slug} id={movement.id} /> : null}
          </>
        }
      />
      {creado ? <Callout tone="good" className="mb-4">Movimiento guardado.</Callout> : null}
      {movement.deletedAt ? (
        <Callout tone="warning" title="Movimiento eliminado" className="mb-6">
          Motivo: {movement.deleteReason}.{" "}
          {can(ctx, "movements.delete") ? (
            <form action={restoreMovementAction} className="inline">
              <input type="hidden" name="org" value={ctx.organization.slug} />
              <input type="hidden" name="id" value={movement.id} />
              <button type="submit" className="inline-flex items-center gap-1 font-semibold text-accent">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar
              </button>
            </form>
          ) : null}
        </Callout>
      ) : null}
      {movement.importRowRef ? <Callout tone="info" className="mb-6">Importado de una planilla (celda de origen: {movement.importRowRef}).</Callout> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-7">
          {editable ? (
            <MovementForm
              org={ctx.organization.slug}
              options={options}
              mode="edit"
              canAttach={false}
              defaults={{
                id: movement.id,
                version: movement.version,
                typeId: movement.typeId,
                occurredOn: movement.occurredOn,
                amount: minorToDecimalString(movement.amountMinor, movement.currency).replace(".", ","),
                categoryId: movement.categoryId,
                accountId: movement.accountId,
                counterAccountId: movement.counterAccountId,
                sectorId: movement.sectorId,
                paymentMethodId: movement.paymentMethodId,
                description: movement.description,
                notes: movement.notes,
                reference: movement.reference,
                status: movement.status,
              }}
            />
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Estado</dt>
                <dd className="font-medium">{movement.status === "completed" ? "Realizado" : movement.status === "pending" ? "Pendiente" : "Anulado"}</dd>
              </div>
              <div>
                <dt className="text-muted">Comprobante</dt>
                <dd className="font-medium">{movement.reference ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Notas</dt>
                <dd className="font-medium whitespace-pre-wrap">{movement.notes ?? "—"}</dd>
              </div>
            </dl>
          )}
        </Card>

        <div className="space-y-6">
          {can(ctx, "documents.view") ? (
            <Card>
              <CardHeader title="Comprobantes" description="Privados. Los enlaces de descarga vencen a los 5 minutos." />
              <ul className="mt-3 divide-y divide-border">
                {attachments.length === 0 ? <li className="px-5 py-3 text-sm text-muted">Sin comprobantes adjuntos.</li> : null}
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-[14px]">
                    <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a href={services.documents.createDownloadLink(ctx, a.id)} className="min-w-0 flex-1 truncate font-medium hover:text-accent">
                      {a.name}
                    </a>
                    <span className="text-[12px] text-muted">{Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
                    {can(ctx, "documents.delete") ? (
                      <form action={removeAttachmentAction}>
                        <input type="hidden" name="org" value={ctx.organization.slug} />
                        <input type="hidden" name="id" value={movement.id} />
                        <input type="hidden" name="fileId" value={a.id} />
                        <button type="submit" className="text-[12px] font-semibold text-critical hover:underline">
                          Quitar
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
              {can(ctx, "documents.upload") && !movement.deletedAt ? (
                <div className="border-t border-border p-5">
                  <UploadAttachmentForm org={ctx.organization.slug} id={movement.id} />
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Historial" description="Cada cambio queda registrado y no se puede borrar." />
            <ol className="space-y-4 p-5">
              {diffs.map((h) => (
                <li key={h.id} className="flex gap-3 text-[13px]">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <div>
                    <p className="font-semibold">
                      {h.operation === "delete" ? "Eliminado" : h.operation === "restore" ? "Restaurado" : "Editado"} por {h.changedByName ?? "sistema"}
                    </p>
                    <p className="text-muted">{h.changedAt.toLocaleString(locale, { timeZone: ctx.organization.timezone })}</p>
                    {h.changed.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {h.changed.map((c) => (
                          <Badge key={c}>{FIELD_LABELS[c]}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
              <li className="flex gap-3 text-[13px]">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div>
                  <p className="font-semibold">Creado</p>
                  <p className="text-muted">{movement.createdAt.toLocaleString(locale, { timeZone: ctx.organization.timezone })}</p>
                </div>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
