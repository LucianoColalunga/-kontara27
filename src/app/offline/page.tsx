import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { Isotype } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Sin conexión" };

/** Página que muestra el service worker cuando no hay red. No contiene datos de ninguna empresa. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Isotype size={56} className="mx-auto" />
        <div className="mx-auto mt-6 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-muted">
          <WifiOff className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-[24px] font-semibold">Sin conexión</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-2">Por seguridad, tus datos financieros no se guardan en el dispositivo. Cuando vuelva la conexión, recargá la página.</p>
      </div>
    </main>
  );
}
