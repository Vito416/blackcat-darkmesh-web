import React, { useEffect, useRef } from "react";

import useFocusTrap from "../hooks/useFocusTrap";
import type { HotkeyScope, HotkeyTarget } from "../locales";

export interface HotkeyOverlayItem {
  shortcut: string;
  action?: string;
  label?: string;
  description: string;
  target?: HotkeyTarget;
}

export interface HotkeyOverlaySection {
  id: string;
  title: string;
  scope?: HotkeyScope;
  items: HotkeyOverlayItem[];
}

export interface HotkeyOverlayGroup {
  id: string;
  title: string;
  scope: HotkeyScope;
  sections: HotkeyOverlaySection[];
}

type ScopeFilter = "active" | "all";

interface HotkeyOverlayProps {
  open: boolean;
  groups: HotkeyOverlayGroup[];
  scopeFilter: ScopeFilter;
  printable: boolean;
  learnMode: boolean;
  onScopeChange?: (mode: ScopeFilter) => void;
  onTogglePrintable?: () => void;
  onToggleLearn?: () => void;
  onHighlight?: (target: HotkeyTarget | null) => void;
  onClose: () => void;
  labels: {
    eyebrow: string;
    title: string;
    scopes: Record<HotkeyScope, string>;
    tableHeaders: { shortcut: string; action: string; details: string };
    footer: { open: string; close: string };
    close: string;
    view: {
      activeWorkspace: string;
      allWorkspaces: string;
      printableOn: string;
      printableOff: string;
      printableHint: string;
      learnOn: string;
      learnOff: string;
      learnHint: string;
      reset: string;
      grouped: string;
    };
    formatCount?: (count: number) => string;
  };
}

const HotkeyOverlay: React.FC<HotkeyOverlayProps> = ({
  open,
  groups,
  scopeFilter,
  printable,
  learnMode,
  onScopeChange,
  onTogglePrintable,
  onToggleLearn,
  onHighlight,
  onClose,
  labels,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open && onHighlight) {
      onHighlight(null);
    }
  }, [open, onHighlight]);

  useFocusTrap(dialogRef, { active: open, initialFocus: closeButtonRef.current, onEscape: onClose });

  if (!open) return null;

  const titleId = "hotkey-overlay-title";
  const descriptionId = "hotkey-overlay-help";

  const handleHighlight = (target?: HotkeyTarget) => {
    if (!onHighlight) return;
    onHighlight(learnMode ? target ?? null : null);
  };

  const totalCount = (sectionCount: number) =>
    labels.formatCount ? labels.formatCount(sectionCount) : `${sectionCount} items`;

  return (
    <div className="hotkey-overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`hotkey-overlay ${printable ? "printable" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="hotkey-overlay-header">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h3 id={titleId}>{labels.title}</h3>
          </div>
          <div className="hotkey-overlay-controls">
            <div className="hotkey-toggle-group" role="group" aria-label={labels.view.grouped}>
              <button
                type="button"
                className={`ghost small ${scopeFilter === "active" ? "active" : ""}`}
                onClick={() => onScopeChange?.("active")}
              >
                {labels.view.activeWorkspace}
              </button>
              <button
                type="button"
                className={`ghost small ${scopeFilter === "all" ? "active" : ""}`}
                onClick={() => onScopeChange?.("all")}
              >
                {labels.view.allWorkspaces}
              </button>
            </div>
            <div className="hotkey-toggle-group" role="group" aria-label={labels.view.learnHint}>
              <button
                type="button"
                className={`ghost small ${learnMode ? "active" : ""}`}
                onClick={onToggleLearn}
              >
                {learnMode ? labels.view.learnOn : labels.view.learnOff}
              </button>
              <button
                type="button"
                className={`ghost small ${printable ? "active" : ""}`}
                title={labels.view.printableHint}
                onClick={onTogglePrintable}
              >
                {printable ? labels.view.printableOn : labels.view.printableOff}
              </button>
              <button type="button" className="ghost small" onClick={() => onHighlight?.(null)}>
                {labels.view.reset}
              </button>
            </div>
            <button ref={closeButtonRef} className="ghost small" type="button" onClick={onClose}>
              {labels.close}
            </button>
          </div>
        </div>

        <div className="hotkey-overlay-body">
          {groups.map((group) => {
            const sectionCount = group.sections.reduce((count, section) => count + section.items.length, 0);
            return (
              <section key={group.id} className="hotkey-group" data-scope={group.scope}>
                <div className="hotkey-group-head">
                  <div>
                    <p className="eyebrow">{labels.scopes[group.scope] ?? group.title}</p>
                    <h4>{group.title}</h4>
                  </div>
                  <span className="hotkey-group-count">{totalCount(sectionCount)}</span>
                </div>

                <div className="hotkey-overlay-grid">
                  {group.sections.map((section) => (
                    <section key={section.id} className="hotkey-section" data-scope={group.scope}>
                      <div className="hotkey-section-head">
                        <h5>{section.title}</h5>
                        <span>{totalCount(section.items.length)}</span>
                      </div>

                      <table className="hotkey-table">
                        <thead>
                          <tr>
                            <th scope="col">{labels.tableHeaders.shortcut}</th>
                            <th scope="col">{labels.tableHeaders.action}</th>
                            <th scope="col">{labels.tableHeaders.details}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.items.map((item) => {
                            const actionText = item.action ?? item.label ?? "—";
                            const key = `${section.id}-${item.shortcut}-${actionText}`;
                            return (
                              <tr
                                key={key}
                                onMouseEnter={() => handleHighlight(item.target)}
                                onMouseLeave={() => onHighlight?.(null)}
                                onFocus={() => handleHighlight(item.target)}
                                onBlur={() => onHighlight?.(null)}
                              >
                                <td>
                                  <kbd>{item.shortcut}</kbd>
                                </td>
                                <td>{actionText}</td>
                                <td>{item.description}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </section>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="hotkey-overlay-footer">
          <span>{labels.footer.open}</span>
          <span id={descriptionId}>{labels.footer.close}</span>
          <span className="hotkey-overlay-hint">{labels.view.learnHint}</span>
        </footer>
      </section>
    </div>
  );
};

export default HotkeyOverlay;
