import { TOTAL_USEFUL_KEYS, type KeyConfig, type KeyboardProfile } from './profile.js';

export const TABLE_13_TOTAL_SLOTS = 77;
export const TABLE_13_KEYS_PER_CHUNK = 11;
export const TABLE_13_CHUNKS_COUNT = 7;

export const TABLE_14_TOTAL_SLOTS = 72;
export const TABLE_14_KEYS_PER_CHUNK = 4;
export const TABLE_14_CHUNKS_COUNT = 18;

export interface EncodedReport {
  readonly tableId: number;
  readonly startIndex: number;
  readonly count: number;
  readonly mark: number;
  readonly bytes: readonly number[]; // Exactamente 32 bytes
}

/**
 * Codifica la tabla 13 (recorrido de actuacion) en 7 trozos de 32 bytes.
 * Estructura: [3, 150, 13, 0, 0, 0, start, count, mark, datos (22 bytes), 0]
 */
export function encodeTable13(profile: KeyboardProfile): readonly EncodedReport[] {
  const reports: EncodedReport[] = [];

  for (let chunkIdx = 0; chunkIdx < TABLE_13_CHUNKS_COUNT; chunkIdx++) {
    const start = chunkIdx * TABLE_13_KEYS_PER_CHUNK;
    const count = TABLE_13_KEYS_PER_CHUNK;
    const mark = chunkIdx === 0 ? 1 : chunkIdx === TABLE_13_CHUNKS_COUNT - 1 ? 2 : 0;

    const payload: number[] = new Array(32).fill(0);
    payload[0] = 3;
    payload[1] = 150;
    payload[2] = 13;
    payload[3] = 0;
    payload[4] = 0;
    payload[5] = 0;
    payload[6] = start;
    payload[7] = count;
    payload[8] = mark;

    for (let k = 0; k < count; k++) {
      const keyIdx = start + k;
      let val = 0;
      if (keyIdx < TOTAL_USEFUL_KEYS) {
        val = profile.keys[keyIdx]?.actuationRaw ?? 150;
      }
      // Indices >= 70 permanecen en 0
      payload[9 + k * 2] = (val >> 8) & 0xff;
      payload[9 + k * 2 + 1] = val & 0xff;
    }

    reports.push({
      tableId: 13,
      startIndex: start,
      count,
      mark,
      bytes: payload,
    });
  }

  return reports;
}

/**
 * Decodifica trozos recibidos de la tabla 13 y actualiza los valores de actuacion del perfil.
 */
export function decodeTable13Chunk(chunkBytes: readonly number[], targetKeys: KeyConfig[]): void {
  if (chunkBytes[0] !== 3 || chunkBytes[1] !== 150 || chunkBytes[2] !== 13) {
    throw new Error('Cabecera invalida para reporte de Tabla 13');
  }

  const start = chunkBytes[6] ?? 0;
  const count = chunkBytes[7] ?? 0;

  for (let k = 0; k < count; k++) {
    const keyIdx = start + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const high = chunkBytes[9 + k * 2] ?? 0;
      const low = chunkBytes[9 + k * 2 + 1] ?? 0;
      const actuationRaw = (high << 8) | low;
      const prev = targetKeys[keyIdx] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      targetKeys[keyIdx] = {
        ...prev,
        actuationRaw,
      };
    }
  }
}

/**
 * Codifica la tabla 14 (Rapid Trigger) en 18 trozos de 32 bytes.
 * Estructura: [3, 150, 14, 0, 0, 0, start, count, mark, datos (20 bytes), 0, 0, 0]
 */
export function encodeTable14(profile: KeyboardProfile): readonly EncodedReport[] {
  const reports: EncodedReport[] = [];

  for (let chunkIdx = 0; chunkIdx < TABLE_14_CHUNKS_COUNT; chunkIdx++) {
    const start = chunkIdx * TABLE_14_KEYS_PER_CHUNK;
    const count = TABLE_14_KEYS_PER_CHUNK;
    const mark = chunkIdx === 0 ? 1 : chunkIdx === TABLE_14_CHUNKS_COUNT - 1 ? 2 : 0;

    const payload: number[] = new Array(32).fill(0);
    payload[0] = 3;
    payload[1] = 150;
    payload[2] = 14;
    payload[3] = 0;
    payload[4] = 0;
    payload[5] = 0;
    payload[6] = start;
    payload[7] = count;
    payload[8] = mark;

    for (let k = 0; k < count; k++) {
      const keyIdx = start + k;
      const base = 9 + k * 5;
      if (keyIdx < TOTAL_USEFUL_KEYS) {
        const key = profile.keys[keyIdx];
        const enabled = key?.rtEnabled ?? 0;
        const press = key?.rtPressRaw ?? 50;
        const release = key?.rtReleaseRaw ?? 50;

        payload[base] = enabled & 0xff;
        payload[base + 1] = (press >> 8) & 0xff;
        payload[base + 2] = press & 0xff;
        payload[base + 3] = (release >> 8) & 0xff;
        payload[base + 4] = release & 0xff;
      }
      // Indices >= 70 permanecen en 0
    }

    reports.push({
      tableId: 14,
      startIndex: start,
      count,
      mark,
      bytes: payload,
    });
  }

  return reports;
}

/**
 * Decodifica trozos recibidos de la tabla 14 y actualiza los valores de Rapid Trigger del perfil.
 */
export function decodeTable14Chunk(chunkBytes: readonly number[], targetKeys: KeyConfig[]): void {
  if (chunkBytes[0] !== 3 || chunkBytes[1] !== 150 || chunkBytes[2] !== 14) {
    throw new Error('Cabecera invalida para reporte de Tabla 14');
  }

  const start = chunkBytes[6] ?? 0;
  const count = chunkBytes[7] ?? 0;

  for (let k = 0; k < count; k++) {
    const keyIdx = start + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const base = 9 + k * 5;
      const rtEnabled = chunkBytes[base] ?? 0;
      const rtPressRaw = ((chunkBytes[base + 1] ?? 0) << 8) | (chunkBytes[base + 2] ?? 0);
      const rtReleaseRaw = ((chunkBytes[base + 3] ?? 0) << 8) | (chunkBytes[base + 4] ?? 0);

      const prev = targetKeys[keyIdx] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      targetKeys[keyIdx] = {
        ...prev,
        rtEnabled,
        rtPressRaw,
        rtReleaseRaw,
      };
    }
  }
}
