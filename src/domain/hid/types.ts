/**
 * Contratos y tipos de transporte HID seguros para Peripherals Hub.
 * Define la estructura canónica de dispositivos e informes sin depender de bibliotecas externas.
 */

export interface HidDeviceDescriptor {
  readonly vendorId: number;
  readonly productId: number;
  readonly path?: string;
  readonly serialNumber?: string;
  readonly manufacturer?: string;
  readonly product?: string;
  readonly release: number;
  readonly interface: number;
  readonly usagePage?: number;
  readonly usage?: number;
}

export interface FormattedHidDevice {
  readonly vendorId: number;
  readonly vendorIdHex: string;
  readonly productId: number;
  readonly productIdHex: string;
  readonly usagePage?: number;
  readonly usagePageHex?: string;
  readonly usage?: number;
  readonly usageHex?: string;
  readonly interface: number;
  readonly path: string;
  readonly manufacturer?: string;
  readonly product?: string;
  readonly serialNumber?: string;
  readonly release: number;
}

export interface HidTransport {
  listDevices(): Promise<readonly HidDeviceDescriptor[]>;
  close(): Promise<void>;
}
