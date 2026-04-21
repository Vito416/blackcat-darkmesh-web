type PerfDetail = Record<string, unknown> | undefined;

export type PerfEvent = {
  name: string;
  durationMs: number;
  at: string;
  detail?: PerfDetail;
};

const perfLog: PerfEvent[] = [];

const supportsPerfMark = typeof performance !== "undefined" && typeof performance.mark === "function";

const pushEvent = (event: PerfEvent) => {
  perfLog.push(event);
  // Expose to tests/debug tools without polluting production globals.
  const globalSink = (window as unknown as { __darkmeshPerfLog?: PerfEvent[] }).__darkmeshPerfLog;
  if (globalSink) {
    globalSink.push(event);
  } else {
    (window as unknown as { __darkmeshPerfLog?: PerfEvent[] }).__darkmeshPerfLog = [...perfLog];
  }

  const telemetry = (window as unknown as { api?: { telemetry?: (payload: any) => Promise<{ ok: true }> } }).api?.telemetry;
  if (telemetry) {
    void telemetry({ event: "perf", at: event.at, detail: { name: event.name, durationMs: event.durationMs, ...event.detail } }).catch(
      () => {
        // Telemetry is best-effort; ignore failures to avoid user-facing impact.
      },
    );
  }
};

export const perfMark = (label: string): string => {
  const markId = supportsPerfMark ? `${label}:${Date.now()}` : label;
  if (supportsPerfMark) performance.mark(markId);
  return markId;
};

export const perfMeasure = (name: string, startMark?: string | null, detail?: PerfDetail): PerfEvent => {
  const at = new Date().toISOString();
  let durationMs = 0;

  if (supportsPerfMark && startMark) {
    try {
      const measureName = `${name}:${at}`;
      performance.measure(measureName, startMark);
      const entries = performance.getEntriesByName(measureName);
      durationMs = entries[0]?.duration ?? 0;
    } catch {
      durationMs = 0;
    }
  } else if (supportsPerfMark) {
    const entries = performance.getEntriesByName(name);
    durationMs = entries[entries.length - 1]?.duration ?? 0;
  }

  const event: PerfEvent = { name, durationMs, at, detail };
  pushEvent(event);
  return event;
};

export const getPerfLog = (): PerfEvent[] => [...perfLog];
