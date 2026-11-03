"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

export async function createReminderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    await (await getServices()).reminders.create(
      ctx,
      {
        title: formString(form, "title"),
        kind: formString(form, "kind"),
        dueOn: formString(form, "dueOn"),
        amount: formString(form, "amount"),
        currency: formString(form, "currency"),
        categoryId: formString(form, "categoryId"),
        accountId: formString(form, "accountId"),
        recurrence: formString(form, "recurrence"),
        recurrenceUntil: formString(form, "recurrenceUntil"),
        notifyDaysBefore: formString(form, "notifyDaysBefore") || "3",
        notes: formString(form, "notes"),
      },
      await requestMeta(),
    );
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true, message: "Vencimiento agendado." };
  });
}

/** Marca el vencimiento como resuelto y, si se pide, registra el movimiento en la misma transacción. */
export async function completeReminderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    let movement: Record<string, string> | null = null;
    if (form.get("registerMovement") === "on") {
      const types = await services.catalog.listMovementTypes(ctx);
      const kind = formString(form, "direction") === "receivable" ? "income" : "expense";
      movement = {
        typeId: types.find((t) => t.isSystem && t.baseKind === kind)!.id,
        occurredOn: formString(form, "paidOn"),
        amount: formString(form, "amount"),
        categoryId: formString(form, "categoryId"),
        accountId: formString(form, "accountId"),
        description: formString(form, "title"),
      };
    }
    const result = await services.reminders.complete(ctx, formString(form, "id"), movement, await requestMeta());
    if (movement) await services.budgets.evaluateAlerts(ctx);
    revalidatePath(`/app/${slug}`, "layout");
    return { ok: true, message: `Resuelto${result.movementId ? " y movimiento registrado" : ""}${result.nextId ? ". Agendamos la próxima fecha" : ""}.` };
  });
}

export async function dismissReminderAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).reminders.dismiss(ctx, formString(form, "id"), await requestMeta());
  revalidatePath(`/app/${slug}`, "layout");
}
