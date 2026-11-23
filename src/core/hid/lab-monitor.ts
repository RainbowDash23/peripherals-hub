import { EventEmitter } from 'node:events';
import HID from 'node-hid';

export interface HidReportEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly reportId: number;
  readonly length: number;
  readonly hexString: string;
  readonly asciiString: string;
  readonly rawBytes: readonly number[];
}

export class LabMonitor extends EventEmitter {
  private activeDevice: HID.HID | null = null;
  private activePath: string | null = null;
  private reportCounter = 0;

  public get isMonitoring(): boolean {
    return this.activeDevice !== null;
  }

  public get currentPath(): string | null {
    return this.activePath;
  }

  /**
   * Abre un dispositivo HID exclusivamente en modo de escucha pasiva.
   * No envia ningun byte al hardware.
   */
  public startMonitoring(path: string): { success: boolean; error?: string } {
    this.stopMonitoring();

    try {
      // Apertura con nonExclusive si esta soportado en la plataforma
      const device = new HID.HID(path);
      this.activeDevice = device;
      this.activePath = path;
      this.reportCounter = 0;

      device.on('data', (data: Buffer) => {
        const bytes = Array.from(data);
        const reportId = bytes[0] ?? 0;
        const hex = bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = bytes
          .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
          .join('');

        this.reportCounter += 1;
        const reportEvent: HidReportEvent = {
          id: `rep-${this.reportCounter}-${Date.now()}`,
          timestamp: Date.now(),
          reportId,
          length: bytes.length,
          hexString: hex,
          asciiString: ascii,
          rawBytes: bytes,
        };

        this.emit('report', reportEvent);
      });

      device.on('error', (err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[LabMonitor] Error en flujo pasivo del dispositivo: ${errorMsg}`);
        this.emit('stream-error', errorMsg);
        this.stopMonitoring();
      });

      console.log(`[LabMonitor] Monitor pasivo iniciado en: ${path}`);
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[LabMonitor] No se pudo abrir dispositivo para escucha: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg.includes('cannot open device')
          ? 'El sistema operativo o un controlador tiene acceso exclusivo a este endpoint. Prueba con otro endpoint/interfaz del dispositivo.'
          : errorMsg,
      };
    }
  }

  public stopMonitoring(): void {
    if (this.activeDevice) {
      try {
        this.activeDevice.close();
      } catch {
        // Ignorar errores al cerrar
      }
      this.activeDevice = null;
      this.activePath = null;
      this.emit('monitoring-stopped');
      console.log('[LabMonitor] Monitor pasivo detenido');
    }
  }
}
