import type { HidDeviceDescriptor } from '../../domain/hid/types.js';

/**
 * Primitivas genericas de control para la interfaz de usuario.
 */
export type ControlPrimitiveType = 'slider' | 'select' | 'toggle' | 'color' | 'readonly' | 'key-matrix';

export interface SliderControlSchema {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string;
}

export interface SelectOption {
  readonly label: string;
  readonly value: string | number;
}

export interface SelectControlSchema {
  readonly options: readonly SelectOption[];
}

export interface ToggleControlSchema {
  readonly onLabel?: string;
  readonly offLabel?: string;
}

export interface ColorControlSchema {
  readonly format?: 'hex' | 'rgb';
}

export interface ReadonlyControlSchema {
  readonly unit?: string;
}

export interface KeyMatrixFieldConfig {
  readonly id: string;
  readonly label: string;
  readonly primitive: 'slider' | 'select' | 'toggle' | 'readonly';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly options?: readonly SelectOption[];
}

export interface KeyMatrixControlSchema {
  readonly rows: number;
  readonly cols: number;
  readonly totalKeys: number;
  readonly rowLabels?: readonly (readonly string[])[];
  readonly fields: readonly KeyMatrixFieldConfig[];
}

export type CapabilitySchema =
  | { readonly primitive: 'slider'; readonly schema: SliderControlSchema }
  | { readonly primitive: 'select'; readonly schema: SelectControlSchema }
  | { readonly primitive: 'toggle'; readonly schema?: ToggleControlSchema }
  | { readonly primitive: 'color'; readonly schema?: ColorControlSchema }
  | { readonly primitive: 'readonly'; readonly schema?: ReadonlyControlSchema }
  | { readonly primitive: 'key-matrix'; readonly schema: KeyMatrixControlSchema };

export interface CapabilityDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly primitive: ControlPrimitiveType;
  /**
   * Preset semantico opcional (ej: 'dpi', 'pollingRate', 'battery', 'rgbMode', 'analogMatrix').
   * Sirve como pista de formato o icono, pero el control siempre se renderiza
   * usando la primitiva correspondiente.
   */
  readonly preset?: string;
  readonly config?: SliderControlSchema | SelectControlSchema | ToggleControlSchema | ColorControlSchema | ReadonlyControlSchema | KeyMatrixControlSchema;
}

/**
 * Identificacion de hardware por VID y PID.
 * Permite multiples entradas (ej: version cableada y dongle 2.4G).
 */
export interface DeviceIdMatch {
  readonly vendorId: number | string;
  readonly productId: number | string;
  readonly name?: string;
}

/**
 * Interfaz de control HID. Identificada estrictamente por usagePage y usage.
 * No depende del indice de interfaz de Windows.
 */
export interface ControlInterfaceMatch {
  readonly usagePage: number | string;
  readonly usage: number | string;
}

export interface DriverManifest {
  readonly id: string;
  readonly name: string;
  readonly category: 'mouse' | 'keyboard' | 'keypad' | 'audio' | 'other';
  readonly version: string;
  readonly devices: readonly DeviceIdMatch[];
  readonly controlInterface: ControlInterfaceMatch;
  readonly capabilities: readonly CapabilityDescriptor[];
}

export interface DeviceConnection {
  readonly path: string;
  readonly descriptor: HidDeviceDescriptor;
}

export interface DeviceState {
  readonly connected: boolean;
  readonly values: Record<string, unknown>;
}

export interface Driver {
  readonly manifest: DriverManifest;
  connect(connection: DeviceConnection): Promise<void>;
  readState(): Promise<DeviceState>;
  apply(partialState: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;
  onReport?(listener: (reportId: number, data: Uint8Array) => void): () => void;
}
