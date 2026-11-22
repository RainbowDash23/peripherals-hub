# Peripherals Hub

Centralized desktop hub (Electron + React + TypeScript + `node-hid` on Windows 11) for configuring:

- **Ajazz AJ159 Pro** (Wireless/Wired 8K Mouse)
- **MAD60HE** (60% Magnetic Hall Effect Keyboard)

Without relying on bloated, proprietary software.

##  Scripts

### Enumerar dispositivos HID conectados

Para descubrir las interfaces, `vendorId`, `productId`, `usagePage`, `usage`, `interface` y `path` de los periféricos conectados y guardar el resultado en JSON:

```bash
pnpm list-hid
# O pasando una ruta personalizada de salida:
pnpm tsx scripts/list-hid.ts --out mis-dispositivos.json
```

Por defecto, la salida se guarda en `docs/protocol/discovered-hid-devices.json`.