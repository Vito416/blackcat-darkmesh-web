import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import purgeCss from "vite-plugin-purgecss";

const enableBundleReport = process.env.BUNDLE_REPORT === "true" || process.env.ANALYZE === "true";

const rendererRoot = path.resolve(__dirname, "src/renderer");
const rendererOutDir = path.resolve(__dirname, "dist/renderer");
const toPosix = (value: string) => value.replace(/\\/g, "/");

const purgeCssPlugin = {
  ...purgeCss({
    // Scan renderer sources (JSX/TSX + HTML) to drop unused selectors while keeping data/test hooks.
    content: [
      toPosix(path.join(rendererRoot, "index.html")),
      toPosix(path.join(rendererRoot, "**/*.{ts,tsx,html}")),
    ],
    safelist: {
      // Preserve selectors driven by runtime flags and tests (data-*, aria-* and data-testid patterns).
      standard: [/data-[\w-:]+/, /aria-[\w-]+/, /data-testid/],
    },
    defaultExtractor: (content) => content.match(/[\w-/:@]+/g) ?? [],
  }),
  apply: "build" as const,
};

const vendorChunkMap = [
  { match: "@permaweb/aoconnect", chunk: "vendor-ao-connect" },
  { match: "lottie-web", chunk: "vendor-lottie" },
  { match: "gsap", chunk: "vendor-gsap" },
  { match: "three", chunk: "vendor-three" },
  { match: "dexie", chunk: "vendor-dexie" },
  { match: "react", chunk: "vendor-react" },
];

export default defineConfig({
  plugins: [
    react(),
    purgeCssPlugin,
    ...(enableBundleReport
      ? [
          visualizer({
            filename: path.resolve(__dirname, "dist/renderer/bundle-report.html"),
            gzipSize: true,
            brotliSize: true,
            template: "treemap",
            open: false,
          }),
        ]
      : []),
  ],
  root: rendererRoot,
  base: "./",
  build: {
    outDir: rendererOutDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");

          // Vendor bundles
          if (normalized.includes("node_modules")) {
            const vendor = vendorChunkMap.find(({ match }) => normalized.includes(match));
            if (vendor) return vendor.chunk;
          }

          // Feature / panel chunks (keep heavier panels isolated)
          const featureChunks: Record<string, string> = {
            "/components/ManifestRenderer": "chunk-manifest-renderer",
            "/components/AoHolomap": "chunk-ao-holomap",
            "/components/AoLogPanel": "chunk-ao-log",
            "/components/DraftDiffPanel": "chunk-draft-diff",
            "/components/HeroCanvas": "chunk-fx-hero",
            "/components/CyberBlockPreview": "chunk-fx-preview",
            "/components/VaultCrystal": "chunk-fx-vault",
          };

          const matched = Object.entries(featureChunks).find(([key]) => normalized.includes(key));
          if (matched) return matched[1];
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@permaweb/aoconnect", "lottie-web", "gsap"],
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
