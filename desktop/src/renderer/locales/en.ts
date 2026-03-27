import type { HotkeyScope, HotkeyTarget } from "./index";

type LocaleHotkeyItem = {
  shortcut: string;
  action?: string;
  label?: string;
  description: string;
  target?: HotkeyTarget;
};

type LocaleHotkeySection = {
  id: string;
  title: string;
  scope: HotkeyScope;
  items: LocaleHotkeyItem[];
};

const actions = {
  hotkeys: {
    commandPalette: {
      shortcut: "Cmd/Ctrl+K",
      label: "Command palette",
      description: "Open or close the action palette.",
      target: "palette" as HotkeyTarget,
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ or ?",
      label: "Hotkey overlay",
      description: "Open or close this reference panel.",
      target: "palette" as HotkeyTarget,
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Undo",
      description: "Step back through manifest changes (history capped at 20).",
      target: "drafts" as HotkeyTarget,
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Redo",
      description: "Reapply the next manifest change.",
      target: "drafts" as HotkeyTarget,
    },
    closeModal: {
      shortcut: "Esc",
      label: "Close modal",
      description: "Dismiss the palette or the hotkey overlay.",
      target: "palette" as HotkeyTarget,
    },
  },
  toggles: {
    theme: {
      shortcut: "Alt+C",
      label: "Cycle theme preset",
      nextLabel: "Next: {{theme}}",
      overlayDescription: "Flip the active renderer theme.",
      description: {
        on: "Switch back to the light skin.",
        off: "Enable the cyberpunk skin.",
      },
      target: "theme" as HotkeyTarget,
    },
    highEffects: {
      shortcut: "Alt+X",
      label: "Toggle high effects",
      labelOn: "Turn off high effects",
      labelOff: "Enable high effects",
      overlayDescription: "Enable or pause high-visual-effects mode.",
      description: {
        default: "Toggle WebGL hero grid, holograms, and cursor FX.",
        blocked: "Reduced-motion is on, so visual FX stay paused.",
      },
      target: "effects" as HotkeyTarget,
    },
    offline: {
      shortcut: "Alt+O",
      label: "Toggle offline mode",
      labelOn: "Go online (disable offline)",
      labelOff: "Enable offline / air-gap",
      overlayDescription: "Enable or disable renderer offline mode.",
      description: {
        on: "Allow renderer network requests again.",
        off: "Block all network requests from the renderer.",
      },
      target: "offline" as HotkeyTarget,
    },
    health: {
      shortcut: "Alt+H",
      label: "Toggle health panel",
      labelOpen: "Collapse health",
      labelClosed: "Expand health",
      overlayDescription: "Show or hide the diagnostics panel.",
      description: "Show or hide the diagnostics panel.",
      target: "health" as HotkeyTarget,
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Arrow Up/Down",
      label: "Move node",
      description: "Reorder the primary selection among its siblings.",
      target: "drafts" as HotkeyTarget,
    },
    reorderDrag: {
      shortcut: "Drag cards",
      label: "Reorder / nest",
      description: "Drag tree cards to move or nest blocks.",
      target: "drafts" as HotkeyTarget,
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Arrow keys",
      label: "Move selection",
      description: "Step through filtered palette actions.",
      target: "palette" as HotkeyTarget,
    },
    runAction: {
      shortcut: "Enter",
      label: "Run action",
      description: "Execute the selected palette item.",
      target: "palette" as HotkeyTarget,
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Switch to Creator Studio",
      description: "Edit manifests and blocks.",
      target: "workspaces" as HotkeyTarget,
    },
    ao: {
      shortcut: "Alt+2",
      label: "Switch to AO Console",
      description: "Deploy modules and spawn processes.",
      target: "workspaces" as HotkeyTarget,
    },
    data: {
      shortcut: "Alt+3",
      label: "Switch to Data Core",
      description: "Manage encrypted PIP vaults.",
      target: "workspaces" as HotkeyTarget,
    },
    preview: {
      shortcut: "Alt+4",
      label: "Switch to Preview Hub",
      description: "View live manifest previews.",
      target: "workspaces" as HotkeyTarget,
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Wizard · Wallet",
      description: "Focus wallet step in AO deploy.",
      target: "wizard" as HotkeyTarget,
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Wizard · Module",
      description: "Focus module source input.",
      target: "wizard" as HotkeyTarget,
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Wizard · Process",
      description: "Focus manifestTx spawn input.",
      target: "wizard" as HotkeyTarget,
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Vault password",
      description: "Focus password field in Data Core.",
      target: "vault" as HotkeyTarget,
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Vault filter",
      description: "Focus vault records filter field.",
      target: "vault" as HotkeyTarget,
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "SLA failure threshold",
      description: "Focus failure streak input in Health.",
      target: "health" as HotkeyTarget,
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "SLA latency threshold",
      description: "Focus latency threshold input in Health.",
      target: "health" as HotkeyTarget,
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "New draft",
      description: "Start from a blank manifest.",
      target: "drafts" as HotkeyTarget,
    },
    duplicate: {
      shortcut: "Alt+N or Cmd/Ctrl+Shift+D",
      label: "Duplicate draft",
      description: "Save a copy of the current draft.",
      target: "drafts" as HotkeyTarget,
    },
    diff: {
      shortcut: "D",
      label: "Open draft diff",
      description: "Compare current manifest with a saved draft or revision.",
      target: "drafts" as HotkeyTarget,
    },
    save: {
      shortcut: "S",
      label: "Save draft",
      description: "Persist the current manifest to IndexedDB.",
      target: "drafts" as HotkeyTarget,
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Refresh health",
      description: "Run the diagnostics checks again.",
      target: "health" as HotkeyTarget,
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "Load PIP from vault",
      description: "Restore the encrypted PIP document from local vault storage.",
      target: "vault" as HotkeyTarget,
    },
    save: {
      shortcut: "V",
      label: "Save PIP to vault",
      description: "Write the current PIP document into vault storage.",
      target: "vault" as HotkeyTarget,
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Export drafts",
      description: "Download all saved drafts as JSON.",
      target: "drafts" as HotkeyTarget,
    },
    manifest: {
      shortcut: "E",
      label: "Export manifest",
      description: "Download the current manifest as JSON.",
      target: "drafts" as HotkeyTarget,
    },
  },
  language: {
    title: "Language",
    options: {
      en: {
        label: "Switch language · English",
        description: "Use English copy in the UI.",
        target: "language" as HotkeyTarget,
      },
      cs: {
        label: "Switch language · Čeština",
        description: "Použít češtinu v rozhraní.",
        target: "language" as HotkeyTarget,
      },
      es: {
        label: "Switch language · Español",
        description: "Usar el español en la interfaz.",
        target: "language" as HotkeyTarget,
      },
      de: {
        label: "Switch language · Deutsch",
        description: "Deutsch in der Oberfläche verwenden.",
        target: "language" as HotkeyTarget,
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    id: "global-core",
    title: "Global shortcuts",
    scope: "global",
    items: [
      actions.hotkeys.commandPalette,
      actions.hotkeys.hotkeyOverlay,
      actions.hotkeys.undo,
      actions.hotkeys.redo,
      actions.hotkeys.closeModal,
    ],
  },
  {
    id: "global-visual",
    title: "Visual & system",
    scope: "global",
    items: [
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: actions.toggles.theme.overlayDescription,
        target: actions.toggles.theme.target,
      },
      {
        shortcut: actions.toggles.highEffects.shortcut,
        action: actions.toggles.highEffects.label,
        description: actions.toggles.highEffects.overlayDescription,
        target: actions.toggles.highEffects.target,
      },
      {
        shortcut: actions.toggles.offline.shortcut,
        action: actions.toggles.offline.label,
        description: actions.toggles.offline.overlayDescription,
        target: actions.toggles.offline.target,
      },
    ],
  },
  {
    id: "palette-controls",
    title: "Palette controls",
    scope: "palette",
    items: [actions.paletteControl.moveSelection, actions.paletteControl.runAction],
  },
  {
    id: "workspace-switch",
    title: "Workspaces",
    scope: "global",
    items: [actions.workspace.studio, actions.workspace.ao, actions.workspace.data, actions.workspace.preview],
  },
  {
    id: "studio-composition",
    title: "Creator Studio",
    scope: "studio",
    items: [
      actions.composition.moveNode,
      actions.composition.reorderDrag,
      actions.drafts.new,
      actions.drafts.save,
      actions.drafts.duplicate,
      actions.drafts.diff,
      actions.exports.manifest,
      actions.exports.drafts,
    ],
  },
  {
    id: "ao-operations",
    title: "AO Console",
    scope: "ao",
    items: [
      {
        shortcut: actions.toggles.health.shortcut,
        action: actions.toggles.health.label,
        description: actions.toggles.health.overlayDescription,
        target: actions.toggles.health.target,
      },
      actions.focus.wizardWallet,
      actions.focus.wizardModule,
      actions.focus.wizardProcess,
      actions.focus.healthFailure,
      actions.focus.healthLatency,
      actions.diagnostics.refresh,
    ],
  },
  {
    id: "data-vault",
    title: "Data Core",
    scope: "data",
    items: [actions.vault.load, actions.vault.save, actions.focus.vaultPassword, actions.focus.vaultFilter],
  },
  {
    id: "preview-visuals",
    title: "Preview Hub",
    scope: "preview",
    items: [
      {
        shortcut: actions.toggles.highEffects.shortcut,
        action: actions.toggles.highEffects.label,
        description: "Enhance preview with holograms and cursor FX.",
        target: actions.toggles.highEffects.target,
      },
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: "Cycle preview theme presets.",
        target: actions.toggles.theme.target,
      },
    ],
  },
];

const en = {
  meta: {
    languageName: "English",
    languageNative: "English",
    localeTag: "EN",
  },
  app: {
    skipToContent: "Skip to main content",
    brandEyebrow: "Darkmesh editor",
    controls: {
      workspaceNav: "Workspace navigation",
      theme: "Theme preset",
      effects: "Toggle high visual effects",
      cursorTrail: "Toggle neon cursor trail",
      offline: "Toggle offline / air-gap mode",
      whatsNew: "Open what's new panel",
    },
  },
  paletteUi: {
    eyebrow: "Command palette",
    title: "Quick actions",
    searchLabel: "Search actions",
    searchPlaceholder: "Type a command or shortcut",
    emptyTitle: "No actions match",
    emptyHint: "Try a different search term or shorter words.",
    recentTitle: "Recent",
    recentEmpty: "Run a command to see it here.",
    fuzzyHint: "Fuzzy search matches typos and out-of-order letters.",
    sections: {
      recents: "Recent",
      workspace: "Workspaces",
      toggles: "Toggles",
      focus: "Focus & navigation",
      drafts: "Drafts & history",
      diagnostics: "Diagnostics",
      vault: "Vault",
      exports: "Exports",
      themes: "Themes",
      language: "Language",
      palette: "Palette",
    },
    footerNavigate: "Tab or Shift+Tab to move; Enter runs the highlighted action.",
    footerToggle: "Cmd/Ctrl+K to toggle",
    footerClose: "Esc to close",
    close: "Close",
  },
  hotkeys: {
    eyebrow: "Reference",
    title: "Hotkeys and palette actions",
    tableHeaders: {
      shortcut: "Shortcut",
      action: "Action",
      details: "Details",
    },
    footer: {
      open: "Shift+/ or ? to open this panel",
      close: "Esc to close",
    },
    itemsLabel: "{{count}} items",
    paletteSectionTitle: "Palette actions",
    scopes: {
      global: "Global",
      palette: "Palette",
      studio: "Creator Studio",
      ao: "AO Console",
      data: "Data Core",
      preview: "Preview Hub",
    },
    view: {
      activeWorkspace: "Show active workspace",
      allWorkspaces: "Show all workspaces",
      grouped: "Grouped by workspace",
      printableOn: "Print view on",
      printableOff: "Print view off",
      printableHint: "Use File → Print to export once print view is enabled.",
      learnOn: "Learn mode on",
      learnOff: "Learn mode off",
      learnHint: "Hover or focus a row to highlight its target area.",
      reset: "Clear highlights",
    },
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Language set to {{language}}",
    localeAlready: "{{language}} is already active",
  },
  actions,
};

export type Messages = typeof en;
export default en;
