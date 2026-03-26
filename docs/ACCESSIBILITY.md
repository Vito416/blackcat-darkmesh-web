# Accessibility notes

- 2026-03-26 (desktop renderer):
  - Added a focus trap to the vault backup wizard and moved dialog semantics to the modal content.
  - Skip link now shifts focus to `#main-content` and scrolls there for keyboard users.
  - Command palette options expose `role="option"`/`aria-selected` for better screen reader announcement.
  - Modal shells (wizard, command palette, hotkey overlay, draft diff, what's new) show a visible focus ring when programmatically focused.
