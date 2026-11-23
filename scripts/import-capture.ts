import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { importProfileFromCapture, saveProfile, getMad60HeStoragePath } from '../drivers/mad60he/protocol/storage.js';

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Uso: pnpm tsx scripts/import-capture.ts <ruta-al-archivo-de-captura.json>');
    console.error('Ejemplo: pnpm tsx scripts/import-capture.ts captures/mad60he_actuacion_a_de_010_a_150.json');
    process.exit(1);
  }

  const capturePath = resolve(process.cwd(), args[0]!);
  if (!existsSync(capturePath)) {
    console.error(`Error: Archivo de captura no encontrado en "${capturePath}"`);
    process.exit(1);
  }

  try {
    const profile = importProfileFromCapture(capturePath);
    saveProfile(profile);
    const dest = getMad60HeStoragePath();
    console.log(`Perfil reconstruido e importado con exito desde: ${capturePath}`);
    console.log(`Guardado en: ${dest}`);
    console.log(`Total de teclas configuradas: ${profile.keys.length}`);
  } catch (error) {
    console.error('Error al procesar archivo de captura:', error);
    process.exit(1);
  }
}

main();
