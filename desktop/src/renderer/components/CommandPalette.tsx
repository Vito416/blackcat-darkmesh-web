import React, { useEffect, useRef, useState } from "react";

import useFocusTrap from "../hooks/useFocusTrap";
import { useI18n } from "../locales";

export interface CommandPaletteAction {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  groupId?: string;
  target?: string;
  scope?: string;
  run: () => void | boolean | Promise<void | boolean>;
}

export interface CommandPaletteSection {
  id: string;
  title: string;
  items: CommandPaletteAction[];
}

interface CommandPaletteProps {
  open: boolean;
  query: string;
  selectedIndex: number;
  sections: CommandPaletteSection[];
  flattened: CommandPaletteAction[];
  inputRef: React.RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onSelectIndex: (index: number) => void;
  onExecute: (action: CommandPaletteAction) => void | Promise<void>;
  onClose: () => void;
}

const FX_STORAGE_KEY = "darkmesh-palette-fx";

const getInitialFxSetting = (): boolean => {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(FX_STORAGE_KEY);
  if (stored === "off") return false;
  if (stored === "on") return true;
  return true;
};

const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  query,
  selectedIndex,
  sections,
  flattened,
  inputRef,
  onQueryChange,
  onSelectIndex,
  onExecute,
  onClose,
}) => {
  const { messages } = useI18n();
  const paletteText = messages.paletteUi;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [fxEnabled, setFxEnabled] = useState<boolean>(() => getInitialFxSetting());

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [inputRef, open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FX_STORAGE_KEY, fxEnabled ? "on" : "off");
  }, [fxEnabled]);

  useFocusTrap(dialogRef, { active: open, initialFocus: inputRef.current, onEscape: onClose });

  if (!open) return null;

  const titleId = "command-palette-title";
  const descriptionId = "command-palette-hint";

  return (
    <div className={`command-palette-backdrop ${fxEnabled ? "fx-on" : "fx-off"}`} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`command-palette ${fxEnabled ? "fx-on" : "fx-off"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-header">
          <div>
            <p className="eyebrow">{paletteText.eyebrow}</p>
            <h3 id={titleId}>{paletteText.title}</h3>
          </div>
          <div className="command-palette-actions">
            <button
              className="ghost small"
              type="button"
              onClick={() => setFxEnabled((prev) => !prev)}
              aria-pressed={fxEnabled}
              title={fxEnabled ? "Turn off palette visuals" : "Turn on palette visuals"}
            >
              {fxEnabled ? "FX on" : "FX off"}
            </button>
            <button className="ghost small" type="button" onClick={onClose}>
              {paletteText.close}
            </button>
          </div>
        </div>

        <label className="command-palette-input">
          <span className="sr-only">{paletteText.searchLabel}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={paletteText.searchPlaceholder}
            aria-label={paletteText.searchLabel}
          />
        </label>

        <div
          className="command-palette-list"
          role="listbox"
          aria-label={paletteText.title}
          aria-activedescendant={flattened[selectedIndex]?.id}
        >
          {flattened.length === 0 ? (
            <div className="command-palette-empty">
              <strong>{paletteText.emptyTitle}</strong>
              <span>{paletteText.emptyHint}</span>
            </div>
          ) : (
            (() => {
              let runningIndex = 0;
              return sections.map((section) => {
                const startIndex = runningIndex;
                runningIndex += section.items.length;
                return (
                  <div key={section.id} className="command-palette-section" role="group" aria-label={section.title}>
                    <div className="command-palette-section-head">
                      <span className="eyebrow">{section.title}</span>
                      <span className="command-palette-count">{section.items.length}</span>
                    </div>
                    <div className="command-palette-section-items">
                      {section.items.map((action, index) => {
                        const globalIndex = startIndex + index;
                        const active = globalIndex === selectedIndex;
                        return (
                          <button
                            key={action.id}
                            id={action.id}
                            type="button"
                            className={`command-palette-item ${active ? "active" : ""}`}
                            onMouseEnter={() => onSelectIndex(globalIndex)}
                            onClick={() => void onExecute(action)}
                            role="option"
                            aria-selected={active}
                          >
                            <div className="command-palette-copy">
                              <strong>{action.label}</strong>
                              <span>{action.description}</span>
                            </div>
                            {action.shortcut && <kbd>{action.shortcut}</kbd>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>

        <footer className="command-palette-footer">
          <span id={descriptionId}>{paletteText.footerNavigate}</span>
          <span>{paletteText.footerToggle}</span>
          <span>{paletteText.footerClose}</span>
          <span className="command-palette-hint">{paletteText.fuzzyHint}</span>
        </footer>
      </section>
    </div>
  );
};

export default CommandPalette;
