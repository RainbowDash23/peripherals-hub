/**
 * Script de Preload con contextBridge.
 * Expone únicamente APIs seguras e indirectas hacia el Renderer.
 * No expone nodeIntegration ni APIs sin validar.
 */

export interface PeripheralsHubApi {
  readonly platform: string;
  readonly getAppVersion: () => Promise<string>;
}

export const peripheralsHubApi: PeripheralsHubApi = {
  platform: process.platform,
  getAppVersion: async () => '1.0.0',
};
