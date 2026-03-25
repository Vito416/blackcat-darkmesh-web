import React, { useMemo, useState } from "react";

import type { AoMiniLogEntry } from "../App";

type AoLogFilter = "all" | "deploy" | "spawn";

type AoLogPanelProps = {
  aoLog: AoMiniLogEntry[];
  onCopy: (value: string | null, label: string) => void;
  onOpen: (value: string | null) => void;
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

const AoLogPanel: React.FC<AoLogPanelProps> = ({ aoLog, onCopy, onOpen }) => {
  const [filter, setFilter] = useState<AoLogFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const counts = useMemo(
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

  const filtered = useMemo(
    () => (filter === "all" ? aoLog : aoLog.filter((entry) => entry.kind === filter)),
    [aoLog, filter],
  );

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
        </div>
        <div className="ao-log-filters" role="group" aria-label="Filter AO log">
          {(["all", "deploy", "spawn"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {value} ({counts[value]})
            </button>
          ))}
        </div>
      </div>
      <div className="ao-log-table-wrap">
        <table className="ao-log-table">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">tx / processId</th>
              <th scope="col">Status</th>
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
                        <span className={`mini-log-status ${entry.status.toLowerCase()}`}>{entry.status}</span>
                      </td>
                      <td>
                        <time dateTime={entry.time}>{formatTimestamp(entry.time)}</time>
                      </td>
                      <td>
                        <div className="mini-log-actions">
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              onCopy(entry.id, entry.kind === "deploy" ? "Deploy tx" : "Process id")
                            }
                            disabled={!entry.id}
                          >
                            Copy
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => onOpen(entry.id)}
                            disabled={!entry.id}
                          >
                            Open
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
                        <td colSpan={6}>
                          <pre className="ao-log-json">{detail}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="ao-log-empty">
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
