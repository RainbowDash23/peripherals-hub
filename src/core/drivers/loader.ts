import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DriverManifestSchema } from './schema.js';
import type { Driver, DriverManifest } from './types.js';

export interface LoadedDriverEntry {
  readonly manifest: DriverManifest;
  readonly driverFactory: () => Promise<Driver> | Driver;
  readonly source: 'builtin' | 'user';
  readonly path: string;
}

/**
 * Normaliza valores numericos o hex a numero para comparaciones uniformes.
 */
export function normalizeId(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }
  return Number.parseInt(value, value.startsWith('0x') || value.startsWith('0X') ? 16 : 10);
}

/**
 * Obtiene la ruta de la carpeta de drivers de usuario en el sistema operativo.
 */
export function getUserDriversDirectory(): string {
  const appData = process.env['APPDATA'] || join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'peripherals-hub', 'drivers');
}

/**
 * Carga un driver individual desde un directorio dado.
 */
export async function loadDriverFromFolder(folderPath: string, source: 'builtin' | 'user'): Promise<LoadedDriverEntry | null> {
  const manifestPath = join(folderPath, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const rawContent = readFileSync(manifestPath, 'utf-8');
    const parsedJson = JSON.parse(rawContent) as unknown;
    const validationResult = DriverManifestSchema.safeParse(parsedJson);

    if (!validationResult.success) {
      console.warn(`[DriverLoader] Manifest invalido en ${manifestPath}:`, validationResult.error.format());
      return null;
    }

    const manifest = validationResult.data as DriverManifest;

    // Buscar punto de entrada JavaScript compilado o TypeScript
    const possibleEntrypoints = ['index.js', 'driver.js', 'index.ts', 'driver.ts'];
    let entryFile: string | null = null;

    for (const entry of possibleEntrypoints) {
      const fullPath = join(folderPath, entry);
      if (existsSync(fullPath)) {
        entryFile = fullPath;
        break;
      }
    }

    if (!entryFile) {
      console.warn(`[DriverLoader] No se encontro archivo ejecutable (index.js/ts) en ${folderPath}`);
      return null;
    }

    const driverFactory = async (): Promise<Driver> => {
      const fileUrl = pathToFileURL(entryFile!).href;
      const mod = await import(fileUrl);
      const DriverClass = mod.default ?? mod[manifest.name] ?? mod.Driver;
      if (typeof DriverClass === 'function') {
        return new DriverClass();
      }
      if (typeof DriverClass === 'object' && DriverClass !== null) {
        return DriverClass as Driver;
      }
      throw new Error(`El modulo en ${entryFile} no exporta una clase o instancia valida de Driver`);
    };

    return {
      manifest,
      driverFactory,
      source,
      path: folderPath,
    };
  } catch (error) {
    console.error(`[DriverLoader] Error cargando driver en ${folderPath}:`, error);
    return null;
  }
}

/**
 * Escanea un directorio en busca de subdirectorios con drivers.
 */
export async function scanDriversDirectory(baseDir: string, source: 'builtin' | 'user'): Promise<readonly LoadedDriverEntry[]> {
  if (!existsSync(baseDir)) {
    return [];
  }

  const entries: LoadedDriverEntry[] = [];
  try {
    const items = readdirSync(baseDir, { withFileTypes: true });
    for (const item of items) {
      if (item.isDirectory()) {
        const folder = join(baseDir, item.name);
        const driverEntry = await loadDriverFromFolder(folder, source);
        if (driverEntry) {
          entries.push(driverEntry);
        }
      }
    }
  } catch (error) {
    console.error(`[DriverLoader] Error escaneando ${baseDir}:`, error);
  }

  return entries;
}

/**
 * Carga todos los drivers disponibles (internos del repositorio y externos de usuario).
 */
export async function loadAllDrivers(repoDriversPath?: string): Promise<readonly LoadedDriverEntry[]> {
  const builtinDir = repoDriversPath ?? resolve(process.cwd(), 'drivers');
  const userDir = getUserDriversDirectory();

  const [builtinDrivers, userDrivers] = await Promise.all([
    scanDriversDirectory(builtinDir, 'builtin'),
    scanDriversDirectory(userDir, 'user'),
  ]);

  console.log(`[DriverLoader] Drivers cargados: ${builtinDrivers.length} integrados, ${userDrivers.length} de usuario.`);
  return [...builtinDrivers, ...userDrivers];
}
