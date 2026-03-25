import React from "react";

import type { DraftDiffEntry } from "../utils/draftDiff";

export type DraftDiffOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
};

type CherryPickAction = "add" | "replace" | "remove";

interface DraftDiffPanelProps {
  open: boolean;
  loading: boolean;
  entries: DraftDiffEntry[];
  options: DraftDiffOption[];
  rightValue: string | null;
  leftLabel: string;
  leftDetail?: string;
  rightLabel?: string;
  rightDetail?: string;
  onClose: () => void;
  onSelectRight: (value: string) => void;
  onCherryPick: (entry: DraftDiffEntry, action: CherryPickAction) => void;
}

const actionLabel: Record<CherryPickAction, string> = {
  add: "Add node",
  replace: "Replace node",
  remove: "Remove node",
};

const DraftDiffPanel: React.FC<DraftDiffPanelProps> = ({
  open,
  loading,
  entries,
  options,
  rightValue,
  leftLabel,
  leftDetail,
  rightLabel,
  rightDetail,
  onClose,
  onSelectRight,
  onCherryPick,
}) => {
  if (!open) return null;

  const counts = entries.reduce(
    (acc, entry) => {
      acc[entry.kind] += 1;
      return acc;
    },
    { added: 0, changed: 0, removed: 0 },
  );

  const handleAction = (entry: DraftDiffEntry) => {
    const action: CherryPickAction =
      entry.kind === "added" ? "add" : entry.kind === "removed" ? "remove" : "replace";
    onCherryPick(entry, action);
  };

  return (
    <div
      className="draft-diff-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Draft diff panel"
      onClick={onClose}
    >
      <div className="draft-diff-shell" onClick={(event) => event.stopPropagation()}>
        <header className="draft-diff-head">
          <div>
            <p className="eyebrow">Draft diff</p>
            <h3>Cherry-pick changes</h3>
            <p className="hint">Compare the in-progress manifest against a saved draft or revision.</p>
          </div>
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="draft-diff-sources">
          <div className="diff-source-card">
            <span className="eyebrow">Left</span>
            <strong>{leftLabel}</strong>
            {leftDetail && <p className="subtle">{leftDetail}</p>}
          </div>
          <div className="diff-source-card">
            <span className="eyebrow">Right</span>
            <select
              value={rightValue ?? ""}
              onChange={(e) => void onSelectRight(e.target.value)}
              aria-label="Select draft or revision to diff"
            >
              <option value="">Choose draft or revision…</option>
              {options.map((option) => (
                <option key={option.value} value={option.value} title={option.description ?? option.label}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="diff-source-detail">
              <span className="pill ghost">{rightLabel ?? "No comparison selected"}</span>
              <span className="subtle">{rightDetail ?? "Pick a source to load the diff."}</span>
            </div>
          </div>
          <div className="diff-summary-chips">
            <span className="pill added">+{counts.added} added</span>
            <span className="pill changed">~{counts.changed} changed</span>
            <span className="pill removed">-{counts.removed} removed</span>
          </div>
        </div>

        <div className="draft-diff-body">
          {loading ? (
            <p className="hint">Loading draft…</p>
          ) : rightValue == null || rightValue === "" ? (
            <p className="hint">Select a draft or revision to see differences.</p>
          ) : entries.length === 0 ? (
            <div className="empty">
              <p>No diffs found</p>
              <span>The selected source matches the current manifest.</span>
            </div>
          ) : (
            <div className="draft-diff-list">
              {entries.map((entry) => {
                const action =
                  entry.kind === "added" ? "add" : entry.kind === "removed" ? "remove" : "replace";
                return (
                  <article key={entry.id} className={`draft-diff-row ${entry.kind}`}>
                    <div className="draft-diff-row-head">
                      <div className="diff-row-meta">
                        <span className={`badge ${entry.kind}`}>{entry.kind}</span>
                        <strong>{entry.title || "Untitled node"}</strong>
                        <span className="pill ghost">{entry.type}</span>
                      </div>
                      <div className="diff-row-paths">
                        <span className="mono">{entry.beforePath || entry.afterPath || "root"}</span>
                        {entry.afterPath && entry.beforePath && entry.afterPath !== entry.beforePath ? (
                          <span className="pill ghost">Moved</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="draft-diff-row-foot">
                      <div className="diff-id mono">{entry.id}</div>
                      <div className="diff-row-actions">
                        <button className="primary small" type="button" onClick={() => handleAction(entry)}>
                          {actionLabel[action]}
                        </button>
                        {entry.kind === "changed" && (
                          <span className="pill ghost">
                            {entry.before && entry.after && JSON.stringify(entry.before.props) !== JSON.stringify(entry.after.props)
                              ? "Props changed"
                              : "Node changed"}
                          </span>
                        )}
                        {entry.kind === "removed" && <span className="pill ghost">Only in current draft</span>}
                        {entry.kind === "added" && <span className="pill ghost">New in comparison</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DraftDiffPanel;
