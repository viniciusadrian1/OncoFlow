import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "br.com.oncoflow.paciente",
  appName: "OncoFlow",
  webDir: "dist",
  backgroundColor: "#EAF3F4",
  loggingBehavior: "none",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    StatusBar: { style: "LIGHT", backgroundColor: "#EAF3F4" },
  },
};

export default config;
