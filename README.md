# Peripherals Hub

Hub de escritorio modular (Electron, React, TypeScript, Tailwind CSS y node-hid en Windows 11) para configurar perifericos de alto rendimiento sin software privativo.

## Estado actual

- Fase 1 completada:
  - Scaffolding funcional en Electron, React, TypeScript y Vite.
  - DeviceManager con polling pasivo (1.5s) que detecta conexiones y desconexiones sin bloquear la interfaz.
  - Cargador de drivers con validacion estricta mediante Zod, compatible con drivers locales en `drivers/` y externos de usuario en `%APPDATA%/peripherals-hub/drivers/`.
  - Vista de dispositivos no soportados con tabla completa de descriptores y endpoints HID.
  - Modo Laboratorio de solo lectura pasiva para inspeccionar reportes HID en tiempo real.
  - Sistema de diseno tecnico oscuro con tokens de Tailwind CSS, libre de emojis.
- Fase 2 completada (Driver MAD60HE - Tablas 13 y 14):
  - Rangos de operacion oficiales confirmados por el usuario:
    - Recorrido de actuacion: 10 a 400 centesimas de mm (0.10 a 4.00 mm).
    - Sensibilidad de Rapid Trigger (pulsacion y rearme): 2 a 400 centesimas de mm (0.02 a 4.00 mm).
  - Remapeo documentado en protocolo: tecla L (fila 2, col 9, indice 37) confirmada por el usuario con keycode capturado 0x0047 (Scroll Lock).
  - Codificador y decodificador de tablas 13 y 14 con verificacion automatica byte a byte contra capturas de trafico USB.
  - Transporte real node-hid conectado a la interfaz de control (UP 0xFF60, usage 0x61), con enmarcado estricto (33 bytes con 0 inicial via `write()`, sin `sendFeatureReport`, recepcion de eco de 32 bytes) protegido detras de una opcion explicita (`PERIPHERALS_HUB_ALLOW_HARDWARE_WRITE` o selector en interfaz), desactivada por defecto.
  - Interfaz grafica con rotulacion clara indicando que los valores corresponden al perfil guardado en el hub (no leido del hardware), adaptacion dinamica del boton de guardado segun el modo ("Guardar Perfil" vs "Guardar y Enviar al Teclado") y modal de confirmacion con comprobacion de diferencias y aviso de cierre del driver oficial.
  - Acceso para importar perfiles desde capturas JSON tanto desde la interfaz (boton "Importar Captura") como desde linea de comandos (`pnpm import-profile`), con validacion de tablas completas e informe detallado (rechazo estricto ante capturas sin tablas).
  - Gestion de tres estados en la matriz de teclas: borrador con cambios pendientes, perfil guardado en el hub y ultimo enviado al teclado. Marca visual de pendiente en cada tecla modificada tras asignar valores por lote, que se sincroniza inmediatamente tras aplicar sin recargar la vista.
  - Selector de modo de visualizacion en la matriz para alternar entre recorrido de actuacion y Rapid Trigger (indicando ON/OFF y sensibilidades de pulsacion y rearme).
  - Indicador persistente del estado del perfil ("solo guardado en el hub" o "enviado al teclado a las HH:MM") e informe transparente del resultado del envio (trozos confirmados por eco 7/7 y 18/18 o motivo exacto del fallo).
  - Nomenclatura rigurosa de la matriz: posicion 41 identificada como "Tecla 41", evitando etiquetas inventadas.
  - Suite de pruebas unificada con `pnpm test`.

## Como ejecutar

```bash
# Instalar dependencias
pnpm install

# Comprobar tipos TypeScript
pnpm typecheck

# Ejecutar suite de pruebas (codec, transmisor y enmarcado de transporte)
pnpm test

# Importar perfil desde un archivo de captura JSON
pnpm import-profile captures/mad60he_actuacion_[tecla]_[antes]_a_[despues].json

# Construir la aplicacion completa (Renderer y Main)
pnpm build

# Ejecutar la aplicacion Electron (modo seguro por defecto)
pnpm start

# Ejecutar la aplicacion con transmision real a hardware habilitada
cross-env PERIPHERALS_HUB_ALLOW_HARDWARE_WRITE=1 pnpm start

# Enumerar dispositivos HID desde consola
pnpm list-hid

# Recompilar node-hid para Electron si fuera necesario
pnpm rebuild:node-hid
```

## Como anadir un driver

1. Crear una carpeta dentro de `drivers/<identificador>/` (o en `%APPDATA%/peripherals-hub/drivers/<identificador>/`).
2. Crear `manifest.json` definiendo:
   - `id`, `name`, `category` ('mouse', 'keyboard', etc.).
   - `devices`: lista de `{ vendorId, productId, name }`.
   - `controlInterface`: `{ usagePage, usage }` del canal de control verificado.
   - `capabilities`: lista de capacidades usando controles primitivos ('slider', 'select', 'toggle', 'color', 'readonly', 'key-matrix'). Iniciar vacio `[]` hasta documentar los paquetes en `docs/protocol/`.
3. Crear `index.ts` o `index.js` exportando una clase que implemente `Driver` (`connect`, `readState`, `apply`, `disconnect`).