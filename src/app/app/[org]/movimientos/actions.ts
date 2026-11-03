"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { type ActionState, formFile, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

function movementPayload(form: FormData) {
  return {
    typeId: formString(form, "typeId"),
    occurredOn: formString(form, "occurredOn"),
    amount: formString(form, "amount"),
    categoryId: formString(form, "categoryId"),
    accountId: formString(form, "accountId"),
    counterAccountId: formString(form, "counterAccountId"),
    sectorId: formString(form, "sectorId"),
    paymentMethodId: formString(form, "paymentMethodId"),
    description: formString(form, "description"),
    notes: formString(form, "notes"),
    reference: formString(form, "reference"),
    status: formString(form, "status") || "completed",
  };
}

export async function createMovementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  let destination = "";
  const result = await runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    const meta = await requestMeta();
    const id = await services.movements.create(ctx, movementPayload(form), meta);
    const file = formFile(form, "attachment");
    if (file) await services.documents.attachToMovement(ctx, id, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, meta);
    await services.budgets.evaluateAlerts(ctx);
    revalidatePath(`/app/${slug}`, "layout");
    destination = formString(form, "intent") === "another" ? `/app/${slug}/movimientos/nuevo?creado=1` : `/app/${slug}/movimientos/${id}?creado=1`;
  });
  if (!result.ok) return result;
  redirect(destination);
}

export async function updateMovementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const id = formString(form, "id");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    await services.movements.update(ctx, id, movementPayload(form), Number(formString(form, "version")), await requestMeta());
    await services.budgets.evaluateAlerts(ctx);
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true, message: "Cambios guardados. La versión anterior quedó en el historial." };
  });
}

export async function deleteMovementAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  const result = await runAction(async () => {
    const { ctx } = await requireTenant(slug);
    await (await getServices()).movements.remove(ctx, formString(form, "id"), formString(form, "reason"), await requestMeta());
    revalidatePath(`/app/${slug}`, "layout");
  });
  if (!result.ok) return result;
  redirect(`/app/${slug}/movimientos?eliminado=1`);
}

export async function restoreMovementAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).movements.restore(ctx, formString(form, "id"), await requestMeta());
  revalidatePath(`/app/${slug}`, "layout");
  redirect(`/app/${slug}/movimientos/${formString(form, "id")}`);
}

export async function reconcileAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).movements.setReconciled(ctx, [formString(form, "id")], formString(form, "value") === "1", await requestMeta());
  revalidatePath(`/app/${slug}`, "layout");
}

export async function uploadAttachmentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const file = formFile(form, "attachment");
    if (!file) return { ok: false, message: "Elegí un archivo." };
    await (await getServices()).documents.attachToMovement(ctx, formString(form, "id"), { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, await requestMeta());
    revalidatePath(`/app/${slug}/movimientos/${formString(form, "id")}`);
    return { ok: true, message: "Comprobante adjuntado." };
  });
}

export async function removeAttachmentAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).documents.removeAttachment(ctx, formString(form, "fileId"), await requestMeta());
  revalidatePath(`/app/${slug}/movimientos/${formString(form, "id")}`);
}
