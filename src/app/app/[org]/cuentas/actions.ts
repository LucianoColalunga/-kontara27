"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

function payload(form: FormData) {
  return {
    name: formString(form, "name"),
    type: formString(form, "type"),
    currency: formString(form, "currency"),
    openingBalance: formString(form, "openingBalance") || "0",
    institution: formString(form, "institution"),
    numberLast4: formString(form, "numberLast4"),
  };
}

export async function saveAccountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    const id = formString(form, "id");
    if (id) await services.catalog.updateAccount(ctx, id, payload(form), await requestMeta());
    else await services.catalog.createAccount(ctx, payload(form), await requestMeta());
    revalidatePath(`/app/${slug}/cuentas`);
    return { ok: true, message: id ? "Cuenta actualizada." : "Cuenta creada." };
  });
}

export async function archiveAccountAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).catalog.setAccountArchived(ctx, formString(form, "id"), formString(form, "archived") === "1", await requestMeta());
  revalidatePath(`/app/${slug}/cuentas`);
}
