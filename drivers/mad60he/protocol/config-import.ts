import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { z } from 'zod';
import {
  ACTUATION_MAX_RAW,
  ACTUATION_MIN_RAW,
  DEFAULT_KEY_CONFIG,
  MATRIX_COLS,
  MATRIX_ROWS,
  RT_MAX_RAW,
  RT_MIN_RAW,
  TOTAL_USEFUL_KEYS,
  type DeadBandConfig,
  type KeyConfig,
  type KeyboardProfile,
} from './profile.js';
import { extractLayer0Labels } from './keymap.js';

export const MAX_CONFIG_FILE_BYTES = 5 * 1024 * 1024;
export const EXPECTED_COMPONENT_ID = 'duck-bread-keyboard';
export const SUPPORTED_PROTOCOL_VERSION_REGEX = /^1\.\d{2}$/;

const OuterExportSchema = z
  .object({
    name: z.string().min(1, 'El campo name de nivel superior esta vacio'),
    data: z.string().min(1, 'El campo data de nivel superior esta vacio'),
    component: z.string().min(1, 'El campo component de nivel superior esta vacio'),
  })
  .passthrough();

const TogThEntrySchema = z
  .object({
    row: z.number().int().min(0),
    col: z.number().int().min(0),
    apc: z.number().finite(),
  })
  .passthrough();

const RtKeyEntrySchema = z
  .object({
    row: z.number().int().min(0),
    col: z.number().int().min(0),
    on: z.union([z.literal(0), z.literal(1)]),
    release: z.number().finite(),
    press: z.number().finite(),
  })
  .passthrough();

const KeyboardActionCellSchema = z
  .object({
    keyClass: z.number().int().min(0),
    keyId: z.number().int().min(0),
  })
  .passthrough();

const InnerConfigDataSchema = z
  .object({
    protocolVersion: z.object({
      version: z.string().min(1, 'Falta protocolVersion.version en la configuracion'),
    }),
    togThs: z
      .array(z.array(TogThEntrySchema))
      .min(MATRIX_ROWS, `togThs debe tener al menos ${MATRIX_ROWS} filas`),
    rtKeys: z
      .array(z.array(RtKeyEntrySchema))
      .min(MATRIX_ROWS, `rtKeys debe tener al menos ${MATRIX_ROWS} filas`),
    keyboardAction: z
      .array(z.array(z.array(KeyboardActionCellSchema)).min(MATRIX_ROWS))
      .min(1, 'keyboardAction debe contener al menos la capa 0'),
    deadBand: z
      .object({
        top: z.number().finite().min(0).max(4),
        bottom: z.number().finite().min(0).max(4),
      })
      .passthrough(),
  })
  .passthrough();

const DataEnvelopeSchema = z
  .object({
    name: z.string().min(1),
    id: z.number().optional(),
    data: InnerConfigDataSchema,
  })
  .passthrough();

export interface ParsedMadKeyboardConfig extends KeyboardProfile {
  readonly source: 'imported-file';
  readonly importedAt: number;
  readonly importedFileName: string;
  readonly protocolVersion: string;
  readonly deadBand: DeadBandConfig;
  readonly keyLabels: readonly string[];
  readonly summary: {
    readonly profileName: string;
    readonly protocolVersion: string;
    readonly keysCount: number;
    readonly deadBandTopRaw: number;
    readonly deadBandBottomRaw: number;
    readonly description: string;
  };
}

function decodeAsciiByteArrayText(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw new Error('El archivo .mad-keyboard-config esta vacio.');
  }

  const tokens = trimmed.split(',');
  if (tokens.length < 16) {
    throw new Error('Formato .mad-keyboard-config invalido: contenido ASCII insuficiente.');
  }

  const bytes = new Uint8Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!.trim();
    if (!/^\d{1,3}$/.test(token)) {
      throw new Error(
        `Formato .mad-keyboard-config invalido: token no numerico en posicion ${i} ("${token.slice(0, 16)}"). Se esperaban bytes ASCII separados por coma.`
      );
    }
    const byteVal = Number.parseInt(token, 10);
    if (byteVal < 0 || byteVal > 255) {
      throw new Error(`Formato .mad-keyboard-config invalido: valor de byte fuera de rango (${byteVal}) en posicion ${i}.`);
    }
    bytes[i] = byteVal;
  }

  return Buffer.from(bytes).toString('utf-8').trim();
}

function decodeBase64ToJson(base64Text: string, label: string): unknown {
  const cleaned = base64Text.replace(/\s+/g, '');
  if (cleaned.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new Error(`Base64 invalido en ${label}.`);
  }

  let utf8: string;
  try {
    utf8 = Buffer.from(cleaned, 'base64').toString('utf-8');
  } catch {
    throw new Error(`No se pudo decodificar Base64 en ${label}.`);
  }

  try {
    return JSON.parse(utf8) as unknown;
  } catch {
    throw new Error(`Contenido JSON invalido tras decodificar ${label}.`);
  }
}

function formatZodIssues(issues: readonly z.ZodIssue[]): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`)
    .join('; ');
}

function toCentihundredthsMm(mm: number): number {
  return Math.round(mm * 100);
}

/**
 * Parsea y valida un archivo .mad-keyboard-config exportado desde el driver web oficial del MAD60HE.
 * No realiza ninguna comunicacion con el hardware.
 */
export function parseMadKeyboardConfigContent(
  rawContent: string,
  fileName: string = 'config.mad-keyboard-config'
): ParsedMadKeyboardConfig {
  if (Buffer.byteLength(rawContent, 'utf-8') > MAX_CONFIG_FILE_BYTES) {
    throw new Error(`El archivo excede el tamano maximo permitido (${MAX_CONFIG_FILE_BYTES / (1024 * 1024)} MB).`);
  }

  const outerBase64 = decodeAsciiByteArrayText(rawContent);
  const outerRaw = decodeBase64ToJson(outerBase64, 'el bloque principal');

  const outerParsed = OuterExportSchema.safeParse(outerRaw);
  if (!outerParsed.success) {
    throw new Error(`Estructura principal invalida: ${formatZodIssues(outerParsed.error.issues)}`);
  }

  const componentDecoded = decodeBase64ToJson(outerParsed.data.component, 'el campo component');
  if (componentDecoded !== EXPECTED_COMPONENT_ID) {
    throw new Error(
      `Archivo incompatible: el componente es "${String(componentDecoded)}", se esperaba "${EXPECTED_COMPONENT_ID}".`
    );
  }

  const exportedProfileNameRaw = decodeBase64ToJson(outerParsed.data.name, 'el campo name');
  const exportedProfileName =
    typeof exportedProfileNameRaw === 'string' && exportedProfileNameRaw.trim().length > 0
      ? exportedProfileNameRaw.trim()
      : 'Perfil Web Importado';

  const envelopeRaw = decodeBase64ToJson(outerParsed.data.data, 'el campo data');
  const envelopeParsed = DataEnvelopeSchema.safeParse(envelopeRaw);
  if (!envelopeParsed.success) {
    throw new Error(`Estructura interna de configuracion invalida: ${formatZodIssues(envelopeParsed.error.issues)}`);
  }

  const inner = envelopeParsed.data.data;
  const protocolVersion = inner.protocolVersion.version.trim();

  if (!SUPPORTED_PROTOCOL_VERSION_REGEX.test(protocolVersion)) {
    throw new Error(
      `Version de protocolo incompatible: "${protocolVersion}". Este importador admite unicamente version 1.xx (por ejemplo 1.06).`
    );
  }

  const keys: KeyConfig[] = Array.from({ length: TOTAL_USEFUL_KEYS }, () => ({ ...DEFAULT_KEY_CONFIG }));
  const seenTogThs = new Set<number>();
  const seenRtKeys = new Set<number>();

  // Procesar filas 0..4 (ignorar fila 5 con entradas extra en cero)
  for (let r = 0; r < MATRIX_ROWS; r++) {
    const togRow = inner.togThs[r];
    if (!togRow || togRow.length < MATRIX_COLS) {
      throw new Error(`togThs fila ${r} incompleta: se requieren ${MATRIX_COLS} columnas.`);
    }

    const rtRow = inner.rtKeys[r];
    if (!rtRow || rtRow.length < MATRIX_COLS) {
      throw new Error(`rtKeys fila ${r} incompleta: se requieren ${MATRIX_COLS} columnas.`);
    }

    const layer0Row = inner.keyboardAction[0]?.[r];
    if (!layer0Row || layer0Row.length < MATRIX_COLS) {
      throw new Error(`keyboardAction capa 0 fila ${r} incompleta: se requieren ${MATRIX_COLS} columnas.`);
    }

    for (let c = 0; c < MATRIX_COLS; c++) {
      const togEntry = togRow[c]!;
      const rtEntry = rtRow[c]!;

      // Ignorar explicitamente entradas cuyo row declarado sea >= 5
      if (togEntry.row >= MATRIX_ROWS || rtEntry.row >= MATRIX_ROWS) {
        continue;
      }
      if (togEntry.col >= MATRIX_COLS || rtEntry.col >= MATRIX_COLS) {
        throw new Error(`Columna fuera de rango en matriz 5x14: tog=(${togEntry.row},${togEntry.col}), rt=(${rtEntry.row},${rtEntry.col}).`);
      }

      const togIdx = togEntry.row * MATRIX_COLS + togEntry.col;
      const rtIdx = rtEntry.row * MATRIX_COLS + rtEntry.col;
      if (togIdx !== rtIdx) {
        throw new Error(`Desalineacion entre togThs (idx ${togIdx}) y rtKeys (idx ${rtIdx}) en fila ${r}, columna ${c}.`);
      }

      const actuationRaw = toCentihundredthsMm(togEntry.apc);
      if (actuationRaw < ACTUATION_MIN_RAW || actuationRaw > ACTUATION_MAX_RAW) {
        throw new Error(
          `Recorrido de actuacion fuera de limites del hardware (${ACTUATION_MIN_RAW}-${ACTUATION_MAX_RAW} cs mm) en fila ${togEntry.row}, col ${togEntry.col} (idx ${togIdx}): ${actuationRaw} cs mm (${togEntry.apc} mm).`
        );
      }

      // En el JSON .mad-keyboard-config del fabricante los nombres estan invertidos respecto al firmware y la UI web:
      // JSON "release" -> sensibilidad al pulsar (rtPressRaw); JSON "press" -> sensibilidad al soltar (rtReleaseRaw).
      const rtPressRaw = toCentihundredthsMm(rtEntry.release);
      if (rtPressRaw < RT_MIN_RAW || rtPressRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al pulsar (campo JSON release) fuera de limites del hardware (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en fila ${rtEntry.row}, col ${rtEntry.col} (idx ${rtIdx}): ${rtPressRaw} cs mm (${rtEntry.release} mm).`
        );
      }

      const rtReleaseRaw = toCentihundredthsMm(rtEntry.press);
      if (rtReleaseRaw < RT_MIN_RAW || rtReleaseRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al soltar (campo JSON press) fuera de limites del hardware (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en fila ${rtEntry.row}, col ${rtEntry.col} (idx ${rtIdx}): ${rtReleaseRaw} cs mm (${rtEntry.press} mm).`
        );
      }

      keys[togIdx] = {
        actuationRaw,
        rtEnabled: rtEntry.on,
        rtPressRaw,
        rtReleaseRaw,
      };
      seenTogThs.add(togIdx);
      seenRtKeys.add(rtIdx);
    }
  }

  if (seenTogThs.size !== TOTAL_USEFUL_KEYS || seenRtKeys.size !== TOTAL_USEFUL_KEYS) {
    throw new Error(
      `Matriz incompleta: se esperaban ${TOTAL_USEFUL_KEYS} teclas en filas 0..4 (recibido togThs=${seenTogThs.size}, rtKeys=${seenRtKeys.size}).`
    );
  }

  const keyLabels = extractLayer0Labels(inner.keyboardAction[0]!);
  const deadBand: DeadBandConfig = {
    topRaw: toCentihundredthsMm(inner.deadBand.top),
    bottomRaw: toCentihundredthsMm(inner.deadBand.bottom),
  };
  const importedAt = Date.now();

  return {
    version: '1.0.0',
    name: exportedProfileName,
    updatedAt: importedAt,
    source: 'imported-file',
    importedAt,
    importedFileName: fileName,
    protocolVersion,
    deadBand,
    keyLabels,
    keys,
    summary: {
      profileName: exportedProfileName,
      protocolVersion,
      keysCount: TOTAL_USEFUL_KEYS,
      deadBandTopRaw: deadBand.topRaw,
      deadBandBottomRaw: deadBand.bottomRaw,
      description: `Configuracion "${exportedProfileName}" (v${protocolVersion}, ${TOTAL_USEFUL_KEYS} teclas, deadband ${deadBand.topRaw}/${deadBand.bottomRaw} cs mm)`,
    },
  };
}

/**
 * Lee desde disco y valida un archivo .mad-keyboard-config.
 */
export function importMadKeyboardConfigFile(filePath: string): ParsedMadKeyboardConfig {
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    throw new Error('La ruta seleccionada no corresponde a un archivo valido.');
  }
  if (stats.size > MAX_CONFIG_FILE_BYTES) {
    throw new Error(
      `El archivo "${basename(filePath)}" supera el tamano maximo permitido (${MAX_CONFIG_FILE_BYTES / (1024 * 1024)} MB).`
    );
  }

  const rawContent = readFileSync(filePath, 'utf-8');
  return parseMadKeyboardConfigContent(rawContent, basename(filePath));
}
