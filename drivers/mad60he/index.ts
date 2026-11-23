import type { DeviceConnection, DeviceState, Driver, DriverManifest } from '../../src/core/drivers/types.js';
import manifestData from './manifest.json' with { type: 'json' };
import { loadProfile, saveProfile } from './protocol/storage.js';
import { encodeTable13, encodeTable14, type EncodedReport } from './protocol/codec.js';
import { sendChunksWithEchoValidation } from './protocol/transmitter.js';
import { TOTAL_USEFUL_KEYS, type KeyboardProfile, type KeyConfig } from './protocol/profile.js';

export const manifest = manifestData as unknown as DriverManifest;

export interface KeyDifference {
  readonly index: number;
  readonly label: string;
  readonly field: string;
  readonly previous: number;
  readonly next: number;
}

export interface ApplyPlan {
  readonly changes: readonly KeyDifference[];
  readonly totalKeysAffected: number;
  readonly t13Reports: readonly EncodedReport[];
  readonly t14Reports: readonly EncodedReport[];
}

export class Mad60HeDriver implements Driver {
  public readonly manifest: DriverManifest = manifest;
  private connection: DeviceConnection | null = null;
  private profile: KeyboardProfile;
  private allowHardwareWrite: boolean = false;

  constructor() {
    this.profile = loadProfile();
  }

  public isHardwareWriteAllowed(): boolean {
    const envVal = process.env['PERIPHERALS_HUB_ALLOW_HARDWARE_WRITE'];
    if (envVal === '1' || envVal === 'true') {
      return true;
    }
    return this.allowHardwareWrite;
  }

  public setAllowHardwareWrite(allowed: boolean): void {
    this.allowHardwareWrite = allowed;
  }

  public async connect(connection: DeviceConnection): Promise<void> {
    this.connection = connection;
    // Solo lectura pasiva por defecto.
  }

  public async readState(): Promise<DeviceState> {
    return {
      connected: this.connection !== null,
      values: {
        keys: this.profile.keys,
        profileName: this.profile.name,
        allowHardwareWrite: this.isHardwareWriteAllowed(),
      },
    };
  }

  /**
   * Calcula el plan de cambios comparando el estado actual con el solicitado,
   * validando estrictamente los rangos de valores observados en las capturas.
   */
  public prepareApply(newKeys: readonly KeyConfig[]): ApplyPlan {
    if (newKeys.length !== TOTAL_USEFUL_KEYS) {
      throw new Error(`Se requieren exactamente ${TOTAL_USEFUL_KEYS} teclas en el perfil`);
    }

    const changes: KeyDifference[] = [];
    const labels = [
      ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
      ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
      ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter', 'Enter2'],
    ];

    for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
      const cur = this.profile.keys[i] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      const next = newKeys[i]!;

      // Validacion de rangos confirmados segun web oficial
      if (next.actuationRaw < 10 || next.actuationRaw > 400) {
        throw new Error(`Valor de actuacion fuera de rango valido (10 a 400 cs mm) en tecla ${i}: ${next.actuationRaw}`);
      }
      if (next.rtEnabled !== 0 && next.rtEnabled !== 1) {
        throw new Error(`Estado de Rapid Trigger invalido en tecla ${i}: ${next.rtEnabled}`);
      }
      if (next.rtPressRaw < 2 || next.rtPressRaw > 400) {
        throw new Error(`Sensibilidad de pulsacion RT fuera de rango valido (2 a 400 cs mm) en tecla ${i}: ${next.rtPressRaw}`);
      }
      if (next.rtReleaseRaw < 2 || next.rtReleaseRaw > 400) {
        throw new Error(`Sensibilidad de rearme RT fuera de rango valido (2 a 400 cs mm) en tecla ${i}: ${next.rtReleaseRaw}`);
      }

      const row = Math.floor(i / 14);
      const col = i % 14;
      const keyLabel = row < 3 && labels[row]?.[col] ? labels[row]![col]! : `Tecla ${i}`;

      if (cur.actuationRaw !== next.actuationRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: 'Actuacion',
          previous: cur.actuationRaw,
          next: next.actuationRaw,
        });
      }
      if (cur.rtEnabled !== next.rtEnabled) {
        changes.push({
          index: i,
          label: keyLabel,
          field: 'RT Activo',
          previous: cur.rtEnabled,
          next: next.rtEnabled,
        });
      }
      if (cur.rtPressRaw !== next.rtPressRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: 'RT Pulsar',
          previous: cur.rtPressRaw,
          next: next.rtPressRaw,
        });
      }
      if (cur.rtReleaseRaw !== next.rtReleaseRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: 'RT Rearme',
          previous: cur.rtReleaseRaw,
          next: next.rtReleaseRaw,
        });
      }
    }

    const nextProfile: KeyboardProfile = {
      ...this.profile,
      updatedAt: Date.now(),
      keys: newKeys,
    };

    const t13Reports = encodeTable13(nextProfile);
    const t14Reports = encodeTable14(nextProfile);

    const affectedKeys = new Set(changes.map((c) => c.index));

    return {
      changes,
      totalKeysAffected: affectedKeys.size,
      t13Reports,
      t14Reports,
    };
  }

  /**
   * Aplica y guarda el nuevo perfil localmente.
   * La rutina de transmision fisica USB con eco y timeout queda preparada para cuando
   * el usuario autorice escrituras activas al hardware.
   */
  public async apply(partialState: Record<string, unknown>): Promise<void> {
    if (typeof partialState['allowHardwareWrite'] === 'boolean') {
      this.setAllowHardwareWrite(partialState['allowHardwareWrite']);
    }

    if (partialState['keys'] && Array.isArray(partialState['keys'])) {
      const plan = this.prepareApply(partialState['keys'] as KeyConfig[]);
      this.profile = {
        ...this.profile,
        updatedAt: Date.now(),
        keys: partialState['keys'] as KeyConfig[],
      };
      saveProfile(this.profile);
      console.log(`[Mad60HeDriver] Perfil guardado localmente (${plan.changes.length} cambios registrados).`);

      const hardwareEnabled = this.isHardwareWriteAllowed() || partialState['writeToHardware'] === true;
      if (hardwareEnabled) {
        if (!this.connection?.path) {
          throw new Error('No se detecto endpoint de control HID (UP 0xFF60, usage 0x61) para emitir escrituras al hardware');
        }

        console.log(`[Mad60HeDriver] Opcion explicita activa: enviando al hardware en ${this.connection.path}...`);
        const HID = await import('node-hid');
        const device = new HID.default.HID(this.connection.path);

        try {
          // Enviar Tabla 13 (Actuacion) secuencialmente con validacion de eco de 32 bytes
          await sendChunksWithEchoValidation(device, plan.t13Reports, 1000);
          // Enviar Tabla 14 (Rapid Trigger) secuencialmente con validacion de eco de 32 bytes
          await sendChunksWithEchoValidation(device, plan.t14Reports, 1000);
          console.log('[Mad60HeDriver] Tablas 13 y 14 transmitidas y verificadas por eco en el teclado con exito.');
        } finally {
          try {
            device.close();
          } catch {
            // Ignorar cierre
          }
        }
      }
    }
  }

  public async disconnect(): Promise<void> {
    this.connection = null;
  }
}

export default Mad60HeDriver;
