import { MATRIX_COLS, MATRIX_ROWS, TOTAL_USEFUL_KEYS } from './profile.js';

export interface KeyboardActionEntry {
  readonly keyClass: number;
  readonly keyId: number;
}

export const UNUSED_KEY_LABEL = 'Sin usar';

/**
 * Tabla estandar USB HID Usage Page 0x07 (keyClass = 0) usada en keyboardAction del MAD60HE.
 */
const HID_KEYCODE_LABELS: Readonly<Record<number, string>> = {
  0: UNUSED_KEY_LABEL,
  4: 'A',
  5: 'B',
  6: 'C',
  7: 'D',
  8: 'E',
  9: 'F',
  10: 'G',
  11: 'H',
  12: 'I',
  13: 'J',
  14: 'K',
  15: 'L',
  16: 'M',
  17: 'N',
  18: 'O',
  19: 'P',
  20: 'Q',
  21: 'R',
  22: 'S',
  23: 'T',
  24: 'U',
  25: 'V',
  26: 'W',
  27: 'X',
  28: 'Y',
  29: 'Z',
  30: '1',
  31: '2',
  32: '3',
  33: '4',
  34: '5',
  35: '6',
  36: '7',
  37: '8',
  38: '9',
  39: '0',
  40: 'Enter',
  41: 'Esc',
  42: 'Backspace',
  43: 'Tab',
  44: 'Space',
  45: '-',
  46: '=',
  47: '[',
  48: ']',
  49: '\\',
  50: 'ISO#',
  51: ';',
  52: "'",
  53: '`',
  54: ',',
  55: '.',
  56: '/',
  57: 'Caps',
  58: 'F1',
  59: 'F2',
  60: 'F3',
  61: 'F4',
  62: 'F5',
  63: 'F6',
  64: 'F7',
  65: 'F8',
  66: 'F9',
  67: 'F10',
  68: 'F11',
  69: 'F12',
  70: 'PrtSc',
  71: 'ScrLk',
  72: 'Pause',
  73: 'Ins',
  74: 'Home',
  75: 'PgUp',
  76: 'Del',
  77: 'End',
  78: 'PgDn',
  79: 'Right',
  80: 'Left',
  81: 'Down',
  82: 'Up',
  100: 'ISO\\',
  101: 'Menu',
  224: 'LCtrl',
  225: 'LShift',
  226: 'LAlt',
  227: 'Win',
  228: 'RCtrl',
  229: 'RShift',
  230: 'RAlt',
  231: 'RWin',
};

/**
 * Resuelve la etiqueta visible para una entrada de keyboardAction del MAD60HE.
 * keyClass = 0 corresponde a codigos HID estandar; keyClass = 82 corresponde a tecla de capa (Fn).
 */
export function resolveKeyLabel(entry: KeyboardActionEntry): string {
  if (entry.keyClass === 0) {
    return HID_KEYCODE_LABELS[entry.keyId] ?? `KC_${entry.keyId.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  if (entry.keyClass === 82) {
    return 'Fn';
  }
  return `Esp_${entry.keyClass}_${entry.keyId}`;
}

/**
 * Etiquetas por defecto verificadas segun el layout fisico ANSI 60% del MAD60HE
 * y la capa 0 de keyboardAction (Enter en indice 41; 40, 43, 54 y huecos de fila 4 sin usar).
 */
export const DEFAULT_MAD60HE_ROW_LABELS: readonly (readonly string[])[] = [
  ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", UNUSED_KEY_LABEL, 'Enter'],
  ['LShift', UNUSED_KEY_LABEL, 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', UNUSED_KEY_LABEL, 'RShift'],
  ['LCtrl', 'Win', 'LAlt', UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, 'Space', UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, 'RAlt', 'Menu', 'RCtrl', 'Fn'],
];

export const DEFAULT_MAD60HE_KEY_LABELS: readonly string[] = DEFAULT_MAD60HE_ROW_LABELS.flat();

export function isUnusedKeySlot(label: string): boolean {
  return label.trim().toLowerCase() === UNUSED_KEY_LABEL.toLowerCase();
}

export function extractLayer0Labels(layer0: readonly (readonly KeyboardActionEntry[])[]): readonly string[] {
  const labels = Array.from({ length: TOTAL_USEFUL_KEYS }, (_, idx) => DEFAULT_MAD60HE_KEY_LABELS[idx] ?? `Tecla ${idx}`);

  for (let r = 0; r < MATRIX_ROWS; r++) {
    const rowEntries = layer0[r];
    if (!rowEntries) continue;
    for (let c = 0; c < MATRIX_COLS; c++) {
      const entry = rowEntries[c];
      if (!entry) continue;
      const idx = r * MATRIX_COLS + c;
      if (idx >= 0 && idx < TOTAL_USEFUL_KEYS) {
        labels[idx] = resolveKeyLabel(entry);
      }
    }
  }

  return labels;
}

export function flatLabelsToRowMatrix(labels: readonly string[]): readonly (readonly string[])[] {
  const rows: string[][] = [];
  for (let r = 0; r < MATRIX_ROWS; r++) {
    const row: string[] = [];
    for (let c = 0; c < MATRIX_COLS; c++) {
      const idx = r * MATRIX_COLS + c;
      row.push(labels[idx] ?? DEFAULT_MAD60HE_ROW_LABELS[r]?.[c] ?? `Tecla ${idx}`);
    }
    rows.push(row);
  }
  return rows;
}

export function getKeyLabelAtIndex(index: number, customLabels?: readonly string[]): string {
  if (customLabels && customLabels[index]) {
    return customLabels[index]!;
  }
  return DEFAULT_MAD60HE_KEY_LABELS[index] ?? `Tecla ${index}`;
}
