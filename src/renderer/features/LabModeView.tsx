import React, { useState, useEffect, useRef } from 'react';
import type { DiscoveredPeripheral, DeviceEndpointInfo } from '../../core/hid/device-manager.js';
import type { HidReportEvent } from '../../core/hid/lab-monitor.js';
import { Terminal, Play, Square, Trash2, Info, AlertTriangle, Copy, Check } from 'lucide-react';

interface LabModeViewProps {
  readonly devices: readonly DiscoveredPeripheral[];
  readonly initialSelectedPath?: string;
}

interface EndpointSelectionItem {
  readonly path: string;
  readonly label: string;
  readonly deviceId: string;
}

export const LabModeView: React.FC<LabModeViewProps> = ({ devices, initialSelectedPath }) => {
  const [selectedPath, setSelectedPath] = useState<string>(initialSelectedPath || '');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [reports, setReports] = useState<readonly HidReportEvent[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Generar lista plana de endpoints para el selector
  const endpointList: EndpointSelectionItem[] = [];
  for (const dev of devices) {
    const devName = [dev.manufacturer, dev.product].filter(Boolean).join(' ') || `${dev.vendorIdHex}:${dev.productIdHex}`;
    for (const ep of dev.endpoints) {
      const up = ep.usagePageHex ?? `UP:${ep.usagePage}`;
      const u = ep.usageHex ?? `U:${ep.usage}`;
      endpointList.push({
        path: ep.path,
        label: `${devName} | Int ${ep.interface} | ${up} | ${u}`,
        deviceId: dev.id,
      });
    }
  }

  // Establecer endpoint por defecto si no hay ninguno seleccionado
  useEffect(() => {
    if (!selectedPath && endpointList.length > 0) {
      setSelectedPath(endpointList[0]!.path);
    }
  }, [endpointList, selectedPath]);

  // Manejar eventos del monitor via preload bridge
  useEffect(() => {
    if (!window.peripheralsHub) return;

    const unsubReport = window.peripheralsHub.onLabReport((report) => {
      setReports((prev) => [...prev.slice(-499), report]);
    });

    const unsubError = window.peripheralsHub.onLabError((errorMsg) => {
      setErrorBanner(errorMsg);
      setIsMonitoring(false);
    });

    return () => {
      unsubReport();
      unsubError();
      if (isMonitoring && window.peripheralsHub) {
        window.peripheralsHub.stopLabMonitoring().catch(() => {});
      }
    };
  }, [isMonitoring]);

  // Auto-scroll hacia el final
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [reports, autoScroll]);

  const handleStartMonitoring = async () => {
    if (!selectedPath || !window.peripheralsHub) return;
    setErrorBanner(null);

    const result = await window.peripheralsHub.startLabMonitoring(selectedPath);
    if (result.success) {
      setIsMonitoring(true);
    } else {
      setErrorBanner(result.error ?? 'No se pudo iniciar el monitor pasivo.');
      setIsMonitoring(false);
    }
  };

  const handleStopMonitoring = async () => {
    if (!window.peripheralsHub) return;
    await window.peripheralsHub.stopLabMonitoring();
    setIsMonitoring(false);
  };

  const handleClearReports = () => {
    setReports([]);
  };

  const handleCopyHex = (report: HidReportEvent) => {
    navigator.clipboard.writeText(report.hexString);
    setCopiedId(report.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-4 overflow-hidden">
      {/* Cabecera */}
      <div className="flex items-start justify-between border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-surface-muted text-text-primary border border-border-subtle">
              <Terminal className="w-3.5 h-3.5 text-accent" />
              Herramienta de Diagnostico
            </span>
            <span className="text-xs font-mono text-text-muted">Solo lectura pasiva</span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Modo Laboratorio</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Monitoreo en vivo de reportes entrantes para ingenieria inversa y desarrollo de nuevos drivers.
          </p>
        </div>

        {/* Estado y Acciones principales */}
        <div className="flex items-center gap-2">
          {isMonitoring ? (
            <button
              type="button"
              onClick={handleStopMonitoring}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-red-950/40 border border-red-500/40 text-red-300 text-xs font-mono hover:bg-red-900/50 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Detener Escucha
            </button>
          ) : (
            <button
              type="button"
              disabled={!selectedPath}
              onClick={handleStartMonitoring}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-accent/10 border border-accent/30 text-accent text-xs font-mono hover:bg-accent/20 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Iniciar Escucha Pasiva
            </button>
          )}

          <button
            type="button"
            onClick={handleClearReports}
            title="Limpiar registro"
            className="p-1.5 rounded bg-surface-raised border border-border-subtle hover:border-border-default text-text-secondary hover:text-text-primary text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Aviso de limitacion tecnica obligatorio */}
      <div className="rounded border border-border-subtle bg-surface-raised/80 p-3 flex items-start gap-3 text-xs leading-relaxed">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div className="text-text-secondary">
          <strong className="text-text-primary">Limitacion tecnica del Modo Laboratorio:</strong> Esta herramienta realiza lectura pasiva directa de los reportes HID entrantes emitidos por el hardware. <span className="text-text-primary">No intercepta ni captura el trafico USB saliente enviado por el software oficial del fabricante</span> hacia el periferico. Para aislar y documentar comandos enviados por el software oficial, debe utilizarse Wireshark con el controlador USBPcap segun se detalla en <code className="text-text-primary font-mono">docs/protocol/README.md</code>.
        </div>
      </div>

      {/* Selector de Endpoint y Barra de Control */}
      <div className="flex items-center gap-4 bg-surface-raised border border-border-subtle rounded p-2.5">
        <div className="flex-1 flex items-center gap-2">
          <label className="text-xs font-mono text-text-muted shrink-0">Endpoint HID:</label>
          <select
            value={selectedPath}
            disabled={isMonitoring}
            onChange={(e) => setSelectedPath(e.target.value)}
            className="w-full text-xs font-mono bg-surface-base border border-border-default rounded px-2.5 py-1 text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
          >
            {endpointList.map((ep) => (
              <option key={ep.path} value={ep.path}>
                {ep.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
          <label className="flex items-center gap-1.5 cursor-pointer text-text-secondary">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-accent"
            />
            Auto-scroll
          </label>
          <span className="text-text-muted">|</span>
          <span className="text-text-secondary tabular-nums">
            Reportes: <strong className="text-text-primary">{reports.length}</strong>
          </span>
        </div>
      </div>

      {/* Error Banner si ocurrio fallo al abrir */}
      {errorBanner && (
        <div className="rounded border border-red-500/30 bg-red-950/20 p-3 flex items-center gap-2 text-xs text-red-300 font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Visor de Reportes en Tiempo Real */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-surface-base border border-border-subtle rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1.5"
      >
        {reports.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-1">
            <Terminal className="w-6 h-6 opacity-40 mb-1" />
            <p>{isMonitoring ? 'Esperando paquetes de entrada del dispositivo...' : 'Monitor en espera. Haz clic en "Iniciar Escucha Pasiva".'}</p>
          </div>
        ) : (
          reports.map((r) => {
            const dateStr = new Date(r.timestamp).toISOString().slice(11, 23);
            return (
              <div
                key={r.id}
                className="group flex items-start gap-3 py-1 px-2 rounded hover:bg-surface-raised/60 transition-colors border-b border-border-subtle/30"
              >
                <span className="text-text-muted tabular-nums shrink-0">{dateStr}</span>
                <span className="text-text-muted shrink-0 w-12">
                  ID: <span className="text-accent">{r.reportId.toString(16).padStart(2, '0').toUpperCase()}</span>
                </span>
                <span className="text-text-muted shrink-0 w-12 tabular-nums">{r.length}B</span>
                <span className="text-text-primary flex-1 break-all tracking-wider font-mono select-text">
                  {r.hexString}
                </span>
                <span className="text-text-muted shrink-0 max-w-xs truncate hidden md:inline-block">
                  {r.asciiString}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyHex(r)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-accent transition-opacity text-text-muted shrink-0 cursor-pointer"
                  title="Copiar Hex"
                >
                  {copiedId === r.id ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
