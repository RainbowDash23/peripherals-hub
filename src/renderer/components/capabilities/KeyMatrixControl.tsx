import React, { useEffect, useMemo, useState } from 'react';
import type { KeyMatrixControlSchema } from '../../../core/drivers/types.js';
import {
  applyBatchToMatrix,
  DEFAULT_KEY_VALUES,
  getActiveMatrixIndices,
  isKeyCustomized,
  isUnusedMatrixKey,
  resolveKeyLabelAt,
  resolveSelectionBatchState,
  toKeyMatrixDict,
  type BatchFieldState,
  type BatchSelectionState,
} from './key-matrix-helpers.js';

interface PrecisionRangeFieldProps {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly fieldState: BatchFieldState;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

const PrecisionRangeField: React.FC<PrecisionRangeFieldProps> = ({
  label,
  min,
  max,
  step,
  fieldState,
  disabled,
  onChange,
}) => {
  const numericValue = fieldState.kind === 'value' ? fieldState.value : null;
  const [draftText, setDraftText] = useState<string>(numericValue !== null ? String(numericValue) : '');

  useEffect(() => {
    setDraftText(numericValue !== null ? String(numericValue) : '');
  }, [numericValue, fieldState.kind]);

  const clampValue = (next: number): number => Math.min(max, Math.max(min, Math.round(next)));

  const commitDraft = () => {
    const trimmed = draftText.trim();
    if (trimmed.length === 0) {
      setDraftText(numericValue !== null ? String(numericValue) : '');
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      setDraftText(numericValue !== null ? String(numericValue) : '');
      return;
    }
    const clamped = clampValue(parsed);
    onChange(clamped);
    setDraftText(String(clamped));
  };

  const badgeText =
    fieldState.kind === 'empty'
      ? '-'
      : fieldState.kind === 'mixed'
      ? 'Varios'
      : `${(fieldState.value / 100).toFixed(2)} mm`;

  return (
    <div
      className={`p-2.5 rounded bg-surface-raised border border-border-subtle space-y-2 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex justify-between items-center text-text-secondary gap-2">
        <span>{label}</span>
        <span
          className={`font-bold tabular-nums ${
            fieldState.kind === 'mixed'
              ? 'text-amber-300'
              : fieldState.kind === 'empty'
              ? 'text-text-muted font-normal'
              : 'text-text-primary'
          }`}
        >
          {badgeText}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numericValue ?? min}
        disabled={disabled}
        aria-label={label}
        aria-valuetext={fieldState.kind === 'mixed' ? 'Varios' : fieldState.kind === 'empty' ? 'Sin seleccion' : badgeText}
        onChange={(e) => onChange(clampValue(Number(e.target.value)))}
        className={`w-full accent-accent bg-surface-muted h-1 rounded cursor-pointer ${
          fieldState.kind !== 'value' ? 'opacity-40' : ''
        }`}
      />
      <div className="flex items-center justify-between gap-1.5 pt-0.5">
        <button
          type="button"
          disabled={disabled || numericValue === null || numericValue <= min}
          onClick={() => numericValue !== null && onChange(clampValue(numericValue - step))}
          title="Disminuir 0.01 mm"
          className="px-2 py-0.5 rounded bg-surface-base border border-border-default hover:border-accent text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
        >
          -
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={draftText}
            placeholder={fieldState.kind === 'mixed' ? 'Varios' : fieldState.kind === 'empty' ? '-' : ''}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value;
              setDraftText(raw);
              const parsed = Number.parseInt(raw, 10);
              if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
                onChange(parsed);
              }
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraft();
              }
            }}
            aria-label={`${label} en centesimas de milimetro`}
            className="w-16 px-1.5 py-0.5 rounded bg-surface-base border border-border-default text-center text-text-primary placeholder:text-text-muted tabular-nums focus:outline-none focus:border-accent disabled:cursor-not-allowed"
          />
          <span className="text-[10px] text-text-muted">cs mm</span>
        </div>
        <button
          type="button"
          disabled={disabled || numericValue === null || numericValue >= max}
          onClick={() => numericValue !== null && onChange(clampValue(numericValue + step))}
          title="Aumentar 0.01 mm"
          className="px-2 py-0.5 rounded bg-surface-base border border-border-default hover:border-accent text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
};

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
  readonly keyLabels?: readonly string[] | null;
  readonly onChange?: (value: unknown) => void;
  readonly disabled?: boolean;
}

export const KeyMatrixControl: React.FC<KeyMatrixControlProps> = ({
  config,
  value,
  savedValue,
  lastSentValue: _lastSentValue,
  keyLabels,
  onChange,
  disabled = false,
}) => {
  const { rows, cols, totalKeys, rowLabels = [], fields = [] } = config ?? {};
  const [viewMode, setViewMode] = useState<'actuation' | 'rapidTrigger'>('actuation');
  // Nunca preseleccionar teclas al iniciar ni restaurar seleccion previa
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set());

  const matrixState = useMemo(() => toKeyMatrixDict(value), [value]);
  const savedMatrixState = useMemo(() => toKeyMatrixDict(savedValue), [savedValue]);
  const fieldIds = useMemo(() => fields.map((f) => f.id), [fields]);

  const [batchState, setBatchState] = useState<BatchSelectionState>(() =>
    resolveSelectionBatchState(new Set(), {}, fieldIds)
  );

  // Sincronizar panel con los valores reales de las teclas seleccionadas al cambiar seleccion o perfil leido
  useEffect(() => {
    setBatchState(resolveSelectionBatchState(selectedIndices, matrixState, fieldIds));
  }, [selectedIndices, matrixState, fieldIds]);

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

  const activeIndices = useMemo(
    () => getActiveMatrixIndices(totalKeys, cols, rowLabels, keyLabels),
    [totalKeys, cols, rowLabels, keyLabels]
  );

  const selectAll = () => {
    if (disabled) return;
    setSelectedIndices(new Set(activeIndices));
  };

  const clearSelection = () => {
    if (disabled) return;
    setSelectedIndices(new Set());
  };

  const handleBatchFieldChange = (fieldId: string, nextValue: number) => {
    setBatchState((prev) => ({
      ...prev,
      [fieldId]: { kind: 'value', value: nextValue },
    }));
  };

  const hasConcreteBatchField = Object.values(batchState).some((s) => s.kind === 'value');

  const handleApplyToSelected = () => {
    if (disabled || selectedIndices.size === 0 || !hasConcreteBatchField) return;
    const nextMatrix = applyBatchToMatrix(
      selectedIndices,
      matrixState,
      batchState,
      totalKeys,
      Array.isArray(value)
    );
    onChange?.(nextMatrix);
  };

  const noSelection = selectedIndices.size === 0;
  const panelDisabled = disabled || noSelection;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg bg-surface-raised border border-border-subtle">
      {/* Barra de Seleccion y Controles Rapidos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-primary">
            Seleccionadas: <strong className="text-accent">{selectedIndices.size}</strong> de {activeIndices.length} teclas activas
          </span>
          <span className="text-xs text-text-muted">(Usa Shift/Ctrl para seleccion multiple)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Enfasis Visual: Recorrido vs Rapid Trigger */}
          <div className="flex items-center gap-1 bg-surface-base p-0.5 rounded border border-border-default text-xs font-mono">
            <span className="px-2 text-text-muted text-[11px]">Destacar:</span>
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
              className="px-2.5 py-1 rounded bg-surface-base border border-border-default hover:border-accent hover:text-accent text-xs font-mono text-text-secondary transition-colors cursor-pointer disabled:opacity-40"
            >
              Seleccionar Todas
            </button>
            <button
              type="button"
              disabled={disabled || noSelection}
              onClick={clearSelection}
              className="px-2.5 py-1 rounded bg-surface-base border border-border-default hover:border-border-subtle text-xs font-mono text-text-secondary transition-colors cursor-pointer disabled:opacity-40"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      <p className="text-[11px] font-mono text-text-muted">
        Cada tecla muestra su recorrido de actuacion (mm), estado de Rapid Trigger (ON/OFF) y sensibilidades al pulsar (↓) y al soltar (↑), atenuadas cuando RT esta apagado.
      </p>

      {/* Matriz 5 x 14 */}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid gap-1.5 min-w-[880px]"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: totalKeys }, (_, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const rawLabel = resolveKeyLabelAt(idx, cols, rowLabels, keyLabels);
            const isUnused = isUnusedMatrixKey(rawLabel);
            const isUnidentified = /^Tecla\s+\d+$/i.test(rawLabel) || rawLabel.toLowerCase() === 'sin identificar';
            const keyLabel = isUnidentified ? `Tecla ${idx}` : rawLabel;
            const isSpecialKey =
              !isUnused && ((r === rows - 1 && c === cols - 1) || keyLabel === 'Fn' || keyLabel.startsWith('Esp_'));
            const isSelected = selectedIndices.has(idx);

            const keyData = matrixState[idx] ?? DEFAULT_KEY_VALUES;
            const actuationRaw = keyData['actuationRaw'] ?? DEFAULT_KEY_VALUES.actuationRaw;
            const rtEnabled = keyData['rtEnabled'] ?? DEFAULT_KEY_VALUES.rtEnabled;
            const rtPressRaw = keyData['rtPressRaw'] ?? DEFAULT_KEY_VALUES.rtPressRaw;
            const rtReleaseRaw = keyData['rtReleaseRaw'] ?? DEFAULT_KEY_VALUES.rtReleaseRaw;
            const isRtOn = rtEnabled === 1;

            const savedKeyData = savedMatrixState[idx];
            const isPending =
              !isUnused &&
              savedKeyData !== undefined &&
              (actuationRaw !== savedKeyData['actuationRaw'] ||
                rtEnabled !== savedKeyData['rtEnabled'] ||
                rtPressRaw !== savedKeyData['rtPressRaw'] ||
                rtReleaseRaw !== savedKeyData['rtReleaseRaw']);

            const isCustom = !isUnused && isKeyCustomized(keyData);

            return (
              <button
                key={idx}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                onClick={(e) => toggleSelectKey(idx, e)}
                title={
                  isUnused
                    ? `Posicion sin switch en layout ANSI (idx ${idx})`
                    : `${isSpecialKey ? 'Tecla especial' : 'Tecla'} ${keyLabel} (idx ${idx}): Act ${(actuationRaw / 100).toFixed(2)} mm, RT ${isRtOn ? 'ON' : 'OFF'}, Pulsar ${(rtPressRaw / 100).toFixed(2)} mm, Soltar ${(rtReleaseRaw / 100).toFixed(2)} mm${isPending ? ' - Pendiente de aplicar' : ''}`
                }
                className={`flex flex-col items-stretch justify-between p-1.5 h-20 rounded border text-left font-mono transition-all cursor-pointer relative ${
                  isSelected
                    ? 'border-accent bg-accent/20 text-text-primary shadow-xs ring-1 ring-accent'
                    : isUnused
                    ? 'border-dashed border-border-subtle/50 bg-surface-base/30 text-text-muted/60 hover:border-border-subtle'
                    : isPending
                    ? 'border-amber-400/80 bg-amber-500/10 text-text-primary ring-1 ring-amber-400/40'
                    : isSpecialKey
                    ? 'border-sky-500/40 bg-sky-500/5 hover:border-sky-400/70 text-text-primary'
                    : isCustom
                    ? 'border-accent/40 bg-surface-base hover:border-accent/80 text-text-primary'
                    : 'border-border-subtle bg-surface-base/80 hover:border-border-default text-text-secondary'
                }`}
              >
                {/* Fila superior: Etiqueta + Metadatos */}
                <div className="w-full flex items-center justify-between gap-1">
                  <span
                    className={`font-semibold whitespace-nowrap leading-none ${
                      isUnused
                        ? 'text-[9px] font-normal'
                        : keyLabel.length > 6
                        ? 'text-[9px]'
                        : keyLabel.length > 4
                        ? 'text-[10px]'
                        : 'text-[11px]'
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
                    {isSpecialKey && (
                      <span className="text-[8px] px-1 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 leading-tight">
                        ESP
                      </span>
                    )}
                    {!isUnidentified && (
                      <span className="text-[9px] text-text-muted leading-none shrink-0">{idx}</span>
                    )}
                  </div>
                </div>

                {/* Cuerpo compacto con los 3 valores + estado RT */}
                {isUnused ? (
                  <div className="w-full text-[9px] text-center text-text-muted/50 my-auto">-</div>
                ) : (
                  <div className="w-full flex flex-col items-center gap-0.5 tabular-nums leading-tight">
                    <span
                      className={
                        viewMode === 'actuation'
                          ? 'text-[10px] font-bold text-accent'
                          : 'text-[9px] font-normal text-text-muted'
                      }
                    >
                      {(actuationRaw / 100).toFixed(2)} mm
                    </span>

                    <span
                      className={`px-1 rounded text-[8px] border leading-tight ${
                        isRtOn
                          ? viewMode === 'rapidTrigger'
                            ? 'bg-accent/25 text-accent border-accent/60 font-bold'
                            : 'bg-accent/15 text-accent/90 border-accent/30 font-semibold'
                          : viewMode === 'rapidTrigger'
                          ? 'bg-surface-muted/60 text-text-secondary border-border-default'
                          : 'bg-surface-muted/30 text-text-muted/70 border-border-subtle/50'
                      }`}
                    >
                      {isRtOn ? 'RT ON' : 'RT OFF'}
                    </span>

                    <span
                      className={`text-[8.5px] whitespace-nowrap ${
                        isRtOn
                          ? viewMode === 'rapidTrigger'
                            ? 'text-accent font-semibold'
                            : 'text-text-secondary font-medium'
                          : viewMode === 'rapidTrigger'
                          ? 'text-text-muted/75'
                          : 'text-text-muted/50'
                      }`}
                    >
                      ↓{(rtPressRaw / 100).toFixed(2)} ↑{(rtReleaseRaw / 100).toFixed(2)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel de Edicion por Lote para Teclas Seleccionadas */}
      <div
        aria-disabled={panelDisabled}
        className={`rounded border border-border-subtle bg-surface-base p-3.5 space-y-3 transition-opacity ${
          noSelection ? 'opacity-75' : ''
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-text-muted">
            Configurar Valor para Teclas Seleccionadas ({selectedIndices.size})
          </span>
          <button
            type="button"
            disabled={panelDisabled || !hasConcreteBatchField}
            onClick={handleApplyToSelected}
            className="px-3 py-1 rounded bg-accent/20 border border-accent/40 hover:bg-accent/30 text-accent text-xs font-mono font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Asignar a Seleccionadas
          </button>
        </div>

        {noSelection && (
          <p className="text-xs font-mono text-text-muted">
            Ninguna tecla seleccionada. Haz clic en una o varias teclas de la matriz para inspeccionar o editar sus valores reales.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          {fields.map((f) => {
            const fieldState: BatchFieldState = batchState[f.id] ?? { kind: 'empty' };

            if (f.primitive === 'slider') {
              const minVal = f.min ?? (f.id === 'actuationRaw' ? 10 : 2);
              const maxVal = f.max ?? 400;
              const stepVal = f.step ?? 1;

              return (
                <PrecisionRangeField
                  key={f.id}
                  label={f.label}
                  min={minVal}
                  max={maxVal}
                  step={stepVal}
                  fieldState={fieldState}
                  disabled={panelDisabled}
                  onChange={(nextVal) => handleBatchFieldChange(f.id, nextVal)}
                />
              );
            }

            if (f.primitive === 'toggle') {
              const toggleLabel =
                fieldState.kind === 'empty'
                  ? '-'
                  : fieldState.kind === 'mixed'
                  ? 'Varios'
                  : fieldState.value === 1
                  ? 'Habilitado'
                  : 'Deshabilitado';

              return (
                <div
                  key={f.id}
                  className={`p-2.5 rounded bg-surface-raised border border-border-subtle flex items-center justify-between ${
                    panelDisabled ? 'opacity-60' : ''
                  }`}
                >
                  <span className="text-text-secondary">{f.label}</span>
                  <button
                    type="button"
                    disabled={panelDisabled}
                    onClick={() => {
                      const nextToggle = fieldState.kind === 'value' && fieldState.value === 1 ? 0 : 1;
                      handleBatchFieldChange(f.id, nextToggle);
                    }}
                    className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      fieldState.kind === 'mixed'
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                        : fieldState.kind === 'value' && fieldState.value === 1
                        ? 'bg-accent/20 border border-accent text-accent'
                        : 'bg-surface-base border border-border-default text-text-muted'
                    }`}
                  >
                    {toggleLabel}
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
