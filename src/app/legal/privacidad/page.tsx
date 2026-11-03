import type { Metadata } from "next";
import Link from "next/link";
import { DraftNotice } from "@/components/legal/draft-notice";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPolicy() {
  return (
    <article>
      <h1>Política de privacidad</h1>
      <p>Cómo {brand.name} trata los datos personales de las personas usuarias y de las empresas que gestionan sus finanzas en la plataforma.</p>
      <DraftNotice updated="3 de noviembre de 2026" />

      <h2>1. Responsable</h2>
      <p>
        Responsable del tratamiento: <strong>[razón social del titular de {brand.name}]</strong>, con domicilio en <strong>[domicilio]</strong>, correo de contacto <strong>[correo de privacidad]</strong>. Para los datos financieros que una empresa carga en la plataforma, esa empresa es responsable y {brand.name} actúa como encargado del tratamiento por cuenta de ella.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> nombre, correo, contraseña (guardada solo como hash Argon2id, nunca en texto), país de residencia declarado e idioma.</li>
        <li><strong>Seguridad:</strong> sesiones (dirección IP, navegador, fechas), eventos de ingreso y cambios de seguridad, secreto de verificación en dos pasos (cifrado) y códigos de recuperación (hash).</li>
        <li><strong>Datos de cada empresa:</strong> datos de la organización (incluida la identificación fiscal, cifrada), movimientos, cuentas, presupuestos, vencimientos, comprobantes adjuntos y planillas importadas.</li>
        <li><strong>Consentimientos:</strong> tus elecciones de cookies y la fecha en que las hiciste.</li>
      </ul>
      <p>No compramos datos, no hacemos perfiles publicitarios y no usamos cookies de seguimiento.</p>

      <h2>3. Para qué y con qué base</h2>
      <ul>
        <li>Prestar el servicio que contrataste (ejecución del contrato).</li>
        <li>Proteger las cuentas y prevenir fraudes: límites de intentos, registro de auditoría (interés legítimo y obligación de seguridad).</li>
        <li>Cumplir obligaciones legales, por ejemplo conservar registros contables cuando la ley lo exige.</li>
        <li>Enviarte correos operativos: confirmación de cuenta, recuperación de contraseña, invitaciones y avisos de seguridad.</li>
      </ul>

      <h2>4. Con quién se comparten</h2>
      <p>Con proveedores que procesan datos por cuenta nuestra y bajo contrato: alojamiento de la aplicación, base de datos, almacenamiento de archivos y envío de correos. La lista vigente de subencargados y sus países es: <strong>[completar al contratar los proveedores]</strong>. Dentro de la plataforma, la información de una empresa solo la ven sus miembros según los permisos de su rol.</p>

      <h2>5. Transferencias internacionales</h2>
      <p>Si los proveedores alojan datos fuera de tu país, se usan mecanismos reconocidos por la normativa aplicable (por ejemplo, cláusulas contractuales tipo). <strong>[Completar según los proveedores elegidos.]</strong></p>

      <h2>6. Plazos de conservación</h2>
      <ul>
        <li>Sesiones vencidas: se eliminan a los 30 días.</li>
        <li>Enlaces de verificación y recuperación: vencen a las 24 horas y 30 minutos; se eliminan a los 30 días.</li>
        <li>Registro de auditoría: se conserva mientras exista la empresa, para trazabilidad.</li>
        <li>Datos financieros de una empresa: mientras la empresa use el servicio y durante los plazos legales de conservación de registros contables que le correspondan.</li>
      </ul>

      <h2>7. Tus derechos</h2>
      <p>
        Podés acceder, rectificar, portar y suprimir tus datos, y oponerte a ciertos tratamientos. Desde <Link href="/cuenta">Mi cuenta</Link> podés descargar tus datos (JSON), corregir tu perfil y eliminar tu cuenta. Al eliminarla anonimizamos tu identidad; los registros contables que cargaste en una empresa se conservan con autor anónimo porque la empresa está obligada a guardarlos.
      </p>
      <p>
        <strong>Argentina (Ley 25.326):</strong> el titular de los datos tiene la facultad de ejercer el derecho de acceso en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo. La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, atiende denuncias y reclamos.
      </p>
      <p><strong>Unión Europea (RGPD):</strong> además podés reclamar ante la autoridad de protección de datos de tu país.</p>
      <p>La normativa que aplicamos sale del país de residencia que declarás en tu perfil, no de tu dirección IP. Si no declarás ninguno, aplicamos el criterio más protector.</p>

      <h2>8. Seguridad</h2>
      <p>Tráfico cifrado (HTTPS), contraseñas con Argon2id, verificación en dos pasos opcional, datos sensibles cifrados en reposo, aislamiento de cada empresa en la base de datos y registro de auditoría inmutable. Ningún sistema es invulnerable: si ocurre un incidente que afecte tus datos, te lo vamos a informar según lo que exige la ley.</p>

      <h2>9. Cambios</h2>
      <p>Si cambiamos esta política de forma relevante, te avisamos dentro de la aplicación o por correo antes de que el cambio rija.</p>
    </article>
  );
}
