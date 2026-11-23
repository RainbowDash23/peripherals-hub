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

/**
 * Reconstruye un perfil completo a partir de un arreglo de entradas de captura HID.
 */
export function importProfileFromCaptureData(
  entries: ReadonlyArray<{ type?: string; data: number[] }>
): KeyboardProfile {
  const keys: KeyConfig[] = Array.from({ length: TOTAL_USEFUL_KEYS }, () => ({
    actuationRaw: 150,
    rtEnabled: 0,
    rtPressRaw: 50,
    rtReleaseRaw: 50,
  }));

  for (const entry of entries) {
    const d = entry.data;
    if (d && d[0] === 3 && d[1] === 150) {
      if (d[2] === 13) {
        decodeTable13Chunk(d, keys);
      } else if (d[2] === 14) {
        decodeTable14Chunk(d, keys);
      }
    }
  }

  return {
    version: '1.0.0',
    name: 'Perfil Importado de Captura',
    updatedAt: Date.now(),
    keys,
  };
}

/**
 * Reconstruye un perfil completo a partir de un archivo JSON de captura (captures/mad60he_*.json).
 */
export function importProfileFromCapture(captureFilePath: string): KeyboardProfile {
  const content = readFileSync(captureFilePath, 'utf-8');
  const entries = JSON.parse(content) as Array<{ type?: string; data: number[] }>;
  return importProfileFromCaptureData(entries);
}
