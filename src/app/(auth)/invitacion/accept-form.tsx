"use client";

import { useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { acceptInvitationAction } from "../actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, { ok: false } as FormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Uniéndote…">
        Aceptar invitación
      </SubmitButton>
    </form>
  );
}
