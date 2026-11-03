"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { PERMISSION_GROUPS, PERMISSIONS } from "@/lib/permissions";
import { changeRoleAction, deleteRoleAction, inviteAction, memberStatusAction, saveRoleAction } from "./actions";

const initial: FormState = { ok: false };
type RoleOption = { id: string; key: string; name: string };

export function InviteForm({ org, roles }: { org: string; roles: RoleOption[] }) {
  const [state, action] = useActionState(inviteAction, initial);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="org" value={org} />
      <Field label="Correo" htmlFor="invite-email" error={fieldError(state, "email")}>
        <Input id="invite-email" name="email" type="email" required placeholder="persona@empresa.com" />
      </Field>
      <Field label="Rol" htmlFor="invite-role">
        <Select id="invite-role" name="roleId" defaultValue={roles.find((r) => r.key === "employee")?.id}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pendingLabel="Enviando…">Invitar</SubmitButton>
      <div className="sm:col-span-3">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function MemberControls({ org, membershipId, roleId, status, roles, isSelf }: { org: string; membershipId: string; roleId: string; status: string; roles: RoleOption[]; isSelf: boolean }) {
  const [roleState, roleAction] = useActionState(changeRoleAction, initial);
  const [statusState, statusAction] = useActionState(memberStatusAction, initial);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={roleAction} className="flex items-center gap-2">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="membershipId" value={membershipId} />
          <Select name="roleId" defaultValue={roleId} aria-label="Rol" className="w-44">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <SubmitButton variant="secondary" size="sm" pendingLabel="…">
            Cambiar
          </SubmitButton>
        </form>
        {!isSelf ? (
          <form action={statusAction} className="flex items-center gap-1">
            <input type="hidden" name="org" value={org} />
            <input type="hidden" name="membershipId" value={membershipId} />
            <SubmitButton variant="ghost" size="sm" name="status" value={status === "active" ? "suspended" : "active"} pendingLabel="…">
              {status === "active" ? "Suspender" : "Reactivar"}
            </SubmitButton>
            <SubmitButton variant="ghost" size="sm" name="status" value="removed" className="text-critical" pendingLabel="…">
              Quitar
            </SubmitButton>
          </form>
        ) : null}
      </div>
      <FormMessage state={roleState.message ? roleState : statusState} />
    </div>
  );
}

export function RoleEditor({ org, role, editable }: { org: string; role?: { id: string; key: string; name: string; description: string | null; permissions: string[]; isSystem: boolean }; editable: boolean }) {
  const [state, action] = useActionState(saveRoleAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteRoleAction, initial);
  const current = new Set(role?.permissions ?? []);
  const locked = role?.key === "owner" || !editable;
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="org" value={org} />
        {role ? <input type="hidden" name="roleId" value={role.id} /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre del rol" htmlFor={`rn-${role?.id ?? "new"}`} error={fieldError(state, "name")}>
            <Input id={`rn-${role?.id ?? "new"}`} name="name" defaultValue={role?.name} required disabled={locked} />
          </Field>
          <Field label="Descripción" htmlFor={`rd-${role?.id ?? "new"}`}>
            <Input id={`rd-${role?.id ?? "new"}`} name="description" defaultValue={role?.description ?? ""} disabled={locked} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.label} className="rounded-xl border border-border p-3">
              <legend className="px-1 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">{group.label}</legend>
              <div className="space-y-1.5">
                {group.permissions.map((p) => (
                  <label key={p} className="flex items-start gap-2 text-[13px] text-text-2">
                    <input type="checkbox" name="permissions" value={p} defaultChecked={role?.key === "owner" || current.has(p)} disabled={locked} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                    <span>{PERMISSIONS[p]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        {role?.key === "owner" ? <p className="text-[13px] text-muted">El propietario siempre tiene todos los permisos.</p> : null}
        <FormMessage state={state} />
        {!locked ? <SubmitButton pendingLabel="Guardando…">{role ? "Guardar permisos" : "Crear rol"}</SubmitButton> : null}
      </form>
      {role && !role.isSystem && editable ? (
        <form action={deleteAction}>
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="roleId" value={role.id} />
          <FormMessage state={deleteState} />
          <SubmitButton variant="ghost" size="sm" className="text-critical" pendingLabel="Eliminando…">
            Eliminar rol
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
