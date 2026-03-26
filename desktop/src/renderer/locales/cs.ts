type LocaleHotkeySection = {
  title: string;
  items: { shortcut: string; action: string; description: string }[];
};

const actions = {
  hotkeys: {
    commandPalette: {
      shortcut: "Cmd/Ctrl+K",
      label: "Příkazová paleta",
      description: "Otevře nebo zavře akční paletu.",
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ nebo ?",
      label: "Přehled zkratek",
      description: "Otevře nebo zavře tento přehled.",
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Zpět",
      description: "Krok zpět v historii manifestu (limit 20).",
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Znovu",
      description: "Obnoví další změnu manifestu.",
    },
    closeModal: {
      shortcut: "Esc",
      label: "Zavřít dialog",
      description: "Zavře paletu nebo přehled zkratek.",
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
    },
    health: {
      shortcut: "Alt+H",
      label: "Přepnout panel zdraví",
      labelOpen: "Sbalit zdraví",
      labelClosed: "Rozbalit zdraví",
      overlayDescription: "Zobrazí nebo skryje diagnostický panel.",
      description: "Zobrazí nebo skryje diagnostický panel.",
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Šipka nahoru/dolů",
      label: "Posunout uzel",
      description: "Přesune vybraný blok mezi sourozenci.",
    },
    reorderDrag: {
      shortcut: "Táhnout karty",
      label: "Přeuspořádat / zanořit",
      description: "Přetažením karet stromu přesouváte nebo zanořujete bloky.",
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Šipky",
      label: "Posun výběru",
      description: "Prochází filtrované akce palety.",
    },
    runAction: {
      shortcut: "Enter",
      label: "Spustit akci",
      description: "Spustí vybranou položku palety.",
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Přepnout do Creator Studio",
      description: "Upravujte manifesty a bloky.",
    },
    ao: {
      shortcut: "Alt+2",
      label: "Přepnout do AO Console",
      description: "Nasazujte moduly a spouštějte procesy.",
    },
    data: {
      shortcut: "Alt+3",
      label: "Přepnout do Data Core",
      description: "Spravujte šifrované PIP trezory.",
    },
    preview: {
      shortcut: "Alt+4",
      label: "Přepnout do Preview Hub",
      description: "Sledujte živé náhledy manifestu.",
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Průvodce · Peněženka",
      description: "Zaměří krok peněženky v AO deploy.",
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Průvodce · Modul",
      description: "Zaměří vstup se zdrojem modulu.",
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Průvodce · Proces",
      description: "Zaměří vstup manifestTx pro spawn.",
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Heslo trezoru",
      description: "Zaměří pole hesla v Data Core.",
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Filtr trezoru",
      description: "Zaměří filtr záznamů trezoru.",
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "Limit selhání SLA",
      description: "Zaměří vstup počtu selhání v diagnostice.",
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "Limit latence SLA",
      description: "Zaměří vstup průměrné latence v diagnostice.",
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "Nový návrh",
      description: "Začněte prázdným manifestem.",
    },
    duplicate: {
      shortcut: "Alt+N nebo Cmd/Ctrl+Shift+D",
      label: "Duplikovat návrh",
      description: "Uloží kopii aktuálního návrhu.",
    },
    diff: {
      shortcut: "D",
      label: "Otevřít porovnání",
      description: "Porovná aktuální manifest s uloženým návrhem nebo revizí.",
    },
    save: {
      shortcut: "S",
      label: "Uložit návrh",
      description: "Uloží aktuální manifest do IndexedDB.",
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Obnovit diagnostiku",
      description: "Znovu spustí kontrolu zdraví.",
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "Načíst PIP z trezoru",
      description: "Obnoví šifrovaný PIP dokument z lokálního trezoru.",
    },
    save: {
      shortcut: "V",
      label: "Uložit PIP do trezoru",
      description: "Zapíše aktuální PIP do trezoru.",
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Exportovat návrhy",
      description: "Stáhne všechny návrhy jako JSON.",
    },
    manifest: {
      shortcut: "E",
      label: "Exportovat manifest",
      description: "Stáhne aktuální manifest jako JSON.",
    },
  },
  language: {
    title: "Jazyk",
    options: {
      en: {
        label: "Přepnout jazyk · English",
        description: "Použít anglické texty v UI.",
      },
      cs: {
        label: "Přepnout jazyk · Čeština",
        description: "Použít češtinu v rozhraní.",
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    title: "Globální zkratky",
    items: [
      actions.hotkeys.commandPalette,
      actions.hotkeys.hotkeyOverlay,
      actions.hotkeys.undo,
      actions.hotkeys.redo,
      actions.hotkeys.closeModal,
    ],
  },
  {
    title: "Rychlé přepínače",
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
    title: "Kompozice",
    items: [actions.composition.moveNode, actions.composition.reorderDrag],
  },
  {
    title: "Ovládání palety",
    items: [actions.paletteControl.moveSelection, actions.paletteControl.runAction],
  },
  {
    title: "Pracoviště",
    items: [actions.workspace.studio, actions.workspace.ao, actions.workspace.data, actions.workspace.preview],
  },
  {
    title: "Přeskoky",
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
    title: "Návrhy",
    items: [actions.drafts.duplicate],
  },
];

const cs = {
  meta: {
    languageName: "Czech",
    languageNative: "Čeština",
    localeTag: "CS",
  },
  app: {
    skipToContent: "Přeskočit na hlavní obsah",
    brandEyebrow: "Darkmesh editor",
  },
  paletteUi: {
    eyebrow: "Příkazová paleta",
    title: "Rychlé akce",
    searchLabel: "Hledat akce",
    searchPlaceholder: "Hledat akce",
    emptyTitle: "Žádná akce neodpovídá",
    emptyHint: "Zkuste jiný dotaz.",
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
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Jazyk nastaven na {{language}}",
    localeAlready: "{{language}} už je aktivní",
  },
  actions,
};

export default cs;
