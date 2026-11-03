import type { Metadata } from "next";
import { DraftNotice } from "@/components/legal/draft-notice";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function Terms() {
  return (
    <article>
      <h1>Términos y condiciones</h1>
      <p>Reglas de uso de {brand.name}.</p>
      <DraftNotice updated="3 de noviembre de 2026" />
      <h2>1. El servicio</h2>
      <p>{brand.name} es una herramienta de gestión financiera para empresas y profesionales: registro de ingresos y gastos, cuentas, presupuestos, vencimientos, reportes e importación de planillas. No es un servicio contable, impositivo ni de asesoramiento financiero, y sus reportes no reemplazan los registros ni las declaraciones que exige la ley.</p>
      <h2>2. Cuentas y empresas</h2>
      <ul>
        <li>Cada persona usa su propia cuenta y es responsable de mantener la contraseña en secreto. Recomendamos activar la verificación en dos pasos.</li>
        <li>Quien registra una empresa declara tener facultades para hacerlo y es responsable de a quién invita y con qué permisos.</li>
        <li>Los datos que una empresa carga le pertenecen. Puede exportarlos cuando quiera.</li>
      </ul>
      <h2>3. Uso aceptable</h2>
      <p>No está permitido intentar acceder a datos de otras empresas, vulnerar la seguridad, automatizar el acceso sin autorización, cargar contenido ilícito ni usar la plataforma para actividades ilegales. Si detectás una vulnerabilidad, informala de forma responsable a <strong>[correo de seguridad]</strong>.</p>
      <h2>4. Disponibilidad y respaldo</h2>
      <p>Trabajamos para que el servicio esté disponible y hacemos copias de seguridad, pero no garantizamos un funcionamiento ininterrumpido. <strong>[Completar niveles de servicio y política de respaldo según el plan contratado.]</strong></p>
      <h2>5. Planes y precios</h2>
      <p><strong>[Completar cuando se definan los planes de suscripción.]</strong></p>
      <h2>6. Responsabilidad</h2>
      <p><strong>[Completar con asesoramiento legal según la jurisdicción.]</strong></p>
      <h2>7. Baja</h2>
      <p>Podés eliminar tu cuenta desde «Mi cuenta». Una empresa puede dejar de usar el servicio y exportar sus datos antes de hacerlo.</p>
      <h2>8. Ley aplicable</h2>
      <p><strong>[Completar: ley y tribunales aplicables.]</strong></p>
    </article>
  );
}
