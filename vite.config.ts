/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // set VITE_DEV_PROXY to point at a running beacon-server instance
  const proxyTarget = env.VITE_DEV_PROXY;

  return {
    plugins: [react(), tailwindcss()],
    server: proxyTarget
      ? {
          proxy: {
            "/api": { target: proxyTarget, changeOrigin: true, secure: true },
            "/ws": {
              target: proxyTarget.replace(/^http/, "ws"),
              changeOrigin: true,
              secure: true,
              ws: true,
              headers: { Origin: proxyTarget },
            },
          },
        }
      : undefined,
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: "./tests/setup.ts",
    },
  };
});
