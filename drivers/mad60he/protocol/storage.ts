import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDefaultProfile, TOTAL_USEFUL_KEYS, type KeyConfig, type KeyboardProfile } from './profile.js';
import { decodeTable13Chunk, decodeTable14Chunk } from './codec.js';

export function getMad60HeStoragePath(): string {
  const appData = process.env['APPDATA'] || join(homedir(), 'AppData', 'Roaming');
  return join(appData, 'peripherals-hub', 'profiles', 'mad60he.json');
}

export function saveProfile(profile: KeyboardProfile, customPath?: string): void {
  const filePath = customPath ?? getMad60HeStoragePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data = JSON.stringify(profile, null, 2);
  writeFileSync(filePath, data, 'utf-8');
}

export function loadProfile(customPath?: string): KeyboardProfile {
  const filePath = customPath ?? getMad60HeStoragePath();
  if (!existsSync(filePath)) {
    const defaultProf = createDefaultProfile();
    saveProfile(defaultProf, filePath);
    return defaultProf;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as KeyboardProfile;
  } catch (error) {
    console.error(`Error al cargar perfil desde ${filePath}, generando por defecto:`, error);
    return createDefaultProfile();
  }
}

export interface CaptureInspectionSummary {
  readonly table13Found: boolean;
  readonly table13KeysCount: number;
  readonly table14Found: boolean;
  readonly table14KeysCount: number;
  readonly description: string;
}

export interface ImportedProfileResult extends KeyboardProfile {
  readonly summary: CaptureInspectionSummary;
}

/**
 * Reconstruye un perfil completo a partir de un arreglo de entradas de captura HID.
 * Si falta la Tabla 13 o la Tabla 14, rechaza la importacion con un mensaje claro.
 */
export function importProfileFromCaptureData(
  entries: ReadonlyArray<{ type?: string; data: number[] }>
): ImportedProfileResult {
  const keys: KeyConfig[] = Array.from({ length: TOTAL_USEFUL_KEYS }, () => ({
    actuationRaw: 150,
    rtEnabled: 0,
    rtPressRaw: 50,
    rtReleaseRaw: 50,
  }));

  const table13KeySet = new Set<number>();
  const table14KeySet = new Set<number>();
  let table13Found = false;
  let table14Found = false;

  for (const entry of entries) {
    const d = entry.data;
    if (d && d[0] === 3 && d[1] === 150) {
      if (d[2] === 13) {
        table13Found = true;
        const affected = decodeTable13Chunk(d, keys);
        for (const idx of affected) {
          table13KeySet.add(idx);
        }
      } else if (d[2] === 14) {
        table14Found = true;
        const affected = decodeTable14Chunk(d, keys);
        for (const idx of affected) {
          table14KeySet.add(idx);
        }
      }
    }
  }

  const table13KeysCount = table13KeySet.size;
  const table14KeysCount = table14KeySet.size;

  const t13Desc = table13Found ? `si (${table13KeysCount} teclas)` : 'no';
  const t14Desc = table14Found ? `si (${table14KeysCount} teclas)` : 'no';

  if (!table13Found || !table14Found) {
    const missing: string[] = [];
    if (!table13Found) missing.push('Tabla 13 (recorrido de actuacion)');
    if (!table14Found) missing.push('Tabla 14 (Rapid Trigger)');
    throw new Error(
      `Captura rechazada: falta ${missing.join(' y ')}. Encontrado en captura -> Tabla 13: ${t13Desc}, Tabla 14: ${t14Desc}.`
    );
  }

  const summary: CaptureInspectionSummary = {
    table13Found,
    table13KeysCount,
    table14Found,
    table14KeysCount,
    description: `Tabla 13: ${t13Desc}, Tabla 14: ${t14Desc}`,
  };

  const importedAt = Date.now();
  return {
    version: '1.0.0',
    name: 'Perfil Importado de Captura',
    source: 'capture',
    importedAt,
    updatedAt: importedAt,
    keys,
    summary,
  };
}

/**
 * Reconstruye un perfil completo a partir de un archivo JSON de captura (captures/mad60he_*.json).
 */
export function importProfileFromCapture(captureFilePath: string): ImportedProfileResult {
  const content = readFileSync(captureFilePath, 'utf-8');
  const entries = JSON.parse(content) as Array<{ type?: string; data: number[] }>;
  return importProfileFromCaptureData(entries);
}
