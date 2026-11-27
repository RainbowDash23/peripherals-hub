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
        const incomingBytes = Array.from(incoming);
        const normalized = incomingBytes.length === 33 && incomingBytes[0] === 0 ? incomingBytes.slice(1) : incomingBytes;
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
        const payloadToSend = Buffer.from([0, ...chunk.bytes]);
        device.write(payloadToSend);
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
var DEFAULT_MAD60HE_ROW_LABELS = [
  ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
  ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", UNUSED_KEY_LABEL, "Enter"],
  ["LShift", UNUSED_KEY_LABEL, "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", UNUSED_KEY_LABEL, "RShift"],
  ["LCtrl", "Win", "LAlt", UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, "Space", UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, UNUSED_KEY_LABEL, "RAlt", "Menu", "RCtrl", "Fn"]
];
var DEFAULT_MAD60HE_KEY_LABELS = DEFAULT_MAD60HE_ROW_LABELS.flat();
function getKeyLabelAtIndex(index, customLabels) {
  if (customLabels && customLabels[index]) {
    return customLabels[index];
  }
  return DEFAULT_MAD60HE_KEY_LABELS[index] ?? `Tecla ${index}`;
}

// drivers/mad60he/index.ts
var manifest = manifest_default;
var Mad60HeDriver = class {
  manifest = manifest;
  connection = null;
  profile;
  allowHardwareWrite = false;
  constructor() {
    this.profile = loadProfile();
  }
  isHardwareWriteAllowed() {
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
    const validSource = rawSource === "imported-file" || rawSource === "capture" || rawSource === "default" ? rawSource : this.profile.source ?? "default";
    const rawDeadBand = partialState["deadBand"];
    const validDeadBand = rawDeadBand && typeof rawDeadBand.topRaw === "number" && typeof rawDeadBand.bottomRaw === "number" ? rawDeadBand : this.profile.deadBand;
    this.profile = {
      ...this.profile,
      name: typeof partialState["profileName"] === "string" && partialState["profileName"].trim().length > 0 ? partialState["profileName"].trim() : this.profile.name,
      source: validSource,
      importedAt: typeof partialState["importedAt"] === "number" ? partialState["importedAt"] : this.profile.importedAt,
      importedFileName: typeof partialState["importedFileName"] === "string" ? partialState["importedFileName"] : this.profile.importedFileName,
      protocolVersion: typeof partialState["protocolVersion"] === "string" ? partialState["protocolVersion"] : this.profile.protocolVersion,
      deadBand: validDeadBand,
      keyLabels: nextLabels,
      updatedAt: now,
      keys: partialState["keys"]
    };
    saveProfile(this.profile);
    console.log(`[Mad60HeDriver] Perfil guardado localmente (${plan.changes.length} cambios registrados).`);
    const hardwareEnabled = this.isHardwareWriteAllowed() || partialState["writeToHardware"] === true;
    if (hardwareEnabled) {
      if (!this.connection?.path) {
        throw new Error("No se detecto endpoint de control HID (UP 0xFF60, usage 0x61) para emitir escrituras al hardware");
      }
      console.log(`[Mad60HeDriver] Opcion explicita activa: enviando al hardware en ${this.connection.path}...`);
      const HID = await import("node-hid");
      const device = new HID.default.HID(this.connection.path);
      try {
        const t13Res = await sendChunksWithEchoValidation(device, plan.t13Reports, 1e3);
        const t14Res = await sendChunksWithEchoValidation(device, plan.t14Reports, 1e3);
        console.log("[Mad60HeDriver] Tablas 13 y 14 transmitidas y verificadas por eco en el teclado con exito.");
        const appliedAt = Date.now();
        this.profile = {
          ...this.profile,
          lastSentToHardwareAt: appliedAt
        };
        saveProfile(this.profile);
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
  }
};
var index_default = Mad60HeDriver;
export {
  Mad60HeDriver,
  index_default as default,
  manifest
};
