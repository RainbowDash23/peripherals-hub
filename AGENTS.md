# AGENTS.md — Reglas y Guía de Arquitectura para Peripherals Hub

Este repositorio alberga una aplicación de escritorio (Electron + React + TypeScript + `node-hid`, optimizada para Windows 11) diseñada para centralizar la configuración de periféricos de alto rendimiento sin depender de software privativo intrusivo:
- **Mouse:** Ajazz AJ159 Pro
- **Teclado:** MAD60HE (teclado analógico con switches magnéticos Hall Effect)

Dado que ninguno de los fabricantes proporciona documentación oficial de sus protocolos HID, todas las capacidades se descubren mediante ingeniería inversa y captura pasiva de paquetes USB.

---

## ⚠️ 1. REGLAS INVIOLABLES DE SEGURIDAD DE HARDWARE

Cualquier agente de IA o desarrollador que opere en este repositorio debe acatar de forma estricta las siguientes directivas:

### Regla 1: NUNCA enviar bytes no respaldados por capturas documentadas
- **Prohibido adivinar o realizar "fuzzing" de bytes al hardware.**
- Ninguna función, script o comando podrá emitir llamadas `write()`, `sendFeatureReport()` o paquetes de control hacia un dispositivo físico sin que la secuencia exacta de bytes esté documentada y validada previamente a partir de una captura real de tráfico USB (Wireshark + USBPcap).
- Cada byte enviado debe tener un propósito identificado (Report ID, comando/opcode, longitud, parámetro, checksum, etc.).

### Regla 2: NADA DE FIRMWARE (Cero comandos de flasheo o DFU)
- **Queda terminantemente prohibido implementar o ejecutar rutinas de actualización de firmware, comandos de modo DFU (Device Firmware Upgrade), flasheo de bootloader o escritura arbitraria en EEPROM/Flash.**
- El alcance del proyecto está estrictamente limitado a la **lectura y configuración de parámetros de usuario**:
  - *Mouse:* DPI, polling rate, distancia de despegue (LOD), debounce time, iluminación RGB, reasignación de botones y estado de batería.
  - *Teclado:* Actuation point, Rapid Trigger (sensibilidad de pulsación/rearme), polling rate, RGB, perfiles y mapeo de teclas.
- El riesgo de brickear ("ladrillo") el periférico es inaceptable.

### Regla 3: Documentación obligatoria de cada hallazgo en `docs/protocol/`
- Cualquier interacción con el hardware descubierta debe registrarse de inmediato en la carpeta `docs/protocol/<dispositivo>/`.
- La documentación debe incluir:
  1. Identificadores del dispositivo (`vendorId`, `productId`, `usagePage`, `usage`, `interface`).
  2. Tipo de reporte (Input Report, Output Report, Feature Report).
  3. Tamaño exacto del payload en bytes y Report ID.
  4. Desglose byte a byte del payload (cabecera, comando, parámetros, cálculo de checksum/CRC si aplica).
  5. Captura de referencia (nombre del archivo `.pcapng` o snippet hexadecimal extraído).

### Regla 4: Modo Solo Lectura / Enumeración por defecto
- Durante fases de exploración, detección e inicialización, únicamente se permite la **enumeración pasiva** (`devices()`, inspección de descriptores HID) y lecturas pasivas seguras. No se enviarán escrituras activas salvo que una tarea específica lo apruebe expresamente.

---

## 🏛️ 2. ARQUITECTURA Y ORGANIZACIÓN DEL CÓDIGO

El proyecto sigue los principios de **Clean Architecture**, **Domain-Driven Design (DDD)** y **Clean Code**:

```
peripherals-hub/
├── AGENTS.md                     # Reglas de seguridad y guía para agentes
├── README.md                     # Visión general y puesta en marcha
├── package.json                  # Dependencias y scripts
├── tsconfig.json                 # Configuración estricta de TypeScript
├── pnpm-workspace.yaml           # Políticas de construcción de dependencias nativas
├── docs/
│   └── protocol/                 # Especificaciones de ingeniería inversa de protocolos
│       ├── README.md             # Guía de captura y plantilla de documentación
│       ├── ajazz-aj159-pro/      # Protocolo del mouse Ajazz AJ159 Pro
│       └── mad60he/              # Protocolo del teclado MAD60HE
├── scripts/                      # Herramientas de soporte y diagnóstico
│   └── list-hid.ts               # Enumeración pasiva de dispositivos HID
└── src/
    ├── main/                     # Proceso principal de Electron (Node.js)
    │   ├── hardware/             # Conexión, ciclo de vida y abstracción de node-hid
    │   ├── ipc/                  # Handlers de IPC tipados y seguros
    │   └── index.ts              # Entry point del proceso principal
    ├── preload/                  # Scripts de preload seguros con contextBridge
    │   └── index.ts
    ├── renderer/                 # Interfaz de usuario (React + TypeScript)
    │   ├── components/           # Componentes UI reutilizables
    │   ├── features/             # Vistas de periféricos (mouse, teclado)
    │   └── App.tsx               # Aplicación React
    └── domain/                   # Capa de dominio (agnóstica de frameworks y UI)
        ├── hid/                  # Tipos base, interfaces de transporte y contratos seguros
        └── devices/              # Modelos, configuraciones y paquetes de cada periférico
            ├── ajazz/
            └── mad60he/
```

### Separación de Responsabilidades y Seguridad en Electron
1. **Aislamiento total del Renderer:**
   - `nodeIntegration: false`, `contextIsolation: true`.
   - El Renderer nunca toca `node-hid` directamente; únicamente envía solicitudes de configuración validadas a través de IPC seguro expuesto en `contextBridge`.
2. **Validación en el Main Process:**
   - Todos los mensajes recibidos desde el Renderer deben ser validados mediante esquemas estrictos antes de construir cualquier payload HID.
3. **Manejo de Errores Resiliente:**
   - La desconexión o reconexión de periféricos debe detectarse de forma asíncrona sin bloquear la UI ni provocar fallos catastróficos en el proceso principal.

---

## 🧪 3. GUÍA DE CAPTURA DE TRÁFICO HID (WINDOWS 11)

Para capturar tráfico del software original de los fabricantes:
1. Instalar **Wireshark** con el controlador **USBPcap**.
2. Identificar el bus USB al que está conectado el dispositivo.
3. Iniciar la captura en la interfaz `USBPcap` correspondiente con el filtro:
   ```
   usb.idVendor == 0xXXXX && usb.idProduct == 0xYYYY
   ```
4. En el software original del fabricante, cambiar un único parámetro (por ejemplo, cambiar DPI de 800 a 1600, o modificar el punto de actuación de 1.0mm a 1.2mm) y aplicar.
5. Detener la captura, aislar los paquetes de tipo `URB_INTERRUPT out` o `URB_CONTROL out` y guardar el payload exacto en `docs/protocol/<dispositivo>/`.
