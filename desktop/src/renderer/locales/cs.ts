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
      label: "Příkazová paleta",
      description: "Otevře nebo zavře akční paletu.",
      target: "palette" as HotkeyTarget,
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ nebo ?",
      label: "Přehled zkratek",
      description: "Otevře nebo zavře tento přehled.",
      target: "palette" as HotkeyTarget,
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Zpět",
      description: "Krok zpět v historii manifestu (limit 20).",
      target: "drafts" as HotkeyTarget,
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Znovu",
      description: "Obnoví další změnu manifestu.",
      target: "drafts" as HotkeyTarget,
    },
    closeModal: {
      shortcut: "Esc",
      label: "Zavřít dialog",
      description: "Zavře paletu nebo přehled zkratek.",
      target: "palette" as HotkeyTarget,
    },
  },
  toggles: {
    theme: {
      shortcut: "Alt+C",
      label: "Střídat motivy",
      nextLabel: "Další: {{theme}}",
      overlayDescription: "Přepne aktivní motiv rozhraní.",
      description: {
        on: "Přepnout zpět na světlý vzhled.",
        off: "Zapnout cyberpunk vzhled.",
      },
      target: "theme" as HotkeyTarget,
    },
    highEffects: {
      shortcut: "Alt+X",
      label: "Přepnout efekty",
      labelOn: "Vypnout efekty",
      labelOff: "Zapnout efekty",
      overlayDescription: "Zapne nebo pozastaví vizuální efekty.",
      description: {
        default: "Přepíná WebGL mřížku, hologramy a stopu kurzoru.",
        blocked: "Preferujete omezený pohyb, efekty zůstanou pozastavené.",
      },
      target: "effects" as HotkeyTarget,
    },
    offline: {
      shortcut: "Alt+O",
      label: "Přepnout offline režim",
      labelOn: "Zpět online (vypnout offline)",
      labelOff: "Zapnout offline / air-gap",
      overlayDescription: "Povolí nebo blokuje síťové požadavky rendereru.",
      description: {
        on: "Opět povolit síťové požadavky.",
        off: "Zablokovat všechny požadavky z rendereru.",
      },
      target: "offline" as HotkeyTarget,
    },
    health: {
      shortcut: "Alt+H",
      label: "Přepnout panel zdraví",
      labelOpen: "Sbalit zdraví",
      labelClosed: "Rozbalit zdraví",
      overlayDescription: "Zobrazí nebo skryje diagnostický panel.",
      description: "Zobrazí nebo skryje diagnostický panel.",
      target: "health" as HotkeyTarget,
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Šipka nahoru/dolů",
      label: "Posunout uzel",
      description: "Přesune vybraný blok mezi sourozenci.",
      target: "drafts" as HotkeyTarget,
    },
    reorderDrag: {
      shortcut: "Táhnout karty",
      label: "Přeuspořádat / zanořit",
      description: "Přetažením karet stromu přesouváte nebo zanořujete bloky.",
      target: "drafts" as HotkeyTarget,
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Šipky",
      label: "Posun výběru",
      description: "Prochází filtrované akce palety.",
      target: "palette" as HotkeyTarget,
    },
    runAction: {
      shortcut: "Enter",
      label: "Spustit akci",
      description: "Spustí vybranou položku palety.",
      target: "palette" as HotkeyTarget,
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Přepnout do Creator Studio",
      description: "Upravujte manifesty a bloky.",
      target: "workspaces" as HotkeyTarget,
    },
    ao: {
      shortcut: "Alt+2",
      label: "Přepnout do AO Console",
      description: "Nasazujte moduly a spouštějte procesy.",
      target: "workspaces" as HotkeyTarget,
    },
    data: {
      shortcut: "Alt+3",
      label: "Přepnout do Data Core",
      description: "Spravujte šifrované PIP trezory.",
      target: "workspaces" as HotkeyTarget,
    },
    preview: {
      shortcut: "Alt+4",
      label: "Přepnout do Preview Hub",
      description: "Sledujte živé náhledy manifestu.",
      target: "workspaces" as HotkeyTarget,
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Průvodce · Peněženka",
      description: "Zaměří krok peněženky v AO deploy.",
      target: "wizard" as HotkeyTarget,
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Průvodce · Modul",
      description: "Zaměří vstup se zdrojem modulu.",
      target: "wizard" as HotkeyTarget,
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Průvodce · Proces",
      description: "Zaměří vstup manifestTx pro spawn.",
      target: "wizard" as HotkeyTarget,
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Heslo trezoru",
      description: "Zaměří pole hesla v Data Core.",
      target: "vault" as HotkeyTarget,
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Filtr trezoru",
      description: "Zaměří filtr záznamů trezoru.",
      target: "vault" as HotkeyTarget,
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "Limit selhání SLA",
      description: "Zaměří vstup počtu selhání v diagnostice.",
      target: "health" as HotkeyTarget,
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "Limit latence SLA",
      description: "Zaměří vstup průměrné latence v diagnostice.",
      target: "health" as HotkeyTarget,
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "Nový návrh",
      description: "Začněte prázdným manifestem.",
      target: "drafts" as HotkeyTarget,
    },
    duplicate: {
      shortcut: "Alt+N nebo Cmd/Ctrl+Shift+D",
      label: "Duplikovat návrh",
      description: "Uloží kopii aktuálního návrhu.",
      target: "drafts" as HotkeyTarget,
    },
    diff: {
      shortcut: "D",
      label: "Otevřít porovnání",
      description: "Porovná aktuální manifest s uloženým návrhem nebo revizí.",
      target: "drafts" as HotkeyTarget,
    },
    save: {
      shortcut: "S",
      label: "Uložit návrh",
      description: "Uloží aktuální manifest do IndexedDB.",
      target: "drafts" as HotkeyTarget,
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Obnovit diagnostiku",
      description: "Znovu spustí kontrolu zdraví.",
      target: "health" as HotkeyTarget,
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "Načíst PIP z trezoru",
      description: "Obnoví šifrovaný PIP dokument z lokálního trezoru.",
      target: "vault" as HotkeyTarget,
    },
    save: {
      shortcut: "V",
      label: "Uložit PIP do trezoru",
      description: "Zapíše aktuální PIP do trezoru.",
      target: "vault" as HotkeyTarget,
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Exportovat návrhy",
      description: "Stáhne všechny návrhy jako JSON.",
      target: "drafts" as HotkeyTarget,
    },
    manifest: {
      shortcut: "E",
      label: "Exportovat manifest",
      description: "Stáhne aktuální manifest jako JSON.",
      target: "drafts" as HotkeyTarget,
    },
  },
  language: {
    title: "Jazyk",
    options: {
      en: {
        label: "Přepnout jazyk · English",
        description: "Použít anglické texty v UI.",
        target: "language" as HotkeyTarget,
      },
      cs: {
        label: "Přepnout jazyk · Čeština",
        description: "Použít češtinu v rozhraní.",
        target: "language" as HotkeyTarget,
      },
      es: {
        label: "Přepnout jazyk · Español",
        description: "Použít španělštinu v rozhraní.",
        target: "language" as HotkeyTarget,
      },
      de: {
        label: "Přepnout jazyk · Deutsch",
        description: "Použít němčinu v rozhraní.",
        target: "language" as HotkeyTarget,
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    id: "global-core",
    title: "Globální zkratky",
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
    title: "Vizuál a systém",
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
    title: "Ovládání palety",
    scope: "palette",
    items: [actions.paletteControl.moveSelection, actions.paletteControl.runAction],
  },
  {
    id: "workspace-switch",
    title: "Pracoviště",
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
        description: "Vylepší náhled hologramy a stopou kurzoru.",
        target: actions.toggles.highEffects.target,
      },
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: "Střídá motivy náhledu.",
        target: actions.toggles.theme.target,
      },
    ],
  },
];

const cs: Messages = {
  meta: {
    languageName: "Czech",
    languageNative: "Čeština",
    localeTag: "CS",
  },
  app: {
    skipToContent: "Přeskočit na hlavní obsah",
    brandEyebrow: "Darkmesh editor",
    controls: {
      workspaceNav: "Navigace workspace",
      theme: "Předvolba motivu",
      effects: "Přepnout silné efekty",
      cursorTrail: "Přepnout neonovou stopu kurzoru",
      offline: "Přepnout offline / air-gap režim",
      whatsNew: "Otevřít novinky",
    },
  },
  paletteUi: {
    eyebrow: "Příkazová paleta",
    title: "Rychlé akce",
    searchLabel: "Hledat akce",
    searchPlaceholder: "Napište příkaz nebo zkratku",
    emptyTitle: "Žádná akce neodpovídá",
    emptyHint: "Zkuste jiný dotaz nebo kratší slova.",
    recentTitle: "Naposledy",
    recentEmpty: "Spusťte příkaz a zobrazí se zde.",
    fuzzyHint: "Fuzzy hledání toleruje překlepy i jiné pořadí písmen.",
    sections: {
      recents: "Naposledy",
      workspace: "Pracoviště",
      toggles: "Přepínače",
      focus: "Fokus a navigace",
      drafts: "Návrhy a historie",
      diagnostics: "Diagnostika",
      vault: "Trezor",
      exports: "Exporty",
      themes: "Motivy",
      language: "Jazyk",
      palette: "Paleta",
    },
    footerNavigate: "Tab nebo Shift+Tab pro pohyb; Enter spustí vybranou akci.",
    footerToggle: "Cmd/Ctrl+K pro otevření",
    footerClose: "Esc pro zavření",
    close: "Zavřít",
  },
  hotkeys: {
    eyebrow: "Referenční panel",
    title: "Klávesové zkratky a akce palety",
    tableHeaders: {
      shortcut: "Zkratka",
      action: "Akce",
      details: "Detail",
    },
    footer: {
      open: "Shift+/ nebo ? otevře tento panel",
      close: "Esc zavře",
    },
    itemsLabel: "{{count}} položek",
    paletteSectionTitle: "Akce palety",
    scopes: {
      global: "Globální",
      palette: "Paleta",
      studio: "Creator Studio",
      ao: "AO konzole",
      data: "Data Core",
      preview: "Preview Hub",
    },
    view: {
      activeWorkspace: "Zobrazit aktivní pracoviště",
      allWorkspaces: "Zobrazit všechna pracoviště",
      grouped: "Seskupeno podle pracoviště",
      printableOn: "Tiskový režim zapnut",
      printableOff: "Tiskový režim vypnut",
      printableHint: "Po zapnutí použijte Soubor → Tisk.",
      learnOn: "Režim učení zapnut",
      learnOff: "Režim učení vypnut",
      learnHint: "Najeďte nebo zaostřete řádek a zvýrazní cílovou oblast.",
      reset: "Vymazat zvýraznění",
    },
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Jazyk nastaven na {{language}}",
    localeAlready: "{{language}} už je aktivní",
  },
  actions,
};

export default cs;
