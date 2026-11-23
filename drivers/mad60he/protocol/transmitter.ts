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
        const incomingBytes = Array.from(incoming);
        // Descartar si el paquete entrante tiene un Report ID prependido (33 bytes con 0 al inicio)
        const normalized = incomingBytes.length === 33 && incomingBytes[0] === 0
          ? incomingBytes.slice(1)
          : incomingBytes;

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
        // En Windows node-hid con report ID 0, write() debe recibir 33 bytes: un 0 inicial y luego los 32 bytes
        const payloadToSend = Buffer.from([0, ...chunk.bytes]);
        device.write(payloadToSend);
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
