import { extractLayer0Labels, type KeyboardActionEntry } from './keymap.js';
import {
  ACTUATION_MAX_RAW,
  ACTUATION_MIN_RAW,
  MATRIX_COLS,
  MATRIX_ROWS,
  RT_MAX_RAW,
  RT_MIN_RAW,
  TOTAL_USEFUL_KEYS,
  type DeadBandConfig,
  type KeyConfig,
  type KeyboardProfile,
} from './profile.js';
import { sendReadRequestAndAwaitHeader, type HidDeviceTransport, type ReadRequestOptions } from './transmitter.js';

export const READ_TABLE_13_STARTS = [0, 12, 24, 36, 48, 60] as const;
export const READ_TABLE_13_KEYS_PER_CHUNK = 12;

export const READ_TABLE_14_CHUNK_COUNT = 18;
export const READ_TABLE_14_KEYS_PER_CHUNK = 4;

export const KEYMAP_LAYERS_COUNT = 4;
export const KEYMAP_ROW_BYTES = 28; // 14 teclas * 2 bytes [keyClass, keyId]

const SUPPORTED_LIVE_PROTOCOL_REGEX = /^1\.\d{2}$/;

export interface LiveKeyboardProfile extends KeyboardProfile {
  readonly source: 'keyboard';
  readonly readAt: number;
  readonly protocolVersion: string;
  readonly deadBand: DeadBandConfig;
  readonly keyLabels: readonly string[];
  readonly keymapLayers: readonly (readonly (readonly KeyboardActionEntry[])[])[];
}

export function buildReadRequest32(header: readonly number[]): number[] {
  const payload = new Array<number>(32).fill(0);
  for (let i = 0; i < header.length && i < 32; i++) {
    payload[i] = header[i]! & 0xff;
  }
  return payload;
}

function assertExactHeader(bytes: readonly number[], expectedHeader: readonly number[], label: string): void {
  if (bytes.length !== 32) {
    throw new Error(`Respuesta invalida en ${label}: longitud ${bytes.length} bytes (se esperaban 32)`);
  }
  for (let i = 0; i < expectedHeader.length; i++) {
    if (bytes[i] !== expectedHeader[i]) {
      throw new Error(
        `Cabecera invalida en ${label}: esperado [${expectedHeader.join(', ')}], recibido [${bytes.slice(0, expectedHeader.length).join(', ')}]`
      );
    }
  }
}

function readUint16BE(bytes: readonly number[], offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

export function parseVersionResponse(bytes: readonly number[]): string {
  assertExactHeader(bytes, [2, 150, 0, 0, 0], 'lectura de version');
  const major = bytes[5] ?? 0;
  const minor = bytes[6] ?? 0;
  const version = `${major.toString(16)}.${minor.toString(16).padStart(2, '0')}`;
  if (!SUPPORTED_LIVE_PROTOCOL_REGEX.test(version)) {
    throw new Error(`Version de firmware/protocolo no soportada al leer teclado: "${version}"`);
  }
  return version;
}

export function parseDeadBandResponse(bytes: readonly number[]): DeadBandConfig {
  assertExactHeader(bytes, [2, 150, 11], 'lectura de zona muerta');
  const topRaw = readUint16BE(bytes, 3);
  const bottomRaw = readUint16BE(bytes, 5);
  if (topRaw < 0 || topRaw > 400 || bottomRaw < 0 || bottomRaw > 400) {
    throw new Error(`Valores de zona muerta fuera de rango (0-400 cs mm): top=${topRaw}, bottom=${bottomRaw}`);
  }
  return { topRaw, bottomRaw };
}

export function parseTable13ReadResponse(
  bytes: readonly number[],
  expectedStart: number,
  targetActuations: number[]
): void {
  assertExactHeader(bytes, [2, 150, 13, 0, 0, 0, expectedStart, READ_TABLE_13_KEYS_PER_CHUNK], `Tabla 13 (inicio=${expectedStart})`);

  for (let k = 0; k < READ_TABLE_13_KEYS_PER_CHUNK; k++) {
    const keyIdx = expectedStart + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const actuationRaw = readUint16BE(bytes, 8 + k * 2);
      if (actuationRaw < ACTUATION_MIN_RAW || actuationRaw > ACTUATION_MAX_RAW) {
        throw new Error(
          `Recorrido de actuacion leido fuera de rango (${ACTUATION_MIN_RAW}-${ACTUATION_MAX_RAW} cs mm) en tecla ${keyIdx}: ${actuationRaw}`
        );
      }
      targetActuations[keyIdx] = actuationRaw;
    }
  }
}

export interface RtKeyReadValue {
  readonly rtEnabled: number;
  readonly rtPressRaw: number;
  readonly rtReleaseRaw: number;
}

export function parseTable14ReadResponse(
  bytes: readonly number[],
  expectedStart: number,
  targetRt: RtKeyReadValue[]
): void {
  assertExactHeader(bytes, [2, 150, 14, 0, 0, 0, expectedStart, READ_TABLE_14_KEYS_PER_CHUNK], `Tabla 14 (inicio=${expectedStart})`);

  for (let k = 0; k < READ_TABLE_14_KEYS_PER_CHUNK; k++) {
    const keyIdx = expectedStart + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const base = 8 + k * 5;
      const rtEnabled = bytes[base] ?? 0;
      const rtPressRaw = readUint16BE(bytes, base + 1);
      const rtReleaseRaw = readUint16BE(bytes, base + 3);

      if (rtEnabled !== 0 && rtEnabled !== 1) {
        throw new Error(`Estado Rapid Trigger invalido leido en tecla ${keyIdx}: ${rtEnabled}`);
      }
      if (rtPressRaw < RT_MIN_RAW || rtPressRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al pulsar leida fuera de rango (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en tecla ${keyIdx}: ${rtPressRaw}`
        );
      }
      if (rtReleaseRaw < RT_MIN_RAW || rtReleaseRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al soltar leida fuera de rango (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en tecla ${keyIdx}: ${rtReleaseRaw}`
        );
      }

      targetRt[keyIdx] = { rtEnabled, rtPressRaw, rtReleaseRaw };
    }
  }
}

export function parseKeymapReadResponse(
  bytes: readonly number[],
  expectedOffset: number
): readonly KeyboardActionEntry[] {
  const offHi = (expectedOffset >> 8) & 0xff;
  const offLo = expectedOffset & 0xff;
  assertExactHeader(bytes, [18, offHi, offLo, KEYMAP_ROW_BYTES], `Keymap (offset=${expectedOffset})`);

  const rowEntries: KeyboardActionEntry[] = [];
  for (let col = 0; col < MATRIX_COLS; col++) {
    const keyClass = bytes[4 + col * 2] ?? 0;
    const keyId = bytes[4 + col * 2 + 1] ?? 0;
    rowEntries.push({ keyClass, keyId });
  }
  return rowEntries;
}

/**
 * Lee en serie la configuracion completa actual del MAD60HE (version, zona muerta,
 * Tabla 13, Tabla 14 y keymap de 4 capas x 5 filas). No emite escrituras.
 */
export async function readMad60HeProfile(
  device: HidDeviceTransport,
  options: ReadRequestOptions = {}
): Promise<LiveKeyboardProfile> {
  const timeoutMs = options.timeoutMs ?? 800;
  const maxRetriesOnMismatch = options.maxRetriesOnMismatch ?? 1;

  // 1. Version de protocolo
  const verHeader = [2, 150, 0, 0, 0] as const;
  const verResp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32([2, 150, 0]), verHeader, {
    timeoutMs,
    maxRetriesOnMismatch,
    label: 'version',
  });
  const protocolVersion = parseVersionResponse(verResp);

  // 2. Zona muerta (deadband)
  const dbHeader = [2, 150, 11] as const;
  const dbResp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(dbHeader), dbHeader, {
    timeoutMs,
    maxRetriesOnMismatch,
    label: 'zona muerta',
  });
  const deadBand = parseDeadBandResponse(dbResp);

  // 3. Tabla 13 (recorrido de actuacion): 6 lecturas en serie
  const actuations = new Array<number>(TOTAL_USEFUL_KEYS);
  for (const start of READ_TABLE_13_STARTS) {
    const header = [2, 150, 13, 0, 0, 0, start, READ_TABLE_13_KEYS_PER_CHUNK];
    const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
      timeoutMs,
      maxRetriesOnMismatch,
      label: `Tabla 13 (inicio=${start})`,
    });
    parseTable13ReadResponse(resp, start, actuations);
  }

  // 4. Tabla 14 (Rapid Trigger): 18 lecturas en serie
  const rtRecords = new Array<RtKeyReadValue>(TOTAL_USEFUL_KEYS);
  for (let chunkIdx = 0; chunkIdx < READ_TABLE_14_CHUNK_COUNT; chunkIdx++) {
    const start = chunkIdx * READ_TABLE_14_KEYS_PER_CHUNK;
    const header = [2, 150, 14, 0, 0, 0, start, READ_TABLE_14_KEYS_PER_CHUNK];
    const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
      timeoutMs,
      maxRetriesOnMismatch,
      label: `Tabla 14 (inicio=${start})`,
    });
    parseTable14ReadResponse(resp, start, rtRecords);
  }

  // 5. Keymap (4 capas x 5 filas = 20 lecturas en serie)
  const keymapLayers: KeyboardActionEntry[][][] = [];
  for (let layer = 0; layer < KEYMAP_LAYERS_COUNT; layer++) {
    const layerRows: KeyboardActionEntry[][] = [];
    for (let row = 0; row < MATRIX_ROWS; row++) {
      const offset = (layer * MATRIX_ROWS + row) * KEYMAP_ROW_BYTES;
      const offHi = (offset >> 8) & 0xff;
      const offLo = offset & 0xff;
      const header = [18, offHi, offLo, KEYMAP_ROW_BYTES];
      const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
        timeoutMs,
        maxRetriesOnMismatch,
        label: `Keymap capa=${layer} fila=${row}`,
      });
      layerRows.push([...parseKeymapReadResponse(resp, offset)]);
    }
    keymapLayers.push(layerRows);
  }

  // Verificar integridad completa antes de construir el perfil
  const keys: KeyConfig[] = [];
  for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
    const actuationRaw = actuations[i];
    const rt = rtRecords[i];
    if (actuationRaw === undefined || rt === undefined) {
      throw new Error(`Lectura incompleta del teclado: falta configuracion en tecla ${i}.`);
    }
    keys.push({
      actuationRaw,
      rtEnabled: rt.rtEnabled,
      rtPressRaw: rt.rtPressRaw,
      rtReleaseRaw: rt.rtReleaseRaw,
    });
  }

  const layer0 = keymapLayers[0];
  if (!layer0 || layer0.length !== MATRIX_ROWS) {
    throw new Error('Lectura incompleta del teclado: falta capa 0 de keymap.');
  }

  const keyLabels = extractLayer0Labels(layer0);
  const readAt = Date.now();

  return {
    version: '1.0.0',
    name: 'Configuracion del Teclado',
    source: 'keyboard',
    readAt,
    updatedAt: readAt,
    protocolVersion,
    deadBand,
    keyLabels,
    keymapLayers,
    keys,
  };
}
