import type { PeripheralsHubApi } from '../../preload/index.js';

declare global {
  interface Window {
    peripheralsHub?: PeripheralsHubApi;
  }
}
