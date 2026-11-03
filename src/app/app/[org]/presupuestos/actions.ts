"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

export async function createBudgetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    await services.budgets.create(
      ctx,
      {
        name: formString(form, "name"),
        period: formString(form, "period"),
        amount: formString(form, "amount"),
        currency: formString(form, "currency"),
        categoryId: formString(form, "categoryId"),
        sectorId: formString(form, "sectorId"),
        alertThresholdPct: formString(form, "alertThresholdPct") || "80",
        startsOn: formString(form, "startsOn"),
        endsOn: formString(form, "endsOn"),
      },
      await requestMeta(),
    );
    await services.budgets.evaluateAlerts(ctx);
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true, message: "Presupuesto creado." };
  });
}

export async function archiveBudgetAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).budgets.archive(ctx, formString(form, "id"), await requestMeta());
  revalidatePath(`/app/${slug}/presupuestos`);
}
