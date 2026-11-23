import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

interface PacketEntry {
  readonly t: number;
  readonly type: 'sendReport' | 'inputReport';
  readonly id: number;
  readonly data: readonly number[];
}

interface RemapCommand {
  readonly timestamp: number;
  readonly type: string;
  readonly layer: number;
  readonly row: number;
  readonly col: number;
  readonly keycode: number;
  readonly keycodeHex: string;
  readonly standardKeyName: string;
}

interface TableChunk {
  readonly timestamp: number;
  readonly type: 'sendReport' | 'inputReport';
  readonly tableId: number;
  readonly startIndex: number;
  readonly count: number;
  readonly mark: number;
  readonly rawBytes: readonly number[];
}

interface KeyActuation {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly actuationRaw: number;
  readonly actuationMm: number;
}

interface KeyRapidTrigger {
  readonly index: number;
  readonly row: number;
  readonly col: number;
  readonly enabled: number;
  readonly pressRaw: number;
  readonly pressMm: number;
  readonly releaseRaw: number;
  readonly releaseMm: number;
}

/**
 * Tabla estandar USB HID Keyboard/Keypad (Usage Page 0x07, usada por QMK/VIA).
 */
const USB_HID_KEYCODES: Record<number, string> = {
  0x04: 'A',
  0x05: 'B',
  0x06: 'C',
  0x07: 'D',
  0x08: 'E',
  0x09: 'F',
  0x0A: 'G',
  0x0B: 'H',
  0x0C: 'I',
  0x0D: 'J',
  0x0E: 'K',
  0x0F: 'L',
  0x10: 'M',
  0x11: 'N',
  0x12: 'O',
  0x13: 'P',
  0x14: 'Q',
  0x15: 'R',
  0x16: 'S',
  0x17: 'T',
  0x18: 'U',
  0x19: 'V',
  0x1A: 'W',
  0x1B: 'X',
  0x1C: 'Y',
  0x1D: 'Z',
  0x1E: '1!',
  0x1F: '2@',
  0x20: '3#',
  0x21: '4$',
  0x22: '5%',
  0x23: '6^',
  0x24: '7&',
  0x25: '8*',
  0x26: '9(',
  0x27: '0)',
  0x28: 'Enter',
  0x29: 'Escape',
  0x2A: 'Backspace',
  0x2B: 'Tab',
  0x2C: 'Space',
  0x2D: '-_',
  0x2E: '=+',
  0x2F: '[{',
  0x30: ']}',
  0x31: '\\|',
  0x33: ';:',
  0x34: '\'"',
  0x35: '`~',
  0x36: ',<',
  0x37: '.>',
  0x38: '/?',
  0x39: 'CapsLock',
  0x3A: 'F1',
  0x3B: 'F2',
  0x3C: 'F3',
  0x3D: 'F4',
  0x3E: 'F5',
  0x3F: 'F6',
  0x40: 'F7',
  0x41: 'F8',
  0x42: 'F9',
  0x43: 'F10',
  0x44: 'F11',
  0x45: 'F12',
  0x46: 'PrintScreen',
  0x47: 'ScrollLock',
  0x48: 'Pause',
};

function getHidKeyName(keycode: number): string {
  return USB_HID_KEYCODES[keycode] ?? 'Desconocido / Especifico';
}

export function parseCaptureFile(filePath: string): readonly PacketEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as PacketEntry[];
}

export function decodeCapture(packets: readonly PacketEntry[]): void {
  const remapCommands: RemapCommand[] = [];
  const table13Chunks: TableChunk[] = [];
  const table14Chunks: TableChunk[] = [];
  const periodicPackets: PacketEntry[] = [];
  const queryPackets: PacketEntry[] = [];

  for (const p of packets) {
    const d = p.data;
    const op = d[0];

    if (op === 5) {
      const layer = d[1] ?? 0;
      const row = d[2] ?? 0;
      const col = d[3] ?? 0;
      const kc = ((d[4] ?? 0) << 8) | (d[5] ?? 0);
      remapCommands.push({
        timestamp: p.t,
        type: p.type,
        layer,
        row,
        col,
        keycode: kc,
        keycodeHex: `0x${kc.toString(16).padStart(4, '0').toUpperCase()}`,
        standardKeyName: getHidKeyName(kc),
      });
    } else if (op === 3 && d[1] === 150) {
      const tableId = d[2] ?? 0;
      const startIndex = d[6] ?? 0;
      const count = d[7] ?? 0;
      const mark = d[8] ?? 0;
      const rawBytes = d.slice(9);

      const chunk: TableChunk = {
        timestamp: p.t,
        type: p.type,
        tableId,
        startIndex,
        count,
        mark,
        rawBytes,
      };

      if (tableId === 13) {
        table13Chunks.push(chunk);
      } else if (tableId === 14) {
        table14Chunks.push(chunk);
      }
    } else if ((op === 3 && d[1] === 0) || (op === 4 && d[5] === 41)) {
      periodicPackets.push(p);
    } else if (op === 12 || op === 13 || op === 14) {
      queryPackets.push(p);
    }
  }

  // 1. Mostrar comandos de remapeo
  if (remapCommands.length > 0) {
    console.log('--- Comandos de Remapeo (Opcode 5) ---');
    for (const r of remapCommands) {
      console.log(`[${r.type}] Capa: ${r.layer} | Matriz [Fila: ${r.row}, Col: ${r.col}] | Keycode: ${r.keycodeHex} (${r.keycode}) -> ${r.standardKeyName}`);
    }
    console.log('Nota: Que tecla fisica especifica se modifico en el teclado queda pendiente de confirmar por el usuario.\n');
  }

  // 2. Reconstruir Tabla 13 (Recorrido de Actuacion)
  if (table13Chunks.length > 0) {
    console.log(`--- Tabla 13 (Recorrido de Actuacion) [Total chunks: ${table13Chunks.length}] ---`);
    const table13Map = new Map<number, KeyActuation>();

    for (const chunk of table13Chunks) {
      for (let i = 0; i < chunk.count; i++) {
        const keyIdx = chunk.startIndex + i;
        const b0 = chunk.rawBytes[i * 2] ?? 0;
        const b1 = chunk.rawBytes[i * 2 + 1] ?? 0;
        const rawVal = (b0 << 8) | b1;
        const row = Math.floor(keyIdx / 14);
        const col = keyIdx % 14;

        table13Map.set(keyIdx, {
          index: keyIdx,
          row,
          col,
          actuationRaw: rawVal,
          actuationMm: rawVal / 100,
        });
      }
    }

    const sortedKeys = Array.from(table13Map.keys()).sort((a, b) => a - b);
    console.log(`Rango de indices decodificados: 0 a ${sortedKeys[sortedKeys.length - 1]} (${sortedKeys.length} registros totales)`);
    console.log('Mapeo inferido de indices: Fila = Math.floor(idx / 14), Columna = idx % 14 (matriz 5x14 = 70 teclas utiles).');
    console.log('Teclas con valores configurados o de interes:');
    for (const k of sortedKeys) {
      const entry = table13Map.get(k)!;
      if (entry.actuationRaw !== 150) {
        console.log(`  Tecla ${k.toString().padStart(2, ' ')} [Fila ${entry.row}, Col ${entry.col.toString().padStart(2, ' ')}]: ${entry.actuationMm.toFixed(2)} mm (raw: ${entry.actuationRaw})`);
      }
    }
    console.log('');
  }

  // 3. Reconstruir Tabla 14 (Rapid Trigger)
  if (table14Chunks.length > 0) {
    console.log(`--- Tabla 14 (Rapid Trigger) [Total chunks: ${table14Chunks.length}] ---`);
    const table14Map = new Map<number, KeyRapidTrigger>();

    for (const chunk of table14Chunks) {
      for (let i = 0; i < chunk.count; i++) {
        const keyIdx = chunk.startIndex + i;
        const base = i * 5;
        const enabled = chunk.rawBytes[base] ?? 0;
        const pRaw = ((chunk.rawBytes[base + 1] ?? 0) << 8) | (chunk.rawBytes[base + 2] ?? 0);
        const rRaw = ((chunk.rawBytes[base + 3] ?? 0) << 8) | (chunk.rawBytes[base + 4] ?? 0);
        const row = Math.floor(keyIdx / 14);
        const col = keyIdx % 14;

        table14Map.set(keyIdx, {
          index: keyIdx,
          row,
          col,
          enabled,
          pressRaw: pRaw,
          pressMm: pRaw / 100,
          releaseRaw: rRaw,
          releaseMm: rRaw / 100,
        });
      }
    }

    const sortedKeys = Array.from(table14Map.keys()).sort((a, b) => a - b);
    console.log(`Rango de indices decodificados: 0 a ${sortedKeys[sortedKeys.length - 1]} (${sortedKeys.length} registros totales)`);
    console.log('Teclas con Rapid Trigger activado o valores modificados:');
    for (const k of sortedKeys) {
      const entry = table14Map.get(k)!;
      if (entry.enabled !== 0 || entry.pressRaw !== 50 || entry.releaseRaw !== 50) {
        console.log(`  Tecla ${k.toString().padStart(2, ' ')} [Fila ${entry.row}, Col ${entry.col.toString().padStart(2, ' ')}]: RT=${entry.enabled === 1 ? 'ON' : 'OFF'} | Pulsar: ${entry.pressMm.toFixed(2)} mm (${entry.pressRaw}) | Rearme: ${entry.releaseMm.toFixed(2)} mm (${entry.releaseRaw})`);
      }
    }
    console.log('');
  }

  // 4. Resumen de paquetes periodicos y de lectura
  if (periodicPackets.length > 0) {
    console.log(`--- Paquetes Periodicos / Heartbeat (${periodicPackets.length} reportes) ---`);
    console.log(`Opcodes detectados: [${Array.from(new Set(periodicPackets.map((p) => p.data[0]))).join(', ')}]`);
  }

  if (queryPackets.length > 0) {
    console.log(`--- Paquetes de Consulta / Navegacion (${queryPackets.length} reportes) ---`);
    for (const q of queryPackets) {
      console.log(`[${q.type}] Opcode: ${q.data[0]} | Data: [${q.data.slice(0, 8).join(', ')}]`);
    }
  }
}

function run(): void {
  const args = process.argv.slice(2);
  let targetPath = args[0];

  if (!targetPath) {
    const capturesDir = resolve(process.cwd(), 'captures');
    if (!existsSync(capturesDir)) {
      console.error('No se encontro el directorio captures/');
      process.exit(1);
    }

    const files = readdirSync(capturesDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      console.error('No hay archivos .json en captures/');
      process.exit(1);
    }

    console.log('=== Decodificando todos los archivos en captures/ ===\n');
    for (const f of files) {
      console.log(`##################################################`);
      console.log(`Archivo: ${f}`);
      console.log(`##################################################`);
      const packets = parseCaptureFile(resolve(capturesDir, f));
      decodeCapture(packets);
      console.log('\n');
    }
    return;
  }

  const resolved = resolve(targetPath);
  console.log(`Decodificando archivo: ${basename(resolved)}`);
  const packets = parseCaptureFile(resolved);
  decodeCapture(packets);
}

run();
