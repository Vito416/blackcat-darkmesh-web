import React, { useRef } from "react";

import draftsDb from "../storage/drafts";
import healthDb from "../storage/healthStore";
import useFocusTrap from "../hooks/useFocusTrap";

type ErrorBoundaryVariant = "full" | "panel" | "overlay";

export type ErrorFallbackRenderProps = {
  error: Error;
  info?: React.ErrorInfo | null;
  scope: string;
  variant: ErrorBoundaryVariant;
  reset: () => void;
  restart: () => void;
  downloadLog: () => Promise<void>;
  downloading: boolean;
  lastDownloadName?: string;
  timestamp?: string;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  name?: string;
  variant?: ErrorBoundaryVariant;
  fallbackRender?: (props: ErrorFallbackRenderProps) => React.ReactNode;
  onReset?: () => void;
  onRestart?: () => void;
};

type ErrorBoundaryState = {
  error: Error | null;
  info: React.ErrorInfo | null;
  downloading: boolean;
  lastDownloadName?: string;
  capturedAt?: string;
};

type DexieTableLike = { name: string; toArray: () => Promise<unknown[]> };
type DexieLike = { name: string; tables: DexieTableLike[] };

type IndexedTableDump = {
  name: string;
  rows?: unknown[];
  error?: string;
};

type IndexedDbDump = {
  name: string;
  tables?: IndexedTableDump[];
  error?: string;
};

type DiagnosticBundle = {
  scope: string;
  capturedAt: string;
  error?: { message: string; stack?: string };
  componentStack?: string;
  userAgent?: string;
  location?: string;
  localStorage?: Record<string, string | null>;
  indexedDb?: IndexedDbDump[];
};

const sanitizeScope = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)+/g, "") || "renderer";

const captureLocalStorage = (): Record<string, string | null> | undefined => {
  if (typeof window === "undefined" || !window.localStorage) return undefined;

  const snapshot: Record<string, string | null> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    snapshot[key] = window.localStorage.getItem(key);
  }
  return snapshot;
};

const captureDexieDb = async (db: DexieLike): Promise<IndexedDbDump> => {
  const tables = await Promise.all(
    db.tables.map(async (table): Promise<IndexedTableDump> => {
      try {
        const rows = await table.toArray();
        return { name: table.name, rows };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to read table";
        return { name: table.name, error: message };
      }
    }),
  );

  return { name: db.name, tables };
};

const captureIndexedDb = async (): Promise<IndexedDbDump[]> => {
  if (typeof indexedDB === "undefined") return [];

  const sources: DexieLike[] = [draftsDb as unknown as DexieLike, healthDb as unknown as DexieLike];

  const results: IndexedDbDump[] = [];
  for (const db of sources) {
    try {
      results.push(await captureDexieDb(db));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to inspect IndexedDB";
      results.push({ name: db.name, error: message });
    }
  }

  return results;
};

const buildDiagnostics = async (
  scope: string,
  error: Error | null,
  info: React.ErrorInfo | null,
): Promise<DiagnosticBundle> => {
  const bundle: DiagnosticBundle = {
    scope,
    capturedAt: new Date().toISOString(),
    error: error ? { message: error.message, stack: error.stack } : undefined,
    componentStack: info?.componentStack || undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    location: typeof window !== "undefined" ? window.location.href : undefined,
    localStorage: captureLocalStorage(),
  };

  try {
    bundle.indexedDb = await captureIndexedDb();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read IndexedDB";
    bundle.indexedDb = [{ name: "diagnostic-capture", error: message }];
  }

  return bundle;
};

const downloadDiagnostics = async (
  scope: string,
  error: Error | null,
  info: React.ErrorInfo | null,
  capturedAt?: string,
): Promise<{ fileName: string }> => {
  if (typeof window === "undefined") return { fileName: "" };

  const payload = await buildDiagnostics(scope, error, info);
  const timestamp = capturedAt ?? payload.capturedAt;
  const stamp = (timestamp || new Date().toISOString()).replace(/[:.]/g, "-");
  const fileName = `${sanitizeScope(scope)}-renderer-log-${stamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();

  window.setTimeout(() => URL.revokeObjectURL(url), 8000);

  return { fileName };
};

const trimStack = (stack?: string): string => {
  if (!stack) return "(no stack available)";
  const lines = stack.split("\n").map((line) => line.trim());
  return lines.slice(0, 10).join("\n");
};

const DefaultFallback: React.FC<ErrorFallbackRenderProps> = ({
  error,
  info,
  scope,
  variant,
  reset,
  restart,
  downloadLog,
  downloading,
  lastDownloadName,
  timestamp,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "error-overlay-title";
  const descriptionId = "error-overlay-desc";
  useFocusTrap(dialogRef, { active: variant === "overlay", onEscape: reset });

  const summaryItems = [
    { label: "Scope", value: scope },
    { label: "Captured", value: timestamp ? new Date(timestamp).toLocaleString() : "Just now" },
    { label: "Message", value: error.message },
  ];

  if (variant === "panel") {
    return (
      <div className="panel-error-card" role="alert">
        <div>
          <p className="eyebrow">{scope}</p>
          <h4>Something broke in this panel</h4>
          <p className="hint">The rest of the app stayed up. Reload just this section.</p>
          <code className="panel-error-stack">{trimStack(error.stack ?? info?.componentStack ?? "")}</code>
          {lastDownloadName ? <p className="subtle">Saved log: {lastDownloadName}</p> : null}
        </div>
        <div className="panel-error-actions">
          <button className="ghost" onClick={reset} type="button">
            Reload panel
          </button>
          <button className="ghost" onClick={() => void downloadLog()} disabled={downloading} type="button">
            {downloading ? "Preparing log…" : "Download log"}
          </button>
          <button className="primary" onClick={restart} type="button">
            Restart app
          </button>
        </div>
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div className="error-overlay" role="presentation">
        <div
          ref={dialogRef}
          className="error-overlay-card"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="eyebrow">{scope}</p>
          <h3 id={titleId}>We hit an error while rendering</h3>
          <p className="hint" id={descriptionId}>
            Try reloading just this panel or restart the app if it persists.
          </p>
          <div className="error-actions">
            <button className="primary" onClick={reset} type="button">
              Reload panel
            </button>
            <button className="ghost" onClick={restart} type="button">
              Restart app
            </button>
            <button className="ghost" onClick={() => void downloadLog()} disabled={downloading} type="button">
              {downloading ? "Preparing log…" : "Download log"}
            </button>
          </div>
          <div className="error-meta">
            <div>
              <p className="eyebrow">Summary</p>
              <ul className="error-summary">
                {summaryItems.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}:</strong> {item.value}
                  </li>
                ))}
                {lastDownloadName ? <li>Saved log: {lastDownloadName}</li> : null}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Stack</p>
              <pre className="error-stack">{trimStack(error.stack ?? info?.componentStack ?? "")}</pre>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="error-screen">
      <div className="error-card" role="alert">
        <p className="eyebrow">Renderer</p>
        <h2>Something went wrong</h2>
        <p className="hint">
          The renderer crashed while drawing <strong>{scope}</strong>. Restart to continue. You can export a support log with
          localStorage and IndexedDB snapshots.
        </p>
        <div className="error-actions">
          <button className="primary" onClick={restart} type="button">
            Restart app
          </button>
          <button className="ghost" onClick={reset} type="button">
            Try again
          </button>
          <button className="ghost" onClick={() => void downloadLog()} disabled={downloading} type="button">
            {downloading ? "Preparing log…" : "Download log"}
          </button>
        </div>
        <div className="error-meta">
          <div>
            <p className="eyebrow">Summary</p>
            <ul className="error-summary">
              {summaryItems.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}:</strong> {item.value}
                </li>
              ))}
              {lastDownloadName ? <li>Saved log: {lastDownloadName}</li> : null}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Stack</p>
            <pre className="error-stack">{trimStack(error.stack ?? info?.componentStack ?? "")}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    info: null,
    downloading: false,
    lastDownloadName: undefined,
    capturedAt: undefined,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error, capturedAt: new Date().toISOString() };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("Renderer error captured by boundary:", error, info);
  }

  private resetBoundary = (): void => {
    this.setState({ error: null, info: null, downloading: false, lastDownloadName: undefined, capturedAt: undefined });
    this.props.onReset?.();
  };

  private restartApp = (): void => {
    if (this.props.onRestart) {
      this.props.onRestart();
      return;
    }

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private downloadLog = async (): Promise<void> => {
    if (this.state.downloading) return;
    this.setState({ downloading: true });

    try {
      const scope = this.props.name ?? "renderer";
      const { fileName } = await downloadDiagnostics(scope, this.state.error, this.state.info, this.state.capturedAt);
      this.setState({ lastDownloadName: fileName });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Unable to download renderer log", err);
    } finally {
      this.setState({ downloading: false });
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const scope = this.props.name ?? "renderer";
    const variant = this.props.variant ?? "full";

    const fallbackProps: ErrorFallbackRenderProps = {
      error: this.state.error,
      info: this.state.info,
      scope,
      variant,
      reset: this.resetBoundary,
      restart: this.restartApp,
      downloadLog: this.downloadLog,
      downloading: this.state.downloading,
      lastDownloadName: this.state.lastDownloadName,
      timestamp: this.state.capturedAt,
    };

    if (this.props.fallbackRender) {
      return this.props.fallbackRender(fallbackProps);
    }

    return <DefaultFallback {...fallbackProps} />;
  }
}

export default ErrorBoundary;
