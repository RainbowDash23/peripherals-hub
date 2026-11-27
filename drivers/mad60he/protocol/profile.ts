export interface KeyConfig {
  /**
   * Recorrido de actuacion en centesimas de milimetro (0.01 mm).
   * Rango valido del hardware: 10 (0.10 mm) a 400 (4.00 mm).
   */
  readonly actuationRaw: number;
  /**
   * Estado de Rapid Trigger (0 = deshabilitado, 1 = habilitado).
   */
  readonly rtEnabled: number;
  /**
   * Sensibilidad al pulsar en centesimas de milimetro (0.01 mm).
   * Rango valido del hardware: 2 (0.02 mm) a 400 (4.00 mm).
   */
  readonly rtPressRaw: number;
  /**
   * Sensibilidad al soltar/rearme en centesimas de milimetro (0.01 mm).
   * Rango valido del hardware: 2 (0.02 mm) a 400 (4.00 mm).
   */
  readonly rtReleaseRaw: number;
}

export type ProfileOrigin = 'default' | 'capture' | 'imported-file';

export interface DeadBandConfig {
  readonly topRaw: number;
  readonly bottomRaw: number;
}

export interface KeyboardProfile {
  readonly version: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly lastSentToHardwareAt?: number;
  readonly source?: ProfileOrigin;
  readonly importedAt?: number;
  readonly importedFileName?: string;
  readonly protocolVersion?: string;
  readonly deadBand?: DeadBandConfig;
  readonly keyLabels?: readonly string[];
  readonly keys: readonly KeyConfig[];
}

export const TOTAL_USEFUL_KEYS = 70;
export const MATRIX_ROWS = 5;
export const MATRIX_COLS = 14;

export const ACTUATION_MIN_RAW = 10;
export const ACTUATION_MAX_RAW = 400;
export const RT_MIN_RAW = 2;
export const RT_MAX_RAW = 400;

export const DEFAULT_KEY_CONFIG: KeyConfig = {
  actuationRaw: 150, // 1.50 mm
  rtEnabled: 0,
  rtPressRaw: 50,    // 0.50 mm
  rtReleaseRaw: 50,  // 0.50 mm
};

export function createDefaultProfile(name: string = 'Predeterminado'): KeyboardProfile {
  const keys: KeyConfig[] = Array.from({ length: TOTAL_USEFUL_KEYS }, () => ({ ...DEFAULT_KEY_CONFIG }));
  return {
    version: '1.0.0',
    name,
    source: 'default',
    updatedAt: Date.now(),
    keys,
  };
}
