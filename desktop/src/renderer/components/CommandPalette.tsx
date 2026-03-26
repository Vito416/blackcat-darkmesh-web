import React, { useEffect, useRef } from "react";

import useFocusTrap from "../hooks/useFocusTrap";

export interface CommandPaletteAction {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  query: string;
  selectedIndex: number;
  actions: CommandPaletteAction[];
  inputRef: React.RefObject<HTMLInputElement>;
  onQueryChange: (value: string) => void;
  onSelectIndex: (index: number) => void;
  onExecute: (action: CommandPaletteAction) => void | Promise<void>;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  query,
  selectedIndex,
  actions,
  inputRef,
  onQueryChange,
  onSelectIndex,
  onExecute,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [inputRef, open]);

  useFocusTrap(dialogRef, { active: open, initialFocus: inputRef.current, onEscape: onClose });

  if (!open) return null;

  const titleId = "command-palette-title";
  const descriptionId = "command-palette-hint";

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-header">
          <div>
            <p className="eyebrow">Command palette</p>
            <h3 id={titleId}>Quick actions</h3>
          </div>
          <button className="ghost small" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="command-palette-input">
          <span className="sr-only">Search actions</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search actions"
            aria-label="Search actions"
          />
        </label>

        <div
          className="command-palette-list"
          role="listbox"
          aria-label="Available commands"
          aria-activedescendant={actions[selectedIndex]?.id}
        >
          {actions.length === 0 ? (
            <div className="command-palette-empty">
              <strong>No actions match</strong>
              <span>Try a different search term.</span>
            </div>
          ) : (
            actions.map((action, index) => {
              const active = index === selectedIndex;

              return (
                <button
                  key={action.id}
                  id={action.id}
                  type="button"
                  className={`command-palette-item ${active ? "active" : ""}`}
                  onMouseEnter={() => onSelectIndex(index)}
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
            })
          )}
        </div>

        <footer className="command-palette-footer">
          <span id={descriptionId}>Tab or Shift+Tab to move; Enter runs the highlighted action.</span>
          <span>Cmd/Ctrl+K to toggle</span>
          <span>Esc to close</span>
        </footer>
      </section>
    </div>
  );
};

export default CommandPalette;
