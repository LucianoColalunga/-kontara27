"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/server/container";
import { type ActionState, formFile, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

const done = (slug: string, message: string): ActionState => {
  revalidatePath(`/app/${slug}`, "layout");
  return { ok: true, message };
};

export async function updateOrganizationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    await (await getServices()).tenancy.updateOrganization(
      ctx,
      {
        name: formString(form, "name"),
        legalName: formString(form, "legalName"),
        taxIdType: formString(form, "taxIdType") || null,
        taxId: formString(form, "taxId"),
        country: formString(form, "country"),
        currency: formString(form, "currency"),
        timezone: formString(form, "timezone"),
        locale: "es-AR",
        fiscalYearStartMonth: formString(form, "fiscalYearStartMonth") || "1",
        address: { street: formString(form, "street"), city: formString(form, "city"), region: formString(form, "region"), postalCode: formString(form, "postalCode") },
      },
      await requestMeta(),
    );
    return done(slug, "Datos de la empresa guardados.");
  });
}

export async function uploadLogoAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const file = formFile(form, "logo");
    if (!file) return { ok: false, message: "Elegí una imagen." };
    await (await getServices()).documents.setLogo(ctx, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, await requestMeta());
    return done(slug, "Logo actualizado.");
  });
}

export async function saveCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    const input = { name: formString(form, "name"), scope: formString(form, "scope"), color: formString(form, "color") || null };
    const id = formString(form, "id");
    if (id) await services.catalog.updateCategory(ctx, id, input, await requestMeta());
    else await services.catalog.createCategory(ctx, input, await requestMeta());
    return done(slug, id ? "Categoría actualizada." : "Categoría creada.");
  });
}

export async function archiveCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const archived = formString(form, "archived") === "1";
    await (await getServices()).catalog.setCategoryArchived(ctx, formString(form, "id"), archived, await requestMeta());
    return done(slug, archived ? "Categoría archivada." : "Categoría reactivada.");
  });
}

export async function deleteCategoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const result = await (await getServices()).catalog.deleteCategory(ctx, formString(form, "id"), formString(form, "reassignTo") || null, await requestMeta());
    return done(slug, result.reassigned ? `Categoría eliminada. ${result.reassigned} movimiento(s) pasaron a la categoría elegida (queda en su historial).` : "Categoría eliminada.");
  });
}

export async function createCatalogItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    const kind = formString(form, "kind");
    const meta = await requestMeta();
    if (kind === "type") await services.catalog.createMovementType(ctx, { name: formString(form, "name"), baseKind: formString(form, "baseKind") }, meta);
    else if (kind === "sector") await services.catalog.createSector(ctx, { name: formString(form, "name") }, meta);
    else await services.catalog.createPaymentMethod(ctx, { name: formString(form, "name") }, meta);
    return done(slug, "Agregado.");
  });
}

export async function archiveCatalogItemAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  const services = await getServices();
  const kind = formString(form, "kind");
  const id = formString(form, "id");
  const meta = await requestMeta();
  if (kind === "type") await services.catalog.archiveMovementType(ctx, id, meta);
  else if (kind === "sector") await services.catalog.archiveSector(ctx, id, meta);
  else await services.catalog.archivePaymentMethod(ctx, id, meta);
  revalidatePath(`/app/${slug}/configuracion`);
}
