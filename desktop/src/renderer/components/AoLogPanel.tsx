import React, { useMemo, useState } from "react";

import type { AoLogMetrics, AoLogSeverity, AoMiniLogEntry } from "../App";

type AoLogFilter = "all" | "deploy" | "spawn";

type AoLogPanelProps = {
  aoLog: AoMiniLogEntry[];
  metrics: AoLogMetrics;
  pinned: string[];
  onTogglePin: (value: string | null) => void;
  onCopy: (value: string | null, label: string) => void;
  onOpen: (value: string | null) => void;
  onRetry: (entry: AoMiniLogEntry) => void;
  onResume: (entry: AoMiniLogEntry) => void;
};

const formatTimestamp = (iso?: string) => {
  if (!iso) return "—";

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }

  const date = parsed.toLocaleDateString();
  const time = parsed.toLocaleTimeString([], { hour12: false });
  return `${date} ${time}`;
};

const tryFormatJson = (text: string) => {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
};

const prettyPayload = (payload?: unknown, raw?: string) => {
  if (payload === undefined) {
    return raw ?? "";
  }

  if (payload === null) {
    return "null";
  }

  if (typeof payload === "string") {
    return tryFormatJson(payload);
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
};

const abbreviate = (value: string) => (value.length <= 16 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`);

const AoLogPanel: React.FC<AoLogPanelProps> = ({
  aoLog,
  metrics,
  pinned,
  onTogglePin,
  onCopy,
  onOpen,
  onRetry,
  onResume,
}) => {
  const [kindFilter, setKindFilter] = useState<AoLogFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<AoLogSeverity | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const kindCounts = useMemo(
    () =>
      aoLog.reduce(
        (acc, entry) => {
          acc.all += 1;
          acc[entry.kind] += 1;
          return acc;
        },
        { all: 0, deploy: 0, spawn: 0 } as Record<AoLogFilter, number>,
      ),
    [aoLog],
  );

  const severityCounts = useMemo(() => {
    const counts: Record<AoLogSeverity | "all", number> = {
      success: 0,
      warning: 0,
      error: 0,
      info: 0,
      all: aoLog.length,
    };

    for (const entry of aoLog) {
      counts[entry.severity] = (counts[entry.severity] ?? 0) + 1;
    }

    return counts;
  }, [aoLog]);

  const pinnedSet = useMemo(() => new Set(pinned), [pinned]);

  const filtered = useMemo(() => {
    let next = kindFilter === "all" ? aoLog : aoLog.filter((entry) => entry.kind === kindFilter);
    if (severityFilter !== "all") {
      next = next.filter((entry) => entry.severity === severityFilter);
    }
    return next;
  }, [aoLog, kindFilter, severityFilter]);

  const timelineEntries = useMemo(() => filtered.slice(0, 8).reverse(), [filtered]);

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="ao-log-panel">
      <div className="ao-log-panel-header">
        <div>
          <p className="eyebrow">AO console log</p>
          <h4>Action payloads</h4>
          <p className="subtle">Timeline, severity filters, retry/resume, and pinned AO ids.</p>
        </div>
        <div className="ao-log-toolbar">
          <div className="ao-log-filters" role="group" aria-label="Filter AO log">
            {(["all", "deploy", "spawn"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${kindFilter === value ? "active" : ""}`}
                onClick={() => setKindFilter(value)}
              >
                {value} ({kindCounts[value]})
              </button>
            ))}
          </div>
          <div className="ao-log-filters" role="group" aria-label="Filter by severity">
            {(["all", "success", "warning", "error", "info"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`chip ${severityFilter === value ? "active" : ""} severity-${value}`}
                onClick={() => setSeverityFilter(value)}
              >
                {value} ({severityCounts[value] ?? 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ao-log-metrics">
        <div className="ao-log-metric-card">
          <p className="eyebrow">Success rate</p>
          <div className="ao-log-metric-value">{metrics.successRate != null ? `${metrics.successRate}%` : "—"}</div>
          <span className={`ao-log-badge ${metrics.successRate && metrics.successRate >= 90 ? "success" : "warn"}`}>
            last 30 actions
          </span>
        </div>
        <div className="ao-log-metric-card">
          <p className="eyebrow">Avg latency</p>
          <div className="ao-log-metric-value">{metrics.averageLatency != null ? `${metrics.averageLatency} ms` : "—"}</div>
          <span className="ao-log-badge subtle">{metrics.counts.error ? `${metrics.counts.error} errors` : "clean"}</span>
        </div>
        <div className="ao-log-metric-card sparkline-card">
          <div className="ao-log-metric-row">
            <p className="eyebrow">Latency trend</p>
            <span className="ao-log-badge subtle">sparkline</span>
          </div>
          {metrics.sparkline ? (
            <div className="ao-log-sparkline" aria-label="AO latency sparkline">
              <svg
                viewBox={`0 0 ${metrics.sparkline.width} ${metrics.sparkline.height}`}
                width="100%"
                height={metrics.sparkline.height}
                role="presentation"
              >
                <path d={metrics.sparkline.path} className="sparkline-path" />
                {metrics.sparkline.points.map((point, idx) => (
                  <circle
                    key={`${point.x}-${idx}`}
                    cx={point.x}
                    cy={point.y}
                    r={idx === metrics.sparkline.points.length - 1 ? 2.6 : 1.8}
                    className="sparkline-dot"
                  />
                ))}
              </svg>
              <div className="ao-log-sparkline-meta">
                <span className="mono">Last {metrics.sparkline.latest} ms</span>
                <span className="mono subtle">
                  min {metrics.sparkline.min} • max {metrics.sparkline.max}
                </span>
              </div>
            </div>
          ) : (
            <p className="hint">Run a deploy or spawn to capture timing.</p>
          )}
        </div>
      </div>

      {pinned.length ? (
        <div className="ao-log-pins" aria-label="Pinned AO ids">
          <div className="ao-log-pin-head">
            <p className="eyebrow">Favorites</p>
            <span className="ao-log-badge subtle">{pinned.length} pinned</span>
          </div>
          <div className="ao-log-pin-list">
            {pinned.map((value) => (
              <div key={value} className="ao-pin-pill">
                <span className="ao-pin-id mono" title={value}>
                  {abbreviate(value)}
                </span>
                <div className="ao-pin-actions">
                  <button className="ghost small" type="button" onClick={() => onCopy(value, "AO id")}>
                    Copy
                  </button>
                  <button className="ghost small" type="button" onClick={() => onOpen(value)}>
                    Open
                  </button>
                  <button className="ghost small" type="button" onClick={() => onTogglePin(value)}>
                    Unpin
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="ao-log-timeline">
        <div className="ao-log-timeline-head">
          <p className="eyebrow">Log timeline</p>
          <span className="ao-log-badge subtle">last {timelineEntries.length || 0} events</span>
        </div>
        <div className="ao-log-timeline-track">
          {timelineEntries.length ? (
            timelineEntries.map((entry, index) => {
              const key = `${entry.kind}-${entry.time}-${entry.id ?? "none"}-timeline-${index}`;
              const isPinned = entry.id ? pinnedSet.has(entry.id) : false;
              const isTransient = entry.context?.transient || entry.status.toLowerCase().includes("placeholder");
              const showRetry = entry.severity === "error";
              const showResume = isTransient || entry.severity === "warning";

              return (
                <div key={key} className={`ao-log-timeline-item ${entry.severity}`}>
                  <div className="ao-log-timeline-dot" />
                  <div className="ao-log-timeline-meta">
                    <span className={`mini-log-kind ${entry.kind}`}>{entry.kind}</span>
                    <span className={`ao-severity-badge ${entry.severity}`}>{entry.severity}</span>
                    {entry.durationMs != null ? (
                      <span className="ao-latency-pill">{entry.durationMs} ms</span>
                    ) : null}
                  </div>
                  <div className="ao-log-timeline-id mono" title={entry.id ?? ""}>
                    {entry.id ? abbreviate(entry.id) : "—"}
                  </div>
                  <div className="ao-log-timeline-actions">
                    <button
                      className="ghost tiny"
                      type="button"
                      onClick={() => onCopy(entry.id, entry.kind === "deploy" ? "Deploy tx" : "Process id")}
                      disabled={!entry.id}
                    >
                      Copy
                    </button>
                    <button className="ghost tiny" type="button" onClick={() => onOpen(entry.id)} disabled={!entry.id}>
                      Open
                    </button>
                    {showRetry ? (
                      <button className="ghost tiny" type="button" onClick={() => onRetry(entry)}>
                        Retry
                      </button>
                    ) : null}
                    {showResume ? (
                      <button className="ghost tiny" type="button" onClick={() => onResume(entry)}>
                        Resume
                      </button>
                    ) : null}
                    <button
                      className="ghost tiny"
                      type="button"
                      onClick={() => onTogglePin(entry.id)}
                      disabled={!entry.id}
                    >
                      {isPinned ? "Unpin" : "Pin"}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="ao-log-empty">No AO actions logged yet. Deploy or spawn to fill the timeline.</p>
          )}
        </div>
      </div>

      <div className="ao-log-table-wrap">
        <table className="ao-log-table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">tx / processId</th>
              <th scope="col">Status</th>
              <th scope="col">Latency</th>
              <th scope="col">Time</th>
              <th scope="col">Actions</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((entry, index) => {
                const key = `${entry.kind}-${entry.time}-${entry.id ?? "none"}-${index}`;
                const isOpen = expanded.has(key);
                const detail = prettyPayload(entry.payload, entry.raw);
                const hasPayload = entry.payload !== undefined || entry.raw !== undefined;
                const isPinned = entry.id ? pinnedSet.has(entry.id) : false;
                const isTransient = entry.context?.transient || entry.status.toLowerCase().includes("placeholder");

                return (
                  <React.Fragment key={key}>
                    <tr>
                      <td>
                        <span className={`mini-log-kind ${entry.kind}`}>{entry.kind}</span>
                      </td>
                      <td>
                        <span className={`mini-log-id ${entry.id ? "mono" : "empty"}`} title={entry.id ?? ""}>
                          {entry.id ?? "—"}
                        </span>
                      </td>
                      <td>
                        <div className="ao-log-status-cell">
                          <span className={`mini-log-status ${entry.status.toLowerCase()}`}>{entry.status}</span>
                          <span className={`ao-severity-badge ${entry.severity}`}>{entry.severity}</span>
                        </div>
                      </td>
                      <td>
                        <span className="ao-latency-pill">{entry.durationMs != null ? `${entry.durationMs} ms` : "—"}</span>
                      </td>
                      <td>
                        <time dateTime={entry.time}>{formatTimestamp(entry.time)}</time>
                      </td>
                      <td>
                        <div className="mini-log-actions">
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => onCopy(entry.id, entry.kind === "deploy" ? "Deploy tx" : "Process id")}
                            disabled={!entry.id}
                          >
                            Copy
                          </button>
                          <button className="ghost small" type="button" onClick={() => onOpen(entry.id)} disabled={!entry.id}>
                            Open
                          </button>
                          {entry.severity === "error" ? (
                            <button className="ghost small" type="button" onClick={() => onRetry(entry)}>
                              Retry
                            </button>
                          ) : null}
                          {isTransient || entry.severity === "warning" ? (
                            <button className="ghost small" type="button" onClick={() => onResume(entry)}>
                              Resume
                            </button>
                          ) : null}
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => onTogglePin(entry.id)}
                            disabled={!entry.id}
                          >
                            {isPinned ? "Unpin" : "Pin"}
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => toggleExpanded(key)}
                          disabled={!hasPayload}
                          aria-expanded={isOpen}
                        >
                          {hasPayload ? (isOpen ? "Hide JSON" : "Show JSON") : "No payload"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="ao-log-detail">
                        <td colSpan={7}>
                          <pre className="ao-log-json">{detail}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="ao-log-empty">
                  No AO actions logged yet. Deploy or spawn to capture the console output.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AoLogPanel;
