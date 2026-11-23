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
          ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter", "Enter2"],
          ["Tecla 42", "Tecla 43", "Tecla 44", "Tecla 45", "Tecla 46", "Tecla 47", "Tecla 48", "Tecla 49", "Tecla 50", "Tecla 51", "Tecla 52", "Tecla 53", "Tecla 54", "Tecla 55"],
          ["Tecla 56", "Tecla 57", "Tecla 58", "Tecla 59", "Tecla 60", "Tecla 61", "Tecla 62", "Tecla 63", "Tecla 64", "Tecla 65", "Tecla 66", "Tecla 67", "Tecla 68", "Tecla 69"]
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
        allowHardwareWrite: this.isHardwareWriteAllowed()
      }
    };
  }
  /**
   * Calcula el plan de cambios comparando el estado actual con el solicitado,
   * validando estrictamente los rangos de valores observados en las capturas.
   */
  prepareApply(newKeys) {
    if (newKeys.length !== TOTAL_USEFUL_KEYS) {
      throw new Error(`Se requieren exactamente ${TOTAL_USEFUL_KEYS} teclas en el perfil`);
    }
    const changes = [];
    const labels = [
      ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Backspace"],
      ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
      ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter", "Enter2"]
    ];
    for (let i = 0; i < TOTAL_USEFUL_KEYS; i++) {
      const cur = this.profile.keys[i] ?? { actuationRaw: 150, rtEnabled: 0, rtPressRaw: 50, rtReleaseRaw: 50 };
      const next = newKeys[i];
      if (next.actuationRaw < 10 || next.actuationRaw > 400) {
        throw new Error(`Valor de actuacion fuera de rango valido (10 a 400 cs mm) en tecla ${i}: ${next.actuationRaw}`);
      }
      if (next.rtEnabled !== 0 && next.rtEnabled !== 1) {
        throw new Error(`Estado de Rapid Trigger invalido en tecla ${i}: ${next.rtEnabled}`);
      }
      if (next.rtPressRaw < 2 || next.rtPressRaw > 400) {
        throw new Error(`Sensibilidad de pulsacion RT fuera de rango valido (2 a 400 cs mm) en tecla ${i}: ${next.rtPressRaw}`);
      }
      if (next.rtReleaseRaw < 2 || next.rtReleaseRaw > 400) {
        throw new Error(`Sensibilidad de rearme RT fuera de rango valido (2 a 400 cs mm) en tecla ${i}: ${next.rtReleaseRaw}`);
      }
      const row = Math.floor(i / 14);
      const col = i % 14;
      const keyLabel = row < 3 && labels[row]?.[col] ? labels[row][col] : `Tecla ${i}`;
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
    if (partialState["keys"] && Array.isArray(partialState["keys"])) {
      const plan = this.prepareApply(partialState["keys"]);
      this.profile = {
        ...this.profile,
        updatedAt: Date.now(),
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
          await sendChunksWithEchoValidation(device, plan.t13Reports, 1e3);
          await sendChunksWithEchoValidation(device, plan.t14Reports, 1e3);
          console.log("[Mad60HeDriver] Tablas 13 y 14 transmitidas y verificadas por eco en el teclado con exito.");
        } finally {
          try {
            device.close();
          } catch {
          }
        }
      }
    }
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
