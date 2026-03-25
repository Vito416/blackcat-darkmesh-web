import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DraftDiffEntry, DraftDiffKind } from "../utils/draftDiff";

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
  onStatus?: (message: string) => void;
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
  onStatus,
}) => {
  if (!open) return null;

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const selectRef = useRef<HTMLSelectElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const lastAnnouncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement;
      return;
    }

    setFocusedId(null);
    rowRefs.current.clear();
    lastAnnouncedRef.current = null;

    if (restoreFocusRef.current instanceof HTMLElement && typeof restoreFocusRef.current.focus === "function") {
      restoreFocusRef.current.focus({ preventScroll: true });
    }
  }, [open]);

  const getShortcutKey = useCallback((kind: DraftDiffKind): "a" | "r" | "d" => {
    if (kind === "added") return "a";
    if (kind === "changed") return "r";
    return "d";
  }, []);

  const getAction = useCallback((kind: DraftDiffKind): CherryPickAction => {
    if (kind === "added") return "add";
    if (kind === "changed") return "replace";
    return "remove";
  }, []);

  const focusedEntry = useMemo(() => entries.find((entry) => entry.id === focusedId) ?? null, [entries, focusedId]);

  const focusEntry = useCallback(
    (id: string | null) => {
      setFocusedId(id);
      if (!id) return;
      const el = rowRefs.current.get(id);
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (!entries.length) {
      setFocusedId(null);
      if (selectRef.current) {
        selectRef.current.focus({ preventScroll: true });
      }
      return;
    }

    setFocusedId((current) => {
      if (current && entries.some((entry) => entry.id === current)) return current;
      return entries[0]?.id ?? null;
    });
  }, [entries, open]);

  useEffect(() => {
    if (!open || !focusedId) return;
    const el = rowRefs.current.get(focusedId);
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [focusedId, open]);

  useEffect(() => {
    if (!focusedEntry) {
      lastAnnouncedRef.current = null;
      return;
    }
    if (!open || !onStatus) return;
    if (lastAnnouncedRef.current === focusedEntry.id) return;

    const key = getShortcutKey(focusedEntry.kind).toUpperCase();
    const action = getAction(focusedEntry.kind);
    onStatus(`${key} — ${actionLabel[action]}`);
    lastAnnouncedRef.current = focusedEntry.id;
  }, [focusedEntry, getAction, getShortcutKey, onStatus, open]);

  const setRowRef = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) {
      rowRefs.current.set(id, node);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);

  const moveFocus = useCallback(
    (delta: number) => {
      if (!entries.length) return;
      const currentIndex = entries.findIndex((entry) => entry.id === focusedId);
      const nextIndex = currentIndex === -1 ? 0 : Math.min(entries.length - 1, Math.max(0, currentIndex + delta));
      focusEntry(entries[nextIndex]?.id ?? null);
    },
    [entries, focusEntry, focusedId],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;

      if (target && ["input", "textarea", "select"].includes(target.tagName.toLowerCase())) return;

      if (key === "escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        moveFocus(1);
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        moveFocus(-1);
        return;
      }

      if (!focusedEntry) return;

      const shortcut = getShortcutKey(focusedEntry.kind);
      if (["a", "r", "d"].includes(key)) {
        if (key === shortcut) {
          event.preventDefault();
          onCherryPick(focusedEntry, getAction(focusedEntry.kind));
        } else if (onStatus) {
          event.preventDefault();
          onStatus(`Use ${shortcut.toUpperCase()} to ${actionLabel[getAction(focusedEntry.kind)].toLowerCase()}`);
        }
      }
    },
    [focusedEntry, getAction, getShortcutKey, moveFocus, onCherryPick, onClose, onStatus],
  );

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
      <div
        className="draft-diff-shell"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
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
              ref={selectRef}
              value={rightValue ?? ""}
              onChange={(e) => void onSelectRight(e.target.value)}
              onFocus={() => setFocusedId(null)}
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
            <span
              className="pill ghost shortcut-hint"
              title="Focus a change row, then press A to add, R to replace, or D to remove"
            >
              Hotkeys: A add • R replace • D remove
            </span>
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
                const shortcut = getShortcutKey(entry.kind);
                return (
                  <article
                    key={entry.id}
                    ref={setRowRef(entry.id)}
                    tabIndex={0}
                    role="group"
                    aria-selected={focusedId === entry.id}
                    aria-keyshortcuts={shortcut.toUpperCase()}
                    className={`draft-diff-row ${entry.kind} ${focusedId === entry.id ? "is-focused" : ""}`}
                    onFocus={() => focusEntry(entry.id)}
                    onClick={() => focusEntry(entry.id)}
                  >
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
                        <span className="key-hint" aria-hidden="true">
                          <span className="keycap">{shortcut.toUpperCase()}</span>
                          <span>Shortcut</span>
                        </span>
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
