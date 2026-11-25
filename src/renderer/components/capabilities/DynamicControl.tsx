import React from 'react';
import type { CapabilityDescriptor } from '../../../core/drivers/types.js';
import { KeyMatrixControl } from './KeyMatrixControl.js';

interface DynamicControlProps {
  readonly capability: CapabilityDescriptor;
  readonly value: unknown;
  readonly savedValue?: unknown;
  readonly lastSentValue?: unknown;
  readonly onChange?: (value: unknown) => void;
  readonly disabled?: boolean;
}

export const DynamicControl: React.FC<DynamicControlProps> = ({
  capability,
  value,
  savedValue,
  lastSentValue,
  onChange,
  disabled = false,
}) => {
  const { primitive, label, description, config } = capability;

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded bg-surface-raised border border-border-subtle">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-text-primary">{label}</label>
        {capability.preset && (
          <span className="text-xs font-mono uppercase px-1.5 py-0.5 rounded bg-surface-muted text-text-muted">
            {capability.preset}
          </span>
        )}
      </div>

      {description && <p className="text-xs text-text-secondary">{description}</p>}

      <div className="mt-1">
        {primitive === 'slider' && (
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={(config as { min?: number })?.min ?? 0}
              max={(config as { max?: number })?.max ?? 100}
              step={(config as { step?: number })?.step ?? 1}
              value={typeof value === 'number' ? value : ((config as { min?: number })?.min ?? 0)}
              disabled={disabled}
              onChange={(e) => onChange?.(Number(e.target.value))}
              className="flex-1 accent-accent bg-surface-muted h-1.5 rounded cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-text-primary min-w-[3rem] text-right">
              {String(value ?? 0)} {(config as { unit?: string })?.unit ?? ''}
            </span>
          </div>
        )}

        {primitive === 'select' && (
          <select
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
            className="w-full text-xs font-mono bg-surface-base border border-border-default rounded px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-accent"
          >
            {((config as { options?: Array<{ label: string; value: string | number }> })?.options ?? []).map((opt) => (
              <option key={String(opt.value)} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {primitive === 'toggle' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(!value)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                value ? 'bg-accent' : 'bg-surface-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  value ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs text-text-secondary font-mono">
              {value
                ? (config as { onLabel?: string })?.onLabel ?? 'Activo'
                : (config as { offLabel?: string })?.offLabel ?? 'Inactivo'}
            </span>
          </div>
        )}

        {primitive === 'color' && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={typeof value === 'string' && value.startsWith('#') ? value : '#10b981'}
              disabled={disabled}
              onChange={(e) => onChange?.(e.target.value)}
              className="w-8 h-8 rounded border border-border-default bg-transparent cursor-pointer"
            />
            <span className="text-xs font-mono text-text-secondary">{String(value ?? '#10b981')}</span>
          </div>
        )}

        {primitive === 'readonly' && (
          <div className="text-xs font-mono tabular-nums text-text-primary bg-surface-base px-2.5 py-1.5 rounded border border-border-subtle inline-block">
            {String(value ?? 'N/A')} {(config as { unit?: string })?.unit ?? ''}
          </div>
        )}

        {primitive === 'key-matrix' && config && (
          <KeyMatrixControl
            config={config as import('../../../core/drivers/types.js').KeyMatrixControlSchema}
            value={value}
            savedValue={savedValue}
            lastSentValue={lastSentValue}
            disabled={disabled}
            onChange={onChange}
          />
        )}
      </div>
    </div>
  );
};
