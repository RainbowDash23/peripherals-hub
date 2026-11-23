import React from 'react';
import type { DiscoveredPeripheral, DeviceEndpointInfo } from '../../core/hid/device-manager.js';
import { Terminal, ShieldAlert, Cpu } from 'lucide-react';

interface UnsupportedDeviceViewProps {
  readonly device: DiscoveredPeripheral;
  readonly onOpenInLab: (endpoint: DeviceEndpointInfo) => void;
}

export const UnsupportedDeviceView: React.FC<UnsupportedDeviceViewProps> = ({
  device,
  onOpenInLab,
}) => {
  const displayName = [device.manufacturer, device.product].filter(Boolean).join(' ') || 'Dispositivo HID';

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-surface-muted text-text-secondary border border-border-subtle">
              <ShieldAlert className="w-3.5 h-3.5 text-text-muted" />
              Sin soporte de driver
            </span>
            <span className="text-xs font-mono text-text-muted">
              {device.vendorIdHex}:{device.productIdHex}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">{displayName}</h1>
          <p className="text-xs text-text-secondary mt-1">
            Este dispositivo fue detectado en el bus HID pero no cuenta con un driver registrado en drivers/.
          </p>
        </div>
      </div>

      {/* Tarjeta de Descriptores Base */}
      <div className="bg-surface-raised border border-border-subtle rounded-lg p-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-accent" />
          Descriptores de Hardware
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-text-muted block">Vendor ID</span>
            <span className="text-text-primary">{device.vendorIdHex} ({device.vendorId})</span>
          </div>
          <div>
            <span className="text-text-muted block">Product ID</span>
            <span className="text-text-primary">{device.productIdHex} ({device.productId})</span>
          </div>
          <div>
            <span className="text-text-muted block">Firmware Release</span>
            <span className="text-text-primary">{device.release}</span>
          </div>
          <div>
            <span className="text-text-muted block">Serial Number</span>
            <span className="text-text-primary">{device.serialNumber || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Tabla de Endpoints e Interfaces */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Endpoints e Interfaces HID ({device.endpoints.length})
          </h2>
          <span className="text-xs text-text-muted">
            Selecciona una interfaz para inspeccionar en Modo Laboratorio
          </span>
        </div>

        <div className="border border-border-subtle rounded-lg overflow-hidden bg-surface-raised">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-base border-b border-border-subtle text-text-muted">
              <tr>
                <th className="px-3.5 py-2.5 font-medium">Interface</th>
                <th className="px-3.5 py-2.5 font-medium">Usage Page</th>
                <th className="px-3.5 py-2.5 font-medium">Usage</th>
                <th className="px-3.5 py-2.5 font-medium">Ruta del Dispositivo</th>
                <th className="px-3.5 py-2.5 font-medium text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-text-secondary">
              {device.endpoints.map((ep, idx) => (
                <tr key={`${ep.path}-${idx}`} className="hover:bg-surface-base/50 transition-colors">
                  <td className="px-3.5 py-2.5 tabular-nums text-text-primary">
                    {ep.interface === -1 ? 'N/A' : ep.interface}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {ep.usagePageHex ?? 'N/A'} <span className="text-text-muted">({ep.usagePage ?? 'N/A'})</span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {ep.usageHex ?? 'N/A'} <span className="text-text-muted">({ep.usage ?? 'N/A'})</span>
                  </td>
                  <td className="px-3.5 py-2.5 truncate max-w-xs text-text-muted" title={ep.path}>
                    {ep.path}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenInLab(ep)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-base border border-border-default hover:border-accent hover:text-accent text-text-primary text-xs transition-colors cursor-pointer"
                    >
                      <Terminal className="w-3 h-3" />
                      Inspeccionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
