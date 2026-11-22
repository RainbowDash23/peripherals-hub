# Peripherals Hub

Hub de escritorio modular (Electron, React, TypeScript y node-hid en Windows 11) para configurar perifericos de alto rendimiento sin software privativo.

## Estado actual

- Arquitectura modular desacoplada basada en drivers por carpeta (`drivers/`).
- Enumeracion pasiva de hardware HID funcional (`pnpm list-hid`).
- Identificacion de hardware realizada para mouse Ajazz AJ159 Pro y teclado MAD60HE.
- Especificacion del protocolo y diseno de contratos de drivers en revision.

## Como ejecutar

```bash
# Instalar dependencias
pnpm install

# Comprobar tipos TypeScript
pnpm typecheck

# Enumerar dispositivos HID conectados en modo pasivo
pnpm list-hid
```

## Como anadir un driver

1. Crear una carpeta dentro de `drivers/<identificador-dispositivo>/`.
2. Definir `manifest.json` con vendorId, productId, usagePage y lista de capacidades soportadas.
3. Crear `driver.ts` implementando la interfaz estandar `Driver` (`connect`, `readState`, `apply`, `disconnect`).
4. Documentar los paquetes capturados que respaldan la implementacion en `docs/protocol/<identificador-dispositivo>/`.