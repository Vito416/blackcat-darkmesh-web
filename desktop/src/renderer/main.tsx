import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Minimal process shim so browser-only renderer can load Node-oriented deps (e.g. aoconnect bundles
// readable-stream) without crashing on `process` access.
const globalAny = globalThis as unknown as {
  process?: {
    browser?: boolean;
    env?: Record<string, string | undefined>;
    version?: string;
    nextTick?: typeof queueMicrotask;
  };
};

if (!globalAny.process) {
  globalAny.process = { browser: true, env: {}, version: "0.0.0", nextTick: queueMicrotask };
} else {
  globalAny.process.browser ??= true;
  globalAny.process.env ??= {};
  globalAny.process.version ??= "0.0.0";
  globalAny.process.nextTick ??= queueMicrotask;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
