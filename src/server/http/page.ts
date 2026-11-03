import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/server/platform/errors";
import { isUuid } from "@/server/platform/ids";

/**
 * Páginas que cargan un recurso por un id de la URL: si el id está mal formado, no existe o es de otra
 * empresa (RLS lo oculta) responde 404, sin distinguir entre esos casos. Cualquier otro error sigue su curso.
 */
export async function loadOrNotFound<T>(id: string, load: () => Promise<T>): Promise<T> {
  if (!isUuid(id)) notFound();
  try {
    return await load();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
