import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import "./styles.css";
import ErrorBoundary from "./components/ErrorBoundary";
import type { DraftDiffOption } from "./components/DraftDiffPanel";
import type { CyberBlockPreviewProps } from "./components/CyberBlockPreview";
import FxBadge from "./components/FxBadge";
import { fetchCatalog, catalogItems as seedCatalog } from "./services/catalog";
import whatsNewData from "./whats-new.json";
import {
  runHealthChecks,
  serializeHealthSnapshot,
  summarizeHealthStatuses,
  type HealthSnapshot,
  type HealthStatus,
  type HealthStatusSummary,
} from "./services/health";
import { fetchManifestDocument } from "./services/manifestFetch";
import {
  clearPipVaultStorage,
  deletePipVaultRecordStorage,
  loadPipFromPrompt,
  loadPipFromVault,
  loadPipFromVaultRecord,
  loadPipFromWorker,
  listPipVaultRecords,
  savePipToVault,
} from "./services/pipWorkflow";
import {
  describePipVault,
  disableVaultPassword,
  enableVaultPassword,
  exportPipVaultBundle,
  importPipVaultBundle,
  inspectVaultBundle,
  lockPipVault,
  repairPipVaultRecord,
  scanPipVaultIntegrity,
  sendVaultTelemetry,
  setVaultHardwarePlaceholder,
  type PipVaultIntegrityIssue,
  type PipVaultKdfMeta,
  type PipVaultRecord,
} from "./services/pipVault";
import type { PipDocument } from "./services/pipValidation";
import {
  CatalogItem,
  ManifestDocument,
  ManifestDraft,
  ManifestNode,
  ManifestShape,
  PropsSchema,
  isManifestExpression,
} from "./types/manifest";
type VaultMode = "safeStorage" | "plain" | "password";
type DraftDiffPanelModule = typeof import("./components/DraftDiffPanel");
type AoLogPanelModule = typeof import("./components/AoLogPanel");
type ManifestRendererModule = typeof import("./components/ManifestRenderer");
type AoHolomapModule = typeof import("./components/AoHolomap");
type HeroCanvasModule = typeof import("./components/HeroCanvas");
type CyberBlockPreviewModule = typeof import("./components/CyberBlockPreview");
type VaultCrystalModule = typeof import("./components/VaultCrystal");
const loadDraftDiffPanel = (() => {
  let modPromise: Promise<DraftDiffPanelModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/DraftDiffPanel");
    }
    return modPromise;
  };
})();
const loadAoLogPanel = (() => {
  let modPromise: Promise<AoLogPanelModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/AoLogPanel");
    }
    return modPromise;
  };
})();
const loadManifestRenderer = (() => {
  let modPromise: Promise<ManifestRendererModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/ManifestRenderer");
    }
    return modPromise;
  };
})();
const loadAoHolomap = (() => {
  let modPromise: Promise<AoHolomapModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/AoHolomap");
    }
    return modPromise;
  };
})();
const loadHeroCanvas = (() => {
  let modPromise: Promise<HeroCanvasModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/HeroCanvas");
    }
    return modPromise;
  };
})();
const loadCyberBlockPreview = (() => {
  let modPromise: Promise<CyberBlockPreviewModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/CyberBlockPreview");
    }
    return modPromise;
  };
})();
const loadVaultCrystal = (() => {
  let modPromise: Promise<VaultCrystalModule> | null = null;
  return () => {
    if (!modPromise) {
      modPromise = import("./components/VaultCrystal");
    }
    return modPromise;
  };
})();
const DraftDiffPanel = React.lazy(loadDraftDiffPanel);
const AoLogPanel = React.lazy(loadAoLogPanel);
const ManifestRenderer = React.lazy(loadManifestRenderer);
const AoHolomap = React.lazy(loadAoHolomap);
const HeroCanvas = React.lazy(loadHeroCanvas);
const VaultCrystal = React.lazy(loadVaultCrystal);
const prefetchDraftDiffPanel = () => {
  void loadDraftDiffPanel();
};
const prefetchAoLogPanel = () => {
  void loadAoLogPanel();
};
const prefetchManifestRenderer = () => {
  void loadManifestRenderer();
};
const prefetchAoHolomap = () => {
  void loadAoHolomap();
};
import {
  deleteDraft,
  exportDraftsToJson,
  duplicateDraft,
  getDraft,
  importDraftsFromJson,
  listDrafts,
  listDraftRevisions,
  loadDraftSource,
  saveDraft,
  DraftVersionConflictError,
  type DraftRevisionTag,
  type DraftRevision,
  type DraftSaveMode,
  type DraftSource,
  type DraftSourceRef,
} from "./storage/drafts";
import {
  addHealthEvent,
  getRecentHealthEvents,
  healthEventsToCsv,
  healthEventsToJson,
  listHealthEvents,
  type HealthEvent,
} from "./storage/healthStore";
import {
  addVaultAuditEvent,
  listVaultAuditEvents,
  vaultAuditToCsv,
  vaultAuditToJson,
  type VaultAuditEvent,
} from "./storage/vaultAudit";
import {
  addVaultIntegrityEvent,
  getLastVaultIntegrityEvent,
  listVaultIntegrityEvents,
  VAULT_INTEGRITY_WIZARD_LIMIT,
  type VaultIntegrityEvent,
} from "./storage/vaultIntegrity";
import { loadAoProfiles, rememberProfile } from "./storage/aoProfiles";
import {
  hasStoredSettings,
  loadSettings,
  markSetupComplete,
  resolveEnvWithSettings,
  saveSettings,
  setupCompleted,
} from "./storage/settings";
import { fetchWalletFromPath, parseWalletJson } from "./services/wallet";
import {
  classifyAoError,
  validateAoId,
  validateModuleTxInput,
  validateSchedulerInput,
  validateWalletJsonInput,
  validateWalletPathInput,
  type WalletFieldValidation,
} from "./services/aoValidation";
import type { VaultCrystalPulse, VaultCrystalState } from "./components/VaultCrystal";
import CommandPalette, { type CommandPaletteAction, type CommandPaletteSection } from "./components/CommandPalette";
import {
  diff,
  groupDiffEntries,
  buildFormValue,
  applyDefaultsToProps,
  indexValidationIssues,
  mergeDefaults,
  validate,
  type PropsDiffEntry,
  type PropsValidationIssue,
} from "./utils/propsInspector";
import { aoLogToCsv } from "./utils/aoLog";
import { diffManifests, type DraftDiffEntry, type DraftDiffKind } from "./utils/draftDiff";
import HotkeyOverlay, { type HotkeyOverlayGroup, type HotkeyOverlaySection } from "./components/HotkeyOverlay";
import HologramBlocks from "./components/HologramBlocks";
import useNeonCursorTrail from "./hooks/useNeonCursorTrail";
import useFocusTrap from "./hooks/useFocusTrap";
import Vault from "./components/Vault";
import Wizard from "./components/Wizard";
import { validatePipDocument } from "./services/pipValidation";
import {
  DEFAULT_LOCALE,
  FALLBACK_MESSAGES,
  I18nContext,
  loadMessages,
  makeTranslator,
  resolveLocale,
  type HotkeyScope,
  type HotkeyTarget,
  type LocaleKey,
  type Messages,
} from "./locales";
import themeTokenConfig from "./theme/tokens.json";
import type {
  AoDeployProfile,
  AoLogContext,
  AoLogMetrics,
  AoLogSeverity,
  AoMiniLogEntry,
  AoProfileSnapshot,
  AoWalletMode as WalletMode,
  SpawnSnapshot,
} from "./types/ao";

type WhatsNewEntry = {
  version: string;
  date: string;
  highlights: string[];
};

type ReviewComment = {
  id: string;
  manifestId: string;
  nodeId: string;
  text: string;
  author?: string;
  createdAt: string;
  resolvedAt?: string | null;
};

type AutosavePreset = "fast" | "balanced" | "relaxed";

const AUTOSAVE_PRESETS: Record<AutosavePreset, number> = {
  fast: 800,
  balanced: 1200,
  relaxed: 2400,
};

const AUTOSAVE_STORAGE_KEY = "darkmesh-autosave-delay";
const REVIEW_STORAGE_KEY = "darkmesh-review-comments";
const DRAFT_DIFF_DOCKED_KEY = "darkmesh-draft-diff-docked";
const REVIEW_MODE_KEY = "darkmesh-review-mode";

const HelpTip = ({ copy, label }: { copy: string; label?: string }) => (
  <button type="button" className="help-tip" title={copy} aria-label={label ?? copy}>
    ?
  </button>
);

type AoDeployModule = typeof import("./services/aoDeploy");

declare global {
  interface Window {
    __AO_TEST_MODULE__?: Partial<AoDeployModule>;
  }
}

const loadAoDeployModule = (() => {
  let modPromise: Promise<AoDeployModule> | null = null;
  return () => {
    if (typeof window !== "undefined" && window.__AO_TEST_MODULE__) {
      return Promise.resolve({ ...window.__AO_TEST_MODULE__ } as AoDeployModule);
    }
    if (!modPromise) {
      modPromise = import("./services/aoDeploy");
    }
    return modPromise;
  };
})();

const randomId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);

const touch = (doc: ManifestDocument): ManifestDocument => ({
  ...doc,
  metadata: { ...doc.metadata, updatedAt: new Date().toISOString() },
});

const newManifest = (): ManifestDocument => ({
  id: `manifest-${randomId()}`,
  name: "Untitled manifest",
  version: "0.1.0",
  metadata: {
    author: "local",
    description: "Draft manifest for Darkmesh space",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  nodes: [],
});

const fromCatalog = (item: CatalogItem): ManifestNode => ({
  id: `${item.id}-${randomId()}`,
  type: item.type,
  title: item.name,
  props: (mergeDefaults(item.propsSchema, item.defaultProps ?? {}) ?? {}) as ManifestShape,
  children: [],
});

const tokenThemeMeta = new Map((themeTokenConfig.themes ?? []).map((theme) => [theme.id, theme]));

const themePresets = [
  {
    id: "light",
    label: "Light",
    description: "Bright neutral shell with aqua and lime accents.",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    description: "Neon grid with electric cyan and magenta glow.",
  },
  {
    id: "neon-wasteland-v2",
    label: tokenThemeMeta.get("neon-wasteland-v2")?.label ?? "Neon Wasteland v2",
    description: tokenThemeMeta.get("neon-wasteland-v2")?.description ?? "Acid rain plasma, violet storms, smoked glass chassis.",
  },
  {
    id: "hologrid-noir",
    label: tokenThemeMeta.get("hologrid-noir")?.label ?? "Hologrid Noir",
    description: tokenThemeMeta.get("hologrid-noir")?.description ?? "Noir glass with holographic cyan/violet grid glow.",
  },
  {
    id: "solarized-void",
    label: tokenThemeMeta.get("solarized-void")?.label ?? "Solarized Void",
    description: tokenThemeMeta.get("solarized-void")?.description ?? "Aurora teal, solar gold, and soft abyss gradients.",
  },
  {
    id: "night-drive",
    label: "Night Drive",
    description: "Midnight teal with warm highway amber highlights.",
  },
  {
    id: "vapor",
    label: "Vapor",
    description: "Soft pastel vaporwave with violet, mint, and blush.",
  },
  {
    id: "synthwave",
    label: "Synthwave",
    description: "Retro-future violet base with magenta and cyan pops.",
  },
  {
    id: "void",
    label: "Void",
    description: "High-contrast charcoal with icy cyan edges.",
  },
] as const;

type Theme = (typeof themePresets)[number]["id"];

const themePresetMap = new Map(themePresets.map((preset) => [preset.id, preset]));
const neonThemes: Theme[] = ["cyberpunk", "neon-wasteland-v2", "hologrid-noir", "solarized-void"];
const LEGACY_THEME_MAP: Partial<Record<string, Theme>> = {
  "neon-wasteland": "neon-wasteland-v2",
};
const DEFAULT_THEME: Theme = "light";

const resolveTheme = (value: string | null): Theme => {
  const normalized = value && (LEGACY_THEME_MAP[value] ?? value);
  return normalized && themePresetMap.has(normalized as Theme) ? (normalized as Theme) : DEFAULT_THEME;
};

const getThemeLabel = (value: Theme): string => themePresetMap.get(value)?.label ?? "Light";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const next = resolveTheme(stored);
  document.documentElement.setAttribute("data-theme", next);
  return next;
};

const getInitialOffline = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OFFLINE_STORAGE_KEY) === "true";
};

const getInitialCursorTrail = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(CURSOR_TRAIL_STORAGE_KEY);
  if (stored === "on" || stored === "true" || stored === "1") return true;
  if (stored === "off" || stored === "false" || stored === "0") return false;

  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return !prefersReduced;
};

const usePrefersReducedMotion = (): boolean => {
  const [prefers, setPrefers] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(media.matches);
    const handleChange = (event: MediaQueryListEvent) => setPrefers(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return prefers;
};

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");
const formatTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
const abbreviateTx = (value?: string | null) =>
  value ? (value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value) : "—";
const toVaultMode = (mode?: string): VaultMode | undefined => {
  return mode === "safeStorage" || mode === "plain" || mode === "password" ? mode : undefined;
};
const formatVaultMode = (mode?: string) => {
  if (mode === "password") return "Password";
  if (mode === "plain") return "Local key";
  if (mode === "safeStorage") return "Safe storage";
  return "Unspecified";
};
function formatBytes(bytes?: number): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const formatTimeShort = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }) : "—";

const DEFAULT_AUTOSAVE_MS = AUTOSAVE_PRESETS.balanced;

const formatDraftSaveMode = (mode: DraftSaveMode) => {
  if (mode === "autosave") return "Autosave";
  if (mode === "duplicate") return "Duplicate";
  return "Manual save";
};

const buildAoExplorerUrl = (id?: string | null) => (id ? `https://ao.link/#/entity/${encodeURIComponent(id)}` : null);

const formatHost = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "");
  }
};

const openExternal = (url: string) => {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const formatCountdown = (ms: number | null): string => {
  if (ms == null) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const cloneValue = <T,>(value: T): T => {
  const structured = (globalThis as { structuredClone?: <V>(input: V) => V }).structuredClone;
  if (typeof structured === "function") {
    try {
      return structured(value);
    } catch {
      // Fallback to JSON clone below.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

type PasswordStrengthCheck = { id: string; label: string; pass: boolean };
type PasswordStrength = { score: number; label: string; hint: string; checks: PasswordStrengthCheck[] };

const COMMON_PASSWORD_PATTERNS = [/password/i, /letmein/i, /1234/, /qwerty/i, /darkmesh/i, /blackcat/i];

const evaluatePasswordStrength = (value: string): PasswordStrength => {
  const password = (value ?? "").trim();
  const checks: PasswordStrengthCheck[] = [
    { id: "length", label: "14+ characters", pass: password.length >= 14 },
    { id: "variety", label: "Upper, lower, number, symbol", pass: [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length >= 3 },
    { id: "entropy", label: "No long repeats", pass: password.length === 0 ? false : new Set(password.split("")).size / password.length >= 0.55 },
    {
      id: "patterns",
      label: "Avoid common words/sequences",
      pass:
        password.length === 0
          ? false
          : !COMMON_PASSWORD_PATTERNS.some((regex) => regex.test(password)) && !/(0123|1234|2345|3456|4567|abcd|qwer|aaaa)/i.test(password),
    },
  ];

  if (!password) {
    return { score: 0, label: "Add a password", hint: "Use 14+ chars with symbols.", checks };
  }

  const baseScore = checks.filter((item) => item.pass).length;
  const lengthBonus = password.length >= 20 ? 1 : 0;
  const uniqueRatio = password.length ? new Set(password).size / password.length : 0;
  const ratioBonus = uniqueRatio > 0.7 ? 1 : 0;
  const patternPenalty = checks.find((item) => item.id === "patterns" && !item.pass) ? 1 : 0;

  const rawScore = baseScore + lengthBonus + ratioBonus - patternPenalty;
  const capped = Math.max(0, Math.min(rawScore, 4));
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong"][capped];

  const firstMissing = checks.find((item) => !item.pass);
  const hint = firstMissing
    ? firstMissing.id === "length"
      ? "Add more length—aim for 14+ characters."
      : firstMissing.id === "variety"
        ? "Mix upper/lowercase letters, numbers, and symbols."
        : firstMissing.id === "entropy"
          ? "Avoid repeating the same character pattern."
          : "Swap out common words or sequences."
    : "Strong; store it somewhere safe.";

  return { score: capped, label, hint, checks };
};

const healthStatusLabel = (status: HealthStatus["status"]) => {
  switch (status) {
    case "ok":
      return "OK";
    case "warn":
      return "Warning";
    case "error":
      return "Error";
    case "missing":
      return "Missing";
    case "offline":
      return "Offline";
  }
  return status;
};

const healthSortByCheckedAtDesc = (a: HealthStatus, b: HealthStatus) =>
  new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime();

const getLatestHealthSuccess = (health: HealthStatus[]) =>
  [...health]
    .filter((item) => item.lastSuccessAt)
    .sort((a, b) => new Date(b.lastSuccessAt ?? 0).getTime() - new Date(a.lastSuccessAt ?? 0).getTime())[0];

const getLatestHealthError = (health: HealthStatus[]) =>
  [...health]
    .filter((item) => item.lastError)
    .sort(healthSortByCheckedAtDesc)[0];

const formatHealthRecap = (health: HealthStatus[]): string => {
  const parts: string[] = [];
  const latestSuccess = getLatestHealthSuccess(health);
  const latestError = getLatestHealthError(health);

  if (latestSuccess) {
    parts.push(`Last OK ${latestSuccess.id} ${formatTimeShort(latestSuccess.lastSuccessAt ?? latestSuccess.checkedAt)}`);
  }

  if (latestError) {
    const message = latestError.lastError?.trim() || latestError.detail?.trim();
    parts.push(
      `Last error ${latestError.id} ${formatTimeShort(latestError.checkedAt)}${message ? ` (${message})` : ""}`,
    );
  }

  return parts.join(" · ");
};

const averageLatencyMs = (item: Pick<HealthStatus, "latencyHistory" | "latencyMs">) => {
  if (item.latencyHistory?.length) {
    const total = item.latencyHistory.reduce((acc, value) => acc + value, 0);
    return Math.round(total / item.latencyHistory.length);
  }

  if (typeof item.latencyMs === "number") {
    return Math.round(item.latencyMs);
  }

  return null;
};

const mergeHealthResults = (previous: HealthStatus[], next: HealthStatus[]): HealthStatus[] => {
  const previousById = new Map(previous.map((item) => [item.id, item]));

  return next.map((item) => {
    const prior = previousById.get(item.id);
    const latencyHistory = (() => {
      const history = [...(prior?.latencyHistory ?? [])];
      if (typeof item.latencyMs === "number") {
        history.push(item.latencyMs);
      }
      return history.slice(-12);
    })();
    const lastSuccessAt =
      item.status === "ok" || item.status === "warn"
        ? item.lastSuccessAt ?? item.checkedAt
        : item.lastSuccessAt ?? prior?.lastSuccessAt;
    const lastError =
      item.lastError ??
      (item.status === "ok" ? prior?.lastError : item.detail ?? prior?.lastError);

    return {
      ...prior,
      ...item,
      lastSuccessAt,
      ...(latencyHistory.length ? { latencyHistory } : {}),
      ...(lastError ? { lastError } : {}),
    };
  });
};

const snapshotToEvent = (snapshot: HealthSnapshot, id: number): HealthEvent => ({
  ...snapshot,
  id,
  overall: snapshot.summary.overall,
  ok: snapshot.summary.ok,
  warn: snapshot.summary.warn,
  error: snapshot.summary.error,
  missing: snapshot.summary.missing,
  offline: snapshot.summary.offline,
});

type WalletBridgeResult = {
  path?: string;
  jwk?: Record<string, unknown>;
  error?: string;
  canceled?: boolean;
};

type FileBridgeResult = {
  path?: string;
  content?: string;
  error?: string;
  canceled?: boolean;
};

type Workspace = "data" | "ao" | "studio" | "preview";
type TaskState = "idle" | "pending" | "success" | "error";
type ActionStep = {
  id: string;
  label: string;
  status: TaskState | "idle";
  detail?: string | null;
  at?: string;
};
type PipVaultSnapshot = {
  exists: boolean;
  updatedAt?: string;
  encrypted: boolean;
  path: string;
  mode: "safeStorage" | "plain" | "password";
  iterations?: number;
  salt?: string;
  locked: boolean;
  lockedAt?: string;
  recordCount: number;
  kdf?: PipVaultKdfMeta;
  hardwarePlaceholder?: boolean;
};
type PipVaultIssue = {
  field: string;
  message: string;
  severity: "error" | "warn";
};
type PipVaultKdfProfile = PipVaultKdfMeta & { version?: number };
type BreachCheckStatus = "idle" | "checking" | "clear" | "maybe" | "error";

type VaultImportOptions = {
  useVaultPassword?: boolean;
  password?: string | null;
  rememberPassword?: boolean;
  onComplete?: () => void;
  onError?: (message: string) => void;
  source?: "wizard" | "panel";
};

type VaultExportOptions = {
  onComplete?: () => void;
  source?: "wizard" | "panel";
};

type CatalogFilterState = {
  search: string;
  types: string[];
  tags: string[];
  quickShape: string | null;
};

const THEME_STORAGE_KEY = "darkmesh-theme";
const OFFLINE_STORAGE_KEY = "darkmesh-offline-mode";
const CURSOR_TRAIL_STORAGE_KEY = "darkmesh-cursor-trail";
const LOCALE_STORAGE_KEY = "darkmesh-locale";
const PALETTE_RECENTS_STORAGE_KEY = "darkmesh-palette-recents";
const CATALOG_FILTER_STORAGE_KEY = "darkmesh-catalog-filters";
const CATALOG_RECENTS_STORAGE_KEY = "darkmesh-catalog-recents";
const CATALOG_RECENTS_LIMIT = 6;
const PALETTE_RECENTS_LIMIT = 8;
const OFFLINE_FETCH_ERROR = "Offline mode is enabled; network requests are blocked";
const HEALTH_AUTO_REFRESH_STORAGE_KEY = "health-auto-refresh";
const HEALTH_AUTO_REFRESH_CUSTOM_KEY = "health-auto-refresh-custom";
type HealthAutoRefresh = "off" | "10" | "30" | "60" | "custom";
const HEALTH_AUTO_REFRESH_OPTIONS: HealthAutoRefresh[] = ["off", "10", "30", "60", "custom"];
const PIP_VAULT_REMEMBER_KEY = "pip-vault-remember";
const PIP_VAULT_REMEMBER_PASSWORD_KEY = "pip-vault-remember-password";
const PIP_VAULT_AUTO_LOCK_KEY = "pip-vault-auto-lock-minutes";
const DEFAULT_PIP_VAULT_AUTO_LOCK_MINUTES = 15;
const PIP_VAULT_HARDWARE_PLACEHOLDER_KEY = "pip-vault-hardware-placeholder";
const PIP_VAULT_KDF_PREF_KEY = "pip-vault-kdf-profile";
const HEALTH_NOTIFY_STORAGE_KEY = "health-sla-notify";
const HEALTH_SLA_FAILURE_STORAGE_KEY = "health-sla-failure";
const HEALTH_SLA_LATENCY_STORAGE_KEY = "health-sla-latency";
const LAST_MODULE_TX_STORAGE_KEY = "ao-last-module-tx";
const LAST_SPAWN_STORAGE_KEY = "ao-last-spawn";
const AO_PINNED_IDS_STORAGE_KEY = "ao-console-pins";
const HOLOGRID_ENABLED_STORAGE_KEY = "darkmesh-hologrid-enabled";
const HOLOGRID_SPEED_STORAGE_KEY = "darkmesh-hologrid-speed";
const HOLOGRID_OPACITY_STORAGE_KEY = "darkmesh-hologrid-opacity";
const DEFAULT_HOLOGRID_SPEED = 1;
const MIN_HOLOGRID_SPEED = 0;
const MAX_HOLOGRID_SPEED = 2;
const DEFAULT_HOLOGRID_OPACITY = 1;
const MIN_HOLOGRID_OPACITY = 0;
const MAX_HOLOGRID_OPACITY = 1;

const setDocumentLanguage = (value: LocaleKey) => {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", value);
    document.documentElement.setAttribute("data-locale", value);
  }
};

const persistLocalePreference = (value: LocaleKey) => {
  setDocumentLanguage(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, value);
  }
  saveSettings({ locale: value });
};

const getEnv = (key: string): string | undefined => resolveEnvWithSettings(key);
const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};
const HEALTH_HISTORY_STORE_LIMIT = parsePositiveNumber(getEnv("HEALTH_HISTORY_LIMIT"), 200);
const HEALTH_EVENT_DISPLAY_LIMIT = 10;
const MIN_HEALTH_AUTO_REFRESH_SECONDS = 3;
const DEFAULT_HEALTH_AUTO_REFRESH_CUSTOM = parsePositiveNumber(getEnv("HEALTH_AUTO_REFRESH_CUSTOM_SECONDS"), 15);
const DEFAULT_SLA_FAILURE_THRESHOLD = parsePositiveNumber(getEnv("HEALTH_SLA_FAILURE_THRESHOLD"), 3);
const DEFAULT_SLA_LATENCY_THRESHOLD_MS = parsePositiveNumber(getEnv("HEALTH_SLA_LATENCY_MS"), 1500);
const MANIFEST_HISTORY_LIMIT = 20;
const VAULT_AUDIT_DISPLAY_LIMIT = 12;
const resolveAutoRefreshIntervalMs = (value: HealthAutoRefresh, customSeconds?: number): number | null => {
  if (value === "off") return null;
  const override =
    typeof window !== "undefined" && typeof (window as { __HEALTH_AUTO_REFRESH_MS__?: unknown }).__HEALTH_AUTO_REFRESH_MS__ !== "undefined"
      ? Number((window as { __HEALTH_AUTO_REFRESH_MS__?: unknown }).__HEALTH_AUTO_REFRESH_MS__)
      : NaN;
  if (Number.isFinite(override) && override > 0) {
    return Math.round(override);
  }
  if (value === "custom") {
    const seconds = Number.isFinite(customSeconds) && customSeconds ? Math.max(MIN_HEALTH_AUTO_REFRESH_SECONDS, customSeconds) : DEFAULT_HEALTH_AUTO_REFRESH_CUSTOM;
    return Math.round(seconds * 1000);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : null;
};

const clampHologridSpeed = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_HOLOGRID_SPEED;
  return Math.min(MAX_HOLOGRID_SPEED, Math.max(MIN_HOLOGRID_SPEED, value));
};

const clampHologridOpacity = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_HOLOGRID_OPACITY;
  return Math.min(MAX_HOLOGRID_OPACITY, Math.max(MIN_HOLOGRID_OPACITY, value));
};

const loadPaletteRecents = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PALETTE_RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
};

const DEFAULT_CATALOG_FILTERS: CatalogFilterState = { search: "", types: [], tags: [], quickShape: null };

const loadCatalogFilters = (): CatalogFilterState => {
  if (typeof window === "undefined") return DEFAULT_CATALOG_FILTERS;
  try {
    const raw = window.localStorage.getItem(CATALOG_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_CATALOG_FILTERS;
    const parsed = JSON.parse(raw) as Partial<CatalogFilterState>;
    const search = typeof parsed.search === "string" ? parsed.search : "";
    const types = Array.isArray(parsed.types) ? parsed.types.filter((value) => typeof value === "string") : [];
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((value) => typeof value === "string") : [];
    const validShapes = new Set(["hero", "cta", "grid", "timeline", "stats", "media", "pricing", "contact", "footer"]);
    const quickShape = typeof parsed.quickShape === "string" && validShapes.has(parsed.quickShape) ? parsed.quickShape : null;
    return { search, types, tags, quickShape };
  } catch {
    return DEFAULT_CATALOG_FILTERS;
  }
};

const persistCatalogFilters = (state: CatalogFilterState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATALOG_FILTER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

const loadRecentCatalogItems = (): CatalogItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CATALOG_RECENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? (parsed.filter(
          (entry) => entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string",
        ) as CatalogItem[])
      : [];
  } catch {
    return [];
  }
};

const persistRecentCatalogItems = (items: CatalogItem[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CATALOG_RECENTS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
};

const DEFAULT_ARGON2_PROFILE: PipVaultKdfProfile = {
  algorithm: "argon2id",
  iterations: 3,
  memoryKiB: 64 * 1024,
  parallelism: 1,
  version: 1,
};

const loadKdfProfile = (): PipVaultKdfProfile => {
  if (typeof window === "undefined") return DEFAULT_ARGON2_PROFILE;
  try {
    const raw = window.localStorage.getItem(PIP_VAULT_KDF_PREF_KEY);
    if (!raw) return DEFAULT_ARGON2_PROFILE;
    const parsed = JSON.parse(raw) as PipVaultKdfProfile;
    if (!parsed || typeof parsed !== "object" || !parsed.algorithm) return DEFAULT_ARGON2_PROFILE;
    return {
      ...DEFAULT_ARGON2_PROFILE,
      ...parsed,
    };
  } catch {
    return DEFAULT_ARGON2_PROFILE;
  }
};

const persistKdfProfile = (profile: PipVaultKdfProfile): PipVaultKdfProfile => {
  const normalized: PipVaultKdfProfile = {
    ...DEFAULT_ARGON2_PROFILE,
    ...profile,
    algorithm: profile.algorithm ?? "argon2id",
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PIP_VAULT_KDF_PREF_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage persistence issues
    }
  }

  return normalized;
};

declare global {
  interface Window {
    desktop?: {
      selectWallet: () => Promise<WalletBridgeResult>;
      pickModuleFile: () => Promise<FileBridgeResult>;
      readTextFile: (path: string) => Promise<FileBridgeResult>;
    };
    pipVault?: {
      read: () => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> }>;
      write: (pip: Record<string, unknown>) => Promise<{ updatedAt: string }>;
      clear: () => Promise<{ ok: true }>;
      describe: () => Promise<{
        exists: boolean;
        updatedAt?: string;
        encrypted: boolean;
        path: string;
        mode: "safeStorage" | "plain" | "password";
        iterations?: number;
        salt?: string;
        locked: boolean;
        lockedAt?: string;
        recordCount: number;
        hardwarePlaceholder?: boolean;
        kdf?: {
          algorithm: "pbkdf2" | "argon2id";
          iterations?: number;
          salt?: string;
          memoryKiB?: number;
          parallelism?: number;
          digest?: string;
          version?: number;
        };
      }>;
      list: () => Promise<{ exists: boolean; records: PipVaultRecord[] }>;
      loadRecord: (id: string) => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> }>;
      deleteRecord: (id: string) => Promise<{ ok: true; removed: boolean }>;
      enablePasswordMode: (
        password: string,
        options?: { kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean },
      ) => Promise<{
        ok: true;
        mode: "safeStorage" | "plain" | "password";
        kdf?: PipVaultKdfMeta;
        records?: number;
        hardwarePlaceholder?: boolean;
      }>;
      disablePasswordMode: () => Promise<{ ok: true; mode: "safeStorage" | "plain" | "password" }>;
      exportVault: () => Promise<{
        ok: true;
        bundle: string;
        checksum: string;
        bytes: number;
        createdAt: string;
        recordCount: number;
        hardwarePlaceholder?: boolean;
        kdf?: PipVaultKdfMeta;
      }>;
      importVault: (bundle: string | ArrayBuffer, password?: string) => Promise<{
        ok: true;
        mode: "safeStorage" | "plain" | "password";
        records: number;
        kdf?: PipVaultKdfMeta;
        hardwarePlaceholder?: boolean;
      }>;
      scanIntegrity: (
        password?: string,
      ) => Promise<{ ok: true; scanned: number; failed: { id: string; error: string }[]; durationMs: number; recordCount: number }>;
      repairRecord: (
        id: string,
        options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean },
      ) => Promise<{ ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string }>;
      setHardwarePlaceholder: (enabled: boolean) => Promise<{ ok: true; hardwarePlaceholder: boolean }>;
      telemetry: (event: { event: string; at?: string; detail?: Record<string, unknown> }) => Promise<{ ok: true }>;
      lock: () => Promise<{ ok: true; locked: boolean; lockedAt: string }>;
    };
    __HEALTH_AUTO_REFRESH_MS__?: number;
  }
}

const normalizeManifest = (doc: ManifestDocument): ManifestDocument => {
  const fallbackDate = new Date().toISOString();

  return {
    ...doc,
    id: doc.id || `manifest-${randomId()}`,
    name: doc.name?.trim() || "Untitled manifest",
    version: doc.version || "0.1.0",
    metadata: {
      author: doc.metadata?.author,
      description: doc.metadata?.description,
      createdAt: doc.metadata?.createdAt ?? fallbackDate,
      updatedAt: doc.metadata?.updatedAt ?? doc.metadata?.createdAt ?? fallbackDate,
    },
    nodes: Array.isArray(doc.nodes) ? doc.nodes : [],
  };
};

const manifestSignature = (doc: ManifestDocument): string => JSON.stringify(normalizeManifest(doc));

const upsertDraftRow = (drafts: ManifestDraft[], saved: ManifestDraft): ManifestDraft[] => {
  const next = drafts.filter((draft) => draft.id !== saved.id);
  next.unshift(saved);
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const findNodeById = (nodes: ManifestNode[], id: string | null): ManifestNode | null => {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const match = node.children ? findNodeById(node.children, id) : null;
    if (match) return match;
  }
  return null;
};

const updateNodeInTree = (
  nodes: ManifestNode[],
  targetId: string,
  mutate: (node: ManifestNode) => ManifestNode,
): ManifestNode[] => {
  let changed = false;

  const updated = nodes.map((node) => {
    const nextChildren = node.children ? updateNodeInTree(node.children, targetId, mutate) : node.children;
    const childrenChanged = node.children ? nextChildren !== node.children : false;

    if (node.id === targetId) {
      changed = true;
      return mutate({ ...node, children: nextChildren });
    }

    if (childrenChanged) {
      changed = true;
      return { ...node, children: nextChildren };
    }

    return node;
  });

  return changed ? updated : nodes;
};

const appendNodeToTree = (nodes: ManifestNode[], targetId: string, child: ManifestNode): ManifestNode[] => {
  let changed = false;

  const updated = nodes.map((node) => {
    const nextChildren = node.children ? appendNodeToTree(node.children, targetId, child) : node.children;
    const childrenChanged = node.children ? nextChildren !== node.children : false;

    if (node.id === targetId) {
      changed = true;
      return {
        ...node,
        children: [...(node.children ?? []), child],
      };
    }

    if (childrenChanged) {
      changed = true;
      return { ...node, children: nextChildren };
    }

    return node;
  });

  return changed ? updated : nodes;
};

const cloneNode = (node: ManifestNode): ManifestNode => JSON.parse(JSON.stringify(node));

const removeNodeFromTree = (nodes: ManifestNode[], targetId: string): { nodes: ManifestNode[]; removed: boolean } => {
  let removed = false;

  const walk = (list: ManifestNode[]): ManifestNode[] =>
    list
      .map((node) => {
        if (node.id === targetId) {
          removed = true;
          return null;
        }
        if (node.children?.length) {
          const nextChildren = walk(node.children);
          if (nextChildren !== node.children) {
            return { ...node, children: nextChildren };
          }
        }
        return node;
      })
      .filter(Boolean) as ManifestNode[];

  const pruned = walk(nodes);
  return { nodes: removed ? pruned : nodes, removed };
};

const insertNodeIntoTree = (
  nodes: ManifestNode[],
  parentId: string | null,
  node: ManifestNode,
  position?: number,
): ManifestNode[] => {
  if (!parentId) {
    const next = [...nodes];
    const index = position != null ? Math.max(0, Math.min(position, next.length)) : next.length;
    next.splice(index, 0, node);
    return next;
  }

  let inserted = false;
  const updated = nodes.map((entry) => {
    if (entry.id === parentId) {
      const children = [...(entry.children ?? [])];
      const index = position != null ? Math.max(0, Math.min(position, children.length)) : children.length;
      children.splice(index, 0, node);
      inserted = true;
      return { ...entry, children };
    }

    if (entry.children?.length) {
      const nextChildren = insertNodeIntoTree(entry.children, parentId, node, position);
      if (nextChildren !== entry.children) {
        inserted = true;
        return { ...entry, children: nextChildren };
      }
    }

    return entry;
  });

  if (inserted) return updated;
  return [...nodes, node];
};

const detachNodeFromTree = (
  nodes: ManifestNode[],
  targetId: string,
): { nodes: ManifestNode[]; removed: ManifestNode | null } => {
  let removed: ManifestNode | null = null;

  const walk = (list: ManifestNode[]): ManifestNode[] => {
    let changed = false;

    const next = list
      .map((node) => {
        if (node.id === targetId) {
          removed = node;
          changed = true;
          return null;
        }
        if (node.children?.length) {
          const nextChildren = walk(node.children);
          if (nextChildren !== node.children) {
            changed = true;
            return { ...node, children: nextChildren };
          }
        }
        return node;
      })
      .filter(Boolean) as ManifestNode[];

    return changed ? next : list;
  };

  const pruned = walk(nodes);
  return { nodes: removed ? pruned : nodes, removed };
};

const isAncestorOf = (
  ancestorId: string,
  nodeId: string,
  parentIndex: Map<string, { parentId: string | null; index: number }>,
): boolean => {
  let current = parentIndex.get(nodeId);
  while (current) {
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? parentIndex.get(current.parentId) : undefined;
  }
  return false;
};

const moveNodeWithinTree = (
  nodes: ManifestNode[],
  sourceId: string,
  targetId: string | null,
  placement: DropPlacement,
): ManifestNode[] => {
  if (sourceId === targetId) return nodes;

  const parentIndex = buildParentIndex(nodes);
  const sourceMeta = parentIndex.get(sourceId);
  if (!sourceMeta) return nodes;
  const siblingList = sourceMeta.parentId ? findNodeById(nodes, sourceMeta.parentId)?.children ?? [] : nodes;

  if (targetId && isAncestorOf(sourceId, targetId, parentIndex)) {
    return nodes;
  }

  const targetMeta = targetId ? parentIndex.get(targetId) : null;
  if (targetId && !targetMeta) return nodes;

  const { nodes: withoutSource, removed } = detachNodeFromTree(nodes, sourceId);
  if (!removed) return nodes;

  let destinationParent: string | null = null;
  let destinationIndex: number | undefined;

  if (!targetId) {
    destinationParent = null;
    destinationIndex = placement === "before" ? 0 : undefined;
  } else if (placement === "inside") {
    destinationParent = targetId;
    destinationIndex = undefined;
  } else {
    destinationParent = targetMeta?.parentId ?? null;
    let baseIndex = targetMeta?.index ?? 0;
    const sameParent = destinationParent === sourceMeta.parentId;
    if (sameParent && sourceMeta.index < (targetMeta?.index ?? 0)) {
      baseIndex -= 1;
    }
    if (placement === "after") {
      baseIndex += 1;
    }
    destinationIndex = Math.max(0, baseIndex);
  }

  if (destinationParent === sourceMeta.parentId && destinationIndex != null) {
    const boundedIndex = Math.max(0, Math.min(destinationIndex, Math.max(0, siblingList.length - 1)));
    if (boundedIndex === sourceMeta.index) {
      return nodes;
    }
  }

  const nextNodes = insertNodeIntoTree(withoutSource, destinationParent, removed, destinationIndex);
  return nextNodes;
};

const ensureEntry = (entry: string | undefined, nodes: ManifestNode[]): string | undefined => {
  if (entry && findNodeById(nodes, entry)) return entry;
  return nodes[0]?.id;
};

const countNodes = (nodes: ManifestNode[]): number =>
  nodes.reduce((total, node) => total + 1 + (node.children ? countNodes(node.children) : 0), 0);

const flattenManifestOrder = (manifest: ManifestDocument): string[] => {
  const order: string[] = [];
  const visited = new Set<string>();
  const walk = (node: ManifestNode | undefined) => {
    if (!node || visited.has(node.id)) return;
    visited.add(node.id);
    order.push(node.id);
    node.children?.forEach((child) => walk(child));
  };

  const byId = new Map(manifest.nodes.map((node) => [node.id, node]));
  if (manifest.entry) {
    walk(byId.get(manifest.entry));
  }
  manifest.nodes.forEach((node) => walk(node));
  return order;
};

const buildParentIndex = (
  nodes: ManifestNode[],
  parentId: string | null = null,
  map = new Map<string, { parentId: string | null; index: number }>(),
): Map<string, { parentId: string | null; index: number }> => {
  nodes.forEach((node, index) => {
    map.set(node.id, { parentId, index });
    if (node.children?.length) {
      buildParentIndex(node.children, node.id, map);
    }
  });
  return map;
};

const removeNodesById = (nodes: ManifestNode[], ids: Set<string>): ManifestNode[] => {
  let changed = false;

  const next = nodes
    .map((node) => {
      if (ids.has(node.id)) {
        changed = true;
        return null;
      }
      const nextChildren = node.children ? removeNodesById(node.children, ids) : undefined;
      if (nextChildren && nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
      return node;
    })
    .filter(Boolean) as ManifestNode[];

  return changed ? next : nodes;
};

const cloneNodeWithNewIds = (node: ManifestNode, collected: string[]): ManifestNode => {
  const cloned = cloneNode(node);

  const assignIds = (entry: ManifestNode): ManifestNode => {
    const nextId = `${entry.id}-${randomId()}`;
    const nextChildren = entry.children?.map((child) => assignIds(child)) ?? [];
    const next = { ...entry, id: nextId, children: nextChildren };
    collected.push(nextId);
    return next;
  };

  return assignIds(cloned);
};

const duplicateNodesInTree = (
  nodes: ManifestNode[],
  selected: Set<string>,
  collected: string[],
  ancestorSelected = false,
): ManifestNode[] => {
  let changed = false;

  const next = nodes.flatMap((node) => {
    const childSelected = ancestorSelected || selected.has(node.id);
    const nextChildren = node.children ? duplicateNodesInTree(node.children, selected, collected, childSelected) : node.children;
    const baseNode = nextChildren !== node.children ? { ...node, children: nextChildren } : node;
    const result: ManifestNode[] = [baseNode];

    if (selected.has(node.id) && !ancestorSelected) {
      const clone = cloneNodeWithNewIds(baseNode, collected);
      result.push(clone);
      changed = true;
    } else if (nextChildren !== node.children) {
      changed = true;
    }

    return result;
  });

  return changed ? next : nodes;
};

const selectionsEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const uniqueSorted = (values: Iterable<string>): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const buildActionTimeline = (kind: "deploy" | "spawn"): ActionStep[] => {
  const steps = kind === "deploy" ? ["Wallet", "Signer", "Deploy"] : ["Wallet", "Module", "Spawn"];
  return steps.map((label) => ({
    id: `${kind}-${label.toLowerCase().replace(/\\s+/g, "-")}`,
    label,
    status: "idle" as const,
    detail: null,
  }));
};

const stampStep = (step: ActionStep, status: ActionStep["status"], detail?: string | null): ActionStep => ({
  ...step,
  status,
  detail: detail ?? step.detail,
  at: new Date().toISOString(),
});

const updateTimelineStep = (
  timeline: ActionStep[],
  id: string,
  status: ActionStep["status"],
  detail?: string | null,
): ActionStep[] =>
  timeline.map((step) => (step.id === id ? stampStep(step, status, detail) : step));

const loadLastModuleTx = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_MODULE_TX_STORAGE_KEY);
  } catch {
    return null;
  }
};

const persistLastModuleTx = (value: string | null): void => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(LAST_MODULE_TX_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(LAST_MODULE_TX_STORAGE_KEY);
    }
  } catch {
    // ignore storage issues
  }
};

const loadLastSpawnSnapshot = (): SpawnSnapshot | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SPAWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpawnSnapshot;
    if (parsed?.processId && parsed?.manifestTx && parsed?.moduleTx) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const persistLastSpawnSnapshot = (snapshot: SpawnSnapshot | null): void => {
  if (typeof window === "undefined") return;
  try {
    if (snapshot) {
      window.localStorage.setItem(LAST_SPAWN_STORAGE_KEY, JSON.stringify(snapshot));
    } else {
      window.localStorage.removeItem(LAST_SPAWN_STORAGE_KEY);
    }
  } catch {
    // ignore storage issues
  }
};

const matchesCatalogFilters = (
  item: CatalogItem,
  activeTypes: string[],
  activeTags: string[],
): boolean => {
  const typeMatch = activeTypes.length === 0 || activeTypes.includes(item.type);
  const tagMatch =
    activeTags.length === 0 || (item.tags ?? []).some((tag) => activeTags.includes(tag));

  return typeMatch && tagMatch;
};

type CatalogShape = "hero" | "cta" | "grid" | "timeline" | "stats" | "media" | "pricing" | "contact" | "footer";

const blockShapeForType = (type: string): CatalogShape => {
  const normalized = type.toLowerCase();
  if (normalized.includes("hero")) return "hero";
  if (normalized.includes("cta")) return "cta";
  if (normalized.includes("timeline")) return "timeline";
  if (normalized.includes("stat")) return "stats";
  if (normalized.includes("gallery") || normalized.includes("media")) return "media";
  if (normalized.includes("pricing")) return "pricing";
  if (normalized.includes("contact")) return "contact";
  if (normalized.includes("footer")) return "footer";
  if (normalized.includes("grid")) return "grid";
  return "grid";
};

const quickTagFilters = ["marketing", "data", "media", "commerce", "support"] as const;

const quickShapeFilters = [
  { id: "hero", label: "Hero", sampleType: "block.hero", hint: "Headlines & CTA" },
  { id: "cta", label: "CTA", sampleType: "block.cta", hint: "Banners & prompts" },
  { id: "grid", label: "Grid", sampleType: "block.featureGrid", hint: "Cards & columns" },
  { id: "timeline", label: "Timeline", sampleType: "block.timeline", hint: "Roadmaps & steps" },
  { id: "stats", label: "Stats", sampleType: "block.stats", hint: "KPIs & telemetry" },
  { id: "media", label: "Media", sampleType: "block.gallery", hint: "Gallery & embeds" },
  { id: "pricing", label: "Pricing", sampleType: "block.pricing", hint: "Plans & tiers" },
  { id: "contact", label: "Contact", sampleType: "block.contact", hint: "Forms & methods" },
  { id: "footer", label: "Footer", sampleType: "block.footer", hint: "Links & socials" },
] as const;

const BlockPlaceholder: React.FC<{ type: string }> = ({ type }) => {
  const shape = blockShapeForType(type);
  const className = `block-placeholder ${shape}`;

  return (
    <div className={className} aria-hidden>
      <div className="placeholder-head">
        <span className="placeholder-chip" />
        {(shape === "cta" || shape === "hero") && <span className="placeholder-pill" />}
      </div>
      <span className="placeholder-line wide" />
      <span className="placeholder-line" />
      <span className="placeholder-line short" />
      {shape === "grid" && (
        <div className="placeholder-grid">
          <span />
          <span />
          <span />
        </div>
      )}
      {shape === "media" && <span className="placeholder-frame" />}
      {shape === "pricing" && (
        <div className="placeholder-pricing">
          <span />
          <span />
          <span />
        </div>
      )}
      {shape === "timeline" && (
        <div className="placeholder-timeline">
          {[0, 1, 2].map((index) => (
            <div key={index} className="placeholder-timeline-step">
              <span className="timeline-dot" />
              <span className="placeholder-line wide" />
              <span className="placeholder-pill tiny" />
            </div>
          ))}
        </div>
      )}
      {shape === "stats" && (
        <div className="placeholder-stats">
          {[0, 1, 2].map((index) => (
            <div key={index} className="placeholder-stat-card">
              <span className="placeholder-line short" />
              <span className="placeholder-line wide" />
              <span className="placeholder-pill tiny" />
            </div>
          ))}
        </div>
      )}
      {shape === "contact" && (
        <div className="placeholder-contact">
          <div className="placeholder-contact-list">
            <span className="placeholder-pill" />
            <span className="placeholder-pill" />
            <span className="placeholder-pill" />
          </div>
          <div className="placeholder-form">
            <span className="placeholder-input" />
            <span className="placeholder-input short" />
            <span className="placeholder-button" />
          </div>
        </div>
      )}
    </div>
  );
};

const formatPropsValue = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (isManifestExpression(value)) return `expr(${value.__expr || ""})`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    const json = JSON.stringify(value);
    if (!json) return String(value);
    return json.length > 96 ? `${json.slice(0, 93)}...` : json;
  } catch {
    return String(value);
  }
};

const getIssueLabel = (issues: PropsValidationIssue[]): string =>
  issues.length === 1 ? "1 issue" : `${issues.length} issues`;

type PropsDraftPath = Array<string | number>;
type PropsMode = "form" | "json";
type DropPlacement = "before" | "after" | "inside";
type TreeDropMode = "catalog" | "move";
type TreeDropState = { id: string | null; placement: DropPlacement; mode: TreeDropMode | null };
type DropGhostOverlay = { rect: DOMRect; placement: DropPlacement; label: string; type: string; mode: TreeDropMode | null };
type NodeValidationSummary = {
  id: string;
  title?: string;
  type?: string;
  issues: PropsValidationIssue[];
  missingRequired: PropsValidationIssue[];
  diffEntries: PropsDiffEntry[];
  diffCounts: { added: number; changed: number; removed: number };
  defaults: ManifestShape;
  hasSchema: boolean;
  valid: boolean;
};

type ManifestIssue = {
  nodeId: string;
  nodeTitle?: string;
  nodeType?: string;
  issue: PropsValidationIssue;
};

const stringifyPropsDraft = (value: unknown): string => JSON.stringify(value, null, 2);

const getSchemaTypeLabel = (schema: PropsSchema | undefined, value: unknown): string => {
  if (isManifestExpression(value)) return "Expression";
  const type = schema?.type;
  if (type === "array") return "Array";
  if (type === "object") return "Object";
  if (type === "boolean") return "Boolean";
  if (type === "number") return "Number";
  if (type === "null") return "Null";
  if (type === "string") {
    if (schema?.enum?.length) return "Select";
    return "Text";
  }
  if (Array.isArray(value)) return "Array";
  if (value === null) return "Null";
  if (typeof value === "boolean") return "Boolean";
  if (typeof value === "number") return "Number";
  if (typeof value === "string") return "Text";
  return "Value";
};

const updateDraftValue = (value: unknown, path: PropsDraftPath, nextValue: unknown): unknown => {
  if (!path.length) {
    return nextValue;
  }

  const [head, ...rest] = path;

  if (typeof head === "number") {
    const current = Array.isArray(value) ? [...value] : [];
    const index = head < 0 ? 0 : head;
    if (rest.length === 0) {
      current[index] = nextValue;
      return current;
    }
    current[index] = updateDraftValue(current[index], rest, nextValue);
    return current;
  }

  const current = isPlainObject(value) ? { ...value } : {};
  if (rest.length === 0) {
    current[head] = nextValue;
    return current;
  }

  current[head] = updateDraftValue(current[head], rest, nextValue);
  return current;
};

const removeDraftValue = (value: unknown, path: PropsDraftPath): unknown => {
  if (!path.length) {
    return value;
  }

  const [head, ...rest] = path;

  if (typeof head === "number") {
    if (!Array.isArray(value)) {
      return value;
    }

    const current = [...value];
    if (rest.length === 0) {
      current.splice(head, 1);
      return current;
    }

    current[head] = removeDraftValue(current[head], rest);
    return current;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (rest.length === 0) {
    const next = { ...value };
    delete next[head];
    return next;
  }

  return {
    ...value,
    [head]: removeDraftValue(value[head], rest),
  };
};

const draftPathToString = (path: PropsDraftPath): string =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") {
      return acc ? `${acc}[${segment}]` : `[${segment}]`;
    }
    return acc ? `${acc}.${segment}` : String(segment);
  }, "");

const pathHasDiff = (pathKey: string, diffPaths?: Set<string>): boolean => {
  if (!diffPaths || diffPaths.size === 0) return false;
  if (!pathKey) return diffPaths.size > 0;

  for (const entry of diffPaths) {
    if (entry === pathKey) return true;
    if (entry.startsWith(`${pathKey}.`) || entry.startsWith(`${pathKey}[`)) return true;
  }

  return false;
};

const PropsSchemaField: React.FC<{
  schema: PropsSchema | undefined;
  value: unknown;
  path: PropsDraftPath;
  onChange: (path: PropsDraftPath, value: unknown) => void;
  diffPaths?: Set<string>;
}> = ({ schema, value, path, onChange, diffPaths }) => {
  const label = schema?.title ?? path[path.length - 1]?.toString() ?? "Root";
  const description = schema?.description;
  const [helpOpen, setHelpOpen] = useState(false);
  const expressionActive = isManifestExpression(value);
  const resolvedType =
    expressionActive ? "expression" : schema?.type ?? (Array.isArray(value) ? "array" : isPlainObject(value) ? "object" : undefined);
  const pathKey = draftPathToString(path);
  const hasDiff = pathHasDiff(pathKey, diffPaths);
  const expressionValue = expressionActive ? value.__expr : "";
  const expressionError = expressionActive && !expressionValue.trim() ? "Expression cannot be empty" : null;
  const typeLabel = expressionActive ? "Expression" : getSchemaTypeLabel(schema, value);

  const hasHelp = Boolean(description);
  const helpButton = hasHelp ? (
    <button
      type="button"
      className={`schema-help-button ${helpOpen ? "active" : ""}`}
      onClick={() => setHelpOpen((current) => !current)}
      aria-label={helpOpen ? "Hide help" : "Show help"}
      aria-pressed={helpOpen}
      title={description}
    >
      ?
    </button>
  ) : null;
  const helpContent = hasHelp && helpOpen ? <p className="schema-description">{description}</p> : null;
  const labelRow = (
    <div className="schema-label-row">
      <span className="schema-label">{label}</span>
      {helpButton}
    </div>
  );

  const toggleExpression = () => {
    if (expressionActive) {
      const fallback = schema ? buildFormValue(schema, undefined) : "";
      onChange(path, fallback === undefined ? "" : fallback);
      return;
    }
    const seed =
      typeof value === "string"
        ? value
        : value == null
          ? ""
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : "";
    onChange(path, { __expr: seed });
  };

  const renderHeader = (options?: { allowExpressionToggle?: boolean; extraActions?: React.ReactNode }) => (
    <div className="schema-fieldset-head">
      <div className="schema-head-column">
        {labelRow}
        {helpContent}
      </div>
      <div className="schema-inline-actions">
        <span className="badge ghost">{typeLabel}</span>
        {hasDiff ? <span className="badge changed">Override</span> : null}
        {options?.extraActions}
        {options?.allowExpressionToggle ? (
          <button
            type="button"
            className={`chip ${expressionActive ? "active" : ""}`}
            onClick={toggleExpression}
          >
            {expressionActive ? "Expression" : "Literal"}
          </button>
        ) : null}
      </div>
    </div>
  );

  const expressionControl = (
    <div className="expression-row">
      <input
        type="text"
        value={expressionValue}
        onChange={(e) => onChange(path, { __expr: e.target.value })}
        placeholder="Enter expression…"
        className={expressionError ? "invalid" : ""}
      />
      <span className="badge expression">Expression</span>
    </div>
  );

  const renderLeaf = (control: React.ReactNode) => (
    <div className={`schema-control ${hasDiff ? "schema-diff" : ""}`}>
      {renderHeader({ allowExpressionToggle: true })}
      {expressionActive ? expressionControl : control}
      {expressionError ? <p className="error field-error">{expressionError}</p> : null}
    </div>
  );

  if (resolvedType === "object") {
    const record = isPlainObject(value) ? value : {};
    const properties = schema?.properties ?? {};
    const propertyKeys = Object.keys(properties);
    const extraKeys = Object.keys(record).filter((key) => !propertyKeys.includes(key));
    const allKeys = [...propertyKeys, ...extraKeys];

    return (
      <fieldset className={`schema-fieldset ${hasDiff ? "schema-diff" : ""}`}>
        {renderHeader({ allowExpressionToggle: false })}
        <div className="schema-grid">
          {allKeys.length ? (
            allKeys.map((key) => {
              const childSchema = properties[key] ?? (isPlainObject(schema?.additionalProperties) ? schema?.additionalProperties : undefined);
              const childValue = record[key];
              const childPath = [...path, key];
              return (
                <PropsSchemaField
                  key={draftPathToString(childPath)}
                  schema={childSchema}
                  value={childValue}
                  path={childPath}
                  onChange={onChange}
                  diffPaths={diffPaths}
                />
              );
            })
          ) : (
            <p className="hint">No fields in this object schema.</p>
          )}
        </div>
      </fieldset>
    );
  }

  if (resolvedType === "array") {
    const items = Array.isArray(value) ? value : [];
    const addItem = (index?: number) => {
      const nextItem = buildFormValue(schema?.items, undefined);
      const next = [...items];
      if (typeof index === "number" && index >= 0 && index <= next.length) {
        next.splice(index, 0, nextItem);
      } else {
        next.push(nextItem);
      }
      onChange(path, next);
    };
    const removeItem = (index: number) => onChange(path, removeDraftValue(items, [index]));
    const moveItem = (index: number, direction: "up" | "down") => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      const [entry] = next.splice(index, 1);
      next.splice(target, 0, entry);
      onChange(path, next);
    };
    const cloneItem = (index: number) => {
      const entry = items[index];
      const next = [...items];
      next.splice(index + 1, 0, cloneValue(entry));
      onChange(path, next);
    };

    return (
      <fieldset className={`schema-fieldset ${hasDiff ? "schema-diff" : ""}`}>
        {renderHeader({
          allowExpressionToggle: false,
          extraActions: (
            <button className="ghost small" type="button" onClick={() => addItem()}>
              + Add item
            </button>
          ),
        })}
        <div className="schema-list">
          {items.length ? (
            items.map((entry, index) => (
              <div key={draftPathToString([...path, index])} className="schema-list-item">
                <div className="schema-list-item-head">
                  <div className="schema-label-row">
                    <span className="schema-label">{schema?.items?.title ?? `${label} ${index + 1}`}</span>
                    <span className="schema-item-index">#{index + 1}</span>
                  </div>
                  <div className="schema-inline-actions compact">
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => moveItem(index, "up")}
                      disabled={index === 0}
                      aria-label="Move item up"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => moveItem(index, "down")}
                      disabled={index === items.length - 1}
                      aria-label="Move item down"
                    >
                      ↓
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => cloneItem(index)}
                      aria-label="Duplicate item"
                    >
                      ⧉
                    </button>
                    <button
                      className="icon-button ghost"
                      type="button"
                      onClick={() => addItem(index + 1)}
                      aria-label="Add item below"
                    >
                      ＋
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => removeItem(index)}
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <PropsSchemaField
                  schema={schema?.items}
                  value={entry}
                  path={[...path, index]}
                  onChange={onChange}
                  diffPaths={diffPaths}
                />
              </div>
            ))
          ) : (
            <div className="schema-empty">
              <p className="hint">No items yet.</p>
              <button className="ghost small" type="button" onClick={() => addItem()}>
                Add first item
              </button>
            </div>
          )}
          {items.length ? (
            <div className="schema-list-footer">
              <button className="ghost small" type="button" onClick={() => addItem()}>
                + Add item
              </button>
            </div>
          ) : null}
        </div>
      </fieldset>
    );
  }

  if (resolvedType === "boolean") {
    return renderLeaf(
      <label className="toggle schema-toggle">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(path, e.target.checked)}
        />
        <span>{Boolean(value) ? "True" : "False"}</span>
      </label>,
    );
  }

  if (resolvedType === "number") {
    return renderLeaf(
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const next = e.target.value.trim();
          onChange(path, next === "" ? 0 : Number(next));
        }}
      />,
    );
  }

  if (resolvedType === "string" && schema?.enum?.length) {
    const options = schema.enum.map((entry) => String(entry));
    const current = typeof value === "string" ? value : options[0] ?? "";
    return renderLeaf(
      <div className="enum-options">
        {options.map((option) => {
          const active = current === option;
          return (
            <button
              key={option}
              type="button"
              className={`enum-badge ${active ? "active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(path, option)}
            >
              {option}
            </button>
          );
        })}
      </div>,
    );
  }

  if (resolvedType === "null") {
    return renderLeaf(<input value="null" disabled readOnly />);
  }

  return renderLeaf(
    <input
      type="text"
      value={typeof value === "string" ? value : value == null ? "" : String(value)}
      onChange={(e) => onChange(path, e.target.value)}
    />,
  );
};

const DiffGroup: React.FC<{
  label: string;
  kind: PropsDiffEntry["kind"];
  entries: PropsDiffEntry[];
  showOverrides: boolean;
  issuesByPath: Map<string, PropsValidationIssue[]>;
}> = ({ label, kind, entries, showOverrides, issuesByPath }) => (
  <section className={`diff-group ${kind}`}>
    <div className="diff-group-head">
      <div className="diff-group-title">
        <span>{label}</span>
        <span className="badge ghost">{entries.length}</span>
      </div>
      <span className={`badge ${kind}`}>{kind}</span>
    </div>
    {entries.length ? (
      <div className="diff-list">
        {entries.map((entry) => {
          const issues = issuesByPath.get(entry.path) ?? [];
          return (
            <div key={`${entry.kind}-${entry.path}`} className={`diff-row ${entry.kind} ${issues.length ? "has-issues" : ""}`}>
              <div className="diff-row-head">
                <span className="diff-path">{entry.path || "root"}</span>
                {issues.length ? <span className="badge issue">{getIssueLabel(issues)}</span> : null}
              </div>
              {showOverrides ? (
                <div className="diff-values">
                  {entry.kind !== "added" ? (
                    <div className="diff-value-block">
                      <span className="diff-value-label">Before</span>
                      <code className="diff-value before">{formatPropsValue(entry.before)}</code>
                    </div>
                  ) : null}
                  {entry.kind !== "removed" ? (
                    <div className="diff-value-block">
                      <span className="diff-value-label">After</span>
                      <code className="diff-value after">{formatPropsValue(entry.after)}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    ) : (
      <p className="hint">No {label.toLowerCase()} fields.</p>
    )}
  </section>
);

const LazySkeletonLine: React.FC<{ width?: string }> = ({ width = "100%" }) => (
  <span className="lazy-skeleton-line" style={{ width }} />
);

const LazySkeletonPill: React.FC<{ width?: string }> = ({ width = "96px" }) => (
  <span className="lazy-skeleton-pill" style={{ width }} />
);

const ManifestRendererFallback: React.FC = () => (
  <div className="manifest-skeleton" role="status" aria-live="polite">
    {Array.from({ length: 3 }).map((_, index) => (
      <div key={index} className="manifest-skeleton-card">
        <div className="manifest-skeleton-head">
          <LazySkeletonPill width="28%" />
          <LazySkeletonLine width="58%" />
        </div>
        <LazySkeletonLine />
        <LazySkeletonLine width="76%" />
        <div className="manifest-skeleton-meta">
          <LazySkeletonPill width="22%" />
          <LazySkeletonPill width="32%" />
          <LazySkeletonPill width="18%" />
        </div>
      </div>
    ))}
  </div>
);

const AoHolomapFallback: React.FC = () => (
  <div className="holomap-fallback" role="status" aria-live="polite">
    <LazySkeletonLine width="52%" />
    <LazySkeletonLine width="64%" />
    <LazySkeletonPill width="38%" />
  </div>
);

const workspaceLabels: Record<Workspace, string> = {
  studio: "Creator Studio",
  ao: "AO Console",
  data: "Data Core",
  preview: "Preview Hub",
};

const WorkspaceSuspenseFallback: React.FC<{ workspace: Workspace }> = ({ workspace }) => (
  <div className="workspace-fallback" role="status" aria-live="polite">
    <p className="eyebrow">Loading</p>
    <h4>{workspaceLabels[workspace]}</h4>
    <p className="subtle">Pulling lazy chunks for this workspace…</p>
    {workspace === "preview" ? <AoHolomapFallback /> : null}
  </div>
);

const AoLogPanelFallback: React.FC = () => (
  <div className="ao-log-panel" role="status" aria-live="polite">
    <div className="ao-log-panel-header">
      <div>
        <p className="eyebrow">AO console log</p>
        <h4>Loading action payloads…</h4>
      </div>
      <div className="ao-log-toolbar">
        <div className="ao-log-filters">
          <LazySkeletonPill width="86px" />
          <LazySkeletonPill width="98px" />
          <LazySkeletonPill width="86px" />
        </div>
        <div className="ao-log-filters">
          <LazySkeletonPill width="96px" />
          <LazySkeletonPill width="84px" />
          <LazySkeletonPill width="88px" />
        </div>
      </div>
    </div>
    <div className="ao-log-metrics">
      <div className="ao-log-metric-card">
        <LazySkeletonLine width="42%" />
        <LazySkeletonPill width="48%" />
      </div>
      <div className="ao-log-metric-card">
        <LazySkeletonLine width="36%" />
        <LazySkeletonPill width="52%" />
      </div>
      <div className="ao-log-metric-card">
        <LazySkeletonLine width="64%" />
        <LazySkeletonLine width="72%" />
      </div>
    </div>
    <div className="ao-log-table-wrap">
      <table className="ao-log-table">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">tx / processId</th>
            <th scope="col">Status</th>
            <th scope="col">Latency</th>
            <th scope="col">Time</th>
            <th scope="col">Actions</th>
            <th scope="col">Details</th>
          </tr>
        </thead>
        <tbody className="ao-log-skeleton-body">
          {Array.from({ length: 4 }).map((_, row) => (
            <tr key={row}>
              <td>
                <LazySkeletonPill width="62px" />
              </td>
              <td>
                <LazySkeletonLine width="86%" />
              </td>
              <td>
                <LazySkeletonPill width="78px" />
              </td>
              <td>
                <LazySkeletonLine width="64%" />
              </td>
              <td>
                <LazySkeletonLine width="72%" />
              </td>
              <td>
                <LazySkeletonLine width="60%" />
              </td>
              <td>
                <LazySkeletonLine width="60%" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DraftDiffPanelFallback: React.FC<{
  leftLabel: string;
  leftDetail?: string;
  onClose: () => void;
}> = ({ leftLabel, leftDetail, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "draft-diff-loading-title";
  const descriptionId = "draft-diff-loading-desc";

  useFocusTrap(dialogRef, { active: true, onEscape: onClose });

  return (
    <div className="draft-diff-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="draft-diff-shell draft-diff-skeleton"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="draft-diff-head">
          <div>
            <p className="eyebrow">Draft diff</p>
            <h3 id={titleId}>Loading comparison…</h3>
            <p className="hint" id={descriptionId}>
              Fetching the selected draft and preparing the diff.
            </p>
          </div>
          <LazySkeletonPill width="74px" />
        </header>

        <div className="draft-diff-sources">
          <div className="diff-source-card">
            <span className="eyebrow">Left</span>
            <strong>{leftLabel}</strong>
            {leftDetail && <p className="subtle">{leftDetail}</p>}
          </div>
          <div className="diff-source-card">
            <span className="eyebrow">Right</span>
            <LazySkeletonLine width="92%" />
            <LazySkeletonLine width="72%" />
          </div>
          <div className="diff-summary-chips">
            <LazySkeletonPill width="86px" />
            <LazySkeletonPill width="96px" />
            <LazySkeletonPill width="86px" />
          </div>
        </div>

        <div className="draft-diff-body draft-diff-body-skeleton">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="draft-diff-row">
              <div className="draft-diff-row-head">
                <LazySkeletonLine width="84%" />
              </div>
              <div className="draft-diff-row-foot">
                <LazySkeletonLine width="54%" />
                <LazySkeletonPill width="120px" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
};

function App() {
  const [locale, setLocale] = useState<LocaleKey>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const settingsLocale = loadSettings().locale;
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const navigatorLocale = typeof navigator !== "undefined" ? navigator.language : undefined;
    const resolved = resolveLocale(settingsLocale ?? storedLocale ?? navigatorLocale);
    setDocumentLanguage(resolved);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
    }
    return resolved;
  });
  const [messages, setMessages] = useState<Messages>(FALLBACK_MESSAGES);

  useEffect(() => {
    let cancelled = false;
    loadMessages(locale).then((loaded) => {
      if (cancelled) return;
      setMessages(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const t = useMemo(() => makeTranslator(messages), [messages]);
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [highEffects, setHighEffects] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("darkmesh-high-effects");
    return stored ? stored === "1" : true;
  });
  const [hologridEnabled, setHologridEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(HOLOGRID_ENABLED_STORAGE_KEY);
    return stored ? stored === "1" : true;
  });
  const [hologridSpeed, setHologridSpeed] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_HOLOGRID_SPEED;
    const stored = Number(window.localStorage.getItem(HOLOGRID_SPEED_STORAGE_KEY));
    return clampHologridSpeed(stored);
  });
  const [hologridOpacity, setHologridOpacity] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_HOLOGRID_OPACITY;
    const stored = Number(window.localStorage.getItem(HOLOGRID_OPACITY_STORAGE_KEY));
    return clampHologridOpacity(stored);
  });
  const [cursorTrailPref, setCursorTrailPref] = useState<boolean>(() => getInitialCursorTrail());
  const prefersReducedMotion = usePrefersReducedMotion();
  const [offlineMode, setOfflineMode] = useState<boolean>(() => getInitialOffline());
  const [workspace, setWorkspace] = useState<Workspace>("studio");
  const initialCatalogFilters = useMemo(() => loadCatalogFilters(), []);
  const [catalog, setCatalog] = useState<CatalogItem[]>(seedCatalog);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cyberPreviewComponent, setCyberPreviewComponent] =
    useState<React.ComponentType<CyberBlockPreviewProps> | null>(null);
  const [search, setSearch] = useState(initialCatalogFilters.search);
  const [activeTypes, setActiveTypes] = useState<string[]>(initialCatalogFilters.types);
  const [activeTags, setActiveTags] = useState<string[]>(initialCatalogFilters.tags);
  const [quickShape, setQuickShape] = useState<string | null>(initialCatalogFilters.quickShape);
  const [recentCatalog, setRecentCatalog] = useState<CatalogItem[]>(() => loadRecentCatalogItems());
  const initialManifest = useMemo(() => newManifest(), []);
  const [manifest, setManifest] = useState<ManifestDocument>(() => initialManifest);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<{ stack: ManifestDocument[]; pointer: number }>(() => ({
    stack: [initialManifest],
    pointer: 0,
  }));
  const [propsDraft, setPropsDraft] = useState("");
  const [propsFormDraft, setPropsFormDraft] = useState<ManifestShape>({});
  const [propsMode, setPropsMode] = useState<PropsMode>("form");
  const [jsonEditorOpen, setJsonEditorOpen] = useState(false);
  const [drafts, setDrafts] = useState<ManifestDraft[]>([]);
  const [draftHistory, setDraftHistory] = useState<DraftRevision[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [savedSignature, setSavedSignature] = useState<string>(() => manifestSignature(initialManifest));
  const [savedVersionStamp, setSavedVersionStamp] = useState<number | null>(null);
  const [autosaveDelayMs, setAutosaveDelayMs] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_AUTOSAVE_MS;
    const stored = Number(window.localStorage.getItem(AUTOSAVE_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= 400 ? stored : DEFAULT_AUTOSAVE_MS;
  });
  const [autosavePreset, setAutosavePreset] = useState<AutosavePreset>(() => {
    if (typeof window === "undefined") return "balanced";
    const stored = Number(window.localStorage.getItem(AUTOSAVE_STORAGE_KEY));
    const match = (Object.entries(AUTOSAVE_PRESETS) as [AutosavePreset, number][]).find(([, value]) => value === stored);
    return match ? match[0] : "balanced";
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 1800);
  }, []);
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState<DraftSaveMode | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revertTargetId, setRevertTargetId] = useState<number | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [draftConflict, setDraftConflict] = useState<{ message: string; latest?: ManifestDraft | null } | null>(null);
  const [draftDiffOpen, setDraftDiffOpen] = useState(false);
  const [draftDiffLoading, setDraftDiffLoading] = useState(false);
  const [draftDiffDocked, setDraftDiffDocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DRAFT_DIFF_DOCKED_KEY) === "1";
  });
  const [draftDiffRightRef, setDraftDiffRightRef] = useState<DraftSourceRef | null>(null);
  const [draftDiffRight, setDraftDiffRight] = useState<DraftSource | null>(null);
  const [draftDiffEntries, setDraftDiffEntries] = useState<DraftDiffEntry[]>([]);
  const [draftDiffHighlight, setDraftDiffHighlight] = useState<Record<string, DraftDiffKind>>({});
  const [pip, setPip] = useState<PipDocument | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(REVIEW_MODE_KEY) === "1";
  });
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
  const [reviewDraft, setReviewDraft] = useState("");
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [pipVaultStatus, setPipVaultStatus] = useState<string | null>(null);
  const [pipVaultBusy, setPipVaultBusy] = useState(false);
  const [pipVaultSnapshot, setPipVaultSnapshot] = useState<PipVaultSnapshot | null>(null);
  const [pipVaultRecords, setPipVaultRecords] = useState<PipVaultRecord[]>([]);
  const [vaultIntegrity, setVaultIntegrity] = useState<VaultIntegrityEvent | null>(null);
  const [vaultIntegrityRunning, setVaultIntegrityRunning] = useState(false);
  const [vaultIntegrityIssues, setVaultIntegrityIssues] = useState<PipVaultIntegrityIssue[]>([]);
  const [vaultAuditEvents, setVaultAuditEvents] = useState<VaultAuditEvent[]>([]);
  const [vaultAuditLoading, setVaultAuditLoading] = useState(false);
  const [vaultAuditExporting, setVaultAuditExporting] = useState<"csv" | "json" | null>(null);
  const [pipVaultFilter, setPipVaultFilter] = useState("");
  const [pipVaultRecordsLoading, setPipVaultRecordsLoading] = useState(false);
  const [pipVaultPassword, setPipVaultPassword] = useState("");
  const [pipVaultPasswordVisible, setPipVaultPasswordVisible] = useState(false);
  const [pipVaultKdfProfile, setPipVaultKdfProfile] = useState<PipVaultKdfProfile>(() => loadKdfProfile());
  const [pipVaultError, setPipVaultError] = useState<string | null>(null);
  const [pipVaultPasswordError, setPipVaultPasswordError] = useState<string | null>(null);
  const [vaultResetOpen, setVaultResetOpen] = useState(false);
  const [vaultResetCurrent, setVaultResetCurrent] = useState("");
  const [vaultResetNew, setVaultResetNew] = useState("");
  const [vaultResetConfirm, setVaultResetConfirm] = useState("");
  const [vaultResetError, setVaultResetError] = useState<string | null>(null);
  const [vaultResetCurrentVisible, setVaultResetCurrentVisible] = useState(false);
  const [vaultResetNewVisible, setVaultResetNewVisible] = useState(false);
  const [vaultResetConfirmVisible, setVaultResetConfirmVisible] = useState(false);
  const [lastVaultError, setLastVaultError] = useState<{ message: string; at: string } | null>(null);
  const [pipVaultAuthPrompt, setPipVaultAuthPrompt] = useState<{ mode: "unlock" | "enable"; reason?: string } | null>(
    null,
  );
  const [pipVaultBreachStatus, setPipVaultBreachStatus] = useState<BreachCheckStatus>("idle");
  const [pipVaultBreachMessage, setPipVaultBreachMessage] = useState<string | null>(null);
  const [pipVaultBreachCount, setPipVaultBreachCount] = useState<number | null>(null);
  const [pipVaultBreachCheckedAt, setPipVaultBreachCheckedAt] = useState<string | null>(null);
  type PipVaultTaskKind = "import" | "export" | "unlock" | "records-export" | "integrity";
  const [pipVaultTask, setPipVaultTask] = useState<{
    kind: PipVaultTaskKind;
    label: string;
    progress?: number;
    detail?: string;
  } | null>(null);
  const [pipVaultRememberUnlock, setPipVaultRememberUnlock] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(PIP_VAULT_REMEMBER_KEY) === "1";
  });
  const [pipVaultAutoLockMinutes, setPipVaultAutoLockMinutes] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_PIP_VAULT_AUTO_LOCK_MINUTES;
    const stored = Number(window.localStorage.getItem(PIP_VAULT_AUTO_LOCK_KEY));
    return Number.isFinite(stored) && stored >= 0 ? stored : DEFAULT_PIP_VAULT_AUTO_LOCK_MINUTES;
  });
  const [pipVaultAutoLockRemainingMs, setPipVaultAutoLockRemainingMs] = useState<number | null>(null);
  const [pipVaultHardwarePlaceholder, setPipVaultHardwarePlaceholder] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(PIP_VAULT_HARDWARE_PLACEHOLDER_KEY) === "1";
  });
  const [vaultAuditExpandedId, setVaultAuditExpandedId] = useState<number | null>(null);
  const [pipVaultModeConfirm, setPipVaultModeConfirm] = useState<{ action: "enable" | "disable"; password?: string } | null>(null);
  const [vaultWizardOpen, setVaultWizardOpen] = useState(false);
  const [vaultWizardMode, setVaultWizardMode] = useState<"export" | "import">("export");
  const [vaultWizardFile, setVaultWizardFile] = useState<File | null>(null);
  const [vaultWizardImportError, setVaultWizardImportError] = useState<string | null>(null);
  const [vaultWizardUseVaultPassword, setVaultWizardUseVaultPassword] = useState(true);
  const [vaultWizardPassword, setVaultWizardPassword] = useState("");
  const [vaultWizardPasswordVisible, setVaultWizardPasswordVisible] = useState(false);
  const [vaultWizardIntegrity, setVaultWizardIntegrity] = useState<VaultIntegrityEvent[]>([]);
  const vaultWizardFileInputRef = useRef<HTMLInputElement>(null);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [healthAutoRefresh, setHealthAutoRefresh] = useState<HealthAutoRefresh>(() => {
    if (typeof window === "undefined") return "off";
    const stored = window.localStorage.getItem(HEALTH_AUTO_REFRESH_STORAGE_KEY);
    if (stored && (HEALTH_AUTO_REFRESH_OPTIONS as string[]).includes(stored)) {
      return stored as HealthAutoRefresh;
    }

    const legacySeconds = Number(stored);
    if (Number.isFinite(legacySeconds) && legacySeconds > 0) {
      return "custom";
    }

    return "off";
  });
  const [healthAutoRefreshCustom, setHealthAutoRefreshCustom] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_HEALTH_AUTO_REFRESH_CUSTOM;
    const stored = Number(window.localStorage.getItem(HEALTH_AUTO_REFRESH_CUSTOM_KEY));
    if (Number.isFinite(stored) && stored > 0) {
      return Math.max(MIN_HEALTH_AUTO_REFRESH_SECONDS, Math.round(stored));
    }

    const legacyRaw = window.localStorage.getItem(HEALTH_AUTO_REFRESH_STORAGE_KEY);
    const legacySeconds = Number(legacyRaw);
    if (
      Number.isFinite(legacySeconds) &&
      legacySeconds > 0 &&
      !(HEALTH_AUTO_REFRESH_OPTIONS as string[]).includes(legacyRaw ?? "")
    ) {
      return Math.max(MIN_HEALTH_AUTO_REFRESH_SECONDS, Math.round(legacySeconds));
    }

    return DEFAULT_HEALTH_AUTO_REFRESH_CUSTOM;
  });
  const [slaFailureThreshold, setSlaFailureThreshold] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SLA_FAILURE_THRESHOLD;
    const stored = Number(window.localStorage.getItem(HEALTH_SLA_FAILURE_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : DEFAULT_SLA_FAILURE_THRESHOLD;
  });
  const [slaLatencyThresholdMs, setSlaLatencyThresholdMs] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_SLA_LATENCY_THRESHOLD_MS;
    const stored = Number(window.localStorage.getItem(HEALTH_SLA_LATENCY_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : DEFAULT_SLA_LATENCY_THRESHOLD_MS;
  });
  const [healthNotifyEnabled, setHealthNotifyEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(HEALTH_NOTIFY_STORAGE_KEY) === "true";
  });
  const envWalletPathDefault = useMemo(
    () => getEnv("AO_WALLET_PATH") ?? getEnv("VITE_AO_WALLET_PATH") ?? "",
    [],
  );
  const envWalletJsonDefault = useMemo(
    () => getEnv("AO_WALLET_JSON") ?? getEnv("VITE_AO_WALLET_JSON") ?? "",
    [],
  );
  const envModuleTxDefault = useMemo(
    () => getEnv("AO_MODULE_TX") ?? getEnv("VITE_AO_MODULE_TX") ?? "",
    [],
  );
  const envSchedulerDefault = useMemo(
    () => getEnv("SCHEDULER") ?? getEnv("VITE_SCHEDULER") ?? "",
    [],
  );
  const [deployTimeline, setDeployTimeline] = useState<ActionStep[]>(() => buildActionTimeline("deploy"));
  const [spawnTimeline, setSpawnTimeline] = useState<ActionStep[]>(() => buildActionTimeline("spawn"));
  const [deployTransient, setDeployTransient] = useState(false);
  const [spawnTransient, setSpawnTransient] = useState(false);
  const [walletMode, setWalletMode] = useState<WalletMode>(() => {
    if (envWalletJsonDefault) return "jwk";
    if (envWalletPathDefault) return "path";
    return "ipc";
  });
  const [walletPathInput, setWalletPathInput] = useState(
    envWalletPathDefault ?? "",
  );
  const [walletJwkInput, setWalletJwkInput] = useState(
    envWalletJsonDefault ?? "",
  );
  const [walletFieldError, setWalletFieldError] = useState<string | null>(null);
  const [walletPath, setWalletPath] = useState<string | null>(null);
  const [walletJwk, setWalletJwk] = useState<Record<string, unknown> | null>(null);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(true);
  const [modulePath, setModulePath] = useState("");
  const [moduleSource, setModuleSource] = useState("");
  const [manifestTxInput, setManifestTxInput] = useState("");
  const [scheduler, setScheduler] = useState(envSchedulerDefault ?? "");
  const [moduleTxInput, setModuleTxInput] = useState(
    () => envModuleTxDefault || loadLastModuleTx() || "",
  );
  const [deploying, setDeploying] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [deployState, setDeployState] = useState<TaskState>("idle");
  const [spawnState, setSpawnState] = useState<TaskState>("idle");
  const [deployOutcome, setDeployOutcome] = useState<string | null>(null);
  const [spawnOutcome, setSpawnOutcome] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<string | null>(null);
  const [spawnStep, setSpawnStep] = useState<string | null>(null);
  const [deployedModuleTx, setDeployedModuleTx] = useState<string | null>(() => loadLastModuleTx());
  const [lastSpawnSnapshot, setLastSpawnSnapshot] = useState<SpawnSnapshot | null>(() => loadLastSpawnSnapshot());
  const [deployDryRun, setDeployDryRun] = useState(false);
  const [aoLog, setAoLog] = useState<AoMiniLogEntry[]>([]);
  const [aoLogTailing, setAoLogTailing] = useState(true);
  const [pinnedAoIds, setPinnedAoIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem(AO_PINNED_IDS_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
    } catch {
      return [];
    }
  });
  const [aoProfiles, setAoProfiles] = useState<AoDeployProfile[]>(() => loadAoProfiles());
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const initial = loadAoProfiles();
    return initial[0]?.id ?? null;
  });
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [moduleSourceError, setModuleSourceError] = useState<string | null>(null);
  const [moduleTxError, setModuleTxError] = useState<string | null>(null);
  const [manifestTxError, setManifestTxError] = useState<string | null>(null);
  const [schedulerError, setSchedulerError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [paletteRecents, setPaletteRecents] = useState<string[]>(() => loadPaletteRecents());
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const [hotkeyScopeFilter, setHotkeyScopeFilter] = useState<"active" | "all">("active");
  const [hotkeyPrintable, setHotkeyPrintable] = useState(false);
  const [hotkeyLearnMode, setHotkeyLearnMode] = useState(false);
  const [hotkeyActiveTarget, setHotkeyActiveTarget] = useState<HotkeyTarget | null>(null);
  const [compositionDropActive, setCompositionDropActive] = useState(false);
  const [treeDropState, setTreeDropState] = useState<TreeDropState | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [draggedCatalogId, setDraggedCatalogId] = useState<string | null>(null);
  const [dropGhost, setDropGhost] = useState<DropGhostOverlay | null>(null);
  const [catalogDragging, setCatalogDragging] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [issuesDockCollapsed, setIssuesDockCollapsed] = useState(false);

  const whatsNewEntries = useMemo<WhatsNewEntry[]>(() => {
    const entries = (whatsNewData as { entries?: WhatsNewEntry[] }).entries ?? [];
    return [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, []);

  const neonCursorEnabled = cursorTrailPref && !prefersReducedMotion && !offlineMode && highEffects;
  const cursorTrailBlockedReason = prefersReducedMotion
    ? "reduced motion"
    : offlineMode
      ? "offline mode"
      : !highEffects
        ? "effects off"
        : null;
  const cursorTrailLabel = prefersReducedMotion
    ? "Neon disabled"
    : offlineMode && cursorTrailPref
      ? "Trail paused"
      : !highEffects
        ? "High effects off"
        : cursorTrailPref
          ? "Neon cursor"
          : "Trail off";

  const paletteInputRef = useRef<HTMLInputElement>(null);
  const originalFetchRef = useRef<typeof fetch | undefined>((globalThis as any).fetch);
  const manifestRef = useRef(manifest);
  const activeDraftIdRef = useRef(activeDraftId);
  const savedVersionStampRef = useRef<number | null>(savedVersionStamp);
  const autofillNodePropsRef = useRef<(targetId: string) => void>(() => {});
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const autoUnlockAttemptRef = useRef(false);
  const vaultAutoLockTimerRef = useRef<number | null>(null);
  const vaultAutoLockTickerRef = useRef<number | null>(null);
  const lastVaultLockReasonRef = useRef<"timer" | "manual" | null>(null);
  const lastHealthNotificationRef = useRef<string | null>(null);
  const historySuppressedRef = useRef(false);
  const lastIntegrityFingerprintRef = useRef<string | null>(null);
  const aoProfilesRef = useRef<AoDeployProfile[]>(aoProfiles);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const wizardRegionRef = useRef<HTMLElement>(null);
  const vaultRegionRef = useRef<HTMLElement>(null);
  const wizardWalletRef = useRef<HTMLButtonElement>(null);
  const wizardModuleRef: React.RefObject<HTMLTextAreaElement> = useRef<HTMLTextAreaElement>(null);
  const wizardSpawnRef = useRef<HTMLInputElement>(null);
  const vaultPasswordRef = useRef<HTMLInputElement>(null);
  const vaultAuthInputRef = useRef<HTMLInputElement>(null);
  const vaultFilterRef = useRef<HTMLInputElement>(null);
  const healthCardRef = useRef<HTMLDivElement>(null);
  const healthFailureInputRef = useRef<HTMLInputElement>(null);
  const healthLatencyInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const whatsNewDialogRef = useRef<HTMLDivElement>(null);
  const whatsNewCloseRef = useRef<HTMLButtonElement>(null);
  const vaultModeDialogRef = useRef<HTMLDivElement>(null);
  const vaultModeCancelRef = useRef<HTMLButtonElement>(null);
  const vaultWizardDialogRef = useRef<HTMLDivElement>(null);
  const vaultWizardCloseRef = useRef<HTMLButtonElement>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    savedVersionStampRef.current = savedVersionStamp;
  }, [savedVersionStamp]);

  useEffect(() => {
    aoProfilesRef.current = aoProfiles;
  }, [aoProfiles]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTOSAVE_STORAGE_KEY, String(autosaveDelayMs));
    const match = (Object.entries(AUTOSAVE_PRESETS) as [AutosavePreset, number][]).find(([, value]) => value === autosaveDelayMs);
    if (match && match[0] !== autosavePreset) {
      setAutosavePreset(match[0]);
    } else if (!match && autosavePreset !== "balanced") {
      setAutosavePreset("balanced");
    }
  }, [autosaveDelayMs, autosavePreset]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DRAFT_DIFF_DOCKED_KEY, draftDiffDocked ? "1" : "0");
  }, [draftDiffDocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REVIEW_MODE_KEY, reviewMode ? "1" : "0");
  }, [reviewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const store = JSON.parse(window.localStorage.getItem(REVIEW_STORAGE_KEY) ?? "{}") as Record<string, ReviewComment[]>;
      const stored = Array.isArray(store?.[manifest.id]) ? store[manifest.id] : [];
      setReviewComments(stored);
    } catch {
      setReviewComments([]);
    }
  }, [manifest.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storeRaw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    let store: Record<string, ReviewComment[]> = {};
    try {
      store = storeRaw ? JSON.parse(storeRaw) : {};
    } catch {
      store = {};
    }
    store[manifest.id] = reviewComments;
    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(store));
  }, [manifest.id, reviewComments]);

  useEffect(() => {
    persistCatalogFilters({ search, types: activeTypes, tags: activeTags, quickShape });
  }, [activeTags, activeTypes, quickShape, search]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("catalog-dragging", catalogDragging);
    return () => {
      document.documentElement.classList.remove("catalog-dragging");
    };
  }, [catalogDragging]);

  useEffect(() => {
    const applyGhost = () => {
      if (!treeDropState?.id || (!draggedCatalogId && !draggedNodeId)) {
        setDropGhost(null);
        return;
      }
      const host = previewSurfaceRef.current;
      if (!host) {
        setDropGhost(null);
        return;
      }
      const safeId = treeDropState.id.replace(/(["\\])/g, "\\$1");
      const target = host.querySelector<HTMLElement>(`.tree-card[data-node-id="${safeId}"]`);
      if (!target) {
        setDropGhost(null);
        return;
      }
      const hostRect = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const source =
        draggedCatalogId != null
          ? catalog.find((entry) => entry.id === draggedCatalogId) ?? seedCatalog.find((entry) => entry.id === draggedCatalogId)
          : findNodeById(manifestRef.current.nodes, draggedNodeId);
      const type =
        (source as CatalogItem | ManifestNode | undefined)?.type ??
        (typeof source === "object" && source && "type" in source ? (source as { type?: string }).type : null) ??
        "block.hero";
      const label =
        (source as CatalogItem | undefined)?.name ??
        (source as ManifestNode | undefined)?.title ??
        (source as { id?: string } | undefined)?.id ??
        "Block";

      setDropGhost({
        rect: new DOMRect(rect.left - hostRect.left, rect.top - hostRect.top, rect.width, rect.height),
        placement: treeDropState.placement,
        label,
        type,
        mode: treeDropState.mode ?? null,
      });
    };

    applyGhost();
    if (!treeDropState?.id || (!draggedCatalogId && !draggedNodeId)) return;
    window.addEventListener("resize", applyGhost);
    return () => window.removeEventListener("resize", applyGhost);
  }, [catalog, draggedCatalogId, draggedNodeId, treeDropState]);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  useEffect(() => {
    persistLastModuleTx(deployedModuleTx);
  }, [deployedModuleTx]);

  useEffect(() => {
    persistLastSpawnSnapshot(lastSpawnSnapshot);
  }, [lastSpawnSnapshot]);

  useEffect(() => {
    if (historySuppressedRef.current) {
      historySuppressedRef.current = false;
      return;
    }

    setHistoryState((current) => {
      const currentSnapshot = current.stack[current.pointer];
      if (manifestSignature(currentSnapshot) === manifestSignature(manifest)) {
        return current;
      }

      const nextStack = [...current.stack.slice(0, current.pointer + 1), manifest];
      const trimmed =
        nextStack.length > MANIFEST_HISTORY_LIMIT ? nextStack.slice(nextStack.length - MANIFEST_HISTORY_LIMIT) : nextStack;
      const nextPointer = trimmed.length - 1;
      return { stack: trimmed, pointer: nextPointer };
    });
  }, [manifest]);

  const manifestOrder = useMemo(() => flattenManifestOrder(manifest), [manifest]);
  useEffect(() => {
    if (!reviewComments.length) return;
    const nodeSet = new Set(manifestOrder);
    const pruned = reviewComments.filter((comment) => nodeSet.has(comment.nodeId));
    if (pruned.length !== reviewComments.length) {
      setReviewComments(pruned);
    }
  }, [manifestOrder, reviewComments]);
  const activeProfile = useMemo(
    () => aoProfiles.find((profile) => profile.id === activeProfileId) ?? null,
    [aoProfiles, activeProfileId],
  );
  const primarySelectedId = selectedNodeIds.length ? selectedNodeIds[0] : null;
  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedNodeId: string | null = primarySelectedId;
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(manifest.nodes, selectedNodeId) : null),
    [manifest.nodes, selectedNodeId],
  );
  const selectedNodeComments = useMemo(
    () => reviewComments.filter((comment) => comment.nodeId === selectedNodeId),
    [reviewComments, selectedNodeId],
  );
  const reviewCounts = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    reviewComments.forEach((comment) => {
      const bucket = map.get(comment.nodeId) ?? { total: 0, open: 0 };
      bucket.total += 1;
      if (!comment.resolvedAt) bucket.open += 1;
      map.set(comment.nodeId, bucket);
    });
    return map;
  }, [reviewComments]);
  const openReviewCount = useMemo(() => reviewComments.filter((comment) => !comment.resolvedAt).length, [reviewComments]);
  const selectedCatalogItem = useMemo(
    () =>
      catalog.find((item) => item.type === selectedNode?.type) ??
      seedCatalog.find((item) => item.type === selectedNode?.type) ??
      null,
    [catalog, selectedNode?.type],
  );
  const propsDefaults = useMemo(
    () => {
      if (!selectedNode) return null;

      if (selectedCatalogItem) {
        return ((mergeDefaults(selectedCatalogItem.propsSchema, selectedCatalogItem.defaultProps ?? {}) ?? {}) as ManifestShape);
      }

      return ((mergeDefaults(undefined, selectedNode.props ?? {}) ?? {}) as ManifestShape);
    },
    [selectedCatalogItem, selectedNode],
  );
  const propsFormValue = useMemo(
    () =>
      selectedNode
        ?
          ((applyDefaultsToProps(
            selectedCatalogItem?.propsSchema,
            selectedNode.props ?? {},
            selectedCatalogItem?.defaultProps ?? propsDefaults ?? {},
          ) ?? {}) as ManifestShape)
        : null,
    [propsDefaults, selectedCatalogItem, selectedNode],
  );
  const currentManifestSignature = useMemo(() => manifestSignature(manifest), [manifest]);
  const currentRevisionId = useMemo(
    () => draftHistory.find((revision) => manifestSignature(revision.document) === currentManifestSignature)?.id ?? null,
    [currentManifestSignature, draftHistory],
  );
  const isDirty = useMemo(() => currentManifestSignature !== savedSignature, [currentManifestSignature, savedSignature]);
  const totalNodes = useMemo(() => countNodes(manifest.nodes), [manifest.nodes]);
  const catalogByType = useMemo(() => {
    const map = new Map<string, CatalogItem>();
    seedCatalog.forEach((item) => map.set(item.type, item));
    catalog.forEach((item) => map.set(item.type, item));
    return map;
  }, [catalog]);
  const catalogTypes = useMemo(() => uniqueSorted(catalog.map((item) => item.type)), [catalog]);
  const catalogTags = useMemo(
    () => uniqueSorted(catalog.flatMap((item) => item.tags ?? [])),
    [catalog],
  );
  const recentCatalogItems = useMemo(() => {
    const currentById = new Map<string, CatalogItem>();
    catalog.forEach((item) => currentById.set(item.id, item));
    seedCatalog.forEach((item) => {
      if (!currentById.has(item.id)) {
        currentById.set(item.id, item);
      }
    });
    return recentCatalog
      .map((item) => currentById.get(item.id) ?? item)
      .filter((item): item is CatalogItem => Boolean(item?.id && item?.type));
  }, [catalog, recentCatalog]);
  const visibleCatalog = useMemo(
    () =>
      catalog.filter(
        (item) =>
          matchesCatalogFilters(item, activeTypes, activeTags) &&
          (quickShape ? blockShapeForType(item.type) === quickShape : true),
      ),
    [activeTags, activeTypes, catalog, quickShape],
  );
  const paletteCatalog = useMemo(() => visibleCatalog.slice(0, 8), [visibleCatalog]);
  const manifestValidation = useMemo(() => {
    const byId: Record<string, NodeValidationSummary> = {};
    const issues: ManifestIssue[] = [];

    const walk = (nodes: ManifestNode[]) => {
      nodes.forEach((node) => {
        const catalogItem = catalogByType.get(node.type ?? "");
        const schema = catalogItem?.propsSchema;
        const defaults = (mergeDefaults(schema, catalogItem?.defaultProps ?? {}) ?? {}) as ManifestShape;
        const props = (node.props ?? {}) as ManifestShape;
        const validation = schema ? validate(schema, props) : { valid: true, issues: [] };
        const diffEntries = diff(defaults, props);
        const diffCounts = { added: 0, changed: 0, removed: 0 };
        diffEntries.forEach((entry) => {
          diffCounts[entry.kind] += 1;
        });
        const missingRequired = validation.issues.filter((issue) => issue.code === "required");

        byId[node.id] = {
          id: node.id,
          title: node.title,
          type: node.type,
          issues: validation.issues,
          missingRequired,
          diffEntries,
          diffCounts,
          defaults,
          hasSchema: Boolean(schema),
          valid: !schema || validation.valid,
        };

        validation.issues.forEach((issue) =>
          issues.push({ nodeId: node.id, nodeTitle: node.title, nodeType: node.type, issue }),
        );

        if (node.children?.length) {
          walk(node.children);
        }
      });
    };

    walk(manifest.nodes);

    const requiredIssues = issues.filter((entry) => entry.issue.code === "required");

    return {
      byId,
      issues,
      totalIssues: issues.length,
      requiredIssues,
    };
  }, [catalogByType, manifest.nodes]);
  const nodeValidationMap = manifestValidation.byId;
  const manifestIssues = manifestValidation.issues;
  const manifestIssueCount = manifestValidation.totalIssues;
  const manifestRequiredIssueCount = manifestValidation.requiredIssues.length;
  const manifestRequiredIssues = useMemo(
    () => manifestIssues.filter((entry) => entry.issue.code === "required"),
    [manifestIssues],
  );
  const showIssuesDock = manifestIssueCount > 0;
  const treeValidation = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(nodeValidationMap).map(([id, summary]) => [
          id,
          {
            issues: summary.issues.length,
            missingRequired: summary.missingRequired.length,
            diffCounts: summary.diffCounts,
            hasSchema: summary.hasSchema,
          },
        ]),
      ),
    [nodeValidationMap],
  );

  function autofillNodeProps(targetId: string) {
    autofillNodePropsRef.current(targetId);
  }

  useEffect(() => {
    autofillNodePropsRef.current = (targetId: string) => {
      const node = findNodeById(manifestRef.current.nodes, targetId);
      if (!node) {
        flashStatus("Node not found");
        return;
      }

      const catalogItem = catalogByType.get(node.type ?? "");
      const schema = catalogItem?.propsSchema;
      const defaultsSeed = catalogItem?.defaultProps ?? {};

      if (!schema) {
        flashStatus("No schema found for this block");
        return;
      }

      const hydrated = applyDefaultsToProps(schema, node.props ?? {}, defaultsSeed) as ManifestShape;

      setManifest((prev) =>
        touch({
          ...prev,
          nodes: updateNodeInTree(prev.nodes, targetId, (entry) => ({ ...entry, props: hydrated })),
        }),
      );

      if (selectedNodeId === targetId) {
        setPropsFormDraft(hydrated as ManifestShape);
        setPropsDraft(stringifyPropsDraft(hydrated));
      }

      flashStatus("Defaults filled");
    };
  }, [catalogByType, flashStatus, selectedNodeId]);

  const autofillRequiredIssues = useCallback(() => {
    const unique = new Set(manifestRequiredIssues.map((entry) => entry.nodeId));
    unique.forEach((id) => autofillNodeProps(id));
  }, [manifestRequiredIssues]);
  const canUndo = historyState.pointer > 0;
  const canRedo = historyState.pointer < historyState.stack.length - 1;
  const saveStatusLabel = draftConflict ? "Conflict detected" : saving ? "Saving…" : isDirty ? "Unsaved changes" : "Draft saved";
  const saveStatusTime = draftConflict
    ? "Resolve conflict"
    : lastSavedAt
      ? formatTime(lastSavedAt)
      : "Never saved";
  const autosaveInFlight = saving && savingMode === "autosave";
  const autosavePending = !draftConflict && !autosaveInFlight && !saving && isDirty;
  const autosaveTone = draftConflict
    ? "conflict"
    : autosaveInFlight
      ? "saving"
      : autosaveError
        ? "error"
        : autosavePending
          ? "pending"
          : lastAutosaveAt
            ? "saved"
            : "idle";
  const autosaveStatusLabel = draftConflict
    ? "Autosave blocked"
    : autosaveInFlight
      ? "Autosaving…"
      : autosaveError
        ? "Autosave failed"
        : autosavePending
          ? "Autosave queued"
          : lastAutosaveAt
            ? "Autosave complete"
            : "Autosave idle";
  const autosaveStatusTime = draftConflict
    ? "Open diff to resolve"
    : autosaveInFlight
      ? "Writing draft"
      : autosaveError
        ? autosaveError
        : lastAutosaveAt
          ? formatTime(lastAutosaveAt)
          : "No autosave yet";
  const confirmDiscardChanges = useCallback(
    (reason?: string) => {
      if (!isDirty && !draftConflict) return true;
      const message = reason ?? "You have unsaved changes. Discard them and continue?";
      return window.confirm(message);
    },
    [draftConflict, isDirty],
  );
  const pipVaultValidationIssues = useMemo<PipVaultIssue[]>(() => {
    const issues: PipVaultIssue[] = [];

    if (pipVaultSnapshot?.mode === "password" && pipVaultSnapshot.locked) {
      issues.push({ field: "vault", message: "Vault locked; enter password to unlock", severity: "error" });
    }

    if (!pip) {
      issues.push({ field: "vault", message: "Load or fetch a PIP to inspect vault validation", severity: "warn" });
      return issues;
    }

    const manifestTx = normalizeText(pip.manifestTx);

    if (!manifestTx) {
      issues.push({ field: "manifestTx", message: "manifestTx is required before saving", severity: "error" });
    }

    if (pip.tenant != null && typeof pip.tenant !== "string") {
      issues.push({ field: "tenant", message: "tenant must be a string", severity: "error" });
    } else if (!normalizeText(pip.tenant)) {
      issues.push({ field: "tenant", message: "tenant is empty", severity: "warn" });
    }

    if (pip.site != null && typeof pip.site !== "string") {
      issues.push({ field: "site", message: "site must be a string", severity: "error" });
    } else if (!normalizeText(pip.site)) {
      issues.push({ field: "site", message: "site is empty", severity: "warn" });
    }

    return issues;
  }, [pip, pipVaultSnapshot]);
  const pipVaultBlockingIssues = pipVaultValidationIssues.filter((issue) => issue.severity === "error");
  const pipVaultLocked = pipVaultSnapshot?.mode === "password" && pipVaultSnapshot.locked;
  const vaultCrystalState: VaultCrystalState =
    pipVaultSnapshot?.mode === "password" ? (pipVaultLocked ? "locked" : "password") : "unlocked";
  const vaultCrystalPulse: VaultCrystalPulse =
    pipVaultTask?.kind === "unlock"
      ? "unlock"
      : pipVaultTask?.kind === "export" || pipVaultTask?.kind === "import"
        ? "backup"
        : null;
  const pipVaultProgressValue = pipVaultTask?.progress;
  const pipVaultProgressLabel = pipVaultTask
    ? pipVaultTask.progress != null
      ? `${pipVaultTask.label} (${Math.round(Math.min(100, pipVaultTask.progress))}%)`
      : pipVaultTask.label
    : null;
  const pipVaultProgressNode = pipVaultTask ? (
    <div className="pip-vault-progress" role="status">
      <div className="pip-vault-progress-bar">
        <span
          className={`fill ${pipVaultTask.kind} ${pipVaultProgressValue != null ? "has-progress" : ""}`}
          style={
            pipVaultProgressValue != null
              ? { width: `${Math.min(100, Math.max(6, pipVaultProgressValue))}%` }
              : undefined
          }
        />
      </div>
      <div className="pip-vault-progress-labels">
        <div className="pip-vault-progress-label">{pipVaultProgressLabel ?? pipVaultTask.label}</div>
        {pipVaultTask.detail ? <div className="pip-vault-progress-detail">{pipVaultTask.detail}</div> : null}
      </div>
    </div>
  ) : null;
  const latestVaultAudit = useMemo(() => vaultAuditEvents[0] ?? null, [vaultAuditEvents]);
  const readRememberedPassword = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    const stored = window.sessionStorage.getItem(PIP_VAULT_REMEMBER_PASSWORD_KEY);
    if (!stored) return null;
    try {
      return atob(stored);
    } catch {
      return null;
    }
  }, []);
  const pipVaultPasswordStrength = useMemo(() => evaluatePasswordStrength(pipVaultPassword), [pipVaultPassword]);
  const pipVaultStrengthClass = pipVaultPasswordStrength.score ? `score-${pipVaultPasswordStrength.score}` : "";
  const vaultResetStrength = useMemo(() => evaluatePasswordStrength(vaultResetNew), [vaultResetNew]);
  const vaultResetStrengthClass = vaultResetStrength.score ? `score-${vaultResetStrength.score}` : "";
  const rememberedVaultPassword = useMemo(
    () => (pipVaultRememberUnlock ? readRememberedPassword() : null),
    [pipVaultRememberUnlock, pipVaultPassword, readRememberedPassword],
  );
  const rememberedUnlockCopy = useMemo(() => {
    if (!pipVaultRememberUnlock) return "Auto-unlock off";
    if (rememberedVaultPassword) return "Auto-unlock ready";
    if (pipVaultPassword.trim()) return "Will cache after unlock";
    return "Cache after unlock";
  }, [pipVaultPassword, pipVaultRememberUnlock, rememberedVaultPassword]);
  useEffect(() => {
    if (pipVaultError) {
      setLastVaultError({ message: pipVaultError, at: new Date().toISOString() });
    }
  }, [pipVaultError]);
  useEffect(() => {
    if (!pipVaultAuthPrompt) return;
    const timer = window.setTimeout(() => vaultAuthInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [pipVaultAuthPrompt]);
  useEffect(() => {
    if (pipVaultSnapshot?.mode !== "password") {
      setVaultResetOpen(false);
      setVaultResetCurrent("");
      setVaultResetNew("");
      setVaultResetConfirm("");
      setVaultResetError(null);
    }
  }, [pipVaultSnapshot?.mode]);
  const validateVaultPassword = useCallback(
    (intent: "unlock" | "enable", raw?: string) => {
      const password = (raw ?? pipVaultPassword).trim();
      const strength = evaluatePasswordStrength(password);
      const usingRemembered =
        intent === "unlock" && !password && pipVaultSnapshot?.mode === "password" && rememberedVaultPassword;

      if (!password && !usingRemembered) {
        const message = intent === "enable" ? "Enter a vault password first" : "Enter the vault password to unlock";
        setPipVaultPasswordError(message);
        return false;
      }

      if (intent === "enable") {
        if (password.length < 14) {
          setPipVaultPasswordError("Use at least 14 characters for vault password mode");
          return false;
        }
        if (strength.score < 2) {
          setPipVaultPasswordError("Password is too weak—aim for Fair or stronger");
          return false;
        }
      }

      setPipVaultPasswordError(null);
      return true;
    },
    [pipVaultPassword, pipVaultSnapshot?.mode, rememberedVaultPassword],
  );
  const breachStatusLabel =
    pipVaultBreachStatus === "checking"
      ? "Checking…"
      : pipVaultBreachStatus === "error"
        ? pipVaultBreachMessage ?? "Breach check failed"
        : pipVaultBreachStatus === "clear"
          ? pipVaultBreachMessage ?? "No breach signal"
          : pipVaultBreachStatus === "maybe"
            ? pipVaultBreachMessage ?? "Potential breach"
            : pipVaultBreachMessage ?? "Not checked";
  const breachStatusTone =
    pipVaultBreachStatus === "clear"
      ? "accent"
      : pipVaultBreachStatus === "maybe"
        ? "issue"
        : pipVaultBreachStatus === "error"
          ? "issue"
          : "ghost";
  const breachCheckedLabel = pipVaultBreachCheckedAt ? formatTimeShort(pipVaultBreachCheckedAt) : null;
  const vaultKdfLabel = useMemo(
    () => (pipVaultSnapshot?.kdf?.algorithm === "argon2id" ? "Argon2id" : "PBKDF2"),
    [pipVaultSnapshot?.kdf?.algorithm],
  );
  const vaultKdfDetail = useMemo(() => {
    const kdf = pipVaultSnapshot?.kdf;
    if (kdf?.algorithm === "argon2id") {
      const mem = kdf.memoryKiB ? `${Math.round(kdf.memoryKiB / 1024)} MiB` : "memory?";
      const passes = kdf.iterations ?? pipVaultSnapshot?.iterations;
      const lanes = kdf.parallelism ? ` · p=${kdf.parallelism}` : "";
      return `${mem} · t=${passes ?? "?"}${lanes}`;
    }
    const iterations = kdf?.iterations ?? pipVaultSnapshot?.iterations;
    return iterations ? `${iterations} · PBKDF2` : "PBKDF2";
  }, [pipVaultSnapshot?.iterations, pipVaultSnapshot?.kdf]);
  const kdfProfile = pipVaultKdfProfile ?? DEFAULT_ARGON2_PROFILE;
  const kdfMemory = kdfProfile.memoryKiB ?? DEFAULT_ARGON2_PROFILE.memoryKiB ?? 0;
  const kdfIterations = kdfProfile.iterations ?? DEFAULT_ARGON2_PROFILE.iterations ?? 0;
  const kdfParallelism = kdfProfile.parallelism ?? DEFAULT_ARGON2_PROFILE.parallelism ?? 1;
  const filteredPipVaultRecords = useMemo(() => {
    const query = pipVaultFilter.trim().toLowerCase();
    if (!query) return pipVaultRecords;

    return pipVaultRecords.filter((record) => {
      const haystack = `${record.manifestTx} ${record.tenant ?? ""} ${record.site ?? ""} ${record.createdAt} ${record.updatedAt}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [pipVaultFilter, pipVaultRecords]);
  const propsInspection = useMemo(() => {
    if (!selectedNode) {
      return null;
    }

    const defaults = propsDefaults ?? {};
    const raw = propsDraft.trim();
    let parsed: unknown = {};
    let parseError: string | null = null;

    try {
      parsed = raw ? JSON.parse(raw) : {};
      if (!isPlainObject(parsed)) {
        parseError = "Props must be a JSON object";
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : "Unable to parse props JSON";
    }

    const validation = parseError ? null : validate(selectedCatalogItem?.propsSchema, parsed);
    const diffEntries: PropsDiffEntry[] = parseError || !isPlainObject(parsed) ? [] : diff(defaults, parsed);
    const issues = parseError ? [{ path: "", message: parseError }] : validation?.issues ?? [];
    const issuesByPath = indexValidationIssues(issues);
    const diffGroups = groupDiffEntries(diffEntries);
    const diffSummary = diffEntries.reduce(
      (acc, entry: PropsDiffEntry) => {
        acc[entry.kind] += 1;
        return acc;
      },
      { added: 0, removed: 0, changed: 0 },
    );

    return {
      defaults,
      parsed: isPlainObject(parsed) ? (parsed as ManifestShape) : null,
      validation,
      diffEntries,
      diffGroups,
      diffSummary,
      issues,
      issuesByPath,
      errorMessage: issues[0]?.message ?? null,
      issueCount: issues.length,
      parseError: Boolean(parseError),
      valid: !parseError && (validation?.valid ?? true),
    };
  }, [propsDefaults, propsDraft, selectedCatalogItem?.propsSchema, selectedNode]);
  const propsDiffPaths = useMemo(
    () => new Set(propsInspection?.diffEntries.map((entry) => entry.path || "") ?? []),
    [propsInspection],
  );
  const hasPropsSchema = Boolean(selectedCatalogItem?.propsSchema);
  const inspectorMode: PropsMode = hasPropsSchema && propsMode === "form" ? "form" : "json";
  const walletPathValidation = useMemo<WalletFieldValidation>(
    () => (walletMode === "path" && walletPathInput.trim() ? validateWalletPathInput(walletPathInput) : { ok: true }),
    [walletMode, walletPathInput],
  );
  const walletJwkValidation = useMemo<WalletFieldValidation>(
    () => (walletMode === "jwk" && walletJwkInput.trim() ? validateWalletJsonInput(walletJwkInput) : { ok: true }),
    [walletJwkInput, walletMode],
  );
  const walletInlineError =
    walletFieldError ??
    (walletMode === "path" && walletPathInput.trim() && !walletPathValidation.ok ? walletPathValidation.reason : null) ??
    (walletMode === "jwk" && walletJwkInput.trim() && !walletJwkValidation.ok ? walletJwkValidation.reason : null);
  const walletInlineHint = walletInlineError
    ? null
    : walletMode === "path"
      ? (walletPathValidation.ok ? walletPathValidation.hint : null) ?? walletNote ?? "Enter a wallet path or pick via IPC."
      : walletMode === "jwk"
        ? (walletJwkValidation.ok ? walletJwkValidation.hint : null) ?? walletNote ?? "Paste wallet JSON or pick via IPC."
        : walletNote ??
          (walletPath || walletJwk ? "Wallet ready" : "Choose IPC, path, or pasted JWK. IPC picker preferred.");
  const moduleTxFromEnv = useMemo(
    () =>
      Boolean(
        envModuleTxDefault &&
          !deployedModuleTx &&
          (moduleTxInput.trim() === "" || moduleTxInput.trim() === envModuleTxDefault),
      ),
    [deployedModuleTx, envModuleTxDefault, moduleTxInput],
  );
  const schedulerFromEnv = useMemo(
    () => Boolean(envSchedulerDefault && (scheduler.trim() === "" || scheduler.trim() === envSchedulerDefault)),
    [envSchedulerDefault, scheduler],
  );

  const effectiveModuleTx = useMemo(
    () =>
      moduleTxInput.trim() ||
      deployedModuleTx ||
      envModuleTxDefault ||
      "",
    [deployedModuleTx, envModuleTxDefault, moduleTxInput],
  );

  const currentManifestTx = useMemo(
    () => manifestTxInput.trim() || pip?.manifestTx?.trim() || "",
    [manifestTxInput, pip?.manifestTx],
  );

  const manifestArweaveUrl = useMemo(
    () => (currentManifestTx ? `https://arweave.net/${encodeURIComponent(currentManifestTx)}` : ""),
    [currentManifestTx],
  );

  const manifestGqlExplorerUrl = "https://arweave.net/graphql";

  const moduleTxValidation = useMemo(
    () =>
      validateModuleTxInput(
        moduleTxInput || deployedModuleTx || envModuleTxDefault || "",
        { allowEmpty: true },
      ),
    [deployedModuleTx, envModuleTxDefault, moduleTxInput],
  );
  const schedulerValidation = useMemo(
    () => validateSchedulerInput(scheduler || envSchedulerDefault || ""),
    [envSchedulerDefault, scheduler],
  );
  const moduleTxInlineError =
    moduleTxError ??
    (!moduleTxValidation.ok && (moduleTxInput.trim() || moduleTxFromEnv) ? moduleTxValidation.reason : null);
  const moduleTxInlineHint = moduleTxInlineError
    ? null
    : moduleTxFromEnv
      ? `Using env AO_MODULE_TX ${abbreviateTx(envModuleTxDefault)}`
      : deployedModuleTx
        ? `Cached module tx ${abbreviateTx(deployedModuleTx)}`
        : envModuleTxDefault
          ? `Env AO_MODULE_TX available (${abbreviateTx(envModuleTxDefault)})`
          : "Autofills from the latest deploy, or read from env.";
  const schedulerInlineError =
    schedulerError ??
    (!schedulerValidation.ok && (scheduler || schedulerFromEnv) ? schedulerValidation.reason : null);
  const schedulerInlineHint = schedulerInlineError
    ? null
    : schedulerFromEnv
      ? `Using env SCHEDULER ${abbreviateTx(envSchedulerDefault)}`
      : scheduler
        ? "Looks like a process id"
        : envSchedulerDefault
          ? `Env SCHEDULER available (${abbreviateTx(envSchedulerDefault)})`
          : "Optional. Leave blank to use AO defaults.";
  const wizardValidation = useMemo(
    () => [
      {
        id: "wallet",
        label: "Wallet",
        status: walletInlineError ? "error" : walletMode === "ipc" && !walletPath && !walletJwk ? "warn" : "success",
        detail:
          walletInlineError ??
          (walletMode === "ipc"
            ? walletPath || walletJwk
              ? walletNote ?? "IPC wallet ready"
              : "Pick wallet via IPC"
            : walletInlineHint ?? walletNote ?? "Wallet ready"),
      },
      {
        id: "moduleTx",
        label: "Module tx",
        status: moduleTxInlineError ? "error" : effectiveModuleTx ? "success" : "warn",
        detail:
          moduleTxInlineError ??
          (moduleTxFromEnv
            ? `Env AO_MODULE_TX ${abbreviateTx(envModuleTxDefault)}`
            : effectiveModuleTx
              ? abbreviateTx(effectiveModuleTx)
              : "Missing module tx"),
      },
      {
        id: "scheduler",
        label: "Scheduler",
        status: schedulerInlineError ? "error" : schedulerFromEnv || scheduler ? "success" : "info",
        detail:
          schedulerInlineError ??
          (schedulerFromEnv
            ? `Env SCHEDULER ${abbreviateTx(envSchedulerDefault)}`
            : scheduler
              ? "Scheduler provided"
              : envSchedulerDefault
                ? "Using AO scheduler default"
                : "Optional"),
      },
    ],
    [
      effectiveModuleTx,
      envModuleTxDefault,
      envSchedulerDefault,
      moduleTxInlineError,
      moduleTxFromEnv,
      scheduler,
      schedulerInlineError,
      schedulerFromEnv,
      walletInlineError,
      walletInlineHint,
      walletJwk,
      walletMode,
      walletNote,
      walletPath,
    ],
  );
  const canSpawn = useMemo(
    () =>
      Boolean((manifestTxInput || pip?.manifestTx)?.trim()) &&
      Boolean(effectiveModuleTx) &&
      moduleTxValidation.ok &&
      schedulerValidation.ok,
    [effectiveModuleTx, manifestTxInput, moduleTxValidation.ok, pip?.manifestTx, schedulerValidation.ok],
  );
  const renderTimeline = (
    label: string,
    steps: ActionStep[],
    retryable: boolean,
    onRetry: () => void,
  ) => (
    <div className="ao-timeline">
      <div className="ao-timeline-head">
        <span className="eyebrow">{label}</span>
        {retryable ? (
          <button className="ghost small" type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
      <div className="ao-timeline-steps">
        {steps.map((step) => (
          <div key={step.id} className={`ao-timeline-step ${step.status}`}>
            <div className="ao-step-label">{step.label}</div>
            <div className="ao-step-detail">{step.detail ?? "Idle"}</div>
            {step.at ? <div className="ao-step-time">{formatTimeShort(step.at)}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );

  const aoMiniLogRows = useMemo(() => aoLog.slice(0, 20), [aoLog]);
  const aoLogMetrics = useMemo<AoLogMetrics>(() => {
    const sample = aoLog.slice(0, 30);
    const counts: Record<AoLogSeverity | "all", number> = {
      success: 0,
      warning: 0,
      error: 0,
      info: 0,
      all: 0,
    };

    for (const entry of sample) {
      counts.all += 1;
      counts[entry.severity] = (counts[entry.severity] ?? 0) + 1;
    }

    const latencyValues = sample
      .map((entry) => entry.durationMs)
      .filter((value): value is number => typeof value === "number")
      .reverse();

    const successRate = counts.all ? Math.round((counts.success / counts.all) * 100) : null;

    if (!latencyValues.length) {
      return { successRate, averageLatency: null, sparkline: null, counts };
    }

    const max = Math.max(...latencyValues);
    const min = Math.min(...latencyValues);
    const range = max - min || 1;
    const width = Math.max(110, latencyValues.length * 10);
    const height = 40;
    const step = latencyValues.length > 1 ? width / (latencyValues.length - 1) : width;

    const points = latencyValues.map((value, idx) => {
      const x = idx * step;
      const normalized = (value - min) / range;
      const y = height - normalized * height;
      return { x, y, value };
    });

    const path = points
      .map((point, idx) => `${idx === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    const averageLatency = Math.round(
      latencyValues.reduce((acc, value) => acc + value, 0) / latencyValues.length,
    );

    return {
      successRate,
      averageLatency,
      sparkline: {
        path,
        points,
        width,
        height,
        min: Math.round(min),
        max: Math.round(max),
        latest: Math.round(latencyValues[latencyValues.length - 1]),
      },
      counts,
    };
  }, [aoLog]);
  const holomapEvents = useMemo(
    () =>
      aoMiniLogRows.map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        status: entry.status,
        time: entry.time,
      })),
    [aoMiniLogRows],
  );
  const healthSummary: HealthStatusSummary = useMemo(
    () => summarizeHealthStatuses(health),
    [health],
  );
  const healthLatencyAverages = useMemo(
    () =>
      health
        .map((item) => {
          const avg = averageLatencyMs(item);
          return avg == null ? null : { id: item.id, label: item.label, value: avg };
        })
        .filter(Boolean) as { id: string; label: string; value: number }[],
    [health],
  );
  const latestHealthError = useMemo(() => getLatestHealthError(health), [health]);
  const healthAlertCopy = useMemo(
    () =>
      healthSummary.failing
        .map((item) => `${item.label}: ${healthStatusLabel(item.status)}`)
        .join(" · "),
    [healthSummary],
  );
  const draftDiffPicker = useMemo(() => {
    const options: DraftDiffOption[] = [];
    const lookup = new Map<string, DraftSourceRef>();
    const pushOption = (ref: DraftSourceRef, label: string, description: string) => {
      const value = `${ref.kind}:${ref.id}`;
      if (lookup.has(value)) return;
      options.push({ value, label, description });
      lookup.set(value, ref);
    };

    draftHistory.forEach((revision) =>
      pushOption(
        { kind: "revision", id: revision.id },
        `${formatDraftSaveMode(revision.mode)} • ${formatDate(revision.savedAt)}`,
        revision.name,
      ),
    );

    drafts.forEach((draft) => {
      if (draft.id == null) return;
      pushOption(
        { kind: "draft", id: draft.id },
        `${draft.name}`,
        `Draft • ${formatDate(draft.updatedAt)}`,
      );
    });

    return { options, lookup };
  }, [draftHistory, drafts]);
  const draftDiffOptions = draftDiffPicker.options;
  const draftDiffLookup = draftDiffPicker.lookup;
  const draftDiffRightValue = useMemo(
    () => (draftDiffRightRef ? `${draftDiffRightRef.kind}:${draftDiffRightRef.id}` : null),
    [draftDiffRightRef],
  );

  const healthEventLog = useMemo(() => healthEvents.slice(0, HEALTH_EVENT_DISPLAY_LIMIT), [healthEvents]);

  const healthSla = useMemo(() => {
    const recent = healthEvents.slice(0, HEALTH_EVENT_DISPLAY_LIMIT);
    let failureStreak = 0;
    for (const event of recent) {
      const overall = event.overall ?? event.summary?.overall ?? "missing";
      if (overall === "error" || overall === "missing") {
        failureStreak += 1;
      } else {
        break;
      }
    }

    const latencies = recent
      .map((event) => event.averageLatencyMs)
      .filter((value): value is number => typeof value === "number");
    const averageLatency = latencies.length
      ? Math.round(latencies.reduce((acc, value) => acc + value, 0) / latencies.length)
      : null;

    const latencyBreached = averageLatency != null && averageLatency > slaLatencyThresholdMs;
    const failureBreached = failureStreak >= slaFailureThreshold;

    return {
      averageLatency,
      failureStreak,
      latencyBreached,
      failureBreached,
      breached: latencyBreached || failureBreached,
      latencyThreshold: slaLatencyThresholdMs,
      failureThreshold: slaFailureThreshold,
    };
  }, [healthEvents, slaFailureThreshold, slaLatencyThresholdMs]);

  const latestHealthErrorMessage = useMemo(() => {
    if (!latestHealthError) return null;
    const mainMessage = latestHealthError.lastError ?? latestHealthError.detail;
    if (!mainMessage) return null;
    const checkedLabel = latestHealthError.checkedAt ? new Date(latestHealthError.checkedAt).toLocaleString() : null;
    const parts = [
      `Last error: ${latestHealthError.label}`,
      mainMessage,
      checkedLabel ? `at ${checkedLabel}` : null,
      latestHealthError.url ? `url ${latestHealthError.url}` : null,
    ].filter(Boolean) as string[];

    return parts.join(" — ");
  }, [latestHealthError]);

  const healthStatusCopy = useMemo(() => {
    if (!health.length) return null;
    const summaryLine = `Overall ${healthStatusLabel(healthSummary.overall)} · ok ${healthSummary.ok} · warn ${healthSummary.warn} · error ${healthSummary.error} · missing ${healthSummary.missing} · offline ${healthSummary.offline}`;
    const slaLine = `SLA ${healthSla.breached ? "breached" : "ok"} · failures ${healthSla.failureStreak}/${healthSla.failureThreshold} · avg latency ${healthSla.averageLatency ?? "—"} ms (≤ ${healthSla.latencyThreshold} ms)`;
    const recap = formatHealthRecap(health);
    const detailLines = health.map((item) => {
      const parts = [`${item.label}: ${healthStatusLabel(item.status)}`];
      if (item.detail) parts.push(item.detail);
      if (item.status !== "ok" && item.lastError) {
        parts.push(`last error ${item.lastError}`);
      }
      const latency =
        typeof item.latencyMs === "number"
          ? `${item.latencyMs} ms`
          : item.latencyHistory?.length
            ? `${item.latencyHistory[item.latencyHistory.length - 1]} ms`
            : null;
      if (latency) parts.push(latency);
      return parts.join(" — ");
    });

    return [summaryLine, slaLine, recap, ...detailLines].filter(Boolean).join("\n");
  }, [health, healthSla, healthSummary]);

  const healthSparkline = useMemo(() => {
    const values = [...healthEvents]
      .slice(0, HEALTH_EVENT_DISPLAY_LIMIT)
      .map((event) => event.averageLatencyMs)
      .filter((value): value is number => typeof value === "number")
      .reverse();

    if (!values.length) return null;

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const width = Math.max(80, values.length * 12);
    const height = 36;
    const step = values.length > 1 ? width / (values.length - 1) : width;

    const points = values.map((value, idx) => {
      const x = idx * step;
      const normalized = (value - min) / range;
      const y = height - normalized * height;
      return { x, y, value };
    });

    const path = points
      .map((point, idx) => `${idx === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    const thresholdY = height - ((slaLatencyThresholdMs - min) / range) * height;
    const latencyLine = Math.max(0, Math.min(height, Number.isFinite(thresholdY) ? thresholdY : 0));

    return {
      path,
      points,
      width,
      height,
      min: Math.round(min),
      max: Math.round(max),
      latest: Math.round(values[values.length - 1]),
      latencyLine,
      showLatencyLine: values.length > 1,
    };
  }, [healthEvents, slaLatencyThresholdMs]);

  const handleCopyHealthStatus = useCallback(async () => {
    if (!healthStatusCopy) {
      flashStatus("No health status to copy");
      return;
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(healthStatusCopy);
      flashStatus("Health status copied");
    } catch (err) {
      console.error("Failed to copy health status", err);
      flashStatus("Could not copy status");
    }
  }, [flashStatus, healthStatusCopy]);

  const handleCopyLatestHealthError = useCallback(async () => {
    if (!latestHealthErrorMessage) {
      flashStatus("No health error to copy");
      return;
    }

    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(latestHealthErrorMessage);
      flashStatus("Last error copied");
    } catch (err) {
      console.error("Failed to copy last health error", err);
      flashStatus("Could not copy error");
    }
  }, [flashStatus, latestHealthErrorMessage]);

  const refreshHealthHistory = useCallback(async () => {
    try {
      const recent = await getRecentHealthEvents(HEALTH_EVENT_DISPLAY_LIMIT);
      setHealthEvents(recent);
      return recent;
    } catch (err) {
      console.error("Failed to load health history", err);
      return [];
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const results = await runHealthChecks(undefined, { offline: offlineMode });
      let mergedResults: HealthStatus[] = [];
      setHealth((current) => {
        mergedResults = mergeHealthResults(current, results);
        return mergedResults;
      });

      const snapshot = serializeHealthSnapshot(mergedResults.length ? mergedResults : results);
      const id = await addHealthEvent(snapshot, HEALTH_HISTORY_STORE_LIMIT);
      setHealthEvents((current) => {
        const next = [snapshotToEvent(snapshot, id), ...current];
        return next.slice(0, HEALTH_EVENT_DISPLAY_LIMIT);
      });
    } catch (err) {
      console.error("Health check failed", err);
    } finally {
      setHealthLoading(false);
    }
  }, [offlineMode]);

  const handleExportHealthHistory = useCallback(
    async (format: "json" | "csv") => {
      try {
        const events = await listHealthEvents(HEALTH_HISTORY_STORE_LIMIT);
        if (!events.length) {
          flashStatus("No health history to export");
          return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `health-history-${stamp}.${format}`;
        const content = format === "json" ? healthEventsToJson(events) : healthEventsToCsv(events);
        const mime = format === "json" ? "application/json" : "text/csv";
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        flashStatus(`Exported ${events.length} events to ${format.toUpperCase()}`);
      } catch (err) {
        console.error("Failed to export health history", err);
        flashStatus("Export failed");
      }
    },
    [flashStatus],
  );

  const handleExportVaultAudit = useCallback(
    async (format: "csv" | "json") => {
      setVaultAuditExporting(format);
      try {
        const events = await listVaultAuditEvents();
        if (!events.length) {
          flashStatus("No vault audit entries to export");
          return;
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `pip-vault-audit-${stamp}.${format}`;
        const content = format === "csv" ? vaultAuditToCsv(events) : vaultAuditToJson(events);
        const mime = format === "csv" ? "text/csv" : "application/json";
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        flashStatus(`Exported ${events.length} audit entr${events.length === 1 ? "y" : "ies"}`);
      } catch (err) {
        console.error("Failed to export vault audit", err);
        flashStatus("Audit export failed");
      } finally {
        setVaultAuditExporting(null);
      }
    },
    [flashStatus],
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const index = themePresets.findIndex((preset) => preset.id === current);
      const next = themePresets[(index + 1) % themePresets.length]?.id ?? DEFAULT_THEME;
      return next as Theme;
    });
  }, []);

  const persistRememberPreference = useCallback((value: boolean) => {
    if (typeof window === "undefined") return;
    if (value) {
      window.sessionStorage.setItem(PIP_VAULT_REMEMBER_KEY, "1");
    } else {
      window.sessionStorage.removeItem(PIP_VAULT_REMEMBER_KEY);
      window.sessionStorage.removeItem(PIP_VAULT_REMEMBER_PASSWORD_KEY);
    }
  }, []);

  const persistHardwarePlaceholder = useCallback((value: boolean) => {
    if (typeof window === "undefined") return;
    if (value) {
      window.localStorage.setItem(PIP_VAULT_HARDWARE_PLACEHOLDER_KEY, "1");
    } else {
      window.localStorage.removeItem(PIP_VAULT_HARDWARE_PLACEHOLDER_KEY);
    }
  }, []);

  const rememberPasswordForSession = useCallback(
    (password: string | null, forceStore?: boolean) => {
      if (typeof window === "undefined") return;
      const shouldStore = forceStore ?? pipVaultRememberUnlock;
      if (shouldStore && password) {
        try {
          window.sessionStorage.setItem(PIP_VAULT_REMEMBER_PASSWORD_KEY, btoa(password));
        } catch {
          // ignore storage errors in low-entropy environments
        }
      } else {
        window.sessionStorage.removeItem(PIP_VAULT_REMEMBER_PASSWORD_KEY);
      }
    },
    [pipVaultRememberUnlock],
  );

  const stopVaultAutoLock = useCallback(() => {
    if (vaultAutoLockTimerRef.current) {
      window.clearTimeout(vaultAutoLockTimerRef.current);
    }
    if (vaultAutoLockTickerRef.current) {
      window.clearInterval(vaultAutoLockTickerRef.current);
    }
    vaultAutoLockTimerRef.current = null;
    vaultAutoLockTickerRef.current = null;
    setPipVaultAutoLockRemainingMs(null);
  }, []);

  const refreshPipVaultSnapshot = useCallback(async () => {
    const result = await describePipVault();
    if (result.ok) {
      setPipVaultSnapshot(result);
      if (typeof result.hardwarePlaceholder === "boolean") {
        setPipVaultHardwarePlaceholder((current) =>
          current === result.hardwarePlaceholder ? current : result.hardwarePlaceholder ?? current,
        );
      }
      setPipVaultError(null);
      return result;
    }

    setPipVaultStatus(result.error);
    setPipVaultError(result.error);
    return null;
  }, []);

  const scheduleVaultAutoLock = useCallback(() => {
    stopVaultAutoLock();
    if (!pipVaultAutoLockMinutes) return;
    if (pipVaultSnapshot?.mode !== "password" || pipVaultSnapshot.locked) return;
    if (pipVaultBusy) return;

    const durationMs = pipVaultAutoLockMinutes * 60_000;
    const target = Date.now() + durationMs;
    setPipVaultAutoLockRemainingMs(durationMs);

    vaultAutoLockTimerRef.current = window.setTimeout(() => {
      lastVaultLockReasonRef.current = "timer";
      setPipVaultBusy(true);
      void lockPipVault()
        .then((result) => {
          if (!result.ok) {
            setPipVaultError(result.error);
            return;
          }
          setPipVaultStatus(`Vault auto-locked after ${pipVaultAutoLockMinutes}m`);
          setPipVaultPassword("");
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Unable to auto-lock vault";
          setPipVaultError(message);
        })
        .finally(() => {
          stopVaultAutoLock();
          setPipVaultBusy(false);
          void refreshPipVaultSnapshot();
        });
    }, durationMs);

    vaultAutoLockTickerRef.current = window.setInterval(() => {
      setPipVaultAutoLockRemainingMs(Math.max(0, target - Date.now()));
    }, 1000);
  }, [lockPipVault, pipVaultAutoLockMinutes, pipVaultBusy, pipVaultSnapshot?.locked, pipVaultSnapshot?.mode, refreshPipVaultSnapshot, stopVaultAutoLock]);

  const markVaultActivity = useCallback(() => {
    if (pipVaultSnapshot?.mode === "password" && !pipVaultSnapshot.locked && !pipVaultBusy) {
      scheduleVaultAutoLock();
    }
  }, [pipVaultBusy, pipVaultSnapshot, scheduleVaultAutoLock]);

  const runWithVaultProgress = useCallback(
    async <T,>(kind: PipVaultTaskKind, label: string, task: () => Promise<T>, options?: { detail?: string }) => {
      setPipVaultTask({ kind, label, progress: 8, detail: options?.detail });
      let current = 8;
      const timer = window.setInterval(() => {
        current = Math.min(94, current + 6 + Math.random() * 6);
        setPipVaultTask((state) => (state?.kind === kind ? { ...state, progress: current } : state));
      }, 200);

      try {
        const result = await task();
        setPipVaultTask((state) => (state?.kind === kind ? { ...state, progress: 100 } : state));
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        return result;
      } finally {
        window.clearInterval(timer);
        setPipVaultTask(null);
      }
    },
    [],
  );

  const openVaultAuthPrompt = useCallback(
    (mode: "unlock" | "enable", reason?: string) => {
      setPipVaultPasswordError(null);
      setPipVaultAuthPrompt({ mode, reason });
      flashStatus(mode === "unlock" ? "Vault locked—enter password" : "Encrypt the vault with a password");
    },
    [flashStatus],
  );

  const closeVaultAuthPrompt = useCallback(() => {
    setPipVaultAuthPrompt(null);
    setPipVaultPasswordError(null);
  }, []);

  const refreshPipVaultRecords = useCallback(async () => {
    setPipVaultRecordsLoading(true);
    try {
      const result = await listPipVaultRecords();
      if (result.ok) {
        setPipVaultRecords(result.records);
        setPipVaultError(null);
        return result.records;
      }

      setPipVaultStatus(result.error);
      setPipVaultError(result.error);
      return [];
    } finally {
      setPipVaultRecordsLoading(false);
    }
  }, []);

  const resetVaultPanelBoundary = useCallback(() => {
    setPipVaultError(null);
    setPipVaultTask(null);
    setPipVaultStatus(null);
    setPipVaultPasswordError(null);
    setPipVaultAuthPrompt(null);
    setLastVaultError(null);
    setPipVaultBusy(false);
    setPipVaultPassword("");
    setPipVaultSnapshot(null);
    setPipVaultRecords([]);
    setPipVaultRecordsLoading(false);
    void refreshPipVaultSnapshot();
    void refreshPipVaultRecords();
  }, [refreshPipVaultRecords, refreshPipVaultSnapshot]);

  const focusElement = useCallback((element: HTMLElement | null | undefined) => {
    if (!element) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const scrollNodeIntoView = useCallback((nodeId: string) => {
    if (typeof document === "undefined") return;
    const escape = (globalThis as { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
    const selector = `[data-node-id=\"${escape ? escape(nodeId) : nodeId}\"]`;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash-highlight");
    window.setTimeout(() => el.classList.remove("flash-highlight"), 900);
  }, []);

  const switchWorkspace = useCallback(
    (next: Workspace, options?: { force?: boolean }) => {
      if (next === workspace) return true;
      if (!options?.force && !confirmDiscardChanges("Switch workspace and discard unsaved changes?")) {
        return false;
      }
      setWorkspace(next);
      return true;
    },
    [confirmDiscardChanges, workspace],
  );

  const focusWizardStep = useCallback(
    (step: "wallet" | "module" | "spawn") => {
      if (!switchWorkspace("ao")) return;
      window.setTimeout(() => {
        wizardRegionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        const target =
          step === "wallet"
            ? wizardWalletRef.current
            : step === "module"
              ? wizardModuleRef.current
              : wizardSpawnRef.current;
        focusElement(target);
      }, 20);
    },
    [focusElement, switchWorkspace],
  );

  const focusVaultField = useCallback(
    (field: "password" | "filter") => {
      if (!switchWorkspace("data")) return;
      window.setTimeout(() => {
        vaultRegionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        const target = field === "password" ? vaultPasswordRef.current : vaultFilterRef.current;
        focusElement(target);
      }, 20);
    },
    [focusElement, switchWorkspace],
  );

  const focusHealthThreshold = useCallback(
    (field: "failure" | "latency") => {
      if (!switchWorkspace("ao")) return;
      setHealthExpanded(true);
      window.setTimeout(() => {
        healthCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        const target = field === "failure" ? healthFailureInputRef.current : healthLatencyInputRef.current;
        focusElement(target);
      }, 20);
    },
    [focusElement, switchWorkspace],
  );

  const refreshVaultAudit = useCallback(
    async (limit = VAULT_AUDIT_DISPLAY_LIMIT): Promise<VaultAuditEvent[]> => {
      setVaultAuditLoading(true);
      try {
        const events = await listVaultAuditEvents(limit);
        setVaultAuditEvents(events);
        return events;
      } catch (err) {
        console.error("Failed to load vault audit log", err);
        return [];
      } finally {
        setVaultAuditLoading(false);
      }
    },
    [],
  );

  const recordVaultAudit = useCallback(
    async (event: Omit<VaultAuditEvent, "id">) => {
      try {
        await addVaultAuditEvent(event);
        await refreshVaultAudit();
      } catch (err) {
        console.error("Failed to record vault audit event", err);
      }
    },
    [refreshVaultAudit],
  );

  const toggleVaultAuditRow = useCallback((id: number) => {
    setVaultAuditExpandedId((current) => (current === id ? null : id));
  }, []);

  const runVaultIntegrityScan = useCallback(
    async (reason: "auto" | "manual" = "auto") => {
      if (vaultIntegrityRunning) return;
      if (pipVaultSnapshot?.mode === "password" && pipVaultSnapshot.locked) return;

      setVaultIntegrityRunning(true);
      const startedAt = new Date().toISOString();

      try {
        const result = await scanPipVaultIntegrity();
        if (!result.ok) {
          throw new Error(result.error);
        }

        setVaultIntegrityIssues(result.failed);
        await addVaultIntegrityEvent({
          at: startedAt,
          scanned: result.scanned,
          failed: result.failed.length,
          durationMs: result.durationMs,
          recordCount: result.recordCount,
          issues: result.failed,
        });

        const latest = await getLastVaultIntegrityEvent();
        setVaultIntegrity(latest);

        if (result.failed.length > 0) {
          const sample = result.failed
            .slice(0, 2)
            .map((issue) => issue.id)
            .filter(Boolean)
            .join(", ");
          const message = `Vault integrity issues (${result.failed.length})${sample ? `: ${sample}` : ""}`;
          setPipVaultError(message);
          flashStatus(message);
        } else if (reason === "manual") {
          flashStatus(`Vault integrity OK (${result.scanned} record${result.scanned === 1 ? "" : "s"})`);
        }
        markVaultActivity();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Vault integrity scan failed";
        if (reason === "manual") {
          flashStatus(message);
        }
        setPipVaultError(message);
      } finally {
        setVaultIntegrityRunning(false);
      }
    },
    [flashStatus, markVaultActivity, pipVaultSnapshot, vaultIntegrityRunning],
  );

  const loadVaultWizardIntegrityHistory = useCallback(async () => {
    try {
      const events = await listVaultIntegrityEvents(VAULT_INTEGRITY_WIZARD_LIMIT);
      setVaultWizardIntegrity(events);
      return events;
    } catch (err) {
      console.error("Failed to load vault integrity history", err);
      return [];
    }
  }, []);

  const openVaultBackupWizard = useCallback(
    (mode: "export" | "import" = "export") => {
      setVaultWizardMode(mode);
      setVaultWizardOpen(true);
      setVaultWizardImportError(null);
      setVaultWizardFile(null);
      setVaultWizardUseVaultPassword(true);
    },
    [],
  );

  const closeVaultBackupWizard = useCallback(() => {
    setVaultWizardOpen(false);
    setVaultWizardImportError(null);
    setVaultWizardFile(null);
    setVaultWizardPassword("");
  }, []);

  const handleVaultWizardFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setVaultWizardFile(file);
    setVaultWizardImportError(null);
    if (vaultWizardFileInputRef.current) {
      vaultWizardFileInputRef.current.value = "";
    }
  }, []);

  const triggerVaultWizardFilePick = useCallback(() => {
    vaultWizardFileInputRef.current?.click();
  }, []);

  const refreshDraftHistory = useCallback(async (draftId: number | null) => {
    if (!draftId) {
      setDraftHistory([]);
      return;
    }

    setHistoryLoading(true);
    try {
      const revisions = await listDraftRevisions(draftId);
      setDraftHistory(revisions);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  const getDefaultDraftDiffRef = useCallback((): DraftSourceRef | null => {
    if (draftHistory.length) return { kind: "revision", id: draftHistory[0].id };
    if (activeDraftId != null) return { kind: "draft", id: activeDraftId };
    const firstDraft = drafts.find((draft) => draft.id != null);
    return firstDraft?.id != null ? { kind: "draft", id: firstDraft.id } : null;
  }, [activeDraftId, draftHistory, drafts]);

  const loadDraftDiffSource = useCallback(
    async (ref: DraftSourceRef | null) => {
      if (!ref) {
        setDraftDiffRight(null);
        setDraftDiffEntries([]);
        setDraftDiffHighlight({});
        return null;
      }

      setDraftDiffLoading(true);
      try {
        const loaded = await loadDraftSource(ref);
        setDraftDiffRight(loaded ?? null);
        if (loaded) {
          const { entries, highlight } = diffManifests(manifestRef.current, loaded.document);
          setDraftDiffEntries(entries);
          setDraftDiffHighlight(highlight);
        } else {
          setDraftDiffEntries([]);
          setDraftDiffHighlight({});
        }
        return loaded;
      } finally {
        setDraftDiffLoading(false);
      }
    },
    [],
  );

  const openDraftDiffPanel = useCallback(
    async (ref?: DraftSourceRef | null, options?: { dock?: boolean }) => {
      setDraftDiffOpen(true);
      if (options?.dock != null) {
        setDraftDiffDocked(options.dock);
      } else {
        setDraftDiffDocked(false);
      }
      const targetRef = ref ?? draftDiffRightRef ?? getDefaultDraftDiffRef();
      setDraftDiffRightRef(targetRef ?? null);
      await loadDraftDiffSource(targetRef ?? null);
    },
    [draftDiffRightRef, getDefaultDraftDiffRef, loadDraftDiffSource, setDraftDiffDocked],
  );

  const closeDraftDiffPanel = useCallback(() => {
    setDraftDiffOpen(false);
    setDraftDiffLoading(false);
  }, []);

  const resetDraftDiffBoundary = useCallback(() => {
    setDraftDiffEntries([]);
    setDraftDiffHighlight({});
    setDraftDiffRight(null);
    setDraftDiffRightRef(null);
    setDraftDiffLoading(false);
    setDraftDiffOpen(false);
  }, []);

  const handleSelectDraftDiffOption = useCallback(
    async (value: string) => {
      const ref = value ? draftDiffLookup.get(value) ?? null : null;
      setDraftDiffRightRef(ref);
      await loadDraftDiffSource(ref);
    },
    [draftDiffLookup, loadDraftDiffSource],
  );

  useEffect(() => {
    void refreshDraftHistory(activeDraftId);
  }, [activeDraftId, refreshDraftHistory]);

  useEffect(() => {
    const latestAutosave = draftHistory.find((revision) => revision.mode === "autosave");
    setLastAutosaveAt(latestAutosave?.savedAt ?? null);
  }, [draftHistory]);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    fetchCatalog(initialCatalogFilters.search)
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });
    refreshDrafts(true);
    return () => {
      cancelled = true;
    };
  }, [initialCatalogFilters.search]);

  useEffect(() => {
    void refreshPipVaultSnapshot();
  }, [refreshPipVaultSnapshot]);

  useEffect(() => {
    void refreshVaultAudit();
  }, [refreshVaultAudit]);

  useEffect(() => {
    if (vaultAuditExpandedId == null) return;
    if (!vaultAuditEvents.some((event) => event.id === vaultAuditExpandedId)) {
      setVaultAuditExpandedId(null);
    }
  }, [vaultAuditEvents, vaultAuditExpandedId]);

  useEffect(() => {
    getLastVaultIntegrityEvent()
      .then((event) => {
        setVaultIntegrity(event);
        setVaultIntegrityIssues(event?.issues ?? []);
      })
      .catch((err) => console.error("Failed to load vault integrity log", err));
  }, []);

  useEffect(() => {
    if (!vaultWizardOpen) return;
    void loadVaultWizardIntegrityHistory();
  }, [vaultIntegrity, loadVaultWizardIntegrityHistory, vaultWizardOpen]);

  useEffect(() => {
    if (!pipVaultSnapshot || pipVaultBusy) return;
    if (pipVaultSnapshot.mode === "password" && pipVaultSnapshot.locked) return;

    const fingerprint = `${pipVaultSnapshot.updatedAt ?? "none"}:${pipVaultSnapshot.recordCount}:${pipVaultSnapshot.mode}`;
    if (lastIntegrityFingerprintRef.current === fingerprint) return;
    lastIntegrityFingerprintRef.current = fingerprint;

    void runVaultIntegrityScan("auto");
  }, [pipVaultBusy, pipVaultSnapshot, runVaultIntegrityScan]);

  useEffect(() => {
    persistHardwarePlaceholder(pipVaultHardwarePlaceholder);
  }, [persistHardwarePlaceholder, pipVaultHardwarePlaceholder]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PIP_VAULT_AUTO_LOCK_KEY, String(pipVaultAutoLockMinutes));
    }

    if (pipVaultAutoLockMinutes && pipVaultSnapshot?.mode === "password" && !pipVaultSnapshot.locked && !pipVaultBusy) {
      scheduleVaultAutoLock();
    } else {
      stopVaultAutoLock();
    }
  }, [
    pipVaultAutoLockMinutes,
    pipVaultBusy,
    pipVaultSnapshot?.locked,
    pipVaultSnapshot?.mode,
    scheduleVaultAutoLock,
    stopVaultAutoLock,
  ]);

  useEffect(() => () => stopVaultAutoLock(), [stopVaultAutoLock]);

  useEffect(() => {
    setPipVaultBreachStatus("idle");
    setPipVaultBreachMessage(null);
    setPipVaultBreachCount(null);
    setPipVaultBreachCheckedAt(null);
  }, [pipVaultPassword]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(OFFLINE_STORAGE_KEY, offlineMode ? "true" : "false");
    } catch {
      // ignore storage failures
    }
  }, [offlineMode]);

  useEffect(() => {
    const original = originalFetchRef.current ?? (globalThis as any).fetch;
    originalFetchRef.current = original;
    if (!original) return;

    const offlineFetch: typeof fetch = (..._args) => Promise.reject(new Error(OFFLINE_FETCH_ERROR));

    (globalThis as any).fetch = offlineMode ? offlineFetch : original;

    return () => {
      (globalThis as any).fetch = original;
    };
  }, [offlineMode]);

  useNeonCursorTrail(neonCursorEnabled);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CURSOR_TRAIL_STORAGE_KEY, cursorTrailPref ? "on" : "off");
  }, [cursorTrailPref]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-cursor-trail", neonCursorEnabled ? "on" : "off");
  }, [neonCursorEnabled]);

  useEffect(() => {
    persistLocalePreference(locale);
  }, [locale]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-high-effects", highEffects ? "on" : "off");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("darkmesh-high-effects", highEffects ? "1" : "0");
    }
  }, [highEffects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOLOGRID_ENABLED_STORAGE_KEY, hologridEnabled ? "1" : "0");
  }, [hologridEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOLOGRID_SPEED_STORAGE_KEY, hologridSpeed.toString());
  }, [hologridSpeed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HOLOGRID_OPACITY_STORAGE_KEY, hologridOpacity.toString());
  }, [hologridOpacity]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const active = hologridEnabled && highEffects && !prefersReducedMotion;
    document.documentElement.setAttribute("data-hologrid", active ? "on" : "off");
    document.documentElement.style.setProperty("--hologrid-speed", hologridSpeed.toString());
    document.documentElement.style.setProperty("--hologrid-opacity", hologridOpacity.toString());
  }, [hologridEnabled, highEffects, prefersReducedMotion, hologridSpeed, hologridOpacity]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (hotkeyPrintable) {
      document.body.setAttribute("data-hotkey-print", "on");
    } else {
      document.body.removeAttribute("data-hotkey-print");
    }
    return () => {
      document.body.removeAttribute("data-hotkey-print");
    };
  }, [hotkeyPrintable]);

  useEffect(() => {
    if (prefersReducedMotion && highEffects) {
      setHighEffects(false);
    }
  }, [highEffects, prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AO_PINNED_IDS_STORAGE_KEY, JSON.stringify(pinnedAoIds));
  }, [pinnedAoIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PALETTE_RECENTS_STORAGE_KEY, JSON.stringify(paletteRecents));
    } catch {
      // ignore storage errors
    }
  }, [paletteRecents]);

  useEffect(() => {
    void refreshHealthHistory();
  }, [refreshHealthHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEALTH_AUTO_REFRESH_STORAGE_KEY, healthAutoRefresh);
  }, [healthAutoRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEALTH_AUTO_REFRESH_CUSTOM_KEY, String(healthAutoRefreshCustom));
  }, [healthAutoRefreshCustom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEALTH_SLA_FAILURE_STORAGE_KEY, String(slaFailureThreshold));
    window.localStorage.setItem(HEALTH_SLA_LATENCY_STORAGE_KEY, String(slaLatencyThresholdMs));
  }, [slaFailureThreshold, slaLatencyThresholdMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEALTH_NOTIFY_STORAGE_KEY, healthNotifyEnabled ? "true" : "false");
    if (!healthNotifyEnabled) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      setHealthNotifyEnabled(false);
      return;
    }
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        if (permission !== "granted") {
          setHealthNotifyEnabled(false);
        }
      });
    }
  }, [healthNotifyEnabled]);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    const intervalMs = resolveAutoRefreshIntervalMs(healthAutoRefresh, healthAutoRefreshCustom);
    if (!intervalMs) return;
    const id = window.setInterval(() => {
      void refreshHealth();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [healthAutoRefresh, healthAutoRefreshCustom, refreshHealth]);

  useEffect(() => {
    if (!healthNotifyEnabled) return;
    if (offlineMode) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (!healthSla.breached) {
      lastHealthNotificationRef.current = null;
      return;
    }

    const latestEvent = healthEventLog[0];
    const notificationKey =
      latestEvent?.recordedAt ?? `breach-${healthSla.failureStreak}-${healthSla.averageLatency ?? "na"}`;
    if (lastHealthNotificationRef.current === notificationKey) return;

    const reason = healthSla.failureBreached
      ? `Failure streak ${healthSla.failureStreak}/${healthSla.failureThreshold}`
      : healthSla.latencyBreached
        ? `Avg latency ${healthSla.averageLatency ?? "—"} ms > ${healthSla.latencyThreshold} ms`
        : "SLA breach";

    const failingLabels =
      latestEvent?.summary?.failing?.map((item) => item.label).join(", ") || healthAlertCopy || "Checks need attention";

    new Notification("Health SLA breached", {
      body: `${reason}\n${failingLabels}`,
      silent: false,
    });

    lastHealthNotificationRef.current = notificationKey;
  }, [healthAlertCopy, healthEventLog, healthNotifyEnabled, healthSla, offlineMode]);

  useEffect(() => {
    if (!draftDiffOpen) return;
    const currentKey = draftDiffRightRef ? `${draftDiffRightRef.kind}:${draftDiffRightRef.id}` : null;
    if (currentKey && draftDiffLookup.has(currentKey)) return;
    const fallback = getDefaultDraftDiffRef();
    setDraftDiffRightRef(fallback);
    void loadDraftDiffSource(fallback);
  }, [draftDiffLookup, draftDiffOpen, draftDiffRightRef, getDefaultDraftDiffRef, loadDraftDiffSource]);

  useEffect(() => {
    if (!draftDiffOpen || !draftDiffRight) return;
    const { entries, highlight } = diffManifests(manifest, draftDiffRight.document);
    setDraftDiffEntries(entries);
    setDraftDiffHighlight(highlight);
  }, [draftDiffOpen, draftDiffRight, manifest]);

  useEffect(() => {
    if (!draftDiffOpen) {
      setDraftDiffHighlight({});
    }
  }, [draftDiffOpen]);

  useEffect(() => {
    if (selectedNode) {
      const nextProps = propsFormValue ?? (selectedNode.props ?? {});
      setPropsFormDraft(nextProps as ManifestShape);
      setPropsDraft(stringifyPropsDraft(nextProps));
      setJsonEditorOpen(false);
    } else {
      setPropsDraft("");
      setPropsFormDraft({});
    }
  }, [propsFormValue, selectedNode]);

  useEffect(() => {
    setReviewDraft("");
  }, [selectedNodeId]);

  useEffect(() => {
    const raw = propsDraft.trim();

    try {
      const parsed = raw ? JSON.parse(raw) : {};
      if (isPlainObject(parsed)) {
        setPropsFormDraft(buildFormValue(selectedCatalogItem?.propsSchema, parsed) as ManifestShape);
      }
    } catch {
      // Keep the last valid form draft while the JSON text is invalid.
    }
  }, [propsDraft, selectedCatalogItem?.propsSchema]);

  const applySelection = useCallback(
    (ids: string[]) => {
      const unique = Array.from(new Set(ids.filter(Boolean)));
      setSelectedNodeIds((current) => (selectionsEqual(current, unique) ? current : unique));
      setSelectionAnchorId((current) => {
        const nextAnchor = unique[0] ?? null;
        return current === nextAnchor ? current : nextAnchor;
      });
    },
    [setSelectedNodeIds, setSelectionAnchorId],
  );

  const syncSelectionToManifest = useCallback(
    (doc: ManifestDocument, preferred?: string[]) => {
      const preferredIds = preferred ?? selectedNodeIds;
      const valid = preferredIds.filter((id) => findNodeById(doc.nodes, id));
      const fallback = ensureEntry(doc.entry, doc.nodes);
      const nextSelection = valid.length ? valid : fallback ? [fallback] : [];
      applySelection(nextSelection);
      return nextSelection;
    },
    [applySelection, selectedNodeIds],
  );

  const resetHistory = useCallback(
    (snapshot: ManifestDocument) => {
      historySuppressedRef.current = true;
      setHistoryState({ stack: [snapshot], pointer: 0 });
    },
    [],
  );

  const adoptManifest = useCallback(
    (next: ManifestDocument, options?: { resetHistory?: boolean; selection?: string[] }) => {
      if (options?.resetHistory) {
        resetHistory(next);
      }
      setManifest(next);
      syncSelectionToManifest(next, options?.selection);
    },
    [resetHistory, syncSelectionToManifest],
  );

  const selectSingleNode = useCallback(
    (id: string | null) => {
      applySelection(id ? [id] : []);
    },
    [applySelection],
  );

  const jumpToNode = useCallback(
    (id: string | null) => {
      if (!id) return;
      selectSingleNode(id);
      scrollNodeIntoView(id);
    },
    [scrollNodeIntoView, selectSingleNode],
  );

  useEffect(() => {
    syncSelectionToManifest(manifest);
  }, [manifest.entry, manifest.nodes, syncSelectionToManifest]);

  useEffect(() => {
    if (!selectedNodeIds.length) {
      setSelectionAnchorId(null);
      return;
    }
    setSelectionAnchorId((current) => {
      if (current && selectedNodeIds.includes(current)) return current;
      return selectedNodeIds[0];
    });
  }, [selectedNodeIds]);

  useEffect(() => {
    const tx = pip?.manifestTx?.trim();
    if (!tx) return;

    if (offlineMode) {
      setLoadingManifest(false);
      setRemoteError("Offline mode enabled; manifest fetch skipped");
      return;
    }

    let cancelled = false;
    setLoadingManifest(true);
    setRemoteError(null);
    flashStatus("Fetching manifest…");

    fetchManifestDocument(tx, undefined, { offline: offlineMode })
      .then((doc) => {
        if (cancelled) return;
        const normalized = normalizeManifest(doc);
        adoptManifest(normalized, { resetHistory: true });
        setActiveDraftId(null);
        setSavedSignature(manifestSignature(normalized));
        setLastSavedAt(normalized.metadata.updatedAt);
        flashStatus("Manifest loaded from gateway");
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to fetch manifest";
        setRemoteError(message);
        flashStatus(`Manifest fetch failed: ${message}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adoptManifest, flashStatus, offlineMode, pip]);

  useEffect(() => {
    if (pip?.manifestTx) {
      setManifestTxInput(pip.manifestTx);
      setManifestTxError(null);
    }
  }, [pip?.manifestTx]);

  useEffect(() => {
    let cancelled = false;

    const hydratePipVault = async () => {
      const [vaultDescription, recordsResult, result] = await Promise.all([
        describePipVault(),
        listPipVaultRecords(),
        loadPipFromVault(),
      ]);
      if (cancelled) return;

      if (vaultDescription.ok) {
        setPipVaultSnapshot(vaultDescription);
      }

      if (recordsResult.ok) {
        setPipVaultRecords(recordsResult.records);
      }

      if (result.ok) {
        setPip(result.pip);
        setRemoteError(null);
        setPipVaultStatus("Vault loaded");
        flashStatus("Loaded encrypted PIP vault");
      } else if (result.error === "No PIP vault found") {
        setPipVaultStatus("Vault empty");
      } else if (result.error !== "No PIP vault found") {
        setPipVaultStatus(result.error);
      }
    };

    void hydratePipVault();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPaletteIndex(0);
  }, [paletteQuery]);

  useEffect(() => {
    if (!paletteOpen) return;
    setPaletteQuery("");
    setPaletteIndex(0);
    window.setTimeout(() => paletteInputRef.current?.focus(), 10);
  }, [paletteOpen]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty && !saving && !draftConflict) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draftConflict, isDirty, saving]);

  async function refreshDrafts(loadLatest?: boolean) {
    const all = await listDrafts();
    setDrafts(all);

    if (loadLatest && all.length) {
      const latest = all[0];
      adoptManifest(latest.document, { resetHistory: true });
      setActiveDraftId(latest.id ?? null);
      setSavedSignature(manifestSignature(latest.document));
      setSavedVersionStamp(latest.versionStamp ?? null);
      setLastSavedAt(latest.updatedAt);
      setLastAutosaveAt(null);
      setAutosaveError(null);
      setSavingMode(null);
      setDraftConflict(null);
      void refreshDraftHistory(latest.id ?? null);
      flashStatus("Loaded latest draft");
    }
  }

  const startNewDraft = useCallback((message?: string, options?: { force?: boolean }) => {
    if (!options?.force && !confirmDiscardChanges("Start a new scratch draft? Unsaved changes will be lost.")) {
      return false;
    }

    const next = newManifest();
    adoptManifest(next, { resetHistory: true });
    setActiveDraftId(null);
    setDraftHistory([]);
    setSavedSignature(manifestSignature(next));
    setSavedVersionStamp(null);
    setLastSavedAt(null);
    setLastAutosaveAt(null);
    setAutosaveError(null);
    setSavingMode(null);
    setDraftConflict(null);
    setReviewDraft("");
    if (message) {
      flashStatus(message);
    }
    return true;
  }, [adoptManifest, confirmDiscardChanges, flashStatus]);

  const persistDraft = useCallback(
    async (
      mode: DraftSaveMode,
      options?: {
        force?: boolean;
        revisionTag?: DraftRevisionTag;
        revisionNote?: string;
        name?: string;
        targetId?: number | null;
      },
    ) => {
      if (saveInFlightRef.current) return null;

      const snapshot = manifestRef.current;
      const snapshotSignature = manifestSignature(snapshot);
      const desiredName = options?.name?.trim() || snapshot.name;
      const nextSnapshot = options?.name ? touch({ ...snapshot, name: desiredName }) : snapshot;
      const effectiveTargetId =
        mode === "duplicate" ? null : options?.targetId === undefined ? activeDraftIdRef.current : options.targetId;
      const expectedVersion =
        mode === "duplicate" || effectiveTargetId == null ? undefined : savedVersionStampRef.current ?? undefined;

      const draftInput = {
        id: mode === "duplicate" || effectiveTargetId == null ? undefined : effectiveTargetId ?? undefined,
        name: desiredName,
        document: nextSnapshot,
        createdAt: nextSnapshot.metadata.createdAt,
      };

      saveInFlightRef.current = true;
      setSavingMode(mode);
      if (mode === "autosave") {
        setAutosaveError(null);
      }
      setSaving(true);

      try {
        const saved =
          mode === "duplicate"
            ? await duplicateDraft({ name: desiredName, document: nextSnapshot })
            : await saveDraft(draftInput, mode, {
                expectedVersionStamp: expectedVersion,
                force: options?.force,
                revisionTag: options?.revisionTag,
                revisionNote: options?.revisionNote,
              });

        setDrafts((current) => upsertDraftRow(current, saved));
        setActiveDraftId(saved.id ?? null);
        setSavedSignature(manifestSignature(saved.document));
        setSavedVersionStamp(saved.versionStamp ?? null);
        setLastSavedAt(saved.updatedAt);
        if (mode === "autosave") {
          setLastAutosaveAt(saved.updatedAt);
          setAutosaveError(null);
        }
        setDraftConflict(null);
        void refreshDraftHistory(saved.id ?? null);

        const shouldAdopt =
          mode === "duplicate" || options?.targetId === null || manifestSignature(manifestRef.current) === snapshotSignature;

        if (shouldAdopt) {
          adoptManifest(saved.document, { resetHistory: mode === "duplicate" || options?.targetId === null });
        }

        if (mode === "manual" && !options?.revisionTag) {
          flashStatus("Draft saved to IndexedDB");
        } else if (mode === "duplicate") {
          flashStatus("Draft duplicated");
        } else if (options?.revisionTag === "restore-point") {
          flashStatus("Restore point captured");
        }

        return saved;
      } catch (err) {
        if (err instanceof DraftVersionConflictError) {
          setDraftConflict({ message: err.message, latest: err.latest ?? null });
          flashStatus("Draft conflict: updated elsewhere");
          if (mode === "autosave") {
            setAutosaveError(err.message);
          }
        } else {
          const message = err instanceof Error ? err.message : "Draft save failed";
          if (mode !== "autosave") {
            flashStatus(message);
          } else {
            flashStatus(`Autosave failed: ${message}`);
            setAutosaveError(message);
          }
        }
        return null;
      } finally {
        saveInFlightRef.current = false;
        setSavingMode(null);
        setSaving(false);
      }
    },
    [adoptManifest, flashStatus, refreshDraftHistory],
  );

  useEffect(() => {
    if (!isDirty || saving || draftConflict) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const delay = Math.max(400, autosaveDelayMs);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraft("autosave");
    }, delay);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [autosaveDelayMs, draftConflict, isDirty, persistDraft, saving]);

  const handleLoadPip = () => {
    const raw = window.prompt("Paste PIP JSON (must include manifestTx) or a manifest txid");
    if (!raw) return;

    void (async () => {
      try {
        const parsed = await loadPipFromPrompt(raw);
        if (!parsed.ok) {
          setRemoteError(parsed.error);
          flashStatus(`PIP load failed: ${parsed.error}`);
          return;
        }

        setPip(parsed.pip);
        setRemoteError(null);
        setPipVaultStatus("PIP loaded; save it from the vault panel when ready");
        flashStatus("PIP loaded");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to parse PIP";
        setRemoteError(message);
        flashStatus(`PIP load failed: ${message}`);
      }
    })();
  };

  const handleFetchPipFromWorker = async () => {
    try {
      const tenant = window.prompt("Tenant for latest PIP:")?.trim() || "";
      const site = window.prompt("Site for latest PIP:")?.trim() || "";
      const subject = window.prompt("Subject (optional, for inbox fetch):")?.trim() || "";
      const nonce = subject ? window.prompt("Nonce (required if subject set):")?.trim() || "" : "";

      if (!tenant && !(subject && nonce)) {
        flashStatus("Provide tenant/site or subject+nonce");
        return;
      }

      setLoadingManifest(true);
      setRemoteError(null);
      flashStatus("Fetching PIP from worker…");

      const loaded = await loadPipFromWorker(tenant, site, subject, nonce);
      if (!loaded.ok) {
        throw new Error(loaded.error);
      }

      setPip(loaded.pip);
      setPipVaultStatus("PIP loaded; save it from the vault panel when ready");
      flashStatus(`PIP loaded (${loaded.pip.manifestTx})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch PIP";
      setRemoteError(message);
      flashStatus(message);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handleLoadPipFromVault = async () => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to load a PIP from the vault");
      return;
    }

    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const loaded = await loadPipFromVault();
      if (!loaded.ok) {
        const message = loaded.error === "No PIP vault found" ? "Vault empty" : loaded.error;
        setPipVaultStatus(message);
        setPipVaultError(message);
        flashStatus(message);
        return;
      }

      setPip(loaded.pip);
      setRemoteError(null);
      setPipVaultStatus("Vault loaded");
      setPipVaultError(null);
      flashStatus("PIP loaded from vault");
      markVaultActivity();
      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleSavePipToVault = async () => {
    if (!pip) {
      const message = "Load a PIP before saving to vault";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      return;
    }

    if (pipVaultBlockingIssues.length > 0) {
      const message = "Fix validation issues before saving to vault";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      return;
    }

    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to save this PIP into the vault");
      return;
    }

    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const saved = await savePipToVault(pip);
      if (saved.ok) {
        const message = `Vault saved ${formatDate(saved.updatedAt)}`;
        setPipVaultStatus(message);
        setPipVaultError(null);
        flashStatus("PIP saved to vault");
        markVaultActivity();
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
      } else {
        setPipVaultStatus(saved.error);
        setPipVaultError(saved.error);
        flashStatus(saved.error);
      }
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleExportPip = () => {
    if (!pip) {
      flashStatus("Load a PIP to export");
      return;
    }

    const data = JSON.stringify(pip, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const filename = `pip-${pip.manifestTx || "draft"}.json`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    flashStatus("PIP exported");
  };

  const handleImportPip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const validated = validatePipDocument(parsed);
        if (!validated.ok) {
          flashStatus(validated.error);
          return;
        }
        setPip(validated.pip);
        setRemoteError(null);
        setPipVaultStatus("PIP imported");
        flashStatus("PIP imported");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to import PIP";
        flashStatus(message);
      }

      input.value = "";
    };

    input.click();
  };

  const handleWizardExport = () => {
    setVaultWizardMode("export");
    setVaultWizardImportError(null);
    void handleExportVaultBundle({
      source: "wizard",
      onComplete: () => {
        void loadVaultWizardIntegrityHistory();
      },
    });
  };

  const handleWizardImport = () => {
    if (!vaultWizardFile) {
      setVaultWizardImportError("Choose a backup file first");
      return;
    }
    setVaultWizardMode("import");
    setVaultWizardImportError(null);
    handleImportVaultBundle(vaultWizardFile, {
      source: "wizard",
      useVaultPassword: vaultWizardUseVaultPassword,
      password: vaultWizardUseVaultPassword ? null : vaultWizardPassword,
      rememberPassword: vaultWizardUseVaultPassword ? pipVaultRememberUnlock : false,
      onComplete: () => {
        setVaultWizardFile(null);
        setVaultWizardPassword("");
        void loadVaultWizardIntegrityHistory();
      },
      onError: setVaultWizardImportError,
    });
  };

  const handleQuickVaultExport = () => {
    void handleExportVaultBundle({ source: "panel" });
  };

  const handleQuickVaultImport = () => {
    handleImportVaultBundle(undefined, { source: "panel" });
  };

  function handleExportPipVaultRecords() {
    setPipVaultError(null);
    setPipVaultBusy(true);
    void runWithVaultProgress(
      "records-export",
      "Exporting vault records…",
      async () => {
        const payload = {
          exportedAt: new Date().toISOString(),
          count: pipVaultRecords.length,
          records: pipVaultRecords,
        };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
        link.download = `pip-vault-records-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        flashStatus(`Exported ${pipVaultRecords.length} record${pipVaultRecords.length === 1 ? "" : "s"}`);
        markVaultActivity();
      },
      { detail: `${pipVaultRecords.length} record${pipVaultRecords.length === 1 ? "" : "s"}` },
    ).finally(() => setPipVaultBusy(false));
  }

  const handleSaveKdfProfile = useCallback(() => {
    const saved = persistKdfProfile(pipVaultKdfProfile);
    setPipVaultKdfProfile(saved);
    const message = saved.algorithm === "argon2id" ? "Saved Argon2id tuning" : "Saved PBKDF2 preference";
    setPipVaultStatus(message);
    flashStatus(message);
  }, [flashStatus, pipVaultKdfProfile]);

  const handleBreachCheck = useCallback(async () => {
    const password = pipVaultPassword.trim();
    if (!password) {
      setPipVaultBreachStatus("idle");
      setPipVaultBreachMessage(null);
      setPipVaultBreachCount(null);
      flashStatus("Enter a password first");
      return;
    }
    setPipVaultBreachStatus("checking");
    setPipVaultBreachMessage(null);
    setPipVaultBreachCount(null);
    try {
      const hashBuffer = await window.crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
      const hex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
      const prefix = hex.slice(0, 5);
      const suffix = hex.slice(5);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!resp.ok) {
        throw new Error(`Breach API responded ${resp.status}`);
      }
      const text = await resp.text();
      const hitLine = text
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith(suffix));
      const count = hitLine ? Number(hitLine.split(":")[1] ?? "0") || 0 : 0;
      setPipVaultBreachCount(count);
      const status: BreachCheckStatus = count > 0 ? "maybe" : "clear";
      setPipVaultBreachStatus(status);
      const message = count > 0 ? `Found in ${count.toLocaleString()} breach entries` : "No breach entries found";
      setPipVaultBreachMessage(message);
      setPipVaultBreachCheckedAt(new Date().toISOString());
      setPipVaultStatus(message);
      flashStatus(message);
      void sendVaultTelemetry({ event: "vault.breachCheck", detail: { status, count } });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "Breach check timed out"
          : err instanceof Error
            ? err.message
            : "Breach API unavailable";
      setPipVaultBreachStatus("error");
      setPipVaultBreachMessage(message);
      setPipVaultBreachCheckedAt(new Date().toISOString());
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      void sendVaultTelemetry({ event: "vault.breachCheck", detail: { status: "error", message } });
    }
  }, [flashStatus, pipVaultPassword, sendVaultTelemetry]);

  const handleRunIntegrityScan = () => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      return;
    }

    void runVaultIntegrityScan("manual");
  };

  const handleLockVaultNow = async () => {
    if (pipVaultSnapshot?.mode !== "password") {
      flashStatus("Password mode is not enabled");
      return;
    }

    if (pipVaultSnapshot.locked) {
      flashStatus("Vault already locked");
      return;
    }

    setPipVaultBusy(true);
    try {
      lastVaultLockReasonRef.current = "manual";
      const result = await lockPipVault();
      if (!result.ok) {
        setPipVaultError(result.error);
        flashStatus(result.error);
        return;
      }

      stopVaultAutoLock();
      setPipVaultStatus("Vault locked");
      setPipVaultPassword("");
      flashStatus("Vault locked");
      await refreshPipVaultSnapshot();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to lock vault";
      setPipVaultError(message);
      flashStatus(message);
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleClearPipVault = async () => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to delete the vault safely");
      return;
    }

    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const cleared = await clearPipVaultStorage();
      if (!cleared.ok) {
        setPipVaultStatus(cleared.error);
        setPipVaultError(cleared.error);
        flashStatus(cleared.error);
        return;
      }

      setPipVaultStatus("Vault deleted");
      setPipVaultError(null);
      flashStatus("PIP vault deleted");
      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleLoadVaultRecord = async (recordId: string) => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to load saved vault records");
      return;
    }

    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const loaded = await loadPipFromVaultRecord(recordId);
      if (!loaded.ok) {
        setPipVaultStatus(loaded.error);
        setPipVaultError(loaded.error);
        flashStatus(loaded.error);
        return;
      }

      setPip(loaded.pip);
      setRemoteError(null);
      setPipVaultStatus(`Loaded record ${recordId}`);
      setPipVaultError(null);
      flashStatus(`Loaded PIP record ${abbreviateTx(loaded.pip.manifestTx)}`);
      markVaultActivity();
      await refreshPipVaultSnapshot();
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleDeleteVaultRecord = async (recordId: string) => {
    if (!window.confirm("Delete this vault record?")) {
      return;
    }

    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to delete vault records");
      return;
    }

    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const result = await deletePipVaultRecordStorage(recordId);
      if (!result.ok) {
        setPipVaultStatus(result.error);
        setPipVaultError(result.error);
        flashStatus(result.error);
        return;
      }

      if (result.removed) {
        setPipVaultStatus("Vault record deleted");
        setPipVaultError(null);
        flashStatus("PIP vault record deleted");
        markVaultActivity();
      } else {
        setPipVaultStatus("Record not found");
        setPipVaultError("Record not found");
        flashStatus("Record not found");
      }

      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleRepairVaultIssue = async (issue: PipVaultIntegrityIssue, strategy: "quarantine" | "delete" | "rewrap" = "quarantine") => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
      openVaultAuthPrompt("unlock", "Unlock to repair vault issues");
      return;
    }

    if (strategy === "delete" && !window.confirm(`Delete record ${issue.id}? This cannot be undone.`)) {
      return;
    }

    setPipVaultBusy(true);
    try {
      if (strategy === "delete") {
        const result = await deletePipVaultRecordStorage(issue.id);
        if (!result.ok) {
          setPipVaultStatus(result.error);
          setPipVaultError(result.error);
          flashStatus(result.error);
          return;
        }
        flashStatus("Record removed; re-scanning integrity");
      } else {
        const result = await repairPipVaultRecord(issue.id, { strategy, deleteAfter: false });
        if (!result.ok) {
          const message = result.error;
          setPipVaultStatus(message);
          setPipVaultError(message);
          flashStatus(message);
          return;
        }
        const message =
          result.message ??
          (strategy === "rewrap" ? "Record re-wrapped with a fresh tag" : "Record copied to repair folder");
        setPipVaultStatus(message);
        setPipVaultError(null);
        flashStatus(message);
        void sendVaultTelemetry({
          event: "vault.repair",
          detail: { strategy, quarantined: Boolean(result.quarantinedPath), repaired: result.repaired },
        });
      }
      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
      void runVaultIntegrityScan("manual");
    } finally {
      setPipVaultBusy(false);
    }
  };

  const runEnableVaultPassword = useCallback(
    async (password: string, options?: { auto?: boolean }): Promise<boolean> => {
      const trimmed = password.trim();
      if (!trimmed) {
        setPipVaultPasswordError("Enter a vault password first");
        if (!options?.auto) {
          flashStatus("Enter a vault password first");
        }
        return false;
      }

      setPipVaultPasswordError(null);
      setPipVaultError(null);
      setPipVaultBusy(true);
      setPipVaultTask({
        kind: "unlock",
        label:
          pipVaultSnapshot?.mode === "password"
            ? pipVaultLocked
              ? "Unlocking vault…"
              : "Rotating password…"
            : "Enabling password mode…",
      });

      try {
        const kdfPreference: PipVaultKdfMeta =
          pipVaultKdfProfile.algorithm === "argon2id"
            ? pipVaultKdfProfile
            : { algorithm: "pbkdf2", iterations: pipVaultKdfProfile.iterations };

        const result = await enableVaultPassword(trimmed, {
          kdf: kdfPreference,
          hardwarePlaceholder: pipVaultHardwarePlaceholder,
        });
        if (!result.ok) {
          setPipVaultStatus(result.error);
          setPipVaultError(result.error);
          if (!options?.auto) {
            flashStatus(result.error);
          }
          rememberPasswordForSession(null, false);
          return false;
        }

        const message =
          pipVaultSnapshot?.mode === "password"
            ? pipVaultLocked
              ? "Vault unlocked"
              : "Password rotated"
            : "Password mode enabled";
        const kdfNote = result.kdf?.algorithm === "argon2id" ? " · Argon2id active" : "";
        const statusMessage = options?.auto ? `${message} (remembered)` : message;
        setPipVaultStatus(`${statusMessage}${kdfNote}`);
        setPipVaultError(null);
        if (!options?.auto) {
          flashStatus(`${message}${kdfNote}`);
        }
        lastVaultLockReasonRef.current = null;
        rememberPasswordForSession(trimmed);
        setPipVaultPassword("");
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
        markVaultActivity();
        void sendVaultTelemetry({
          event: "vault.enablePassword",
          detail: {
            mode: result.mode,
            algorithm: result.kdf?.algorithm,
            iterations: result.kdf?.iterations,
            memoryKiB: result.kdf?.memoryKiB,
            parallelism: result.kdf?.parallelism,
            hardwarePlaceholder: result.hardwarePlaceholder ?? pipVaultHardwarePlaceholder,
          },
        });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to enable password";
        setPipVaultStatus(null);
        setPipVaultError(message);
        if (!options?.auto) {
          flashStatus(message);
        }
        rememberPasswordForSession(null, false);
        return false;
      } finally {
        setPipVaultBusy(false);
        setPipVaultTask(null);
      }
      return false;
    },
    [
      enableVaultPassword,
      flashStatus,
      markVaultActivity,
      pipVaultSnapshot?.mode,
      pipVaultLocked,
      rememberPasswordForSession,
      refreshPipVaultSnapshot,
      refreshPipVaultRecords,
      pipVaultKdfProfile.algorithm,
      pipVaultKdfProfile.iterations,
      pipVaultKdfProfile.memoryKiB,
      pipVaultKdfProfile.parallelism,
      pipVaultHardwarePlaceholder,
      sendVaultTelemetry,
    ],
  );

  const runVaultPasswordFlow = useCallback(
    async (intent?: "unlock" | "enable", passwordOverride?: string) => {
      const action = intent ?? (pipVaultSnapshot?.mode === "password" ? "unlock" : "enable");
      const rawPassword = (passwordOverride ?? pipVaultPassword).trim();
      const usingRemembered =
        action === "unlock" && !rawPassword && pipVaultSnapshot?.mode === "password" && rememberedVaultPassword;
      const resolvedPassword = usingRemembered ? rememberedVaultPassword ?? "" : rawPassword;

      if (!validateVaultPassword(action, resolvedPassword)) {
        flashStatus(action === "enable" ? "Use a stronger vault password" : "Enter the vault password to unlock");
        return false;
      }

      if (pipVaultSnapshot && pipVaultSnapshot.mode !== "password" && action !== "unlock") {
        setPipVaultModeConfirm({ action: "enable", password: resolvedPassword });
        setPipVaultAuthPrompt(null);
        return false;
      }

      flashStatus(action === "unlock" ? "Unlocking vault…" : "Enabling password mode…");
      const ok = await runEnableVaultPassword(resolvedPassword);
      if (ok) {
        setPipVaultAuthPrompt(null);
      }
      return ok;
    },
    [
      flashStatus,
      pipVaultPassword,
      pipVaultSnapshot,
      rememberedVaultPassword,
      runEnableVaultPassword,
      setPipVaultModeConfirm,
      setPipVaultAuthPrompt,
      validateVaultPassword,
    ],
  );

  const runDisableVaultPassword = useCallback(async () => {
    setPipVaultPasswordError(null);
    setPipVaultError(null);
    setPipVaultBusy(true);
    setPipVaultTask({ kind: "unlock", label: "Switching to system keychain…" });

    try {
      const result = await disableVaultPassword();
      if (!result.ok) {
        setPipVaultStatus(result.error);
        setPipVaultError(result.error);
        flashStatus(result.error);
        return;
      }

      const message = result.mode === "plain" ? "Vault using local key" : "Vault using system keychain";
      setPipVaultStatus(message);
      setPipVaultError(null);
      flashStatus("Password mode disabled");
      lastVaultLockReasonRef.current = null;
      stopVaultAutoLock();
      rememberPasswordForSession(null, false);
      setPipVaultPassword("");
      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to disable password";
      setPipVaultStatus(null);
      setPipVaultError(message);
      flashStatus(message);
    } finally {
      setPipVaultBusy(false);
      setPipVaultTask(null);
    }
  }, [disableVaultPassword, flashStatus, rememberPasswordForSession, refreshPipVaultRecords, refreshPipVaultSnapshot, stopVaultAutoLock]);

  const handleEnableVaultPassword = useCallback(async () => {
    await runVaultPasswordFlow();
  }, [runVaultPasswordFlow]);

  const handleDisableVaultPassword = () => {
    setPipVaultModeConfirm({ action: "disable" });
  };

  const handleRememberUnlockToggle = (checked: boolean) => {
    setPipVaultRememberUnlock(checked);
    persistRememberPreference(checked);
    if (!checked) {
      rememberPasswordForSession(null, false);
    } else if (pipVaultPassword.trim()) {
      rememberPasswordForSession(pipVaultPassword.trim(), true);
    }
    autoUnlockAttemptRef.current = false;
  };

  const resetVaultResetForm = useCallback(() => {
    setVaultResetCurrent("");
    setVaultResetNew("");
    setVaultResetConfirm("");
    setVaultResetError(null);
  }, []);

  const handleToggleVaultReset = useCallback(() => {
    setVaultResetOpen((open) => {
      const next = !open;
      resetVaultResetForm();
      return next;
    });
  }, [resetVaultResetForm]);

  const handleVaultPasswordReset = useCallback(async () => {
    if (pipVaultBusy) return;
    const current = vaultResetCurrent.trim();
    const next = vaultResetNew.trim();
    const confirmation = vaultResetConfirm.trim();

    if (!current) {
      setVaultResetError("Enter your current vault password");
      return;
    }
    if (!next) {
      setVaultResetError("Enter a new vault password");
      return;
    }
    if (next === current) {
      setVaultResetError("New password must be different from the current one");
      return;
    }
    if (next !== confirmation) {
      setVaultResetError("New password and confirmation do not match");
      return;
    }
    if (next.length < 14 || vaultResetStrength.score < 2) {
      setVaultResetError("Choose a stronger new password before continuing");
      return;
    }

    setVaultResetError(null);
    setPipVaultPasswordError(null);
    flashStatus("Resetting vault password…");

    const unlocked = await runVaultPasswordFlow("unlock", current);
    if (!unlocked) {
      setVaultResetError("Current password is incorrect or the vault is locked");
      return;
    }

    const rotated = await runEnableVaultPassword(next);
    if (!rotated) {
      setVaultResetError("Unable to set the new vault password");
      return;
    }

    resetVaultResetForm();
    setVaultResetOpen(false);
    flashStatus("Vault password changed");
  }, [
    flashStatus,
    pipVaultBusy,
    resetVaultResetForm,
    runEnableVaultPassword,
    runVaultPasswordFlow,
    vaultResetConfirm,
    vaultResetCurrent,
    vaultResetNew,
    vaultResetStrength.score,
  ]);

  const handleToggleHardwarePlaceholder = useCallback(async () => {
    const next = !pipVaultHardwarePlaceholder;
    setPipVaultHardwarePlaceholder(next);
    persistHardwarePlaceholder(next);
    try {
      const result = await setVaultHardwarePlaceholder(next);
      if (!result.ok) {
        throw new Error(result.error);
      }
      setPipVaultHardwarePlaceholder(result.hardwarePlaceholder);
      flashStatus(result.hardwarePlaceholder ? "Hardware key placeholder saved" : "Hardware key placeholder removed");
      await refreshPipVaultSnapshot();
      void sendVaultTelemetry({ event: "vault.hardwarePlaceholder", detail: { enabled: result.hardwarePlaceholder } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update hardware placeholder";
      setPipVaultHardwarePlaceholder(!next);
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
    }
  }, [
    flashStatus,
    persistHardwarePlaceholder,
    pipVaultHardwarePlaceholder,
    refreshPipVaultSnapshot,
    sendVaultTelemetry,
    setVaultHardwarePlaceholder,
  ]);

  const handleConfirmVaultMode = useCallback(async () => {
    if (!pipVaultModeConfirm) return;
    const { action, password } = pipVaultModeConfirm;
    setPipVaultModeConfirm(null);

    if (action === "enable") {
      await runEnableVaultPassword(password ?? pipVaultPassword);
    } else {
      await runDisableVaultPassword();
    }
  }, [pipVaultModeConfirm, pipVaultPassword, runDisableVaultPassword, runEnableVaultPassword]);

  const handleCancelVaultModeConfirm = useCallback(() => {
    setPipVaultModeConfirm(null);
  }, []);

  const handleExportVaultBundle = async (options?: VaultExportOptions) => {
    if (pipVaultBusy) return;
    flashStatus("Exporting vault backup…");
    const startedAt = new Date().toISOString();
    setPipVaultError(null);
    setPipVaultBusy(true);
    try {
      const result = await runWithVaultProgress(
        "export",
        "Exporting vault backup…",
        async () => {
          setPipVaultTask((state) => (state?.kind === "export" ? { ...state, detail: "Bundling encrypted records" } : state));
          const exported = await exportPipVaultBundle();
          if (exported.ok) {
            setPipVaultTask((state) =>
              state?.kind === "export"
                ? { ...state, detail: `Checksum ${exported.checksum.slice(0, 10)}…` }
                : state,
            );
          }
          return exported;
        },
        {
          detail: pipVaultSnapshot?.recordCount
            ? `Preparing ${pipVaultSnapshot.recordCount} record${pipVaultSnapshot.recordCount === 1 ? "" : "s"}`
            : "Collecting vault metadata",
        },
      );
      if (!result.ok) {
        setPipVaultStatus(result.error);
        setPipVaultError(result.error);
        flashStatus(result.error);
        await recordVaultAudit({
          at: startedAt,
          action: "backup",
          status: "error",
          mode: pipVaultSnapshot?.mode,
          recordCount: pipVaultSnapshot?.recordCount,
          source: options?.source ?? "panel",
          detail: result.error,
        });
        return;
      }

        const blob = new Blob([result.bundle], { type: "application/json" });
        const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const suffix = pipVaultSnapshot?.mode === "password" ? "-pw" : "";
      const createdAt = result.createdAt ?? startedAt;
      const filename = `pip-vault-backup${suffix}-${createdAt.slice(0, 10)}.json`;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
        await recordVaultAudit({
          at: createdAt,
          action: "backup",
          status: "ok",
          mode: pipVaultSnapshot?.mode,
          recordCount: result.recordCount ?? pipVaultSnapshot?.recordCount,
          source: options?.source ?? "panel",
          filename,
          checksum: result.checksum,
          bytes: result.bytes ?? new TextEncoder().encode(result.bundle).byteLength,
        });
      setPipVaultStatus("Vault backup exported");
      setPipVaultError(null);
      flashStatus("Vault backup exported");
      markVaultActivity();
      options?.onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vault export failed";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
        await recordVaultAudit({
          at: startedAt,
          action: "backup",
          status: "error",
          mode: pipVaultSnapshot?.mode,
          recordCount: pipVaultSnapshot?.recordCount,
          source: options?.source ?? "panel",
          detail: message,
        });
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleImportVaultBundle = (file?: File | null, options?: VaultImportOptions) => {
    if (pipVaultBusy) return;

    const useVaultPassword = options?.useVaultPassword !== false;
    const rememberPasswordNext = options?.rememberPassword ?? pipVaultRememberUnlock;

    const runImport = async (payload: { text: string; bundleMode?: string; filename?: string; bytes?: number }) => {
      const rememberedPassword = readRememberedPassword();
      const resolvedPassword =
        payload.bundleMode === "password"
          ? (options?.password ?? "").trim() ||
            (useVaultPassword ? pipVaultPassword.trim() || rememberedPassword || "" : "")
          : undefined;

      if (payload.bundleMode === "password" && !resolvedPassword) {
        const message = "Enter the vault password before importing";
        setPipVaultPasswordError(message);
        setPipVaultError(message);
        options?.onError?.(message);
        flashStatus(message);
        return;
      }

      setPipVaultPasswordError(null);
      setPipVaultError(null);
      setPipVaultBusy(true);
      flashStatus("Importing vault backup…");
      try {
        const bundleBytes = payload.bytes ?? new TextEncoder().encode(payload.text).byteLength;
        const startedAt = new Date().toISOString();
        const result = await runWithVaultProgress(
          "import",
          "Importing vault backup…",
          async () => {
            setPipVaultTask((state) =>
              state?.kind === "import" ? { ...state, detail: "Verifying bundle metadata" } : state,
            );
            const outcome = await importPipVaultBundle(
              payload.text,
              payload.bundleMode === "password" ? resolvedPassword : undefined,
            );
            if (outcome.ok) {
              setPipVaultTask((state) =>
                state?.kind === "import"
                  ? { ...state, detail: `Restoring ${outcome.records} record${outcome.records === 1 ? "" : "s"}` }
                  : state,
              );
            }
            return outcome;
          },
          { detail: payload.filename ? `Reading ${payload.filename}` : "Reading backup file" },
        );
        if (!result.ok) {
          setPipVaultStatus(result.error);
          setPipVaultError(result.error);
          options?.onError?.(result.error);
          flashStatus(result.error);
          await recordVaultAudit({
            at: startedAt,
            action: "import",
            status: "error",
            mode: payload.bundleMode === "password" ? "password" : pipVaultSnapshot?.mode,
            recordCount: pipVaultSnapshot?.recordCount,
            filename: payload.filename,
            bytes: bundleBytes,
            source: options?.source ?? "panel",
            detail: result.error,
          });
          return;
        }

        const message = `Vault imported (${result.records} record${result.records === 1 ? "" : "s"})`;
        setPipVaultStatus(message);
        setPipVaultError(null);
        flashStatus(message);
        if (payload.bundleMode === "password") {
          if (rememberPasswordNext) {
            rememberPasswordForSession(resolvedPassword ?? null);
          } else if (useVaultPassword) {
            rememberPasswordForSession(null, false);
          }
          if (!rememberPasswordNext && useVaultPassword) {
            setPipVaultPassword("");
          }
        }
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
        await recordVaultAudit({
          at: startedAt,
          action: "import",
          status: "ok",
          mode: toVaultMode(result.mode),
          recordCount: result.records,
          filename: payload.filename,
          bytes: bundleBytes,
          source: options?.source ?? "panel",
          detail: payload.bundleMode === "password" ? "Password-protected bundle" : "Unprotected bundle",
        });
        markVaultActivity();
        options?.onComplete?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Vault import failed";
        setPipVaultStatus(null);
        setPipVaultError(message);
        options?.onError?.(message);
        flashStatus(message);
        await recordVaultAudit({
          at: new Date().toISOString(),
          action: "import",
          status: "error",
          mode: toVaultMode(payload.bundleMode === "password" ? "password" : pipVaultSnapshot?.mode),
          filename: payload.filename,
          source: options?.source ?? "panel",
          detail: message,
          bytes: payload.bytes,
        });
      } finally {
        setPipVaultBusy(false);
      }
    };

    const parseAndRun = async (selected: File) => {
      let text = "";
      try {
        text = await selected.text();
      } catch {
        const message = "Unable to read vault bundle";
        setPipVaultError(message);
        options?.onError?.(message);
        flashStatus(message);
        return;
      }

      const inspected = inspectVaultBundle(text);
      if (!inspected.ok) {
        setPipVaultError(inspected.error);
        options?.onError?.(inspected.error);
        flashStatus(inspected.error);
        return;
      }

      await runImport({
        text,
        bundleMode: inspected.meta.mode,
        filename: selected.name,
        bytes: new TextEncoder().encode(text).byteLength,
      });
    };

    if (file) {
      void parseAndRun(file);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (event) => {
      const selected = (event.target as HTMLInputElement).files?.[0];
      if (!selected) return;
      void parseAndRun(selected);
      input.value = "";
    };

    input.click();
  };

  useEffect(() => {
    if (!pipVaultSnapshot || pipVaultBusy) return;
    if (pipVaultSnapshot.mode !== "password" || !pipVaultSnapshot.locked) {
      autoUnlockAttemptRef.current = false;
      if (pipVaultSnapshot.mode !== "password") {
        lastVaultLockReasonRef.current = null;
      }
      return;
    }

    if (!pipVaultRememberUnlock) return;
    if (lastVaultLockReasonRef.current) return;

    const stored = readRememberedPassword();
    if (!stored) return;
    if (autoUnlockAttemptRef.current) return;

    autoUnlockAttemptRef.current = true;
    setPipVaultPassword(stored);
    void runEnableVaultPassword(stored, { auto: true });
  }, [pipVaultBusy, pipVaultRememberUnlock, pipVaultSnapshot, readRememberedPassword, runEnableVaultPassword]);

  const applyWalletSelection = (
    source: "ipc" | "path" | "jwk",
    payload: { path?: string; jwk?: Record<string, unknown> | null; note: string },
  ) => {
    setWalletMode(source);
    setWalletFieldError(null);
    setWalletNote(payload.note);
    setWalletPath(payload.path ?? null);
    setWalletJwk(payload.jwk ?? null);
  };

  const resetDeployTimeline = useCallback(
    (detail?: string | null) =>
      setDeployTimeline(
        buildActionTimeline("deploy").map((step, index) => (index === 0 && detail ? { ...step, detail } : step)),
      ),
    [],
  );

  const resetSpawnTimeline = useCallback(
    (detail?: string | null) =>
      setSpawnTimeline(
        buildActionTimeline("spawn").map((step, index) => (index === 0 && detail ? { ...step, detail } : step)),
      ),
    [],
  );

  const markDeployTimeline = useCallback(
    (id: string, status: ActionStep["status"], detail?: string | null) =>
      setDeployTimeline((current) => updateTimelineStep(current, id, status, detail)),
    [],
  );

  const markSpawnTimeline = useCallback(
    (id: string, status: ActionStep["status"], detail?: string | null) =>
      setSpawnTimeline((current) => updateTimelineStep(current, id, status, detail)),
    [],
  );

  const readWalletForMode = async (): Promise<Record<string, unknown> | string | null> => {
    if (walletMode === "ipc") {
      if (walletJwk) return walletJwk;
      if (walletPath) return walletPath;
      setWalletFieldError("Pick a wallet via IPC first");
      return null;
    }

    if (walletMode === "path") {
      const pathValue = walletPathInput.trim();
      const pathValidation = validateWalletPathInput(pathValue);
      if (!pathValidation.ok) {
        setWalletFieldError(pathValidation.reason);
        setWalletNote(pathValidation.reason);
        return null;
      }
      if (pathValidation.hint) {
        setWalletNote(pathValidation.hint);
      }

      const loaded = await fetchWalletFromPath(pathValue);
      if (!loaded.ok) {
        setWalletFieldError(loaded.error);
        setWalletNote(loaded.error);
        return null;
      }

      applyWalletSelection("path", {
        path: loaded.path,
        jwk: loaded.wallet,
        note: `Loaded wallet from ${loaded.path}`,
      });
      return loaded.wallet;
    }

    const jwkValidation = validateWalletJsonInput(walletJwkInput);
    if (!jwkValidation.ok) {
      setWalletFieldError(jwkValidation.reason);
      setWalletNote(jwkValidation.reason);
      return null;
    }

    const parsed = parseWalletJson(walletJwkInput);
    if (!parsed) {
      const reason = "Wallet JSON could not be parsed";
      setWalletFieldError(reason);
      setWalletNote(reason);
      return null;
    }

    applyWalletSelection("jwk", {
      jwk: parsed,
      note: jwkValidation.hint ?? "Using pasted wallet JSON",
    });
    return parsed;
  };

  const handlePickWallet = async () => {
    if (!window.desktop?.selectWallet) {
      setWalletFieldError("IPC wallet picker is unavailable");
      setWalletNote("IPC wallet picker unavailable. Set AO_WALLET_JSON or AO_WALLET_PATH instead.");
      flashStatus("IPC wallet picker unavailable");
      return;
    }

    try {
      const result = await window.desktop.selectWallet();

      if (result?.canceled) {
        flashStatus("Wallet selection cancelled");
        return;
      }

      if (result?.error) {
        setWalletFieldError(result.error);
        setWalletNote(result.error);
        flashStatus(result.error);
        return;
      }

      if (result?.jwk) {
        applyWalletSelection("ipc", {
          path: result.path,
          jwk: result.jwk,
          note: result.path ? `Loaded wallet from ${result.path}` : "Wallet JSON received from IPC",
        });
        flashStatus("Wallet loaded");
        return;
      }

      if (result?.path) {
        applyWalletSelection("ipc", {
          path: result.path,
          note: "Wallet path captured; preload must provide JSON contents",
        });
        flashStatus("Wallet path captured");
        return;
      }

      flashStatus("No wallet selected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallet picker failed";
      setWalletFieldError(message);
      setWalletNote(message);
      flashStatus(message);
    }
  };

  const handleLoadModuleFromDialog = async () => {
    if (!window.desktop?.pickModuleFile) {
      setModuleSourceError("IPC file picker unavailable");
      flashStatus("IPC file picker unavailable");
      return;
    }

    const result = await window.desktop.pickModuleFile();
    if (result?.canceled) {
      flashStatus("Module selection cancelled");
      return;
    }

    if (result?.error) {
      setDeployOutcome(result.error);
      setDeployState("error");
      setModuleSourceError(result.error);
      flashStatus(result.error);
      return;
    }

    if (result?.path) {
      setModulePath(result.path);
      setModuleSourceError(null);
    }
    if (typeof result?.content === "string") {
      setModuleSource(result.content);
      setModuleSourceError(null);
    }
    flashStatus(result?.path ? `Loaded module from ${result.path}` : "Module loaded");
  };

  const handleLoadModuleFromPath = async () => {
    if (!modulePath.trim()) {
      setModuleSourceError("Enter a module file path");
      flashStatus("Enter a module file path");
      return;
    }

    if (!window.desktop?.readTextFile) {
      setModuleSourceError("IPC file reader unavailable");
      flashStatus("IPC file reader unavailable");
      return;
    }

    const result = await window.desktop.readTextFile(modulePath.trim());

    if (result?.error) {
      setDeployOutcome(result.error);
      setDeployState("error");
      setModuleSourceError(result.error);
      flashStatus(result.error);
      return;
    }

    if (result?.path) {
      setModulePath(result.path);
      setModuleSourceError(null);
    }
    if (typeof result?.content === "string") {
      setModuleSource(result.content);
      setModuleSourceError(null);
    }
    flashStatus(`Loaded module from ${result?.path ?? modulePath}`);
  };

  const handleDeployModuleClick = async () => {
    const deployStartedAt = performance.now();
    setDeployTransient(false);
    setDeployOutcome(null);
    setDeployStep(null);
    setModuleSourceError(null);
    setWalletFieldError(null);
    resetDeployTimeline("Prepare deploy");

    if (!moduleSource.trim()) {
      setModuleSourceError("Add module source before deploying");
      setDeployOutcome("Add module source before deploying");
      setDeployState("error");
      markDeployTimeline("deploy-deploy", "error", "Add module source before deploying");
      flashStatus("Add module source before deploying");
      return;
    }

    if (offlineMode && !deployDryRun) {
      const message = "Offline mode is enabled; deploy is blocked";
      setDeployOutcome(message);
      setDeployState("error");
      setDeployStep(null);
      setDeployTransient(true);
      markDeployTimeline("deploy-deploy", "error", message);
      flashStatus(message);
      return;
    }

    markDeployTimeline("deploy-wallet", "pending", "Validating wallet");
    const walletSource = await readWalletForMode();
    if (!walletSource) {
      setDeployState("error");
      markDeployTimeline("deploy-wallet", "error", walletFieldError ?? "Wallet required");
      return;
    }

    setDeployState("pending");
    setDeployStep(deployDryRun ? "Dry-run" : "Validating wallet");
    setDeploying(true);
    markDeployTimeline("deploy-wallet", "success", walletNote ?? "Wallet ready");
    markDeployTimeline("deploy-signer", "pending", deployDryRun ? "Mock signer" : "Creating signer");

    const walletPathHint = walletMode === "path" ? walletPath ?? walletPathInput : undefined;

    try {
      setDeployStep(deployDryRun ? "Dry-run" : "Creating signer");
      const { deployModule, simulateDeployModule } = await loadAoDeployModule();
      markDeployTimeline("deploy-signer", "success", deployDryRun ? "Mock signer ready" : "Signer ready");
      markDeployTimeline("deploy-deploy", "pending", deployDryRun ? "Simulating deploy" : "Sending module to AO");
      const response = deployDryRun
        ? await simulateDeployModule(moduleSource, [], walletPathHint)
        : await deployModule(walletSource, moduleSource, [], { offline: offlineMode });
      recordAoLog(
        "deploy",
        response.txId,
        deployDryRun ? "Dry-run" : response.placeholder ? "Placeholder" : "Success",
        response.raw ?? response,
        {
          moduleTx: response.txId ?? (moduleTxInput || deployedModuleTx) ?? undefined,
          transient: Boolean(response.transient),
          dryRun: deployDryRun,
          profileId: activeProfileId ?? undefined,
        },
        { durationMs: performance.now() - deployStartedAt },
      );
      setDeployTransient(Boolean(response.transient));

      if (!deployDryRun && response.txId) {
        setDeployedModuleTx(response.txId);
        setModuleTxInput(response.txId);
        setModuleTxError(null);
      }

      setDeployOutcome(
        response.note ??
          (deployDryRun
            ? "Dry-run simulation complete"
            : response.txId
              ? `Module deployed: ${response.txId}`
              : "Module deploy request sent"),
      );

      if (response.placeholder && !deployDryRun) {
        flashStatus(response.note ?? "Deploy requires wallet access");
        setDeployState("pending");
        markDeployTimeline("deploy-deploy", "pending", response.note ?? "Deploy requires wallet access");
      } else {
        setDeployState("success");
        setDeployStep(deployDryRun ? "Dry-run" : "Completed");
        markDeployTimeline(
          "deploy-deploy",
          "success",
          deployDryRun
            ? "Dry-run (mock gateway)"
            : response.txId
              ? `Tx ${abbreviateTx(response.txId)}`
              : "Deploy dispatched",
        );
        flashStatus(
          deployDryRun
            ? "Dry-run simulated (no network call)"
            : response.txId
              ? `Module deployed (${response.txId})`
              : "Module deploy complete",
        );
      }

      if (!deployDryRun && response.txId) {
        snapshotProfile({
          label: profileNameDraft || undefined,
          walletMode,
          walletPath: walletPathHint ?? null,
          moduleTx: response.txId,
          manifestTx: manifestTxInput.trim() || pip?.manifestTx?.trim() || null,
          scheduler: scheduler.trim() || null,
          dryRun: false,
          lastKind: "deploy",
        });
        if (profileNameDraft) {
          setProfileNameDraft("");
        }
      } else if (deployDryRun) {
        snapshotProfile({
          label: profileNameDraft || undefined,
          walletMode,
          walletPath: walletPathHint ?? null,
          moduleTx: null,
          manifestTx: manifestTxInput.trim() || pip?.manifestTx?.trim() || null,
          scheduler: scheduler.trim() || null,
          dryRun: true,
          lastKind: "deploy",
        });
      }
    } catch (err) {
      const { message, transient } = classifyAoError(err);
      recordAoLog(
        "deploy",
        null,
        "Error",
        err instanceof Error ? { message: err.message } : { error: String(err) },
        {
          moduleTx: moduleTxInput || deployedModuleTx || undefined,
          transient,
          dryRun: deployDryRun,
          profileId: activeProfileId ?? undefined,
        },
        { durationMs: performance.now() - deployStartedAt },
      );
      setDeployOutcome(message);
      setDeployState("error");
      setDeployStep("Failed");
      setDeployTransient(transient);
      markDeployTimeline("deploy-deploy", "error", message);
      flashStatus(message);
    } finally {
      setDeploying(false);
    }
  };

  const handleSpawnProcessClick = async (override?: { manifestTx?: string; moduleTx?: string; scheduler?: string }) => {
    const spawnStartedAt = performance.now();
    setSpawnTransient(false);
    setSpawnOutcome(null);
    setSpawnStep(null);
    setManifestTxError(null);
    setModuleTxError(null);
    setSchedulerError(null);
    setWalletFieldError(null);
    resetSpawnTimeline("Prepare spawn");

    if (offlineMode) {
      const message = "Offline mode is enabled; spawn is blocked";
      setSpawnOutcome(message);
      setSpawnState("error");
      setSpawnStep(null);
      setSpawnTransient(true);
      markSpawnTimeline("spawn-spawn", "error", message);
      flashStatus(message);
      return;
    }

    const manifestCandidate = (override?.manifestTx ?? manifestTxInput)?.trim() || pip?.manifestTx || "";
    const manifestValidation = validateAoId(manifestCandidate, { label: "manifestTx" });
    if (!manifestValidation.ok) {
      setManifestTxError(manifestValidation.reason);
      setSpawnOutcome(manifestValidation.reason);
      setSpawnState("error");
      markSpawnTimeline("spawn-module", "error", manifestValidation.reason);
      flashStatus(manifestValidation.reason);
      return;
    }

    const overrideModuleTx = (override?.moduleTx ?? "").trim();
    const moduleTx = overrideModuleTx || effectiveModuleTx;
    const moduleValidation = validateModuleTxInput(moduleTx, { allowEmpty: false });
    if (!moduleValidation.ok) {
      setModuleTxError(moduleValidation.reason);
      setSpawnOutcome(moduleValidation.reason);
      setSpawnState("error");
      markSpawnTimeline("spawn-module", "error", moduleValidation.reason);
      flashStatus(moduleValidation.reason);
      return;
    }

    const schedulerCandidate = (override?.scheduler ?? scheduler).trim();
    const schedulerCheck = validateSchedulerInput(schedulerCandidate || undefined);
    if (!schedulerCheck.ok) {
      setSchedulerError(schedulerCheck.reason);
      setSpawnOutcome(schedulerCheck.reason);
      setSpawnState("error");
      markSpawnTimeline("spawn-module", "error", schedulerCheck.reason);
      flashStatus(schedulerCheck.reason);
      return;
    }

    const walletPathHint = walletMode === "path" ? walletPath ?? walletPathInput : null;
    setModuleTxError(null);
    markSpawnTimeline("spawn-wallet", "pending", "Validating wallet");

    const walletSource = await readWalletForMode();
    if (!walletSource) {
      setSpawnState("error");
      markSpawnTimeline("spawn-wallet", "error", walletFieldError ?? "Wallet required");
      return;
    }

    setSpawnState("pending");
    setSpawnStep("Validating wallet");
    setSpawning(true);
    markSpawnTimeline("spawn-wallet", "success", walletNote ?? "Wallet ready");
    markSpawnTimeline("spawn-module", "pending", "Creating signer");

    try {
      setSpawnStep("Creating signer");
      const { spawnProcess } = await loadAoDeployModule();
      markSpawnTimeline("spawn-module", "success", "Signer ready");
      markSpawnTimeline("spawn-spawn", "pending", "Dispatching spawn");
      const response = await spawnProcess(
        schedulerCandidate || undefined,
        manifestValidation.value,
        moduleValidation.value,
        walletSource,
        { offline: offlineMode },
      );
      recordAoLog(
        "spawn",
        response.processId,
        response.placeholder ? "Placeholder" : "Success",
        response.raw ?? response,
        {
          manifestTx: manifestValidation.value,
          moduleTx: response.moduleTx ?? moduleValidation.value,
          scheduler: schedulerCandidate || undefined,
          transient: Boolean(response.transient),
          profileId: activeProfileId ?? undefined,
        },
        { durationMs: performance.now() - spawnStartedAt },
      );
      setSpawnTransient(Boolean(response.transient));

      if (response.moduleTx) {
        setModuleTxInput(response.moduleTx);
        setModuleTxError(null);
        setDeployedModuleTx(response.moduleTx);
      }

      setSpawnOutcome(
        response.note ??
          (response.processId ? `Spawned process: ${response.processId}` : "Spawn request sent"),
      );

      if (response.processId) {
        const snapshot: SpawnSnapshot = {
          processId: response.processId,
          manifestTx: manifestValidation.value,
          moduleTx: response.moduleTx ?? moduleValidation.value,
          scheduler: schedulerCandidate || undefined,
          time: new Date().toISOString(),
        };
        setLastSpawnSnapshot(snapshot);
        snapshotProfile({
          label: profileNameDraft || undefined,
          walletMode,
          walletPath: walletPathHint,
          moduleTx: response.moduleTx ?? moduleValidation.value,
          manifestTx: manifestValidation.value,
          scheduler: schedulerCandidate || null,
          dryRun: false,
          lastKind: "spawn",
        });
        if (profileNameDraft) {
          setProfileNameDraft("");
        }
      }

      if (response.placeholder) {
        flashStatus(response.note ?? "Spawn placeholder");
        setSpawnState("pending");
        markSpawnTimeline("spawn-spawn", "pending", response.note ?? "Spawn placeholder");
      } else {
        setSpawnState("success");
        setSpawnStep("Completed");
        markSpawnTimeline(
          "spawn-spawn",
          "success",
          response.processId ? `PID ${abbreviateTx(response.processId)}` : "Spawn dispatched",
        );
        flashStatus(
          response.processId ? `Spawned process ${response.processId}` : "Spawn request dispatched",
        );
      }
    } catch (err) {
      const { message, transient } = classifyAoError(err);
      recordAoLog(
        "spawn",
        null,
        "Error",
        err instanceof Error ? { message: err.message } : { error: String(err) },
        {
          manifestTx: manifestCandidate,
          moduleTx,
          scheduler: schedulerCandidate || undefined,
          transient,
          profileId: activeProfileId ?? undefined,
        },
        { durationMs: performance.now() - spawnStartedAt },
      );
      setSpawnOutcome(message);
      setSpawnState("error");
      setSpawnStep("Failed");
      setSpawnTransient(transient);
      markSpawnTimeline("spawn-spawn", "error", message);
      flashStatus(message);
  } finally {
    setSpawning(false);
  }
};

  const handleUseCachedModuleTx = () => {
    if (!deployedModuleTx) return;
    setModuleTxInput(deployedModuleTx);
    flashStatus(`Using cached module tx ${abbreviateTx(deployedModuleTx)}`);
  };

  const handleRespawnLast = () => {
    if (!lastSpawnSnapshot) return;
    setManifestTxInput(lastSpawnSnapshot.manifestTx);
    setModuleTxInput(lastSpawnSnapshot.moduleTx);
    setScheduler(lastSpawnSnapshot.scheduler ?? "");
    void handleSpawnProcessClick({
      manifestTx: lastSpawnSnapshot.manifestTx,
      moduleTx: lastSpawnSnapshot.moduleTx,
      scheduler: lastSpawnSnapshot.scheduler,
    });
  };

  const handleRetryDeploy = () => {
    void handleDeployModuleClick();
  };

  const handleRetrySpawn = () => {
    void handleSpawnProcessClick();
  };

  const handleSearchChange = async (value: string) => {
    setSearch(value);
    setCatalogLoading(true);
    try {
      const result = await fetchCatalog(value);
      setCatalog(result);
    } finally {
      setCatalogLoading(false);
    }
  };

  const toggleTypeFilter = (type: string) => {
    setActiveTypes((current) =>
      current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type],
    );
  };

  const toggleTagFilter = (tag: string) => {
    setActiveTags((current) =>
      current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag],
    );
  };

  const recordRecentCatalogItem = useCallback((item: CatalogItem) => {
    setRecentCatalog((current) => {
      const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, CATALOG_RECENTS_LIMIT);
      persistRecentCatalogItems(next);
      return next;
    });
  }, []);

  const handleClearRecentCatalog = useCallback(() => {
    setRecentCatalog([]);
    persistRecentCatalogItems([]);
  }, []);

  const handleSelectNode = useCallback(
    (id: string, meta?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
      const shiftKey = Boolean(meta?.shiftKey);
      const multiKey = Boolean(meta?.metaKey || meta?.ctrlKey);

      if (shiftKey) {
        const anchor = selectionAnchorId && manifestOrder.includes(selectionAnchorId) ? selectionAnchorId : selectedNodeIds[0] ?? id;
        const startIndex = manifestOrder.indexOf(anchor ?? "");
        const endIndex = manifestOrder.indexOf(id);
        if (startIndex === -1 || endIndex === -1) {
          applySelection([id]);
          return;
        }
        const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const range = manifestOrder.slice(from, to + 1);
        applySelection(range);
        setSelectionAnchorId((current) => (current === anchor ? current : anchor));
        return;
      }

      if (multiKey) {
        const nextSet = new Set(selectedNodeIds);
        if (nextSet.has(id)) {
          nextSet.delete(id);
        } else {
          nextSet.add(id);
        }
        const ordered = manifestOrder.filter((nodeId) => nextSet.has(nodeId));
        applySelection(ordered.length ? ordered : []);
        return;
      }

      applySelection([id]);
    },
    [applySelection, manifestOrder, selectedNodeIds, selectionAnchorId, setSelectionAnchorId],
  );

  const addFromCatalog = (item: CatalogItem) => {
    recordRecentCatalogItem(item);
    const node = fromCatalog(item);
    setManifest((prev) =>
      touch({
        ...prev,
        entry: prev.entry ?? node.id,
        nodes: [...prev.nodes, node],
      }),
    );
    selectSingleNode(node.id);
    flashStatus(`${item.name} added to manifest`);
  };

  const addChildFromCatalog = (parentId: string, item: CatalogItem) => {
    recordRecentCatalogItem(item);
    const node = fromCatalog(item);
    setManifest((prev) =>
      touch({
        ...prev,
        nodes: appendNodeToTree(prev.nodes, parentId, node),
      }),
    );
    selectSingleNode(node.id);
    flashStatus(`${item.name} added as child`);
  };

  const handleCatalogDragStart = (item: CatalogItem, event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-blackcat-block", item.id);
    event.dataTransfer.setData("text/plain", item.id);
    setDraggedCatalogId(item.id);
    setCatalogDragging(true);
    setDraggedNodeId(null);
    setTreeDropState(null);
  };

  const handleCatalogDragEnd = () => {
    setDraggedCatalogId(null);
    setCatalogDragging(false);
    setCompositionDropActive(false);
    setTreeDropState(null);
    setDropGhost(null);
  };

  const handleNodeDragStart = (id: string) => {
    setDraggedNodeId(id);
    setDraggedCatalogId(null);
    setTreeDropState(null);
  };

  const handleNodeDragEnd = () => {
    setDraggedNodeId(null);
    setTreeDropState(null);
    setCompositionDropActive(false);
    setDropGhost(null);
  };

  const handleDropTargetChange = (id: string | null, placement: DropPlacement = "inside", mode: TreeDropMode = "catalog") => {
    if (!id) {
      setTreeDropState(null);
      setDropGhost(null);
      return;
    }
    setTreeDropState({ id, placement, mode });
  };

  const handleMoveNode = useCallback(
    (sourceId: string, targetId: string | null, placement: DropPlacement) => {
      const nextNodes = moveNodeWithinTree(manifestRef.current.nodes, sourceId, targetId, placement);
      setTreeDropState(null);
      setCompositionDropActive(false);
      if (nextNodes === manifestRef.current.nodes) {
        return;
      }
      const nextManifest = touch({ ...manifestRef.current, nodes: nextNodes });
      setManifest(nextManifest);
      syncSelectionToManifest(nextManifest, selectedNodeIds.length ? selectedNodeIds : [sourceId]);
      flashStatus("Node moved");
    },
    [flashStatus, selectedNodeIds, syncSelectionToManifest],
  );

  const handleCompositionDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const types = Array.from(event.dataTransfer.types ?? []);
    const nodeDrag = types.includes("application/x-darkmesh-node");
    if (!catalogDragging) {
      setCatalogDragging(true);
    }
    const dragMode: TreeDropMode = nodeDrag ? "move" : "catalog";
    event.dataTransfer.dropEffect = nodeDrag ? "move" : "copy";
    setCompositionDropActive(true);
    const host = previewSurfaceRef.current;
    if (!host) return;

    const cards = Array.from(host.querySelectorAll<HTMLElement>(".tree-card"));
    if (!cards.length) {
      handleDropTargetChange(null, "inside", dragMode);
      return;
    }

    const pointerY = event.clientY;
    const nearest = cards.reduce<{ el: HTMLElement | null; dist: number }>(
      (best, el) => {
        const rect = el.getBoundingClientRect();
        const dist =
          pointerY >= rect.top && pointerY <= rect.bottom
            ? 0
            : Math.min(Math.abs(pointerY - rect.top), Math.abs(pointerY - rect.bottom));
        return dist < best.dist ? { el, dist } : best;
      },
      { el: null, dist: Number.POSITIVE_INFINITY },
    );

    const target = nearest.el;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const ratio = rect.height ? (pointerY - rect.top) / rect.height : 0.5;
    const placement: DropPlacement = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
    handleDropTargetChange(target.dataset.nodeId ?? null, placement, dragMode);
  };

  const handleCompositionDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setCompositionDropActive(false);
    setCatalogDragging(false);
    setTreeDropState(null);
    setDropGhost(null);
  };

  const handleCompositionDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const dropState = treeDropState;
    setCompositionDropActive(false);
    setCatalogDragging(false);
    setTreeDropState(null);
    const draggedNode = event.dataTransfer.getData("application/x-darkmesh-node");
    if (draggedNode) {
      if (dropState?.mode === "move") {
        handleMoveNode(draggedNode, dropState.id, dropState.placement);
      } else {
        handleMoveNode(draggedNode, null, "after");
      }
      setDraggedNodeId(null);
      return;
    }
    const itemId =
      event.dataTransfer.getData("application/x-blackcat-block") || event.dataTransfer.getData("text/plain");
    if (!itemId) return;

    const dropped = catalog.find((entry) => entry.id === itemId) ?? seedCatalog.find((entry) => entry.id === itemId);
    if (!dropped) {
      flashStatus("Dropped block not found");
      return;
    }

    if (dropState && dropState.mode === "catalog") {
      handleTreeDrop(dropState.id, itemId, dropState.placement, dropState.mode);
    } else {
      addFromCatalog(dropped);
    }
  };

  const handleTreeDrop = (targetId: string | null, payloadId: string, placement: DropPlacement, mode: TreeDropMode) => {
    setTreeDropState(null);
    setCompositionDropActive(false);
    if (mode === "move") {
      handleMoveNode(payloadId, targetId, placement);
      setDraggedNodeId(null);
      return;
    }

    const dropped = catalog.find((entry) => entry.id === payloadId) ?? seedCatalog.find((entry) => entry.id === payloadId);
    if (!dropped) {
      flashStatus("Dropped block not found");
      return;
    }

    recordRecentCatalogItem(dropped);
    const node = fromCatalog(dropped);
    const parentIndex = buildParentIndex(manifestRef.current.nodes);
    const targetMeta = targetId ? parentIndex.get(targetId) : null;
    const nextNodes =
      !targetId || !targetMeta
        ? placement === "before"
          ? [node, ...manifestRef.current.nodes]
          : [...manifestRef.current.nodes, node]
        : placement === "inside"
          ? appendNodeToTree(manifestRef.current.nodes, targetId, node)
          : insertNodeIntoTree(
              manifestRef.current.nodes,
              targetMeta.parentId ?? null,
              node,
              placement === "before" ? targetMeta.index : targetMeta.index + 1,
            );

    const nextManifest = touch({
      ...manifestRef.current,
      entry: manifestRef.current.entry ?? node.id,
      nodes: nextNodes,
    });
    setManifest(nextManifest);
    selectSingleNode(node.id);
    flashStatus(`${dropped.name} added`);
  };

  const handleKeyboardMove = useCallback(
    (direction: "up" | "down") => {
      const activeId = selectedNodeId;
      if (!activeId) {
        flashStatus("Select a node to move");
        return;
      }
      const parentIndex = buildParentIndex(manifestRef.current.nodes);
      const meta = parentIndex.get(activeId);
      if (!meta) return;
      const siblings =
        meta.parentId ? findNodeById(manifestRef.current.nodes, meta.parentId)?.children ?? [] : manifestRef.current.nodes;
      const targetIndex = direction === "up" ? meta.index - 1 : meta.index + 1;
      const sibling = siblings[targetIndex];
      if (!sibling) {
        flashStatus(direction === "up" ? "Already at top" : "Already at bottom");
        return;
      }
      const placement: DropPlacement = direction === "up" ? "before" : "after";
      handleMoveNode(activeId, sibling.id, placement);
    },
    [flashStatus, handleMoveNode, selectedNodeId],
  );

  const handleKeyboardStack = useCallback(
    (direction: "in" | "out") => {
      const activeId = selectedNodeId;
      if (!activeId) {
        flashStatus("Select a node to move");
        return;
      }
      const parentIndex = buildParentIndex(manifestRef.current.nodes);
      const meta = parentIndex.get(activeId);
      if (!meta) return;

      if (direction === "in") {
        const parentNode = meta.parentId ? findNodeById(manifestRef.current.nodes, meta.parentId) : null;
        const siblings = parentNode?.children ?? manifestRef.current.nodes;
        const previous = siblings[meta.index - 1];
        if (!previous) {
          flashStatus("No previous sibling to stack under");
          return;
        }
        handleMoveNode(activeId, previous.id, "inside");
        return;
      }

      if (!meta.parentId) {
        flashStatus("Already at root");
        return;
      }

      handleMoveNode(activeId, meta.parentId, "after");
    },
    [flashStatus, handleMoveNode, selectedNodeId],
  );

  const handleDeleteSelection = () => {
    if (!selectedNodeIds.length) {
      flashStatus("Select at least one node to delete");
      return;
    }

    const selection = new Set(selectedNodeIds);
    const nextNodes = removeNodesById(manifestRef.current.nodes, selection);
    if (nextNodes === manifestRef.current.nodes) {
      flashStatus("Nothing to delete");
      return;
    }

    const nextEntry = ensureEntry(manifestRef.current.entry, nextNodes);
    const nextManifest = touch({
      ...manifestRef.current,
      entry: nextEntry ?? undefined,
      nodes: nextNodes,
    });

    setManifest(nextManifest);
    syncSelectionToManifest(nextManifest);
    flashStatus(`Deleted ${selection.size} node${selection.size === 1 ? "" : "s"}`);
  };

  const handleDuplicateSelection = () => {
    if (!selectedNodeIds.length) {
      flashStatus("Select nodes to duplicate");
      return;
    }

    const newIds: string[] = [];
    const nextNodes = duplicateNodesInTree(manifestRef.current.nodes, selectedNodeSet, newIds);
    if (nextNodes === manifestRef.current.nodes) {
      flashStatus("Nothing to duplicate");
      return;
    }

    const nextManifest = touch({ ...manifestRef.current, nodes: nextNodes });
    setManifest(nextManifest);
    applySelection(newIds.length ? newIds : selectedNodeIds);
    flashStatus(`Duplicated ${newIds.length || selectedNodeIds.length} node${(newIds.length || selectedNodeIds.length) === 1 ? "" : "s"}`);
  };

  const stepHistory = useCallback(
    (delta: number) => {
      setHistoryState((current) => {
        const target = Math.max(0, Math.min(current.pointer + delta, current.stack.length - 1));
        if (target === current.pointer) return current;

        const snapshot = current.stack[target];
        historySuppressedRef.current = true;
        setManifest(snapshot);
        syncSelectionToManifest(snapshot);
        return { ...current, pointer: target };
      });
    },
    [setManifest, syncSelectionToManifest],
  );

  const handleUndo = useCallback(() => stepHistory(-1), [stepHistory]);
  const handleRedo = useCallback(() => stepHistory(1), [stepHistory]);

  const updateNodeTitle = (title: string) => {
    if (!selectedNodeId) return;
    setManifest((prev) =>
      touch({
        ...prev,
        nodes: updateNodeInTree(prev.nodes, selectedNodeId, (node) => ({ ...node, title })),
      }),
    );
  };

  const handlePropsModeChange = (nextMode: PropsMode) => {
    setPropsMode(nextMode);
    setJsonEditorOpen(nextMode === "json");
  };

  const handlePropsFormChange = (path: PropsDraftPath, nextValue: unknown) => {
    const next = updateDraftValue(propsFormDraft, path, nextValue);
    setPropsFormDraft(next as ManifestShape);
    setPropsDraft(stringifyPropsDraft(next));
  };

  const handlePropsJsonChange = (nextValue: string) => {
    setPropsDraft(nextValue);
  };

  const applyProps = () => {
    if (!selectedNodeId) return;
    if (!propsInspection?.valid || !propsInspection.parsed) {
      flashStatus(propsInspection?.errorMessage ?? "Fix props JSON before applying");
      return;
    }

    const nextProps = propsInspection.parsed;
    setManifest((prev) =>
      touch({
        ...prev,
        nodes: updateNodeInTree(prev.nodes, selectedNodeId, (node) => ({ ...node, props: nextProps })),
      }),
    );
    setPropsFormDraft(nextProps as ManifestShape);
    setPropsDraft(stringifyPropsDraft(nextProps));
    flashStatus("Props updated");
  };

  const resetPropsToDefaults = () => {
    if (!selectedNodeId) return;

    const nextProps = propsDefaults ?? {};
    setPropsFormDraft(nextProps as ManifestShape);
    setPropsDraft(stringifyPropsDraft(nextProps));
    setManifest((prev) =>
      touch({
        ...prev,
        nodes: updateNodeInTree(prev.nodes, selectedNodeId, (node) => ({ ...node, props: nextProps })),
      }),
    );
    flashStatus("Props reset to defaults");
  };

  const handleManifestName = (value: string) => {
    setManifest((prev) => touch({ ...prev, name: value || "Untitled manifest" }));
  };

  const addReviewComment = (nodeId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !nodeId) return;
    const entry: ReviewComment = {
      id: randomId(),
      manifestId: manifest.id,
      nodeId,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setReviewComments((current) => [entry, ...current]);
    setReviewDraft("");
    window.setTimeout(() => commentInputRef.current?.focus(), 20);
  };

  const toggleReviewComment = (commentId: string) => {
    setReviewComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, resolvedAt: comment.resolvedAt ? null : new Date().toISOString() }
          : comment,
      ),
    );
  };

  const deleteReviewComment = (commentId: string) => {
    setReviewComments((current) => current.filter((comment) => comment.id !== commentId));
  };

  const handleRequestComment = (nodeId: string) => {
    applySelection([nodeId]);
    setReviewMode(true);
    window.setTimeout(() => commentInputRef.current?.focus(), 20);
  };

  const handleSaveDraft = async () => {
    const saved = await persistDraft("manual");
    if (saved) {
      await refreshDrafts();
    }
  };

  const handleSaveAs = async () => {
    const proposal = window.prompt("Save this draft as…", manifestRef.current.name)?.trim();
    if (!proposal) return;
    const saved = await persistDraft("manual", { name: proposal, targetId: null, force: true, revisionNote: "Save as copy" });
    if (saved) {
      await refreshDrafts();
    }
  };

  const handleSaveRestorePoint = async () => {
    const saved = await persistDraft("manual", { revisionTag: "restore-point", revisionNote: "Restore point" });
    if (saved?.id) {
      await refreshDraftHistory(saved.id);
    }
  };

  const handleLoadDraft = async (value: string) => {
    if (!value) {
      startNewDraft();
      return;
    }
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    if (id === activeDraftId) return;
    if (!confirmDiscardChanges("Load this draft and discard unsaved changes?")) return;
    const draft = await getDraft(id);
    if (draft) {
      adoptManifest(draft.document, { resetHistory: true });
      setActiveDraftId(id);
      setSavedSignature(manifestSignature(draft.document));
      setSavedVersionStamp(draft.versionStamp ?? null);
      setLastSavedAt(draft.updatedAt);
      setLastAutosaveAt(null);
      setAutosaveError(null);
      setSavingMode(null);
      setDraftConflict(null);
      void refreshDraftHistory(id);
      flashStatus("Draft loaded");
    }
  };

  const handleDeleteDraft = async (id: number) => {
    await deleteDraft(id);
    if (id === activeDraftId) {
      startNewDraft();
    }
    refreshDrafts();
    if (id === activeDraftId) {
      setDraftHistory([]);
    }
    flashStatus("Draft removed");
  };

  const handleRevertToRevision = (revision: DraftRevision) => {
    if (!confirmDiscardChanges("Revert to this revision and discard unsaved changes?")) return;
    setRevertTargetId(revision.id);
    adoptManifest(revision.document);
    setActiveDraftId(revision.draftId);
    setSavedSignature(manifestSignature(revision.document));
    setSavedVersionStamp(revision.versionStamp ?? null);
    setLastSavedAt(revision.savedAt);
    setLastAutosaveAt(revision.mode === "autosave" ? revision.savedAt : lastAutosaveAt);
    setAutosaveError(null);
    setSavingMode(null);
    setDraftConflict(null);
    flashStatus(`Reverted to ${formatDraftSaveMode(revision.mode).toLowerCase()} from ${formatDate(revision.savedAt)}`);
    window.setTimeout(() => {
      setRevertTargetId((current) => (current === revision.id ? null : current));
    }, 160);
  };

  const handleDuplicateDraft = async () => {
    const saved = await persistDraft("duplicate");
    if (saved) {
      await refreshDrafts();
    }
  };

  const handleResolveConflict = async (action: "reload" | "force" | "duplicate") => {
    if (action === "reload") {
      const latest =
        draftConflict?.latest ?? (activeDraftIdRef.current ? await getDraft(activeDraftIdRef.current) : null);
      if (latest) {
        adoptManifest(latest.document, { resetHistory: true });
        setActiveDraftId(latest.id ?? null);
        setSavedSignature(manifestSignature(latest.document));
        setSavedVersionStamp(latest.versionStamp ?? null);
        setLastSavedAt(latest.updatedAt);
        void refreshDraftHistory(latest.id ?? null);
        flashStatus("Reloaded latest draft");
      }
      setDraftConflict(null);
      setAutosaveError(null);
      return;
    }

    if (action === "force") {
      const saved = await persistDraft("manual", { force: true });
      if (saved) {
        await refreshDrafts();
        setDraftConflict(null);
      }
      setAutosaveError(null);
      return;
    }

    const saved = await persistDraft("duplicate");
    if (saved) {
      await refreshDrafts();
      setDraftConflict(null);
      setAutosaveError(null);
    }
  };

  const handleOpenConflictDiff = useCallback(() => {
    const conflictDraftId = draftConflict?.latest?.id ?? activeDraftIdRef.current ?? activeDraftId;
    const ref = conflictDraftId != null ? ({ kind: "draft", id: conflictDraftId } as DraftSourceRef) : undefined;
    void openDraftDiffPanel(ref, { dock: true });
  }, [activeDraftId, draftConflict, openDraftDiffPanel]);

  const handleExportManifest = () => {
    const data = JSON.stringify(manifest, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${manifest.name || "manifest"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flashStatus("Manifest exported");
  };

  const handleExportDrafts = async () => {
    try {
      const result = await exportDraftsToJson();
      const blob = new Blob([result.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `darkmesh-drafts-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      const revisionCopy =
        result.revisions > 0 ? ` · ${result.revisions} revision${result.revisions === 1 ? "" : "s"}` : "";
      const restoreCopy =
        result.restorePoints > 0
          ? ` · ${result.restorePoints} restore point${result.restorePoints === 1 ? "" : "s"}`
          : "";
      flashStatus(`Exported ${result.drafts} draft${result.drafts === 1 ? "" : "s"}${revisionCopy}${restoreCopy}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Draft export failed";
      flashStatus(message);
    }
  };

  const handleImportDrafts = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = await importDraftsFromJson(text);
        await refreshDrafts();
        const revisionCopy =
          imported.revisions > 0 ? ` · ${imported.revisions} revision${imported.revisions === 1 ? "" : "s"}` : "";
        const restoreCopy =
          imported.restorePoints > 0
            ? ` · ${imported.restorePoints} restore point${imported.restorePoints === 1 ? "" : "s"}`
            : "";
        flashStatus(`Imported ${imported.drafts} draft${imported.drafts === 1 ? "" : "s"}${revisionCopy}${restoreCopy}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Draft import failed";
        flashStatus(message);
      }

      input.value = "";
    };

    input.click();
  };

  const handleCherryPick = useCallback(
    (entry: DraftDiffEntry, action: "add" | "replace" | "remove", options?: { silent?: boolean }) => {
      let message = "";
      let nextSelected: string | null = primarySelectedId;

      setManifest((prev) => {
        let nextNodes = prev.nodes;
        let nextEntry = prev.entry;

        if (action === "add") {
          if (!entry.after) {
            message = "No comparison node to add";
            return prev;
          }
          if (findNodeById(prev.nodes, entry.id)) {
            message = "Node already exists; use Replace instead";
            return prev;
          }

          nextNodes = insertNodeIntoTree(prev.nodes, entry.parentId ?? null, cloneNode(entry.after), entry.afterIndex);
          nextEntry = ensureEntry(prev.entry ?? entry.after.id, nextNodes);
          nextSelected = entry.id;
          message = "Node added from comparison";
        } else if (action === "replace") {
          if (!entry.after) {
            message = "No comparison node to replace with";
            return prev;
          }
          const without = removeNodeFromTree(prev.nodes, entry.id).nodes;
          nextNodes = insertNodeIntoTree(without, entry.parentId ?? null, cloneNode(entry.after), entry.afterIndex);
          nextEntry = ensureEntry(prev.entry, nextNodes);
          nextSelected = entry.id;
          message = "Node replaced from comparison";
        } else if (action === "remove") {
          const result = removeNodeFromTree(prev.nodes, entry.id);
          if (!result.removed) {
            message = "Node not found in current manifest";
            return prev;
          }
          nextNodes = result.nodes;
          nextEntry = ensureEntry(prev.entry, nextNodes);
          if (nextSelected === entry.id) {
            nextSelected = nextEntry ?? null;
          }
          message = "Node removed per diff";
        }

        return touch({
          ...prev,
          entry: nextEntry ?? undefined,
          nodes: nextNodes,
        });
      });

      if (nextSelected) {
        applySelection([nextSelected]);
      } else {
        syncSelectionToManifest(manifestRef.current);
      }

      if (message && !options?.silent) {
        flashStatus(message);
      }
    },
    [applySelection, flashStatus, primarySelectedId, syncSelectionToManifest],
  );

  const handleCopyAoId = async (value: string | null, label: string) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      flashStatus(`${label} copied`);
    } catch {
      flashStatus(`Could not copy ${label.toLowerCase()}`);
    }
  };

  const handleOpenAoId = (value: string | null) => {
    if (!value) return;

    const url = buildAoExplorerUrl(value);
    if (!url) return;

    openExternal(url);
  };

  const classifyAoSeverity = (status: string): AoLogSeverity => {
    const normalized = status.toLowerCase();
    if (normalized.includes("error") || normalized.includes("fail")) return "error";
    if (normalized.includes("dry")) return "success";
    if (normalized.includes("placeholder") || normalized.includes("warn")) return "warning";
    if (normalized.includes("success")) return "success";
    return "info";
  };

  const recordAoLog = (
    kind: "deploy" | "spawn",
    id: string | null,
    status: string,
    payload?: unknown,
    context?: AoLogContext,
    meta?: { durationMs?: number },
  ) => {
    const entry: AoMiniLogEntry = {
      kind,
      id,
      status,
      time: new Date().toISOString(),
      href: buildAoExplorerUrl(id),
      severity: classifyAoSeverity(status),
      ...(typeof meta?.durationMs === "number" ? { durationMs: Math.round(meta.durationMs) } : {}),
      ...(context ? { context } : {}),
      ...(payload !== undefined ? { payload } : {}),
    };

    const rawValue =
      typeof payload === "string"
        ? payload
        : payload &&
          typeof payload === "object" &&
          "raw" in (payload as Record<string, unknown>) &&
          typeof (payload as Record<string, unknown>).raw === "string"
          ? ((payload as Record<string, unknown>).raw as string)
          : undefined;

    if (rawValue) {
      entry.raw = rawValue;
    }

    setAoLog((current) => [entry, ...current].slice(0, 40));
  };

  const togglePinnedAoId = (id: string | null) => {
    if (!id) return;
    setPinnedAoIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [id, ...current].slice(0, 20),
    );
  };

  const toggleAoLogTail = useCallback((next?: boolean) => {
    setAoLogTailing((current) => (typeof next === "boolean" ? next : !current));
  }, []);

  const handleClearAoLog = useCallback(() => {
    setAoLog([]);
    flashStatus("AO console log cleared");
  }, [flashStatus]);

  const handleExportAoLog = useCallback(
    (format: "csv") => {
      if (!aoLog.length) {
        flashStatus("No AO log entries to export");
        return;
      }

      if (format === "csv") {
        const csv = aoLogToCsv(aoLog);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ao-log-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        flashStatus("AO log exported");
      }
    },
    [aoLog, flashStatus],
  );

  const retryAoAction = (entry: AoMiniLogEntry) => {
    if (entry.kind === "deploy") {
      void handleDeployModuleClick();
      return;
    }

    if (entry.context?.manifestTx) {
      setManifestTxInput(entry.context.manifestTx);
    }
    if (entry.context?.moduleTx) {
      setModuleTxInput(entry.context.moduleTx);
    }
    if (entry.context && "scheduler" in entry.context) {
      setScheduler(entry.context.scheduler ?? "");
    }

    void handleSpawnProcessClick({
      manifestTx: entry.context?.manifestTx,
      moduleTx: entry.context?.moduleTx,
      scheduler: entry.context?.scheduler,
    });
  };

  const resumeAoAction = (entry: AoMiniLogEntry) => {
    flashStatus(entry.kind === "deploy" ? "Retrying deploy" : "Resuming spawn");
    retryAoAction(entry);
  };

  const snapshotProfile = useCallback(
    (snapshot: AoProfileSnapshot) => {
      const sanitized: AoProfileSnapshot = {
        ...snapshot,
        walletPath: snapshot.walletMode === "path" ? snapshot.walletPath ?? null : null,
        moduleTx: snapshot.moduleTx ?? null,
        manifestTx: snapshot.manifestTx ?? null,
        scheduler: snapshot.scheduler ?? null,
        dryRun: snapshot.dryRun ?? false,
      };

      const { profile, profiles } = rememberProfile(sanitized, aoProfilesRef.current);
      setAoProfiles(profiles);
      setActiveProfileId(profile.id);
      return profile;
    },
    [rememberProfile, setActiveProfileId, setAoProfiles],
  );

  const applyProfile = useCallback(
    (profile: AoDeployProfile) => {
      setActiveProfileId(profile.id);
      setWalletMode(profile.walletMode);
      setWalletFieldError(null);
      setModuleTxError(null);
      setSchedulerError(null);
      setManifestTxError(null);
      setWalletNote(profile.walletMode === "path" && profile.walletPath ? "Path loaded from profile; load wallet to use it." : null);
      setWalletPathInput(profile.walletPath ?? "");
      setWalletPath(null);
      setWalletJwk(null);
      setWalletJwkInput("");
      setModuleTxInput(profile.moduleTx ?? "");
      setManifestTxInput(profile.manifestTx ?? "");
      setScheduler(profile.scheduler ?? "");
      setDeployDryRun(Boolean(profile.dryRun));
      flashStatus(`Profile ${profile.label} applied`);
    },
    [flashStatus],
  );

  const handleSaveProfile = useCallback(() => {
    const pathCandidate = walletMode === "path" ? walletPathInput.trim() || walletPath || null : null;
    const snapshot: AoProfileSnapshot = {
      label: profileNameDraft || undefined,
      walletMode,
      walletPath: pathCandidate,
      moduleTx: moduleTxInput.trim() || deployedModuleTx || null,
      manifestTx: manifestTxInput.trim() || pip?.manifestTx?.trim() || null,
      scheduler: scheduler.trim() || null,
      dryRun: deployDryRun,
      lastKind: "deploy",
    };

    if (!snapshot.moduleTx && !snapshot.manifestTx) {
      flashStatus("Add a moduleTx or manifestTx before saving a profile");
      return;
    }

    const profile = snapshotProfile(snapshot);
    if (profileNameDraft) {
      setProfileNameDraft("");
    }
    flashStatus(`Profile ${profile.label} saved`);
  }, [
    deployDryRun,
    deployedModuleTx,
    flashStatus,
    manifestTxInput,
    moduleTxInput,
    profileNameDraft,
    pip,
    scheduler,
    snapshotProfile,
    walletMode,
    walletPath,
    walletPathInput,
  ]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
  }, []);

  const togglePalette = useCallback(() => {
    if (paletteOpen) {
      closePalette();
      return;
    }

    setHotkeyOverlayOpen(false);
    setPaletteOpen(true);
  }, [closePalette, paletteOpen]);

  const resetHotkeyOverlayState = useCallback(() => {
    setHotkeyPrintable(false);
    setHotkeyLearnMode(false);
    setHotkeyActiveTarget(null);
    setHotkeyScopeFilter("active");
  }, []);

  const closeHotkeyOverlay = useCallback(() => {
    setHotkeyOverlayOpen(false);
    resetHotkeyOverlayState();
  }, [resetHotkeyOverlayState]);

  const toggleHotkeyOverlay = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    setHotkeyOverlayOpen((open) => {
      if (open) {
        resetHotkeyOverlayState();
      }
      return !open;
    });
  }, [resetHotkeyOverlayState]);

  const rememberPaletteAction = useCallback((actionId: string) => {
    setPaletteRecents((current) => [actionId, ...current.filter((value) => value !== actionId)].slice(0, PALETTE_RECENTS_LIMIT));
  }, []);

  const runPaletteAction = useCallback(
    async (action: CommandPaletteAction) => {
      closePalette();
      try {
        await action.run();
        if (action.id) {
          rememberPaletteAction(action.id);
        }
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : "Command failed");
      }
    },
    [closePalette, flashStatus, rememberPaletteAction],
  );

  const changeLocale = useCallback(
    (next: LocaleKey) => {
      void (async () => {
        const nextMessages = await loadMessages(next);
        const nextTranslator = makeTranslator(nextMessages);
        if (next === locale) {
          flashStatus(nextTranslator("statuses.localeAlready", { language: nextMessages.meta.languageNative }));
          return;
        }
        setLocale(next);
        flashStatus(nextTranslator("statuses.localeChanged", { language: nextMessages.meta.languageNative }));
      })();
    },
    [flashStatus, locale],
  );

  const actionCopy = messages.actions;
  const paletteSectionLabels = messages.paletteUi.sections;
  const nextThemePreset = useMemo(
    () => themePresets[(themePresets.findIndex((preset) => preset.id === theme) + 1) % themePresets.length] ?? themePresets[0],
    [theme],
  );

  const fuzzyScore = useCallback((text: string, query: string): number | null => {
    const haystack = text.toLowerCase();
    let cursor = 0;
    let score = 0;
    for (const char of query) {
      const hit = haystack.indexOf(char, cursor);
      if (hit === -1) return null;
      score += hit - cursor;
      cursor = hit + 1;
    }
    return score;
  }, []);

  const scorePaletteAction = useCallback(
    (action: CommandPaletteAction, query: string): number | null => {
      if (!query) return 0;
      const haystacks = [action.label, action.description, action.shortcut ?? "", action.id]
        .filter(Boolean)
        .map((value) => value.toLowerCase());

      let best: number | null = null;
      for (const hay of haystacks) {
        const score = fuzzyScore(hay, query);
        if (score === null) continue;
        const startsWithBonus = hay.startsWith(query) ? -2 : 0;
        const wordBonus = hay.split(/\s+/).some((word) => word.startsWith(query)) ? -1 : 0;
        const total = score + startsWithBonus + wordBonus;
        best = best === null ? total : Math.min(best, total);
      }
      return best;
    },
    [fuzzyScore],
  );

  const themePaletteActions: CommandPaletteAction[] = themePresets.map((preset) => ({
    id: `theme-${preset.id}`,
    groupId: "themes",
    label: `${actionCopy.toggles.theme.label} · ${preset.label}`,
    description: preset.id === theme ? `${preset.description} · Active` : preset.description,
    target: actionCopy.toggles.theme.target,
    run: () => setTheme(preset.id),
  }));

  const paletteActions: CommandPaletteAction[] = [
    {
      id: "workspace-studio",
      groupId: "workspace",
      label: actionCopy.workspace.studio.label,
      description: actionCopy.workspace.studio.description,
      shortcut: actionCopy.workspace.studio.shortcut,
      target: actionCopy.workspace.studio.target,
      run: () => setWorkspace("studio"),
    },
    {
      id: "workspace-ao",
      groupId: "workspace",
      label: actionCopy.workspace.ao.label,
      description: actionCopy.workspace.ao.description,
      shortcut: actionCopy.workspace.ao.shortcut,
      target: actionCopy.workspace.ao.target,
      run: () => setWorkspace("ao"),
    },
    {
      id: "workspace-data",
      groupId: "workspace",
      label: actionCopy.workspace.data.label,
      description: actionCopy.workspace.data.description,
      shortcut: actionCopy.workspace.data.shortcut,
      target: actionCopy.workspace.data.target,
      run: () => setWorkspace("data"),
    },
    {
      id: "workspace-preview",
      groupId: "workspace",
      label: actionCopy.workspace.preview.label,
      description: actionCopy.workspace.preview.description,
      shortcut: actionCopy.workspace.preview.shortcut,
      target: actionCopy.workspace.preview.target,
      run: () => setWorkspace("preview"),
    },
    {
      id: "toggle-theme",
      groupId: "toggles",
      label: actionCopy.toggles.theme.label,
      description: t("actions.toggles.theme.nextLabel", {
        theme: nextThemePreset?.label ?? getThemeLabel(DEFAULT_THEME),
      }),
      shortcut: actionCopy.toggles.theme.shortcut,
      target: actionCopy.toggles.theme.target,
      run: toggleTheme,
    },
    {
      id: "toggle-high-effects",
      groupId: "toggles",
      label: highEffects ? actionCopy.toggles.highEffects.labelOn : actionCopy.toggles.highEffects.labelOff,
      description: prefersReducedMotion
        ? actionCopy.toggles.highEffects.description.blocked
        : actionCopy.toggles.highEffects.description.default,
      shortcut: actionCopy.toggles.highEffects.shortcut,
      target: actionCopy.toggles.highEffects.target,
      run: () => {
        if (prefersReducedMotion) {
          setHighEffects(false);
          flashStatus(actionCopy.toggles.highEffects.description.blocked);
          return;
        }
        setHighEffects((current) => !current);
      },
    },
    ...themePaletteActions,
    {
      id: "toggle-offline",
      groupId: "toggles",
      label: offlineMode ? actionCopy.toggles.offline.labelOn : actionCopy.toggles.offline.labelOff,
      description: offlineMode ? actionCopy.toggles.offline.description.on : actionCopy.toggles.offline.description.off,
      shortcut: actionCopy.toggles.offline.shortcut,
      target: actionCopy.toggles.offline.target,
      run: () => setOfflineMode((current) => !current),
    },
    {
      id: "toggle-health",
      groupId: "diagnostics",
      label: healthExpanded ? actionCopy.toggles.health.labelOpen : actionCopy.toggles.health.labelClosed,
      description: actionCopy.toggles.health.description,
      shortcut: actionCopy.toggles.health.shortcut,
      target: actionCopy.toggles.health.target,
      run: () => setHealthExpanded((open) => !open),
    },
    {
      id: "focus-wizard-wallet",
      groupId: "focus",
      label: actionCopy.focus.wizardWallet.label,
      description: actionCopy.focus.wizardWallet.description,
      shortcut: actionCopy.focus.wizardWallet.shortcut,
      target: actionCopy.focus.wizardWallet.target,
      run: () => focusWizardStep("wallet"),
    },
    {
      id: "focus-wizard-module",
      groupId: "focus",
      label: actionCopy.focus.wizardModule.label,
      description: actionCopy.focus.wizardModule.description,
      shortcut: actionCopy.focus.wizardModule.shortcut,
      target: actionCopy.focus.wizardModule.target,
      run: () => focusWizardStep("module"),
    },
    {
      id: "focus-wizard-process",
      groupId: "focus",
      label: actionCopy.focus.wizardProcess.label,
      description: actionCopy.focus.wizardProcess.description,
      shortcut: actionCopy.focus.wizardProcess.shortcut,
      target: actionCopy.focus.wizardProcess.target,
      run: () => focusWizardStep("spawn"),
    },
    {
      id: "focus-vault-password",
      groupId: "focus",
      label: actionCopy.focus.vaultPassword.label,
      description: actionCopy.focus.vaultPassword.description,
      shortcut: actionCopy.focus.vaultPassword.shortcut,
      target: actionCopy.focus.vaultPassword.target,
      run: () => focusVaultField("password"),
    },
    {
      id: "focus-vault-filter",
      groupId: "focus",
      label: actionCopy.focus.vaultFilter.label,
      description: actionCopy.focus.vaultFilter.description,
      shortcut: actionCopy.focus.vaultFilter.shortcut,
      target: actionCopy.focus.vaultFilter.target,
      run: () => focusVaultField("filter"),
    },
    {
      id: "focus-health-failure",
      groupId: "diagnostics",
      label: actionCopy.focus.healthFailure.label,
      description: actionCopy.focus.healthFailure.description,
      shortcut: actionCopy.focus.healthFailure.shortcut,
      target: actionCopy.focus.healthFailure.target,
      run: () => focusHealthThreshold("failure"),
    },
    {
      id: "focus-health-latency",
      groupId: "diagnostics",
      label: actionCopy.focus.healthLatency.label,
      description: actionCopy.focus.healthLatency.description,
      shortcut: actionCopy.focus.healthLatency.shortcut,
      target: actionCopy.focus.healthLatency.target,
      run: () => focusHealthThreshold("latency"),
    },
    {
      id: "new-draft",
      groupId: "drafts",
      label: actionCopy.drafts.new.label,
      description: actionCopy.drafts.new.description,
      shortcut: actionCopy.drafts.new.shortcut,
      target: actionCopy.drafts.new.target,
      run: () => startNewDraft(actionCopy.drafts.new.label),
    },
    {
      id: "duplicate-draft",
      groupId: "drafts",
      label: actionCopy.drafts.duplicate.label,
      description: actionCopy.drafts.duplicate.description,
      shortcut: actionCopy.drafts.duplicate.shortcut,
      target: actionCopy.drafts.duplicate.target,
      run: () => void handleDuplicateDraft(),
    },
    {
      id: "open-draft-diff",
      groupId: "drafts",
      label: actionCopy.drafts.diff.label,
      description: actionCopy.drafts.diff.description,
      shortcut: actionCopy.drafts.diff.shortcut,
      target: actionCopy.drafts.diff.target,
      run: () => void openDraftDiffPanel(),
    },
    {
      id: "save-draft",
      groupId: "drafts",
      label: actionCopy.drafts.save.label,
      description: actionCopy.drafts.save.description,
      shortcut: actionCopy.drafts.save.shortcut,
      target: actionCopy.drafts.save.target,
      run: () => void handleSaveDraft(),
    },
    {
      id: "refresh-health",
      groupId: "diagnostics",
      label: actionCopy.diagnostics.refresh.label,
      description: actionCopy.diagnostics.refresh.description,
      shortcut: actionCopy.diagnostics.refresh.shortcut,
      target: actionCopy.diagnostics.refresh.target,
      run: () => void refreshHealth(),
    },
    {
      id: "load-pip-vault",
      groupId: "vault",
      label: actionCopy.vault.load.label,
      description: actionCopy.vault.load.description,
      shortcut: actionCopy.vault.load.shortcut,
      target: actionCopy.vault.load.target,
      run: () => void handleLoadPipFromVault(),
    },
    {
      id: "save-pip-vault",
      groupId: "vault",
      label: actionCopy.vault.save.label,
      description: actionCopy.vault.save.description,
      shortcut: actionCopy.vault.save.shortcut,
      target: actionCopy.vault.save.target,
      run: () => void handleSavePipToVault(),
    },
    {
      id: "export-drafts",
      groupId: "exports",
      label: actionCopy.exports.drafts.label,
      description: actionCopy.exports.drafts.description,
      shortcut: actionCopy.exports.drafts.shortcut,
      target: actionCopy.exports.drafts.target,
      run: () => void handleExportDrafts(),
    },
    {
      id: "export-manifest",
      groupId: "exports",
      label: actionCopy.exports.manifest.label,
      description: actionCopy.exports.manifest.description,
      shortcut: actionCopy.exports.manifest.shortcut,
      target: actionCopy.exports.manifest.target,
      run: () => handleExportManifest(),
    },
    {
      id: "language-en",
      groupId: "language",
      label: actionCopy.language.options.en.label,
      description: actionCopy.language.options.en.description,
      target: actionCopy.language.options.en.target,
      run: () => changeLocale("en"),
    },
    {
      id: "language-cs",
      groupId: "language",
      label: actionCopy.language.options.cs.label,
      description: actionCopy.language.options.cs.description,
      target: actionCopy.language.options.cs.target,
      run: () => changeLocale("cs"),
    },
    {
      id: "language-es",
      groupId: "language",
      label: actionCopy.language.options.es.label,
      description: actionCopy.language.options.es.description,
      target: actionCopy.language.options.es.target,
      run: () => changeLocale("es"),
    },
    {
      id: "language-de",
      groupId: "language",
      label: actionCopy.language.options.de.label,
      description: actionCopy.language.options.de.description,
      target: actionCopy.language.options.de.target,
      run: () => changeLocale("de"),
    },
  ];

  const paletteActionMap = useMemo(
    () => new Map(paletteActions.map((action) => [action.id, action] as const)),
    [paletteActions],
  );

  const recentPaletteActions = useMemo(
    () =>
      paletteRecents
        .map((id) => paletteActionMap.get(id))
        .filter((value): value is CommandPaletteAction => Boolean(value)),
    [paletteActionMap, paletteRecents],
  );

  const paletteSearchResults = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return paletteActions;
    return paletteActions
      .map((action) => ({ action, score: scorePaletteAction(action, query) }))
      .filter((item) => item.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number))
      .map((item) => item.action);
  }, [paletteActions, paletteQuery, scorePaletteAction]);

  const paletteSections = useMemo<CommandPaletteSection[]>(() => {
    const order = ["recents", "workspace", "toggles", "focus", "drafts", "diagnostics", "vault", "exports", "themes", "language", "palette"];
    const grouped = new Map<string, CommandPaletteAction[]>();
    const query = paletteQuery.trim();
    const add = (groupId: string, action: CommandPaletteAction) => {
      const key = groupId || "palette";
      const bucket = grouped.get(key) ?? [];
      bucket.push(action);
      grouped.set(key, bucket);
    };
    const recentSet = new Set(recentPaletteActions.map((item) => item.id));
    if (!query && recentPaletteActions.length) {
      recentPaletteActions.forEach((action) => add("recents", action));
    }
    paletteSearchResults.forEach((action) => {
      if (!query && recentSet.has(action.id)) return;
      add(action.groupId ?? "palette", action);
    });

    return order
      .map((groupId) => {
        const items = grouped.get(groupId);
        if (!items || !items.length) return null;
        const title = paletteSectionLabels[groupId as keyof typeof paletteSectionLabels] ?? groupId;
        return { id: groupId, title, items };
      })
      .filter(Boolean) as CommandPaletteSection[];
  }, [paletteQuery, paletteSearchResults, paletteSectionLabels, recentPaletteActions]);

  const flattenedPaletteActions = useMemo(
    () => paletteSections.flatMap((section) => section.items),
    [paletteSections],
  );

  const safePaletteIndex = flattenedPaletteActions.length
    ? Math.min(paletteIndex, flattenedPaletteActions.length - 1)
    : 0;

  useEffect(() => {
    setPaletteIndex(0);
  }, [paletteQuery]);
  const baseHotkeySections: HotkeyOverlaySection[] = useMemo(
    () =>
      messages.hotkeys.sections.map((section) => ({
        id: section.id,
        title: section.title,
        scope: section.scope,
        items: section.items.map((item) => ({
          ...item,
          action: item.action ?? item.label,
        })),
      })),
    [messages.hotkeys.sections],
  );

  const paletteHotkeySection: HotkeyOverlaySection = useMemo(
    () => ({
      id: "palette-actions",
      title: messages.hotkeys.paletteSectionTitle,
      scope: "palette",
      items: paletteActions.map((action) => ({
        shortcut: action.shortcut ?? "—",
        action: action.label,
        description: action.description,
        target: (action.target as HotkeyTarget | undefined) ?? undefined,
      })),
    }),
    [messages.hotkeys.paletteSectionTitle, paletteActions],
  );

  const allHotkeySections = useMemo(
    () => [...baseHotkeySections, paletteHotkeySection],
    [baseHotkeySections, paletteHotkeySection],
  );

  const hotkeyGroups = useMemo<HotkeyOverlayGroup[]>(() => {
    const grouped = new Map<HotkeyScope, HotkeyOverlaySection[]>();
    allHotkeySections.forEach((section) => {
      const scope = section.scope ?? "global";
      const current = grouped.get(scope) ?? [];
      current.push(section);
      grouped.set(scope, current);
    });
    const scopesOrder: HotkeyScope[] = ["global", "palette", "studio", "ao", "data", "preview"];
    const activeScope = workspace as HotkeyScope;
    const shouldInclude = (scope: HotkeyScope) =>
      hotkeyScopeFilter === "all" || scope === "global" || scope === "palette" || scope === activeScope;

    return scopesOrder
      .filter((scope) => shouldInclude(scope) && (grouped.get(scope)?.length ?? 0) > 0)
      .map((scope) => ({
        id: scope,
        title: messages.hotkeys.scopes[scope],
        scope,
        sections: grouped.get(scope) ?? [],
      }));
  }, [allHotkeySections, hotkeyScopeFilter, messages.hotkeys.scopes, workspace]);

  const handleHotkeyHighlight = useCallback((target: HotkeyTarget | null) => {
    setHotkeyActiveTarget(target);
  }, []);

  const applyHotkeyHighlight = useCallback(
    (target: HotkeyTarget | null) => {
      if (typeof document === "undefined") return;
      const nodes = document.querySelectorAll<HTMLElement>("[data-hotkey-area]");
      nodes.forEach((node) => {
        const areas = (node.getAttribute("data-hotkey-area") ?? "")
          .split(/\s+/)
          .filter(Boolean);
        const matches = hotkeyLearnMode && target ? areas.includes(target) : false;
        node.classList.toggle("hotkey-learn-highlight", matches);
      });
    },
    [hotkeyLearnMode],
  );

  useEffect(() => {
    applyHotkeyHighlight(hotkeyLearnMode ? hotkeyActiveTarget : null);
  }, [applyHotkeyHighlight, hotkeyActiveTarget, hotkeyLearnMode]);

  useEffect(() => () => applyHotkeyHighlight(null), [applyHotkeyHighlight]);

  const toggleHotkeyPrintable = useCallback(() => {
    setHotkeyPrintable((current) => {
      const next = !current;
      if (!current && typeof window !== "undefined") {
        window.setTimeout(() => window.print(), 30);
      }
      return next;
    });
  }, []);

  const toggleHotkeyLearnMode = useCallback(() => {
    setHotkeyLearnMode((current) => {
      const next = !current;
      if (!next) {
        setHotkeyActiveTarget(null);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      const isPaletteShortcut = key === "k" && (event.metaKey || event.ctrlKey);
      const isAltShortcut = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey;
      const isAltShiftShortcut = event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey;
      const isHotkeyShortcut =
        (event.shiftKey && key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) || key === "?";
      const isUndoShortcut = key === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      const isRedoShortcut = key === "z" && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
      const isDuplicateDraftShortcut = key === "d" && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
      const target = event.target as HTMLElement | null;
      const targetIsForm =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable ||
        target?.getAttribute("role") === "textbox";

      if ((isUndoShortcut || isRedoShortcut) && !targetIsForm) {
        event.preventDefault();
        if (isUndoShortcut) {
          handleUndo();
        } else {
          handleRedo();
        }
        return;
      }

      if (isDuplicateDraftShortcut && !targetIsForm) {
        event.preventDefault();
        void handleDuplicateDraft();
        return;
      }

      if (isPaletteShortcut) {
        event.preventDefault();
        setHotkeyOverlayOpen(false);
        togglePalette();
        return;
      }

      if (isHotkeyShortcut) {
        event.preventDefault();
        toggleHotkeyOverlay();
        return;
      }

      if (hotkeyOverlayOpen && key === "escape") {
        event.preventDefault();
        closeHotkeyOverlay();
        return;
      }

      if (isAltShiftShortcut) {
        if (key === "w") {
          event.preventDefault();
          focusWizardStep("wallet");
          return;
        }
        if (key === "m") {
          event.preventDefault();
          focusWizardStep("module");
          return;
        }
        if (key === "p") {
          event.preventDefault();
          focusWizardStep("spawn");
          return;
        }
        if (key === "v") {
          event.preventDefault();
          focusVaultField("password");
          return;
        }
        if (key === "f") {
          event.preventDefault();
          focusVaultField("filter");
          return;
        }
        if (key === "h") {
          event.preventDefault();
          focusHealthThreshold("failure");
          return;
        }
        if (key === "l") {
          event.preventDefault();
          focusHealthThreshold("latency");
          return;
        }
      }

      if (isAltShortcut && key === "n") {
        event.preventDefault();
        const duplicateAction = actionCopy.drafts.duplicate;
        void runPaletteAction({
          id: "duplicate-draft",
          label: duplicateAction.label,
          description: duplicateAction.description,
          shortcut: duplicateAction.shortcut,
          run: () => void handleDuplicateDraft(),
        });
        return;
      }

      if (isAltShortcut && key === "x") {
        event.preventDefault();
        const highFx = actionCopy.toggles.highEffects;
        void runPaletteAction({
          id: "toggle-high-effects",
          label: highEffects ? highFx.labelOn : highFx.labelOff,
          description: prefersReducedMotion ? highFx.description.blocked : highFx.description.default,
          shortcut: highFx.shortcut,
          run: () => {
            if (prefersReducedMotion) {
              setHighEffects(false);
              flashStatus(highFx.description.blocked);
              return;
            }
            setHighEffects((current) => !current);
          },
        });
        return;
      }

      if (isAltShortcut && ["1", "2", "3", "4"].includes(key)) {
        event.preventDefault();
        const target: Workspace =
          key === "1" ? "studio" : key === "2" ? "ao" : key === "3" ? "data" : "preview";
        const workspaceAction = actionCopy.workspace[target as keyof typeof actionCopy.workspace];
        void runPaletteAction(
          paletteActions.find((action) => action.id === `workspace-${target}`) ?? {
            id: `workspace-${target}`,
            label: workspaceAction.label,
            description: workspaceAction.description,
            run: () => switchWorkspace(target),
          },
        );
        return;
      }

      if (isAltShortcut && key === "h") {
        event.preventDefault();
        const healthAction = actionCopy.toggles.health;
        void runPaletteAction({
          id: "toggle-health",
          label: healthExpanded ? healthAction.labelOpen : healthAction.labelClosed,
          description: healthAction.description,
          shortcut: healthAction.shortcut,
          run: () => setHealthExpanded((open) => !open),
        });
        return;
      }

      if (isAltShortcut && key === "c") {
        event.preventDefault();
        const themeAction = actionCopy.toggles.theme;
        void runPaletteAction({
          id: "toggle-theme",
          label: themeAction.label,
          description: t("actions.toggles.theme.nextLabel", {
            theme: nextThemePreset?.label ?? getThemeLabel(DEFAULT_THEME),
          }),
          shortcut: themeAction.shortcut,
          run: toggleTheme,
        });
        return;
      }

      if (isAltShortcut && key === "o") {
        event.preventDefault();
        const offlineAction = actionCopy.toggles.offline;
        void runPaletteAction({
          id: "toggle-offline",
          label: offlineMode ? offlineAction.labelOn : offlineAction.labelOff,
          description: offlineMode ? offlineAction.description.on : offlineAction.description.off,
          shortcut: offlineAction.shortcut,
          run: () => setOfflineMode((current) => !current),
        });
        return;
      }

      if (isAltShortcut && (key === "arrowup" || key === "arrowdown")) {
        if (targetIsForm) return;
        event.preventDefault();
        handleKeyboardMove(key === "arrowup" ? "up" : "down");
        return;
      }

      if (isAltShortcut && (key === "arrowleft" || key === "arrowright")) {
        if (targetIsForm) return;
        event.preventDefault();
        handleKeyboardStack(key === "arrowright" ? "in" : "out");
        return;
      }

      if (!paletteOpen) return;

      if (key === "escape") {
        event.preventDefault();
        closePalette();
        return;
      }

      if (key === "arrowdown") {
        event.preventDefault();
        setPaletteIndex((current) => {
          if (!flattenedPaletteActions.length) return 0;
          return (current + 1) % flattenedPaletteActions.length;
        });
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        setPaletteIndex((current) => {
          if (!flattenedPaletteActions.length) return 0;
          return (current - 1 + flattenedPaletteActions.length) % flattenedPaletteActions.length;
        });
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        const action = flattenedPaletteActions[safePaletteIndex];
        if (action) {
          void runPaletteAction(action);
        }
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [
    closePalette,
    handleDuplicateDraft,
    healthExpanded,
    paletteOpen,
    hotkeyOverlayOpen,
    runPaletteAction,
    safePaletteIndex,
    togglePalette,
    closeHotkeyOverlay,
    toggleHotkeyOverlay,
    toggleTheme,
    actionCopy,
    flashStatus,
    highEffects,
    prefersReducedMotion,
    nextThemePreset,
    t,
    offlineMode,
    flattenedPaletteActions,
    paletteActions,
    handleUndo,
    handleRedo,
    focusWizardStep,
    focusVaultField,
    focusHealthThreshold,
    handleKeyboardMove,
    handleKeyboardStack,
  ]);

  useEffect(() => {
    if (!whatsNewOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setWhatsNewOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [whatsNewOpen]);

  useFocusTrap(whatsNewDialogRef, {
    active: whatsNewOpen,
    initialFocus: whatsNewCloseRef.current,
    onEscape: () => setWhatsNewOpen(false),
  });

  useFocusTrap(vaultModeDialogRef, {
    active: Boolean(pipVaultModeConfirm),
    initialFocus: vaultModeCancelRef.current,
    onEscape: handleCancelVaultModeConfirm,
  });

  useFocusTrap(vaultWizardDialogRef, {
    active: vaultWizardOpen,
    initialFocus: vaultWizardCloseRef.current ?? vaultWizardDialogRef.current,
    onEscape: closeVaultBackupWizard,
  });

  useEffect(() => {
    if (workspace === "ao") {
      prefetchAoLogPanel();
      void loadAoDeployModule();
    }
    if (workspace === "preview") {
      prefetchAoHolomap();
      prefetchManifestRenderer();
    }
    if (workspace === "studio") {
      prefetchManifestRenderer();
    }
  }, [workspace]);

  const handleSkipToContent = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const target = mainContentRef.current;
    if (target) {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
  }, [prefersReducedMotion]);

  const hasHealthAlert =
    !offlineMode && healthSummary.failing.some((item) => item.status !== "offline");
  const hologridActive = hologridEnabled && highEffects && !prefersReducedMotion;
  const hologridControlsDisabled = prefersReducedMotion || !highEffects;
  const previewHologramActive = neonThemes.includes(theme) && highEffects && workspace === "preview";
  const hologramActive = previewHologramActive && !prefersReducedMotion;
  const holomapEnabled = workspace === "preview" && highEffects && !prefersReducedMotion;
  const showCyberPreviews = highEffects && !prefersReducedMotion;
  const deployStatusLabel =
    deployState === "pending"
      ? "Deploying"
      : deployState === "success"
        ? "Deploy ready"
        : deployState === "error"
          ? "Deploy error"
          : "Deploy idle";
  const spawnStatusLabel =
    spawnState === "pending"
      ? "Spawning"
      : spawnState === "success"
        ? "Spawn ready"
        : spawnState === "error"
          ? "Spawn error"
          : "Spawn idle";
  const deployLiveLabel = deployOutcome || deployStep || deployStatusLabel;
  const spawnLiveLabel = spawnOutcome || spawnStep || spawnStatusLabel;
  useEffect(() => {
    if (!showCyberPreviews) return;
    let cancelled = false;
    loadCyberBlockPreview().then((mod) => {
      if (!cancelled) {
        setCyberPreviewComponent(() => mod.default);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [showCyberPreviews]);

  useEffect(() => {
    if (!highEffects || prefersReducedMotion) return;
    let cancelled = false;
    let ctx: { revert?: () => void } | null = null;
    const hoverCleanups: Array<() => void> = [];

    const run = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        const cards = gsap.utils.toArray<HTMLElement>(
          ".catalog-item, .preview-card, .tree-card, .quick-card, .manifest-preview-card",
        );
        cards.forEach((card, index) => {
          ScrollTrigger.create({
            trigger: card,
            start: "top 85%",
            once: true,
            onEnter: () => {
              gsap.fromTo(
                card,
                { opacity: 0, y: 18, rotateX: -4, scale: 0.985 },
                {
                  opacity: 1,
                  y: 0,
                  rotateX: 0,
                  scale: 1,
                  duration: 0.6,
                  ease: "power2.out",
                  delay: Math.min(index * 0.04, 0.3),
                },
              );
            },
          });
        });

        const hoverTargets = gsap.utils.toArray<HTMLElement>(".catalog-item, .preview-card, .quick-card");
        hoverTargets.forEach((card) => {
          const enter = () =>
            gsap.to(card, {
              "--tilt-x": "-1.6deg",
              "--tilt-y": "1deg",
              "--lift": "-4px",
              duration: 0.35,
              ease: "power2.out",
            });
          const leave = () =>
            gsap.to(card, {
              "--tilt-x": "0deg",
              "--tilt-y": "0deg",
              "--lift": "0px",
              duration: 0.5,
              ease: "power3.out",
            });
          card.addEventListener("pointerenter", enter, { passive: true });
          card.addEventListener("focus", enter);
          card.addEventListener("pointerleave", leave);
          card.addEventListener("blur", leave);
          hoverCleanups.push(() => {
            card.removeEventListener("pointerenter", enter);
            card.removeEventListener("focus", enter);
            card.removeEventListener("pointerleave", leave);
            card.removeEventListener("blur", leave);
          });
        });

        ScrollTrigger.refresh();
      }, mainContentRef);
    };

    void run();

    return () => {
      cancelled = true;
      hoverCleanups.forEach((cleanup) => cleanup());
      ctx?.revert?.();
    };
  }, [highEffects, prefersReducedMotion, theme, workspace, visibleCatalog.length, totalNodes]);

  const renderBlockPreview = (type: string, variant: "card" | "compact" = "card") => {
    const PreviewComponent = cyberPreviewComponent;
    if (!showCyberPreviews || !PreviewComponent) {
      return <BlockPlaceholder type={type} />;
    }

    return (
      <PreviewComponent
        shape={blockShapeForType(type)}
        theme={theme}
        highEffects={highEffects}
        reducedMotion={prefersReducedMotion}
        variant={variant}
      />
    );
  };

  return (
    <I18nContext.Provider value={{ locale, messages, t, setLocale }}>
      <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={handleSkipToContent}>
        {messages.app.skipToContent}
      </a>
      <Suspense fallback={null}>
        <HeroCanvas
          theme={theme}
          highEffects={highEffects}
          hologridEnabled={hologridEnabled}
          hologridSpeed={hologridSpeed}
          hologridOpacity={hologridOpacity}
          reducedMotion={prefersReducedMotion}
        />
      </Suspense>
      <header className={`top-bar ${catalogDragging ? "dragging-block" : ""}`}>
        <div className="brand-area" data-hotkey-area="palette language">
          <div className="brand">
            <div className="brand-dot" />
            <div>
              <p className="eyebrow">{messages.app.brandEyebrow}</p>
              <input
                className="title-input"
                value={manifest.name}
                onChange={(e) => handleManifestName(e.target.value)}
                aria-label="Manifest name"
                data-testid="manifest-name-input"
              />
            </div>
          </div>
          <div
            className="theme-picker"
            title={messages.app.controls.theme}
            data-hotkey-area="theme"
            role="group"
            aria-labelledby="theme-picker-label"
            aria-describedby="theme-picker-desc"
          >
            <div className="theme-picker-head">
              <span className="eyebrow" id="theme-picker-label">
                Theme
              </span>
              <span className="theme-picker-current" aria-live="polite">
                {getThemeLabel(theme)}
              </span>
            </div>
            <div className="theme-select">
              <span className="theme-swatch" aria-hidden />
              <select
                id="theme-select"
                value={theme}
                onChange={(e) => setTheme(resolveTheme(e.target.value))}
                aria-label={messages.app.controls.theme}
                aria-describedby="theme-picker-desc"
              >
                {themePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="sr-only" id="theme-picker-desc">
              Choose a color theme for the app interface.
            </p>
          </div>
          <label
            className={`toggle effects-toggle ${prefersReducedMotion ? "disabled" : ""}`}
            title={
              prefersReducedMotion
                ? "Disabled to respect your reduced-motion preference."
                : "Toggle high visual effects (WebGL grid, holograms, cursor FX)."
            }
            data-hotkey-area="effects"
          >
            <input
              type="checkbox"
              checked={highEffects}
              onChange={(e) => setHighEffects(e.target.checked)}
              disabled={prefersReducedMotion}
              aria-label={messages.app.controls.effects}
            />
            <span>{highEffects ? "FX on" : "FX off"}</span>
          </label>
          <div className="fx-badge-slot" aria-hidden>
            <FxBadge active={highEffects && !prefersReducedMotion} reducedMotion={prefersReducedMotion} />
          </div>
          <div
            className={`hologrid-controls ${hologridControlsDisabled ? "disabled" : ""}`}
            title={
              prefersReducedMotion
                ? "Disabled to respect your reduced-motion preference."
                : !highEffects
                  ? "Turn FX on to enable the hologrid."
                  : "Toggle and tune the hologrid grid animation."
            }
            data-hotkey-area="effects"
          >
            <div className="hologrid-controls-head">
              <div>
                <p className="eyebrow">Hologrid</p>
                <span className="hologrid-subtitle">{hologridActive ? "Animating" : "Disabled"}</span>
              </div>
              <label className="toggle hologrid-toggle">
                <input
                  type="checkbox"
                  checked={hologridEnabled}
                  onChange={(e) => setHologridEnabled(e.target.checked)}
                  disabled={hologridControlsDisabled}
                  aria-label="Toggle hologrid animation"
                />
                <span>{hologridEnabled ? "On" : "Off"}</span>
              </label>
            </div>
            <div className="hologrid-sliders">
              <label>
                <span>Speed</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={hologridSpeed}
                  onChange={(e) => setHologridSpeed(clampHologridSpeed(Number(e.target.value)))}
                  disabled={hologridControlsDisabled || !hologridEnabled}
                  aria-label="Hologrid speed"
                />
                <span className="holo-slider-value mono">{hologridSpeed.toFixed(2)}x</span>
              </label>
              <label>
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={hologridOpacity}
                  onChange={(e) => setHologridOpacity(clampHologridOpacity(Number(e.target.value)))}
                  disabled={hologridControlsDisabled || !hologridEnabled}
                  aria-label="Hologrid opacity"
                />
                <span className="holo-slider-value mono">{Math.round(hologridOpacity * 100)}%</span>
              </label>
            </div>
          </div>
          <label
            className={`toggle cursor-trail-toggle ${prefersReducedMotion ? "disabled" : ""} ${offlineMode || !highEffects ? "paused" : ""}`}
            title={
              cursorTrailBlockedReason === "reduced motion"
                ? "Disabled to respect your reduced-motion preference."
                : cursorTrailBlockedReason === "offline mode"
                  ? "Paused while offline / air-gap mode is enabled."
                  : cursorTrailBlockedReason === "effects off"
                    ? "High effects are turned off, so the trail is paused."
                  : "Toggle the neon cursor trail."
            }
          >
            <input
              type="checkbox"
              checked={cursorTrailPref && !prefersReducedMotion}
              onChange={(e) => setCursorTrailPref(e.target.checked)}
              disabled={prefersReducedMotion}
              aria-label={messages.app.controls.cursorTrail}
            />
            <span>{cursorTrailLabel}</span>
          </label>
          <label className="toggle offline-toggle" title="Offline / air-gap mode blocks renderer network requests" data-hotkey-area="offline">
            <input
              type="checkbox"
              checked={offlineMode}
              onChange={(e) => setOfflineMode(e.target.checked)}
              aria-label={messages.app.controls.offline}
            />
            <span>{offlineMode ? "Offline" : "Online"}</span>
          </label>
          <button
            className="ghost small whats-new-button"
            type="button"
            onClick={() => setWhatsNewOpen(true)}
            aria-label={messages.app.controls.whatsNew}
            title={messages.app.controls.whatsNew}
          >
            What&rsquo;s new
          </button>
          <button
            className="ghost small hotkey-help-button"
            type="button"
            onClick={toggleHotkeyOverlay}
            aria-label={messages.hotkeys.title}
            title={messages.hotkeys.title}
            data-hotkey-area="palette"
            data-testid="hotkey-help-button"
          >
            ?
          </button>
        </div>
        <nav className="workspace-nav" data-hotkey-area="workspaces" aria-label={messages.app.controls.workspaceNav}>
          {[
            { id: "studio", label: "Creator Studio" },
            { id: "ao", label: "AO Console" },
            { id: "data", label: "Data Core" },
            { id: "preview", label: "Preview Hub" },
          ].map((item) => (
            <button
              key={item.id}
              className={`chip ${workspace === (item.id as Workspace) ? "active" : ""}`}
              aria-pressed={workspace === (item.id as Workspace)}
              onClick={() => switchWorkspace(item.id as Workspace)}
              onMouseEnter={item.id === "ao" ? prefetchAoLogPanel : undefined}
              onFocus={item.id === "ao" ? prefetchAoLogPanel : undefined}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        {draftConflict ? (
          <div className="conflict-banner" role="alert">
            <div className="conflict-copy">
              <strong>Draft conflict</strong>
              <span>{draftConflict.latest ? `Updated ${formatDate(draftConflict.latest.updatedAt)}` : draftConflict.message}</span>
            </div>
            <div className="conflict-actions">
              <button className="ghost small" type="button" onClick={handleOpenConflictDiff}>
                Open diff
              </button>
              <button className="ghost small" type="button" onClick={() => void handleResolveConflict("reload")}>
                Reload latest
              </button>
              <button className="ghost small" type="button" onClick={() => void handleResolveConflict("force")}>
                Overwrite
              </button>
              <button className="ghost small" type="button" onClick={() => void handleResolveConflict("duplicate")}>
                Save copy
              </button>
            </div>
          </div>
        ) : null}
        <div className="top-actions">
          {workspace === "ao" && (
            <div
              ref={healthCardRef}
              className={`health-card ${healthExpanded ? "is-open" : "is-collapsed"}`}
              role="region"
              aria-labelledby="health-diagnostics-heading"
              aria-describedby="health-sla-caption health-sla-note"
              tabIndex={-1}
              data-hotkey-area="health"
            >
              <div className="health-header">
                <div>
                  <p className="eyebrow">Health</p>
                  <h4 id="health-diagnostics-heading">Diagnostics</h4>
                  <div className="health-sla" aria-live="polite">
                    <span className={`sla-pill ${healthSla.breached ? "breached" : "ok"}`}>
                      {healthSla.breached ? "SLA breach" : "SLA OK"}
                    </span>
                    <span className="health-sla-note" id="health-sla-note">
                      {healthSla.breached
                        ? healthSla.failureBreached
                          ? `Failures ${healthSla.failureStreak}/${slaFailureThreshold}`
                          : `Avg latency ${healthSla.averageLatency ?? "—"} ms > ${slaLatencyThresholdMs} ms`
                        : `Target: < ${slaFailureThreshold} failures • ≤ ${slaLatencyThresholdMs} ms avg`}
                    </span>
                  </div>
                  {latestHealthError && (latestHealthError.lastError || latestHealthError.detail) && (
                    <p className="health-last-error" aria-live="polite">
                      Last error • {latestHealthError.label} · {formatTimeShort(latestHealthError.checkedAt)} — {latestHealthError.lastError ?? latestHealthError.detail}
                    </p>
                  )}
                  <p id="health-sla-caption" className="sr-only">
                    Use Alt+Shift+H to focus the failure threshold and Alt+Shift+L to focus the latency threshold inputs.
                  </p>
                </div>
                <div className="health-actions">
                  <div className="health-auto-refresh">
                    <label htmlFor="health-auto-refresh">Auto</label>
                    <select
                      id="health-auto-refresh"
                      value={healthAutoRefresh}
                      onChange={(e) => setHealthAutoRefresh(e.target.value as HealthAutoRefresh)}
                      aria-label="Health ping interval"
                    >
                      <option value="off">Off</option>
                      <option value="10">10s</option>
                      <option value="30">30s</option>
                      <option value="60">60s</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      id="health-auto-refresh-custom"
                      type="number"
                      min={MIN_HEALTH_AUTO_REFRESH_SECONDS}
                      step={1}
                      value={healthAutoRefreshCustom}
                      onChange={(e) =>
                        setHealthAutoRefreshCustom(
                          Math.max(
                            MIN_HEALTH_AUTO_REFRESH_SECONDS,
                            Math.round(Number(e.target.value) || DEFAULT_HEALTH_AUTO_REFRESH_CUSTOM),
                          ),
                        )
                      }
                      aria-label="Custom ping interval (seconds)"
                      disabled={healthAutoRefresh !== "custom"}
                      className="health-auto-refresh-custom"
                    />
                  </div>
                  <button
                    className="ghost small"
                    onClick={handleCopyHealthStatus}
                    disabled={!healthStatusCopy}
                    title="Copy current health summary"
                  >
                    Copy status
                  </button>
                  <button
                    className="ghost small"
                    onClick={handleCopyLatestHealthError}
                    disabled={!latestHealthErrorMessage}
                    title="Copy last health error"
                  >
                    Copy last error
                  </button>
                  <button className="ghost small" onClick={refreshHealth} disabled={healthLoading}>
                    {healthLoading ? "Checking…" : "Refresh"}
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => setHealthExpanded((open) => !open)}
                    aria-expanded={healthExpanded}
                    aria-controls="health-panel"
                  >
                    {healthExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>
              {hasHealthAlert && health.length > 0 && (
                <div className="health-alert" role="alert">
                  <div className="health-alert-copy">
                    <span className={`status-dot ${healthSummary.overall}`} aria-hidden />
                    <div>
                      <strong>{healthSummary.error > 0 ? "Issues detected" : "Checks need attention"}</strong>
                      <span>{healthAlertCopy || "Some health checks are failing or missing."}</span>
                    </div>
                  </div>
                  <button className="ghost small" onClick={refreshHealth} disabled={healthLoading}>
                    {healthLoading ? "Checking…" : "Retry"}
                  </button>
                </div>
              )}
              {!healthExpanded && (
                <div className="health-summary" aria-hidden>
                  {health.length === 0 ? (
                    <span className="health-summary-empty">Run checks to see status</span>
                  ) : (
                    <>
                      <div className="health-summary-pills">
                        {health.map((item) => (
                          <span key={item.id} className={`summary-pill ${item.status}`}>
                            <span className={`status-dot ${item.status}`} aria-hidden /> {item.label}
                            <span className="summary-status">{healthStatusLabel(item.status)}</span>
                          </span>
                        ))}
                      </div>
                      <div className="health-summary-recap">{formatHealthRecap(health)}</div>
                      {healthLatencyAverages.length ? (
                        <div className="health-summary-note">
                          <strong>Avg latency</strong>
                          {healthLatencyAverages.map((item) => (
                            <span key={item.id} className="mono">
                              {item.label}: {item.value} ms
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
              <div className="health-collapse" id="health-panel" aria-hidden={!healthExpanded}>
                <div className="health-config">
                  <div className="health-config-head">
                    <div>
                      <p className="eyebrow">SLA</p>
                      <h5>Controls</h5>
                    </div>
                    <label className="health-notify-toggle">
                      <input
                        type="checkbox"
                        checked={healthNotifyEnabled}
                        onChange={(e) => setHealthNotifyEnabled(e.target.checked)}
                      />
                      <span>Desktop notification on breach</span>
                    </label>
                  </div>
                  <div className="health-config-grid">
                    <label className="health-input">
                      <span className="label-with-help">
                        Fail streak
                        <HelpTip copy="How many consecutive failed checks trigger an SLA breach notification." />
                      </span>
                      <input
                        id="health-failure-threshold"
                        type="number"
                        min={1}
                        value={slaFailureThreshold}
                        onChange={(e) => setSlaFailureThreshold(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        aria-label="Failure streak threshold"
                        aria-describedby="health-failure-help"
                        ref={healthFailureInputRef}
                      />
                    </label>
                    <label className="health-input">
                      <span className="label-with-help">
                        Avg latency (ms)
                        <HelpTip copy="Average latency ceiling for recent checks. Breach when the rolling average exceeds this value." />
                      </span>
                      <input
                        id="health-latency-threshold"
                        type="number"
                        min={50}
                        step={50}
                        value={slaLatencyThresholdMs}
                        onChange={(e) =>
                          setSlaLatencyThresholdMs(
                            Math.max(50, Math.round(Number(e.target.value) || DEFAULT_SLA_LATENCY_THRESHOLD_MS)),
                          )
                        }
                        aria-label="Average latency threshold (ms)"
                        aria-describedby="health-latency-help"
                        ref={healthLatencyInputRef}
                      />
                    </label>
                  </div>
                  <p id="health-failure-help" className="sr-only">
                    Consecutive failed checks needed before an SLA breach is reported. Press Alt+Shift+H to focus this field.
                  </p>
                  <p id="health-latency-help" className="sr-only">
                    Average latency threshold in milliseconds. Press Alt+Shift+L to focus this field.
                  </p>
                  {healthSparkline && (
                    <div className="health-sparkline" aria-label="Latency trend sparkline">
                      <svg
                        viewBox={`0 0 ${healthSparkline.width} ${healthSparkline.height}`}
                        width="100%"
                        height={healthSparkline.height}
                        role="presentation"
                      >
                        <path d={healthSparkline.path} className="sparkline-path" />
                        {healthSparkline.showLatencyLine && (
                          <line
                            x1={0}
                            x2={healthSparkline.width}
                            y1={healthSparkline.latencyLine}
                            y2={healthSparkline.latencyLine}
                            className="sparkline-threshold"
                          />
                        )}
                        {healthSparkline.points.map((point, idx) => (
                          <circle
                            key={`${point.x}-${idx}`}
                            cx={point.x}
                            cy={point.y}
                            r={idx === healthSparkline.points.length - 1 ? 2.6 : 1.8}
                            className="sparkline-dot"
                          />
                        ))}
                      </svg>
                      <div className="health-sparkline-meta">
                        <span className="mono">Last {healthSparkline.latest} ms</span>
                        <span className="mono subtle">
                          min {healthSparkline.min} • max {healthSparkline.max}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="health-events">
                  <div className="health-events-head">
                    <div>
                      <p className="eyebrow">Recent checks</p>
                      <h5>Alert log</h5>
                    </div>
                    <div className="health-events-actions">
                      <span className={`sla-pill ${healthSla.breached ? "breached" : "ok"}`}>
                        {healthSla.breached ? "SLA breach" : "SLA OK"}
                      </span>
                      <div className="health-export-buttons">
                        <button className="ghost small" onClick={() => void handleExportHealthHistory("json")}>
                          Export JSON
                        </button>
                        <button className="ghost small" onClick={() => void handleExportHealthHistory("csv")}>
                          Export CSV
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="health-events-list">
                    {healthEventLog.length === 0 ? (
                      <p className="health-empty">No history yet</p>
                    ) : (
                      healthEventLog.map((event) => {
                        const failing = event.summary?.failing ?? [];
                        const note = failing.length
                          ? `${failing.map((item) => item.label).join(", ")}${
                              failing[0]?.detail || failing[0]?.lastError ? ` — ${failing[0]?.detail ?? failing[0]?.lastError}` : ""
                            }`
                          : event.summary.warn > 0
                            ? "Warnings present"
                            : "All systems healthy";

                        return (
                          <div key={event.id} className={`health-event ${event.overall}`}>
                            <div className="health-event-meta">
                              <span className={`status-dot ${event.overall}`} aria-hidden />
                              <div className="health-event-times">
                                <strong>{formatTimeShort(event.recordedAt)}</strong>
                                <span className="subtle">{new Date(event.recordedAt).toLocaleDateString()}</span>
                              </div>
                              <span className={`health-status ${event.overall}`}>
                                {healthStatusLabel(event.overall as HealthStatus["status"])}
                              </span>
                            </div>
                            <div className="health-event-body">
                              <span className="health-event-note">{note}</span>
                              <div className="health-event-metrics">
                                {typeof event.averageLatencyMs === "number" && (
                                  <span className="mono">{event.averageLatencyMs} ms avg</span>
                                )}
                                <span className="mono subtle">
                                  {event.ok} ok • {event.warn} warn • {event.error + event.missing} fail
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="health-events health-vault-status">
                  <div className="health-events-head">
                    <div>
                      <p className="eyebrow">Vault</p>
                      <h5>Latest vault status</h5>
                    </div>
                    <span className={`pill ${pipVaultLocked ? "warn" : "ghost"}`}>
                      {pipVaultLocked ? "Locked" : "Unlocked"}
                    </span>
                  </div>
                  {lastVaultError ? (
                    <div className="health-last-error">
                      <strong>Last vault error · {formatTimeShort(lastVaultError.at)}</strong>
                      <p>{lastVaultError.message}</p>
                      <button className="ghost small" type="button" onClick={() => setLastVaultError(null)}>
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <p className="health-empty">No vault errors recorded</p>
                  )}
                </div>
                <div className="health-list">
                  {health.length === 0 ? (
                    <p className="health-empty">No checks yet</p>
                  ) : (
                    health.map((item) => {
                      const averageLatency = averageLatencyMs(item);

                      return (
                        <div key={item.id} className={`health-row ${item.status}`}>
                          <span className={`status-dot ${item.status}`} aria-hidden />
                          <div className="health-row-content">
                            <div className="health-row-top">
                              <span className="health-label">{item.label}</span>
                              <span className={`health-status ${item.status}`}>{healthStatusLabel(item.status)}</span>
                            </div>
                            <div className="health-detail">
                              {item.detail ?? (item.status === "missing" ? "Not configured" : "No detail")}
                            </div>
                            {item.lastError && <div className="health-last-error">Last error: {item.lastError}</div>}
                            {item.latencyHistory?.length ? (
                              <div className="health-latency">
                                <div className="health-latency-bars">
                                  {item.latencyHistory.map((value, idx, arr) => {
                                    const max = Math.max(...arr, 1);
                                    const height = Math.max(12, Math.min(64, Math.round((value / max) * 64)));
                                    return (
                                      <span
                                        key={`${item.id}-lat-${idx}`}
                                        style={{ height: `${height}px` }}
                                        title={`${value} ms`}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="health-latency-meta">
                                  <span className="mono">{item.latencyHistory[item.latencyHistory.length - 1]} ms</span>
                                  {averageLatency != null && (
                                    <span className="mono subtle">avg {averageLatency} ms</span>
                                  )}
                                </div>
                              </div>
                            ) : averageLatency != null ? (
                              <div className="health-latency-meta">
                                <span className="mono subtle">avg {averageLatency} ms</span>
                              </div>
                            ) : null}
                            <div className="health-meta">
                              {typeof item.latencyMs === "number" && <span>{item.latencyMs} ms</span>}
                              {averageLatency != null && !item.latencyHistory?.length && (
                                <span className="mono subtle">avg {averageLatency} ms</span>
                              )}
                              <span>
                                {item.lastSuccessAt
                                  ? `Last success ${formatTime(item.lastSuccessAt)}`
                                  : item.status === "missing"
                                    ? "Set env to enable"
                                    : `Checked ${formatTime(item.checkedAt)}`}
                              </span>
                              {item.url && <span className="health-url">{formatHost(item.url)}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          {workspace === "studio" && (
            <div className="top-buttons hud-bar" data-hotkey-area="drafts">
              <button className="ghost icon-lead" data-icon="↺" onClick={handleUndo} disabled={!canUndo} title="Cmd/Ctrl+Z">
                Undo
              </button>
              <button className="ghost icon-lead" data-icon="↻" onClick={handleRedo} disabled={!canRedo} title="Shift+Cmd/Ctrl+Z">
                Redo
              </button>
              <select
                className="draft-select"
                value={activeDraftId ?? ""}
                onChange={(e) => handleLoadDraft(e.target.value)}
                aria-label="Saved drafts"
              >
                <option value="">Scratch draft</option>
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id ?? ""}>
                    {draft.name} • {formatDate(draft.updatedAt)}
                  </option>
                ))}
              </select>
              {activeDraftId && (
                <button className="ghost icon-lead" data-icon="✕" onClick={() => handleDeleteDraft(activeDraftId)} title="Delete draft">
                  Remove
                </button>
              )}
              <div className="button-with-help">
                <button
                  className="ghost icon-lead"
                  data-icon="⇄"
                  data-testid="draft-diff-btn"
                  onClick={() => void openDraftDiffPanel()}
                  onMouseEnter={prefetchDraftDiffPanel}
                  onFocus={prefetchDraftDiffPanel}
                  aria-label="Open draft diff dialog"
                  aria-haspopup="dialog"
                  aria-expanded={draftDiffOpen}
                >
                  Draft diff
                </button>
                <HelpTip
                  copy="Open the draft diff panel to compare the current manifest against a saved draft and cherry-pick differences."
                  label="Manifest comparison help"
                />
              </div>
              <button
                className={`ghost icon-lead ${draftDiffDocked ? "accent" : ""}`}
                data-icon="☰"
                onClick={() => void openDraftDiffPanel(undefined, { dock: true })}
                onMouseEnter={prefetchDraftDiffPanel}
                onFocus={prefetchDraftDiffPanel}
                title="Dock diff sidebar"
              >
                Diff sidebar
              </button>
              <button className="ghost icon-lead" data-icon="↓" onClick={handleLoadPip} disabled={loadingManifest}>
                {loadingManifest ? "Loading manifest…" : "Load PIP"}
              </button>
              <button className="ghost icon-lead" data-icon="⚡" onClick={handleFetchPipFromWorker} disabled={loadingManifest}>
                {loadingManifest ? "…" : "Fetch PIP (worker)"}
              </button>
              <button className="ghost icon-lead" data-icon="⛃" onClick={handleLoadPipFromVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Load vault"}
              </button>
              <button className="ghost icon-lead" data-icon="✖" onClick={handleClearPipVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Delete vault"}
              </button>
              <button className="ghost icon-lead" data-icon="＋" onClick={() => startNewDraft("New draft started")}>
                New draft
              </button>
              <button className="ghost icon-lead" data-icon="⇪" onClick={handleImportDrafts}>
                Import drafts
              </button>
              <button className="ghost icon-lead" data-icon="⇩" onClick={handleExportDrafts}>
                Export drafts
              </button>
              <button className="ghost icon-lead" data-icon="⤓" onClick={handleExportManifest}>
                Export manifest
              </button>
              <button
                className="ghost icon-lead"
                data-icon="⧉"
                onClick={handleDuplicateDraft}
                disabled={saving}
                title="Alt+N or Cmd/Ctrl+Shift+D"
              >
                Duplicate draft
              </button>
              <button className="ghost icon-lead" data-icon="🖫" onClick={handleSaveAs} disabled={saving}>
                Save as
              </button>
              <label className="autosave-tuner" title="Adjust autosave debounce">
                <span className="mono">Autosave</span>
                <select
                  value={autosavePreset}
                  onChange={(e) => {
                    const preset = e.target.value as AutosavePreset;
                    setAutosaveDelayMs(AUTOSAVE_PRESETS[preset] ?? DEFAULT_AUTOSAVE_MS);
                  }}
                >
                  <option value="fast">Fast · 0.8s</option>
                  <option value="balanced">Balanced · 1.2s</option>
                  <option value="relaxed">Relaxed · 2.4s</option>
                </select>
              </label>
              <span
                className={`pill autosave-pill ${autosaveTone}`}
                role="status"
                aria-live="polite"
                title={lastAutosaveAt ? formatDate(lastAutosaveAt) : undefined}
                data-testid="autosave-indicator"
              >
                <span className="autosave-icon" aria-hidden>
                  {autosaveInFlight ? (
                    <span className="autosave-spinner" />
                  ) : (
                    <span className={`autosave-dot ${autosaveTone}`} />
                  )}
                </span>
                <span className="autosave-text">
                  <span className="autosave-label">{autosaveStatusLabel}</span>
                  <span className="autosave-time">{autosaveStatusTime}</span>
                </span>
                {draftConflict ? (
                  <button className="autosave-link" type="button" onClick={handleOpenConflictDiff}>
                    Open diff
                  </button>
                ) : null}
              </span>
              <span
                className={`pill save-status ${draftConflict ? "conflict" : saving ? "busy" : isDirty ? "dirty" : "saved"}`}
                title={lastSavedAt ? `Last saved ${formatDate(lastSavedAt)}` : "This draft has not been saved yet"}
              >
                <span className="save-status-label">{saveStatusLabel}</span>
                <span className="save-status-time">{saveStatusTime}</span>
              </span>
              <button className="primary icon-lead" data-icon="💾" onClick={handleSaveDraft} disabled={saving}>
                {saving ? "Saving…" : "Save draft"}
              </button>
              {pipVaultStatus && (
                <span className="pill ghost pip-vault-pill" data-testid="vault-status-pill">
                  {pipVaultStatus}
                </span>
              )}
            </div>
          )}
          <section className="draft-history-panel" aria-label="Draft save history">
            <div className="draft-history-head">
              <div>
                <p className="eyebrow">Draft history</p>
                <h4>Save timeline</h4>
              </div>
              <div className="draft-history-head-actions">
                <span className="pill ghost">
                  {historyLoading
                    ? "Loading…"
                    : draftHistory.length
                      ? `${draftHistory.length} save${draftHistory.length === 1 ? "" : "s"}`
                      : "No saves yet"}
                </span>
                <button className="ghost small" type="button" onClick={handleSaveRestorePoint} disabled={saving}>
                  Save restore point
                </button>
                <button
                  className="ghost small"
                  type="button"
                  onClick={() => void openDraftDiffPanel()}
                  aria-label="Open revision diff dialog"
                  aria-haspopup="dialog"
                  aria-expanded={draftDiffOpen}
                >
                  Diff
                </button>
              </div>
            </div>
            {activeDraftId ? (
              draftHistory.length ? (
                <div className="draft-history-list">
                  {draftHistory.map((revision) => {
                    const isCurrent = revision.id === currentRevisionId;
                    return (
                      <article
                        key={revision.id}
                        className={`draft-history-item ${isCurrent ? "current" : ""}`}
                      >
                        <div className="draft-history-meta">
                          <span className={`history-marker ${revision.mode}`} aria-hidden />
                          <div className="draft-history-copy">
                            <strong>{formatDraftSaveMode(revision.mode)}</strong>
                            <span>{formatDate(revision.savedAt)}</span>
                          </div>
                        </div>
                        <div className="draft-history-actions">
                          <span className="pill ghost mono">{revision.name}</span>
                          {revision.tag === "restore-point" ? <span className="pill ghost">Restore point</span> : null}
                          {isCurrent ? (
                            <span className="pill accent">Current</span>
                          ) : (
                            <button
                              className="ghost small"
                              type="button"
                              onClick={() => handleRevertToRevision(revision)}
                              disabled={revertTargetId === revision.id}
                            >
                              {revertTargetId === revision.id ? "Reverting…" : "Revert"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="draft-history-empty">Autosaves and manual saves for this draft will appear here.</p>
              )
            ) : (
              <p className="draft-history-empty">Save or load a draft to build a reversible history.</p>
            )}
          </section>
        </div>
      </header>

      <main id="main-content" ref={mainContentRef} tabIndex={-1} role="main" data-hotkey-area="preview">
        <HotkeyOverlay
          open={hotkeyOverlayOpen}
          groups={hotkeyGroups}
          scopeFilter={hotkeyScopeFilter}
          printable={hotkeyPrintable}
          learnMode={hotkeyLearnMode}
          onScopeChange={setHotkeyScopeFilter}
          onTogglePrintable={toggleHotkeyPrintable}
          onToggleLearn={toggleHotkeyLearnMode}
          onHighlight={handleHotkeyHighlight}
          onClose={closeHotkeyOverlay}
          labels={{
            eyebrow: messages.hotkeys.eyebrow,
            title: messages.hotkeys.title,
            scopes: messages.hotkeys.scopes,
            tableHeaders: messages.hotkeys.tableHeaders,
            footer: messages.hotkeys.footer,
            close: messages.paletteUi.close,
            view: messages.hotkeys.view,
            formatCount: (count: number) => t("hotkeys.itemsLabel", { count }),
          }}
        />
      <ErrorBoundary name="PIP vault" variant="panel" onReset={resetVaultPanelBoundary}>
        <Vault
          ref={vaultRegionRef}
          className="panel pip-vault-panel"
          open={workspace === "data"}
          labelledBy="pip-vault-heading"
          describedBy="pip-vault-desc"
          data-hotkey-area="vault"
        >
          <div className="panel-header neon-hover-glow">
            <div>
              <p className="eyebrow">PIP vault</p>
              <div className="title-with-help">
                <h3 id="pip-vault-heading">Local vault panel</h3>
                <HelpTip
                  copy="Manage the encrypted local PIP vault: unlock it, back it up, and restore records safely."
                  label="Vault overview help"
                />
              </div>
              <p id="pip-vault-desc" className="sr-only">
                Vault section with snapshot, password controls, records, and issues. Use Alt+Shift+V to focus the password input and Alt+Shift+F to move to the records filter.
              </p>
            </div>
            <div className="pip-vault-header-actions">
              <Suspense fallback={<span className="pill ghost">Vault FX</span>}>
                <VaultCrystal state={vaultCrystalState} pulse={vaultCrystalPulse} />
              </Suspense>
              <span className={`pill ${pipVaultSnapshot?.exists ? "accent" : "ghost"}`}>
                {pipVaultSnapshot?.exists ? "Vault present" : "Vault empty"}
              </span>
              <span className={`pill ${pipVaultSnapshot?.mode === "password" ? "accent" : "ghost"}`}>
                {pipVaultSnapshot?.mode === "password"
                  ? pipVaultSnapshot.locked
                    ? "Password locked"
                    : "Password ready"
                  : pipVaultSnapshot?.mode === "plain"
                    ? "Local key"
                    : "Safe storage"}
              </span>
              <span className={`pill ${pipVaultLocked ? "issue" : "ghost"}`}>
                {pipVaultLocked ? "Locked" : "Unlocked"}
              </span>
              <span
                className={`pill ${pipVaultRememberUnlock ? (rememberedVaultPassword ? "accent" : "ghost") : "ghost"}`}
                data-testid="vault-remember-pill"
              >
                {rememberedUnlockCopy}
              </span>
              <span className="pill ghost">{vaultKdfLabel ? `KDF ${vaultKdfLabel}` : "KDF"}</span>
              <span className={`pill ${pipVaultAutoLockMinutes ? "ghost" : "warn"}`}>
                {pipVaultAutoLockMinutes
                  ? `Auto-lock ${pipVaultAutoLockMinutes}m${
                      pipVaultAutoLockRemainingMs != null ? ` (${formatCountdown(pipVaultAutoLockRemainingMs)})` : ""
                    }`
                  : "Auto-lock off"}
              </span>
              <span className="pill ghost">
                {pipVaultBlockingIssues.length ? `${pipVaultBlockingIssues.length} blocking issue${pipVaultBlockingIssues.length === 1 ? "" : "s"}` : "Ready to save"}
              </span>
            </div>
          </div>
        {pipVaultProgressNode}
        {pipVaultError && (
          <div className="pip-vault-alert" role="alert">
            <div className="pip-vault-alert-copy">
              <strong>Vault error</strong>
              <span>{pipVaultError}</span>
            </div>
            <button className="ghost small" onClick={() => setPipVaultError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="pip-vault-grid">
          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Snapshot</p>
                <h4>Vault metadata</h4>
              </div>
              <span className={`pill ${pipVaultSnapshot?.encrypted ? "accent" : "ghost"}`}>
                {pipVaultSnapshot?.encrypted ? "Encrypted" : "Unknown"}
              </span>
            </div>
            <dl className="pip-vault-list">
              <div>
                <dt>Path</dt>
                <dd className="mono">{pipVaultSnapshot?.path ?? "Loading..."}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{pipVaultSnapshot ? (pipVaultSnapshot.exists ? "Stored locally" : "No vault file") : "Inspecting..."}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{pipVaultSnapshot ? formatVaultMode(pipVaultSnapshot.mode) : "—"}</dd>
              </div>
              <div>
                <dt>Records</dt>
                <dd>{pipVaultSnapshot ? pipVaultSnapshot.recordCount : "—"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{pipVaultSnapshot?.updatedAt ? formatDate(pipVaultSnapshot.updatedAt) : "—"}</dd>
              </div>
              <div>
                <dt>Current PIP</dt>
                <dd>
                  {pip
                    ? `${normalizeText(pip.tenant ?? "") || "tenant?"} / ${normalizeText(pip.site ?? "") || "site?"}`
                    : "No PIP loaded"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Security</p>
                <div className="title-with-help">
                  <h4>Password & backups</h4>
                  <HelpTip
                    copy="Enable password mode to encrypt the vault and backups; use the same password when importing an encrypted bundle."
                    label="Vault security help"
                  />
                </div>
              </div>
              <span className={`pill ${pipVaultSnapshot?.mode === "password" ? "accent" : "ghost"}`}>
                {pipVaultSnapshot?.mode === "password" ? (pipVaultSnapshot.locked ? "Locked" : "Password") : "Keychain"}
              </span>
            </div>
            <div className="pip-vault-summary pip-vault-security-summary">
              <div>
                <span>Mode</span>
                <strong>{pipVaultSnapshot ? formatVaultMode(pipVaultSnapshot.mode) : "—"}</strong>
              </div>
              <div>
                <span>KDF</span>
                <strong className="mono" data-testid="vault-kdf-label">
                  {vaultKdfLabel}
                </strong>
                <span className="hint mono">{vaultKdfDetail}</span>
              </div>
              <div>
                <span>KDF preference</span>
                <strong className="mono" data-testid="vault-kdf-preference">
                  {kdfProfile.algorithm === "argon2id" ? "Argon2id" : "PBKDF2"}
                </strong>
                <span className="hint mono">
                  {kdfProfile.algorithm === "argon2id"
                    ? `${Math.round(kdfMemory / 1024)} MiB · t=${kdfIterations} · p=${kdfParallelism}`
                    : "PBKDF2 · 100k"}
                </span>
              </div>
              <div>
                <span>Salt</span>
                <strong className="mono">{pipVaultSnapshot?.salt ? `${pipVaultSnapshot.salt.slice(0, 10)}…` : "—"}</strong>
              </div>
              <div>
                <span>Lock</span>
                <strong>{pipVaultLocked ? "Locked" : "Unlocked"}</strong>
              </div>
              <div>
                <span>Last backup</span>
                <strong>{latestVaultAudit ? formatDate(latestVaultAudit.at) : "—"}</strong>
              </div>
              <div>
                <span>Checksum</span>
                <strong className="mono pip-vault-checksum" title={latestVaultAudit?.checksum ?? ""}>
                  {latestVaultAudit?.checksum ? `${latestVaultAudit.checksum.slice(0, 14)}…` : "—"}
                </strong>
              </div>
              <div>
                <span>Size</span>
                <strong className="mono">{formatBytes(latestVaultAudit?.bytes)}</strong>
              </div>
              <div>
                <span>Integrity</span>
                <strong className={vaultIntegrity?.failed ? "issue" : "mono"}>
                  {vaultIntegrity
                    ? vaultIntegrity.failed
                      ? `${vaultIntegrity.failed} issue${vaultIntegrity.failed === 1 ? "" : "s"}`
                      : "OK"
                    : "Not scanned"}
                </strong>
                {vaultIntegrity?.at ? <span className="hint mono">{formatTimeShort(vaultIntegrity.at)}</span> : null}
              </div>
              <div>
                <span>Auto-lock</span>
                <strong>{pipVaultAutoLockMinutes ? `${pipVaultAutoLockMinutes} min` : "Off"}</strong>
                {pipVaultAutoLockMinutes ? (
                  <span className="hint mono">
                    {pipVaultAutoLockRemainingMs != null ? `in ${formatCountdown(pipVaultAutoLockRemainingMs)}` : "Armed"}
                  </span>
                ) : null}
              </div>
              <div>
                <span>Hardware key</span>
                <strong>{pipVaultHardwarePlaceholder ? "Placeholder set" : "Not set"}</strong>
              </div>
            </div>
            <div className="pip-vault-password-row">
              <div className={`pip-vault-password-input ${pipVaultPasswordError ? "has-error" : ""}`}>
                <div className="pip-vault-input-wrap">
                  <input
                    ref={vaultPasswordRef}
                    type={pipVaultPasswordVisible ? "text" : "password"}
                    value={pipVaultPassword}
                    onChange={(e) => {
                      setPipVaultPassword(e.target.value);
                      if (pipVaultPasswordError) setPipVaultPasswordError(null);
                    }}
                    placeholder={pipVaultSnapshot?.mode === "password" ? "Enter vault password" : "Set a vault password"}
                    aria-label="Vault password"
                    aria-describedby="vault-password-help"
                  />
                  <button
                    type="button"
                    className="ghost small password-visibility-toggle"
                    onClick={() => setPipVaultPasswordVisible((visible) => !visible)}
                    aria-label={`${pipVaultPasswordVisible ? "Hide" : "Show"} vault password`}
                  >
                    {pipVaultPasswordVisible ? "Hide" : "Show"}
                  </button>
                </div>
                {pipVaultPasswordError ? <p className="field-error">{pipVaultPasswordError}</p> : null}
              </div>
              <button
                className="primary"
                data-testid="vault-unlock-btn"
                onClick={handleEnableVaultPassword}
                disabled={
                  pipVaultBusy ||
                  (!pipVaultPassword.trim() &&
                    !(pipVaultSnapshot?.mode === "password" && rememberedVaultPassword))
                }
              >
                {pipVaultTask?.kind === "unlock"
                  ? "Working…"
                  : pipVaultSnapshot?.mode === "password"
                    ? pipVaultSnapshot.locked
                      ? "Unlock"
                      : "Rotate password"
                    : "Enable password"}
              </button>
            {pipVaultSnapshot?.mode === "password" && (
              <button
                className="ghost"
                onClick={handleDisableVaultPassword}
                disabled={pipVaultBusy || pipVaultTask?.kind === "unlock"}
              >
                Disable password
              </button>
            )}
          </div>
          <p id="vault-password-help" className="sr-only">
              Unlock or set the vault password. Press Alt+Shift+V to focus this input quickly.
            </p>
            <div className="pip-vault-password-meta">
              <label className="remember-toggle">
                <input
                  type="checkbox"
                  checked={pipVaultRememberUnlock}
                  onChange={(e) => handleRememberUnlockToggle(e.target.checked)}
                />
                Remember unlock for this session
                <span className="remember-hint" data-testid="vault-remember-hint" aria-hidden="true">
                  {rememberedUnlockCopy}
                </span>
              </label>
              <div className={`pip-vault-strength ${pipVaultStrengthClass} ${pipVaultPasswordStrength.score ? "" : "muted"}`}>
                <div className="strength-meter">
                  <span style={{ width: `${(pipVaultPasswordStrength.score / 4) * 100}%` }} />
                </div>
                <div className="strength-meta">
                  <strong>{pipVaultPasswordStrength.score ? pipVaultPasswordStrength.label : "Strength"}</strong>
                  <span>
                    {pipVaultPasswordStrength.score ? pipVaultPasswordStrength.hint : "Use 14+ chars with numbers & symbols."}
                  </span>
                  <div className="strength-checks">
                    {pipVaultPasswordStrength.checks.map((check) => (
                      <span key={check.id} className={`strength-check ${check.pass ? "ok" : ""}`}>
                        {check.pass ? "✔" : "○"} {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {pipVaultSnapshot?.mode === "password" && (
              <div className="pip-vault-reset">
                <div className="pip-vault-reset-head">
                  <div>
                    <p className="eyebrow">Reset password</p>
                    <strong>Change it with the current password</strong>
                  </div>
                  <button className="ghost small" type="button" onClick={handleToggleVaultReset} disabled={pipVaultBusy}>
                    {vaultResetOpen ? "Close reset" : "Change password"}
                  </button>
                </div>
                {vaultResetOpen ? (
                  <div className="pip-vault-reset-grid">
                    <div className="pip-vault-password-input">
                      <label className="eyebrow subtle" htmlFor="vault-reset-current">
                        Current password
                      </label>
                      <div className="pip-vault-input-wrap">
                        <input
                          id="vault-reset-current"
                          type={vaultResetCurrentVisible ? "text" : "password"}
                          value={vaultResetCurrent}
                          onChange={(e) => setVaultResetCurrent(e.target.value)}
                          placeholder="Current vault password"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          className="ghost small password-visibility-toggle"
                          onClick={() => setVaultResetCurrentVisible((visible) => !visible)}
                          aria-label={`${vaultResetCurrentVisible ? "Hide" : "Show"} current password`}
                        >
                          {vaultResetCurrentVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <div className="pip-vault-password-input">
                      <label className="eyebrow subtle" htmlFor="vault-reset-new">
                        New password
                      </label>
                      <div className="pip-vault-input-wrap">
                        <input
                          id="vault-reset-new"
                          type={vaultResetNewVisible ? "text" : "password"}
                          value={vaultResetNew}
                          onChange={(e) => setVaultResetNew(e.target.value)}
                          placeholder="New vault password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="ghost small password-visibility-toggle"
                          onClick={() => setVaultResetNewVisible((visible) => !visible)}
                          aria-label={`${vaultResetNewVisible ? "Hide" : "Show"} new password`}
                        >
                          {vaultResetNewVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <div className="pip-vault-password-input">
                      <label className="eyebrow subtle" htmlFor="vault-reset-confirm">
                        Confirm new password
                      </label>
                      <div className="pip-vault-input-wrap">
                        <input
                          id="vault-reset-confirm"
                          type={vaultResetConfirmVisible ? "text" : "password"}
                          value={vaultResetConfirm}
                          onChange={(e) => setVaultResetConfirm(e.target.value)}
                          placeholder="Repeat new vault password"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="ghost small password-visibility-toggle"
                          onClick={() => setVaultResetConfirmVisible((visible) => !visible)}
                          aria-label={`${vaultResetConfirmVisible ? "Hide" : "Show"} confirmation`}
                        >
                          {vaultResetConfirmVisible ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>
                    <div className={`pip-vault-strength ${vaultResetStrengthClass} ${vaultResetStrength.score ? "" : "muted"}`}>
                      <div className="strength-meter">
                        <span style={{ width: `${(vaultResetStrength.score / 4) * 100}%` }} />
                      </div>
                      <div className="strength-meta">
                        <strong>{vaultResetStrength.score ? vaultResetStrength.label : "Strength"}</strong>
                        <span>{vaultResetStrength.score ? vaultResetStrength.hint : "Use 14+ chars with numbers & symbols."}</span>
                        <div className="strength-checks">
                          {vaultResetStrength.checks.map((check) => (
                            <span key={check.id} className={`strength-check ${check.pass ? "ok" : ""}`}>
                              {check.pass ? "✔" : "○"} {check.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {vaultResetError ? (
                      <p className="field-error">{vaultResetError}</p>
                    ) : (
                      <p className="hint">
                        We unlock with the current password first, then re-encrypt with the new one. Strength checks run inline.
                      </p>
                    )}
                    <div className="pip-vault-reset-actions">
                      <button className="ghost small" type="button" onClick={resetVaultResetForm} disabled={pipVaultBusy}>
                        Clear
                      </button>
                      <button
                        className="primary small"
                        type="button"
                        onClick={handleVaultPasswordReset}
                        disabled={pipVaultBusy || pipVaultTask?.kind === "unlock"}
                      >
                        Reset password
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="hint">
                    Know the current password? Reset it here without disabling the vault or touching auto-unlock.
                  </p>
                )}
              </div>
            )}
            <div className="pip-vault-actions">
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  openVaultAuthPrompt(
                    pipVaultSnapshot?.mode === "password" ? "unlock" : "enable",
                    pipVaultSnapshot?.mode === "password"
                      ? "Unlock to manage the vault"
                      : "Enable password mode with inline validation",
                  )
                }
                disabled={pipVaultBusy}
              >
                Open password dialog
              </button>
            </div>
            <div className="pip-vault-breach">
              <div className="pip-vault-breach-copy">
                <span className={`pill ${breachStatusTone}`}>{breachStatusLabel}</span>
                <span className="hint" data-testid="vault-breach-meta">
                  {pipVaultBreachMessage ?? "Checks HIBP with k-anonymity; only the SHA-1 prefix leaves this device."}
                  {pipVaultBreachCount != null ? ` · Hits: ${pipVaultBreachCount.toLocaleString()}` : ""}
                  {breachCheckedLabel ? ` · Checked ${breachCheckedLabel}` : " · Not checked yet"}
                </span>
              </div>
              <button
                className="ghost small"
                type="button"
                onClick={handleBreachCheck}
                disabled={pipVaultBusy || pipVaultBreachStatus === "checking" || !pipVaultPassword.trim()}
              >
                {pipVaultBreachStatus === "checking" ? "Checking…" : "Run breach check"}
              </button>
            </div>
              <div className="pip-vault-auto-lock">
                <div className="auto-lock-row">
                  <label htmlFor="vault-auto-lock">Auto-lock</label>
                  <select
                    id="vault-auto-lock"
                    className="pip-vault-auto-lock-select"
                    value={pipVaultAutoLockMinutes}
                    onChange={(e) => setPipVaultAutoLockMinutes(Number(e.target.value))}
                    disabled={pipVaultBusy}
                  >
                    <option value={0}>Off</option>
                    <option value={5}>5 min</option>
                    <option value={10}>10 min</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={60}>60 min</option>
                  </select>
                  <span className="pill ghost">
                    {pipVaultAutoLockMinutes
                      ? pipVaultAutoLockRemainingMs != null
                        ? `Locks in ${formatCountdown(pipVaultAutoLockRemainingMs)}`
                        : "Timer armed"
                      : "Disabled"}
                  </span>
                  <button
                    className="ghost small"
                    onClick={handleLockVaultNow}
                    disabled={pipVaultBusy || pipVaultLocked || pipVaultSnapshot?.mode !== "password"}
                  >
                    Lock now
                  </button>
                </div>
                <div className="auto-lock-meta">
                  <span className="hint">Clears cached vault keys after inactivity (password mode only).</span>
                  {pipVaultSnapshot?.lockedAt && pipVaultSnapshot.locked ? (
                    <span className="hint mono">Last lock {formatTime(pipVaultSnapshot.lockedAt)}</span>
                  ) : null}
                </div>
              </div>
              <div className="pip-vault-kdf">
                <div className="pip-vault-kdf-head">
                  <span className="pill ghost">Key derivation</span>
                  <div className="pip-vault-kdf-chips">
                    <button
                      type="button"
                      className={`chip ${pipVaultKdfProfile.algorithm === "pbkdf2" ? "active" : ""}`}
                      data-testid="vault-kdf-pbkdf2"
                      onClick={() => setPipVaultKdfProfile((current) => ({ ...current, algorithm: "pbkdf2" }))}
                    >
                      PBKDF2
                    </button>
                    <button
                      type="button"
                      className={`chip ${pipVaultKdfProfile.algorithm === "argon2id" ? "active" : ""}`}
                      data-testid="vault-kdf-argon2"
                      onClick={() => setPipVaultKdfProfile((current) => ({ ...current, algorithm: "argon2id" }))}
                    >
                      Argon2id
                    </button>
                    <span className="pill ghost mono" data-testid="vault-kdf-active-pill">
                      {pipVaultSnapshot?.kdf?.algorithm ? `${pipVaultSnapshot.kdf.algorithm} active` : "pbkdf2 active"}
                    </span>
                  </div>
                </div>
                {pipVaultKdfProfile.algorithm === "argon2id" ? (
                  <div className="pip-vault-kdf-grid">
                    <label>
                      Memory (MiB)
                      <input
                        type="range"
                        min={16 * 1024}
                        max={256 * 1024}
                        step={16 * 1024}
                        data-testid="vault-kdf-memory"
                        value={kdfMemory}
                        onChange={(e) =>
                          setPipVaultKdfProfile((current) => ({
                            ...current,
                            memoryKiB: Number(e.target.value),
                          }))
                        }
                      />
                      <span className="hint mono">
                        {kdfMemory / 1024} MiB
                      </span>
                    </label>
                    <label>
                      Iterations (t)
                      <input
                        type="number"
                        min={2}
                        max={6}
                        data-testid="vault-kdf-iterations"
                        value={kdfIterations}
                        onChange={(e) =>
                          setPipVaultKdfProfile((current) => ({
                            ...current,
                            iterations: Number(e.target.value) || DEFAULT_ARGON2_PROFILE.iterations,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Parallelism (p)
                      <input
                        type="number"
                        min={1}
                        max={4}
                        data-testid="vault-kdf-parallelism"
                        value={kdfParallelism}
                        onChange={(e) =>
                          setPipVaultKdfProfile((current) => ({
                            ...current,
                            parallelism: Math.max(1, Math.min(4, Number(e.target.value) || 1)),
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : (
                  <p className="hint">
                    PBKDF2 (100k rounds) will be used for new passwords. Switch to Argon2id for stronger password derivation on the
                    next enable/rotate.
                  </p>
                )}
                <div className="pip-vault-kdf-actions">
                  <button
                    className="ghost small"
                    type="button"
                    data-testid="vault-kdf-save"
                    onClick={handleSaveKdfProfile}
                    disabled={pipVaultBusy}
                  >
                    Save tuning
                  </button>
                  <button
                    className="ghost small"
                    type="button"
                    data-testid="vault-kdf-reset"
                    onClick={() => setPipVaultKdfProfile(DEFAULT_ARGON2_PROFILE)}
                    disabled={pipVaultBusy}
                  >
                    Reset profile
                  </button>
                </div>
              </div>
              <div className="pip-vault-hw">
                <div className="pip-vault-hw-copy">
                  <span className="pill ghost">Hardware key</span>
                  <strong>{pipVaultHardwarePlaceholder ? "Placeholder added" : "Optional placeholder"}</strong>
                  <p className="hint">Reserve a hardware-key requirement; actual hardware key binding is coming soon.</p>
                </div>
                <button
                  className={`ghost small ${pipVaultHardwarePlaceholder ? "accent" : ""}`}
                  type="button"
                  onClick={handleToggleHardwarePlaceholder}
                >
                  {pipVaultHardwarePlaceholder ? "Remove placeholder" : "Add placeholder"}
                </button>
              </div>
            <div className="pip-vault-actions">
              <button
                className="ghost"
                onClick={handleRunIntegrityScan}
                disabled={pipVaultBusy || pipVaultLocked || vaultIntegrityRunning}
              >
                {vaultIntegrityRunning ? "Scanning…" : "Scan integrity"}
              </button>
              <button className="ghost" onClick={() => openVaultBackupWizard("import")} disabled={pipVaultBusy}>
                {pipVaultTask?.kind === "import" ? "Importing…" : "Import backup"}
              </button>
              <button
                className="ghost"
                onClick={() => openVaultBackupWizard("export")}
                disabled={pipVaultBusy || (!pipVaultSnapshot?.exists && !pipVaultRecords.length)}
              >
                {pipVaultTask?.kind === "export" ? "Exporting…" : "Export backup"}
              </button>
            </div>
            <div className="pip-vault-actions">
              <button
                className="ghost small"
                type="button"
                onClick={handleQuickVaultImport}
                disabled={pipVaultBusy || pipVaultLocked}
              >
                Quick import (IPC)
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={handleQuickVaultExport}
                disabled={pipVaultBusy || (!pipVaultSnapshot?.exists && !pipVaultRecords.length)}
              >
                Quick export (IPC)
              </button>
            </div>
            <div className="pip-vault-integrity-issues">
              <div className="pip-vault-integrity-head">
                <span className="pill ghost">Integrity issues</span>
                <span className="hint mono">
                  {vaultIntegrity ? `${vaultIntegrity.scanned} scanned` : "No scan yet"}
                  {vaultIntegrity?.at ? ` · ${formatTimeShort(vaultIntegrity.at)}` : ""}
                </span>
              </div>
              {vaultIntegrityIssues.length ? (
                <div className="pip-vault-integrity-list">
                  {vaultIntegrityIssues.map((issue) => (
                    <div key={issue.id} className="pip-vault-integrity-item">
                      <div className="pip-vault-integrity-copy">
                        <strong className="mono">{issue.id}</strong>
                        <p>{issue.error}</p>
                        <span className="hint">
                          Repair options: re-wrap if decryptable, or quarantine the encrypted record before deleting.
                        </span>
                      </div>
                      <div className="pip-vault-integrity-actions">
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => void handleRepairVaultIssue(issue, "quarantine")}
                          disabled={pipVaultBusy || pipVaultLocked}
                        >
                          Quarantine copy
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => void handleRepairVaultIssue(issue, "rewrap")}
                          disabled={pipVaultBusy || pipVaultLocked}
                        >
                          Attempt repair
                        </button>
                        <button
                          className="ghost small danger"
                          type="button"
                          onClick={() => void handleRepairVaultIssue(issue, "delete")}
                          disabled={pipVaultBusy || pipVaultLocked}
                        >
                          Delete record
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="hint">Last scan clean. Run integrity to surface corrupted envelopes.</p>
              )}
            </div>
            <p className="hint">Use password mode for portable backups. Import uses the password field when required.</p>
          </article>

          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Active document</p>
                <div className="title-with-help">
                  <h4>Current PIP</h4>
                  <HelpTip copy="Load pulls the selected PIP from the vault; Save writes the current PIP once validation issues are resolved." />
                </div>
              </div>
              <span className={`pill ${pip ? "accent" : "ghost"}`}>{pip ? "Loaded" : "Empty"}</span>
            </div>
            <div className="pip-vault-summary">
              <div>
                <span>manifestTx</span>
                <strong className="mono">{abbreviateTx(pip?.manifestTx)}</strong>
              </div>
              <div>
                <span>tenant</span>
                <strong>{normalizeText(pip?.tenant) || "—"}</strong>
              </div>
              <div>
                <span>site</span>
                <strong>{normalizeText(pip?.site) || "—"}</strong>
              </div>
              <div>
                <span>Validation</span>
                <strong>{pipVaultValidationIssues.length ? `${pipVaultValidationIssues.length} issue${pipVaultValidationIssues.length === 1 ? "" : "s"}` : "No issues"}</strong>
              </div>
            </div>
            <div className="pip-vault-actions">
              <button className="ghost" onClick={handleLoadPipFromVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Load vault"}
              </button>
              <button
                className="primary"
                onClick={handleSavePipToVault}
                disabled={pipVaultBusy || !pip || pipVaultBlockingIssues.length > 0}
                title={pipVaultBlockingIssues.length ? "Fix blocking validation issues first" : "Save current PIP to the vault"}
              >
                {pipVaultBusy ? "Saving…" : "Save to vault"}
              </button>
              <button className="ghost" onClick={handleClearPipVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Delete vault"}
              </button>
              <button className="ghost" onClick={() => void refreshPipVaultSnapshot()} disabled={pipVaultBusy}>
                Refresh
              </button>
              <button className="ghost" onClick={handleImportPip}>
                Import PIP
              </button>
              <button className="ghost" onClick={handleExportPip} disabled={!pip}>
                Export PIP
              </button>
            </div>
          </article>

          <article className="pip-vault-card pip-vault-records-card">
            <div className="stack-head pip-vault-records-head">
              <div>
                <p className="eyebrow">Records</p>
                <div className="title-with-help">
                  <h4>Vault table</h4>
                  <HelpTip copy="Browse, filter, export, or delete stored PIP records inside the vault." />
                </div>
              </div>
              <div className="pip-vault-records-actions">
                <input
                  className="pip-vault-filter"
                  value={pipVaultFilter}
                  onChange={(e) => setPipVaultFilter(e.target.value)}
                  placeholder="Filter by tx, tenant, or site"
                  aria-label="Filter vault records"
                  aria-describedby="vault-filter-help"
                  ref={vaultFilterRef}
                />
                <span className="pill ghost">
                  {filteredPipVaultRecords.length}/{pipVaultRecords.length || 0}
                </span>
                <button
                  className="ghost small"
                  onClick={() => void refreshPipVaultRecords()}
                  disabled={pipVaultRecordsLoading || pipVaultBusy || pipVaultLocked}
                >
                  {pipVaultRecordsLoading ? "Refreshing…" : "Refresh"}
                </button>
                {pipVaultFilter && (
                  <button className="ghost small" onClick={() => setPipVaultFilter("")}>
                    Clear
                  </button>
                )}
                <p id="vault-filter-help" className="sr-only">
                  Filter vault records by transaction id, tenant, or site. Press Alt+Shift+F to focus this field.
                </p>
                <button className="ghost small" onClick={handleExportPipVaultRecords} disabled={!pipVaultRecords.length}>
                  Export JSON
                </button>
              </div>
            </div>
            <div className="pip-vault-table-wrap">
              <table className="pip-vault-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Updated</th>
                    <th>manifestTx</th>
                    <th>tenant / site</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPipVaultRecords.length ? (
                    filteredPipVaultRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{formatDate(record.createdAt)}</td>
                        <td>{formatDate(record.updatedAt)}</td>
                        <td className="mono">{abbreviateTx(record.manifestTx)}</td>
                        <td>
                          <div className="pip-vault-record-meta">
                            <strong>{normalizeText(record.tenant) || "—"}</strong>
                            <span>{normalizeText(record.site) || "—"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="pip-vault-row-actions">
                            <button
                              className="ghost small"
                              onClick={() => void handleLoadVaultRecord(record.id)}
                              disabled={pipVaultBusy || pipVaultRecordsLoading || pipVaultLocked}
                            >
                              Load
                            </button>
                            <button
                              className="ghost small danger"
                              onClick={() => void handleDeleteVaultRecord(record.id)}
                              disabled={pipVaultBusy || pipVaultRecordsLoading || pipVaultLocked}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="pip-vault-empty-row">
                      <td colSpan={5}>
                        {pipVaultRecords.length ? "No records match the filter." : "No vault records saved yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="pip-vault-card pip-vault-audit-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Backups</p>
                <div className="title-with-help">
                  <h4>Audit log</h4>
                  <HelpTip copy="Each vault backup is hashed with SHA-256 and recorded locally. Export this log for integrity checks." />
                </div>
              </div>
              <div className="pip-vault-audit-actions">
                <span className="pill ghost">
                  {vaultAuditLoading ? "Loading…" : vaultAuditEvents.length ? `${vaultAuditEvents.length} recent` : "No entries"}
                </span>
                <button
                  className="ghost small"
                  onClick={() => void refreshVaultAudit()}
                  disabled={vaultAuditLoading || pipVaultBusy}
                >
                  {vaultAuditLoading ? "Refreshing…" : "Refresh"}
                </button>
                <button
                  className="ghost small"
                  onClick={() => void handleExportVaultAudit("csv")}
                  disabled={!vaultAuditEvents.length || vaultAuditExporting === "csv"}
                >
                  {vaultAuditExporting === "csv" ? "Exporting…" : "Export CSV"}
                </button>
                <button
                  className="ghost small"
                  onClick={() => void handleExportVaultAudit("json")}
                  disabled={!vaultAuditEvents.length || vaultAuditExporting === "json"}
                >
                  {vaultAuditExporting === "json" ? "Exporting…" : "Export JSON"}
                </button>
              </div>
            </div>
            {vaultAuditEvents.length ? (
              <div className="pip-vault-audit-table-wrap">
                <table className="pip-vault-audit-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Checksum</th>
                      <th>Size</th>
                      <th>Mode / file</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaultAuditEvents.map((event) => (
                      <React.Fragment key={event.id}>
                        <tr>
                          <td>
                            <div className="pip-vault-audit-when">
                              <strong>{formatTimeShort(event.at)}</strong>
                              <span className="subtle">{new Date(event.at).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td>
                            <span className="pill ghost">
                              {event.action
                                ? event.action === "backup"
                                  ? "Backup"
                                  : event.action === "import"
                                    ? "Import"
                                    : event.action
                                : "—"}
                            </span>
                          </td>
                          <td>
                            <span className={`pill ${event.status === "ok" ? "accent" : "issue"}`}>
                              {event.status === "ok" ? "OK" : "Error"}
                            </span>
                          </td>
                          <td className="mono pip-vault-checksum-cell" title={event.checksum ?? ""}>
                            {event.checksum ? `${event.checksum.slice(0, 18)}…` : "—"}
                          </td>
                          <td className="mono">{formatBytes(event.bytes)}</td>
                          <td>
                            <div className="pip-vault-audit-meta">
                              <span className="pill ghost">{event.mode ? formatVaultMode(event.mode) : "—"}</span>
                              <span className="mono subtle">{event.filename ?? "—"}</span>
                              <button className="ghost small" onClick={() => toggleVaultAuditRow(event.id)}>
                                {vaultAuditExpandedId === event.id ? "Hide detail" : "Drill down"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {vaultAuditExpandedId === event.id ? (
                          <tr className="pip-vault-audit-detail-row">
                            <td colSpan={6}>
                              <div className="audit-detail-grid">
                                <div>
                                  <span>Mode</span>
                                  <strong>{event.mode ? formatVaultMode(event.mode) : "—"}</strong>
                                </div>
                                <div>
                                  <span>Records</span>
                                  <strong>{event.recordCount ?? "—"}</strong>
                                </div>
                                <div>
                                  <span>Bytes</span>
                                  <strong className="mono">{formatBytes(event.bytes)}</strong>
                                </div>
                                <div>
                                  <span>Path</span>
                                  <strong className="mono pip-vault-checksum">{event.path ?? "—"}</strong>
                                </div>
                                <div>
                                  <span>Source</span>
                                  <strong>{event.source ?? "—"}</strong>
                                </div>
                                <div className="audit-detail-wide">
                                  <span>Detail</span>
                                  <p className="hint">{event.detail ?? "No additional detail captured."}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hint">Export a vault backup to capture its checksum and audit trail.</p>
            )}
          </article>

          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Validation</p>
                <h4>Issues</h4>
              </div>
              <span className={`pill ${pipVaultValidationIssues.length ? "issue" : "ghost"}`}>
                {pipVaultValidationIssues.length ? `${pipVaultValidationIssues.length}` : "Clear"}
              </span>
            </div>
            {pipVaultValidationIssues.length ? (
              <div className="pip-vault-issues">
                {pipVaultValidationIssues.map((issue) => (
                  <div key={`${issue.field}-${issue.message}`} className={`pip-vault-issue ${issue.severity}`}>
                    <span className={`issue-dot ${issue.severity}`} aria-hidden />
                    <div>
                      <strong>{issue.field}</strong>
                      <p>{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint">No validation issues on the current PIP.</p>
            )}
          </article>
        </div>
        {pipVaultStatus && (
          <div className="pip-vault-footer">
            <span className="pill ghost pip-vault-pill" data-testid="vault-status-pill">
              {pipVaultStatus}
            </span>
          </div>
        )}
        </Vault>
      </ErrorBoundary>

      <div className="panels" style={{ display: workspace === "ao" || workspace === "data" ? "none" : undefined }}>
        <aside
          className="panel catalog"
          role="complementary"
          aria-label={messages.app.panels.catalog}
          tabIndex={-1}
        >
          <div className="panel-header neon-hover-glow">
            <div>
              <p className="eyebrow">Catalog</p>
              <h3 id="catalog-heading">Blocks</h3>
            </div>
            <span className="pill">
              {catalogLoading ? "Loading…" : `${visibleCatalog.length}/${catalog.length}`}
            </span>
          </div>
          <div className="input-wrap">
            <input
              type="search"
              placeholder="Search blocks"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              aria-label="Search blocks by name, tag, or type"
            />
          </div>
          <div className="filter-chips">
            <div className="filter-row quick-tag-row">
              <span className="filter-label">Quick tags</span>
              <div className="quick-tag-pills">
                {quickTagFilters.map((tag) => {
                  const active = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      className={`chip quick ${active ? "active" : ""}`}
                      onClick={() => toggleTagFilter(tag)}
                      type="button"
                      aria-pressed={active}
                      data-testid={`quick-tag-chip-${tag}`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="filter-row">
              <span className="filter-label">Types</span>
              {catalogTypes.map((type) => {
                const active = activeTypes.includes(type);
                return (
                  <button
                    key={type}
                    className={`chip ${active ? "active" : ""}`}
                    onClick={() => toggleTypeFilter(type)}
                    type="button"
                    aria-pressed={active}
                  >
                    {type.replace(/^block\./, "")}
                  </button>
                );
              })}
            </div>
            <div className="filter-row">
              <span className="filter-label">Tags</span>
              {catalogTags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    className={`chip ${active ? "active" : ""}`}
                    onClick={() => toggleTagFilter(tag)}
                    type="button"
                    aria-pressed={active}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            {(activeTypes.length > 0 || activeTags.length > 0) && (
              <button
                className="chip reset"
                type="button"
                onClick={() => {
                  setActiveTypes([]);
                  setActiveTags([]);
                  setQuickShape(null);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="quick-gallery">
            <div className="quick-gallery-head">
              <span className="filter-label">Quick shapes</span>
              {quickShape ? (
                <button className="chip reset small" type="button" onClick={() => setQuickShape(null)}>
                  Clear shape
                </button>
              ) : (
                <span className="hint">Filter by layout silhouette</span>
              )}
            </div>
            <div className="quick-gallery-grid">
              {quickShapeFilters.map((shape) => {
                const active = quickShape === shape.id;
                const sampleItem = catalogByType.get(shape.sampleType);
                const preview = sampleItem?.preview;
                return (
                  <button
                    key={shape.id}
                    className={`quick-card neon-hover-glow ${active ? "active" : ""}`}
                    type="button"
                    onClick={() => setQuickShape(active ? null : shape.id)}
                  >
                    {renderBlockPreview(shape.sampleType, "compact")}
                    <div className="quick-card-meta">
                      <div className="quick-card-title-row">
                        <strong>{shape.label}</strong>
                        {preview?.badge ? <span className="pill ghost micro">{preview.badge}</span> : null}
                      </div>
                      <div className="quick-card-preview">
                        <strong>{preview?.title ?? shape.hint}</strong>
                        <p>{preview?.body ?? "Filter by layout silhouette"}</p>
                        {preview?.meta?.length ? (
                          <div className="quick-card-meta-chips">
                            {preview.meta.slice(0, 3).map((meta) => (
                              <span key={meta} className="pill ghost micro">
                                {meta}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {recentCatalogItems.length ? (
            <div className="catalog-recents">
              <div className="catalog-recents-head">
                <div>
                  <span className="filter-label">Recent blocks</span>
                  <p className="hint">Last added to the composition</p>
                </div>
                <button className="chip reset small" type="button" onClick={handleClearRecentCatalog}>
                  Clear
                </button>
              </div>
              <div className="catalog-recents-grid" role="list">
                {recentCatalogItems.map((item) => {
                  const shape = blockShapeForType(item.type);
                  return (
                    <article key={item.id} className="catalog-recent-card" role="listitem">
                      <div className="catalog-recent-preview">{renderBlockPreview(item.type, "compact")}</div>
                      <div className="catalog-recent-body">
                        <div className="catalog-recent-title">
                          <strong>{item.name}</strong>
                          {item.preview?.badge ? <span className="pill ghost micro">{item.preview.badge}</span> : null}
                        </div>
                        <p className="catalog-recent-summary">{item.summary}</p>
                        <div className="catalog-recent-tags" aria-label="Recent block tags">
                          <span className="pill ghost micro">{item.type.replace(/^block\./, "")}</span>
                          {item.tags?.slice(0, 2).map((tag) => (
                            <span key={tag} className="pill ghost micro">
                              #{tag}
                            </span>
                          ))}
                        </div>
                        <div className="catalog-recent-actions">
                          <button className="primary small" onClick={() => addFromCatalog(item)} type="button">
                            Add again
                          </button>
                          <button
                            className={`ghost small ${quickShape === shape ? "active" : ""}`}
                            type="button"
                            onClick={() => setQuickShape((current) => (current === shape ? null : shape))}
                          >
                            {quickShape === shape ? "Shape active" : "Match shape"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="catalog-palette">
            <div className="catalog-palette-head">
              <span className="filter-label">Block placeholders</span>
              <span className="hint">Drag into the composition or click Add.</span>
            </div>
            {catalogLoading ? (
              <div className="catalog-grid" role="list" aria-label="Loading block placeholders">
                {quickShapeFilters.slice(0, 6).map((shape, index) => (
                  <div key={shape.id + index} className="catalog-grid-card skeleton">
                    <div className="catalog-grid-preview" aria-hidden>
                      <BlockPlaceholder type={shape.sampleType} />
                    </div>
                    <div className="catalog-grid-body">
                      <LazySkeletonLine width="72%" />
                      <LazySkeletonLine width="56%" />
                      <div className="catalog-grid-tags">
                        <LazySkeletonLine width="42%" />
                        <LazySkeletonLine width="30%" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : paletteCatalog.length ? (
              <div className="catalog-grid" role="list" aria-label="Block placeholder grid">
                {paletteCatalog.map((item) => (
                  <article
                    key={item.id}
                    className={`catalog-grid-card ${draggedCatalogId === item.id ? "is-dragging" : ""}`}
                    role="listitem"
                  >
                    <div
                      className="catalog-grid-preview"
                      draggable
                      onDragStart={(event) => handleCatalogDragStart(item, event)}
                      onDragEnd={handleCatalogDragEnd}
                      role="button"
                      tabIndex={0}
                      aria-label={`Drag ${item.name} into the composition or press Enter to add`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          addFromCatalog(item);
                        }
                      }}
                    >
                      <BlockPlaceholder type={item.type} />
                    </div>
                    <div className="catalog-grid-body">
                      <div className="catalog-grid-title">
                        <strong>{item.name}</strong>
                        {item.preview?.badge ? <span className="pill ghost micro">{item.preview.badge}</span> : null}
                      </div>
                      <p className="catalog-grid-summary">{item.summary}</p>
                      <div className="catalog-grid-tags" aria-label="Block tags">
                        <span className="pill ghost micro">{item.type.replace(/^block\./, "")}</span>
                        {item.tags?.slice(0, 3).map((tag) => (
                          <span key={tag} className="pill ghost micro">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="catalog-grid-actions">
                        <button className="primary small" onClick={() => addFromCatalog(item)} type="button">
                          Add
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() =>
                            setQuickShape((current) =>
                              current === blockShapeForType(item.type) ? null : blockShapeForType(item.type),
                            )
                          }
                        >
                          Match shape
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="hint">No blocks match the current filters.</p>
            )}
          </div>
          <div className="catalog-list">
            {catalogLoading ? (
              <div className="catalog-skeleton" role="status" aria-live="polite">
                {quickShapeFilters.slice(0, 3).map((shape, index) => (
                  <div key={shape.id + index} className="catalog-skeleton-card">
                    <BlockPlaceholder type={shape.sampleType} />
                    <div className="catalog-skeleton-text">
                      <LazySkeletonLine width="68%" />
                      <LazySkeletonLine width="52%" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {visibleCatalog.map((item, index) => (
                  <div
                    key={item.id}
                    className={`catalog-item motion-stagger-item ${draggedCatalogId === item.id ? "is-dragging" : ""}`}
                    style={{ "--motion-index": index } as CSSProperties}
                    draggable
                    onDragStart={(event) => handleCatalogDragStart(item, event)}
                    onDragEnd={handleCatalogDragEnd}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        addFromCatalog(item);
                      }
                    }}
                  >
                    <div>
                      {renderBlockPreview(item.type)}
                      <div className="item-title">{item.name}</div>
                      <p className="item-summary">{item.summary}</p>
                      {item.preview ? (
                        <div className="catalog-preview">
                          <div className="catalog-preview-head">
                            {item.preview.badge ? <span className="pill ghost micro">{item.preview.badge}</span> : null}
                            {item.preview.title ? <strong>{item.preview.title}</strong> : null}
                          </div>
                          {item.preview.body ? <p>{item.preview.body}</p> : null}
                          {item.preview.meta?.length ? (
                            <div className="catalog-preview-meta">
                              {item.preview.meta.map((meta) => (
                                <span key={meta} className="pill ghost micro">
                                  {meta}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="tags">
                        <span className="pill ghost">{item.type}</span>
                        {item.tags?.map((tag) => (
                          <span key={tag} className="pill ghost">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button className="primary small" onClick={() => addFromCatalog(item)} type="button">
                      Add
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>

        <section
          className="panel preview"
          role="region"
          aria-label={messages.app.panels.preview}
          tabIndex={-1}
        >
          <div className="panel-header neon-hover-glow">
            <div>
              <p className="eyebrow">Preview</p>
              <h3 id="composition-heading">Composition</h3>
            </div>
            <div className="preview-header-meta">
              <div className="pill ghost">
                {totalNodes} node{totalNodes === 1 ? "" : "s"}
              </div>
              <div className={`pill ${currentManifestTx ? "accent" : "ghost"}`}>
                {currentManifestTx ? `manifestTx ${abbreviateTx(currentManifestTx)}` : "No manifest tx"}
              </div>
            </div>
          </div>
          {workspace === "preview" ? (
            <Suspense fallback={<WorkspaceSuspenseFallback workspace="preview" />}>
              <section className="manifest-preview-card" aria-label="Current manifest metadata">
                <div className="stack-head">
                  <div>
                    <p className="eyebrow">Manifest</p>
                    <h4>Current metadata</h4>
                  </div>
                  <div className="manifest-preview-actions">
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => currentManifestTx && openExternal(manifestArweaveUrl)}
                      disabled={!currentManifestTx}
                      title={currentManifestTx ? "Open on arweave.net" : "Load a manifest tx first"}
                    >
                      Open on arweave.net
                    </button>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => openExternal(manifestGqlExplorerUrl)}
                      title="Open the Arweave GraphQL explorer"
                    >
                      GQL explorer
                    </button>
                  </div>
                </div>
                <div className="manifest-preview-grid">
                  <div>
                    <span>ID</span>
                    <strong className="mono">{manifest.id}</strong>
                  </div>
                  <div>
                    <span>Version</span>
                    <strong>{manifest.version}</strong>
                  </div>
                  <div>
                    <span>Author</span>
                    <strong>{normalizeText(manifest.metadata.author) || "—"}</strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>{formatDate(manifest.metadata.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Updated</span>
                    <strong>{formatDate(manifest.metadata.updatedAt)}</strong>
                  </div>
                  <div>
                    <span>Nodes</span>
                    <strong>{totalNodes}</strong>
                  </div>
                </div>
                <div className="manifest-preview-footer">
                  <div className="manifest-preview-tx">
                    <span>manifestTx</span>
                    <strong className="mono">{currentManifestTx ? currentManifestTx : "—"}</strong>
                  </div>
                  <span className={`pill ${loadingManifest ? "ghost" : remoteError ? "error" : "accent"}`}>
                    {loadingManifest ? "Fetching…" : remoteError ? "Fetch error" : "Ready"}
                  </span>
                </div>
              </section>
              <section className="preview-holomap-card" aria-label="AO holomap pulse">
                <div className="stack-head">
                  <div>
                    <p className="eyebrow">AO holomap</p>
                    <h4>Network pulse</h4>
                  </div>
                  <div className="preview-holomap-meta">
                    <span className={`pill ${holomapEnabled ? "accent" : "ghost"}`}>
                      {prefersReducedMotion
                        ? "Reduced motion"
                        : holomapEnabled
                          ? "Live effects"
                          : "FX paused"}
                    </span>
                    <span className={`pill ${healthSummary.overall === "ok" ? "ghost" : "warn"}`}>
                      {healthSummary.overall.toUpperCase()}
                    </span>
                  </div>
                </div>
                <AoHolomap
                  enabled={holomapEnabled}
                  reducedMotion={prefersReducedMotion}
                  theme={theme}
                  health={health}
                  summary={healthSummary}
                  events={holomapEvents}
                  variant="mini"
                />
              </section>
            </Suspense>
          ) : null}
          <div className="composition-toolbar hud-bar">
            <div className="selection-readout">
              <span className="pill ghost selection-pill">
                {selectedNodeIds.length ? `${selectedNodeIds.length} selected` : "No selection"}
              </span>
              <span className="hint">Shift/Ctrl-click to multi-select. Drag to reorder or press Alt+Arrow to move.</span>
            </div>
            <div className="composition-actions">
              <button className="ghost small icon-lead" data-icon="↺" onClick={handleUndo} disabled={!canUndo} title="Cmd/Ctrl+Z">
                Undo
              </button>
              <button className="ghost small icon-lead" data-icon="↻" onClick={handleRedo} disabled={!canRedo} title="Shift+Cmd/Ctrl+Z">
                Redo
              </button>
              <button className="ghost small icon-lead" data-icon="⧉" onClick={handleDuplicateSelection} disabled={!selectedNodeIds.length}>
                Duplicate
              </button>
              <button className="ghost small danger icon-lead" data-icon="✖" onClick={handleDeleteSelection} disabled={!selectedNodeIds.length}>
                Delete
              </button>
            </div>
          </div>
          <div
            ref={previewSurfaceRef}
            className={`preview-surface ${compositionDropActive ? "drop-active" : ""}`}
            onDragOver={handleCompositionDragOver}
            onDragEnter={handleCompositionDragOver}
            onDragLeave={handleCompositionDragLeave}
            onDrop={handleCompositionDrop}
          >
            {hologramActive && (
              <HologramBlocks
                active={hologramActive}
                hostRef={previewSurfaceRef}
                prefersReducedMotion={prefersReducedMotion}
              />
            )}
            {dropGhost ? (
              <div className="drop-ghost-layer" aria-hidden>
                <div
                  className={`drop-ghost drop-${dropGhost.placement} ${dropGhost.mode === "move" ? "move" : "add"}`}
                  data-testid="drop-ghost"
                  data-drop-placement={dropGhost.placement}
                  data-drop-mode={dropGhost.mode ?? "catalog"}
                  style={{
                    width: dropGhost.rect.width,
                    height: dropGhost.rect.height,
                    transform: `translate(${dropGhost.rect.x}px, ${dropGhost.rect.y}px)`,
                  }}
                >
                  <div className="drop-ghost-label">
                    <span className="pill ghost micro">{dropGhost.mode === "move" ? "Move" : "Add"}</span>
                    <strong>{dropGhost.label}</strong>
                  </div>
                  <BlockPlaceholder type={dropGhost.type} />
                </div>
              </div>
            ) : null}
            <div
              className={`composition-dropzone ${manifest.nodes.length ? "inline" : ""} ${compositionDropActive ? "active" : ""}`}
              role="region"
              aria-label="Drop blocks to add to the composition"
              tabIndex={0}
            >
              <div className="dropzone-copy">
                <span className="dropzone-badge">Drop here</span>
                <strong>Build the composition by dragging blocks from the catalog.</strong>
                <p>Drop a block anywhere in this panel to add it to the manifest.</p>
              </div>
              <div className="dropzone-stack">
                {["block.hero", "block.featureGrid", "block.gallery", "block.stats"].map((type) => (
                  <BlockPlaceholder key={type} type={type} />
                ))}
              </div>
            </div>
            {manifest.nodes.length > 0 && (
              <Suspense fallback={<ManifestRendererFallback />}>
                <ManifestRenderer
                  manifest={manifest}
                  selectedIds={selectedNodeIds}
                  primarySelectedId={selectedNodeId}
                  onSelect={(id, meta) => handleSelectNode(id, meta)}
                  dropState={treeDropState}
                  onDropTargetChange={handleDropTargetChange}
                  onDropItem={handleTreeDrop}
                  draggedNodeId={draggedNodeId}
                  onNodeDragStart={handleNodeDragStart}
                  onNodeDragEnd={handleNodeDragEnd}
                  diffHighlight={draftDiffOpen ? draftDiffHighlight : undefined}
                  validation={treeValidation}
                  onApplyDefaults={autofillNodeProps}
                  reviewMode={reviewMode}
                  commentCounts={reviewCounts}
                  onRequestComment={handleRequestComment}
                />
              </Suspense>
            )}
          </div>
        </section>

        <aside
          className="panel props"
          role="complementary"
          aria-label={messages.app.panels.inspector}
          tabIndex={-1}
        >
          <div className="panel-header neon-hover-glow">
            <div>
              <p className="eyebrow">Inspector</p>
              <h3 id="inspector-heading">Properties</h3>
            </div>
          </div>
          {!selectedNode ? (
            <div className="empty">
              <p>No node selected</p>
              <span>Click a block in the preview to edit props.</span>
            </div>
          ) : (
            <div className="props-body">
              <div className="review-toggle-row">
                <label className="toggle">
                  <input
                    type="checkbox"
                    data-testid="review-mode-toggle"
                    checked={reviewMode}
                    onChange={(e) => setReviewMode(e.target.checked)}
                  />
                  <span>Review mode</span>
                </label>
                <span className="pill ghost">
                  {openReviewCount ? `${openReviewCount} open` : "No open comments"}
                </span>
              </div>
              {reviewMode ? (
                <div className="review-panel">
                  <div className="review-panel-head">
                    <div>
                      <p className="eyebrow">Pinned comments</p>
                      <h4>{selectedNode?.title || "Selected node"}</h4>
                    </div>
                    <span className="pill ghost">
                      {selectedNodeComments.length} note{selectedNodeComments.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="review-thread">
                    {selectedNodeComments.length === 0 ? (
                      <p className="hint">No comments pinned to this node yet.</p>
                    ) : (
                      selectedNodeComments.map((comment) => (
                        <div
                          key={comment.id}
                          className={`review-comment ${comment.resolvedAt ? "resolved" : ""}`}
                          data-testid="review-comment"
                          data-comment-id={comment.id}
                        >
                          <div className="review-comment-head">
                            <span className="mono">{formatTime(comment.createdAt)}</span>
                            <div className="review-comment-actions">
                              <button
                                className="ghost micro"
                                type="button"
                                data-testid="review-comment-resolve"
                                onClick={() => toggleReviewComment(comment.id)}
                              >
                                {comment.resolvedAt ? "Reopen" : "Resolve"}
                              </button>
                              <button
                                className="ghost micro"
                                type="button"
                                data-testid="review-comment-delete"
                                onClick={() => deleteReviewComment(comment.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <p>{comment.text}</p>
                          {comment.resolvedAt ? <span className="pill ghost micro">Resolved</span> : null}
                        </div>
                      ))
                    )}
                  </div>
                  <label className="field">
                    <span>Add review note</span>
                    <textarea
                      ref={commentInputRef}
                      data-testid="review-comment-input"
                      value={reviewDraft}
                      onChange={(e) => setReviewDraft(e.target.value)}
                      rows={3}
                      placeholder="Pin a note to this node"
                    />
                  </label>
                  <div className="review-panel-actions">
                    <button
                      className="primary small"
                      type="button"
                      data-testid="review-pin-btn"
                      onClick={() => selectedNodeId && addReviewComment(selectedNodeId, reviewDraft)}
                      disabled={!selectedNodeId || !reviewDraft.trim()}
                    >
                      Pin comment
                    </button>
                    <button className="ghost small" type="button" onClick={() => setReviewDraft("")} disabled={!reviewDraft}>
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="inspector-toolbar">
                <div className="mode-toggle" role="tablist" aria-label="Inspector mode">
                  <button
                    type="button"
                    className={inspectorMode === "form" ? "active" : "ghost"}
                    onClick={() => handlePropsModeChange("form")}
                    disabled={!hasPropsSchema}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    className={inspectorMode === "json" ? "active" : "ghost"}
                    onClick={() => handlePropsModeChange("json")}
                  >
                    JSON
                  </button>
                </div>
                <p className="hint">
                  {hasPropsSchema
                    ? "Schema-driven inputs stay synced with the raw JSON."
                    : "No schema found for this block, so the raw JSON editor is the only mode."}
                </p>
              </div>
              <div className="inspector-badges">
                <span
                  className="badge schema"
                  title={`Schema type: ${selectedCatalogItem?.type ?? selectedNode.type}`}
                >
                  {selectedCatalogItem?.type ?? selectedNode.type}
                </span>
                <span
                  className={`badge ${propsInspection?.valid ? "valid" : "invalid"}`}
                  title={propsInspection?.valid ? "Props satisfy schema validation" : "Props need fixes to validate"}
                >
                  {propsInspection?.valid ? "Valid" : "Needs attention"}
                </span>
                <span className="badge ghost" title="Differences from the block defaults">
                  {propsInspection?.diffEntries.length ?? 0} diff
                  {(propsInspection?.diffEntries.length ?? 0) === 1 ? "" : "s"}
                </span>
                <span className="badge ghost" title="Validation issues found for this node">
                  {propsInspection?.issueCount ?? 0} issue
                  {(propsInspection?.issueCount ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
              {selectedNodeIds.length > 1 && <p className="hint multi-select-hint">Inspector is showing the first selected node.</p>}
              <label className="field">
                <span>Title</span>
                <input value={selectedNode.title} onChange={(e) => updateNodeTitle(e.target.value)} />
              </label>
              {inspectorMode === "form" && hasPropsSchema ? (
                <div className="props-form-panel">
                  <PropsSchemaField
                    schema={selectedCatalogItem?.propsSchema}
                    value={propsFormDraft}
                    path={[]}
                    onChange={handlePropsFormChange}
                    diffPaths={propsDiffPaths}
                  />
                  <div className="props-json-toggle">
                    <button className="ghost small" type="button" onClick={() => setJsonEditorOpen((current) => !current)}>
                      {jsonEditorOpen ? "Hide raw JSON" : "Show raw JSON"}
                    </button>
                    <span className="hint">Raw JSON stays available for advanced edits.</span>
                  </div>
                </div>
              ) : null}
              <div className="props-json-panel">
                {inspectorMode === "json" || jsonEditorOpen ? (
                  <label className="field props-json-editor">
                    <span>Props JSON</span>
                    <textarea
                      rows={10}
                      value={propsDraft}
                      onChange={(e) => handlePropsJsonChange(e.target.value)}
                      className={propsInspection && !propsInspection.valid ? "invalid" : ""}
                    />
                  </label>
                ) : (
                  <div className="props-json-placeholder">
                    <p className="hint">Raw JSON editor is hidden.</p>
                    <button className="ghost small" type="button" onClick={() => setJsonEditorOpen(true)}>
                      Open JSON editor
                    </button>
                  </div>
                )}
                <div className="diff-summary">
                  <div className="diff-summary-head">
                    <span className="eyebrow">Validation</span>
                    <div className="inline-actions">
                      <span className="badge ghost" title="Validation issues on this node">
                        {propsInspection?.issueCount ?? 0}
                      </span>
                      {selectedNodeId && propsInspection?.issues.some((issue) => issue.code === "required") ? (
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => autofillNodeProps(selectedNodeId)}
                          title="Fill missing required props with defaults"
                        >
                          Fill required
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {propsInspection?.issues.length ? (
                    <div className="validation-list">
                      {propsInspection.issues.map((issue) => (
                        <div key={`${issue.path}:${issue.message}`} className="validation-row">
                          <span className="badge issue">{issue.path || "root"}</span>
                          <span className="validation-message">{issue.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="hint">No validation issues.</p>
                  )}
                  <div className="diff-summary-head diff-summary-spaced">
                    <span className="eyebrow label-with-help">
                      Diff vs defaults
                      <HelpTip copy="Shows how your current props differ from the catalog defaults; hide overrides to view only changed fields." />
                    </span>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={showOverrides}
                        onChange={(e) => setShowOverrides(e.target.checked)}
                      />
                      <span>Show overrides</span>
                    </label>
                  </div>
                  {propsInspection?.parseError ? (
                    <p className="hint">Fix the JSON above to preview the diff.</p>
                  ) : (
                    <>
                      <div className="diff-summary-totals">
                        <span className="badge added">+{propsInspection?.diffSummary.added ?? 0}</span>
                        <span className="badge changed">~{propsInspection?.diffSummary.changed ?? 0}</span>
                        <span className="badge removed">-{propsInspection?.diffSummary.removed ?? 0}</span>
                      </div>
                      {propsInspection?.diffEntries.length ? (
                        <div className="diff-groups">
                          <DiffGroup
                            label="Added"
                            kind="added"
                            entries={propsInspection.diffGroups.added}
                            showOverrides={showOverrides}
                            issuesByPath={propsInspection.issuesByPath}
                          />
                          <DiffGroup
                            label="Changed"
                            kind="changed"
                            entries={propsInspection.diffGroups.changed}
                            showOverrides={showOverrides}
                            issuesByPath={propsInspection.issuesByPath}
                          />
                          <DiffGroup
                            label="Removed"
                            kind="removed"
                            entries={propsInspection.diffGroups.removed}
                            showOverrides={showOverrides}
                            issuesByPath={propsInspection.issuesByPath}
                          />
                        </div>
                      ) : (
                        <p className="hint">Matches the selected block defaults.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="props-actions">
                <button
                  className="ghost"
                  onClick={() => selectedNodeId && autofillNodeProps(selectedNodeId)}
                  type="button"
                  disabled={!selectedNodeId || !selectedCatalogItem?.propsSchema}
                >
                  Fill missing defaults
                </button>
                <button className="ghost" onClick={resetPropsToDefaults} type="button">
                  Reset to defaults
                </button>
                <button className="primary" onClick={applyProps} type="button">
                  Apply props
                </button>
              </div>
            </div>
          )}
          <div className="divider" />
          <div className="meta">
            <div>
              <p className="eyebrow">Updated</p>
              <p>{formatDate(manifest.metadata.updatedAt)}</p>
            </div>
            <div>
              <p className="eyebrow">Created</p>
              <p>{formatDate(manifest.metadata.createdAt)}</p>
            </div>
          </div>
        </aside>
      </div>

      {showIssuesDock && (
        <div className={`issues-dock ${issuesDockCollapsed ? "collapsed" : ""}`}>
          <div className="issues-dock-head">
            <div>
              <p className="eyebrow">Validation</p>
              <h4>
                {manifestIssueCount} issue{manifestIssueCount === 1 ? "" : "s"}
              </h4>
              <p className="subtle">
                {manifestRequiredIssueCount} required · {Math.max(0, manifestIssueCount - manifestRequiredIssueCount)} other
              </p>
            </div>
            <div className="inline-actions">
              <button className="ghost small" type="button" onClick={() => setIssuesDockCollapsed((state) => !state)}>
                {issuesDockCollapsed ? "Expand" : "Collapse"}
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={autofillRequiredIssues}
                disabled={!manifestRequiredIssueCount}
              >
                Fix required
              </button>
            </div>
          </div>
          {!issuesDockCollapsed && (
            <div className="issues-list">
              {manifestIssues.map((entry) => (
                <div key={`${entry.nodeId}:${entry.issue.path}:${entry.issue.message}`} className="issue-row">
                  <div
                    className="issue-row-main"
                    role="button"
                    tabIndex={0}
                    onClick={() => jumpToNode(entry.nodeId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        jumpToNode(entry.nodeId);
                      }
                    }}
                  >
                    <div className="issue-node-meta">
                      <span className="pill ghost">{entry.nodeType ?? "node"}</span>
                      <strong>{entry.nodeTitle || entry.nodeId}</strong>
                      <span className="mono subtle">{entry.issue.path || "root"}</span>
                    </div>
                    <p className="issue-message">{entry.issue.message}</p>
                  </div>
                  {entry.issue.code === "required" ? (
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => {
                        autofillNodeProps(entry.nodeId);
                        jumpToNode(entry.nodeId);
                      }}
                    >
                      Fill default
                    </button>
                  ) : (
                    <button className="ghost small" type="button" onClick={() => jumpToNode(entry.nodeId)}>
                      Jump
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Wizard
        ref={wizardRegionRef}
        className="panel deploy"
        open={workspace === "ao"}
        labelledBy="ao-wizard-heading"
        describedBy="ao-wizard-desc"
        data-hotkey-area="wizard"
      >
        <div className="panel-header neon-hover-glow">
          <div>
            <p className="eyebrow">AO deploy</p>
            <h3 id="ao-wizard-heading">Wallet · Module · Process</h3>
            <p id="ao-wizard-desc" className="sr-only">
              Deploy wizard broken into wallet, module, and process steps. Use Alt+Shift+W, Alt+Shift+M, or Alt+Shift+P to jump to a step.
            </p>
          </div>
          <div className="deploy-chips">
            {offlineMode && (
              <span
                className="progress-chip offline"
                title="Offline mode blocks network actions"
                role="status"
                aria-live="polite"
                aria-label="Offline mode enabled; network actions are blocked"
              >
                Offline
              </span>
            )}
            <span
              className={`progress-chip ${deployState}`}
              role="status"
              aria-live="polite"
              aria-label={`Deploy status: ${deployStatusLabel}`}
            >
              {deployStatusLabel}
            </span>
            <span
              className={`progress-chip ${spawnState}`}
              role="status"
              aria-live="polite"
              aria-label={`Spawn status: ${spawnStatusLabel}`}
            >
              {spawnStatusLabel}
            </span>
            <div className="pill ghost">
              {deployedModuleTx
                ? `Module tx • ${deployedModuleTx.slice(0, 10)}…`
                : envModuleTxDefault
                  ? `Env AO_MODULE_TX • ${abbreviateTx(envModuleTxDefault)}`
                  : "Awaiting module"}
            </div>
          </div>
        </div>
        <div className="wizard-validation-row" aria-label="Wizard validation status">
          {wizardValidation.map((item) => (
            <div key={item.id} className={`wizard-pill status-${item.status}`}>
              <div className="wizard-pill-head">
                <span className="eyebrow">{item.label}</span>
                <span className={`pill ghost micro ${item.status}`}>{item.status}</span>
              </div>
              <div className="wizard-pill-detail">{item.detail}</div>
            </div>
          ))}
        </div>
        <div className="ao-profile-bar" aria-label="Recent deploy profiles">
          <div className="ao-profile-head">
            <div>
              <p className="eyebrow">Profiles</p>
              <h4>Recent deploys</h4>
            </div>
            <div className="ao-profile-actions">
              <input
                className="profile-name-input"
                placeholder="Label (optional)"
                value={profileNameDraft}
                onChange={(e) => setProfileNameDraft(e.target.value)}
              />
              <button className="ghost small" type="button" onClick={handleSaveProfile}>
                Save current
              </button>
              {activeProfile ? <span className="pill ghost micro">Active {activeProfile.label}</span> : null}
            </div>
          </div>
          <div className="ao-profile-chips">
            {aoProfiles.length ? (
              aoProfiles.map((profile) => {
                const active = activeProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    className={`ao-profile-chip ${active ? "active" : ""}`}
                    onClick={() => applyProfile(profile)}
                  >
                    <div className="ao-profile-chip-top">
                      <strong>{profile.label}</strong>
                      <span className="pill ghost micro">{profile.lastKind}</span>
                      {profile.dryRun ? <span className="pill ghost micro">dry-run</span> : null}
                    </div>
                    <div className="ao-profile-chip-meta">
                      <span className="mono">{profile.moduleTx ? abbreviateTx(profile.moduleTx) : "moduleTx —"}</span>
                      <span className="mono">
                        {profile.scheduler ? abbreviateTx(profile.scheduler) : "scheduler —"}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="hint">Deploy or spawn to capture profiles. Save to pin the current inputs.</p>
            )}
          </div>
        </div>
        <div className="deploy-grid">
          <div className="stack">
            <div className="stack-head">
              <div className="label-with-help">
                <p className="eyebrow">Wallet</p>
                <HelpTip copy="Choose IPC for the system wallet picker, Path to load a wallet JSON from disk, or JWK to paste raw JSON." />
              </div>
              <span className={`progress-chip wallet ${walletMode}`}>
                {walletMode === "ipc" ? "IPC" : walletMode === "path" ? "Path" : "JWK"}
              </span>
            </div>
            <div className="mode-switch">
              <button
                className={`chip ${walletMode === "ipc" ? "active" : ""}`}
                type="button"
                ref={wizardWalletRef}
                aria-pressed={walletMode === "ipc"}
                data-testid="wallet-mode-ipc"
                onClick={() => {
                  setWalletMode("ipc");
                  setWalletFieldError(null);
                }}
              >
                IPC
              </button>
              <button
                className={`chip ${walletMode === "path" ? "active" : ""}`}
                type="button"
                aria-pressed={walletMode === "path"}
                data-testid="wallet-mode-path"
                onClick={() => {
                  setWalletMode("path");
                  setWalletFieldError(null);
                }}
              >
                Path
              </button>
              <button
                className={`chip ${walletMode === "jwk" ? "active" : ""}`}
                type="button"
                aria-pressed={walletMode === "jwk"}
                data-testid="wallet-mode-jwk"
                onClick={() => {
                  setWalletMode("jwk");
                  setWalletFieldError(null);
                }}
              >
                JWK
              </button>
            </div>
            <div className="wallet-mode-panel">
              {walletMode === "ipc" && (
                <>
                  <div className="pill ghost mono">
                    {walletPath || walletJwk ? walletPath ?? "IPC wallet JSON" : "No IPC wallet selected"}
                  </div>
                  <div className="inline-actions">
                    <button className="ghost small" onClick={handlePickWallet} type="button">
                      Pick wallet
                    </button>
                    {(walletPath || walletJwk) && (
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => {
                          setWalletPath(null);
                          setWalletJwk(null);
                          setWalletNote(null);
                          setWalletFieldError(null);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </>
              )}
              {walletMode === "path" && (
                <label className="field">
                  <span>Wallet path</span>
                  <input
                    placeholder="/path/to/wallet.json"
                    value={walletPathInput}
                    onChange={(e) => {
                      setWalletPathInput(e.target.value);
                      setWalletFieldError(null);
                    }}
                  />
                  <div className="inline-actions">
                    <button className="ghost small" type="button" onClick={handlePickWallet}>
                      Pick via IPC
                    </button>
                    <button className="ghost small" type="button" onClick={() => void readWalletForMode()}>
                      Load wallet
                    </button>
                  </div>
                </label>
              )}
              {walletMode === "jwk" && (
                <label className="field">
                  <span>Wallet JSON</span>
                  <textarea
                    rows={7}
                    data-testid="wallet-jwk-input"
                    placeholder='{"kty":"RSA",...}'
                    value={walletJwkInput}
                    onChange={(e) => {
                      setWalletJwkInput(e.target.value);
                      setWalletFieldError(null);
                    }}
                  />
                  <div className="inline-actions">
                    <button className="ghost small" type="button" onClick={() => void readWalletForMode()}>
                      Parse wallet
                    </button>
                  </div>
                </label>
              )}
            </div>
            <div className="chip-row">
              <div className="pill ghost mono">
                {walletPath || walletJwk ? walletPath ?? "Wallet JSON loaded" : "Waiting for wallet"}
              </div>
              <button className="ghost small" type="button" onClick={handlePickWallet}>
                IPC picker
              </button>
            </div>
            {walletFieldError ? (
              <p className="error field-error">{walletFieldError}</p>
            ) : (
              <p className={`subtle ${walletInlineError ? "error" : ""}`}>
                {walletInlineError ?? walletInlineHint ?? "Choose IPC, path, or pasted JWK."}
              </p>
            )}
          </div>

          <div className="stack">
            <label className="field">
              <span className="label-with-help">
                Module path (optional)
                <HelpTip copy="Load a local AO module file; when loaded it fills Module source below." />
              </span>
              <input
                placeholder="/path/to/module.js"
                data-testid="ao-module-path"
                value={modulePath}
                onChange={(e) => {
                  setModulePath(e.target.value);
                  setModuleSourceError(null);
                }}
              />
              <div className="inline-actions">
                <button className="ghost small" onClick={handleLoadModuleFromPath} type="button">
                  Load path
                </button>
                <button className="ghost small" onClick={handleLoadModuleFromDialog} type="button">
                  Browse…
                </button>
              </div>
            </label>
            <label className="field">
              <span className="label-with-help">
                Module source
                <HelpTip copy="Paste the AO module JavaScript that Deploy will send to the network." />
              </span>
              <textarea
                ref={wizardModuleRef}
                rows={8}
                data-testid="ao-module-source"
                value={moduleSource}
                onChange={(e) => {
                  setModuleSource(e.target.value);
                  setModuleSourceError(null);
                }}
                placeholder="Paste AO module JavaScript"
              />
              {moduleSourceError ? <p className="error field-error">{moduleSourceError}</p> : <p className="hint">Deploy reads this source and writes a module tx.</p>}
            </label>
            <div className="inline-actions deploy-actions">
              <label className={`toggle dry-run-toggle ${deployDryRun ? "active" : ""}`}>
                <input
                  type="checkbox"
                  data-testid="ao-dry-run-toggle"
                  checked={deployDryRun}
                  onChange={(e) => setDeployDryRun(e.target.checked)}
                />
                <span>Dry-run (mock gateway)</span>
              </label>
              <button
                className="primary"
                onClick={handleDeployModuleClick}
                data-testid="ao-deploy-btn"
                disabled={deploying || (offlineMode && !deployDryRun)}
                type="button"
                aria-label="Deploy module"
                title={
                  offlineMode && !deployDryRun
                    ? "Offline mode is enabled; deploy is blocked"
                    : deployDryRun
                      ? "Simulate deploy using mocked gateway"
                      : "Deploy module"
                }
              >
                {deploying ? "Deploying…" : "Deploy module"}
              </button>
              {(deployOutcome || deployStep) && (
                <span
                  className={`progress-chip inline ${deployState}`}
                  data-testid="ao-deploy-status"
                  role="status"
                  aria-live="polite"
                  aria-label={`Deploy status: ${deployLiveLabel}`}
                >
                  {deployOutcome || deployStep}
                </span>
              )}
            </div>
            <div className="ao-cache-row">
              <div className="pill ghost mono">
                {deployedModuleTx ? `Cached module tx: ${abbreviateTx(deployedModuleTx)}` : "No module tx cached yet"}
              </div>
              <div className="inline-actions">
                <button className="ghost small" type="button" onClick={handleUseCachedModuleTx} disabled={!deployedModuleTx}>
                  Use cached tx
                </button>
                {deployState === "error" && deployTransient ? (
                  <button className="ghost small" type="button" onClick={handleRetryDeploy}>
                    Retry deploy
                  </button>
                ) : null}
              </div>
            </div>
            {renderTimeline("Deploy status", deployTimeline, deployState === "error" && deployTransient, handleRetryDeploy)}
          </div>

          <div className="stack">
            <label className="field">
              <span className="label-with-help">
                manifestTx
                <HelpTip copy="Transaction id of the manifest (PIP) you want to spawn as a process." />
              </span>
              <input
                ref={wizardSpawnRef}
                placeholder="Manifest transaction id"
                data-testid="ao-manifest-tx-input"
                value={manifestTxInput}
                onChange={(e) => {
                  setManifestTxInput(e.target.value);
                  setManifestTxError(null);
                }}
                aria-describedby="manifest-tx-help"
              />
              {manifestTxError ? (
                <p className="error field-error" id="manifest-tx-help">
                  {manifestTxError}
                </p>
              ) : (
                <p className="hint" id="manifest-tx-help">
                  PIP-loaded manifests auto-fill this field.
                </p>
              )}
            </label>
            <label className="field">
              <span className="label-with-help">
                AO_MODULE_TX
                <HelpTip copy="Module transaction id produced by deploy; spawn uses it to start the process." />
              </span>
              <input
                placeholder="Module transaction id"
                data-testid="ao-module-tx-input"
                value={moduleTxInput}
                onChange={(e) => {
                  setModuleTxInput(e.target.value);
                  setModuleTxError(null);
                }}
              />
              {moduleTxInlineError ? (
                <p className="error field-error">{moduleTxInlineError}</p>
              ) : (
                <p className="hint">{moduleTxInlineHint}</p>
              )}
            </label>
            <label className="field">
              <span className="label-with-help">
                Scheduler
                <HelpTip copy="Optional scheduler process id. Leave blank to use AO defaults." />
              </span>
              <input
                placeholder="Scheduler process id"
                data-testid="ao-scheduler-input"
                value={scheduler}
                onChange={(e) => {
                  setScheduler(e.target.value);
                  setSchedulerError(null);
                }}
              />
              {schedulerInlineError ? <p className="error field-error">{schedulerInlineError}</p> : <p className="hint">{schedulerInlineHint}</p>}
            </label>
            <div className="inline-actions">
              <button
                className="primary"
                onClick={() => void handleSpawnProcessClick()}
                data-testid="ao-spawn-btn"
                disabled={spawning || !canSpawn || offlineMode}
                type="button"
                aria-label="Spawn process"
                title={
                  offlineMode
                    ? "Offline mode is enabled; spawning is blocked"
                    : !canSpawn
                      ? "Add manifestTx and moduleTx to spawn"
                      : "Spawn process"
                }
              >
                {spawning ? "Spawning…" : "Spawn process"}
              </button>
              {(spawnOutcome || spawnStep) && (
                <span
                  className={`progress-chip inline ${spawnState}`}
                  data-testid="ao-spawn-status"
                  role="status"
                  aria-live="polite"
                  aria-label={`Spawn status: ${spawnLiveLabel}`}
                >
                  {spawnOutcome || spawnStep}
                </span>
              )}
            </div>
            <div className="ao-cache-row">
              <div className="pill ghost mono">
                {lastSpawnSnapshot
                  ? `Last PID: ${abbreviateTx(lastSpawnSnapshot.processId)}`
                  : "No recent spawn recorded"}
              </div>
              <div className="inline-actions">
                <button className="ghost small" type="button" onClick={handleRespawnLast} disabled={!lastSpawnSnapshot}>
                  Respawn last
                </button>
                {spawnState === "error" && spawnTransient ? (
                  <button className="ghost small" type="button" onClick={handleRetrySpawn}>
                    Retry spawn
                  </button>
                ) : null}
              </div>
            </div>
            {renderTimeline("Spawn status", spawnTimeline, spawnState === "error" && spawnTransient, handleRetrySpawn)}
            {!spawnOutcome && deployedModuleTx && (
              <p className="subtle mono">Spawn will use module tx: {deployedModuleTx}</p>
            )}
          </div>
        </div>

        <div className="ao-mini-log">
          <div className="ao-mini-log-header">
            <div>
              <p className="eyebrow">AO mini-log</p>
              <h4>Latest deploys and spawns</h4>
            </div>
            <p className="subtle">Quick access to the last response from each action.</p>
          </div>
          <div className="ao-mini-log-table-wrap">
            <table className="ao-mini-log-table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">tx / processId</th>
                  <th scope="col">Status</th>
                  <th scope="col">Time</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {aoMiniLogRows.length ? (
                  aoMiniLogRows.map((entry, index) => (
                    <tr key={`${entry.kind}-${entry.time}-${index}`}>
                      <td>
                        <span className={`mini-log-kind ${entry.kind}`}>{entry.kind}</span>
                      </td>
                      <td>
                        <span className={`mini-log-id ${entry.id ? "mono" : "empty"}`} title={entry.id ?? ""}>
                          {entry.id ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`mini-log-status ${entry.status.toLowerCase()}`}>{entry.status}</span>
                      </td>
                      <td>
                        <time dateTime={entry.time}>{formatDate(entry.time)}</time>
                      </td>
                      <td>
                        <div className="mini-log-actions">
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              void handleCopyAoId(
                                entry.id,
                                entry.kind === "deploy" ? "Deploy tx" : "Process id",
                              )
                            }
                            disabled={!entry.id}
                          >
                            Copy
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleOpenAoId(entry.id)}
                            disabled={!entry.id}
                          >
                            Open
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="ao-mini-log-empty">
                      Run a deploy or spawn to capture the latest AO response here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      
        <Suspense fallback={<AoLogPanelFallback />}>
          <AoLogPanel
            aoLog={aoLog}
            metrics={aoLogMetrics}
            pinned={pinnedAoIds}
            tailing={aoLogTailing}
            onTogglePin={togglePinnedAoId}
            onCopy={handleCopyAoId}
            onOpen={handleOpenAoId}
            onRetry={retryAoAction}
            onResume={resumeAoAction}
            onToggleTail={toggleAoLogTail}
            onClear={handleClearAoLog}
            onExport={handleExportAoLog}
            ariaLabel={messages.app.panels.aoLog}
          />
        </Suspense>
      </Wizard>

      </main>

      {(draftDiffOpen || draftDiffLoading) && (
        <ErrorBoundary name="Draft diff" variant="overlay" onReset={resetDraftDiffBoundary}>
          <Suspense
            fallback={
              <DraftDiffPanelFallback
                leftLabel={`${manifest.name} (current)`}
                leftDetail={`Updated ${formatDate(manifest.metadata.updatedAt)}`}
                onClose={closeDraftDiffPanel}
              />
            }
          >
            <DraftDiffPanel
              open={draftDiffOpen}
              loading={draftDiffLoading}
              entries={draftDiffEntries}
              options={draftDiffOptions}
              rightValue={draftDiffRightValue}
              leftLabel={`${manifest.name} (current)`}
              leftDetail={`Updated ${formatDate(manifest.metadata.updatedAt)}`}
              rightLabel={draftDiffRight ? draftDiffRight.name : undefined}
              rightDetail={
                draftDiffRight
                  ? `${draftDiffRight.mode ? formatDraftSaveMode(draftDiffRight.mode) : "Draft"} • ${formatDate(draftDiffRight.savedAt)}`
                  : undefined
              }
              onClose={closeDraftDiffPanel}
              onSelectRight={handleSelectDraftDiffOption}
              onCherryPick={handleCherryPick}
              onStatus={flashStatus}
              docked={draftDiffDocked}
              onToggleDock={() => setDraftDiffDocked((current) => !current)}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {vaultWizardOpen && (
        <div
          className="pip-vault-modal-backdrop"
          role="presentation"
          onClick={closeVaultBackupWizard}
        >
          <div
            ref={vaultWizardDialogRef}
            className="pip-vault-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vault-wizard-title"
            aria-describedby="vault-wizard-desc"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              type="file"
              accept="application/json"
              ref={vaultWizardFileInputRef}
              style={{ display: "none" }}
              onChange={handleVaultWizardFileChange}
              aria-hidden="true"
            />
            <div className="pip-vault-wizard-head">
              <div>
                <p className="eyebrow">Backups</p>
                <h4 id="vault-wizard-title">Vault backup wizard</h4>
                <p className="subtle" id="vault-wizard-desc">
                  Export or import vault bundles with progress, integrity context, and reusable passwords.
                </p>
              </div>
              <div className="pip-vault-wizard-actions">
                <span className="pill ghost">
                  {pipVaultSnapshot ? formatVaultMode(pipVaultSnapshot.mode) : "Mode unknown"}
                </span>
                <span className="pill ghost">
                  {pipVaultSnapshot ? `${pipVaultSnapshot.recordCount} records` : "Inspecting records…"}
                </span>
                <button
                  ref={vaultWizardCloseRef}
                  className="ghost small"
                  type="button"
                  onClick={closeVaultBackupWizard}
                >
                  Close
                </button>
              </div>
            </div>

            {pipVaultProgressNode}

            <div className="pip-vault-wizard-grid">
              <section className={`pip-vault-wizard-card ${vaultWizardMode === "export" ? "active" : ""}`}>
                <div className="stack-head">
                  <div>
                    <p className="eyebrow">Export</p>
                    <h4>Backup vault</h4>
                  </div>
                  <span className="pill ghost mono">
                    {pipVaultSnapshot?.updatedAt ? formatDate(pipVaultSnapshot.updatedAt) : "No backups yet"}
                  </span>
                </div>
                <div className="pip-vault-wizard-meta">
                  <div>
                    <span>Mode</span>
                    <strong>{pipVaultSnapshot ? formatVaultMode(pipVaultSnapshot.mode) : "—"}</strong>
                  </div>
                  <div>
                    <span>Records</span>
                    <strong>{pipVaultSnapshot?.recordCount ?? 0}</strong>
                  </div>
                  <div>
                    <span>Integrity</span>
                    <strong>
                      {vaultIntegrity
                        ? vaultIntegrity.failed
                          ? `${vaultIntegrity.failed} issue${vaultIntegrity.failed === 1 ? "" : "s"}`
                          : "OK"
                        : "Not scanned"}
                    </strong>
                  </div>
                  <div>
                    <span>Last checksum</span>
                    <strong className="mono">
                      {latestVaultAudit?.checksum ? `${latestVaultAudit.checksum.slice(0, 10)}…` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="pip-vault-wizard-actions">
                  <button
                    className="primary"
                    type="button"
                    onClick={handleWizardExport}
                    disabled={pipVaultBusy || (!pipVaultSnapshot?.exists && !pipVaultRecords.length)}
                  >
                    {pipVaultTask?.kind === "export" ? "Exporting…" : "Start export"}
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={handleRunIntegrityScan}
                    disabled={pipVaultBusy || pipVaultLocked || vaultIntegrityRunning}
                  >
                    {vaultIntegrityRunning ? "Scanning…" : "Scan integrity"}
                  </button>
                </div>
                <p className="hint">Backups include vault records and use the current vault mode.</p>
              </section>

              <section className={`pip-vault-wizard-card ${vaultWizardMode === "import" ? "active" : ""}`}>
                <div className="stack-head">
                  <div>
                    <p className="eyebrow">Import</p>
                    <h4>Restore backup</h4>
                  </div>
                  <span className="pill ghost mono">{vaultWizardFile?.name ?? "Choose backup file"}</span>
                </div>
                <div className="pip-vault-wizard-actions">
                  <button className="ghost" type="button" onClick={triggerVaultWizardFilePick} disabled={pipVaultBusy}>
                    Select file
                  </button>
                  <button
                    className="primary"
                    type="button"
                    onClick={handleWizardImport}
                    disabled={pipVaultBusy || !vaultWizardFile}
                  >
                    {pipVaultTask?.kind === "import" ? "Importing…" : "Start import"}
                  </button>
                </div>
                <label className="remember-toggle">
                  <input
                    type="checkbox"
                    checked={vaultWizardUseVaultPassword}
                    onChange={(e) => setVaultWizardUseVaultPassword(e.target.checked)}
                  />
                  Reuse vault password / remembered session
                  {vaultWizardUseVaultPassword && rememberedVaultPassword ? (
                    <span className="remember-hint">Using stored session password</span>
                  ) : null}
                </label>
                {!vaultWizardUseVaultPassword && (
                  <div className={`pip-vault-password-input ${vaultWizardImportError ? "has-error" : ""}`}>
                    <div className="pip-vault-input-wrap">
                      <input
                        type={vaultWizardPasswordVisible ? "text" : "password"}
                        value={vaultWizardPassword}
                        onChange={(e) => {
                          setVaultWizardPassword(e.target.value);
                          if (vaultWizardImportError) setVaultWizardImportError(null);
                        }}
                        placeholder="Password for encrypted backup"
                      />
                      <button
                        type="button"
                        className="ghost small password-visibility-toggle"
                        onClick={() => setVaultWizardPasswordVisible((visible) => !visible)}
                        aria-label={`${vaultWizardPasswordVisible ? "Hide" : "Show"} import password`}
                      >
                        {vaultWizardPasswordVisible ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>
                )}
                {vaultWizardImportError ? (
                  <p className="error field-error">{vaultWizardImportError}</p>
                ) : (
                  <p className="hint">
                    Encrypted bundles use the vault password. Uncheck reuse to supply a one-off password.
                  </p>
                )}
              </section>
            </div>

            <div className="pip-vault-wizard-footer">
              <div className="pip-vault-wizard-integrity">
                <p className="eyebrow">Integrity history</p>
                {vaultWizardIntegrity.length ? (
                  <div className="pip-vault-wizard-integrity-list">
                    {vaultWizardIntegrity.map((event) => {
                      const scannedLabel =
                        event.recordCount != null && Number.isFinite(event.recordCount)
                          ? `${event.scanned}/${event.recordCount} scanned`
                          : `${event.scanned} scanned`;
                      return (
                        <span key={event.id} className="pill ghost">
                          {formatTimeShort(event.at)} · {scannedLabel} ·{" "}
                          {event.failed ? `${event.failed} failed` : "OK"} · {Math.round(event.durationMs)}ms
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="hint">Run an integrity scan to reuse recent results before exporting.</p>
                )}
              </div>
              <div className="pip-vault-wizard-actions">
                <button
                  className="ghost small"
                  type="button"
                  onClick={handleRunIntegrityScan}
                  disabled={pipVaultBusy || pipVaultLocked || vaultIntegrityRunning}
                >
                  {vaultIntegrityRunning ? "Scanning…" : "Scan now"}
                </button>
                <button className="ghost small" type="button" onClick={closeVaultBackupWizard}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pipVaultAuthPrompt && (
        <div className="pip-vault-modal-backdrop" role="presentation" onClick={closeVaultAuthPrompt}>
          <div
            className="pip-vault-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pip-vault-auth-title"
            aria-describedby="pip-vault-auth-copy"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Vault password</p>
            <h4 id="pip-vault-auth-title">
              {pipVaultAuthPrompt.mode === "unlock" ? "Unlock vault" : "Enable password mode"}
            </h4>
            <p id="pip-vault-auth-copy">
              {pipVaultAuthPrompt.reason ??
                (pipVaultAuthPrompt.mode === "unlock"
                  ? "Enter the vault password to continue. We won't proceed until it passes inline checks."
                  : "Set a strong password (14+ chars) to encrypt the vault and backups. We'll validate strength before enabling.")}
            </p>
            <div className={`pip-vault-password-input ${pipVaultPasswordError ? "has-error" : ""}`}>
              <div className="pip-vault-input-wrap">
                <input
                  ref={vaultAuthInputRef}
                  type={pipVaultPasswordVisible ? "text" : "password"}
                  value={pipVaultPassword}
                  onChange={(e) => {
                    setPipVaultPassword(e.target.value);
                    if (pipVaultPasswordError) setPipVaultPasswordError(null);
                  }}
                  placeholder={pipVaultAuthPrompt.mode === "unlock" ? "Vault password" : "New vault password"}
                />
                <button
                  type="button"
                  className="ghost small password-visibility-toggle"
                  onClick={() => setPipVaultPasswordVisible((visible) => !visible)}
                  aria-label={`${pipVaultPasswordVisible ? "Hide" : "Show"} vault password`}
                >
                  {pipVaultPasswordVisible ? "Hide" : "Show"}
                </button>
              </div>
              {pipVaultPasswordError ? <p className="field-error">{pipVaultPasswordError}</p> : null}
            </div>
            <div className="pip-vault-password-meta">
              <div className={`pip-vault-strength ${pipVaultStrengthClass} ${pipVaultPasswordStrength.score ? "" : "muted"}`}>
                <div className="strength-meter">
                  <span style={{ width: `${(pipVaultPasswordStrength.score / 4) * 100}%` }} />
                </div>
                <div className="strength-meta">
                  <strong>{pipVaultPasswordStrength.score ? pipVaultPasswordStrength.label : "Strength"}</strong>
                  <span>
                    {pipVaultPasswordStrength.score
                      ? pipVaultPasswordStrength.hint
                      : "Use 14+ chars with numbers & symbols."}
                  </span>
                  <div className="strength-checks">
                    {pipVaultPasswordStrength.checks.map((check) => (
                      <span key={check.id} className={`strength-check ${check.pass ? "ok" : ""}`}>
                        {check.pass ? "✔" : "○"} {check.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <p className="hint">
                Inline validation runs before unlocking or enabling. You can reuse the remembered password if cached.
              </p>
            </div>
            <div className="pip-vault-modal-actions">
              <button className="ghost" onClick={closeVaultAuthPrompt}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => void runVaultPasswordFlow(pipVaultAuthPrompt.mode)}
                disabled={pipVaultBusy || pipVaultTask?.kind === "unlock"}
              >
                {pipVaultTask?.kind === "unlock"
                  ? "Working…"
                  : pipVaultAuthPrompt.mode === "unlock"
                    ? "Unlock vault"
                    : "Enable password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pipVaultModeConfirm && (
        <div className="pip-vault-modal-backdrop" role="presentation">
          <div
            ref={vaultModeDialogRef}
            className="pip-vault-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pip-vault-mode-title"
            aria-describedby="pip-vault-mode-copy"
            tabIndex={-1}
          >
            <p className="eyebrow">Vault mode</p>
            <h4 id="pip-vault-mode-title">
              {pipVaultModeConfirm.action === "enable" ? "Enable password mode?" : "Switch to keychain storage?"}
            </h4>
            <p id="pip-vault-mode-copy">
              {pipVaultModeConfirm.action === "enable"
                ? "Your vault will be re-encrypted with the password you entered. Backups created after this will require that password to open."
                : "Vault encryption will use the system keychain or local key. Password-protected backups will still need their password to restore."}
            </p>
            <div className="pip-vault-modal-actions">
              <button ref={vaultModeCancelRef} className="ghost" onClick={handleCancelVaultModeConfirm}>
                Cancel
              </button>
              <button className="primary" onClick={handleConfirmVaultMode}>
                {pipVaultModeConfirm.action === "enable" ? "Enable password" : "Use keychain"}
              </button>
            </div>
          </div>
        </div>
      )}

      {whatsNewOpen && (
        <div
          className="whats-new-backdrop"
          role="presentation"
          onClick={() => setWhatsNewOpen(false)}
        >
          <div
            ref={whatsNewDialogRef}
            className="whats-new-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="whats-new-title"
            aria-describedby="whats-new-desc"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="whats-new-head">
              <div>
                <p className="eyebrow">Changelog</p>
                <h3 id="whats-new-title">What's new</h3>
              </div>
              <button ref={whatsNewCloseRef} className="ghost small" onClick={() => setWhatsNewOpen(false)}>
                Close
              </button>
            </div>
            <p className="sr-only" id="whats-new-desc">
              Latest release highlights and dates.
            </p>
            <div className="whats-new-list">
              {whatsNewEntries.length === 0 ? (
                <p className="hint">No changelog entries found.</p>
              ) : (
                whatsNewEntries.map((entry) => (
                  <article key={`${entry.version}-${entry.date}`} className="whats-new-item">
                    <div className="whats-new-meta">
                      <span className="pill ghost">v{entry.version}</span>
                      <span className="mono subtle">{formatDate(entry.date)}</span>
                    </div>
                    <ul>
                      {entry.highlights.map((note, idx) => (
                        <li key={`${entry.version}-${idx}`}>{note}</li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="status-bar toast" role="status" aria-live="polite">
          {status}
        </div>
      )}
      {(pip?.manifestTx || remoteError) && (
        <div className="status-bar ghost" role="status" aria-live="polite">
          {pip?.manifestTx && <span className="pill ghost">manifestTx: {pip.manifestTx}</span>}
          {remoteError && <span className="error">{remoteError}</span>}
        </div>
      )}
      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        selectedIndex={safePaletteIndex}
        sections={paletteSections}
        flattened={flattenedPaletteActions}
        inputRef={paletteInputRef}
        onQueryChange={setPaletteQuery}
        onSelectIndex={setPaletteIndex}
        onExecute={runPaletteAction}
        onClose={closePalette}
      />
      </div>
    </I18nContext.Provider>
  );
}

export default App;
