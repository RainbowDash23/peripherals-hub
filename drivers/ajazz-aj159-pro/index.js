// drivers/ajazz-aj159-pro/manifest.json
var manifest_default = {
  id: "ajazz-aj159-pro",
  name: "Ajazz AJ159 Pro",
  category: "mouse",
  version: "0.1.0",
  devices: [
    {
      vendorId: "0x3151",
      productId: "0x4026",
      name: "AJAZZ AJ159 PRO"
    }
  ],
  controlInterface: {
    usagePage: "0xFFFF",
    usage: "0x0001"
  },
  capabilities: []
};

// drivers/ajazz-aj159-pro/index.ts
var manifest = manifest_default;
var AjazzAj159ProDriver = class {
  manifest = manifest;
  connection = null;
  async connect(connection) {
    this.connection = connection;
  }
  async readState() {
    return {
      connected: this.connection !== null,
      values: {}
    };
  }
  async apply(_partialState) {
  }
  async disconnect() {
    this.connection = null;
  }
};
var index_default = AjazzAj159ProDriver;
export {
  AjazzAj159ProDriver,
  index_default as default,
  manifest
};
