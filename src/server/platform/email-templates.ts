import "server-only";
import { brand } from "@/config/brand";
import type { EmailMessage } from "./email";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }, footnote?: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#33415c">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:${brand.colors.ink};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#5b6b85">Si el botón no funciona, copiá este enlace:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  const note = footnote ? `<p style="margin:24px 0 0;font-size:13px;color:#5b6b85">${escapeHtml(footnote)}</p>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:${brand.colors.paper};font-family:Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e3e7ee"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-weight:700;letter-spacing:.12em;color:${brand.colors.ink}">${escapeHtml(brand.wordmark)} <span style="color:${brand.colors.accent}">${escapeHtml(brand.numeral)}</span></p>
<h1 style="margin:0 0 16px;font-size:20px;color:${brand.colors.ink}">${escapeHtml(title)}</h1>${body}${button}${note}
</td></tr></table></td></tr></table></body></html>`;
}

function text(title: string, paragraphs: string[], action?: { label: string; url: string }, footnote?: string): string {
  return [brand.name, "", title, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(footnote ? ["", footnote] : [])].join("\n");
}

function message(tag: string, to: string, subject: string, title: string, paragraphs: string[], action?: { label: string; url: string }, footnote?: string): EmailMessage {
  return { tag, to, subject, html: layout(title, paragraphs, action, footnote), text: text(title, paragraphs, action, footnote) };
}

export const emailTemplates = {
  verifyEmail: (to: string, name: string, url: string) =>
    message("verification", to, `Confirmá tu correo en ${brand.shortName}`, `Hola, ${name}`, ["Para activar tu cuenta, confirmá que este correo es tuyo. El enlace vence en 24 horas."], { label: "Confirmar correo", url }, "Si no creaste una cuenta, ignorá este mensaje."),

  passwordReset: (to: string, url: string) =>
    message("password_reset", to, `Restablecer tu contraseña de ${brand.shortName}`, "Restablecer contraseña", ["Recibimos un pedido para cambiar tu contraseña. El enlace vence en 30 minutos y sirve una sola vez.", "Al cambiarla se cerrarán todas tus sesiones abiertas."], { label: "Elegir una contraseña nueva", url }, "Si no fuiste vos, ignorá este correo: tu contraseña sigue igual."),

  accountExists: (to: string, loginUrl: string) =>
    message("account_exists", to, `Ya tenés una cuenta en ${brand.shortName}`, "Ya tenés una cuenta", ["Alguien intentó registrarse con este correo, pero ya hay una cuenta asociada.", "Si fuiste vos, iniciá sesión. Si no recordás la contraseña, podés restablecerla desde la pantalla de ingreso."], { label: "Iniciar sesión", url: loginUrl }, "Si no fuiste vos, no tenés que hacer nada: tu cuenta sigue igual."),

  passwordChanged: (to: string) =>
    message("password_changed", to, `Tu contraseña de ${brand.shortName} cambió`, "Tu contraseña cambió", ["La contraseña de tu cuenta se cambió recién y se cerraron las demás sesiones.", "Si no fuiste vos, restablecela de inmediato desde la pantalla de inicio de sesión."]),

  mfaChanged: (to: string, enabled: boolean) =>
    message("mfa_changed", to, `Verificación en dos pasos ${enabled ? "activada" : "desactivada"}`, `Verificación en dos pasos ${enabled ? "activada" : "desactivada"}`, [enabled ? "Desde ahora vas a necesitar el código de tu app de autenticación para entrar." : "Tu cuenta ya no pide el código de la app de autenticación.", "Si no fuiste vos, cambiá tu contraseña y revisá tus sesiones activas."]),

  invitation: (to: string, inviterName: string, organizationName: string, roleName: string, url: string) =>
    message("invitation", to, `${inviterName} te invitó a ${organizationName}`, `Te invitaron a ${organizationName}`, [`${inviterName} te sumó como «${roleName}» en ${brand.shortName}. La invitación vence en 7 días.`], { label: "Aceptar invitación", url }, "Si no esperabas esta invitación, podés ignorarla."),

  budgetAlert: (to: string, organizationName: string, budgetName: string, pct: number, url: string) =>
    message("budget_alert", to, `Presupuesto «${budgetName}» al ${pct}%`, `«${budgetName}» llegó al ${pct}%`, [`En ${organizationName}, el presupuesto «${budgetName}» alcanzó el ${pct}% del monto previsto para el período.`], { label: "Ver presupuesto", url }),

  reminderDue: (to: string, organizationName: string, title: string, dueOn: string, url: string) =>
    message("reminder", to, `Vence ${title} (${dueOn})`, `Vencimiento próximo: ${title}`, [`En ${organizationName} vence «${title}» el ${dueOn}.`], { label: "Ver vencimientos", url }),
};
