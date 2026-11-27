import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importProfileFromCapture } from './storage.js';
import { encodeTable13, encodeTable14, decodeTable14Chunk } from './codec.js';

interface RawCaptureEntry {
  type: string;
  data: number[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

export function runTests(): boolean {
  console.log('=== Iniciando Pruebas de Codificacion/Decodificacion MAD60HE ===');
  const capturePath = resolve(FIXTURES_DIR, 'mad60he_actuacion_a_de_010_a_150.json');
  const rawPackets = JSON.parse(readFileSync(capturePath, 'utf-8')) as RawCaptureEntry[];

  // 1. Reconstruir perfil desde captura original de actuacion de tecla A
  console.log('[Test] Cargando fixture original: mad60he_actuacion_a_de_010_a_150.json...');
  const profile = importProfileFromCapture(capturePath);
  console.log(`[Test] Perfil importado con exito. Total de teclas: ${profile.keys.length}`);

  // Comprobar teclas conocidas
  console.log(`[Test] Tecla W (idx 16) Actuacion: ${profile.keys[16]?.actuationRaw} (esperado: 10)`);
  console.log(`[Test] Tecla A (idx 29) Actuacion: ${profile.keys[29]?.actuationRaw} (esperado: 150)`);
  console.log(`[Test] Tecla A (idx 29) RT: [${profile.keys[29]?.rtEnabled}, ${profile.keys[29]?.rtPressRaw}, ${profile.keys[29]?.rtReleaseRaw}] (esperado: [1, 30, 30])`);

  if (profile.keys[16]?.actuationRaw !== 10 || profile.keys[29]?.actuationRaw !== 150) {
    throw new Error('Fallo en decodificacion de Tabla 13');
  }
  if (profile.keys[29]?.rtEnabled !== 1 || profile.keys[29]?.rtPressRaw !== 30 || profile.keys[29]?.rtReleaseRaw !== 30) {
    throw new Error('Fallo en decodificacion de Tabla 14');
  }

  // 2. Extraer de la captura el ultimo lote enviado de Tabla 13 y Tabla 14
  const t13Sends = rawPackets.filter((p) => p.type === 'sendReport' && p.data[0] === 3 && p.data[1] === 150 && p.data[2] === 13);
  const lastT13Batch = t13Sends.slice(-7); // Son 7 trozos
  if (lastT13Batch.length !== 7) {
    throw new Error(`Se esperaban 7 trozos en el ultimo lote de Tabla 13, pero hay ${lastT13Batch.length}`);
  }

  const t14Sends = rawPackets.filter((p) => p.type === 'sendReport' && p.data[0] === 3 && p.data[1] === 150 && p.data[2] === 14);
  const lastT14Batch = t14Sends.slice(-18); // Son 18 trozos
  if (lastT14Batch.length !== 18) {
    throw new Error(`Se esperaban 18 trozos en el ultimo lote de Tabla 14, pero hay ${lastT14Batch.length}`);
  }

  // 3. Volver a codificar desde el perfil reconstruido
  const reEncodedT13 = encodeTable13(profile);
  const reEncodedT14 = encodeTable14(profile);

  // 4. Comparar byte por byte con el lote original capturado
  console.log('[Test] mad60he_actuacion_a_de_010_a_150.json: Comparando Tabla 13 generada byte a byte contra captura...');
  for (let c = 0; c < 7; c++) {
    const originalChunk = lastT13Batch[c]!.data;
    const generatedChunk = reEncodedT13[c]!.bytes;

    for (let b = 0; b < 32; b++) {
      if (originalChunk[b] !== generatedChunk[b]) {
        throw new Error(`Discrepancia en Tabla 13 Trozo ${c} Byte ${b}: original ${originalChunk[b]} vs generado ${generatedChunk[b]}`);
      }
    }
  }
  console.log('  -> Tabla 13: 7 de 7 trozos identicos byte a byte (actuacion tecla A de 0.10 a 1.50 mm cubierta).');

  console.log('[Test] mad60he_actuacion_a_de_010_a_150.json: Comparando Tabla 14 generada byte a byte contra captura...');
  for (let c = 0; c < 18; c++) {
    const originalChunk = lastT14Batch[c]!.data;
    const generatedChunk = reEncodedT14[c]!.bytes;

    for (let b = 0; b < 32; b++) {
      if (originalChunk[b] !== generatedChunk[b]) {
        throw new Error(`Discrepancia en Tabla 14 Trozo ${c} Byte ${b}: original ${originalChunk[b]} vs generado ${generatedChunk[b]}`);
      }
    }
  }
  console.log('  -> Tabla 14: 18 de 18 trozos identicos byte a byte.');

  // 5. Verificar limites extremos 10 a 400 (0.10 a 4.00 mm) y 2 a 400 (0.02 a 4.00 mm)
  console.log('[Test] Probando validacion de limites extremos (10 a 400 cs mm)...');
  const extremeKeys = profile.keys.map((k, i) => ({
    ...k,
    actuationRaw: i % 2 === 0 ? 10 : 400,
    rtEnabled: 1 as const,
    rtPressRaw: i % 2 === 0 ? 2 : 400,
    rtReleaseRaw: i % 2 === 0 ? 2 : 400,
  }));

  const reEncodedExtremeT13 = encodeTable13({ ...profile, keys: extremeKeys });
  const reEncodedExtremeT14 = encodeTable14({ ...profile, keys: extremeKeys });
  if (reEncodedExtremeT13.length !== 7 || reEncodedExtremeT14.length !== 18) {
    throw new Error('Fallo al codificar limites extremos');
  }

  // Comprobar que 400 en big-endian es [0x01, 0x90]
  if (reEncodedExtremeT13[0]!.bytes[11] !== 0x01 || reEncodedExtremeT13[0]!.bytes[12] !== 0x90) {
    throw new Error('Codificacion incorrecta de 400 en big-endian');
  }
  console.log('  -> Limites 10 y 400 cs mm codificados y verificados correctamente.');

  // 5b. Test explicito del supuesto actual [on, press, release] en Tabla 14 con valores asimetricos.
  // NOTA: El archivo .mad-keyboard-config y el JS del fabricante usan [on, release, press];
  // se conserva [on, press, release] intencionalmente hasta validarlo en hardware real.
  console.log('[Test] Verificando supuesto actual [on, press, release] en Tabla 14 con valores asimetricos (press=51, release=10)...');
  const asymmetricKeys = profile.keys.map((k, idx) =>
    idx === 29
      ? { ...k, rtEnabled: 1, rtPressRaw: 51, rtReleaseRaw: 10 }
      : { ...k }
  );
  const asymT14 = encodeTable14({ ...profile, keys: asymmetricKeys });
  // Tecla 29 esta en trozo 7 (start=28, count=4), posicion local k=1 -> base = 9 + 1 * 5 = 14
  const chunkWithKey29 = asymT14[7]!.bytes;
  if (
    chunkWithKey29[14] !== 1 ||
    chunkWithKey29[15] !== 0x00 ||
    chunkWithKey29[16] !== 51 || // bytes 1..2 del registro: press (supuesto actual)
    chunkWithKey29[17] !== 0x00 ||
    chunkWithKey29[18] !== 10    // bytes 3..4 del registro: release (supuesto actual)
  ) {
    throw new Error(
      `Discrepancia en orden actual [on, press, release] para tecla 29: [${chunkWithKey29.slice(14, 19).join(', ')}]`
    );
  }
  const decodedAsym = [...profile.keys];
  decodeTable14Chunk(chunkWithKey29, decodedAsym);
  if (decodedAsym[29]!.rtPressRaw !== 51 || decodedAsym[29]!.rtReleaseRaw !== 10) {
    throw new Error(`Round-trip asimetrico incorrecto en Tabla 14: ${JSON.stringify(decodedAsym[29])}`);
  }
  console.log('  -> Supuesto actual verificado explicitamente: bytes [1, 0, 51, 0, 10] corresponden a [on, press, release].');

  // 6. Verificar resumen de importacion correcta
  console.log('[Test] Verificando resumen de importador en captura completa...');
  if (!profile.summary || !profile.summary.table13Found || profile.summary.table13KeysCount !== 70) {
    throw new Error('Resumen de Tabla 13 incorrecto en captura completa');
  }
  if (!profile.summary.table14Found || profile.summary.table14KeysCount !== 70) {
    throw new Error('Resumen de Tabla 14 incorrecto en captura completa');
  }
  console.log(`  -> Resumen verificado: ${profile.summary.description}`);

  // 7. Probar rechazo estricto de captura sin tablas desde fixture
  console.log('[Test] Probando rechazo de fixture sin tablas: mad60he_sin_tablas.json...');
  const sinTablasPath = resolve(FIXTURES_DIR, 'mad60he_sin_tablas.json');
  let threwSinTablas = false;
  try {
    importProfileFromCapture(sinTablasPath);
  } catch (err: unknown) {
    threwSinTablas = true;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Captura rechazada') || !msg.includes('Tabla 13: no') || !msg.includes('Tabla 14: no')) {
      throw new Error(`Mensaje de error inesperado en mad60he_sin_tablas: ${msg}`);
    }
    console.log(`  -> Rechazo correcto con mensaje: "${msg}"`);
  }
  if (!threwSinTablas) {
    throw new Error('Se esperaba rechazo para mad60he_sin_tablas.json pero no lanzo error');
  }

  console.log('=== Todas las pruebas de codec MAD60HE completadas con exito ===\n');
  return true;
}

if (process.argv[1]?.includes('test-codec')) {
  try {
    runTests();
  } catch (error) {
    console.error('Error en pruebas de codec:', error);
    process.exit(1);
  }
}
