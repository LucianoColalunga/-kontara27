import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Info, OctagonAlert } from "lucide-react";
import { Badge, buttonClass, Callout, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { KIND_INFO, type MovementKind } from "@/lib/movement-kinds";
import { formatMoney, minorToDecimalString, parseMoney } from "@/lib/money";
import { formatDate } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { cancelImportAction } from "../actions";
import { CommitForm, ExcludeForm, RowEditForm, SettingsForm } from "../forms";

export const metadata: Metadata = { title: "Revisar importación" };

const ROW_STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warning" | "critical" | "accent" }> = {
  ready: { label: "Lista", tone: "good" },
  needs_review: { label: "Revisar", tone: "warning" },
  blocked: { label: "Con errores", tone: "critical" },
  excluded: { label: "Excluida", tone: "neutral" },
  imported: { label: "Importada", tone: "accent" },
};

const severityIcon = { error: OctagonAlert, warning: AlertTriangle, info: Info } as const;

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ org: string; batchId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org, batchId } = await params;
  const q = await searchParams;
  const { ctx } = await requireTenant(org, "imports.run");
  const services = await getServices();
  const data = await services.imports.getBatch(ctx, batchId);
  const { batch, rows, stats, mapping, reconciliation } = data;
  const base = `/app/${ctx.organization.slug}`;
  const locale = ctx.organization.locale;
  const currency = batch.currency;
  const money = (v: bigint) => formatMoney(v, currency, locale);
  const declared = (v: string | null) => (v === null ? "—" : formatMoney(safeMinor(v, currency), currency, locale));
  const reviewing = batch.status === "review";
  const filter = q.estado && ROW_STATUS[q.estado] ? q.estado : "todas";
  const visibleRows = filter === "todas" ? rows : rows.filter((r) => r.status === filter);
  const toImportCount = (stats.ready ?? 0) + (stats.needs_review ?? 0);
  const findingCounts = reconciliation.findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <>
      <Link href={`${base}/importar`} className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Importaciones
      </Link>
      <PageHeader
        eyebrow={reviewing ? "Revisión" : batch.status === "committed" ? "Importada" : "Cancelada"}
        title={batch.sourceFilename}
        description={`${stats.total} filas leídas · moneda ${currency} · formato ${batch.format === "monthly_sheets" ? "hojas mensuales" : "tabla simple"}`}
        actions={
          <>
            <a href={`/api/orgs/${ctx.organization.slug}/imports/${batch.id}/informe`} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> Informe de migración
            </a>
            {batch.sourceFileId ? (
              <a href={services.documents.createDownloadLink(ctx, batch.sourceFileId, "import_source")} className={buttonClass("ghost")}>
                Archivo original
              </a>
            ) : null}
          </>
        }
      />

      {q.confirmada ? (
        <Callout tone="good" title="Importación confirmada y conciliada" className="mb-6">
          Los totales grabados coinciden al centavo con las filas importadas. <Link href={`${base}/movimientos?importacion=${batch.id}`} className="font-semibold text-accent">Ver los movimientos importados</Link>.
        </Callout>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {(["ready", "needs_review", "blocked", "excluded", "imported"] as const).map((s) => (
          <Link key={s} href={`${base}/importar/${batch.id}?estado=${s}`} className={`card p-4 hover:border-border-strong ${filter === s ? "ring-2 ring-accent" : ""}`}>
            <p className="text-[12px] font-semibold text-muted">{ROW_STATUS[s]!.label}</p>
            <p className="mt-1 text-[24px] font-bold">{stats[s] ?? 0}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Conciliación con la planilla" description="Declarado en la planilla vs. suma independiente de sus filas. Las diferencias se explican en los hallazgos." />
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">
                  <th className="py-2 pr-3">Hoja</th>
                  <th className="py-2 pr-3 text-right">Gastos declarados</th>
                  <th className="py-2 pr-3 text-right">Gastos (filas)</th>
                  <th className="py-2 pr-3 text-right">Ingresos declarados</th>
                  <th className="py-2 pr-3 text-right">Ingresos (filas)</th>
                  <th className="py-2 text-right">Resultado declarado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {reconciliation.sheets.map((s) => {
                  const expenseOk = s.declaredExpense === null || safeMinor(s.declaredExpense, currency) === s.sourceExpense;
                  const incomeOk = s.declaredIncome === null || safeMinor(s.declaredIncome, currency) === s.sourceIncome;
                  const netOk = s.declaredNet === null || safeMinor(s.declaredNet, currency) === s.sourceIncome - s.sourceExpense;
                  return (
                    <tr key={s.sheet}>
                      <td className="py-2 pr-3 font-semibold">{s.sheet}</td>
                      <td className="py-2 pr-3 text-right">{declared(s.declaredExpense)}</td>
                      <td className={`py-2 pr-3 text-right ${expenseOk ? "" : "font-semibold text-critical"}`}>{money(s.sourceExpense)}</td>
                      <td className="py-2 pr-3 text-right">{declared(s.declaredIncome)}</td>
                      <td className={`py-2 pr-3 text-right ${incomeOk ? "" : "font-semibold text-critical"}`}>{money(s.sourceIncome)}</td>
                      <td className={`py-2 text-right ${netOk ? "" : "font-semibold text-critical"}`}>
                        {declared(s.declaredNet)} {netOk ? null : <span className="block text-[11px] font-normal">real: {money(s.sourceIncome - s.sourceExpense)}</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right">{declared(reconciliation.workbook.declaredExpense)}</td>
                  <td className="py-2 pr-3 text-right">{money(reconciliation.totals.sourceExpense)}</td>
                  <td className="py-2 pr-3 text-right">{declared(reconciliation.workbook.declaredIncome)}</td>
                  <td className="py-2 pr-3 text-right">{money(reconciliation.totals.sourceIncome)}</td>
                  <td className="py-2 text-right">
                    {declared(reconciliation.workbook.declaredNet)}
                    <span className="block text-[11px] font-normal text-muted">real: {money(reconciliation.totals.sourceIncome - reconciliation.totals.sourceExpense)}</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-2 p-4">
                <p className="text-[12px] font-semibold text-muted">{reviewing ? "Se va a importar" : "Importado (verificado en la base)"}</p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {Object.entries(reviewing ? reconciliation.toImport : (reconciliation.imported ?? {})).map(([kind, total]) => (
                    <li key={kind} className="flex justify-between gap-3">
                      <span>{KIND_INFO[kind as MovementKind]?.label ?? kind}</span>
                      <span className="font-semibold tabular">{money(total as bigint)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-surface-2 p-4">
                <p className="text-[12px] font-semibold text-muted">Excluido o pendiente</p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  <li className="flex justify-between gap-3">
                    <span>Gastos excluidos</span>
                    <span className="font-semibold tabular">{money(reconciliation.totals.excludedExpense)}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span>Ingresos excluidos</span>
                    <span className="font-semibold tabular">{money(reconciliation.totals.excludedIncome)}</span>
                  </li>
                  <li className="flex justify-between gap-3">
                    <span>Filas sin datos para importar</span>
                    <span className="font-semibold tabular">{reconciliation.totals.pendingRows}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Hallazgos en la planilla" description={`${findingCounts.error ?? 0} errores · ${findingCounts.warning ?? 0} advertencias · ${findingCounts.info ?? 0} avisos`} />
          <ul className="space-y-3 p-5">
            {reconciliation.findings.length === 0 ? <li className="text-sm text-muted">Sin hallazgos: la planilla es consistente.</li> : null}
            {reconciliation.findings.map((f, i) => {
              const Icon = severityIcon[f.severity as keyof typeof severityIcon] ?? Info;
              return (
                <li key={i} className="flex gap-2.5 text-[13px]">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${f.severity === "error" ? "text-critical" : f.severity === "warning" ? "text-warning" : "text-muted"}`} aria-label={f.severity === "error" ? "Error" : f.severity === "warning" ? "Advertencia" : "Aviso"} />
                  <span className="text-text-2">
                    {f.message}
                    {f.impact ? <span className="font-semibold text-text"> Impacto: {formatMoney(safeMinor(f.impact, currency), currency, locale)}.</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Categorías y cuenta" description="Así se van a cargar las etiquetas de la planilla. Las correcciones sugeridas (como «Trasporte» → «Transporte») podés aceptarlas o elegir otra." />
        <div className="p-5">
          <SettingsForm org={ctx.organization.slug} batchId={batch.id} mapping={mapping} categories={data.categories} accounts={data.accounts} defaultAccountId={batch.defaultAccountId} disabled={!reviewing} />
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Filas" description="Cada fila conserva su celda de origen. Corregí las que tienen errores o excluilas con un motivo." />
        <nav className="flex flex-wrap gap-1 px-5 pt-4" aria-label="Filtrar filas">
          {["todas", "blocked", "needs_review", "ready", "excluded", "imported"].map((s) => (
            <Link key={s} href={`${base}/importar/${batch.id}?estado=${s}`} aria-current={filter === s ? "true" : undefined} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${filter === s ? "bg-ink text-ink-fg" : "text-text-2 hover:bg-surface-2"}`}>
              {s === "todas" ? `Todas (${stats.total})` : `${ROW_STATUS[s]!.label} (${stats[s] ?? 0})`}
            </Link>
          ))}
        </nav>
        <ul className="mt-3 divide-y divide-border">
          {visibleRows.map((r) => {
            const issues = (r.issues as Array<{ code: string; severity: string; message: string }>).filter((i) => i.severity !== "info");
            return (
              <li key={r.id} className="px-5 py-4">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                    <span className="w-24 text-[12px] font-semibold text-muted">{r.sourceRef}</span>
                    <span className="w-24 text-[13px] text-text-2 tabular">{r.occurredOn ? formatDate(r.occurredOn, locale) : "sin fecha"}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.description || <span className="text-muted">sin descripción</span>}</span>
                    <span className="text-[12px] text-muted">{r.categoryLabel ?? "sin categoría"}</span>
                    <span className="w-32 text-right text-[14px] font-semibold tabular">{r.amountMinor ? `${r.kind && KIND_INFO[r.kind].direction < 0 ? "−" : ""}${money(r.amountMinor)}` : "—"}</span>
                    <Badge tone={ROW_STATUS[r.status]?.tone}>{ROW_STATUS[r.status]?.label}</Badge>
                  </summary>
                  <div className="mt-4 space-y-4 rounded-xl bg-surface-2 p-4">
                    {issues.length ? (
                      <ul className="space-y-1.5 text-[13px]">
                        {issues.map((i, n) => (
                          <li key={n} className="flex gap-2">
                            {i.severity === "error" ? <OctagonAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-label="Error" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-label="Advertencia" />}
                            <span>{i.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex items-center gap-2 text-[13px] text-text-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-hidden /> Sin observaciones.
                      </p>
                    )}
                    <p className="text-[12px] text-muted">
                      Valores originales: {Object.entries(r.raw as Record<string, unknown>).filter(([k]) => !["sheet", "sheetMonth"].includes(k)).map(([k, v]) => `${k}: ${v ?? "vacío"}`).join(" · ")}
                    </p>
                    {r.excludeReason ? <p className="text-[13px]">Motivo de exclusión: {r.excludeReason}</p> : null}
                    {reviewing && r.status !== "excluded" ? (
                      <RowEditForm org={ctx.organization.slug} batchId={batch.id} row={{ id: r.id, occurredOn: r.occurredOn, kind: r.kind, amount: r.amountMinor ? minorToDecimalString(r.amountMinor, currency).replace(".", ",") : "", categoryLabel: r.categoryLabel, description: r.description }} />
                    ) : null}
                    {reviewing ? <ExcludeForm org={ctx.organization.slug} batchId={batch.id} rowId={r.id} excluded={r.status === "excluded"} /> : null}
                    {r.movementId ? (
                      <Link href={`${base}/movimientos/${r.movementId}`} className="text-[13px] font-semibold text-accent">
                        Ver movimiento creado
                      </Link>
                    ) : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>

      {reviewing ? (
        <Card className="mt-6 p-5 sm:p-7">
          <h2 className="text-[17px] font-semibold">Confirmar</h2>
          <p className="mt-1 mb-4 text-sm text-text-2">Se crean los movimientos en una sola operación. Si los totales grabados no coinciden con las filas al centavo, no se graba nada.</p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <CommitForm org={ctx.organization.slug} batchId={batch.id} blocked={stats.blocked ?? 0} toImport={toImportCount} />
            <form action={cancelImportAction}>
              <input type="hidden" name="org" value={ctx.organization.slug} />
              <input type="hidden" name="batchId" value={batch.id} />
              <button type="submit" className={buttonClass("ghost")}>
                Cancelar importación
              </button>
            </form>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function safeMinor(value: string, currency: string): bigint {
  try {
    return parseMoney(value, currency, { decimalSeparator: "." });
  } catch {
    return 0n;
  }
}
