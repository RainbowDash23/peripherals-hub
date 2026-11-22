/**
 * Definiciones de dominio para el teclado MAD60HE (Switches Magnéticos con Efecto Hall).
 * Cualquier paquete de configuración debe estar respaldado por capturas en docs/protocol/mad60he/
 */

export interface KeySwitchCalibration {
  readonly keyCode: number;
  readonly actuationDistanceMm: number; // 0.1mm a 4.0mm
  readonly rapidTriggerEnabled: boolean;
  readonly pressSensitivityMm?: number; // ej: 0.1mm - 2.0mm
  readonly releaseSensitivityMm?: number;
}

export interface Mad60HeSettings {
  readonly globalActuationMm: number;
  readonly globalRapidTriggerEnabled: boolean;
  readonly pollingRateHz: 1000 | 2000 | 4000 | 8000;
  readonly perKeySettings?: readonly KeySwitchCalibration[];
}

export interface Mad60HeState {
  readonly isConnected: boolean;
  readonly settings?: Mad60HeSettings;
}
