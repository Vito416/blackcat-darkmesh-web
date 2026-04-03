import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import stylesUrl from "./styles.css?url";
import themeCssUrl from "./theme.generated.css?url";
import { installNetworkGuards } from "./services/networkGuard";
import { installRedactedConsole } from "../shared/logging";

const preloadStyle = (href: string) => {
  if (typeof document === "undefined") return;
  if (document.head.querySelector(`link[rel=\"preload\"][href=\"${href}\"]`)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "style";
  link.href = href;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
};

preloadStyle(themeCssUrl);
preloadStyle(stylesUrl);

installRedactedConsole("renderer");
installNetworkGuards();

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
    <ErrorBoundary name="Renderer">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
