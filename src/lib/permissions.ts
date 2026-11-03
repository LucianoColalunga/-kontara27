/**
 * Catálogo de permisos. Las claves son estables (se guardan en la base); las etiquetas son para la interfaz.
 * Se puede importar desde el cliente: no contiene lógica de autorización, solo datos.
 */
export const PERMISSIONS = {
  "org.manage": "Editar los datos de la empresa",
  "members.view": "Ver miembros",
  "members.manage": "Invitar y administrar miembros",
  "roles.manage": "Crear y editar roles y permisos",
  "movements.view": "Ver movimientos",
  "movements.create": "Registrar movimientos",
  "movements.update": "Editar movimientos",
  "movements.delete": "Eliminar y restaurar movimientos",
  "movements.reconcile": "Conciliar movimientos",
  "accounts.view": "Ver cuentas y cajas",
  "accounts.manage": "Administrar cuentas y cajas",
  "catalog.manage": "Administrar categorías, tipos, sectores y medios de pago",
  "budgets.view": "Ver presupuestos",
  "budgets.manage": "Administrar presupuestos",
  "reports.view": "Ver el panel y los reportes",
  "reports.export": "Exportar reportes y movimientos",
  "imports.run": "Importar planillas",
  "documents.view": "Ver comprobantes adjuntos",
  "documents.upload": "Adjuntar comprobantes",
  "documents.delete": "Eliminar comprobantes",
  "reminders.view": "Ver vencimientos",
  "reminders.manage": "Administrar vencimientos",
  "audit.view": "Ver el registro de auditoría",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
  { label: "Empresa y equipo", permissions: ["org.manage", "members.view", "members.manage", "roles.manage", "audit.view"] },
  { label: "Movimientos", permissions: ["movements.view", "movements.create", "movements.update", "movements.delete", "movements.reconcile", "imports.run"] },
  { label: "Cuentas y catálogos", permissions: ["accounts.view", "accounts.manage", "catalog.manage"] },
  { label: "Presupuestos y reportes", permissions: ["budgets.view", "budgets.manage", "reports.view", "reports.export"] },
  { label: "Documentos y vencimientos", permissions: ["documents.view", "documents.upload", "documents.delete", "reminders.view", "reminders.manage"] },
];

export type SystemRoleKey = "owner" | "admin" | "accountant" | "employee" | "viewer";

export const SYSTEM_ROLES: Record<SystemRoleKey, { name: string; description: string; permissions: Permission[] }> = {
  owner: {
    name: "Propietario",
    description: "Control total, incluida la gestión de propietarios. Sus permisos no se pueden reducir.",
    permissions: ALL_PERMISSIONS,
  },
  admin: {
    name: "Administrador",
    description: "Administra la empresa, el equipo y toda la información financiera.",
    permissions: ALL_PERMISSIONS,
  },
  accountant: {
    name: "Contador",
    description: "Registra, corrige, concilia, importa y exporta. No administra al equipo.",
    permissions: [
      "members.view", "movements.view", "movements.create", "movements.update", "movements.delete", "movements.reconcile",
      "accounts.view", "accounts.manage", "catalog.manage", "budgets.view", "budgets.manage", "reports.view", "reports.export",
      "imports.run", "documents.view", "documents.upload", "documents.delete", "reminders.view", "reminders.manage", "audit.view",
    ],
  },
  employee: {
    name: "Empleado",
    description: "Registra movimientos y adjunta comprobantes. No ve reportes ni presupuestos.",
    permissions: ["movements.view", "movements.create", "accounts.view", "documents.view", "documents.upload", "reminders.view"],
  },
  viewer: {
    name: "Solo lectura",
    description: "Consulta movimientos, cuentas, presupuestos y reportes sin modificar nada.",
    permissions: ["members.view", "movements.view", "accounts.view", "budgets.view", "reports.view", "documents.view", "reminders.view"],
  },
};

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}
