import React, { useEffect, useRef } from "react";

import useFocusTrap from "../hooks/useFocusTrap";

export interface HotkeyOverlayItem {
  shortcut: string;
  action?: string;
  label?: string;
  description: string;
}

export interface HotkeyOverlaySection {
  title: string;
  items: HotkeyOverlayItem[];
}

interface HotkeyOverlayProps {
  open: boolean;
  sections: HotkeyOverlaySection[];
  onClose: () => void;
  labels: {
    eyebrow: string;
    title: string;
    tableHeaders: { shortcut: string; action: string; details: string };
    footer: { open: string; close: string };
    close: string;
    formatCount?: (count: number) => string;
  };
}

const HotkeyOverlay: React.FC<HotkeyOverlayProps> = ({ open, sections, onClose, labels }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
  }, [open]);

  useFocusTrap(dialogRef, { active: open, initialFocus: closeButtonRef.current, onEscape: onClose });

  if (!open) return null;

  const titleId = "hotkey-overlay-title";
  const descriptionId = "hotkey-overlay-help";

  return (
    <div className="hotkey-overlay-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="hotkey-overlay"
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
          <button ref={closeButtonRef} className="ghost small" type="button" onClick={onClose}>
            {labels.close}
          </button>
        </div>

        <div className="hotkey-overlay-grid">
          {sections.map((section) => (
            <section key={section.title} className="hotkey-section">
              <div className="hotkey-section-head">
                <h4>{section.title}</h4>
                <span>{labels.formatCount ? labels.formatCount(section.items.length) : `${section.items.length} items`}</span>
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
                    const key = `${section.title}-${item.shortcut}-${actionText}`;
                    return (
                      <tr key={key}>
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

        <footer className="hotkey-overlay-footer">
          <span>{labels.footer.open}</span>
          <span id={descriptionId}>{labels.footer.close}</span>
        </footer>
      </section>
    </div>
  );
};

export default HotkeyOverlay;
