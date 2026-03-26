import React, { useEffect, useRef } from "react";

import useFocusTrap from "../hooks/useFocusTrap";

export interface HotkeyOverlayItem {
  shortcut: string;
  action: string;
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
}

const HotkeyOverlay: React.FC<HotkeyOverlayProps> = ({ open, sections, onClose }) => {
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
            <p className="eyebrow">Reference</p>
            <h3 id={titleId}>Hotkeys and palette actions</h3>
          </div>
          <button ref={closeButtonRef} className="ghost small" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="hotkey-overlay-grid">
          {sections.map((section) => (
            <section key={section.title} className="hotkey-section">
              <div className="hotkey-section-head">
                <h4>{section.title}</h4>
                <span>{section.items.length} items</span>
              </div>

              <table className="hotkey-table">
                <thead>
                  <tr>
                    <th scope="col">Shortcut</th>
                    <th scope="col">Action</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={`${section.title}-${item.shortcut}-${item.action}`}>
                      <td>
                        <kbd>{item.shortcut}</kbd>
                      </td>
                      <td>{item.action}</td>
                      <td>{item.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <footer className="hotkey-overlay-footer">
          <span>Shift+/ or ? to open this panel</span>
          <span id={descriptionId}>Esc to close</span>
        </footer>
      </section>
    </div>
  );
};

export default HotkeyOverlay;
