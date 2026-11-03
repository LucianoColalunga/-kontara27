import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getSession } from "@/server/http/session";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitación" };

export default async function InvitationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/invitacion?token=${token ?? ""}`)}`);
  return (
    <div className="fade-in space-y-6">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <Users className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Te invitaron a una empresa</h1>
        <p className="mt-1 text-sm text-text-2">Vas a entrar como {session.user.email}. La invitación tiene que haber sido enviada a ese correo.</p>
      </div>
      <AcceptInvitationForm token={token ?? ""} />
    </div>
  );
}
