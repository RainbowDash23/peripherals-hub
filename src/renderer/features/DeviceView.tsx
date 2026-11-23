import React, { useState, useEffect } from 'react';
import type { DiscoveredPeripheral, DeviceEndpointInfo } from '../../core/hid/device-manager.js';
import type { DriverChangeDifference } from '../../preload/index.js';
import { DynamicControl } from '../components/capabilities/DynamicControl.js';
import {
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Save,
  AlertCircle,
  X,
  FolderOpen,
  Shield,
  Send,
} from 'lucide-react';

interface DeviceViewProps {
  readonly device: DiscoveredPeripheral;
  readonly onOpenInLab: (endpoint?: DeviceEndpointInfo) => void;
}

export const DeviceView: React.FC<DeviceViewProps> = ({ device, onOpenInLab }) => {
  const manifest = device.driverManifest;
  const capabilities = manifest?.capabilities ?? [];

  const [driverValues, setDriverValues] = useState<Record<string, unknown>>({});
  const [initialValues, setInitialValues] = useState<Record<string, unknown>>({});
  const [allowHardwareWrite, setAllowHardwareWrite] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [pendingChanges, setPendingChanges] = useState<readonly DriverChangeDifference[]>([]);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cargar estado inicial del driver
  useEffect(() => {
    if (!manifest?.id || !window.peripheralsHub) {
      return;
    }

    let isMounted = true;
    window.peripheralsHub
      .getDriverState(manifest.id)
      .then((state) => {
        if (!isMounted) return;
        if (state && state.values) {
          setDriverValues(state.values);
          setInitialValues(JSON.parse(JSON.stringify(state.values)));
          if (typeof state.values['allowHardwareWrite'] === 'boolean') {
            setAllowHardwareWrite(state.values['allowHardwareWrite']);
          }
        }
      })
      .catch((err) => {
        console.warn('[DeviceView] No se pudo leer estado inicial del driver:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [manifest?.id, device.id]);

  const handleValueChange = (capabilityId: string, val: unknown) => {
    setDriverValues((prev) => ({
      ...prev,
      [capabilityId]: val,
    }));
    setStatusMessage(null);
  };

  // Importar perfil desde captura JSON
  const handleImportCapture = async () => {
    if (!manifest?.id || !window.peripheralsHub) return;
    try {
      const imported = await window.peripheralsHub.importDriverCapture(manifest.id);
      if (imported && imported.keys) {
        setDriverValues((prev) => ({
          ...prev,
          keys: imported.keys,
          analogMatrix: imported.keys,
        }));
        setStatusMessage({
          type: 'success',
          text: `Perfil importado con exito (${imported.keys.length} teclas cargadas desde captura). Recuerda aplicar para guardarlo.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: `Error al importar captura: ${msg}` });
    }
  };

  // Solicitar preparacion de aplicacion y calculo de diferencias
  const handleOpenConfirm = async () => {
    if (!manifest?.id || !window.peripheralsHub) {
      return;
    }

    try {
      const payload = {
        keys: driverValues['analogMatrix'] ?? driverValues['keys'],
        allowHardwareWrite,
      };

      const plan = await window.peripheralsHub.prepareDriverApply(manifest.id, payload);
      setPendingChanges(plan.changes);
      setIsConfirmOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: `Error de validacion: ${msg}` });
    }
  };

  // Confirmar y aplicar en el driver
  const handleConfirmApply = async () => {
    if (!manifest?.id || !window.peripheralsHub) {
      return;
    }

    setIsApplying(true);
    try {
      const payload = {
        keys: driverValues['analogMatrix'] ?? driverValues['keys'],
        allowHardwareWrite,
        writeToHardware: allowHardwareWrite,
      };

      await window.peripheralsHub.applyDriverSettings(manifest.id, payload);
      setInitialValues(JSON.parse(JSON.stringify(driverValues)));
      setIsConfirmOpen(false);
      setStatusMessage({
        type: 'success',
        text: allowHardwareWrite
          ? 'Perfil guardado y transmitido al teclado con exito.'
          : 'Perfil guardado y validado localmente con exito (modo seguro).',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: `Fallo al aplicar: ${msg}` });
    } finally {
      setIsApplying(false);
    }
  };

  // Comparar si hay cambios sin guardar
  const hasUnsavedChanges = JSON.stringify(driverValues) !== JSON.stringify(initialValues);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono bg-accent/10 text-accent border border-accent/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Driver activo: {manifest?.id} (v{manifest?.version})
            </span>
            <span className="text-xs font-mono text-text-muted">
              {device.vendorIdHex}:{device.productIdHex}
            </span>
            <span className="text-xs font-mono text-text-muted uppercase px-1.5 py-0.2 rounded bg-surface-muted">
              {manifest?.category}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            {manifest?.name ?? device.product ?? 'Periferico'}
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Endpoint de control: {device.controlPath ? 'Enlazado' : 'No detectado'} (UsagePage: {manifest?.controlInterface.usagePage}, Usage: {manifest?.controlInterface.usage})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImportCapture}
            title="Cargar valores de teclas desde una captura JSON"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:border-accent hover:text-accent text-text-primary text-xs font-mono transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Importar Captura
          </button>

          <button
            type="button"
            onClick={() => onOpenInLab()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:border-accent hover:text-accent text-text-primary text-xs font-mono transition-colors cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5" />
            Modo Laboratorio
          </button>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleOpenConfirm}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs font-medium transition-colors cursor-pointer ${
                allowHardwareWrite
                  ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                  : 'bg-accent text-zinc-950 hover:bg-accent/90'
              }`}
            >
              {allowHardwareWrite ? <Send className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {allowHardwareWrite ? 'Guardar y Enviar al Teclado' : 'Guardar Perfil'}
            </button>
          )}
        </div>
      </div>

      {/* Banner de estado */}
      {statusMessage && (
        <div
          className={`p-3 rounded border text-xs font-mono flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-accent/10 border-accent/30 text-accent'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Identificacion de Origen de Datos y Opcion de Hardware */}
      <div className="p-3.5 rounded bg-surface-raised border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-text-primary uppercase tracking-wider">
              Perfil guardado en el hub
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-muted text-text-muted">
              No leido del teclado
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
            Los valores mostrados corresponden al perfil local almacenado en el hub. El teclado fisico no dispone de comandos de lectura de tablas documentados.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 md:border-l border-border-subtle pt-2 md:pt-0 md:pl-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-mono select-none">
            <input
              type="checkbox"
              checked={allowHardwareWrite}
              onChange={(e) => setAllowHardwareWrite(e.target.checked)}
              className="accent-accent w-4 h-4 rounded cursor-pointer"
            />
            <span className={allowHardwareWrite ? 'text-amber-400 font-bold' : 'text-text-secondary'}>
              {allowHardwareWrite ? 'Escritura real en hardware activa' : 'Modo seguro (escritura en hardware desactivada)'}
            </span>
          </label>
        </div>
      </div>

      {/* Capacidades declaradas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-accent" />
            Capacidades del Dispositivo ({capabilities.length})
          </h2>
          {hasUnsavedChanges && (
            <span className="text-xs font-mono text-amber-400">Hay modificaciones sin guardar</span>
          )}
        </div>

        {capabilities.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-surface-raised p-5 text-center space-y-2">
            <div className="inline-flex p-2 rounded-full bg-surface-base text-text-muted mb-1">
              <AlertTriangle className="w-5 h-5 text-text-muted" />
            </div>
            <h3 className="text-sm font-medium text-text-primary">Sin capacidades verificadas todavia</h3>
            <p className="text-xs text-text-secondary max-w-md mx-auto leading-relaxed">
              El manifest de este driver esta enlazado y listo, pero no tiene capacidades activas. Segun las reglas de seguridad, ninguna funcion se habilita hasta documentar sus paquetes USB en docs/protocol/.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {capabilities.map((cap) => {
              const val = driverValues[cap.id] ?? (cap.id === 'analogMatrix' ? driverValues['keys'] : undefined);
              return (
                <div key={cap.id} className={cap.primitive === 'key-matrix' ? 'w-full' : 'max-w-xl'}>
                  <DynamicControl
                    capability={cap}
                    value={val}
                    disabled={false}
                    onChange={(newVal) => handleValueChange(cap.id, newVal)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resumen de Endpoints del Dispositivo */}
      <div className="space-y-2 pt-4 border-t border-border-subtle">
        <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted">
          Endpoints USB Detectados ({device.endpoints.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
          {device.endpoints.map((ep, idx) => {
            const isControl = ep.path === device.controlPath;
            return (
              <div
                key={`${ep.path}-${idx}`}
                className={`p-2.5 rounded border ${
                  isControl ? 'border-accent/40 bg-accent/5' : 'border-border-subtle bg-surface-raised'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text-muted">Interface {ep.interface}</span>
                  {isControl && (
                    <span className="text-[10px] text-accent uppercase font-bold tracking-wider">
                      Canal de Control (UP 0xFF60, Usage 0x61)
                    </span>
                  )}
                </div>
                <div className="text-text-secondary text-[11px]">
                  UP: {ep.usagePageHex ?? 'N/A'} | Usage: {ep.usageHex ?? 'N/A'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Confirmacion y Diferencias */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-surface-raised border border-border-default shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="flex items-center justify-between border-b border-border-subtle p-4">
              <h3 className="text-sm font-semibold text-text-primary font-mono">
                Confirmacion de Aplicacion de Perfil
              </h3>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* Aviso critico obligatorio */}
              <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-semibold block">Aviso importante previo a aplicar:</strong>
                  <p className="text-amber-200/90 leading-relaxed">
                    Cierra por completo la pestana del driver web oficial antes de continuar. Tener ambas aplicaciones activas en paralelo causa interferencias criticas en la recepcion de paquetes de eco del teclado.
                  </p>
                </div>
              </div>

              {/* Modo de seguridad de hardware */}
              <div
                className={`p-3 rounded border text-xs font-mono leading-relaxed flex items-start gap-2.5 ${
                  allowHardwareWrite
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-surface-base border-border-subtle text-text-secondary'
                }`}
              >
                {allowHardwareWrite ? (
                  <Send className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                ) : (
                  <Shield className="w-4 h-4 shrink-0 text-accent mt-0.5" />
                )}
                <div>
                  {allowHardwareWrite ? (
                    <span>
                      Modo envio real activo: Los paquetes seran transmitidos secuencialmente al teclado fisico (33 bytes con report ID 0 via write()) y validados contra el eco devuelto de 32 bytes. Si un eco falla o vence el tiempo limite, abortara inmediatamente sin reintentos.
                    </span>
                  ) : (
                    <span>
                      Modo seguro activo: Los cambios seran validados y guardados en el perfil local sin emitir paquetes fisicos al teclado.
                    </span>
                  )}
                </div>
              </div>

              {/* Lista de cambios detectados */}
              <div>
                <h4 className="text-xs font-mono uppercase text-text-muted mb-2">
                  Diferencias Detectadas ({pendingChanges.length})
                </h4>

                {pendingChanges.length === 0 ? (
                  <p className="text-xs font-mono text-text-muted italic p-3 bg-surface-base rounded border border-border-subtle">
                    No se detectaron diferencias con respecto al perfil guardado actual.
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto rounded border border-border-subtle bg-surface-base divide-y divide-border-subtle">
                    {pendingChanges.map((change, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 text-xs font-mono">
                        <span className="text-text-primary">
                          <strong className="text-accent">{change.label}</strong> (idx {change.index}): {change.field}
                        </span>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-red-400 line-through">
                            {change.field.includes('Actuacion') || change.field.includes('Pulsar') || change.field.includes('Rearme')
                              ? `${(change.previous / 100).toFixed(2)}mm`
                              : change.previous}
                          </span>
                          <span className="text-text-muted">→</span>
                          <span className="text-accent font-bold">
                            {change.field.includes('Actuacion') || change.field.includes('Pulsar') || change.field.includes('Rearme')
                              ? `${(change.next / 100).toFixed(2)}mm`
                              : change.next}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Pie del Modal */}
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle p-4 bg-surface-base">
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                className="px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:border-border-subtle text-text-secondary text-xs font-mono transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isApplying || pendingChanges.length === 0}
                onClick={handleConfirmApply}
                className={`px-4 py-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                  allowHardwareWrite
                    ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                    : 'bg-accent text-zinc-950 hover:bg-accent/90'
                }`}
              >
                {isApplying
                  ? 'Procesando...'
                  : allowHardwareWrite
                  ? 'Confirmar, Guardar y Enviar al Teclado'
                  : 'Confirmar y Guardar Perfil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
