import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Only the public service address is embedded. Provider keys stay in the native private build.
const published = JSON.parse(readFileSync(new URL("../platform/mobile-config.json", import.meta.url), "utf8"));
const origin = new URL(published.serviceUrl);
if (published.apiVersion !== "1" || origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid public OncoFlow service configuration.");
export default defineConfig({
  plugins: [react()],
  base: "./",
  define: { "import.meta.env.VITE_ONCOFLOW_SERVICE_ORIGIN": JSON.stringify(origin.origin) },
});
