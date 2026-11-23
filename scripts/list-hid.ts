import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import HID from 'node-hid';

/**
 * Representa la información formateada y normalizada de un dispositivo HID
 * para facilitar el análisis de protocolos e ingeniería inversa.
 */
export interface HidDeviceSummary {
  readonly vendorId: number;
  readonly vendorIdHex: string;
  readonly productId: number;
  readonly productIdHex: string;
  readonly usagePage?: number;
  readonly usagePageHex?: string;
  readonly usage?: number;
  readonly usageHex?: string;
  readonly interface: number;
  readonly path: string;
  readonly manufacturer?: string;
  readonly product?: string;
  readonly serialNumber?: string;
  readonly release: number;
}

/**
 * Convierte un número decimal a representación hexadecimal formateada con padding (ej: 0x046d)
 */
function toHex(value: number | undefined, padding: number = 4): string | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return `0x${value.toString(16).padStart(padding, '0').toUpperCase()}`;
}

/**
 * Normaliza y enriquece un descriptor de dispositivo devuelto por node-hid.
 */
export function formatHidDevice(rawDevice: HID.Device): HidDeviceSummary {
  return {
    vendorId: rawDevice.vendorId,
    vendorIdHex: toHex(rawDevice.vendorId, 4) ?? '0x0000',
    productId: rawDevice.productId,
    productIdHex: toHex(rawDevice.productId, 4) ?? '0x0000',
    usagePage: rawDevice.usagePage,
    usagePageHex: toHex(rawDevice.usagePage, 4),
    usage: rawDevice.usage,
    usageHex: toHex(rawDevice.usage, 4),
    interface: rawDevice.interface,
    path: rawDevice.path ?? '',
    manufacturer: rawDevice.manufacturer,
    product: rawDevice.product,
    serialNumber: rawDevice.serialNumber,
    release: rawDevice.release,
  };
}

/**
 * Enumera de manera pasiva y segura todos los dispositivos HID presentes en el sistema.
 * ADVERTENCIA: Esta función es estrictamente de solo lectura. No envía ningún byte al hardware.
 */
export function listHidDevices(): readonly HidDeviceSummary[] {
  const rawDevices = HID.devices();
  return rawDevices.map((device) => formatHidDevice(device));
}

/**
 * Guarda la lista de dispositivos en un archivo JSON formateado.
 */
export function saveDevicesToJson(devices: readonly HidDeviceSummary[], outputPath: string): void {
  const resolvedPath = resolve(outputPath);
  const targetDir = dirname(resolvedPath);

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const jsonContent = JSON.stringify(devices, null, 2);
  writeFileSync(resolvedPath, jsonContent, 'utf-8');
}

/**
 * Obtiene la ruta de salida desde los argumentos de línea de comandos o usa la predeterminada.
 */
function resolveOutputPath(): string {
  const args = process.argv.slice(2);
  const outFlagIndex = args.indexOf('--out');

  if (outFlagIndex !== -1 && args[outFlagIndex + 1]) {
    return args[outFlagIndex + 1]!;
  }

  return 'docs/protocol/discovered-hid-devices.json';
}

/**
 * Función principal que orquesta la enumeración y el guardado.
 */
function run(): void {
  try {
    console.log('[list-hid] Enumerando dispositivos HID en modo pasivo (solo lectura)...');
    const devices = listHidDevices();

    const outputPath = resolveOutputPath();
    saveDevicesToJson(devices, outputPath);

    console.log(`[list-hid] Éxito: Se enumeraron ${devices.length} interfaces HID.`);
    console.log(`[list-hid] Salida guardada en: ${resolve(outputPath)}`);

    // Mostrar resumen en consola agrupado por VID:PID
    console.log('\n--- Resumen de Dispositivos Detectados ---');
    interface DeviceSummaryEntry {
      product?: string;
      manufacturer?: string;
      endpoints: Array<{
        interface: number;
        usagePageHex?: string;
        usagePage?: number;
        usageHex?: string;
        usage?: number;
      }>;
    }

    const uniqueDevices = new Map<string, DeviceSummaryEntry>();

    for (const dev of devices) {
      const key = `${dev.vendorIdHex}:${dev.productIdHex}`;
      const entry = uniqueDevices.get(key) ?? {
        product: dev.product,
        manufacturer: dev.manufacturer,
        endpoints: [],
      };
      entry.endpoints.push({
        interface: dev.interface,
        usagePageHex: dev.usagePageHex,
        usagePage: dev.usagePage,
        usageHex: dev.usageHex,
        usage: dev.usage,
      });
      uniqueDevices.set(key, entry);
    }

    for (const [vidPid, info] of uniqueDevices.entries()) {
      const label = [info.manufacturer?.trim(), info.product?.trim()].filter(Boolean).join(' - ') || 'Dispositivo desconocido';
      console.log(`- ${vidPid} [${label}]`);
      for (const ep of info.endpoints) {
        const up = ep.usagePageHex ?? (ep.usagePage !== undefined ? `0x${ep.usagePage.toString(16)}` : 'N/A');
        const u = ep.usageHex ?? (ep.usage !== undefined ? `0x${ep.usage.toString(16)}` : 'N/A');
        console.log(`    interface: ${ep.interface.toString().padStart(2, ' ')} | usagePage: ${up.padEnd(6, ' ')} (${ep.usagePage ?? 'N/A'}) | usage: ${u.padEnd(6, ' ')} (${ep.usage ?? 'N/A'})`);
      }
    }
    console.log('------------------------------------------\n');
  } catch (error) {
    console.error('[list-hid] Error al enumerar dispositivos HID:', error);
    process.exit(1);
  }
}

// Ejecutar si se invoca directamente desde CLI
run();
