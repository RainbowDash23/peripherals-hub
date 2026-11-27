import type { DeviceConnection, DeviceState, Driver, DriverManifest } from '../../src/core/drivers/types.js';
import manifestData from './manifest.json' with { type: 'json' };
import { loadProfile, saveProfile } from './protocol/storage.js';
import { encodeTable13, encodeTable14, type EncodedReport } from './protocol/codec.js';
import { sendChunksWithEchoValidation } from './protocol/transmitter.js';
import {
  ACTUATION_MAX_RAW,
  ACTUATION_MIN_RAW,
  RT_MAX_RAW,
  RT_MIN_RAW,
  TOTAL_USEFUL_KEYS,
  type DeadBandConfig,
  type KeyboardProfile,
  type KeyConfig,
  type ProfileOrigin,
} from './protocol/profile.js';
import { getKeyLabelAtIndex } from './protocol/keymap.js';

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

export interface ApplyResult {
  readonly success: boolean;
  readonly savedLocally: boolean;
  readonly hardwareWritten: boolean;
  readonly transmission?: {
    readonly table13ChunksSent: number;
    readonly table13TotalChunks: number;
    readonly table14ChunksSent: number;
    readonly table14TotalChunks: number;
  };
  readonly appliedAt: number;
  readonly message: string;
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
        source: this.profile.source ?? 'default',
        importedAt: this.profile.importedAt ?? null,
        importedFileName: this.profile.importedFileName ?? null,
        protocolVersion: this.profile.protocolVersion ?? null,
        deadBand: this.profile.deadBand ?? null,
        keyLabels: this.profile.keyLabels ?? null,
        allowHardwareWrite: this.isHardwareWriteAllowed(),
        lastSentToHardwareAt: this.profile.lastSentToHardwareAt,
        updatedAt: this.profile.updatedAt,
      },
    };
  }

  /**
   * Calcula el plan de cambios comparando el estado actual con el solicitado,
   * validando estrictamente los rangos de valores observados en las capturas.
   */
  public prepareApply(newKeys: readonly KeyConfig[], keyLabels?: readonly string[]): ApplyPlan {
    if (newKeys.length !== TOTAL_USEFUL_KEYS) {
      throw new Error(`Se requieren exactamente ${TOTAL_USEFUL_KEYS} teclas en el perfil`);
    }

    const effectiveLabels = keyLabels ?? this.profile.keyLabels;
    const changes: KeyDifference[] = [];

    for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
      const cur = this.profile.keys[i] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      const next = newKeys[i]!;

      // Validacion de rangos confirmados segun web oficial
      if (next.actuationRaw < ACTUATION_MIN_RAW || next.actuationRaw > ACTUATION_MAX_RAW) {
        throw new Error(
          `Valor de actuacion fuera de rango valido (${ACTUATION_MIN_RAW} a ${ACTUATION_MAX_RAW} cs mm) en tecla ${i}: ${next.actuationRaw}`
        );
      }
      if (next.rtEnabled !== 0 && next.rtEnabled !== 1) {
        throw new Error(`Estado de Rapid Trigger invalido en tecla ${i}: ${next.rtEnabled}`);
      }
      if (next.rtPressRaw < RT_MIN_RAW || next.rtPressRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad de pulsacion RT fuera de rango valido (${RT_MIN_RAW} a ${RT_MAX_RAW} cs mm) en tecla ${i}: ${next.rtPressRaw}`
        );
      }
      if (next.rtReleaseRaw < RT_MIN_RAW || next.rtReleaseRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad de rearme RT fuera de rango valido (${RT_MIN_RAW} a ${RT_MAX_RAW} cs mm) en tecla ${i}: ${next.rtReleaseRaw}`
        );
      }

      const keyLabel = getKeyLabelAtIndex(i, effectiveLabels);

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
  public async apply(partialState: Record<string, unknown>): Promise<ApplyResult> {
    if (typeof partialState['allowHardwareWrite'] === 'boolean') {
      this.setAllowHardwareWrite(partialState['allowHardwareWrite']);
    }

    if (!partialState['keys'] || !Array.isArray(partialState['keys'])) {
      return {
        success: true,
        savedLocally: false,
        hardwareWritten: false,
        appliedAt: this.profile.updatedAt,
        message: 'No se enviaron teclas para modificar.',
      };
    }

    const nextLabels =
      Array.isArray(partialState['keyLabels']) && partialState['keyLabels'].length === TOTAL_USEFUL_KEYS
        ? (partialState['keyLabels'] as string[])
        : this.profile.keyLabels;

    const plan = this.prepareApply(partialState['keys'] as KeyConfig[], nextLabels);
    const now = Date.now();
    const rawSource = partialState['source'];
    const validSource: ProfileOrigin =
      rawSource === 'imported-file' || rawSource === 'capture' || rawSource === 'default'
        ? rawSource
        : this.profile.source ?? 'default';

    const rawDeadBand = partialState['deadBand'] as DeadBandConfig | null | undefined;
    const validDeadBand =
      rawDeadBand && typeof rawDeadBand.topRaw === 'number' && typeof rawDeadBand.bottomRaw === 'number'
        ? rawDeadBand
        : this.profile.deadBand;

    this.profile = {
      ...this.profile,
      name: typeof partialState['profileName'] === 'string' && partialState['profileName'].trim().length > 0
        ? partialState['profileName'].trim()
        : this.profile.name,
      source: validSource,
      importedAt: typeof partialState['importedAt'] === 'number' ? partialState['importedAt'] : this.profile.importedAt,
      importedFileName:
        typeof partialState['importedFileName'] === 'string'
          ? partialState['importedFileName']
          : this.profile.importedFileName,
      protocolVersion:
        typeof partialState['protocolVersion'] === 'string'
          ? partialState['protocolVersion']
          : this.profile.protocolVersion,
      deadBand: validDeadBand,
      keyLabels: nextLabels,
      updatedAt: now,
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
        const t13Res = await sendChunksWithEchoValidation(device, plan.t13Reports, 1000);
        const t14Res = await sendChunksWithEchoValidation(device, plan.t14Reports, 1000);
        console.log('[Mad60HeDriver] Tablas 13 y 14 transmitidas y verificadas por eco en el teclado con exito.');

        const appliedAt = Date.now();
        this.profile = {
          ...this.profile,
          lastSentToHardwareAt: appliedAt,
        };
        saveProfile(this.profile);

        return {
          success: true,
          savedLocally: true,
          hardwareWritten: true,
          transmission: {
            table13ChunksSent: t13Res.totalChunksSent,
            table13TotalChunks: plan.t13Reports.length,
            table14ChunksSent: t14Res.totalChunksSent,
            table14TotalChunks: plan.t14Reports.length,
          },
          appliedAt,
          message: `${t13Res.totalChunksSent}/${plan.t13Reports.length} trozos de Tabla 13 y ${t14Res.totalChunksSent}/${plan.t14Reports.length} trozos de Tabla 14 confirmados por eco.`,
        };
      } finally {
        try {
          device.close();
        } catch {
          // Ignorar cierre
        }
      }
    }

    return {
      success: true,
      savedLocally: true,
      hardwareWritten: false,
      appliedAt: now,
      message: 'solo guardado en el hub',
    };
  }

  public async disconnect(): Promise<void> {
    this.connection = null;
  }
}

export default Mad60HeDriver;
