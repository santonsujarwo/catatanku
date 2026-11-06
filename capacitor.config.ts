import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "id.catatku.app",
  appName: "CatatKu",
  webDir: "out",
  bundledWebRuntime: false,
  backgroundColor: "#f4f8fa",
  android: {
    backgroundColor: "#f4f8fa",
  },
};

export default config;
