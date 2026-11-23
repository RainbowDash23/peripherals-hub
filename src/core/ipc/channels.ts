export const IPC_CHANNELS = {
  PERIPHERALS_GET_ALL: 'peripherals:get-all',
  PERIPHERALS_UPDATED: 'peripherals:updated',
  DRIVERS_GET_ALL: 'drivers:get-all',
  DRIVER_READ_STATE: 'driver:read-state',
  DRIVER_PREPARE_APPLY: 'driver:prepare-apply',
  DRIVER_APPLY: 'driver:apply',
  DRIVER_IMPORT_CAPTURE: 'driver:import-capture',
  LAB_START_MONITORING: 'lab:start-monitoring',
  LAB_STOP_MONITORING: 'lab:stop-monitoring',
  LAB_REPORT_RECEIVED: 'lab:report-received',
  LAB_ERROR: 'lab:error',
  APP_GET_VERSION: 'app:get-version',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
