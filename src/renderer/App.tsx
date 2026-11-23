import React, { useState, useEffect } from 'react';
import type { DiscoveredPeripheral, DeviceEndpointInfo } from '../core/hid/device-manager.js';
import { DeviceView } from './features/DeviceView.js';
import { UnsupportedDeviceView } from './features/UnsupportedDeviceView.js';
import { LabModeView } from './features/LabModeView.js';
import { Mouse, Keyboard, Usb, Terminal, RefreshCw, Cpu, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [devices, setDevices] = useState<readonly DiscoveredPeripheral[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLabActive, setIsLabActive] = useState<boolean>(false);
  const [targetLabEndpoint, setTargetLabEndpoint] = useState<string | undefined>(undefined);
  const [appVersion, setAppVersion] = useState<string>('0.1.0');

  useEffect(() => {
    if (!window.peripheralsHub) {
      return;
    }

    window.peripheralsHub.getAppVersion().then(setAppVersion).catch(() => {});

    // Cargar dispositivos iniciales
    window.peripheralsHub.getPeripherals().then((list) => {
      setDevices(list);
      if (list.length > 0 && !selectedId) {
        // Seleccionar por defecto el primer dispositivo soportado si existe, o el primero general
        const firstSupported = list.find((d) => d.status === 'supported');
        setSelectedId(firstSupported ? firstSupported.id : list[0]!.id);
      }
    }).catch(console.error);

    // Escuchar actualizaciones periodicas de polling
    const unsubscribe = window.peripheralsHub.onPeripheralsUpdated((updatedList) => {
      setDevices(updatedList);
      if (selectedId && !updatedList.some((d) => d.id === selectedId) && updatedList.length > 0) {
        setSelectedId(updatedList[0]!.id);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [selectedId]);

  const selectedDevice = devices.find((d) => d.id === selectedId);

  const handleOpenInLab = (endpoint?: DeviceEndpointInfo) => {
    setIsLabActive(true);
    if (endpoint) {
      setTargetLabEndpoint(endpoint.path);
    } else if (selectedDevice?.controlPath) {
      setTargetLabEndpoint(selectedDevice.controlPath);
    } else if (selectedDevice && selectedDevice.endpoints.length > 0) {
      setTargetLabEndpoint(selectedDevice.endpoints[0]!.path);
    }
  };

  const supportedDevices = devices.filter((d) => d.status === 'supported');
  const unsupportedDevices = devices.filter((d) => d.status === 'unsupported');

  const getDeviceIcon = (dev: DiscoveredPeripheral) => {
    const category = dev.driverManifest?.category;
    if (category === 'mouse') return <Mouse className="w-4 h-4 text-accent" />;
    if (category === 'keyboard') return <Keyboard className="w-4 h-4 text-accent" />;
    return <Usb className="w-4 h-4 text-text-muted" />;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base text-text-primary text-sm font-sans select-none">
      {/* Barra Lateral (Sidebar) */}
      <aside className="w-72 shrink-0 bg-surface-raised border-r border-border-subtle flex flex-col justify-between">
        <div className="flex flex-col overflow-y-auto">
          {/* Logo y Titulo */}
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
                <Cpu className="w-4 h-4 text-accent" />
              </div>
              <div>
                <span className="font-semibold text-text-primary tracking-tight block text-sm">
                  Peripherals Hub
                </span>
                <span className="text-[10px] font-mono text-text-muted block">
                  v{appVersion} | Electron + HID
                </span>
              </div>
            </div>
          </div>

          {/* Navegacion Modo Laboratorio */}
          <div className="p-2 border-b border-border-subtle">
            <button
              type="button"
              onClick={() => setIsLabActive(true)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-mono transition-colors cursor-pointer ${
                isLabActive
                  ? 'bg-accent/15 text-accent border border-accent/30 font-medium'
                  : 'text-text-secondary hover:bg-surface-base hover:text-text-primary border border-transparent'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Modo Laboratorio</span>
            </button>
          </div>

          {/* Listado de Dispositivos */}
          <div className="p-2 space-y-4">
            {/* Soportados */}
            <div>
              <div className="px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span>Dispositivos con Driver</span>
                <span className="text-accent">{supportedDevices.length}</span>
              </div>
              <div className="space-y-1 mt-1">
                {supportedDevices.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-text-muted italic">
                    Buscando perifericos con driver...
                  </div>
                ) : (
                  supportedDevices.map((dev) => {
                    const isSelected = !isLabActive && selectedId === dev.id;
                    const name = dev.driverManifest?.name ?? dev.product ?? 'Periferico';
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(dev.id);
                          setIsLabActive(false);
                        }}
                        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-surface-base border border-border-default text-text-primary shadow-xs'
                            : 'hover:bg-surface-base/60 text-text-secondary hover:text-text-primary border border-transparent'
                        }`}
                      >
                        {getDeviceIcon(dev)}
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-xs font-medium text-text-primary">
                            {name}
                          </span>
                          <span className="block text-[10px] font-mono text-text-muted">
                            {dev.vendorIdHex}:{dev.productIdHex}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Sin soporte */}
            <div>
              <div className="px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span>Sin soporte</span>
                <span className="text-text-muted">{unsupportedDevices.length}</span>
              </div>
              <div className="space-y-1 mt-1">
                {unsupportedDevices.map((dev) => {
                  const isSelected = !isLabActive && selectedId === dev.id;
                  const name = [dev.manufacturer, dev.product].filter(Boolean).join(' ') || 'Dispositivo HID';
                  return (
                    <button
                      key={dev.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(dev.id);
                        setIsLabActive(false);
                      }}
                      className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-surface-base border border-border-default text-text-primary shadow-xs'
                          : 'hover:bg-surface-base/60 text-text-secondary hover:text-text-primary border border-transparent'
                      }`}
                    >
                      <Usb className="w-4 h-4 text-text-muted" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-xs text-text-primary">
                          {name}
                        </span>
                        <span className="block text-[10px] font-mono text-text-muted">
                          {dev.vendorIdHex}:{dev.productIdHex} | {dev.endpoints.length} int
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Barra Lateral */}
        <div className="p-3 border-t border-border-subtle bg-surface-base/50 flex items-center justify-between text-[11px] font-mono text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            Polling 1.5s
          </span>
          <span className="tabular-nums">{devices.length} HID</span>
        </div>
      </aside>

      {/* Area Principal de Contenido */}
      <main className="flex-1 bg-surface-base overflow-hidden flex flex-col">
        {isLabActive ? (
          <LabModeView devices={devices} initialSelectedPath={targetLabEndpoint} />
        ) : selectedDevice ? (
          selectedDevice.status === 'supported' ? (
            <DeviceView device={selectedDevice} onOpenInLab={handleOpenInLab} />
          ) : (
            <UnsupportedDeviceView device={selectedDevice} onOpenInLab={handleOpenInLab} />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-2">
            <Layers className="w-8 h-8 opacity-30" />
            <p className="text-xs font-mono">No hay ningun dispositivo seleccionado.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
