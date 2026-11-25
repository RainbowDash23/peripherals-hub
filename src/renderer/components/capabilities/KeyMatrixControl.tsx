import React, { useState } from 'react';
import type { KeyMatrixControlSchema } from '../../../core/drivers/types.js';

export interface KeyMatrixValue {
  readonly [keyIndex: number]: {
    actuationRaw?: number;
    rtEnabled?: number;
    rtPressRaw?: number;
    rtReleaseRaw?: number;
    [fieldId: string]: unknown;
  };
}

interface KeyMatrixControlProps {
  readonly config: KeyMatrixControlSchema;
  readonly value: unknown;
  readonly savedValue?: unknown;
  readonly lastSentValue?: unknown;
  readonly onChange?: (value: unknown) => void;
  readonly disabled?: boolean;
}

export const KeyMatrixControl: React.FC<KeyMatrixControlProps> = ({
  config,
  value,
  savedValue,
  lastSentValue,
  onChange,
  disabled = false,
}) => {
  const { rows, cols, totalKeys, rowLabels = [], fields = [] } = config ?? {};
  const [viewMode, setViewMode] = useState<'actuation' | 'rapidTrigger'>('actuation');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set([29])); // Tecla A por defecto
  const [batchValues, setBatchValues] = useState<Record<string, number>>({
    actuationRaw: 150,
    rtEnabled: 0,
    rtPressRaw: 50,
    rtReleaseRaw: 50,
  });

  const toKeyDict = (val: unknown): Record<number, Record<string, number>> => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return val as Record<number, Record<string, number>>;
    }
    if (Array.isArray(val)) {
      return Object.fromEntries(val.map((v: Record<string, number>, idx: number) => [idx, v]));
    }
    return {};
  };

  const matrixState = toKeyDict(value);
  const savedMatrixState = toKeyDict(savedValue);
  const lastSentMatrixState = toKeyDict(lastSentValue);

  const toggleSelectKey = (idx: number, e: React.MouseEvent) => {
    if (disabled) return;
    if (e.shiftKey || e.ctrlKey) {
      const next = new Set(selectedIndices);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      setSelectedIndices(next);
    } else {
      setSelectedIndices(new Set([idx]));
    }
  };

  const selectAll = () => {
    if (disabled) return;
    const all = new Set<number>();
    for (let i = 0; i < totalKeys; i++) all.add(i);
    setSelectedIndices(all);
  };

  const clearSelection = () => {
    if (disabled) return;
    setSelectedIndices(new Set());
  };

  const handleApplyToSelected = () => {
    if (disabled || selectedIndices.size === 0) return;
    const nextState = { ...matrixState };

    for (const idx of selectedIndices) {
      const current = nextState[idx] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      nextState[idx] = {
        ...current,
        ...batchValues,
      };
    }

    // Si el valor inicial era un array, emitir array
    if (Array.isArray(value)) {
      const arr = Array.from({ length: totalKeys }, (_, i) => nextState[i] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 });
      onChange?.(arr);
    } else {
      onChange?.(nextState);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg bg-surface-raised border border-border-subtle">
      {/* Barra de Seleccion y Controles Rapidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-primary">
            Seleccionadas: <strong className="text-accent">{selectedIndices.size}</strong> de {totalKeys} teclas
          </span>
          <span className="text-xs text-text-muted">(Usa Shift/Ctrl para seleccion multiple)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Vista: Recorrido vs Rapid Trigger */}
          <div className="flex items-center gap-1 bg-surface-base p-0.5 rounded border border-border-default text-xs font-mono">
            <span className="px-2 text-text-muted text-[11px]">Ver:</span>
            <button
              type="button"
              onClick={() => setViewMode('actuation')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'actuation'
                  ? 'bg-accent/20 text-accent font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Recorrido
            </button>
            <button
              type="button"
              onClick={() => setViewMode('rapidTrigger')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'rapidTrigger'
                  ? 'bg-accent/20 text-accent font-medium'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Rapid Trigger
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={selectAll}
              className="px-2.5 py-1 rounded bg-surface-base border border-border-default hover:border-accent hover:text-accent text-xs font-mono text-text-secondary transition-colors cursor-pointer"
            >
              Seleccionar Todas
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={clearSelection}
              className="px-2.5 py-1 rounded bg-surface-base border border-border-default hover:border-border-subtle text-xs font-mono text-text-secondary transition-colors cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Matriz 5 x 14 */}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1.5 min-w-[720px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: totalKeys }, (_, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const rawLabel = rowLabels[r]?.[c] ?? `Tecla ${idx}`;
            const isUnidentified = /^Tecla\s+\d+$/i.test(rawLabel) || rawLabel.toLowerCase() === 'sin identificar';
            const keyLabel = isUnidentified ? `Tecla ${idx}` : rawLabel;
            const isSelected = selectedIndices.has(idx);

            const keyData = matrixState[idx] ?? {
              actuationRaw: 150,
              rtEnabled: 0,
              rtPressRaw: 50,
              rtReleaseRaw: 50,
            };

            const savedKeyData = savedMatrixState[idx];
            const isPending =
              savedKeyData !== undefined &&
              (keyData.actuationRaw !== savedKeyData.actuationRaw ||
                keyData.rtEnabled !== savedKeyData.rtEnabled ||
                keyData.rtPressRaw !== savedKeyData.rtPressRaw ||
                keyData.rtReleaseRaw !== savedKeyData.rtReleaseRaw);

            const isCustom = keyData.actuationRaw !== 150 || keyData.rtEnabled === 1;

            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                onClick={(e) => toggleSelectKey(idx, e)}
                title={`Tecla ${keyLabel} (idx ${idx})${isPending ? ' - Pendiente de aplicar' : ''}`}
                className={`flex flex-col items-center justify-between p-1.5 h-16 rounded border text-left font-mono transition-all cursor-pointer relative ${
                  isSelected
                    ? 'border-accent bg-accent/20 text-text-primary shadow-xs ring-1 ring-accent'
                    : isPending
                    ? 'border-amber-400/80 bg-amber-500/10 text-text-primary ring-1 ring-amber-400/40'
                    : isCustom
                    ? 'border-accent/40 bg-surface-base hover:border-accent/80 text-text-primary'
                    : 'border-border-subtle bg-surface-base/80 hover:border-border-default text-text-secondary'
                }`}
              >
                <div className="w-full flex items-center justify-between gap-1">
                  <span
                    className={`font-semibold whitespace-nowrap leading-none ${
                      keyLabel.length > 6 ? 'text-[9px]' : keyLabel.length > 4 ? 'text-[10px]' : 'text-[11px]'
                    }`}
                  >
                    {keyLabel}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isPending && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                        title="Cambio pendiente de aplicar"
                      />
                    )}
                    {!isUnidentified && (
                      <span className="text-[9px] text-text-muted leading-none shrink-0">{idx}</span>
                    )}
                  </div>
                </div>

                <div className="w-full text-[9px] tabular-nums truncate text-center">
                  {viewMode === 'actuation' ? (
                    <span>
                      {((keyData.actuationRaw ?? 150) / 100).toFixed(2)} mm
                      {keyData.rtEnabled === 1 && (
                        <span className="ml-1 text-accent font-bold">RT</span>
                      )}
                    </span>
                  ) : keyData.rtEnabled === 1 ? (
                    <span className="text-accent">
                      RT: ↓{((keyData.rtPressRaw ?? 50) / 100).toFixed(2)} ↑{((keyData.rtReleaseRaw ?? 50) / 100).toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-text-muted">RT OFF</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel de Edicion por Lote para Teclas Seleccionadas */}
      <div className="rounded border border-border-subtle bg-surface-base p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Configurar Valor para Teclas Seleccionadas ({selectedIndices.size})
          </span>
          <button
            type="button"
            disabled={disabled || selectedIndices.size === 0}
            onClick={handleApplyToSelected}
            className="px-3 py-1 rounded bg-accent/20 border border-accent/40 hover:bg-accent/30 text-accent text-xs font-mono font-medium transition-colors cursor-pointer disabled:opacity-40"
          >
            Asignar a Seleccionadas
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          {fields.map((f) => {
            const val = batchValues[f.id] ?? (f.id === 'rtEnabled' ? 0 : f.id === 'actuationRaw' ? 150 : 50);

            if (f.primitive === 'slider') {
              return (
                <div key={f.id} className="p-2.5 rounded bg-surface-raised border border-border-subtle space-y-1">
                  <div className="flex justify-between text-text-secondary">
                    <span>{f.label}</span>
                    <span className="text-text-primary font-bold">
                      {val} ({((val as number) / 100).toFixed(2)} mm)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={f.min ?? 10}
                    max={f.max ?? 400}
                    step={f.step ?? 1}
                    value={val}
                    disabled={disabled || selectedIndices.size === 0}
                    onChange={(e) =>
                      setBatchValues((prev) => ({ ...prev, [f.id]: Number(e.target.value) }))
                    }
                    className="w-full accent-accent bg-surface-muted h-1 rounded cursor-pointer"
                  />
                </div>
              );
            }

            if (f.primitive === 'toggle') {
              return (
                <div key={f.id} className="p-2.5 rounded bg-surface-raised border border-border-subtle flex items-center justify-between">
                  <span className="text-text-secondary">{f.label}</span>
                  <button
                    type="button"
                    disabled={disabled || selectedIndices.size === 0}
                    onClick={() =>
                      setBatchValues((prev) => ({ ...prev, [f.id]: prev[f.id] === 1 ? 0 : 1 }))
                    }
                    className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                      val === 1
                        ? 'bg-accent/20 border border-accent text-accent'
                        : 'bg-surface-base border border-border-default text-text-muted'
                    }`}
                  >
                    {val === 1 ? 'Habilitado' : 'Deshabilitado'}
                  </button>
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};
