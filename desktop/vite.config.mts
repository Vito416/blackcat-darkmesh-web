import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

const analyze = process.env.ANALYZE === "true";

export default defineConfig({
  plugins: [
    react(),
    ...(analyze
      ? [
          visualizer({
            filename: "dist/renderer/bundle-report.html",
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
          }),
        ]
      : []),
  ],
  root: path.resolve(__dirname, "src/renderer"),
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (id.includes("node_modules")) {
            if (id.includes("@permaweb/aoconnect")) return "ao-connect";
            if (id.includes("three")) return "three";
            if (id.includes("dexie")) return "dexie";
            if (id.includes("react")) return "react";
          }
          if (normalized.includes("/components/ManifestRenderer")) return "manifest-renderer";
          if (normalized.includes("/components/AoHolomap")) return "ao-holomap";
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@permaweb/aoconnect"],
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
