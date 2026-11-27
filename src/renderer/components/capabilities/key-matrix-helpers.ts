export interface KeyMatrixFieldValues {
  readonly actuationRaw: number;
  readonly rtEnabled: number;
  readonly rtPressRaw: number;
  readonly rtReleaseRaw: number;
}

export const DEFAULT_KEY_VALUES: KeyMatrixFieldValues = {
  actuationRaw: 150,
  rtEnabled: 0,
  rtPressRaw: 50,
  rtReleaseRaw: 50,
};

export type BatchFieldState =
  | { readonly kind: 'empty' }
  | { readonly kind: 'mixed' }
  | { readonly kind: 'value'; readonly value: number };

export type BatchSelectionState = Readonly<Record<string, BatchFieldState>>;

export function toKeyMatrixDict(val: unknown): Record<number, Record<string, number>> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<number, Record<string, number>>;
  }
  if (Array.isArray(val)) {
    return Object.fromEntries(val.map((v: Record<string, number>, idx: number) => [idx, v]));
  }
  return {};
}

export function resolveKeyLabelAt(
  idx: number,
  cols: number,
  rowLabels: readonly (readonly string[])[] = [],
  keyLabels?: readonly string[] | null
): string {
  if (Array.isArray(keyLabels) && typeof keyLabels[idx] === 'string' && keyLabels[idx]!.length > 0) {
    return keyLabels[idx]!;
  }
  const r = Math.floor(idx / cols);
  const c = idx % cols;
  return rowLabels[r]?.[c] ?? `Tecla ${idx}`;
}

export function isUnusedMatrixKey(label: string): boolean {
  return label.trim().toLowerCase() === 'sin usar';
}

export function getActiveMatrixIndices(
  totalKeys: number,
  cols: number,
  rowLabels: readonly (readonly string[])[] = [],
  keyLabels?: readonly string[] | null
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < totalKeys; i++) {
    const lbl = resolveKeyLabelAt(i, cols, rowLabels, keyLabels);
    if (!isUnusedMatrixKey(lbl)) {
      indices.push(i);
    }
  }
  return indices;
}

function getFallbackFieldValue(fieldId: string): number {
  if (fieldId === 'rtEnabled') return DEFAULT_KEY_VALUES.rtEnabled;
  if (fieldId === 'actuationRaw') return DEFAULT_KEY_VALUES.actuationRaw;
  if (fieldId === 'rtPressRaw') return DEFAULT_KEY_VALUES.rtPressRaw;
  if (fieldId === 'rtReleaseRaw') return DEFAULT_KEY_VALUES.rtReleaseRaw;
  return 0;
}

/**
 * Calcula el estado agregado del panel de edicion a partir de las teclas seleccionadas
 * y los valores reales presentes en la matriz.
 */
export function resolveSelectionBatchState(
  selectedIndices: ReadonlySet<number>,
  matrixState: Readonly<Record<number, Readonly<Record<string, number>>>>,
  fieldIds: readonly string[]
): BatchSelectionState {
  const result: Record<string, BatchFieldState> = {};

  if (selectedIndices.size === 0) {
    for (const id of fieldIds) {
      result[id] = { kind: 'empty' };
    }
    return result;
  }

  for (const id of fieldIds) {
    let commonValue: number | null = null;
    let isMixed = false;

    for (const idx of selectedIndices) {
      const entry = matrixState[idx];
      const raw = entry?.[id];
      const val = typeof raw === 'number' && !Number.isNaN(raw) ? raw : getFallbackFieldValue(id);

      if (commonValue === null) {
        commonValue = val;
      } else if (commonValue !== val) {
        isMixed = true;
        break;
      }
    }

    if (isMixed || commonValue === null) {
      result[id] = { kind: 'mixed' };
    } else {
      result[id] = { kind: 'value', value: commonValue };
    }
  }

  return result;
}

/**
 * Aplica al conjunto seleccionado solo los campos con valor definido (preservando valores
 * individuales en los campos marcados como 'mixed').
 */
export function applyBatchToMatrix(
  selectedIndices: ReadonlySet<number>,
  matrixState: Readonly<Record<number, Readonly<Record<string, number>>>>,
  batchState: BatchSelectionState,
  totalKeys: number,
  asArray: boolean
): unknown {
  const nextState: Record<number, Record<string, number>> = { ...matrixState };

  for (const idx of selectedIndices) {
    const current = nextState[idx] ?? { ...DEFAULT_KEY_VALUES };
    const updated: Record<string, number> = { ...current };

    for (const [fieldId, fieldState] of Object.entries(batchState)) {
      if (fieldState.kind === 'value') {
        updated[fieldId] = fieldState.value;
      }
    }

    nextState[idx] = updated;
  }

  if (asArray) {
    return Array.from({ length: totalKeys }, (_, i) => nextState[i] ?? { ...DEFAULT_KEY_VALUES });
  }
  return nextState;
}

export function isKeyCustomized(keyData: Readonly<Partial<KeyMatrixFieldValues>>): boolean {
  return (
    (keyData.actuationRaw ?? DEFAULT_KEY_VALUES.actuationRaw) !== DEFAULT_KEY_VALUES.actuationRaw ||
    (keyData.rtEnabled ?? DEFAULT_KEY_VALUES.rtEnabled) !== DEFAULT_KEY_VALUES.rtEnabled ||
    (keyData.rtPressRaw ?? DEFAULT_KEY_VALUES.rtPressRaw) !== DEFAULT_KEY_VALUES.rtPressRaw ||
    (keyData.rtReleaseRaw ?? DEFAULT_KEY_VALUES.rtReleaseRaw) !== DEFAULT_KEY_VALUES.rtReleaseRaw
  );
}
