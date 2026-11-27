import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMadKeyboardConfigContent, importMadKeyboardConfigFile } from './config-import.js';
import { DEFAULT_MAD60HE_KEY_LABELS } from './keymap.js';
import { MATRIX_COLS, MATRIX_ROWS, TOTAL_USEFUL_KEYS } from './profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

function encodeExportPayload(outer: Record<string, unknown>): string {
  const jsonStr = JSON.stringify(outer);
  const b64 = Buffer.from(jsonStr, 'utf-8').toString('base64');
  return Array.from(Buffer.from(b64, 'utf-8')).join(',');
}

function buildLayer0ActionMatrix(): Array<Array<{ keyClass: number; keyId: number }>> {
  // Mapeo ANSI 60% estandar acorde a keyboardAction capa 0 del MAD60HE
  const keyIdsByRow: number[][] = [
    [41, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46, 42],
    [43, 20, 26, 8, 21, 23, 28, 24, 12, 18, 19, 47, 48, 49],
    [57, 4, 22, 7, 9, 10, 11, 13, 14, 15, 51, 52, 0, 40],
    [225, 0, 29, 27, 6, 25, 5, 17, 16, 54, 55, 56, 0, 229],
    [224, 227, 226, 0, 0, 0, 44, 0, 0, 0, 230, 101, 228, 33],
  ];

  return keyIdsByRow.map((rowIds, r) =>
    rowIds.map((keyId, c) => ({
      keyClass: r === 4 && c === 13 ? 82 : 0,
      keyId,
    }))
  );
}

interface SyntheticConfigOverrides {
  name?: string;
  component?: string;
  protocolVersion?: string;
  deadBand?: { top: number; bottom: number };
  patchTog?: Array<{ row: number; col: number; apc: number }>;
  patchRt?: Array<{ row: number; col: number; on: 0 | 1; release: number; press: number }>;
}

export function buildSyntheticMadKeyboardConfigText(overrides: SyntheticConfigOverrides = {}): string {
  const togThs: Array<Array<{ row: number; col: number; apc: number }>> = [];
  const rtKeys: Array<Array<{ row: number; col: number; on: 0 | 1; release: number; press: number }>> = [];

  for (let r = 0; r < MATRIX_ROWS; r++) {
    const togRow: Array<{ row: number; col: number; apc: number }> = [];
    const rtRow: Array<{ row: number; col: number; on: 0 | 1; release: number; press: number }> = [];
    for (let c = 0; c < MATRIX_COLS; c++) {
      togRow.push({ row: r, col: c, apc: 1.5 });
      rtRow.push({ row: r, col: c, on: 0, release: 0.5, press: 0.5 });
    }
    togThs.push(togRow);
    rtKeys.push(rtRow);
  }

  // Fila 5 extra con ceros (debe ser ignorada por el parser)
  togThs.push([
    { row: 5, col: 0, apc: 0 },
    { row: 5, col: 1, apc: 0 },
  ]);
  rtKeys.push([
    { row: 5, col: 0, on: 0, release: 0, press: 0 },
    { row: 5, col: 1, on: 0, release: 0, press: 0 },
  ]);

  for (const patch of overrides.patchTog ?? []) {
    togThs[patch.row]![patch.col] = { ...patch };
  }
  for (const patch of overrides.patchRt ?? []) {
    rtKeys[patch.row]![patch.col] = { ...patch };
  }

  const envelope = {
    name: overrides.name ?? 'synthetic-profile',
    id: 1,
    data: {
      protocolVersion: { version: overrides.protocolVersion ?? '1.06' },
      deadBand: overrides.deadBand ?? { top: 0.16, bottom: 0.16 },
      togThs,
      rtKeys,
      keyboardAction: [buildLayer0ActionMatrix()],
    },
  };

  return encodeExportPayload({
    name: Buffer.from(JSON.stringify(overrides.name ?? 'synthetic-profile'), 'utf-8').toString('base64'),
    data: Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64'),
    component: Buffer.from(JSON.stringify(overrides.component ?? 'duck-bread-keyboard'), 'utf-8').toString('base64'),
  });
}

function assertThrowsWithMessage(fn: () => unknown, expectedSubstring: string, testLabel: string): void {
  let threw = false;
  try {
    fn();
  } catch (err: unknown) {
    threw = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes(expectedSubstring)) {
      throw new Error(`[${testLabel}] Error inesperado "${msg}", se esperaba fragmento "${expectedSubstring}"`);
    }
  }
  if (!threw) {
    throw new Error(`[${testLabel}] Debio lanzar error conteniendo "${expectedSubstring}" pero no fallo.`);
  }
}

export function runConfigImportTests(): boolean {
  console.log('=== Iniciando Pruebas de Importador .mad-keyboard-config ===');

  // 1. Parseo completo del fixture sintetico en repo
  const fixturePath = resolve(FIXTURES_DIR, 'mad60he_config_sintetico.mad-keyboard-config');
  const parsed = importMadKeyboardConfigFile(fixturePath);

  if (parsed.keys.length !== TOTAL_USEFUL_KEYS) {
    throw new Error(`Se esperaban ${TOTAL_USEFUL_KEYS} teclas, obtenido ${parsed.keys.length}`);
  }
  if (parsed.source !== 'imported-file') {
    throw new Error(`Origen esperado 'imported-file', obtenido '${parsed.source}'`);
  }
  if (parsed.protocolVersion !== '1.06') {
    throw new Error(`protocolVersion esperado '1.06', obtenido '${parsed.protocolVersion}'`);
  }
  if (parsed.deadBand.topRaw !== 16 || parsed.deadBand.bottomRaw !== 16) {
    throw new Error(`deadBand esperado 16/16, obtenido ${parsed.deadBand.topRaw}/${parsed.deadBand.bottomRaw}`);
  }

  // Verificar valores especificos (incluyendo asimetria release vs press en tecla A, idx 29)
  const keyW = parsed.keys[16]!;
  const keyA = parsed.keys[29]!;
  const keyEnter = parsed.keys[41]!;
  if (keyW.actuationRaw !== 10) {
    throw new Error(`Tecla W (idx 16) actuacion esperada 10, obtenida ${keyW.actuationRaw}`);
  }
  if (keyA.actuationRaw !== 200 || keyA.rtEnabled !== 1 || keyA.rtReleaseRaw !== 10 || keyA.rtPressRaw !== 51) {
    throw new Error(`Tecla A (idx 29) inesperada: ${JSON.stringify(keyA)}`);
  }
  if (keyEnter.actuationRaw !== 400) {
    throw new Error(`Tecla Enter (idx 41) actuacion esperada 400, obtenida ${keyEnter.actuationRaw}`);
  }

  // Verificar etiquetas de keyboardAction capa 0
  if (parsed.keyLabels[40] !== 'Sin usar' || parsed.keyLabels[41] !== 'Enter') {
    throw new Error(`Etiquetas fila 2 incorrectas: 40='${parsed.keyLabels[40]}', 41='${parsed.keyLabels[41]}'`);
  }
  if (parsed.keyLabels[43] !== 'Sin usar' || parsed.keyLabels[54] !== 'Sin usar') {
    throw new Error(`Etiquetas fila 3 incorrectas: 43='${parsed.keyLabels[43]}', 54='${parsed.keyLabels[54]}'`);
  }
  if (parsed.keyLabels[69] !== 'Fn') {
    throw new Error(`Tecla 69 esperada 'Fn', obtenida '${parsed.keyLabels[69]}'`);
  }
  for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
    if (parsed.keyLabels[i] !== DEFAULT_MAD60HE_KEY_LABELS[i]) {
      throw new Error(`Etiqueta idx ${i}: '${parsed.keyLabels[i]}' difiere de '${DEFAULT_MAD60HE_KEY_LABELS[i]}'`);
    }
  }
  console.log('[Test] Fixture sintetico parseado: 70 teclas, fila 5 ignorada, deadBand 16/16, etiquetas capa 0 validadas.');

  // 2. Redondeo correcto con imprecision flotante IEEE-754 (ej: 0.29, 0.57, 0.14)
  const floatText = buildSyntheticMadKeyboardConfigText({
    patchTog: [{ row: 2, col: 1, apc: 0.29 }],
    patchRt: [{ row: 2, col: 1, on: 1, release: 0.14, press: 0.57 }],
  });
  const floatParsed = parseMadKeyboardConfigContent(floatText);
  if (
    floatParsed.keys[29]!.actuationRaw !== 29 ||
    floatParsed.keys[29]!.rtReleaseRaw !== 14 ||
    floatParsed.keys[29]!.rtPressRaw !== 57
  ) {
    throw new Error(`Error de redondeo IEEE-754: ${JSON.stringify(floatParsed.keys[29])}`);
  }
  console.log('[Test] Redondeo mm -> centesimas de mm verificado (0.29 -> 29, 0.14 -> 14, 0.57 -> 57).');

  // 3. Errores claros ante formato invalido
  assertThrowsWithMessage(() => parseMadKeyboardConfigContent(''), 'vacio', 'Archivo vacio');
  assertThrowsWithMessage(
    () => parseMadKeyboardConfigContent('not,valid,ascii,tokens,1,2,3,4,5,6,7,8,9,10,11,12'),
    'token no numerico',
    'ASCII no numerico'
  );
  assertThrowsWithMessage(
    () => parseMadKeyboardConfigContent(encodeExportPayload({ name: 'a', data: 'b', component: Buffer.from('"duck-bread-mouse"').toString('base64') })),
    'Archivo incompatible',
    'Componente incorrecto'
  );
  console.log('[Test] Rechazos ante archivo vacio, tokens invalidos y componente incompatible verificados.');

  // 4. Error claro ante protocolVersion incompatible
  assertThrowsWithMessage(
    () => parseMadKeyboardConfigContent(buildSyntheticMadKeyboardConfigText({ protocolVersion: '2.00' })),
    'Version de protocolo incompatible',
    'protocolVersion 2.00'
  );
  console.log('[Test] Rechazo ante protocolVersion incompatible (2.00) verificado.');

  // 5. Limites de hardware (apc 10-400 cs mm, rt press/release 2-400 cs mm)
  assertThrowsWithMessage(
    () => parseMadKeyboardConfigContent(buildSyntheticMadKeyboardConfigText({ patchTog: [{ row: 0, col: 0, apc: 0.09 }] })),
    'Recorrido de actuacion fuera de limites',
    'apc < 0.10'
  );
  assertThrowsWithMessage(
    () => parseMadKeyboardConfigContent(buildSyntheticMadKeyboardConfigText({ patchTog: [{ row: 0, col: 0, apc: 4.01 }] })),
    'Recorrido de actuacion fuera de limites',
    'apc > 4.00'
  );
  assertThrowsWithMessage(
    () =>
      parseMadKeyboardConfigContent(
        buildSyntheticMadKeyboardConfigText({ patchRt: [{ row: 0, col: 0, on: 1, release: 0.01, press: 0.5 }] })
      ),
    'Sensibilidad al soltar (release) fuera de limites',
    'rt release < 0.02'
  );
  assertThrowsWithMessage(
    () =>
      parseMadKeyboardConfigContent(
        buildSyntheticMadKeyboardConfigText({ patchRt: [{ row: 0, col: 0, on: 1, release: 0.5, press: 4.05 }] })
      ),
    'Sensibilidad al pulsar (press) fuera de limites',
    'rt press > 4.00'
  );
  console.log('[Test] Validacion de limites del hardware (actuacion 10-400, RT 2-400) verificada.');

  // Confirmar que leer fixture raw tampoco deja errores de lectura directa
  const rawFixture = readFileSync(fixturePath, 'utf-8');
  if (rawFixture.length === 0) {
    throw new Error('Fixture sintetico vacio');
  }

  console.log('=== Todas las pruebas de importador .mad-keyboard-config completadas con exito ===\n');
  return true;
}

if (process.argv[1]?.includes('test-config-import')) {
  try {
    runConfigImportTests();
  } catch (error) {
    console.error('Error en pruebas de importador:', error);
    process.exit(1);
  }
}
