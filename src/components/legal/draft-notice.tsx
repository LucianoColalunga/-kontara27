import { Callout } from "@/components/ui/primitives";

/** Aviso visible mientras los textos legales no hayan sido revisados por un profesional. */
export function DraftNotice({ updated }: { updated: string }) {
  return (
    <Callout tone="warning" title="Borrador pendiente de revisión legal" className="my-6">
      Describe con fidelidad lo que hace el sistema hoy, pero un abogado debe revisarlo y completar los datos del responsable antes de ofrecer el servicio comercialmente. Última actualización: {updated}.
    </Callout>
  );
}
