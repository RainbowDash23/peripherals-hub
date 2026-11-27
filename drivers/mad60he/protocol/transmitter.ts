import type { EncodedReport } from './codec.js';

export interface HidDeviceTransport {
  write(data: Uint8Array | readonly number[] | Buffer): number;
  on(event: 'data', listener: (data: Uint8Array | number[] | Buffer) => void): unknown;
  removeListener(event: 'data', listener: (data: Uint8Array | number[] | Buffer) => void): unknown;
  sendFeatureReport?(data: Uint8Array | readonly number[] | Buffer): number;
}

export interface ChunkTransmissionResult {
  readonly success: boolean;
  readonly tableId: number;
  readonly totalChunksSent: number;
}

export interface ReadRequestOptions {
  readonly timeoutMs?: number;
  readonly maxRetriesOnMismatch?: number;
  readonly label?: string;
}

export function normalizeIncomingHidReport(incoming: Uint8Array | readonly number[] | Buffer): number[] {
  const incomingBytes = Array.from(incoming);
  // Descartar Report ID 0 prependido en Windows si llega como 33 bytes
  return incomingBytes.length === 33 && incomingBytes[0] === 0
    ? incomingBytes.slice(1)
    : incomingBytes;
}

function writeHidReport32(device: HidDeviceTransport, bytes32: readonly number[]): void {
  if (bytes32.length !== 32) {
    throw new Error(`La peticion HID debe tener exactamente 32 bytes (recibido ${bytes32.length})`);
  }
  // En Windows node-hid con report ID 0, write() debe recibir 33 bytes: un 0 inicial y luego los 32 bytes
  const payloadToSend = Buffer.from([0, ...bytes32]);
  device.write(payloadToSend);
}

function matchesHeader(bytes: readonly number[], expectedHeader: readonly number[]): boolean {
  if (bytes.length < expectedHeader.length) {
    return false;
  }
  for (let i = 0; i < expectedHeader.length; i++) {
    if (bytes[i] !== expectedHeader[i]) {
      return false;
    }
  }
  return true;
}

function isPeriodicHeartbeatPacket(bytes: readonly number[]): boolean {
  return (
    bytes.length === 32 &&
    (bytes[0] === 3 || bytes[0] === 4) &&
    bytes[1] === 0 &&
    bytes[2] === 0 &&
    bytes[3] === 0 &&
    bytes[4] === 0
  );
}

async function awaitSingleReadResponse(
  device: HidDeviceTransport,
  requestBytes: readonly number[],
  expectedHeader: readonly number[],
  timeoutMs: number,
  label: string
): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastMismatchedHeader: number[] | null = null;

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      device.removeListener('data', onData);
    };

    const onData = (incoming: Uint8Array | number[] | Buffer) => {
      const normalized = normalizeIncomingHidReport(incoming);
      if (normalized.length !== 32) {
        // Ignorar reportes de longitud distinta (p. ej. pulsaciones u otras interfaces)
        return;
      }

      if (matchesHeader(normalized, expectedHeader)) {
        cleanup();
        resolve(normalized);
        return;
      }

      // Ignorar keepalive periodicos y registrar cualquier cabecera no coincidente por si la respuesta valida no llega
      if (!isPeriodicHeartbeatPacket(normalized)) {
        lastMismatchedHeader = normalized.slice(0, expectedHeader.length);
      }
    };

    timer = setTimeout(() => {
      cleanup();
      if (lastMismatchedHeader !== null) {
        reject(
          new HeaderMismatchError(
            `Cabecera de respuesta no coincide en ${label}: esperado [${expectedHeader.join(', ')}], recibido [${lastMismatchedHeader.join(', ')}]`,
            expectedHeader,
            lastMismatchedHeader
          )
        );
        return;
      }
      reject(
        new Error(
          `Tiempo de espera agotado (${timeoutMs}ms) esperando respuesta de lectura para ${label}`
        )
      );
    }, timeoutMs);

    device.on('data', onData);

    try {
      writeHidReport32(device, requestBytes);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export class HeaderMismatchError extends Error {
  public readonly expectedHeader: readonly number[];
  public readonly receivedHeader: readonly number[];

  constructor(message: string, expectedHeader: readonly number[], receivedHeader: readonly number[]) {
    super(message);
    this.name = 'HeaderMismatchError';
    this.expectedHeader = expectedHeader;
    this.receivedHeader = receivedHeader;
  }
}

/**
 * Envia una peticion de lectura de 32 bytes (33 con Report ID 0) y espera la respuesta cuya cabecera coincida.
 * Ignora reportes de otras interfaces o pulsaciones normales. Si solo llegan respuestas con cabecera incorrecta,
 * reintenta una vez por posible interferencia de otra aplicacion abierta (ej. web oficial).
 */
export async function sendReadRequestAndAwaitHeader(
  device: HidDeviceTransport,
  requestBytes: readonly number[],
  expectedHeader: readonly number[],
  options: ReadRequestOptions = {}
): Promise<number[]> {
  const timeoutMs = options.timeoutMs ?? 800;
  const maxRetriesOnMismatch = options.maxRetriesOnMismatch ?? 1;
  const label = options.label ?? `[${expectedHeader.join(',')}]`;

  let attempts = 0;
  while (true) {
    attempts++;
    try {
      return await awaitSingleReadResponse(device, requestBytes, expectedHeader, timeoutMs, label);
    } catch (err) {
      if (err instanceof HeaderMismatchError && attempts <= maxRetriesOnMismatch) {
        continue;
      }
      throw err;
    }
  }
}

/**
 * Transmite trozos secuencialmente a un dispositivo HID esperando el eco exacto de cada uno.
 * Si un eco difiere o no llega dentro del tiempo limite, aborta inmediatamente sin reintentos.
 */
export async function sendChunksWithEchoValidation(
  device: HidDeviceTransport,
  chunks: readonly EncodedReport[],
  timeoutMs: number = 1000
): Promise<ChunkTransmissionResult> {
  if (chunks.length === 0) {
    return { success: true, tableId: 0, totalChunksSent: 0 };
  }

  const tableId = chunks[0]?.tableId ?? 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const onData = (incoming: Uint8Array | number[]) => {
        const normalized = normalizeIncomingHidReport(incoming);

        if (normalized.length !== chunk.bytes.length) {
          cleanup();
          reject(
            new Error(
              `Eco devuelto de longitud inesperada (${normalized.length} bytes, esperado ${chunk.bytes.length}) en trozo ${i + 1} de tabla ${chunk.tableId}`
            )
          );
          return;
        }

        for (let b = 0; b < chunk.bytes.length; b++) {
          if (normalized[b] !== chunk.bytes[b]) {
            cleanup();
            reject(
              new Error(
                `Eco del teclado difiere en byte ${b} (recibido ${normalized[b]}, esperado ${chunk.bytes[b]}) en trozo ${i + 1} de tabla ${chunk.tableId}`
              )
            );
            return;
          }
        }

        cleanup();
        resolve();
      };

      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        device.removeListener('data', onData);
      };

      timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Tiempo de espera agotado (${timeoutMs}ms) esperando eco para el trozo ${i + 1}/${chunks.length} de tabla ${chunk.tableId}`
          )
        );
      }, timeoutMs);

      device.on('data', onData);

      try {
        writeHidReport32(device, chunk.bytes);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  return {
    success: true,
    tableId,
    totalChunksSent: chunks.length,
  };
}
