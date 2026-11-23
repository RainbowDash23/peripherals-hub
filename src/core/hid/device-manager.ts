import { EventEmitter } from 'node:events';
import HID from 'node-hid';
import { normalizeId, type LoadedDriverEntry } from '../drivers/loader.js';
import type { Driver, DriverManifest } from '../drivers/types.js';

export interface DeviceEndpointInfo {
  readonly path: string;
  readonly interface: number;
  readonly usagePage?: number;
  readonly usagePageHex?: string;
  readonly usage?: number;
  readonly usageHex?: string;
}

export interface DiscoveredPeripheral {
  readonly id: string;
  readonly vendorId: number;
  readonly vendorIdHex: string;
  readonly productId: number;
  readonly productIdHex: string;
  readonly manufacturer?: string;
  readonly product?: string;
  readonly serialNumber?: string;
  readonly release: number;
  readonly endpoints: readonly DeviceEndpointInfo[];
  /**
   * Indica si coincide con algun driver registrado.
   */
  readonly status: 'supported' | 'unsupported';
  readonly driverId?: string;
  readonly driverManifest?: DriverManifest;
  /**
   * Ruta del endpoint de control que coincide con controlInterface.
   */
  readonly controlPath?: string;
}

export interface DeviceManagerEvents {
  'devices-updated': (devices: readonly DiscoveredPeripheral[]) => void;
  'device-connected': (device: DiscoveredPeripheral) => void;
  'device-disconnected': (deviceId: string) => void;
}

function toHex(value: number | undefined, padding: number = 4): string | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return `0x${value.toString(16).padStart(padding, '0').toUpperCase()}`;
}

export class DeviceManager extends EventEmitter {
  private pollingIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private knownDrivers: readonly LoadedDriverEntry[] = [];
  private currentPeripherals: Map<string, DiscoveredPeripheral> = new Map();
  private driverInstances: Map<string, Driver> = new Map();

  constructor(pollingIntervalMs: number = 1500) {
    super();
    this.pollingIntervalMs = pollingIntervalMs;
  }

  public setDrivers(drivers: readonly LoadedDriverEntry[]): void {
    this.knownDrivers = drivers;
    this.pollDevices();
  }

  public start(): void {
    if (this.timer) {
      return;
    }
    this.pollDevices();
    this.timer = setInterval(() => {
      this.pollDevices();
    }, this.pollingIntervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getDevices(): readonly DiscoveredPeripheral[] {
    return Array.from(this.currentPeripherals.values());
  }

  public getDeviceById(id: string): DiscoveredPeripheral | undefined {
    return this.currentPeripherals.get(id);
  }

  public async getDriverInstance(driverId: string): Promise<Driver | null> {
    let instance = this.driverInstances.get(driverId);
    if (!instance) {
      const entry = this.knownDrivers.find((d) => d.manifest.id === driverId);
      if (!entry) {
        return null;
      }
      instance = await entry.driverFactory();
      this.driverInstances.set(driverId, instance);
    }

    const peripheral = Array.from(this.currentPeripherals.values()).find((p) => p.driverId === driverId);
    if (peripheral && peripheral.controlPath) {
      await instance.connect({
        path: peripheral.controlPath,
        descriptor: {
          vendorId: peripheral.vendorId,
          productId: peripheral.productId,
          path: peripheral.controlPath,
          release: peripheral.release,
          interface: peripheral.endpoints.find((e) => e.path === peripheral.controlPath)?.interface ?? -1,
        },
      });
    }

    return instance;
  }

  /**
   * Ejecuta un ciclo de escaneo pasivo con HID.devices() y compara con el estado previo.
   */
  public pollDevices(): void {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;

    try {
      const rawDevices = HID.devices();
      const grouped = new Map<string, HID.Device[]>();

      for (const dev of rawDevices) {
        if (!dev.path) continue;
        const key = `${dev.vendorId}:${dev.productId}`;
        const group = grouped.get(key) ?? [];
        group.push(dev);
        grouped.set(key, group);
      }

      const nextPeripherals = new Map<string, DiscoveredPeripheral>();

      for (const [key, devList] of grouped.entries()) {
        const first = devList[0]!;
        const vendorId = first.vendorId;
        const productId = first.productId;
        const vendorIdHex = toHex(vendorId, 4) ?? '0x0000';
        const productIdHex = toHex(productId, 4) ?? '0x0000';

        const endpoints: DeviceEndpointInfo[] = devList.map((d) => ({
          path: d.path!,
          interface: d.interface,
          usagePage: d.usagePage,
          usagePageHex: toHex(d.usagePage, 4),
          usage: d.usage,
          usageHex: toHex(d.usage, 4),
        }));

        // Buscar coincidencia con drivers conocidos
        let matchedDriver: LoadedDriverEntry | null = null;
        let matchedControlPath: string | undefined = undefined;

        for (const driverEntry of this.knownDrivers) {
          const manifest = driverEntry.manifest;
          const matchesDevice = manifest.devices.some((deviceMatch) => {
            return (
              normalizeId(deviceMatch.vendorId) === vendorId &&
              normalizeId(deviceMatch.productId) === productId
            );
          });

          if (matchesDevice) {
            const targetUsagePage = normalizeId(manifest.controlInterface.usagePage);
            const targetUsage = normalizeId(manifest.controlInterface.usage);

            const matchingEndpoint = endpoints.find(
              (ep) => ep.usagePage === targetUsagePage && ep.usage === targetUsage
            );

            if (matchingEndpoint) {
              matchedDriver = driverEntry;
              matchedControlPath = matchingEndpoint.path;
              break;
            }
          }
        }

        const peripheral: DiscoveredPeripheral = {
          id: key,
          vendorId,
          vendorIdHex,
          productId,
          productIdHex,
          manufacturer: first.manufacturer?.trim(),
          product: first.product?.trim(),
          serialNumber: first.serialNumber?.trim(),
          release: first.release,
          endpoints,
          status: matchedDriver ? 'supported' : 'unsupported',
          driverId: matchedDriver?.manifest.id,
          driverManifest: matchedDriver?.manifest,
          controlPath: matchedControlPath,
        };

        nextPeripherals.set(key, peripheral);
      }

      // Detectar cambios
      let hasChanges = false;

      // Desconexiones
      for (const [id] of this.currentPeripherals) {
        if (!nextPeripherals.has(id)) {
          hasChanges = true;
          this.emit('device-disconnected', id);
        }
      }

      // Conexiones o actualizaciones
      for (const [id, peripheral] of nextPeripherals) {
        const prev = this.currentPeripherals.get(id);
        if (!prev) {
          hasChanges = true;
          this.emit('device-connected', peripheral);
        } else if (
          prev.endpoints.length !== peripheral.endpoints.length ||
          prev.status !== peripheral.status
        ) {
          hasChanges = true;
        }
      }

      this.currentPeripherals = nextPeripherals;

      if (hasChanges) {
        this.emit('devices-updated', Array.from(this.currentPeripherals.values()));
      }
    } catch (error) {
      console.error('[DeviceManager] Error durante polling de HID:', error);
    } finally {
      this.isPolling = false;
    }
  }
}
