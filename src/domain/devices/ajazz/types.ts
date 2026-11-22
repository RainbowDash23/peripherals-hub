/**
 * Definiciones de dominio para el mouse Ajazz AJ159 Pro.
 * Cualquier paquete de configuración debe estar respaldado por capturas en docs/protocol/ajazz-aj159-pro/
 */

export interface AjazzDpiStage {
  readonly stageIndex: number;
  readonly dpi: number;
  readonly colorHex?: string;
}

export interface AjazzMouseSettings {
  readonly pollingRateHz: 125 | 250 | 500 | 1000 | 2000 | 4000 | 8000;
  readonly debounceMs: number;
  readonly liftOffDistanceMm: 1 | 2;
  readonly motionSync: boolean;
  readonly currentDpiStage: number;
  readonly dpiStages: readonly AjazzDpiStage[];
}

export interface AjazzMouseState {
  readonly isConnected: boolean;
  readonly batteryPercent?: number;
  readonly isCharging?: boolean;
  readonly settings?: AjazzMouseSettings;
}
