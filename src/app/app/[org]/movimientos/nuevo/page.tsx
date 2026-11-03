import type { Metadata } from "next";
import { Callout, Card, PageHeader } from "@/components/ui/primitives";
import { todayIn } from "@/lib/periods";
import { requireTenant } from "@/server/http/session";
import { MovementForm } from "../movement-form";
import { loadMovementFormOptions } from "../options";

export const metadata: Metadata = { title: "Nuevo movimiento" };

export default async function NewMovementPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const { creado, tipo } = await searchParams;
  const { ctx } = await requireTenant(org, "movements.create");
  const options = await loadMovementFormOptions(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nuevo movimiento" description="El tipo define si suma, resta o se mueve entre tus cuentas. Las transferencias no cuentan como ingreso ni gasto." />
      {creado ? <Callout tone="good" className="mb-4">Movimiento guardado. Podés cargar el siguiente.</Callout> : null}
      <Card className="p-5 sm:p-7">
        <MovementForm org={ctx.organization.slug} options={options} defaults={{ occurredOn: todayIn(ctx.organization.timezone), typeId: options.types.find((t) => t.baseKind === tipo)?.id }} mode="create" canAttach={ctx.permissions.has("documents.upload")} />
      </Card>
    </div>
  );
}
