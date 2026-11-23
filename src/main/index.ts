import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { loadAllDrivers } from '../core/drivers/loader.js';
import { DeviceManager } from '../core/hid/device-manager.js';
import { LabMonitor } from '../core/hid/lab-monitor.js';
import { IPC_CHANNELS } from '../core/ipc/channels.js';

const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

let mainWindow: BrowserWindow | null = null;
const deviceManager = new DeviceManager(1500);
const labMonitor = new LabMonitor();

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'Peripherals Hub',
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];

  win.webContents.on('did-finish-load', () => {
    console.log('[Main] Ventana cargada exitosamente.');
    if (process.env['TEST_EXIT_AFTER_LOAD'] === '1') {
      setTimeout(() => {
        console.log('[Main] Prueba de carga exitosa, cerrando aplicacion.');
        app.quit();
      }, 1000);
    }
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] did-fail-load:', errorCode, errorDescription, validatedURL);
  });
  win.webContents.on('console-message', (event) => {
    console.log(`[Renderer] [L${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });

  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    const htmlPath = join(currentDir, '../renderer/index.html');
    console.log('[Main] Cargando HTML desde:', htmlPath);
    await win.loadFile(htmlPath);
  }

  return win;
}

function setupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.PERIPHERALS_GET_ALL, () => {
    return deviceManager.getDevices();
  });

  ipcMain.handle(IPC_CHANNELS.LAB_START_MONITORING, (_event, path: string) => {
    return labMonitor.startMonitoring(path);
  });

  ipcMain.handle(IPC_CHANNELS.LAB_STOP_MONITORING, () => {
    labMonitor.stopMonitoring();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.DRIVER_READ_STATE, async (_event, driverId: string) => {
    const driver = await deviceManager.getDriverInstance(driverId);
    if (!driver) {
      throw new Error(`Driver no encontrado: ${driverId}`);
    }
    return driver.readState();
  });

  ipcMain.handle(
    IPC_CHANNELS.DRIVER_PREPARE_APPLY,
    async (_event, driverId: string, partialState: Record<string, unknown>) => {
      const driver = await deviceManager.getDriverInstance(driverId);
      if (!driver) {
        throw new Error(`Driver no encontrado: ${driverId}`);
      }
      if ('prepareApply' in driver && typeof (driver as { prepareApply?: unknown }).prepareApply === 'function') {
        return (driver as unknown as { prepareApply: (keys: unknown) => unknown }).prepareApply(partialState['keys']);
      }
      return { changes: [], totalKeysAffected: 0 };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DRIVER_APPLY,
    async (_event, driverId: string, partialState: Record<string, unknown>) => {
      const driver = await deviceManager.getDriverInstance(driverId);
      if (!driver) {
        throw new Error(`Driver no encontrado: ${driverId}`);
      }
      await driver.apply(partialState);
      return { success: true };
    }
  );

  ipcMain.handle(IPC_CHANNELS.DRIVER_IMPORT_CAPTURE, async (_event, driverId: string) => {
    if (!mainWindow) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar Perfil desde Captura JSON',
      filters: [{ name: 'Captura HID JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return null;
    }

    const capturePath = filePaths[0]!;
    if (driverId === 'mad60he') {
      const { importProfileFromCapture } = await import('../../drivers/mad60he/protocol/storage.js');
      const imported = importProfileFromCapture(capturePath);
      return imported;
    }
    return null;
  });

  // Eventos hacia el Renderer
  deviceManager.on('devices-updated', (devices) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PERIPHERALS_UPDATED, devices);
    }
  });

  labMonitor.on('report', (report) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LAB_REPORT_RECEIVED, report);
    }
  });

  labMonitor.on('stream-error', (error) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.LAB_ERROR, error);
    }
  });
}

app.whenReady().then(async () => {
  setupIpc();

  // Cargar drivers e iniciar polling pasivo
  try {
    const drivers = await loadAllDrivers();
    deviceManager.setDrivers(drivers);
  } catch (error) {
    console.error('[Main] Error cargando drivers:', error);
  }

  deviceManager.start();

  mainWindow = await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  deviceManager.stop();
  labMonitor.stopMonitoring();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
