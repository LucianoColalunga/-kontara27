"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { type ActionState, formFile, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

export async function uploadImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  let batchId = "";
  const result = await runAction(async () => {
    const { ctx } = await requireTenant(slug, "imports.run");
    const file = formFile(form, "file");
    if (!file) return { ok: false, message: "Elegí el archivo .xlsx." };
    batchId = await (await getServices()).imports.preview(ctx, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { currency: formString(form, "currency") || undefined }, await requestMeta());
  });
  if (!result.ok) return result;
  redirect(`/app/${slug}/importar/${batchId}`);
}

export async function saveImportSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const batchId = formString(form, "batchId");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug, "imports.run");
    const mapping: Record<string, string | null> = {};
    for (const [key, value] of form.entries()) {
      if (key.startsWith("map:") && typeof value === "string") mapping[key.slice(4)] = value && value !== "__new" ? value : null;
    }
    await (await getServices()).imports.updateSettings(ctx, batchId, { mapping, defaultAccountId: formString(form, "defaultAccountId") || null }, await requestMeta());
    revalidatePath(`/app/${slug}/importar/${batchId}`);
    return { ok: true, message: "Configuración guardada." };
  });
}

export async function updateImportRowAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const batchId = formString(form, "batchId");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug, "imports.run");
    await (await getServices()).imports.updateRow(ctx, batchId, formString(form, "rowId"), { occurredOn: formString(form, "occurredOn"), kind: formString(form, "kind"), amount: formString(form, "amount"), categoryLabel: formString(form, "categoryLabel"), description: formString(form, "description") }, await requestMeta());
    revalidatePath(`/app/${slug}/importar/${batchId}`);
    return { ok: true, message: "Fila actualizada." };
  });
}

export async function excludeImportRowAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const batchId = formString(form, "batchId");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug, "imports.run");
    const exclude = formString(form, "exclude") === "1";
    await (await getServices()).imports.setRowExcluded(ctx, batchId, formString(form, "rowId"), exclude, formString(form, "reason"), await requestMeta());
    revalidatePath(`/app/${slug}/importar/${batchId}`);
    return { ok: true, message: exclude ? "Fila excluida." : "Fila incluida nuevamente." };
  });
}

export async function commitImportAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const batchId = formString(form, "batchId");
  const result = await runAction(async () => {
    const { ctx } = await requireTenant(slug, "imports.run");
    const services = await getServices();
    await services.imports.commit(ctx, batchId, await requestMeta());
    await services.budgets.evaluateAlerts(ctx);
  });
  if (!result.ok) return result;
  revalidatePath(`/app/${slug}`, "layout");
  redirect(`/app/${slug}/importar/${batchId}?confirmada=1`);
}

export async function cancelImportAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug, "imports.run");
  await (await getServices()).imports.cancel(ctx, formString(form, "batchId"), await requestMeta());
  redirect(`/app/${slug}/importar`);
}
