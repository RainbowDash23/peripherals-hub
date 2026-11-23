export interface KeyConfig {
  /**
   * Recorrido de actuacion en centesimas de milimetro (0.01 mm).
   * Rango observado: 10 (0.10 mm) a 150 (1.50 mm).
   */
  readonly actuationRaw: number;
  /**
   * Estado de Rapid Trigger (0 = deshabilitado, 1 = habilitado).
   */
  readonly rtEnabled: number;
  /**
   * Sensibilidad al pulsar en centesimas de milimetro (0.01 mm).
   * Rango observado: 2 (0.02 mm) a 50 (0.50 mm).
   */
  readonly rtPressRaw: number;
  /**
   * Sensibilidad al soltar en centesimas de milimetro (0.01 mm).
   * Rango observado: 2 (0.02 mm) a 50 (0.50 mm).
   */
  readonly rtReleaseRaw: number;
}

export interface KeyboardProfile {
  readonly version: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly keys: readonly KeyConfig[];
}

export const TOTAL_USEFUL_KEYS = 70;
export const MATRIX_ROWS = 5;
export const MATRIX_COLS = 14;

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
    updatedAt: Date.now(),
    keys,
  };
}
