import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { SUPPORTED_CURRENCIES } from "@/server/modules/tenancy";
import { UploadForm } from "./forms";

export const metadata: Metadata = { title: "Importar planilla" };

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warning" }> = { review: { label: "En revisión", tone: "warning" }, committed: { label: "Importada", tone: "good" }, cancelled: { label: "Cancelada", tone: "neutral" } };

export default async function ImportPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org, "imports.run");
  const batches = await (await getServices()).imports.listBatches(ctx);
  const base = `/app/${ctx.organization.slug}`;
  return (
    <>
      <PageHeader title="Importar planilla" description="Traé tu historial desde Excel. Nada se graba hasta que revises cada fila, resuelvas los errores y confirmes; al final conciliamos los totales al centavo." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-5 sm:p-7">
          <UploadForm org={ctx.organization.slug} currencies={[ctx.organization.currency, ...SUPPORTED_CURRENCIES.filter((c) => c !== ctx.organization.currency)]} defaultCurrency={ctx.organization.currency} />
        </Card>
        <Card className="p-5 sm:p-7">
          <h2 className="text-[15px] font-semibold">Qué formatos reconoce</h2>
          <ul className="mt-3 space-y-3 text-[14px] text-text-2">
            <li>
              <span className="font-semibold text-text">Hojas mensuales:</span> una hoja por mes (ENERO, FEBRERO…) con columnas Fecha, Categoría, Descripción, Gasto e Ingreso, y una hoja de totales.
            </li>
            <li>
              <span className="font-semibold text-text">Tabla simple:</span> una hoja con Fecha, Descripción, Categoría e Importe (negativo = gasto) o columnas Debe/Haber.
            </li>
            <li>Detecta fórmulas que no suman todo, totales escritos a mano, filas incompletas, fechas fuera de su mes, duplicados y devoluciones cargadas como ingresos.</li>
            <li>No completa importes, fechas ni categorías que no se puedan determinar.</li>
          </ul>
        </Card>
      </div>
      {batches.length ? (
        <Card className="mt-6">
          <CardHeader title="Importaciones anteriores" />
          <ul className="mt-3 divide-y divide-border">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`${base}/importar/${b.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[14px] hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{b.filename}</span>
                  <span className="text-[12px] text-muted">{b.rows} filas</span>
                  <span className="text-[12px] text-muted">{b.createdAt.toLocaleDateString(ctx.organization.locale)}</span>
                  <Badge tone={STATUS[b.status]?.tone}>{STATUS[b.status]?.label ?? b.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
