"use server";

import { revalidatePath } from "next/cache";
import { getServices } from "@/server/container";
import { type ActionState, formString, runAction } from "@/server/http/action";
import { requestMeta, requireTenant } from "@/server/http/session";

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx, session } = await requireTenant(slug);
    await (await getServices()).tenancy.invite(ctx, { email: formString(form, "email"), roleId: formString(form, "roleId") }, session.user.name, await requestMeta());
    revalidatePath(`/app/${slug}/equipo`);
    return { ok: true, message: "Invitación enviada. Vence en 7 días." };
  });
}

export async function changeRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    await (await getServices()).tenancy.changeMemberRole(ctx, formString(form, "membershipId"), formString(form, "roleId"), await requestMeta());
    revalidatePath(`/app/${slug}/equipo`);
    return { ok: true, message: "Rol actualizado." };
  });
}

export async function memberStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const status = formString(form, "status") as "active" | "suspended" | "removed";
    await (await getServices()).tenancy.setMemberStatus(ctx, formString(form, "membershipId"), status, await requestMeta());
    revalidatePath(`/app/${slug}/equipo`);
    return { ok: true, message: status === "removed" ? "Miembro quitado." : status === "suspended" ? "Acceso suspendido." : "Acceso reactivado." };
  });
}

export async function revokeInvitationAction(form: FormData): Promise<void> {
  const slug = formString(form, "org");
  const { ctx } = await requireTenant(slug);
  await (await getServices()).tenancy.revokeInvitation(ctx, formString(form, "invitationId"), await requestMeta());
  revalidatePath(`/app/${slug}/equipo`);
}

export async function saveRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    const services = await getServices();
    const input = { name: formString(form, "name"), description: formString(form, "description"), permissions: form.getAll("permissions").filter((p): p is string => typeof p === "string") };
    const roleId = formString(form, "roleId");
    if (roleId) await services.tenancy.updateRole(ctx, roleId, input, await requestMeta());
    else await services.tenancy.createRole(ctx, input, await requestMeta());
    revalidatePath(`/app/${slug}/equipo`);
    return { ok: true, message: roleId ? "Permisos guardados." : "Rol creado." };
  });
}

export async function deleteRoleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const slug = formString(form, "org");
  return runAction(async () => {
    const { ctx } = await requireTenant(slug);
    await (await getServices()).tenancy.deleteRole(ctx, formString(form, "roleId"), await requestMeta());
    revalidatePath(`/app/${slug}/equipo`);
    return { ok: true, message: "Rol eliminado." };
  });
}
