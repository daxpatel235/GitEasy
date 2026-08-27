import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// Tauri expects a fixed port and does its own error reporting.
export default defineConfig({
  plugins: [react()],

  // The version is read from package.json at build time so the About screen
  // can never drift from what was actually shipped.
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },

  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },

  // Prevent Vite from obscuring Rust errors.
  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Rust rebuilds are handled by Tauri, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },

  envPrefix: ["VITE_", "TAURI_"],

  build: {
    // Tauri uses Chromium on Windows/Linux and WebKit on macOS.
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
