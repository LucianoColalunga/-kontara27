import "server-only";
import { getServices } from "@/server/container";
import type { TenantContext } from "@/server/modules/tenancy";
import type { MovementFormOptions } from "./movement-form";

export async function loadMovementFormOptions(ctx: TenantContext): Promise<MovementFormOptions> {
  const services = await getServices();
  const [types, categories, accounts, paymentMethods, sectors] = await Promise.all([
    services.catalog.listMovementTypes(ctx),
    services.catalog.listCategories(ctx),
    ctx.permissions.has("accounts.view") ? services.catalog.listAccounts(ctx) : Promise.resolve([]),
    services.catalog.listPaymentMethods(ctx),
    services.catalog.listSectors(ctx),
  ]);
  return {
    types: types.map((t) => ({ id: t.id, name: t.name, baseKind: t.baseKind })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, scope: c.scope })),
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    paymentMethods: paymentMethods.map((p) => ({ id: p.id, name: p.name })),
    sectors: sectors.map((s) => ({ id: s.id, name: s.name })),
  };
}
