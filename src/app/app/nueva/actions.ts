"use server";

import { redirect } from "next/navigation";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { requestMeta, requireUser } from "@/server/http/session";

export async function createOrganizationAction(_: ActionState, form: FormData): Promise<ActionState> {
  let slug = "";
  const result = await runAction(async () => {
    const session = await requireUser();
    const created = await (await getServices()).tenancy.createOrganization(
      session.user.id,
      {
        name: formString(form, "name"),
        legalName: formString(form, "legalName"),
        taxIdType: formString(form, "taxIdType") || null,
        taxId: formString(form, "taxId"),
        country: formString(form, "country"),
        currency: formString(form, "currency"),
        timezone: formString(form, "timezone"),
        address: { street: formString(form, "street"), city: formString(form, "city"), region: formString(form, "region"), postalCode: formString(form, "postalCode") },
      },
      await requestMeta(),
      // Quien va a importar una planilla puede empezar sin las categorías sugeridas.
      { seedCategories: form.get("seedCategories") === "on" },
    );
    slug = created.slug;
  });
  if (!result.ok) return result;
  redirect(`/app/${slug}?bienvenida=1`);
}
