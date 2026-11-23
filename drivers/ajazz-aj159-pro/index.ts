import type { DeviceConnection, DeviceState, Driver, DriverManifest } from '../../src/core/drivers/types.js';
import manifestData from './manifest.json' with { type: 'json' };

export const manifest = manifestData as unknown as DriverManifest;

export class AjazzAj159ProDriver implements Driver {
  public readonly manifest: DriverManifest = manifest;
  private connection: DeviceConnection | null = null;

  public async connect(connection: DeviceConnection): Promise<void> {
    this.connection = connection;
    // Solo lectura pasiva. No se envian bytes hasta documentar paquetes en docs/protocol/
  }

  public async readState(): Promise<DeviceState> {
    return {
      connected: this.connection !== null,
      values: {},
    };
  }

  public async apply(_partialState: Record<string, unknown>): Promise<void> {
    // Bloqueado por regla de seguridad: requiere capturas documentadas
  }

  public async disconnect(): Promise<void> {
    this.connection = null;
  }
}

export default AjazzAj159ProDriver;
