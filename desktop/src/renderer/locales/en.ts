type LocaleHotkeySection = {
  title: string;
  items: { shortcut: string; action?: string; label?: string; description: string }[];
};

const actions = {
  hotkeys: {
    commandPalette: {
      shortcut: "Cmd/Ctrl+K",
      label: "Command palette",
      description: "Open or close the action palette.",
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ or ?",
      label: "Hotkey overlay",
      description: "Open or close this reference panel.",
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Undo",
      description: "Step back through manifest changes (history capped at 20).",
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Redo",
      description: "Reapply the next manifest change.",
    },
    closeModal: {
      shortcut: "Esc",
      label: "Close modal",
      description: "Dismiss the palette or the hotkey overlay.",
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
    },
    health: {
      shortcut: "Alt+H",
      label: "Toggle health panel",
      labelOpen: "Collapse health",
      labelClosed: "Expand health",
      overlayDescription: "Show or hide the diagnostics panel.",
      description: "Show or hide the diagnostics panel.",
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Arrow Up/Down",
      label: "Move node",
      description: "Reorder the primary selection among its siblings.",
    },
    reorderDrag: {
      shortcut: "Drag cards",
      label: "Reorder / nest",
      description: "Drag tree cards to move or nest blocks.",
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Arrow keys",
      label: "Move selection",
      description: "Step through filtered palette actions.",
    },
    runAction: {
      shortcut: "Enter",
      label: "Run action",
      description: "Execute the selected palette item.",
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Switch to Creator Studio",
      description: "Edit manifests and blocks.",
    },
    ao: {
      shortcut: "Alt+2",
      label: "Switch to AO Console",
      description: "Deploy modules and spawn processes.",
    },
    data: {
      shortcut: "Alt+3",
      label: "Switch to Data Core",
      description: "Manage encrypted PIP vaults.",
    },
    preview: {
      shortcut: "Alt+4",
      label: "Switch to Preview Hub",
      description: "View live manifest previews.",
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Wizard · Wallet",
      description: "Focus wallet step in AO deploy.",
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Wizard · Module",
      description: "Focus module source input.",
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Wizard · Process",
      description: "Focus manifestTx spawn input.",
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Vault password",
      description: "Focus password field in Data Core.",
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Vault filter",
      description: "Focus vault records filter field.",
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "SLA failure threshold",
      description: "Focus failure streak input in Health.",
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "SLA latency threshold",
      description: "Focus latency threshold input in Health.",
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "New draft",
      description: "Start from a blank manifest.",
    },
    duplicate: {
      shortcut: "Alt+N or Cmd/Ctrl+Shift+D",
      label: "Duplicate draft",
      description: "Save a copy of the current draft.",
    },
    diff: {
      shortcut: "D",
      label: "Open draft diff",
      description: "Compare current manifest with a saved draft or revision.",
    },
    save: {
      shortcut: "S",
      label: "Save draft",
      description: "Persist the current manifest to IndexedDB.",
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Refresh health",
      description: "Run the diagnostics checks again.",
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "Load PIP from vault",
      description: "Restore the encrypted PIP document from local vault storage.",
    },
    save: {
      shortcut: "V",
      label: "Save PIP to vault",
      description: "Write the current PIP document into vault storage.",
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Export drafts",
      description: "Download all saved drafts as JSON.",
    },
    manifest: {
      shortcut: "E",
      label: "Export manifest",
      description: "Download the current manifest as JSON.",
    },
  },
  language: {
    title: "Language",
    options: {
      en: {
        label: "Switch language · English",
        description: "Use English copy in the UI.",
      },
      cs: {
        label: "Switch language · Čeština",
        description: "Použít češtinu v rozhraní.",
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    title: "Global shortcuts",
    items: [
      actions.hotkeys.commandPalette,
      actions.hotkeys.hotkeyOverlay,
      actions.hotkeys.undo,
      actions.hotkeys.redo,
      actions.hotkeys.closeModal,
    ],
  },
  {
    title: "Quick toggles",
    items: [
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: actions.toggles.theme.overlayDescription,
      },
      {
        shortcut: actions.toggles.highEffects.shortcut,
        action: actions.toggles.highEffects.label,
        description: actions.toggles.highEffects.overlayDescription,
      },
      {
        shortcut: actions.toggles.offline.shortcut,
        action: actions.toggles.offline.label,
        description: actions.toggles.offline.overlayDescription,
      },
      {
        shortcut: actions.toggles.health.shortcut,
        action: actions.toggles.health.label,
        description: actions.toggles.health.overlayDescription,
      },
    ],
  },
  {
    title: "Composition",
    items: [actions.composition.moveNode, actions.composition.reorderDrag],
  },
  {
    title: "Palette controls",
    items: [actions.paletteControl.moveSelection, actions.paletteControl.runAction],
  },
  {
    title: "Workspaces",
    items: [actions.workspace.studio, actions.workspace.ao, actions.workspace.data, actions.workspace.preview],
  },
  {
    title: "Focus jumps",
    items: [
      actions.focus.wizardWallet,
      actions.focus.wizardModule,
      actions.focus.wizardProcess,
      actions.focus.vaultPassword,
      actions.focus.vaultFilter,
      actions.focus.healthFailure,
      actions.focus.healthLatency,
    ],
  },
  {
    title: "Drafts",
    items: [actions.drafts.duplicate],
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
  },
  paletteUi: {
    eyebrow: "Command palette",
    title: "Quick actions",
    searchLabel: "Search actions",
    searchPlaceholder: "Search actions",
    emptyTitle: "No actions match",
    emptyHint: "Try a different search term.",
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
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Language set to {{language}}",
    localeAlready: "{{language}} is already active",
  },
  actions,
};

export default en;
