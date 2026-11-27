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
  FileUp,
  RefreshCw,
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
  const [lastSentValues, setLastSentValues] = useState<Record<string, unknown>>({});
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [allowHardwareWrite, setAllowHardwareWrite] = useState<boolean>(false);
  const [hasHardwareRead, setHasHardwareRead] = useState<boolean>(false);
  const [isReadingHardware, setIsReadingHardware] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [pendingChanges, setPendingChanges] = useState<readonly DriverChangeDifference[]>([]);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const formatTime = (ts: number): string => {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const formatDateTime = (ts: number): string => {
    const d = new Date(ts);
    const dd = d.getDate().toString().padStart(2, '0');
    const mo = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mo}/${yyyy} ${formatTime(ts)}`;
  };

  const applyHardwareStateToView = (values: Record<string, unknown>, announce: boolean) => {
    setDriverValues(values);
    setInitialValues(JSON.parse(JSON.stringify(values)));
    setHasHardwareRead(true);

    if (typeof values['lastSentToHardwareAt'] === 'number') {
      setLastSentAt(values['lastSentToHardwareAt']);
      setLastSentValues(JSON.parse(JSON.stringify(values)));
    }

    if (announce) {
      const readTs = typeof values['readAt'] === 'number' ? values['readAt'] : Date.now();
      const ver = typeof values['protocolVersion'] === 'string' ? `v${values['protocolVersion']}` : '';
      const db = values['deadBand'] as { topRaw?: number; bottomRaw?: number } | null | undefined;
      const dbDesc =
        db && typeof db.topRaw === 'number' && typeof db.bottomRaw === 'number'
          ? `, zona muerta ${(db.topRaw / 100).toFixed(2)}/${(db.bottomRaw / 100).toFixed(2)} mm`
          : '';
      setStatusMessage({
        type: 'success',
        text: `Configuracion leida del teclado a las ${formatTime(readTs)}${ver ? ` (${ver}${dbDesc})` : ''}.`,
      });
    }
  };

  // Cargar estado inicial del driver y ejecutar lectura automatica al abrir el dispositivo
  useEffect(() => {
    if (!manifest?.id || !window.peripheralsHub) {
      return;
    }

    let isMounted = true;
    window.peripheralsHub
      .getDriverState(manifest.id)
      .then(async (state) => {
        if (!isMounted) return;
        let alreadyRead = false;
        if (state && state.values) {
          setDriverValues(state.values);
          setInitialValues(JSON.parse(JSON.stringify(state.values)));
          alreadyRead = state.values['hasHardwareRead'] === true;
          setHasHardwareRead(alreadyRead);
          // allowHardwareWrite siempre desactivada por defecto al iniciar la app
          setAllowHardwareWrite(false);
          if (typeof state.values['lastSentToHardwareAt'] === 'number') {
            setLastSentAt(state.values['lastSentToHardwareAt']);
            setLastSentValues(JSON.parse(JSON.stringify(state.values)));
          } else {
            setLastSentAt(null);
            setLastSentValues({});
          }
        }

        if (manifest.id === 'mad60he' && device.controlPath && !alreadyRead) {
          setIsReadingHardware(true);
          try {
            const hwState = await window.peripheralsHub!.readHardwareProfile(manifest.id);
            if (!isMounted) return;
            if (hwState && hwState.values) {
              applyHardwareStateToView(hwState.values, true);
            }
          } catch (readErr: unknown) {
            if (!isMounted) return;
            const msg = readErr instanceof Error ? readErr.message : String(readErr);
            setHasHardwareRead(false);
            setAllowHardwareWrite(false);
            setStatusMessage({
              type: 'error',
              text: `No se pudo leer automaticamente del teclado: ${msg}. Cierra la web oficial si esta abierta y pulsa "Leer del teclado".`,
            });
          } finally {
            if (isMounted) {
              setIsReadingHardware(false);
            }
          }
        }
      })
      .catch((err) => {
        console.warn('[DeviceView] No se pudo leer estado inicial del driver:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [manifest?.id, device.id, device.controlPath]);

  // Lectura manual del estado real del teclado (sin requerir interruptor de escritura)
  const handleReadFromKeyboard = async () => {
    if (!manifest?.id || !window.peripheralsHub) return;
    setIsReadingHardware(true);
    setStatusMessage(null);
    try {
      const hwState = await window.peripheralsHub.readHardwareProfile(manifest.id);
      if (hwState && hwState.values) {
        applyHardwareStateToView(hwState.values, true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({
        type: 'error',
        text: `Error al leer del teclado: ${msg}. Si la web del fabricante esta abierta, cierrala y vuelve a intentar.`,
      });
    } finally {
      setIsReadingHardware(false);
    }
  };

  const handleValueChange = (capabilityId: string, val: unknown) => {
    setDriverValues((prev) => ({
      ...prev,
      [capabilityId]: val,
      ...(capabilityId === 'analogMatrix' ? { keys: val } : {}),
      ...(capabilityId === 'keys' ? { analogMatrix: val } : {}),
    }));
    setStatusMessage(null);
  };

  // Importar perfil desde captura JSON
  const handleImportCapture = async () => {
    if (!manifest?.id || !window.peripheralsHub) return;
    try {
      const imported = await window.peripheralsHub.importDriverCapture(manifest.id);
      if (imported && imported.keys) {
        const now = imported.importedAt ?? Date.now();
        setDriverValues((prev) => ({
          ...prev,
          keys: imported.keys,
          analogMatrix: imported.keys,
          source: 'capture',
          importedAt: now,
          importedFileName: null,
        }));
        const summaryDesc = imported.summary?.description ?? `${imported.keys.length} teclas`;
        setStatusMessage({
          type: 'success',
          text: `Captura importada con exito -> ${summaryDesc}. Recuerda guardar o aplicar al teclado para confirmar los cambios.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: `Error al importar captura: ${msg}` });
    }
  };

  // Importar exportacion oficial .mad-keyboard-config (solo carga local en borrador, nunca escribe al hardware)
  const handleImportKeyboardConfig = async () => {
    if (!manifest?.id || !window.peripheralsHub) return;
    try {
      const imported = await window.peripheralsHub.importKeyboardConfig(manifest.id);
      if (imported && imported.keys) {
        setDriverValues((prev) => ({
          ...prev,
          keys: imported.keys,
          analogMatrix: imported.keys,
          keyLabels: imported.keyLabels,
          source: imported.source,
          importedAt: imported.importedAt,
          importedFileName: imported.importedFileName,
          protocolVersion: imported.protocolVersion,
          deadBand: imported.deadBand,
          profileName: imported.name,
        }));
        setStatusMessage({
          type: 'success',
          text: `Archivo importado (${imported.importedFileName}): ${imported.summary.description}. Perfil cargado en borrador sin enviar al teclado.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage({ type: 'error', text: `Error al importar configuracion: ${msg}` });
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
        keyLabels: driverValues['keyLabels'],
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
        keyLabels: driverValues['keyLabels'],
        source: driverValues['source'],
        importedAt: driverValues['importedAt'],
        readAt: driverValues['readAt'],
        importedFileName: driverValues['importedFileName'],
        protocolVersion: driverValues['protocolVersion'],
        deadBand: driverValues['deadBand'],
        profileName: driverValues['profileName'],
        allowHardwareWrite: hasHardwareRead && allowHardwareWrite,
        writeToHardware: hasHardwareRead && allowHardwareWrite,
      };

      const res = await window.peripheralsHub.applyDriverSettings(manifest.id, payload);
      setInitialValues(JSON.parse(JSON.stringify(driverValues)));
      setIsConfirmOpen(false);

      if (res.hardwareWritten) {
        setLastSentAt(res.appliedAt);
        setLastSentValues(JSON.parse(JSON.stringify(driverValues)));
        const t13Info = res.transmission ? `${res.transmission.table13ChunksSent}/${res.transmission.table13TotalChunks} trozos de Tabla 13` : '';
        const t14Info = res.transmission ? `${res.transmission.table14ChunksSent}/${res.transmission.table14TotalChunks} trozos de Tabla 14` : '';
        setStatusMessage({
          type: 'success',
          text: `Cambios aplicados y confirmados por eco: ${t13Info} y ${t14Info} enviados al teclado a las ${formatTime(res.appliedAt)}.`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Perfil guardado con exito en el hub (solo local, sin transmision al teclado).',
        });
      }
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

        <div className="flex flex-wrap items-center gap-2">
          {manifest?.id === 'mad60he' && (
            <>
              <button
                type="button"
                disabled={!device.controlPath || isReadingHardware || isApplying}
                onClick={handleReadFromKeyboard}
                title="Leer configuracion actual directamente del teclado (sin escribir)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:border-accent hover:text-accent text-text-primary text-xs font-mono transition-colors cursor-pointer disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReadingHardware ? 'animate-spin text-accent' : ''}`} />
                {isReadingHardware ? 'Leyendo del teclado...' : 'Leer del teclado'}
              </button>

              <button
                type="button"
                disabled={isReadingHardware || isApplying}
                onClick={handleImportKeyboardConfig}
                title="Cargar archivo .mad-keyboard-config exportado del driver web oficial"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-raised border border-border-default hover:border-accent hover:text-accent text-text-primary text-xs font-mono transition-colors cursor-pointer disabled:opacity-40"
              >
                <FileUp className="w-3.5 h-3.5" />
                Importar configuracion del teclado
              </button>
            </>
          )}

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
              {allowHardwareWrite
                ? 'Guardar en hub y escribir al teclado'
                : 'Guardar solo en hub (sin escribir)'}
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

      {/* Identificacion de Origen de Datos, Estado Persistente y Opcion de Hardware */}
      <div className="p-3.5 rounded bg-surface-raised border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono font-medium text-text-primary uppercase tracking-wider">
              Estado del Perfil:
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-mono font-medium border flex items-center gap-1.5 ${
                lastSentAt
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-surface-muted text-text-secondary border-border-default'
              }`}
            >
              <Shield className="w-3 h-3" />
              {lastSentAt ? `enviado al teclado a las ${formatTime(lastSentAt)}` : 'solo guardado en el hub'}
            </span>
            {driverValues['source'] === 'keyboard' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Origen: leído del teclado
                {typeof driverValues['readAt'] === 'number'
                  ? ` (${formatDateTime(driverValues['readAt'] as number)})`
                  : ''}
              </span>
            )}
            {driverValues['source'] === 'imported-file' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-500/15 text-sky-300 border border-sky-500/30">
                Origen: importado de archivo
                {typeof driverValues['importedAt'] === 'number'
                  ? ` (${formatDateTime(driverValues['importedAt'] as number)})`
                  : ''}
              </span>
            )}
            {driverValues['source'] === 'capture' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-base text-text-secondary border border-border-default">
                Origen: captura JSON
                {typeof driverValues['importedAt'] === 'number'
                  ? ` (${formatDateTime(driverValues['importedAt'] as number)})`
                  : ''}
              </span>
            )}
            {(!driverValues['source'] || driverValues['source'] === 'default') && (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base text-text-muted border border-border-subtle">
                Origen: perfil local del hub
              </span>
            )}
            {hasUnsavedChanges ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Borrador con cambios pendientes
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-base text-text-muted border border-border-subtle">
                Sin cambios pendientes
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary leading-relaxed max-w-2xl">
            {lastSentAt
              ? `El perfil fue transmitido y verificado por eco en el teclado a las ${formatTime(lastSentAt)}. Las modificaciones posteriores permanecen en borrador hasta volver a guardar o aplicar.`
              : 'El perfil actual reside exclusivamente en el hub. Ninguna configuracion se envia al teclado sin confirmacion explicita.'}
            {driverValues['source'] === 'imported-file' && typeof driverValues['importedFileName'] === 'string'
              ? ` Archivo cargado: ${driverValues['importedFileName']}${
                  typeof driverValues['protocolVersion'] === 'string'
                    ? ` (protocolo v${driverValues['protocolVersion']})`
                    : ''
                }.`
              : ''}
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 border-t md:border-t-0 md:border-l border-border-subtle pt-3 md:pt-0 md:pl-4">
          <button
            type="button"
            role="switch"
            aria-checked={allowHardwareWrite}
            disabled={!hasHardwareRead || isReadingHardware}
            onClick={() => {
              if (!hasHardwareRead) return;
              setAllowHardwareWrite((prev) => !prev);
            }}
            title={
              hasHardwareRead
                ? 'Habilitar o deshabilitar el envio real al teclado'
                : 'Lee primero el estado actual del teclado antes de habilitar escrituras'
            }
            className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded border text-xs font-mono font-medium transition-all select-none ${
              !hasHardwareRead || isReadingHardware
                ? 'bg-surface-base border-border-subtle text-zinc-500 opacity-60 cursor-not-allowed'
                : allowHardwareWrite
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25 cursor-pointer'
                : 'bg-surface-base border-border-default text-zinc-400 hover:border-border-subtle hover:text-text-secondary cursor-pointer'
            }`}
          >
            <div
              className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors ${
                allowHardwareWrite && hasHardwareRead ? 'bg-amber-400' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`bg-zinc-950 w-3 h-3 rounded-full shadow-xs transform transition-transform ${
                  allowHardwareWrite && hasHardwareRead ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </div>
            <span>
              Escritura al teclado:{' '}
              <strong
                className={
                  allowHardwareWrite && hasHardwareRead ? 'text-amber-400 font-bold' : 'text-zinc-300 font-normal'
                }
              >
                {allowHardwareWrite && hasHardwareRead ? 'ACTIVADA' : 'DESACTIVADA'}
              </strong>
            </span>
          </button>
          {manifest?.id === 'mad60he' && !hasHardwareRead && (
            <span className="text-[11px] font-mono text-amber-300/90 max-w-xs md:text-right leading-snug">
              Envio bloqueado: lee primero el teclado con &quot;Leer del teclado&quot; para sincronizar el estado real antes de escribir.
            </span>
          )}
        </div>
      </div>

      {/* Capacidades declaradas */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-accent" />
            Capacidades del Dispositivo ({capabilities.length})
          </h2>
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
              const savedVal = initialValues[cap.id] ?? (cap.id === 'analogMatrix' ? initialValues['keys'] : undefined);
              const lastSentVal = lastSentValues[cap.id] ?? (cap.id === 'analogMatrix' ? lastSentValues['keys'] : undefined);
              return (
                <div key={cap.id} className={cap.primitive === 'key-matrix' ? 'w-full' : 'max-w-xl'}>
                  <DynamicControl
                    capability={cap}
                    value={val}
                    savedValue={savedVal}
                    lastSentValue={lastSentVal}
                    keyLabels={Array.isArray(driverValues['keyLabels']) ? (driverValues['keyLabels'] as string[]) : null}
                    disabled={isApplying || isReadingHardware}
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
                  ? 'Confirmar: Guardar en hub y escribir al teclado'
                  : 'Confirmar: Guardar solo en hub (sin escribir)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
