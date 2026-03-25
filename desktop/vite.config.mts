import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@permaweb/aoconnect")) return "aoconnect";
            if (id.includes("react")) return "react";
          }
        },
      },
    },
  },
  server: {
    port: 5174,
    host: "localhost",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    "process.env.AO_MODE": JSON.stringify(process.env.AO_MODE || "legacy"),
    "process.env.AO_URL": JSON.stringify(process.env.AO_URL || ""),
    "process.env.AO_MODULE_TX": JSON.stringify(process.env.AO_MODULE_TX || ""),
    "process.env.WORKER_PIP_BASE": JSON.stringify(process.env.WORKER_PIP_BASE || ""),
    "process.env.WORKER_BASE_URL": JSON.stringify(process.env.WORKER_BASE_URL || ""),
    "process.env.GATEWAY_URL": JSON.stringify(process.env.GATEWAY_URL || ""),
  },
});
