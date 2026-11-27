import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMad60HeProfile } from './reader.js';
import { HeaderMismatchError, type HidDeviceTransport } from './transmitter.js';
import { TOTAL_USEFUL_KEYS } from './profile.js';
import { DEFAULT_MAD60HE_KEY_LABELS } from './keymap.js';

interface CaptureEntry {
  readonly t: number;
  readonly type: 'sendReport' | 'inputReport';
  readonly id: number;
  readonly data: number[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

/**
 * Transporte simulado que reproduce respuestas reales desde una captura y permite inyectar ruido o fallos.
 */
class ReplayReaderTransport implements HidDeviceTransport {
  private listeners: Array<(data: Uint8Array | number[] | Buffer) => void> = [];
  private pairs: Array<{ request: number[]; response: number[] }>;
  public writtenPackets: number[][] = [];
  public featureReportsSent: number[][] = [];
  public injectNoiseBeforeResponse: number[][] = [];
  public mismatchOnRequestIndex: number | null = null;
  public mismatchAlways: boolean = false;
  public silenceAlways: boolean = false;
  private requestCountForIndex = new Map<number, number>();

  constructor(entries: readonly CaptureEntry[]) {
    this.pairs = [];
    for (let i = 0; i < entries.length - 1; i++) {
      const cur = entries[i]!;
      const next = entries[i + 1]!;
      if (cur.type === 'sendReport' && next.type === 'inputReport') {
        this.pairs.push({ request: cur.data, response: next.data });
      }
    }
  }

  public write(data: Uint8Array | readonly number[] | Buffer): number {
    const raw = Array.from(data);
    this.writtenPackets.push(raw);

    if (raw.length !== 33 || raw[0] !== 0) {
      throw new Error(`Enmarcado incorrecto en lectura: se esperaban 33 bytes con 0 inicial, recibido ${raw.length}`);
    }

    const req = raw.slice(1);
    const reqIdx = this.writtenPackets.length - 1;
    const seen = (this.requestCountForIndex.get(reqIdx) ?? 0) + 1;
    this.requestCountForIndex.set(reqIdx, seen);

    if (this.silenceAlways) {
      return raw.length;
    }

    if (this.mismatchAlways) {
      const wrong = new Array<number>(32).fill(0);
      wrong[0] = 2;
      wrong[1] = 150;
      wrong[2] = 99;
      setTimeout(() => this.emit(wrong), 2);
      return raw.length;
    }

    if (this.mismatchOnRequestIndex !== null && this.writtenPackets.length === this.mismatchOnRequestIndex + 1) {
      // Simular interferencia puntual: cabecera incorrecta una vez, la siguiente llamada ya responde bien
      const wrong = new Array<number>(32).fill(0);
      wrong[0] = 2;
      wrong[1] = 150;
      wrong[2] = 99;
      setTimeout(() => this.emit(wrong), 2);
      return raw.length;
    }

    // Buscar par coincidente en la captura
    const match = this.pairs.find((p) => {
      if (req[0] === 18) {
        return p.request[0] === 18 && p.request[1] === req[1] && p.request[2] === req[2] && p.request[3] === req[3];
      }
      if (req[0] === 2 && req[1] === 150 && (req[2] === 13 || req[2] === 14)) {
        return (
          p.request[0] === 2 &&
          p.request[1] === 150 &&
          p.request[2] === req[2] &&
          p.request[6] === req[6] &&
          p.request[7] === req[7]
        );
      }
      return p.request[0] === req[0] && p.request[1] === req[1] && p.request[2] === req[2];
    });

    if (!match) {
      throw new Error(`No hay respuesta en captura para peticion [${req.slice(0, 8).join(', ')}]`);
    }

    setTimeout(() => {
      for (const noise of this.injectNoiseBeforeResponse) {
        this.emit(noise);
      }
      this.emit(match.response);
    }, 1);

    return raw.length;
  }

  public sendFeatureReport(data: Uint8Array | readonly number[] | Buffer): number {
    this.featureReportsSent.push(Array.from(data));
    return data.length;
  }

  public on(event: 'data', listener: (data: Uint8Array | number[] | Buffer) => void): this {
    if (event === 'data') {
      this.listeners.push(listener);
    }
    return this;
  }

  public removeListener(event: 'data', listener: (data: Uint8Array | number[] | Buffer) => void): this {
    if (event === 'data') {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
    return this;
  }

  private emit(bytes: readonly number[]): void {
    const buf = Buffer.from(bytes);
    for (const listener of [...this.listeners]) {
      listener(buf);
    }
  }
}

export async function runReaderTests(): Promise<boolean> {
  console.log('=== Iniciando Pruebas de Lector en Vivo MAD60HE ===');
  const fixturePath = resolve(FIXTURES_DIR, 'mad60he_lectura_en_vivo.json');
  const captureEntries = JSON.parse(readFileSync(fixturePath, 'utf-8')) as CaptureEntry[];

  // 1. Lectura completa desde captura real + verificacion de ignorar ruido/pulsaciones de otras interfaces
  {
    const mock = new ReplayReaderTransport(captureEntries);
    // Inyectar reporte de 8 bytes (pulsacion normal) y keepalive [3,0,...] antes de cada respuesta valida
    mock.injectNoiseBeforeResponse = [
      [0, 0, 4, 0, 0, 0, 0, 0],
      [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 74, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ];

    const profile = await readMad60HeProfile(mock, { timeoutMs: 200, maxRetriesOnMismatch: 1 });

    // Total peticiones: 1 version + 1 deadBand + 6 tabla 13 + 18 tabla 14 + 20 keymap = 46 en serie
    if (mock.writtenPackets.length !== 46) {
      throw new Error(`Se esperaban 46 peticiones serie, enviadas ${mock.writtenPackets.length}`);
    }
    if (mock.featureReportsSent.length !== 0) {
      throw new Error('El lector no debe llamar a sendFeatureReport');
    }
    if (profile.source !== 'keyboard' || typeof profile.readAt !== 'number') {
      throw new Error(`Metadatos de origen invalidos: source=${profile.source}, readAt=${profile.readAt}`);
    }
    if (profile.protocolVersion !== '1.06') {
      throw new Error(`Version esperada '1.06', obtenida '${profile.protocolVersion}'`);
    }
    if (profile.deadBand.topRaw !== 16 || profile.deadBand.bottomRaw !== 16) {
      throw new Error(`Zona muerta esperada 16/16, obtenida ${JSON.stringify(profile.deadBand)}`);
    }
    if (profile.keys.length !== TOTAL_USEFUL_KEYS) {
      throw new Error(`Se esperaban ${TOTAL_USEFUL_KEYS} teclas utiles, obtenidas ${profile.keys.length}`);
    }
    if (profile.keymapLayers.length !== 4 || profile.keymapLayers[0]!.length !== 5) {
      throw new Error('Estructura de keymap 4x5 incompleta');
    }

    // Verificar tecla A (indice 29): recorrido 150, on 0, press 11, release 50
    const keyA = profile.keys[29]!;
    if (keyA.actuationRaw !== 150 || keyA.rtEnabled !== 0 || keyA.rtPressRaw !== 11 || keyA.rtReleaseRaw !== 50) {
      throw new Error(`Tecla A (idx 29) inesperada: ${JSON.stringify(keyA)}`);
    }

    // Verificar etiquetas extraidas de keymap capa 0
    for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
      if (profile.keyLabels[i] !== DEFAULT_MAD60HE_KEY_LABELS[i]) {
        throw new Error(`Etiqueta capa 0 idx ${i}: '${profile.keyLabels[i]}' vs '${DEFAULT_MAD60HE_KEY_LABELS[i]}'`);
      }
    }

    console.log(
      `[Test] Lectura completa verificada (46 peticiones serie, ruido ignorado): v${profile.protocolVersion}, deadBand 16/16, Tecla A [150, on=0, press=11, release=50].`
    );
  }

  // 2. Reintento unico ante interferencia con cabecera incorrecta (ejemplo: web oficial abierta)
  {
    const mock = new ReplayReaderTransport(captureEntries);
    mock.mismatchOnRequestIndex = 2; // Primera peticion de Tabla 13 falla una vez con cabecera incorrecta, reintenta y pasa
    const profile = await readMad60HeProfile(mock, { timeoutMs: 40, maxRetriesOnMismatch: 1 });
    if (mock.writtenPackets.length !== 47) {
      throw new Error(`Se esperaban 47 envios (46 + 1 reintento), ocurridos ${mock.writtenPackets.length}`);
    }
    if (profile.keys[29]!.rtPressRaw !== 11) {
      throw new Error('Lectura tras reintento unico produjo datos incorrectos');
    }
    console.log('[Test] Reintento unico ante respuesta con cabecera incorrecta verificado (46 + 1 reintento = 47).');
  }

  // 3. Rechazo sin devolver perfil parcial cuando la cabecera sigue sin coincidir tras reintentar
  {
    const mock = new ReplayReaderTransport(captureEntries);
    mock.mismatchAlways = true;
    let rejectedMismatch = false;
    try {
      await readMad60HeProfile(mock, { timeoutMs: 30, maxRetriesOnMismatch: 1 });
    } catch (err: unknown) {
      rejectedMismatch = err instanceof HeaderMismatchError && err.message.includes('Cabecera de respuesta no coincide');
    }
    if (!rejectedMismatch) {
      throw new Error('Debio rechazar con HeaderMismatchError cuando las cabeceras no coinciden');
    }
    if (mock.writtenPackets.length !== 2) {
      throw new Error(`Se esperaban 2 intentos (1 + 1 reintento) antes de abortar, hubo ${mock.writtenPackets.length}`);
    }
    console.log('[Test] Rechazo estricto por cabeceras que no coinciden tras reintento verificado.');
  }

  // 4. Timeout limpio sin devolver perfil parcial
  {
    const mock = new ReplayReaderTransport(captureEntries);
    mock.silenceAlways = true;
    let timedOut = false;
    try {
      await readMad60HeProfile(mock, { timeoutMs: 30, maxRetriesOnMismatch: 1 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      timedOut = msg.includes('Tiempo de espera agotado');
    }
    if (!timedOut) {
      throw new Error('Debio fallar por timeout cuando el teclado no responde');
    }
    console.log('[Test] Timeout limpio sin perfil parcial verificado.');
  }

  console.log('=== Todas las pruebas de lector en vivo MAD60HE completadas con exito ===\n');
  return true;
}

if (process.argv[1]?.includes('test-reader')) {
  runReaderTests().catch((err) => {
    console.error('Error en pruebas de lector:', err);
    process.exit(1);
  });
}
