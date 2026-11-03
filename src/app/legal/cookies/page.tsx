import type { Metadata } from "next";
import { cookies } from "next/headers";
import { DraftNotice } from "@/components/legal/draft-notice";
import { brand } from "@/config/brand";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Política de cookies" };

export default async function CookiesPolicy() {
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  return (
    <article>
      <h1>Política de cookies</h1>
      <p>{brand.name} usa solo las cookies imprescindibles para funcionar. No usa cookies de análisis, publicidad ni seguimiento, ni de terceros.</p>
      <DraftNotice updated="3 de noviembre de 2026" />
      <h2>Cookies que usamos</h2>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Para qué</th>
            <th>Tipo</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>__Host-sid</code>
            </td>
            <td>Mantener tu sesión iniciada. Es un identificador aleatorio; no contiene datos tuyos. Solo viaja por HTTPS y no es accesible desde JavaScript.</td>
            <td>Necesaria</td>
            <td>Hasta 14 días de inactividad (máximo 30)</td>
          </tr>
          <tr>
            <td>
              <code>theme</code>
            </td>
            <td>Recordar el tema claro u oscuro que elegiste.</td>
            <td>Preferencia pedida por vos</td>
            <td>1 año</td>
          </tr>
          <tr>
            <td>
              <code>{CONSENT_COOKIE}</code>
            </td>
            <td>Recordar tus elecciones de esta página.</td>
            <td>Necesaria</td>
            <td>1 año</td>
          </tr>
        </tbody>
      </table>
      <p>Como no hay cookies no esenciales, no mostramos un aviso emergente. Si en el futuro se incorporaran (por ejemplo, analítica), solo se activarían después de tu consentimiento expreso donde la ley lo exija, y este aviso se actualizaría.</p>
      <h2 id="preferencias">Tus preferencias</h2>
      <p>Las categorías opcionales están desactivadas. Podés dejar registrada tu elección: guardamos una constancia con la fecha y la versión de esta política.</p>
      <ConsentForm analytics={consent?.analytics ?? false} marketing={consent?.marketing ?? false} />
    </article>
  );
}
