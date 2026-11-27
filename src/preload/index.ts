import { contextBridge, ipcRenderer } from 'electron';
import type { DiscoveredPeripheral } from '../core/hid/device-manager.js';
import type { HidReportEvent } from '../core/hid/lab-monitor.js';
import { IPC_CHANNELS } from '../core/ipc/channels.js';

export interface DriverChangeDifference {
  readonly index: number;
  readonly label: string;
  readonly field: string;
  readonly previous: number;
  readonly next: number;
}

export interface DriverPreparePlan {
  readonly changes: readonly DriverChangeDifference[];
  readonly totalKeysAffected: number;
}

export interface DriverApplyResult {
  readonly success: boolean;
  readonly savedLocally: boolean;
  readonly hardwareWritten: boolean;
  readonly transmission?: {
    readonly table13ChunksSent: number;
    readonly table13TotalChunks: number;
    readonly table14ChunksSent: number;
    readonly table14TotalChunks: number;
  };
  readonly appliedAt: number;
  readonly message: string;
}

export interface DriverImportResult {
  readonly name: string;
  readonly importedAt?: number;
  readonly keys: unknown[];
  readonly summary?: {
    readonly table13Found: boolean;
    readonly table13KeysCount: number;
    readonly table14Found: boolean;
    readonly table14KeysCount: number;
    readonly description: string;
  };
}

export interface DriverConfigImportResult {
  readonly name: string;
  readonly source: 'imported-file';
  readonly importedAt: number;
  readonly importedFileName: string;
  readonly protocolVersion: string;
  readonly deadBand: {
    readonly topRaw: number;
    readonly bottomRaw: number;
  };
  readonly keyLabels: readonly string[];
  readonly keys: unknown[];
  readonly summary: {
    readonly profileName: string;
    readonly protocolVersion: string;
    readonly keysCount: number;
    readonly deadBandTopRaw: number;
    readonly deadBandBottomRaw: number;
    readonly description: string;
  };
}

export interface PeripheralsHubApi {
  getAppVersion: () => Promise<string>;
  getPeripherals: () => Promise<readonly DiscoveredPeripheral[]>;
  onPeripheralsUpdated: (callback: (devices: readonly DiscoveredPeripheral[]) => void) => () => void;
  startLabMonitoring: (path: string) => Promise<{ success: boolean; error?: string }>;
  stopLabMonitoring: () => Promise<{ success: boolean }>;
  onLabReport: (callback: (report: HidReportEvent) => void) => () => void;
  onLabError: (callback: (error: string) => void) => () => void;
  getDriverState: (driverId: string) => Promise<{ connected: boolean; values: Record<string, unknown> }>;
  prepareDriverApply: (driverId: string, partialState: Record<string, unknown>) => Promise<DriverPreparePlan>;
  applyDriverSettings: (driverId: string, partialState: Record<string, unknown>) => Promise<DriverApplyResult>;
  importDriverCapture: (driverId: string) => Promise<DriverImportResult | null>;
  importKeyboardConfig: (driverId: string) => Promise<DriverConfigImportResult | null>;
}

export const api: PeripheralsHubApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getPeripherals: () => ipcRenderer.invoke(IPC_CHANNELS.PERIPHERALS_GET_ALL),
  onPeripheralsUpdated: (callback) => {
    const subscription = (_event: unknown, devices: readonly DiscoveredPeripheral[]) => callback(devices);
    ipcRenderer.on(IPC_CHANNELS.PERIPHERALS_UPDATED, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PERIPHERALS_UPDATED, subscription);
    };
  },
  startLabMonitoring: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.LAB_START_MONITORING, path),
  stopLabMonitoring: () => ipcRenderer.invoke(IPC_CHANNELS.LAB_STOP_MONITORING),
  onLabReport: (callback) => {
    const subscription = (_event: unknown, report: HidReportEvent) => callback(report);
    ipcRenderer.on(IPC_CHANNELS.LAB_REPORT_RECEIVED, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LAB_REPORT_RECEIVED, subscription);
    };
  },
  onLabError: (callback) => {
    const subscription = (_event: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.LAB_ERROR, subscription);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.LAB_ERROR, subscription);
    };
  },
  getDriverState: (driverId: string) => ipcRenderer.invoke(IPC_CHANNELS.DRIVER_READ_STATE, driverId),
  prepareDriverApply: (driverId: string, partialState: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.DRIVER_PREPARE_APPLY, driverId, partialState),
  applyDriverSettings: (driverId: string, partialState: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.DRIVER_APPLY, driverId, partialState),
  importDriverCapture: (driverId: string) => ipcRenderer.invoke(IPC_CHANNELS.DRIVER_IMPORT_CAPTURE, driverId),
  importKeyboardConfig: (driverId: string) => ipcRenderer.invoke(IPC_CHANNELS.DRIVER_IMPORT_CONFIG, driverId),
};

contextBridge.exposeInMainWorld('peripheralsHub', api);
