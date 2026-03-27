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
      label: "Paleta de comandos",
      description: "Abrir o cerrar la paleta de acciones.",
      target: "palette" as HotkeyTarget,
    },
    hotkeyOverlay: {
      shortcut: "Shift+/ o ?",
      label: "Panel de atajos",
      description: "Abrir o cerrar este panel de referencia.",
      target: "palette" as HotkeyTarget,
    },
    undo: {
      shortcut: "Cmd/Ctrl+Z",
      label: "Deshacer",
      description: "Retroceder en los cambios del manifiesto (historia limitada a 20).",
      target: "drafts" as HotkeyTarget,
    },
    redo: {
      shortcut: "Shift+Cmd/Ctrl+Z",
      label: "Rehacer",
      description: "Reaplicar el siguiente cambio del manifiesto.",
      target: "drafts" as HotkeyTarget,
    },
    closeModal: {
      shortcut: "Esc",
      label: "Cerrar diálogo",
      description: "Cerrar la paleta o el panel de atajos.",
      target: "palette" as HotkeyTarget,
    },
  },
  toggles: {
    theme: {
      shortcut: "Alt+C",
      label: "Cambiar tema",
      nextLabel: "Siguiente: {{theme}}",
      overlayDescription: "Cambiar el tema activo del entorno.",
      description: {
        on: "Volver al aspecto claro.",
        off: "Activar el tema cyberpunk.",
      },
      target: "theme" as HotkeyTarget,
    },
    highEffects: {
      shortcut: "Alt+X",
      label: "Efectos avanzados",
      labelOn: "Desactivar efectos",
      labelOff: "Activar efectos",
      overlayDescription: "Activar o pausar los efectos visuales.",
      description: {
        default: "Alterna la cuadrícula WebGL, hologramas y la estela del cursor.",
        blocked: "La preferencia de movimiento reducido mantiene los efectos en pausa.",
      },
      target: "effects" as HotkeyTarget,
    },
    offline: {
      shortcut: "Alt+O",
      label: "Modo offline",
      labelOn: "Volver online (desactivar offline)",
      labelOff: "Activar offline / air-gap",
      overlayDescription: "Permitir o bloquear las peticiones de red del renderer.",
      description: {
        on: "Permitir de nuevo las peticiones de red.",
        off: "Bloquear todas las peticiones desde el renderer.",
      },
      target: "offline" as HotkeyTarget,
    },
    health: {
      shortcut: "Alt+H",
      label: "Panel de salud",
      labelOpen: "Colapsar salud",
      labelClosed: "Expandir salud",
      overlayDescription: "Mostrar u ocultar el panel de diagnósticos.",
      description: "Mostrar u ocultar el panel de diagnósticos.",
      target: "health" as HotkeyTarget,
    },
  },
  composition: {
    moveNode: {
      shortcut: "Alt+Flecha arriba/abajo",
      label: "Mover nodo",
      description: "Reordenar la selección principal entre sus hermanos.",
      target: "drafts" as HotkeyTarget,
    },
    reorderDrag: {
      shortcut: "Arrastrar tarjetas",
      label: "Reordenar / anidar",
      description: "Arrastra tarjetas del árbol para mover o anidar bloques.",
      target: "drafts" as HotkeyTarget,
    },
  },
  paletteControl: {
    moveSelection: {
      shortcut: "Flechas",
      label: "Mover selección",
      description: "Recorrer las acciones filtradas de la paleta.",
      target: "palette" as HotkeyTarget,
    },
    runAction: {
      shortcut: "Enter",
      label: "Ejecutar acción",
      description: "Ejecuta la acción seleccionada.",
      target: "palette" as HotkeyTarget,
    },
  },
  workspace: {
    studio: {
      shortcut: "Alt+1",
      label: "Cambiar a Creator Studio",
      description: "Editar manifiestos y bloques.",
      target: "workspaces" as HotkeyTarget,
    },
    ao: {
      shortcut: "Alt+2",
      label: "Cambiar a AO Console",
      description: "Desplegar módulos y crear procesos.",
      target: "workspaces" as HotkeyTarget,
    },
    data: {
      shortcut: "Alt+3",
      label: "Cambiar a Data Core",
      description: "Gestionar bóvedas cifradas de PIP.",
      target: "workspaces" as HotkeyTarget,
    },
    preview: {
      shortcut: "Alt+4",
      label: "Cambiar a Preview Hub",
      description: "Ver vistas previas del manifiesto.",
      target: "workspaces" as HotkeyTarget,
    },
  },
  focus: {
    wizardWallet: {
      shortcut: "Alt+Shift+W",
      label: "Asistente · Billetera",
      description: "Enfocar el paso de billetera en el deploy AO.",
      target: "wizard" as HotkeyTarget,
    },
    wizardModule: {
      shortcut: "Alt+Shift+M",
      label: "Asistente · Módulo",
      description: "Enfocar la entrada de fuente del módulo.",
      target: "wizard" as HotkeyTarget,
    },
    wizardProcess: {
      shortcut: "Alt+Shift+P",
      label: "Asistente · Proceso",
      description: "Enfocar la entrada manifestTx para el spawn.",
      target: "wizard" as HotkeyTarget,
    },
    vaultPassword: {
      shortcut: "Alt+Shift+V",
      label: "Contraseña de bóveda",
      description: "Enfocar el campo de contraseña en Data Core.",
      target: "vault" as HotkeyTarget,
    },
    vaultFilter: {
      shortcut: "Alt+Shift+F",
      label: "Filtro de bóveda",
      description: "Enfocar el filtro de registros de la bóveda.",
      target: "vault" as HotkeyTarget,
    },
    healthFailure: {
      shortcut: "Alt+Shift+H",
      label: "Límite de fallos SLA",
      description: "Enfocar el campo de racha de fallos en Diagnóstico.",
      target: "health" as HotkeyTarget,
    },
    healthLatency: {
      shortcut: "Alt+Shift+L",
      label: "Límite de latencia SLA",
      description: "Enfocar el campo de latencia media en Diagnóstico.",
      target: "health" as HotkeyTarget,
    },
  },
  drafts: {
    new: {
      shortcut: "N",
      label: "Nuevo borrador",
      description: "Comenzar con un manifiesto vacío.",
      target: "drafts" as HotkeyTarget,
    },
    duplicate: {
      shortcut: "Alt+N o Cmd/Ctrl+Shift+D",
      label: "Duplicar borrador",
      description: "Guardar una copia del borrador actual.",
      target: "drafts" as HotkeyTarget,
    },
    diff: {
      shortcut: "D",
      label: "Abrir diff de borrador",
      description: "Comparar el manifiesto actual con un borrador o revisión guardada.",
      target: "drafts" as HotkeyTarget,
    },
    save: {
      shortcut: "S",
      label: "Guardar borrador",
      description: "Guardar el manifiesto actual en IndexedDB.",
      target: "drafts" as HotkeyTarget,
    },
  },
  diagnostics: {
    refresh: {
      shortcut: "R",
      label: "Actualizar salud",
      description: "Ejecutar de nuevo las comprobaciones de diagnóstico.",
      target: "health" as HotkeyTarget,
    },
  },
  vault: {
    load: {
      shortcut: "L",
      label: "Cargar PIP de la bóveda",
      description: "Restaurar el documento PIP cifrado desde la bóveda local.",
      target: "vault" as HotkeyTarget,
    },
    save: {
      shortcut: "V",
      label: "Guardar PIP en la bóveda",
      description: "Escribir el documento PIP actual en la bóveda.",
      target: "vault" as HotkeyTarget,
    },
  },
  exports: {
    drafts: {
      shortcut: "Shift+E",
      label: "Exportar borradores",
      description: "Descargar todos los borradores como JSON.",
      target: "drafts" as HotkeyTarget,
    },
    manifest: {
      shortcut: "E",
      label: "Exportar manifiesto",
      description: "Descargar el manifiesto actual como JSON.",
      target: "drafts" as HotkeyTarget,
    },
  },
  language: {
    title: "Idioma",
    options: {
      en: {
        label: "Cambiar idioma · English",
        description: "Usar inglés en la interfaz.",
        target: "language" as HotkeyTarget,
      },
      cs: {
        label: "Cambiar idioma · Čeština",
        description: "Usar checo en la interfaz.",
        target: "language" as HotkeyTarget,
      },
      es: {
        label: "Cambiar idioma · Español",
        description: "Usar español en la interfaz.",
        target: "language" as HotkeyTarget,
      },
      de: {
        label: "Cambiar idioma · Deutsch",
        description: "Usar alemán en la interfaz.",
        target: "language" as HotkeyTarget,
      },
    },
  },
};

const hotkeySections: LocaleHotkeySection[] = [
  {
    id: "global-core",
    title: "Atajos globales",
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
    title: "Visual y sistema",
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
    title: "Controles de la paleta",
    scope: "palette",
    items: [actions.paletteControl.moveSelection, actions.paletteControl.runAction],
  },
  {
    id: "workspace-switch",
    title: "Espacios de trabajo",
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
        description: "Mejora la vista previa con hologramas y estela del cursor.",
        target: actions.toggles.highEffects.target,
      },
      {
        shortcut: actions.toggles.theme.shortcut,
        action: actions.toggles.theme.label,
        description: "Alterna los temas de la vista previa.",
        target: actions.toggles.theme.target,
      },
    ],
  },
];

const es: Messages = {
  meta: {
    languageName: "Spanish",
    languageNative: "Español",
    localeTag: "ES",
  },
  app: {
    skipToContent: "Saltar al contenido principal",
    brandEyebrow: "Editor Darkmesh",
    controls: {
      workspaceNav: "Navegación de espacios",
      theme: "Tema activo",
      effects: "Alternar efectos visuales avanzados",
      cursorTrail: "Alternar rastro de cursor neón",
      offline: "Alternar modo offline / air-gap",
      whatsNew: "Abrir novedades",
    },
  },
  paletteUi: {
    eyebrow: "Paleta de comandos",
    title: "Acciones rápidas",
    searchLabel: "Buscar acciones",
    searchPlaceholder: "Escribe un comando o atajo",
    emptyTitle: "Sin acciones coincidentes",
    emptyHint: "Prueba otro término o usa palabras más cortas.",
    recentTitle: "Recientes",
    recentEmpty: "Ejecuta un comando para verlo aquí.",
    fuzzyHint: "La búsqueda difusa tolera errores y letras fuera de orden.",
    sections: {
      recents: "Recientes",
      workspace: "Espacios de trabajo",
      toggles: "Interruptores",
      focus: "Foco y navegación",
      drafts: "Borradores e historial",
      diagnostics: "Diagnóstico",
      vault: "Bóveda",
      exports: "Exportaciones",
      themes: "Temas",
      language: "Idioma",
      palette: "Paleta",
    },
    footerNavigate: "Tab o Shift+Tab para moverse; Enter ejecuta la acción resaltada.",
    footerToggle: "Cmd/Ctrl+K para alternar",
    footerClose: "Esc para cerrar",
    close: "Cerrar",
  },
  hotkeys: {
    eyebrow: "Referencia",
    title: "Atajos y acciones de paleta",
    tableHeaders: {
      shortcut: "Atajo",
      action: "Acción",
      details: "Detalles",
    },
    footer: {
      open: "Shift+/ o ? abre este panel",
      close: "Esc cierra",
    },
    itemsLabel: "{{count}} elementos",
    paletteSectionTitle: "Acciones de paleta",
    scopes: {
      global: "Global",
      palette: "Paleta",
      studio: "Creator Studio",
      ao: "AO Console",
      data: "Data Core",
      preview: "Preview Hub",
    },
    view: {
      activeWorkspace: "Mostrar espacio activo",
      allWorkspaces: "Mostrar todos los espacios",
      grouped: "Agrupado por espacio de trabajo",
      printableOn: "Vista de impresión activada",
      printableOff: "Vista de impresión desactivada",
      printableHint: "Tras activarlo usa Archivo → Imprimir.",
      learnOn: "Modo aprendizaje activado",
      learnOff: "Modo aprendizaje desactivado",
      learnHint: "Pasa el ratón o enfoca una fila para resaltar su zona.",
      reset: "Limpiar resaltados",
    },
    sections: hotkeySections,
  },
  statuses: {
    localeChanged: "Idioma cambiado a {{language}}",
    localeAlready: "{{language}} ya está activo",
  },
  actions,
};

export default es;
