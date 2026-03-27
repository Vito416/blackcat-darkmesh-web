import type { HotkeyScope, HotkeyTarget } from "./index";
import type { Messages } from "./en";

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
      label: "Befehls-Palette",
      description: "Aktionspalette öffnen oder schließen.",
      target: "palette" as HotkeyTarget,
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ oder ?",
      label: "Shortcut-Übersicht",
      description: "Diesen Referenz-Dialog öffnen oder schließen.",
      target: "palette" as HotkeyTarget,
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Rückgängig",
      description: "Manifest-Änderungen zurücknehmen (Verlauf auf 20 begrenzt).",
      target: "drafts" as HotkeyTarget,
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Wiederholen",
      description: "Die nächste Manifest-Änderung erneut anwenden.",
      target: "drafts" as HotkeyTarget,
    },
    closeModal: {
      shortcut: "Esc",
      label: "Dialog schließen",
      description: "Palette oder Shortcut-Panel schließen.",
      target: "palette" as HotkeyTarget,
    },
  },
  toggles: {
    theme: {
      shortcut: "Alt+C",
      label: "Theme wechseln",
      nextLabel: "Nächstes: {{theme}}",
      overlayDescription: "Aktives Theme der Oberfläche umschalten.",
      description: {
        on: "Zur hellen Ansicht zurückkehren.",
        off: "Cyberpunk-Theme aktivieren.",
      },
      target: "theme" as HotkeyTarget,
    },
    highEffects: {
      shortcut: "Alt+X",
      label: "High-Effekte",
      labelOn: "Effekte ausschalten",
      labelOff: "Effekte einschalten",
      overlayDescription: "Visuelle Effekte aktivieren oder pausieren.",
      description: {
        default: "WebGL-Gitter, Hologramme und Cursor-Spur umschalten.",
        blocked: "Bewegung reduzieren ist aktiv; Effekte bleiben pausiert.",
      },
      target: "effects" as HotkeyTarget,
    },
    offline: {
      shortcut: "Alt+O",
      label: "Offline-Modus",
      labelOn: "Online gehen (Offline aus)",
      labelOff: "Offline / Air-Gap aktivieren",
      overlayDescription: "Renderer-Netzwerkanfragen erlauben oder blockieren.",
      description: {
        on: "Netzwerkanfragen wieder erlauben.",
        off: "Alle Anfragen aus dem Renderer blockieren.",
      },
      target: "offline" as HotkeyTarget,
    },
    health: {
      shortcut: "Alt+H",
      label: "Health-Panel",
      labelOpen: "Health einklappen",
      labelClosed: "Health ausklappen",
      overlayDescription: "Diagnose-Panel ein- oder ausblenden.",
      description: "Diagnose-Panel ein- oder ausblenden.",
      target: "health" as HotkeyTarget,
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Pfeil hoch/runter",
      label: "Knoten verschieben",
      description: "Die Hauptauswahl zwischen Geschwistern verschieben.",
      target: "drafts" as HotkeyTarget,
    },
    reorderDrag: {
      shortcut: "Karten ziehen",
      label: "Umordnen / verschachteln",
      description: "Baum-Karten ziehen, um Blöcke zu bewegen oder zu verschachteln.",
      target: "drafts" as HotkeyTarget,
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Pfeiltasten",
      label: "Auswahl bewegen",
      description: "Durch gefilterte Palettenaktionen blättern.",
      target: "palette" as HotkeyTarget,
    },
    runAction: {
      shortcut: "Enter",
      label: "Aktion ausführen",
      description: "Markierte Palettenaktion ausführen.",
      target: "palette" as HotkeyTarget,
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Zu Creator Studio wechseln",
      description: "Manifeste und Blöcke bearbeiten.",
      target: "workspaces" as HotkeyTarget,
    },
    ao: {
      shortcut: "Alt+2",
      label: "Zu AO Console wechseln",
      description: "Module deployen und Prozesse spawnen.",
      target: "workspaces" as HotkeyTarget,
    },
    data: {
      shortcut: "Alt+3",
      label: "Zu Data Core wechseln",
      description: "Verschlüsselte PIP-Tresore verwalten.",
      target: "workspaces" as HotkeyTarget,
    },
    preview: {
      shortcut: "Alt+4",
      label: "Zu Preview Hub wechseln",
      description: "Live-Vorschauen des Manifests sehen.",
      target: "workspaces" as HotkeyTarget,
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Assistent · Wallet",
      description: "Wallet-Schritt im AO-Deploy fokussieren.",
      target: "wizard" as HotkeyTarget,
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Assistent · Modul",
      description: "Moduleingabe fokussieren.",
      target: "wizard" as HotkeyTarget,
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Assistent · Prozess",
      description: "manifestTx-Eingabe für Spawn fokussieren.",
      target: "wizard" as HotkeyTarget,
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Tresor-Passwort",
      description: "Passwortfeld in Data Core fokussieren.",
      target: "vault" as HotkeyTarget,
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Tresor-Filter",
      description: "Filterfeld der Tresor-Einträge fokussieren.",
      target: "vault" as HotkeyTarget,
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "SLA-Fehlerschwelle",
      description: "Feld für Fehler-Serie im Health-Panel fokussieren.",
      target: "health" as HotkeyTarget,
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "SLA-Latenzschwelle",
      description: "Feld für durchschnittliche Latenz im Health-Panel fokussieren.",
      target: "health" as HotkeyTarget,
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "Neuer Entwurf",
      description: "Mit einem leeren Manifest starten.",
      target: "drafts" as HotkeyTarget,
    },
    duplicate: {
      shortcut: "Alt+N oder Cmd/Ctrl+Shift+D",
      label: "Entwurf duplizieren",
      description: "Eine Kopie des aktuellen Entwurfs speichern.",
      target: "drafts" as HotkeyTarget,
    },
    diff: {
      shortcut: "D",
      label: "Entwurfs-Diff öffnen",
      description: "Aktuelles Manifest mit gespeichertem Entwurf oder Revision vergleichen.",
      target: "drafts" as HotkeyTarget,
    },
    save: {
      shortcut: "S",
      label: "Entwurf speichern",
      description: "Aktuelles Manifest in IndexedDB speichern.",
      target: "drafts" as HotkeyTarget,
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Health aktualisieren",
      description: "Diagnoseprüfungen erneut ausführen.",
      target: "health" as HotkeyTarget,
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "PIP aus Tresor laden",
      description: "Verschlüsseltes PIP aus lokalem Tresor wiederherstellen.",
      target: "vault" as HotkeyTarget,
    },
    save: {
      shortcut: "V",
      label: "PIP in Tresor speichern",
      description: "Aktuelles PIP in den Tresor schreiben.",
      target: "vault" as HotkeyTarget,
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Entwürfe exportieren",
      description: "Alle gespeicherten Entwürfe als JSON laden.",
      target: "drafts" as HotkeyTarget,
    },
    manifest: {
      shortcut: "E",
      label: "Manifest exportieren",
      description: "Aktuelles Manifest als JSON herunterladen.",
      target: "drafts" as HotkeyTarget,
    },
  },
  language: {
    title: "Sprache",
    options: {
      en: {
        label: "Sprache wechseln · English",
        description: "Englische Texte verwenden.",
        target: "language" as HotkeyTarget,
      },
      cs: {
        label: "Sprache wechseln · Čeština",
        description: "Tschechische Texte verwenden.",
        target: "language" as HotkeyTarget,
      },
      es: {
        label: "Sprache wechseln · Español",
        description: "Spanische Texte verwenden.",
        target: "language" as HotkeyTarget,
      },
      de: {
        label: "Sprache wechseln · Deutsch",
        description: "Deutsche Texte verwenden.",
        target: "language" as HotkeyTarget,
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    id: "global-core",
    title: "Globale Shortcuts",
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
    title: "Visuell & System",
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
    title: "Palettensteuerung",
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
        description: "Vorschau mit Hologrammen und Cursor-Spur anreichern.",
        target: actions.toggles.highEffects.target,
      },
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: "Preview-Themes durchschalten.",
        target: actions.toggles.theme.target,
      },
    ],
  },
];

const de: Messages = {
  meta: {
    languageName: "German",
    languageNative: "Deutsch",
    localeTag: "DE",
  },
  app: {
    skipToContent: "Zum Hauptinhalt springen",
    brandEyebrow: "Darkmesh Editor",
  },
  paletteUi: {
    eyebrow: "Befehls-Palette",
    title: "Schnellaktionen",
    searchLabel: "Aktionen suchen",
    searchPlaceholder: "Befehl oder Shortcut eingeben",
    emptyTitle: "Keine passenden Aktionen",
    emptyHint: "Versuche einen anderen Begriff oder kürzere Wörter.",
    recentTitle: "Zuletzt",
    recentEmpty: "Führe einen Befehl aus, dann erscheint er hier.",
    fuzzyHint: "Fuzzy-Suche verzeiht Tippfehler und vertauschte Reihenfolgen.",
    sections: {
      recents: "Zuletzt",
      workspace: "Workspaces",
      toggles: "Schalter",
      focus: "Fokus & Navigation",
      drafts: "Entwürfe & Verlauf",
      diagnostics: "Diagnose",
      vault: "Tresor",
      exports: "Exporte",
      themes: "Themes",
      language: "Sprache",
      palette: "Palette",
    },
    footerNavigate: "Tab oder Shift+Tab zum Bewegen; Enter führt die markierte Aktion aus.",
    footerToggle: "Cmd/Ctrl+K zum Öffnen",
    footerClose: "Esc zum Schließen",
    close: "Schließen",
  },
  hotkeys: {
    eyebrow: "Referenz",
    title: "Shortcuts und Paletten-Aktionen",
    tableHeaders: {
      shortcut: "Shortcut",
      action: "Aktion",
      details: "Details",
    },
    footer: {
      open: "Shift+/ oder ? öffnet dieses Panel",
      close: "Esc schließt",
    },
    itemsLabel: "{{count}} Einträge",
    paletteSectionTitle: "Paletten-Aktionen",
    scopes: {
      global: "Global",
      palette: "Palette",
      studio: "Creator Studio",
      ao: "AO Console",
      data: "Data Core",
      preview: "Preview Hub",
    },
    view: {
      activeWorkspace: "Aktiven Workspace zeigen",
      allWorkspaces: "Alle Workspaces zeigen",
      grouped: "Nach Workspace gruppiert",
      printableOn: "Druckansicht an",
      printableOff: "Druckansicht aus",
      printableHint: "Nach dem Aktivieren Datei → Drucken nutzen.",
      learnOn: "Lernmodus an",
      learnOff: "Lernmodus aus",
      learnHint: "Mit Maus oder Fokus den Zielbereich hervorheben.",
      reset: "Hervorhebungen löschen",
    },
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Sprache gesetzt auf {{language}}",
    localeAlready: "{{language}} ist bereits aktiv",
  },
  actions,
};

export default de;
