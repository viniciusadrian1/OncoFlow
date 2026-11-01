import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
export default defineConfig({ define: viteConfig.define, test: { include: ["tests/unit/**/*.test.ts"] } });
