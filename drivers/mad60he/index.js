// drivers/mad60he/manifest.json
var manifest_default = {
  id: "mad60he",
  name: "MAD60HE",
  category: "keyboard",
  version: "0.2.0",
  devices: [
    {
      vendorId: "0x373B",
      productId: "0x1053",
      name: "MAD60"
    }
  ],
  controlInterface: {
    usagePage: "0xFF60",
    usage: "0x0061"
  },
  capabilities: [
    {
      id: "analogMatrix",
      label: "Matriz Analogica Hall Effect",
      description: "Configuracion de recorrido de actuacion y Rapid Trigger por tecla (Tablas 13 y 14)",
      primitive: "key-matrix",
      preset: "analogMatrix",
      config: {
        rows: 5,
        cols: 14,
        totalKeys: 70,
        rowLabels: [
          ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
          ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
          ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Sin usar", "Enter"],
          ["LShift", "Sin usar", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Sin usar", "RShift"],
          ["LCtrl", "Win", "LAlt", "Sin usar", "Sin usar", "Sin usar", "Space", "Sin usar", "Sin usar", "Sin usar", "RAlt", "Menu", "RCtrl", "Fn"]
        ],
        fields: [
          {
            id: "actuationRaw",
            label: "Recorrido de Actuacion",
            primitive: "slider",
            min: 10,
            max: 400,
            step: 1,
            unit: "cs mm"
          },
          {
            id: "rtEnabled",
            label: "Rapid Trigger",
            primitive: "toggle"
          },
          {
            id: "rtPressRaw",
            label: "Sensibilidad al Pulsar",
            primitive: "slider",
            min: 2,
            max: 400,
            step: 1,
            unit: "cs mm"
          },
          {
            id: "rtReleaseRaw",
            label: "Sensibilidad al Soltar",
            primitive: "slider",
            min: 2,
            max: 400,
            step: 1,
            unit: "cs mm"
          }
        ]
      }
    }
  ]
};

// drivers/mad60he/protocol/storage.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// drivers/mad60he/protocol/profile.ts
var TOTAL_USEFUL_KEYS = 70;
var MATRIX_ROWS = 5;
var MATRIX_COLS = 14;
var ACTUATION_MIN_RAW = 10;
var ACTUATION_MAX_RAW = 400;
var RT_MIN_RAW = 2;
var RT_MAX_RAW = 400;
var DEFAULT_KEY_CONFIG = {
  actuationRaw: 150,
  // 1.50 mm
  rtEnabled: 0,
  rtPressRaw: 50,
  // 0.50 mm
  rtReleaseRaw: 50
  // 0.50 mm
};
function createDefaultProfile(name = "Predeterminado") {
  const keys = Array.from({ length: TOTAL_USEFUL_KEYS }, () => ({ ...DEFAULT_KEY_CONFIG }));
  return {
    version: "1.0.0",
    name,
    source: "default",
    updatedAt: Date.now(),
    keys
  };
}

// drivers/mad60he/protocol/codec.ts
var TABLE_13_KEYS_PER_CHUNK = 11;
var TABLE_13_CHUNKS_COUNT = 7;
var TABLE_14_KEYS_PER_CHUNK = 4;
var TABLE_14_CHUNKS_COUNT = 18;
function encodeTable13(profile) {
  const reports = [];
  for (let chunkIdx = 0; chunkIdx < TABLE_13_CHUNKS_COUNT; chunkIdx++) {
    const start = chunkIdx * TABLE_13_KEYS_PER_CHUNK;
    const count = TABLE_13_KEYS_PER_CHUNK;
    const mark = chunkIdx === 0 ? 1 : chunkIdx === TABLE_13_CHUNKS_COUNT - 1 ? 2 : 0;
    const payload = new Array(32).fill(0);
    payload[0] = 3;
    payload[1] = 150;
    payload[2] = 13;
    payload[3] = 0;
    payload[4] = 0;
    payload[5] = 0;
    payload[6] = start;
    payload[7] = count;
    payload[8] = mark;
    for (let k = 0; k < count; k++) {
      const keyIdx = start + k;
      let val = 0;
      if (keyIdx < TOTAL_USEFUL_KEYS) {
        val = profile.keys[keyIdx]?.actuationRaw ?? 150;
      }
      payload[9 + k * 2] = val >> 8 & 255;
      payload[9 + k * 2 + 1] = val & 255;
    }
    reports.push({
      tableId: 13,
      startIndex: start,
      count,
      mark,
      bytes: payload
    });
  }
  return reports;
}
function encodeTable14(profile) {
  const reports = [];
  for (let chunkIdx = 0; chunkIdx < TABLE_14_CHUNKS_COUNT; chunkIdx++) {
    const start = chunkIdx * TABLE_14_KEYS_PER_CHUNK;
    const count = TABLE_14_KEYS_PER_CHUNK;
    const mark = chunkIdx === 0 ? 1 : chunkIdx === TABLE_14_CHUNKS_COUNT - 1 ? 2 : 0;
    const payload = new Array(32).fill(0);
    payload[0] = 3;
    payload[1] = 150;
    payload[2] = 14;
    payload[3] = 0;
    payload[4] = 0;
    payload[5] = 0;
    payload[6] = start;
    payload[7] = count;
    payload[8] = mark;
    for (let k = 0; k < count; k++) {
      const keyIdx = start + k;
      const base = 9 + k * 5;
      if (keyIdx < TOTAL_USEFUL_KEYS) {
        const key = profile.keys[keyIdx];
        const enabled = key?.rtEnabled ?? 0;
        const press = key?.rtPressRaw ?? 50;
        const release = key?.rtReleaseRaw ?? 50;
        payload[base] = enabled & 255;
        payload[base + 1] = press >> 8 & 255;
        payload[base + 2] = press & 255;
        payload[base + 3] = release >> 8 & 255;
        payload[base + 4] = release & 255;
      }
    }
    reports.push({
      tableId: 14,
      startIndex: start,
      count,
      mark,
      bytes: payload
    });
  }
  return reports;
}

// drivers/mad60he/protocol/storage.ts
function getMad60HeStoragePath() {
  const appData = process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
  return join(appData, "peripherals-hub", "profiles", "mad60he.json");
}
function saveProfile(profile, customPath) {
  const filePath = customPath ?? getMad60HeStoragePath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const data = JSON.stringify(profile, null, 2);
  writeFileSync(filePath, data, "utf-8");
}
function loadProfile(customPath) {
  const filePath = customPath ?? getMad60HeStoragePath();
  if (!existsSync(filePath)) {
    const defaultProf = createDefaultProfile();
    saveProfile(defaultProf, filePath);
    return defaultProf;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error al cargar perfil desde ${filePath}, generando por defecto:`, error);
    return createDefaultProfile();
  }
}

// drivers/mad60he/protocol/transmitter.ts
function normalizeIncomingHidReport(incoming) {
  const incomingBytes = Array.from(incoming);
  return incomingBytes.length === 33 && incomingBytes[0] === 0 ? incomingBytes.slice(1) : incomingBytes;
}
function writeHidReport32(device, bytes32) {
  if (bytes32.length !== 32) {
    throw new Error(`La peticion HID debe tener exactamente 32 bytes (recibido ${bytes32.length})`);
  }
  const payloadToSend = Buffer.from([0, ...bytes32]);
  device.write(payloadToSend);
}
function matchesHeader(bytes, expectedHeader) {
  if (bytes.length < expectedHeader.length) {
    return false;
  }
  for (let i = 0; i < expectedHeader.length; i++) {
    if (bytes[i] !== expectedHeader[i]) {
      return false;
    }
  }
  return true;
}
function isPeriodicHeartbeatPacket(bytes) {
  return bytes.length === 32 && (bytes[0] === 3 || bytes[0] === 4) && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 0;
}
async function awaitSingleReadResponse(device, requestBytes, expectedHeader, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let lastMismatchedHeader = null;
    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      device.removeListener("data", onData);
    };
    const onData = (incoming) => {
      const normalized = normalizeIncomingHidReport(incoming);
      if (normalized.length !== 32) {
        return;
      }
      if (matchesHeader(normalized, expectedHeader)) {
        cleanup();
        resolve(normalized);
        return;
      }
      if (!isPeriodicHeartbeatPacket(normalized)) {
        lastMismatchedHeader = normalized.slice(0, expectedHeader.length);
      }
    };
    timer = setTimeout(() => {
      cleanup();
      if (lastMismatchedHeader !== null) {
        reject(
          new HeaderMismatchError(
            `Cabecera de respuesta no coincide en ${label}: esperado [${expectedHeader.join(", ")}], recibido [${lastMismatchedHeader.join(", ")}]`,
            expectedHeader,
            lastMismatchedHeader
          )
        );
        return;
      }
      reject(
        new Error(
          `Tiempo de espera agotado (${timeoutMs}ms) esperando respuesta de lectura para ${label}`
        )
      );
    }, timeoutMs);
    device.on("data", onData);
    try {
      writeHidReport32(device, requestBytes);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}
var HeaderMismatchError = class extends Error {
  expectedHeader;
  receivedHeader;
  constructor(message, expectedHeader, receivedHeader) {
    super(message);
    this.name = "HeaderMismatchError";
    this.expectedHeader = expectedHeader;
    this.receivedHeader = receivedHeader;
  }
};
async function sendReadRequestAndAwaitHeader(device, requestBytes, expectedHeader, options = {}) {
  const timeoutMs = options.timeoutMs ?? 800;
  const maxRetriesOnMismatch = options.maxRetriesOnMismatch ?? 1;
  const label = options.label ?? `[${expectedHeader.join(",")}]`;
  let attempts = 0;
  while (true) {
    attempts++;
    try {
      return await awaitSingleReadResponse(device, requestBytes, expectedHeader, timeoutMs, label);
    } catch (err) {
      if (err instanceof HeaderMismatchError && attempts <= maxRetriesOnMismatch) {
        continue;
      }
      throw err;
    }
  }
}
async function sendChunksWithEchoValidation(device, chunks, timeoutMs = 1e3) {
  if (chunks.length === 0) {
    return { success: true, tableId: 0, totalChunksSent: 0 };
  }
  const tableId = chunks[0]?.tableId ?? 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await new Promise((resolve, reject) => {
      let timer = null;
      const onData = (incoming) => {
        const normalized = normalizeIncomingHidReport(incoming);
        if (normalized.length !== chunk.bytes.length) {
          cleanup();
          reject(
            new Error(
              `Eco devuelto de longitud inesperada (${normalized.length} bytes, esperado ${chunk.bytes.length}) en trozo ${i + 1} de tabla ${chunk.tableId}`
            )
          );
          return;
        }
        for (let b = 0; b < chunk.bytes.length; b++) {
          if (normalized[b] !== chunk.bytes[b]) {
            cleanup();
            reject(
              new Error(
                `Eco del teclado difiere en byte ${b} (recibido ${normalized[b]}, esperado ${chunk.bytes[b]}) en trozo ${i + 1} de tabla ${chunk.tableId}`
              )
            );
            return;
          }
        }
        cleanup();
        resolve();
      };
      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        device.removeListener("data", onData);
      };
      timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Tiempo de espera agotado (${timeoutMs}ms) esperando eco para el trozo ${i + 1}/${chunks.length} de tabla ${chunk.tableId}`
          )
        );
      }, timeoutMs);
      device.on("data", onData);
      try {
        writeHidReport32(device, chunk.bytes);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
  return {
    success: true,
    tableId,
    totalChunksSent: chunks.length
  };
}

// drivers/mad60he/protocol/keymap.ts
var UNUSED_KEY_LABEL = "Sin usar";
var HID_KEYCODE_LABELS = {
  0: UNUSED_KEY_LABEL,
  4: "A",
  5: "B",
  6: "C",
  7: "D",
  8: "E",
  9: "F",
  10: "G",
  11: "H",
  12: "I",
  13: "J",
  14: "K",
  15: "L",
  16: "M",
  17: "N",
  18: "O",
  19: "P",
  20: "Q",
  21: "R",
  22: "S",
  23: "T",
  24: "U",
  25: "V",
  26: "W",
  27: "X",
  28: "Y",
  29: "Z",
  30: "1",
  31: "2",
  32: "3",
  33: "4",
  34: "5",
  35: "6",
  36: "7",
  37: "8",
  38: "9",
  39: "0",
  40: "Enter",
  41: "Esc",
  42: "Backspace",
  43: "Tab",
  44: "Space",
  45: "-",
  46: "=",
  47: "[",
  48: "]",
  49: "\\",
  50: "ISO#",
  51: ";",
  52: "'",
  53: "`",
  54: ",",
  55: ".",
  56: "/",
  57: "Caps",
  58: "F1",
  59: "F2",
  60: "F3",
  61: "F4",
  62: "F5",
  63: "F6",
  64: "F7",
  65: "F8",
  66: "F9",
  67: "F10",
  68: "F11",
  69: "F12",
  70: "PrtSc",
  71: "ScrLk",
  72: "Pause",
  73: "Ins",
  74: "Home",
  75: "PgUp",
  76: "Del",
  77: "End",
  78: "PgDn",
  79: "Right",
  80: "Left",
  81: "Down",
  82: "Up",
  100: "ISO\\",
  101: "Menu",
  224: "LCtrl",
  225: "LShift",
  226: "LAlt",
  227: "Win",
  228: "RCtrl",
  229: "RShift",
  230: "RAlt",
  231: "RWin"
};
function resolveKeyLabel(entry) {
  if (entry.keyClass === 0) {
    return HID_KEYCODE_LABELS[entry.keyId] ?? `KC_${entry.keyId.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  if (entry.keyClass === 82) {
    return "Fn";
  }
  return `Esp_${entry.keyClass}_${entry.keyId}`;
}
var DEFAULT_MAD60HE_ROW_LABELS = [
  ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
  ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", UNUSED_KEY_LABEL, "Enter"],
  ["LShift", UNUSED_KEY_LABEL, "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", UNUSED_KEY_LABEL, "RShift"],
  ["LCtrl", "Win", "LAlt", UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, "Space", UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, "RAlt", "Menu", "RCtrl", "Fn"]
];
var DEFAULT_MAD60HE_KEY_LABELS = DEFAULT_MAD60HE_ROW_LABELS.flat();
function extractLayer0Labels(layer0) {
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
function getKeyLabelAtIndex(index, customLabels) {
  if (customLabels && customLabels[index]) {
    return customLabels[index];
  }
  return DEFAULT_MAD60HE_KEY_LABELS[index] ?? `Tecla ${index}`;
}

// drivers/mad60he/protocol/reader.ts
var READ_TABLE_13_STARTS = [0, 12, 24, 36, 48, 60];
var READ_TABLE_13_KEYS_PER_CHUNK = 12;
var READ_TABLE_14_CHUNK_COUNT = 18;
var READ_TABLE_14_KEYS_PER_CHUNK = 4;
var KEYMAP_LAYERS_COUNT = 4;
var KEYMAP_ROW_BYTES = 28;
var SUPPORTED_LIVE_PROTOCOL_REGEX = /^1\.\d{2}$/;
function buildReadRequest32(header) {
  const payload = new Array(32).fill(0);
  for (let i = 0; i < header.length && i < 32; i++) {
    payload[i] = header[i] & 255;
  }
  return payload;
}
function assertExactHeader(bytes, expectedHeader, label) {
  if (bytes.length !== 32) {
    throw new Error(`Respuesta invalida en ${label}: longitud ${bytes.length} bytes (se esperaban 32)`);
  }
  for (let i = 0; i < expectedHeader.length; i++) {
    if (bytes[i] !== expectedHeader[i]) {
      throw new Error(
        `Cabecera invalida en ${label}: esperado [${expectedHeader.join(", ")}], recibido [${bytes.slice(0, expectedHeader.length).join(", ")}]`
      );
    }
  }
}
function readUint16BE(bytes, offset) {
  return (bytes[offset] ?? 0) << 8 | (bytes[offset + 1] ?? 0);
}
function parseVersionResponse(bytes) {
  assertExactHeader(bytes, [2, 150, 0, 0, 0], "lectura de version");
  const major = bytes[5] ?? 0;
  const minor = bytes[6] ?? 0;
  const version = `${major.toString(16)}.${minor.toString(16).padStart(2, "0")}`;
  if (!SUPPORTED_LIVE_PROTOCOL_REGEX.test(version)) {
    throw new Error(`Version de firmware/protocolo no soportada al leer teclado: "${version}"`);
  }
  return version;
}
function parseDeadBandResponse(bytes) {
  assertExactHeader(bytes, [2, 150, 11], "lectura de zona muerta");
  const topRaw = readUint16BE(bytes, 3);
  const bottomRaw = readUint16BE(bytes, 5);
  if (topRaw < 0 || topRaw > 400 || bottomRaw < 0 || bottomRaw > 400) {
    throw new Error(`Valores de zona muerta fuera de rango (0-400 cs mm): top=${topRaw}, bottom=${bottomRaw}`);
  }
  return { topRaw, bottomRaw };
}
function parseTable13ReadResponse(bytes, expectedStart, targetActuations) {
  assertExactHeader(bytes, [2, 150, 13, 0, 0, 0, expectedStart, READ_TABLE_13_KEYS_PER_CHUNK], `Tabla 13 (inicio=${expectedStart})`);
  for (let k = 0; k < READ_TABLE_13_KEYS_PER_CHUNK; k++) {
    const keyIdx = expectedStart + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const actuationRaw = readUint16BE(bytes, 8 + k * 2);
      if (actuationRaw < ACTUATION_MIN_RAW || actuationRaw > ACTUATION_MAX_RAW) {
        throw new Error(
          `Recorrido de actuacion leido fuera de rango (${ACTUATION_MIN_RAW}-${ACTUATION_MAX_RAW} cs mm) en tecla ${keyIdx}: ${actuationRaw}`
        );
      }
      targetActuations[keyIdx] = actuationRaw;
    }
  }
}
function parseTable14ReadResponse(bytes, expectedStart, targetRt) {
  assertExactHeader(bytes, [2, 150, 14, 0, 0, 0, expectedStart, READ_TABLE_14_KEYS_PER_CHUNK], `Tabla 14 (inicio=${expectedStart})`);
  for (let k = 0; k < READ_TABLE_14_KEYS_PER_CHUNK; k++) {
    const keyIdx = expectedStart + k;
    if (keyIdx < TOTAL_USEFUL_KEYS) {
      const base = 8 + k * 5;
      const rtEnabled = bytes[base] ?? 0;
      const rtPressRaw = readUint16BE(bytes, base + 1);
      const rtReleaseRaw = readUint16BE(bytes, base + 3);
      if (rtEnabled !== 0 && rtEnabled !== 1) {
        throw new Error(`Estado Rapid Trigger invalido leido en tecla ${keyIdx}: ${rtEnabled}`);
      }
      if (rtPressRaw < RT_MIN_RAW || rtPressRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al pulsar leida fuera de rango (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en tecla ${keyIdx}: ${rtPressRaw}`
        );
      }
      if (rtReleaseRaw < RT_MIN_RAW || rtReleaseRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad al soltar leida fuera de rango (${RT_MIN_RAW}-${RT_MAX_RAW} cs mm) en tecla ${keyIdx}: ${rtReleaseRaw}`
        );
      }
      targetRt[keyIdx] = { rtEnabled, rtPressRaw, rtReleaseRaw };
    }
  }
}
function parseKeymapReadResponse(bytes, expectedOffset) {
  const offHi = expectedOffset >> 8 & 255;
  const offLo = expectedOffset & 255;
  assertExactHeader(bytes, [18, offHi, offLo, KEYMAP_ROW_BYTES], `Keymap (offset=${expectedOffset})`);
  const rowEntries = [];
  for (let col = 0; col < MATRIX_COLS; col++) {
    const keyClass = bytes[4 + col * 2] ?? 0;
    const keyId = bytes[4 + col * 2 + 1] ?? 0;
    rowEntries.push({ keyClass, keyId });
  }
  return rowEntries;
}
async function readMad60HeProfile(device, options = {}) {
  const timeoutMs = options.timeoutMs ?? 800;
  const maxRetriesOnMismatch = options.maxRetriesOnMismatch ?? 1;
  const verHeader = [2, 150, 0, 0, 0];
  const verResp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32([2, 150, 0]), verHeader, {
    timeoutMs,
    maxRetriesOnMismatch,
    label: "version"
  });
  const protocolVersion = parseVersionResponse(verResp);
  const dbHeader = [2, 150, 11];
  const dbResp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(dbHeader), dbHeader, {
    timeoutMs,
    maxRetriesOnMismatch,
    label: "zona muerta"
  });
  const deadBand = parseDeadBandResponse(dbResp);
  const actuations = new Array(TOTAL_USEFUL_KEYS);
  for (const start of READ_TABLE_13_STARTS) {
    const header = [2, 150, 13, 0, 0, 0, start, READ_TABLE_13_KEYS_PER_CHUNK];
    const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
      timeoutMs,
      maxRetriesOnMismatch,
      label: `Tabla 13 (inicio=${start})`
    });
    parseTable13ReadResponse(resp, start, actuations);
  }
  const rtRecords = new Array(TOTAL_USEFUL_KEYS);
  for (let chunkIdx = 0; chunkIdx < READ_TABLE_14_CHUNK_COUNT; chunkIdx++) {
    const start = chunkIdx * READ_TABLE_14_KEYS_PER_CHUNK;
    const header = [2, 150, 14, 0, 0, 0, start, READ_TABLE_14_KEYS_PER_CHUNK];
    const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
      timeoutMs,
      maxRetriesOnMismatch,
      label: `Tabla 14 (inicio=${start})`
    });
    parseTable14ReadResponse(resp, start, rtRecords);
  }
  const keymapLayers = [];
  for (let layer = 0; layer < KEYMAP_LAYERS_COUNT; layer++) {
    const layerRows = [];
    for (let row = 0; row < MATRIX_ROWS; row++) {
      const offset = (layer * MATRIX_ROWS + row) * KEYMAP_ROW_BYTES;
      const offHi = offset >> 8 & 255;
      const offLo = offset & 255;
      const header = [18, offHi, offLo, KEYMAP_ROW_BYTES];
      const resp = await sendReadRequestAndAwaitHeader(device, buildReadRequest32(header), header, {
        timeoutMs,
        maxRetriesOnMismatch,
        label: `Keymap capa=${layer} fila=${row}`
      });
      layerRows.push([...parseKeymapReadResponse(resp, offset)]);
    }
    keymapLayers.push(layerRows);
  }
  const keys = [];
  for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
    const actuationRaw = actuations[i];
    const rt = rtRecords[i];
    if (actuationRaw === void 0 || rt === void 0) {
      throw new Error(`Lectura incompleta del teclado: falta configuracion en tecla ${i}.`);
    }
    keys.push({
      actuationRaw,
      rtEnabled: rt.rtEnabled,
      rtPressRaw: rt.rtPressRaw,
      rtReleaseRaw: rt.rtReleaseRaw
    });
  }
  const layer0 = keymapLayers[0];
  if (!layer0 || layer0.length !== MATRIX_ROWS) {
    throw new Error("Lectura incompleta del teclado: falta capa 0 de keymap.");
  }
  const keyLabels = extractLayer0Labels(layer0);
  const readAt = Date.now();
  return {
    version: "1.0.0",
    name: "Configuracion del Teclado",
    source: "keyboard",
    readAt,
    updatedAt: readAt,
    protocolVersion,
    deadBand,
    keyLabels,
    keymapLayers,
    keys
  };
}

// drivers/mad60he/index.ts
var manifest = manifest_default;
var Mad60HeDriver = class {
  manifest = manifest;
  connection = null;
  profile;
  profilePath;
  transportFactory;
  allowHardwareWrite = false;
  hasHardwareRead = false;
  activeReadPromise = null;
  constructor(options = {}) {
    this.profilePath = options.profilePath;
    this.transportFactory = options.transportFactory;
    this.profile = loadProfile(this.profilePath);
  }
  async openHidTransport(path) {
    if (this.transportFactory) {
      return this.transportFactory(path);
    }
    const HID = await import("node-hid");
    return new HID.default.HID(path);
  }
  isHardwareWriteAllowed() {
    if (!this.hasHardwareRead) {
      return false;
    }
    const envVal = process.env["PERIPHERALS_HUB_ALLOW_HARDWARE_WRITE"];
    if (envVal === "1" || envVal === "true") {
      return true;
    }
    return this.allowHardwareWrite;
  }
  setAllowHardwareWrite(allowed) {
    this.allowHardwareWrite = allowed;
  }
  async connect(connection) {
    if (this.connection?.path !== connection.path) {
      this.hasHardwareRead = false;
    }
    this.connection = connection;
  }
  async readState() {
    return {
      connected: this.connection !== null,
      values: {
        keys: this.profile.keys,
        profileName: this.profile.name,
        source: this.profile.source ?? "default",
        importedAt: this.profile.importedAt ?? null,
        readAt: this.profile.readAt ?? null,
        hasHardwareRead: this.hasHardwareRead,
        importedFileName: this.profile.importedFileName ?? null,
        protocolVersion: this.profile.protocolVersion ?? null,
        deadBand: this.profile.deadBand ?? null,
        keyLabels: this.profile.keyLabels ?? null,
        allowHardwareWrite: this.isHardwareWriteAllowed(),
        lastSentToHardwareAt: this.profile.lastSentToHardwareAt,
        updatedAt: this.profile.updatedAt
      }
    };
  }
  /**
   * Lee en serie la configuracion real del teclado (version, zona muerta, tablas 13/14 y keymap)
   * sin emitir escrituras y sin requerir el interruptor de escritura.
   */
  async readFromHardware() {
    if (this.activeReadPromise) {
      return this.activeReadPromise;
    }
    const executeRead = async () => {
      if (!this.connection?.path) {
        throw new Error("No se detecto endpoint de control HID (UP 0xFF60, usage 0x61) para leer el teclado.");
      }
      console.log(`[Mad60HeDriver] Leyendo configuracion en vivo del teclado en ${this.connection.path}...`);
      const device = await this.openHidTransport(this.connection.path);
      try {
        const liveProfile = await readMad60HeProfile(device, { timeoutMs: 800, maxRetriesOnMismatch: 1 });
        this.hasHardwareRead = true;
        this.profile = {
          version: liveProfile.version,
          name: liveProfile.name,
          source: "keyboard",
          readAt: liveProfile.readAt,
          updatedAt: liveProfile.updatedAt,
          protocolVersion: liveProfile.protocolVersion,
          deadBand: liveProfile.deadBand,
          keyLabels: liveProfile.keyLabels,
          keys: liveProfile.keys,
          lastSentToHardwareAt: this.profile.lastSentToHardwareAt
        };
        saveProfile(this.profile, this.profilePath);
        console.log(
          `[Mad60HeDriver] Lectura completa del teclado exitosa (v${liveProfile.protocolVersion}, deadband ${liveProfile.deadBand.topRaw}/${liveProfile.deadBand.bottomRaw} cs mm).`
        );
        return this.readState();
      } finally {
        try {
          device.close();
        } catch {
        }
      }
    };
    this.activeReadPromise = executeRead().finally(() => {
      this.activeReadPromise = null;
    });
    return this.activeReadPromise;
  }
  /**
   * Calcula el plan de cambios comparando el estado actual con el solicitado,
   * validando estrictamente los rangos de valores observados en las capturas.
   */
  prepareApply(newKeys, keyLabels) {
    if (newKeys.length !== TOTAL_USEFUL_KEYS) {
      throw new Error(`Se requieren exactamente ${TOTAL_USEFUL_KEYS} teclas en el perfil`);
    }
    const effectiveLabels = keyLabels ?? this.profile.keyLabels;
    const changes = [];
    for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
      const cur = this.profile.keys[i] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      const next = newKeys[i];
      if (next.actuationRaw < ACTUATION_MIN_RAW || next.actuationRaw > ACTUATION_MAX_RAW) {
        throw new Error(
          `Valor de actuacion fuera de rango valido (${ACTUATION_MIN_RAW} a ${ACTUATION_MAX_RAW} cs mm) en tecla ${i}: ${next.actuationRaw}`
        );
      }
      if (next.rtEnabled !== 0 && next.rtEnabled !== 1) {
        throw new Error(`Estado de Rapid Trigger invalido en tecla ${i}: ${next.rtEnabled}`);
      }
      if (next.rtPressRaw < RT_MIN_RAW || next.rtPressRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad de pulsacion RT fuera de rango valido (${RT_MIN_RAW} a ${RT_MAX_RAW} cs mm) en tecla ${i}: ${next.rtPressRaw}`
        );
      }
      if (next.rtReleaseRaw < RT_MIN_RAW || next.rtReleaseRaw > RT_MAX_RAW) {
        throw new Error(
          `Sensibilidad de rearme RT fuera de rango valido (${RT_MIN_RAW} a ${RT_MAX_RAW} cs mm) en tecla ${i}: ${next.rtReleaseRaw}`
        );
      }
      const keyLabel = getKeyLabelAtIndex(i, effectiveLabels);
      if (cur.actuationRaw !== next.actuationRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: "Actuacion",
          previous: cur.actuationRaw,
          next: next.actuationRaw
        });
      }
      if (cur.rtEnabled !== next.rtEnabled) {
        changes.push({
          index: i,
          label: keyLabel,
          field: "RT Activo",
          previous: cur.rtEnabled,
          next: next.rtEnabled
        });
      }
      if (cur.rtPressRaw !== next.rtPressRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: "RT Pulsar",
          previous: cur.rtPressRaw,
          next: next.rtPressRaw
        });
      }
      if (cur.rtReleaseRaw !== next.rtReleaseRaw) {
        changes.push({
          index: i,
          label: keyLabel,
          field: "RT Rearme",
          previous: cur.rtReleaseRaw,
          next: next.rtReleaseRaw
        });
      }
    }
    const nextProfile = {
      ...this.profile,
      updatedAt: Date.now(),
      keys: newKeys
    };
    const t13Reports = encodeTable13(nextProfile);
    const t14Reports = encodeTable14(nextProfile);
    const affectedKeys = new Set(changes.map((c) => c.index));
    return {
      changes,
      totalKeysAffected: affectedKeys.size,
      t13Reports,
      t14Reports
    };
  }
  /**
   * Aplica y guarda el nuevo perfil localmente.
   * La rutina de transmision fisica USB con eco y timeout queda preparada para cuando
   * el usuario autorice escrituras activas al hardware.
   */
  async apply(partialState) {
    if (typeof partialState["allowHardwareWrite"] === "boolean") {
      this.setAllowHardwareWrite(partialState["allowHardwareWrite"]);
    }
    if (!partialState["keys"] || !Array.isArray(partialState["keys"])) {
      return {
        success: true,
        savedLocally: false,
        hardwareWritten: false,
        appliedAt: this.profile.updatedAt,
        message: "No se enviaron teclas para modificar."
      };
    }
    const nextLabels = Array.isArray(partialState["keyLabels"]) && partialState["keyLabels"].length === TOTAL_USEFUL_KEYS ? partialState["keyLabels"] : this.profile.keyLabels;
    const plan = this.prepareApply(partialState["keys"], nextLabels);
    const now = Date.now();
    const rawSource = partialState["source"];
    const validSource = rawSource === "keyboard" || rawSource === "imported-file" || rawSource === "capture" || rawSource === "default" ? rawSource : this.profile.source ?? "default";
    const rawDeadBand = partialState["deadBand"];
    const validDeadBand = rawDeadBand && typeof rawDeadBand.topRaw === "number" && typeof rawDeadBand.bottomRaw === "number" ? rawDeadBand : this.profile.deadBand;
    this.profile = {
      ...this.profile,
      name: typeof partialState["profileName"] === "string" && partialState["profileName"].trim().length > 0 ? partialState["profileName"].trim() : this.profile.name,
      source: validSource,
      importedAt: typeof partialState["importedAt"] === "number" ? partialState["importedAt"] : this.profile.importedAt,
      readAt: typeof partialState["readAt"] === "number" ? partialState["readAt"] : this.profile.readAt,
      importedFileName: typeof partialState["importedFileName"] === "string" ? partialState["importedFileName"] : this.profile.importedFileName,
      protocolVersion: typeof partialState["protocolVersion"] === "string" ? partialState["protocolVersion"] : this.profile.protocolVersion,
      deadBand: validDeadBand,
      keyLabels: nextLabels,
      updatedAt: now,
      keys: partialState["keys"]
    };
    saveProfile(this.profile, this.profilePath);
    console.log(`[Mad60HeDriver] Perfil guardado localmente (${plan.changes.length} cambios registrados).`);
    const hardwareRequested = partialState["writeToHardware"] === true;
    const hardwareEnabled = this.isHardwareWriteAllowed() || hardwareRequested && this.hasHardwareRead;
    if (hardwareRequested && !this.hasHardwareRead) {
      throw new Error(
        'Antes de enviar cambios al teclado debes leer su configuracion actual desde el hardware (pulsa "Leer del teclado").'
      );
    }
    if (hardwareEnabled) {
      if (!this.connection?.path) {
        throw new Error("No se detecto endpoint de control HID (UP 0xFF60, usage 0x61) para emitir escrituras al hardware");
      }
      console.log(`[Mad60HeDriver] Opcion explicita activa: enviando al hardware en ${this.connection.path}...`);
      const device = await this.openHidTransport(this.connection.path);
      try {
        const t13Res = await sendChunksWithEchoValidation(device, plan.t13Reports, 1e3);
        const t14Res = await sendChunksWithEchoValidation(device, plan.t14Reports, 1e3);
        console.log("[Mad60HeDriver] Tablas 13 y 14 transmitidas y verificadas por eco en el teclado con exito.");
        const appliedAt = Date.now();
        this.profile = {
          ...this.profile,
          lastSentToHardwareAt: appliedAt
        };
        saveProfile(this.profile, this.profilePath);
        return {
          success: true,
          savedLocally: true,
          hardwareWritten: true,
          transmission: {
            table13ChunksSent: t13Res.totalChunksSent,
            table13TotalChunks: plan.t13Reports.length,
            table14ChunksSent: t14Res.totalChunksSent,
            table14TotalChunks: plan.t14Reports.length
          },
          appliedAt,
          message: `${t13Res.totalChunksSent}/${plan.t13Reports.length} trozos de Tabla 13 y ${t14Res.totalChunksSent}/${plan.t14Reports.length} trozos de Tabla 14 confirmados por eco.`
        };
      } finally {
        try {
          device.close();
        } catch {
        }
      }
    }
    return {
      success: true,
      savedLocally: true,
      hardwareWritten: false,
      appliedAt: now,
      message: "solo guardado en el hub"
    };
  }
  async disconnect() {
    this.connection = null;
    this.hasHardwareRead = false;
  }
};
var index_default = Mad60HeDriver;
export {
  Mad60HeDriver,
  index_default as default,
  manifest
};
