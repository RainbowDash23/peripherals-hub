import { sendChunksWithEchoValidation, type HidDeviceTransport } from './transmitter.js';
import { encodeTable13, encodeTable14, type EncodedReport } from './codec.js';
import { createDefaultProfile } from './profile.js';

class MockHidTransport implements HidDeviceTransport {
  private listeners: Array<(data: Uint8Array | number[] | Buffer) => void> = [];
  public writtenPackets: number[][] = [];
  public featureReportsSent: number[][] = [];
  public echoBehavior: 'echo_identical' | 'echo_mismatch' | 'echo_timeout' = 'echo_identical';

  public write(data: Uint8Array | readonly number[] | Buffer): number {
    const bytes = Array.from(data);
    this.writtenPackets.push(bytes);

    if (this.echoBehavior === 'echo_identical') {
      // El eco devuelto por el teclado llega como 32 bytes (data[0..31])
      const dataOnly = bytes.length === 33 && bytes[0] === 0 ? bytes.slice(1) : bytes;
      setTimeout(() => {
        this.emitData(Buffer.from(dataOnly));
      }, 5);
    } else if (this.echoBehavior === 'echo_mismatch') {
      const corrupted = [...bytes];
      corrupted[10] = 0xAA; // Byte alterado
      setTimeout(() => {
        this.emitData(Buffer.from(corrupted.length === 33 && corrupted[0] === 0 ? corrupted.slice(1) : corrupted));
      }, 5);
    }
    // En 'echo_timeout' no se emite nada
    return data.length;
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

  public emitData(data: Buffer): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }
}

export async function runTransmitterTests(): Promise<boolean> {
  console.log('=== Iniciando Pruebas de Transmisor de Trozos MAD60HE ===');
  const profile = createDefaultProfile();
  const chunksT13 = encodeTable13(profile);
  const chunksT14 = encodeTable14(profile);

  // Caso 1: Flujo normal exitoso
  {
    const mock = new MockHidTransport();
    mock.echoBehavior = 'echo_identical';
    const result = await sendChunksWithEchoValidation(mock, chunksT13, 200);
    if (!result.success || result.totalChunksSent !== 7) {
      throw new Error(`Fallo en caso exitoso: ${JSON.stringify(result)}`);
    }
    console.log('[Test] Transmision exitosa de 7 trozos con ecos confirmados.');
  }

  // Caso 2: Aborto por tiempo de espera (timeout)
  {
    const mock = new MockHidTransport();
    mock.echoBehavior = 'echo_timeout';
    let failed = false;
    try {
      await sendChunksWithEchoValidation(mock, chunksT13, 50);
    } catch (err: unknown) {
      failed = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Tiempo de espera agotado')) {
        throw new Error(`Mensaje de error inesperado en timeout: ${msg}`);
      }
      console.log(`[Test] Aborto correcto por timeout: "${msg}"`);
    }
    if (!failed) {
      throw new Error('El transmisor debio abortar por timeout pero no lo hizo');
    }
  }

  // Caso 3: Aborto por eco corrupto o que difiere (sin reintentos)
  {
    const mock = new MockHidTransport();
    mock.echoBehavior = 'echo_mismatch';
    let failed = false;
    try {
      await sendChunksWithEchoValidation(mock, chunksT13, 100);
    } catch (err: unknown) {
      failed = true;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Eco del teclado difiere')) {
        throw new Error(`Mensaje de error inesperado en mismatch: ${msg}`);
      }
      console.log(`[Test] Aborto correcto por eco discordante: "${msg}"`);
    }
    if (!failed) {
      throw new Error('El transmisor debio abortar por eco discordante pero no lo hizo');
    }
  }

  // Caso 4: Verificacion estricta de enmarcado de transporte (33 bytes con 0 inicial, sin sendFeatureReport, eco de 32 bytes)
  {
    const mock = new MockHidTransport();
    mock.echoBehavior = 'echo_identical';
    await sendChunksWithEchoValidation(mock, chunksT13, 200);
    await sendChunksWithEchoValidation(mock, chunksT14, 200);

    const totalExpectedChunks = chunksT13.length + chunksT14.length; // 7 + 18 = 25
    if (mock.writtenPackets.length !== totalExpectedChunks) {
      throw new Error(`Cantidad de paquetes enviados (${mock.writtenPackets.length}) no coincide con los esperados (${totalExpectedChunks})`);
    }

    if (mock.featureReportsSent.length !== 0) {
      throw new Error('Se detectaron llamadas a sendFeatureReport: el teclado exige exclusivamente write()');
    }

    for (let i = 0; i < mock.writtenPackets.length; i++) {
      const packet = mock.writtenPackets[i]!;
      if (packet.length !== 33) {
        throw new Error(`Paquete ${i} tiene longitud ${packet.length}, se exigen exactamente 33 bytes (0 inicial + 32 payload)`);
      }
      if (packet[0] !== 0) {
        throw new Error(`Paquete ${i} no inicia con Report ID 0 (primer byte es ${packet[0]})`);
      }
    }
    console.log('[Test] Enmarcado validado: todos los paquetes usan write() de 33 bytes con 0 inicial y cero llamadas a sendFeatureReport.');
  }

  console.log('=== Todas las pruebas de transmisor completadas con exito ===\n');
  return true;
}

if (process.argv[1]?.includes('test-transmitter')) {
  runTransmitterTests().catch((err) => {
    console.error('[Error]', err);
    process.exit(1);
  });
}
