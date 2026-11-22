/**
 * Entry point del proceso principal de Electron.
 * Maneja el ciclo de vida de la aplicación y la comunicación segura vía IPC.
 * NUNCA envía bytes al hardware que no estén respaldados por capturas documentadas en docs/protocol/.
 */

export async function bootstrapMainProcess(): Promise<void> {
  console.log('[Main Process] Peripherals Hub backend initialized in safe read-only discovery mode.');
}

if (process.env['NODE_ENV'] !== 'test') {
  bootstrapMainProcess().catch((err: unknown) => {
    console.error('[Main Process] Fatal error initializing backend:', err);
  });
}
