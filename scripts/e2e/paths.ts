/** Valores compartidos entre el servidor E2E y las pruebas (corren en procesos distintos). */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_DIR = ".data/e2e";
export const E2E_OUTBOX_DIR = `${E2E_DIR}/outbox`;
export const E2E_STORAGE_DIR = `${E2E_DIR}/storage`;
