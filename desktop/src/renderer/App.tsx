import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./styles.css";
import type { DraftDiffOption } from "./components/DraftDiffPanel";
import { fetchCatalog, catalogItems as seedCatalog } from "./services/catalog";
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
type DraftDiffPanelModule = typeof import("./components/DraftDiffPanel");
type AoLogPanelModule = typeof import("./components/AoLogPanel");
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
const DraftDiffPanel = React.lazy(loadDraftDiffPanel);
const AoLogPanel = React.lazy(loadAoLogPanel);
const ManifestRenderer = React.lazy(() => import("./components/ManifestRenderer"));
const prefetchDraftDiffPanel = () => {
  void loadDraftDiffPanel();
};
const prefetchAoLogPanel = () => {
  void loadAoLogPanel();
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
  type DraftRevision,
  type DraftSaveMode,
  type DraftSource,
  type DraftSourceRef,
} from "./storage/drafts";
import {
  addHealthEvent,
  getRecentHealthEvents,
  healthEventsToCsv,
  listHealthEvents,
  type HealthEvent,
} from "./storage/healthStore";
import {
  hasStoredSettings,
  loadSettings,
  markSetupComplete,
  resolveEnvWithSettings,
  saveSettings,
  setupCompleted,
} from "./storage/settings";
import { fetchWalletFromPath, parseWalletJson } from "./services/wallet";
import CommandPalette, { type CommandPaletteAction } from "./components/CommandPalette";
import {
  diff,
  groupDiffEntries,
  buildFormValue,
  indexValidationIssues,
  mergeDefaults,
  validate,
  type PropsDiffEntry,
  type PropsValidationIssue,
} from "./utils/propsInspector";
import { diffManifests, type DraftDiffEntry, type DraftDiffKind } from "./utils/draftDiff";
import HotkeyOverlay, { type HotkeyOverlaySection } from "./components/HotkeyOverlay";
import { validatePipDocument } from "./services/pipValidation";

type AoDeployModule = typeof import("./services/aoDeploy");

const loadAoDeployModule = (() => {
  let modPromise: Promise<AoDeployModule> | null = null;
  return () => {
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

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const next = stored === "cyberpunk" ? "cyberpunk" : "light";
  document.documentElement.setAttribute("data-theme", next);
  return next;
};

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");
const formatTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";
const abbreviateTx = (value?: string | null) =>
  value ? (value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value) : "—";
const formatVaultMode = (mode?: string) => {
  if (mode === "password") return "Password";
  if (mode === "plain") return "Local key";
  return "Safe storage";
};
const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const formatTimeShort = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" }) : "—";

const formatDraftSaveMode = (mode: DraftSaveMode) => (mode === "autosave" ? "Autosave" : "Manual save");

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

type PasswordStrength = { score: number; label: string; hint: string };

const evaluatePasswordStrength = (value: string): PasswordStrength => {
  const password = (value ?? "").trim();
  if (!password) {
    return { score: 0, label: "Add a password", hint: "Use 12+ chars with symbols." };
  }

  let score = 0;
  if (password.length >= 16) {
    score += 2;
  } else if (password.length >= 12) {
    score += 1;
  }

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((regex) => regex.test(password)).length;
  if (variety >= 3) score += 1;
  if (variety === 4) score += 1;

  const uniqueRatio = new Set(password.split("")).size / password.length;
  if (uniqueRatio < 0.45 && score > 0) {
    score -= 1;
  }

  const capped = Math.max(0, Math.min(score, 4));
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong"][capped];
  const hint =
    capped <= 1
      ? "Add length and mix upper/lowercase, numbers, symbols."
      : capped === 2
        ? "Add another character type to strengthen it."
        : capped === 3
          ? "Looks solid; avoid reusing it elsewhere."
          : "Strong; store it somewhere safe.";

  return { score: capped, label, hint };
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
      item.status === "ok"
        ? undefined
        : item.lastError ?? item.detail ?? prior?.lastError;

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

type Theme = "light" | "cyberpunk";
type Workspace = "data" | "ao" | "studio" | "preview";
type WalletMode = "ipc" | "path" | "jwk";
type TaskState = "idle" | "pending" | "success" | "error";
export type AoMiniLogEntry = {
  kind: "deploy" | "spawn";
  id: string | null;
  status: string;
  time: string;
  href: string | null;
  payload?: unknown;
  raw?: string;
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
  recordCount: number;
};
type PipVaultIssue = {
  field: string;
  message: string;
  severity: "error" | "warn";
};

const THEME_STORAGE_KEY = "darkmesh-theme";
const HEALTH_AUTO_REFRESH_STORAGE_KEY = "health-auto-refresh";
const PIP_VAULT_REMEMBER_KEY = "pip-vault-remember";
const PIP_VAULT_REMEMBER_PASSWORD_KEY = "pip-vault-remember-password";
const HEALTH_NOTIFY_STORAGE_KEY = "health-sla-notify";
const HEALTH_SLA_FAILURE_STORAGE_KEY = "health-sla-failure";
const HEALTH_SLA_LATENCY_STORAGE_KEY = "health-sla-latency";
const getEnv = (key: string): string | undefined => resolveEnvWithSettings(key);
const parsePositiveNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
};
const HEALTH_HISTORY_STORE_LIMIT = parsePositiveNumber(getEnv("HEALTH_HISTORY_LIMIT"), 200);
const HEALTH_EVENT_DISPLAY_LIMIT = 10;
const DEFAULT_SLA_FAILURE_THRESHOLD = parsePositiveNumber(getEnv("HEALTH_SLA_FAILURE_THRESHOLD"), 3);
const DEFAULT_SLA_LATENCY_THRESHOLD_MS = parsePositiveNumber(getEnv("HEALTH_SLA_LATENCY_MS"), 1500);
const MANIFEST_HISTORY_LIMIT = 20;

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
        recordCount: number;
      }>;
      list: () => Promise<{ exists: boolean; records: PipVaultRecord[] }>;
      loadRecord: (id: string) => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> }>;
      deleteRecord: (id: string) => Promise<{ ok: true; removed: boolean }>;
      enablePasswordMode: (password: string) => Promise<{
        ok: true;
        mode: "safeStorage" | "plain" | "password";
        iterations?: number;
        salt?: string;
        records?: number;
      }>;
      disablePasswordMode: () => Promise<{ ok: true; mode: "safeStorage" | "plain" | "password" }>;
      exportVault: () => Promise<{ ok: true; bundle: string }>;
      importVault: (bundle: string | ArrayBuffer, password?: string) => Promise<{
        ok: true;
        mode: "safeStorage" | "plain" | "password";
        records: number;
      }>;
    };
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

const blockShapeForType = (type: string): "hero" | "grid" | "media" | "pricing" | "footer" => {
  if (type.includes("hero")) return "hero";
  if (type.includes("grid")) return "grid";
  if (type.includes("gallery") || type.includes("media")) return "media";
  if (type.includes("pricing")) return "pricing";
  return "footer";
};

const BlockPlaceholder: React.FC<{ type: string }> = ({ type }) => {
  const shape = blockShapeForType(type);
  const className = `block-placeholder ${shape}`;

  return (
    <div className={className} aria-hidden>
      <span className="placeholder-chip" />
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

const AoLogPanelFallback: React.FC = () => (
  <div className="ao-log-panel" role="status" aria-live="polite">
    <div className="ao-log-panel-header">
      <div>
        <p className="eyebrow">AO console log</p>
        <h4>Loading action payloads…</h4>
      </div>
      <div className="ao-log-filters">
        <LazySkeletonPill width="86px" />
        <LazySkeletonPill width="98px" />
        <LazySkeletonPill width="86px" />
      </div>
    </div>
    <div className="ao-log-table-wrap">
      <table className="ao-log-table">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">tx / processId</th>
            <th scope="col">Status</th>
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
}> = ({ leftLabel, leftDetail, onClose }) => (
  <div className="draft-diff-backdrop" role="dialog" aria-modal="true" aria-label="Draft diff loading" onClick={onClose}>
    <div className="draft-diff-shell draft-diff-skeleton" onClick={(event) => event.stopPropagation()}>
      <header className="draft-diff-head">
        <div>
          <p className="eyebrow">Draft diff</p>
          <h3>Loading comparison…</h3>
          <p className="hint">Fetching the selected draft and preparing the diff.</p>
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

function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [workspace, setWorkspace] = useState<Workspace>("studio");
  const [catalog, setCatalog] = useState<CatalogItem[]>(seedCatalog);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
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
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const flashStatus = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 1800);
  }, []);
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revertTargetId, setRevertTargetId] = useState<number | null>(null);
  const [draftDiffOpen, setDraftDiffOpen] = useState(false);
  const [draftDiffLoading, setDraftDiffLoading] = useState(false);
  const [draftDiffRightRef, setDraftDiffRightRef] = useState<DraftSourceRef | null>(null);
  const [draftDiffRight, setDraftDiffRight] = useState<DraftSource | null>(null);
  const [draftDiffEntries, setDraftDiffEntries] = useState<DraftDiffEntry[]>([]);
  const [draftDiffHighlight, setDraftDiffHighlight] = useState<Record<string, DraftDiffKind>>({});
  const [pip, setPip] = useState<PipDocument | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [pipVaultStatus, setPipVaultStatus] = useState<string | null>(null);
  const [pipVaultBusy, setPipVaultBusy] = useState(false);
  const [pipVaultSnapshot, setPipVaultSnapshot] = useState<PipVaultSnapshot | null>(null);
  const [pipVaultRecords, setPipVaultRecords] = useState<PipVaultRecord[]>([]);
  const [pipVaultFilter, setPipVaultFilter] = useState("");
  const [pipVaultRecordsLoading, setPipVaultRecordsLoading] = useState(false);
  const [pipVaultPassword, setPipVaultPassword] = useState("");
  const [pipVaultError, setPipVaultError] = useState<string | null>(null);
  const [pipVaultPasswordError, setPipVaultPasswordError] = useState<string | null>(null);
  const [pipVaultTask, setPipVaultTask] = useState<{
    kind: "import" | "export" | "unlock" | "records-export";
    label: string;
  } | null>(null);
  const [pipVaultRememberUnlock, setPipVaultRememberUnlock] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(PIP_VAULT_REMEMBER_KEY) === "1";
  });
  const [pipVaultModeConfirm, setPipVaultModeConfirm] = useState<{ action: "enable" | "disable"; password?: string } | null>(null);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [healthAutoRefresh, setHealthAutoRefresh] = useState<"off" | "30" | "60">(() => {
    if (typeof window === "undefined") return "off";
    const stored = window.localStorage.getItem(HEALTH_AUTO_REFRESH_STORAGE_KEY);
    return stored === "30" || stored === "60" ? stored : "off";
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
  const [walletMode, setWalletMode] = useState<WalletMode>(() => {
    if (getEnv("AO_WALLET_JSON") || getEnv("VITE_AO_WALLET_JSON")) return "jwk";
    if (getEnv("AO_WALLET_PATH") || getEnv("VITE_AO_WALLET_PATH")) return "path";
    return "ipc";
  });
  const [walletPathInput, setWalletPathInput] = useState(
    getEnv("AO_WALLET_PATH") ?? getEnv("VITE_AO_WALLET_PATH") ?? "",
  );
  const [walletJwkInput, setWalletJwkInput] = useState(
    getEnv("AO_WALLET_JSON") ?? getEnv("VITE_AO_WALLET_JSON") ?? "",
  );
  const [walletFieldError, setWalletFieldError] = useState<string | null>(null);
  const [walletPath, setWalletPath] = useState<string | null>(null);
  const [walletJwk, setWalletJwk] = useState<Record<string, unknown> | null>(null);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(true);
  const [modulePath, setModulePath] = useState("");
  const [moduleSource, setModuleSource] = useState("");
  const [manifestTxInput, setManifestTxInput] = useState("");
  const [scheduler, setScheduler] = useState(getEnv("SCHEDULER") ?? getEnv("VITE_SCHEDULER") ?? "");
  const [moduleTxInput, setModuleTxInput] = useState(getEnv("AO_MODULE_TX") ?? getEnv("VITE_AO_MODULE_TX") ?? "");
  const [deploying, setDeploying] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [deployState, setDeployState] = useState<TaskState>("idle");
  const [spawnState, setSpawnState] = useState<TaskState>("idle");
  const [deployOutcome, setDeployOutcome] = useState<string | null>(null);
  const [spawnOutcome, setSpawnOutcome] = useState<string | null>(null);
  const [deployStep, setDeployStep] = useState<string | null>(null);
  const [spawnStep, setSpawnStep] = useState<string | null>(null);
  const [deployedModuleTx, setDeployedModuleTx] = useState<string | null>(null);
  const [aoLog, setAoLog] = useState<AoMiniLogEntry[]>([]);
  const [moduleSourceError, setModuleSourceError] = useState<string | null>(null);
  const [moduleTxError, setModuleTxError] = useState<string | null>(null);
  const [manifestTxError, setManifestTxError] = useState<string | null>(null);
  const [schedulerError, setSchedulerError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const [compositionDropActive, setCompositionDropActive] = useState(false);
  const [treeDropTargetId, setTreeDropTargetId] = useState<string | null>(null);
  const [draggedCatalogId, setDraggedCatalogId] = useState<string | null>(null);

  const paletteInputRef = useRef<HTMLInputElement>(null);
  const manifestRef = useRef(manifest);
  const activeDraftIdRef = useRef(activeDraftId);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const autoUnlockAttemptRef = useRef(false);
  const lastHealthNotificationRef = useRef<string | null>(null);
  const historySuppressedRef = useRef(false);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

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
  const primarySelectedId = selectedNodeIds.length ? selectedNodeIds[0] : null;
  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedNodeId: string | null = primarySelectedId;
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(manifest.nodes, selectedNodeId) : null),
    [manifest.nodes, selectedNodeId],
  );
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
        ? ((buildFormValue(
            selectedCatalogItem?.propsSchema,
            selectedNode.props ?? propsDefaults ?? {},
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
  const catalogTypes = useMemo(() => uniqueSorted(catalog.map((item) => item.type)), [catalog]);
  const catalogTags = useMemo(
    () => uniqueSorted(catalog.flatMap((item) => item.tags ?? [])),
    [catalog],
  );
  const visibleCatalog = useMemo(
    () => catalog.filter((item) => matchesCatalogFilters(item, activeTypes, activeTags)),
    [activeTags, activeTypes, catalog],
  );
  const canUndo = historyState.pointer > 0;
  const canRedo = historyState.pointer < historyState.stack.length - 1;
  const saveStatusLabel = saving ? "Saving…" : isDirty ? "Unsaved changes" : "Draft saved";
  const saveStatusTime = lastSavedAt ? formatTime(lastSavedAt) : "Never saved";
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
  const rememberedVaultPassword = useMemo(
    () => (pipVaultRememberUnlock ? readRememberedPassword() : null),
    [pipVaultRememberUnlock, pipVaultPassword, readRememberedPassword],
  );
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

  const effectiveModuleTx = useMemo(
    () =>
      moduleTxInput.trim() ||
      deployedModuleTx ||
      getEnv("AO_MODULE_TX") ||
      getEnv("VITE_AO_MODULE_TX") ||
      "",
    [deployedModuleTx, moduleTxInput],
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

  const canSpawn = useMemo(
    () => Boolean((manifestTxInput || pip?.manifestTx)?.trim()) && Boolean(effectiveModuleTx),
    [effectiveModuleTx, manifestTxInput, pip?.manifestTx],
  );

  const aoMiniLogRows = useMemo(() => aoLog.slice(0, 20), [aoLog]);
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
      const results = await runHealthChecks();
      setHealth((current) => mergeHealthResults(current, results));

      const snapshot = serializeHealthSnapshot(results);
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
  }, []);

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
        const content = format === "json" ? JSON.stringify(events, null, 2) : healthEventsToCsv(events);
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

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "cyberpunk" ? "light" : "cyberpunk"));
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

  const refreshPipVaultSnapshot = useCallback(async () => {
    const result = await describePipVault();
    if (result.ok) {
      setPipVaultSnapshot(result);
      setPipVaultError(null);
      return result;
    }

    setPipVaultStatus(result.error);
    setPipVaultError(result.error);
    return null;
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
    async (ref?: DraftSourceRef | null) => {
      setDraftDiffOpen(true);
      const targetRef = ref ?? draftDiffRightRef ?? getDefaultDraftDiffRef();
      setDraftDiffRightRef(targetRef ?? null);
      await loadDraftDiffSource(targetRef ?? null);
    },
    [draftDiffRightRef, getDefaultDraftDiffRef, loadDraftDiffSource],
  );

  const closeDraftDiffPanel = useCallback(() => {
    setDraftDiffOpen(false);
    setDraftDiffLoading(false);
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
    fetchCatalog().then(setCatalog);
    refreshDrafts(true);
  }, []);

  useEffect(() => {
    void refreshPipVaultSnapshot();
  }, [refreshPipVaultSnapshot]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void refreshHealthHistory();
  }, [refreshHealthHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HEALTH_AUTO_REFRESH_STORAGE_KEY, healthAutoRefresh);
  }, [healthAutoRefresh]);

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
    if (healthAutoRefresh === "off") return;
    const intervalMs = Number(healthAutoRefresh) * 1000;
    const id = window.setInterval(() => {
      void refreshHealth();
    }, intervalMs);

    return () => {
      window.clearInterval(id);
    };
  }, [healthAutoRefresh, refreshHealth]);

  useEffect(() => {
    if (!healthNotifyEnabled) return;
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
  }, [healthAlertCopy, healthEventLog, healthNotifyEnabled, healthSla]);

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

    let cancelled = false;
    setLoadingManifest(true);
    setRemoteError(null);
    flashStatus("Fetching manifest…");

    fetchManifestDocument(tx)
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
  }, [adoptManifest, flashStatus, pip]);

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
    if (!isDirty || saving) {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistDraft("autosave");
    }, 900);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [isDirty, saving]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty && !saving) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saving]);

  const refreshDrafts = async (loadLatest?: boolean) => {
    const all = await listDrafts();
    setDrafts(all);

    if (loadLatest && all.length) {
      const latest = all[0];
      adoptManifest(latest.document, { resetHistory: true });
      setActiveDraftId(latest.id ?? null);
      setSavedSignature(manifestSignature(latest.document));
      setLastSavedAt(latest.updatedAt);
      void refreshDraftHistory(latest.id ?? null);
      flashStatus("Loaded latest draft");
    }
  };

  const startNewDraft = useCallback((message?: string) => {
    const next = newManifest();
    adoptManifest(next, { resetHistory: true });
    setActiveDraftId(null);
    setDraftHistory([]);
    setSavedSignature(manifestSignature(next));
    setLastSavedAt(null);
    if (message) {
      flashStatus(message);
    }
  }, [adoptManifest, flashStatus]);

  const persistDraft = useCallback(
    async (mode: "manual" | "autosave" | "duplicate") => {
      if (saveInFlightRef.current) return null;

      const snapshot = manifestRef.current;
      const snapshotSignature = manifestSignature(snapshot);
      const draftInput = {
        id: mode === "duplicate" ? undefined : activeDraftIdRef.current ?? undefined,
        name: snapshot.name,
        document: snapshot,
        createdAt: snapshot.metadata.createdAt,
      };

      saveInFlightRef.current = true;
      setSaving(true);

      try {
        const saved =
          mode === "duplicate"
            ? await duplicateDraft({ name: snapshot.name, document: snapshot })
            : await saveDraft(draftInput, mode);

        setDrafts((current) => upsertDraftRow(current, saved));
        setActiveDraftId(saved.id ?? null);
        setSavedSignature(manifestSignature(saved.document));
        setLastSavedAt(saved.updatedAt);
        void refreshDraftHistory(saved.id ?? null);

        if (mode === "duplicate" || manifestSignature(manifestRef.current) === snapshotSignature) {
          adoptManifest(saved.document, { resetHistory: mode === "duplicate" });
        }

        if (mode === "manual") {
          flashStatus("Draft saved to IndexedDB");
        } else if (mode === "duplicate") {
          flashStatus("Draft duplicated");
        }

        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Draft save failed";
        if (mode !== "autosave") {
          flashStatus(message);
        } else {
          flashStatus(`Autosave failed: ${message}`);
        }
        return null;
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    },
    [adoptManifest, flashStatus, refreshDraftHistory],
  );

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

  function handleExportPipVaultRecords() {
    setPipVaultError(null);
    setPipVaultTask({ kind: "records-export", label: "Exporting vault records…" });
    try {
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
    } finally {
      setPipVaultTask(null);
    }
  }

  const handleClearPipVault = async () => {
    if (pipVaultLocked) {
      const message = "Unlock the vault with its password first";
      setPipVaultStatus(message);
      setPipVaultError(message);
      flashStatus(message);
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

  const runEnableVaultPassword = useCallback(
    async (password: string, options?: { auto?: boolean }) => {
      const trimmed = password.trim();
      if (!trimmed) {
        setPipVaultPasswordError("Enter a vault password first");
        if (!options?.auto) {
          flashStatus("Enter a vault password first");
        }
        return;
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
        const result = await enableVaultPassword(trimmed);
        if (!result.ok) {
          setPipVaultStatus(result.error);
          setPipVaultError(result.error);
          if (!options?.auto) {
            flashStatus(result.error);
          }
          rememberPasswordForSession(null, false);
          return;
        }

        const message =
          pipVaultSnapshot?.mode === "password"
            ? pipVaultLocked
              ? "Vault unlocked"
              : "Password rotated"
            : "Password mode enabled";
        const statusMessage = options?.auto ? `${message} (remembered)` : message;
        setPipVaultStatus(statusMessage);
        setPipVaultError(null);
        if (!options?.auto) {
          flashStatus(message);
        }
        rememberPasswordForSession(trimmed);
        setPipVaultPassword("");
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to enable password";
        setPipVaultStatus(null);
        setPipVaultError(message);
        if (!options?.auto) {
          flashStatus(message);
        }
        rememberPasswordForSession(null, false);
      } finally {
        setPipVaultBusy(false);
        setPipVaultTask(null);
      }
    },
    [
      enableVaultPassword,
      pipVaultSnapshot?.mode,
      pipVaultLocked,
      rememberPasswordForSession,
      refreshPipVaultSnapshot,
      refreshPipVaultRecords,
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
  }, [disableVaultPassword, rememberPasswordForSession, refreshPipVaultRecords, refreshPipVaultSnapshot]);

  const handleEnableVaultPassword = async () => {
    const password = pipVaultPassword.trim();
    if (!password && pipVaultSnapshot?.mode !== "password") {
      setPipVaultPasswordError("Enter a vault password first");
      flashStatus("Enter a vault password first");
      return;
    }

    if (pipVaultSnapshot && pipVaultSnapshot.mode !== "password") {
      setPipVaultModeConfirm({ action: "enable", password });
      return;
    }

    await runEnableVaultPassword(password);
  };

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

  const handleExportVaultBundle = async () => {
    setPipVaultError(null);
    setPipVaultTask({ kind: "export", label: "Exporting vault backup…" });
    setPipVaultBusy(true);
    try {
      const result = await exportPipVaultBundle();
      if (!result.ok) {
        setPipVaultStatus(result.error);
        setPipVaultError(result.error);
        flashStatus(result.error);
        return;
      }

      const blob = new Blob([result.bundle], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const suffix = pipVaultSnapshot?.mode === "password" ? "-pw" : "";
      link.download = `pip-vault-backup${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setPipVaultStatus("Vault backup exported");
      setPipVaultError(null);
      flashStatus("Vault backup exported");
    } finally {
      setPipVaultBusy(false);
      setPipVaultTask(null);
    }
  };

  const handleImportVaultBundle = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      let text = "";
      try {
        text = await file.text();
      } catch {
        setPipVaultError("Unable to read vault bundle");
        flashStatus("Unable to read vault bundle");
        return;
      }

      let bundleMode: string | undefined;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.format !== "pip-vault-bundle") {
          setPipVaultError("Selected file is not a vault backup bundle");
          flashStatus("Selected file is not a vault backup bundle");
          return;
        }
        bundleMode = parsed?.mode;
      } catch (err) {
        setPipVaultError("Invalid vault bundle JSON");
        flashStatus("Invalid vault bundle JSON");
        return;
      }

      const rememberedPassword = readRememberedPassword();
      const effectivePassword =
        bundleMode === "password" ? pipVaultPassword.trim() || rememberedPassword || "" : undefined;

      if (bundleMode === "password" && !effectivePassword) {
        const message = "Enter the vault password before importing";
        setPipVaultPasswordError(message);
        setPipVaultError(message);
        flashStatus(message);
        return;
      }

      setPipVaultPasswordError(null);
      setPipVaultError(null);
      setPipVaultTask({ kind: "import", label: "Importing vault backup…" });
      setPipVaultBusy(true);
      try {
        const result = await importPipVaultBundle(text, effectivePassword);
        if (!result.ok) {
          setPipVaultStatus(result.error);
          setPipVaultError(result.error);
          flashStatus(result.error);
          return;
        }

        const message = `Vault imported (${result.records} record${result.records === 1 ? "" : "s"})`;
        setPipVaultStatus(message);
        setPipVaultError(null);
        flashStatus(message);
        rememberPasswordForSession(effectivePassword ?? null);
        if (!pipVaultRememberUnlock) {
          setPipVaultPassword("");
        }
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Vault import failed";
        setPipVaultStatus(null);
        setPipVaultError(message);
        flashStatus(message);
      } finally {
        setPipVaultBusy(false);
        setPipVaultTask(null);
      }

      input.value = "";
    };

    input.click();
  };

  useEffect(() => {
    if (!pipVaultSnapshot || pipVaultBusy) return;
    if (pipVaultSnapshot.mode !== "password" || !pipVaultSnapshot.locked) {
      autoUnlockAttemptRef.current = false;
      return;
    }

    if (!pipVaultRememberUnlock) return;

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

  const readWalletForMode = async (): Promise<Record<string, unknown> | string | null> => {
    if (walletMode === "ipc") {
      if (walletJwk) return walletJwk;
      if (walletPath) return walletPath;
      setWalletFieldError("Pick a wallet via IPC first");
      return null;
    }

    if (walletMode === "path") {
      const pathValue = walletPathInput.trim();
      if (!pathValue) {
        setWalletFieldError("Enter a wallet file path");
        return null;
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

    const parsed = parseWalletJson(walletJwkInput);
    if (!parsed) {
      setWalletFieldError("Paste a valid wallet JSON object");
      return null;
    }

    applyWalletSelection("jwk", {
      jwk: parsed,
      note: "Using pasted wallet JSON",
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
    setDeployOutcome(null);
    setDeployStep(null);
    setModuleSourceError(null);
    setWalletFieldError(null);

    if (!moduleSource.trim()) {
      setModuleSourceError("Add module source before deploying");
      setDeployOutcome("Add module source before deploying");
      setDeployState("error");
      flashStatus("Add module source before deploying");
      return;
    }

    const walletSource = await readWalletForMode();
    if (!walletSource) {
      setDeployState("error");
      return;
    }

    setDeployState("pending");
    setDeployStep("Validating wallet");
    setDeploying(true);

    try {
      setDeployStep("Creating signer");
      const { deployModule } = await loadAoDeployModule();
      const response = await deployModule(walletSource, moduleSource);
      recordAoLog("deploy", response.txId, response.placeholder ? "Placeholder" : "Success", response.raw ?? response);

      if (response.txId) {
        setDeployedModuleTx(response.txId);
        setModuleTxInput(response.txId);
        setModuleTxError(null);
      }

      setDeployOutcome(
        response.note ??
          (response.txId ? `Module deployed: ${response.txId}` : "Module deploy request sent"),
      );

      if (response.placeholder) {
        flashStatus(response.note ?? "Deploy requires wallet access");
        setDeployState("pending");
      } else {
        setDeployState("success");
        setDeployStep("Completed");
        flashStatus(response.txId ? `Module deployed (${response.txId})` : "Module deploy complete");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Module deploy failed";
      recordAoLog(
        "deploy",
        null,
        "Error",
        err instanceof Error ? { message: err.message } : { error: String(err) },
      );
      setDeployOutcome(message);
      setDeployState("error");
      setDeployStep("Failed");
      flashStatus(message);
    } finally {
      setDeploying(false);
    }
  };

  const handleSpawnProcessClick = async () => {
    setSpawnOutcome(null);
    setSpawnStep(null);
    setManifestTxError(null);
    setModuleTxError(null);
    setSchedulerError(null);
    setWalletFieldError(null);

    const manifestTx = manifestTxInput.trim() || pip?.manifestTx || "";
    if (!manifestTx) {
      setManifestTxError("Provide a manifestTx before spawning");
      setSpawnOutcome("Provide a manifestTx before spawning");
      setSpawnState("error");
      flashStatus("Provide a manifestTx before spawning");
      return;
    }

    const moduleTx = effectiveModuleTx;
    if (!moduleTx) {
      setModuleTxError("Set AO_MODULE_TX or deploy a module first");
      setSpawnOutcome("Set AO_MODULE_TX or deploy a module first");
      setSpawnState("error");
      flashStatus("Set AO_MODULE_TX or deploy a module first");
      return;
    }

    setModuleTxError(null);

    const walletSource = await readWalletForMode();
    if (!walletSource) {
      setSpawnState("error");
      return;
    }

    setSpawnState("pending");
    setSpawnStep("Validating wallet");
    setSpawning(true);

    try {
      setSpawnStep("Creating signer");
      const { spawnProcess } = await loadAoDeployModule();
      const response = await spawnProcess(
        scheduler.trim() || undefined,
        manifestTx,
        moduleTx,
        walletSource,
      );
      recordAoLog("spawn", response.processId, response.placeholder ? "Placeholder" : "Success", response.raw ?? response);

      if (response.moduleTx) {
        setModuleTxInput(response.moduleTx);
        setModuleTxError(null);
      }

      setSpawnOutcome(
        response.note ??
          (response.processId ? `Spawned process: ${response.processId}` : "Spawn request sent"),
      );

      if (response.placeholder) {
        flashStatus(response.note ?? "Spawn placeholder");
        setSpawnState("pending");
      } else {
        setSpawnState("success");
        setSpawnStep("Completed");
        flashStatus(
          response.processId ? `Spawned process ${response.processId}` : "Spawn request dispatched",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spawn failed";
      recordAoLog(
        "spawn",
        null,
        "Error",
        err instanceof Error ? { message: err.message } : { error: String(err) },
      );
      setSpawnOutcome(message);
      setSpawnState("error");
      setSpawnStep("Failed");
      flashStatus(message);
    } finally {
      setSpawning(false);
    }
  };

  const handleSearchChange = async (value: string) => {
    setSearch(value);
    const result = await fetchCatalog(value);
    setCatalog(result);
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
    setTreeDropTargetId(null);
  };

  const handleCatalogDragEnd = () => {
    setDraggedCatalogId(null);
    setCompositionDropActive(false);
    setTreeDropTargetId(null);
  };

  const handleCompositionDragOver = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setCompositionDropActive(true);
  };

  const handleCompositionDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setCompositionDropActive(false);
  };

  const handleCompositionDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setCompositionDropActive(false);
    setTreeDropTargetId(null);
    const itemId =
      event.dataTransfer.getData("application/x-blackcat-block") || event.dataTransfer.getData("text/plain");
    if (!itemId) return;

    const dropped = catalog.find((entry) => entry.id === itemId) ?? seedCatalog.find((entry) => entry.id === itemId);
    if (!dropped) {
      flashStatus("Dropped block not found");
      return;
    }

    addFromCatalog(dropped);
  };

  const handleTreeDrop = (targetId: string, itemId: string) => {
    const dropped = catalog.find((entry) => entry.id === itemId) ?? seedCatalog.find((entry) => entry.id === itemId);
    if (!dropped) {
      flashStatus("Dropped block not found");
      return;
    }

    addChildFromCatalog(targetId, dropped);
  };

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

  const handleSaveDraft = async () => {
    const saved = await persistDraft("manual");
    if (saved) {
      await refreshDrafts();
    }
  };

  const handleLoadDraft = async (value: string) => {
    if (!value) {
      startNewDraft();
      return;
    }
    const id = Number(value);
    const draft = await getDraft(id);
    if (draft) {
      adoptManifest(draft.document, { resetHistory: true });
      setActiveDraftId(id);
      setSavedSignature(manifestSignature(draft.document));
      setLastSavedAt(draft.updatedAt);
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
    setRevertTargetId(revision.id);
    adoptManifest(revision.document);
    setActiveDraftId(revision.draftId);
    setLastSavedAt(revision.savedAt);
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
      const data = await exportDraftsToJson();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `darkmesh-drafts-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      flashStatus(`Exported ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`);
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
        flashStatus(`Imported ${imported} draft${imported === 1 ? "" : "s"}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Draft import failed";
        flashStatus(message);
      }

      input.value = "";
    };

    input.click();
  };

  const handleCherryPick = useCallback(
    (entry: DraftDiffEntry, action: "add" | "replace" | "remove") => {
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

      if (message) {
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

  const recordAoLog = (kind: "deploy" | "spawn", id: string | null, status: string, payload?: unknown) => {
    const entry: AoMiniLogEntry = {
      kind,
      id,
      status,
      time: new Date().toISOString(),
      href: buildAoExplorerUrl(id),
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

    setAoLog((current) => [entry, ...current].slice(0, 20));
  };

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

  const closeHotkeyOverlay = useCallback(() => {
    setHotkeyOverlayOpen(false);
  }, []);

  const toggleHotkeyOverlay = useCallback(() => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
    setHotkeyOverlayOpen((open) => !open);
  }, []);

  const runPaletteAction = useCallback(
    async (action: CommandPaletteAction) => {
      closePalette();
      try {
        await action.run();
      } catch (err) {
        flashStatus(err instanceof Error ? err.message : "Command failed");
      }
    },
    [closePalette, flashStatus],
  );

  const paletteActions: CommandPaletteAction[] = [
    {
      id: "workspace-studio",
      label: "Switch to Creator Studio",
      description: "Edit manifests and blocks.",
      shortcut: "Alt+1",
      run: () => setWorkspace("studio"),
    },
    {
      id: "workspace-ao",
      label: "Switch to AO Console",
      description: "Deploy modules and spawn processes.",
      shortcut: "Alt+2",
      run: () => setWorkspace("ao"),
    },
    {
      id: "workspace-data",
      label: "Switch to Data Core",
      description: "Manage encrypted PIP vaults.",
      shortcut: "Alt+3",
      run: () => setWorkspace("data"),
    },
    {
      id: "workspace-preview",
      label: "Switch to Preview Hub",
      description: "View live manifest previews.",
      shortcut: "Alt+4",
      run: () => setWorkspace("preview"),
    },
    {
      id: "toggle-theme",
      label: "Toggle cyberpunk",
      description: theme === "cyberpunk" ? "Switch back to the light skin." : "Enable the cyberpunk skin.",
      shortcut: "Alt+C",
      run: toggleTheme,
    },
    {
      id: "toggle-health",
      label: healthExpanded ? "Collapse health" : "Expand health",
      description: "Show or hide the diagnostics panel.",
      shortcut: "Alt+H",
      run: () => setHealthExpanded((open) => !open),
    },
    {
      id: "new-draft",
      label: "New draft",
      description: "Start from a blank manifest.",
      shortcut: "N",
      run: () => startNewDraft("New draft started"),
    },
    {
      id: "duplicate-draft",
      label: "Duplicate draft",
      description: "Save a copy of the current draft.",
      shortcut: "Alt+N",
      run: () => void handleDuplicateDraft(),
    },
    {
      id: "open-draft-diff",
      label: "Open draft diff",
      description: "Compare current manifest with a saved draft or revision.",
      shortcut: "D",
      run: () => void openDraftDiffPanel(),
    },
    {
      id: "save-draft",
      label: "Save draft",
      description: "Persist the current manifest to IndexedDB.",
      shortcut: "S",
      run: () => void handleSaveDraft(),
    },
    {
      id: "refresh-health",
      label: "Refresh health",
      description: "Run the diagnostics checks again.",
      shortcut: "R",
      run: () => void refreshHealth(),
    },
    {
      id: "load-pip-vault",
      label: "Load PIP from vault",
      description: "Restore the encrypted PIP document from local vault storage.",
      shortcut: "L",
      run: () => void handleLoadPipFromVault(),
    },
    {
      id: "save-pip-vault",
      label: "Save PIP to vault",
      description: "Write the current PIP document into vault storage.",
      shortcut: "V",
      run: () => void handleSavePipToVault(),
    },
    {
      id: "export-drafts",
      label: "Export drafts",
      description: "Download all saved drafts as JSON.",
      shortcut: "Shift+E",
      run: () => void handleExportDrafts(),
    },
    {
      id: "export-manifest",
      label: "Export manifest",
      description: "Download the current manifest as JSON.",
      shortcut: "E",
      run: () => handleExportManifest(),
    },
  ];

  const filteredPaletteActions = paletteActions.filter((action) => {
    const haystack = `${action.label} ${action.description} ${action.shortcut ?? ""} ${action.id}`.toLowerCase();
    const query = paletteQuery.trim().toLowerCase();
    return !query || haystack.includes(query);
  });

  const safePaletteIndex = filteredPaletteActions.length
    ? Math.min(paletteIndex, filteredPaletteActions.length - 1)
    : 0;

  const hotkeySections: HotkeyOverlaySection[] = [
    {
      title: "Global shortcuts",
      items: [
        {
          shortcut: "Cmd/Ctrl+K",
          action: "Command palette",
          description: "Open or close the action palette.",
        },
        {
          shortcut: "Shift+/",
          action: "Hotkey overlay",
          description: "Open or close this reference panel.",
        },
        {
          shortcut: "Cmd/Ctrl+Z",
          action: "Undo",
          description: "Step back through manifest changes (history capped at 20).",
        },
        {
          shortcut: "Shift+Cmd/Ctrl+Z",
          action: "Redo",
          description: "Reapply the next manifest change.",
        },
        {
          shortcut: "Esc",
          action: "Close modal",
          description: "Dismiss the palette or the hotkey overlay.",
        },
      ],
    },
    {
      title: "Palette controls",
      items: [
        {
          shortcut: "Arrow keys",
          action: "Move selection",
          description: "Step through filtered palette actions.",
        },
        {
          shortcut: "Enter",
          action: "Run action",
          description: "Execute the selected palette item.",
        },
      ],
    },
    {
      title: "Workspaces",
      items: [
        { shortcut: "Alt+1", action: "Creator Studio", description: "Build and edit manifests." },
        { shortcut: "Alt+2", action: "AO Console", description: "Deploy and spawn AO processes." },
        { shortcut: "Alt+3", action: "Data Core", description: "Manage PIP vaults and records." },
        { shortcut: "Alt+4", action: "Preview Hub", description: "Preview manifests and blocks." },
      ],
    },
    {
      title: "Palette actions",
      items: paletteActions.map((action) => ({
        shortcut: action.shortcut ?? "—",
        action: action.label,
        description: action.description,
      })),
    },
  ];

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key?.toLowerCase();
      const isPaletteShortcut = key === "k" && (event.metaKey || event.ctrlKey);
      const isAltShortcut = event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey;
      const isHotkeyShortcut =
        (event.shiftKey && key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) || key === "?";
      const isUndoShortcut = key === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
      const isRedoShortcut = key === "z" && (event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey;
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

      if (isAltShortcut && key === "n") {
        event.preventDefault();
        void runPaletteAction({
          id: "duplicate-draft",
          label: "Duplicate draft",
          description: "Save a copy of the current draft.",
          shortcut: "Alt+N",
          run: () => void handleDuplicateDraft(),
        });
        return;
      }

      if (isAltShortcut && ["1", "2", "3", "4"].includes(key)) {
        event.preventDefault();
        const target: Workspace =
          key === "1" ? "studio" : key === "2" ? "ao" : key === "3" ? "data" : "preview";
        void runPaletteAction(
          paletteActions.find((action) => action.id === `workspace-${target}`) ?? {
            id: `workspace-${target}`,
            label: "Switch workspace",
            description: "",
            run: () => setWorkspace(target),
          },
        );
        return;
      }

      if (isAltShortcut && key === "h") {
        event.preventDefault();
        void runPaletteAction({
          id: "toggle-health",
          label: healthExpanded ? "Collapse health" : "Expand health",
          description: "Show or hide the diagnostics panel.",
          shortcut: "Alt+H",
          run: () => setHealthExpanded((open) => !open),
        });
        return;
      }

      if (isAltShortcut && key === "c") {
        event.preventDefault();
        void runPaletteAction({
          id: "toggle-theme",
          label: "Toggle cyberpunk",
          description: "Flip the active renderer theme.",
          shortcut: "Alt+C",
          run: toggleTheme,
        });
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
          if (!filteredPaletteActions.length) return 0;
          return (current + 1) % filteredPaletteActions.length;
        });
        return;
      }

      if (key === "arrowup") {
        event.preventDefault();
        setPaletteIndex((current) => {
          if (!filteredPaletteActions.length) return 0;
          return (current - 1 + filteredPaletteActions.length) % filteredPaletteActions.length;
        });
        return;
      }

      if (key === "enter") {
        event.preventDefault();
        const action = filteredPaletteActions[safePaletteIndex];
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
    filteredPaletteActions,
    paletteActions,
    handleUndo,
    handleRedo,
  ]);

  const hasHealthAlert = healthSummary.failing.length > 0;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-area">
          <div className="brand">
            <div className="brand-dot" />
            <div>
              <p className="eyebrow">Darkmesh editor</p>
              <input
                className="title-input"
                value={manifest.name}
                onChange={(e) => handleManifestName(e.target.value)}
                aria-label="Manifest name"
              />
            </div>
          </div>
          <label className="theme-toggle" title="Toggle theme">
            <input
              type="checkbox"
              checked={theme === "cyberpunk"}
              onChange={(e) => setTheme(e.target.checked ? "cyberpunk" : "light")}
              aria-label="Toggle theme"
            />
            <span className="toggle-rail">
              <span className="toggle-thumb" />
            </span>
            <span className="theme-toggle-label">
              {theme === "cyberpunk" ? "Cyberpunk" : "Light"} mode
            </span>
          </label>
          <button
            className="ghost small hotkey-help-button"
            type="button"
            onClick={toggleHotkeyOverlay}
            aria-label="Open hotkey reference"
            title="Hotkey reference"
          >
            ?
          </button>
        </div>
        <div className="workspace-nav">
          {[
            { id: "studio", label: "Creator Studio" },
            { id: "ao", label: "AO Console" },
            { id: "data", label: "Data Core" },
            { id: "preview", label: "Preview Hub" },
          ].map((item) => (
            <button
              key={item.id}
              className={`chip ${workspace === (item.id as Workspace) ? "active" : ""}`}
              onClick={() => setWorkspace(item.id as Workspace)}
              onMouseEnter={item.id === "ao" ? prefetchAoLogPanel : undefined}
              onFocus={item.id === "ao" ? prefetchAoLogPanel : undefined}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="top-actions">
          {workspace === "ao" && (
            <div className={`health-card ${healthExpanded ? "is-open" : "is-collapsed"}`}>
              <div className="health-header">
                <div>
                  <p className="eyebrow">Health</p>
                  <h4>Diagnostics</h4>
                  <div className="health-sla">
                    <span className={`sla-pill ${healthSla.breached ? "breached" : "ok"}`}>
                      {healthSla.breached ? "SLA breach" : "SLA OK"}
                    </span>
                    <span className="health-sla-note">
                      {healthSla.breached
                        ? healthSla.failureBreached
                          ? `Failures ${healthSla.failureStreak}/${slaFailureThreshold}`
                          : `Avg latency ${healthSla.averageLatency ?? "—"} ms > ${slaLatencyThresholdMs} ms`
                        : `Target: < ${slaFailureThreshold} failures • ≤ ${slaLatencyThresholdMs} ms avg`}
                    </span>
                  </div>
                </div>
                <div className="health-actions">
                  <div className="health-auto-refresh">
                    <label htmlFor="health-auto-refresh">Auto</label>
                    <select
                      id="health-auto-refresh"
                      value={healthAutoRefresh}
                      onChange={(e) => setHealthAutoRefresh(e.target.value as "off" | "30" | "60")}
                      aria-label="Health auto refresh cadence"
                    >
                      <option value="off">Off</option>
                      <option value="30">30s</option>
                      <option value="60">60s</option>
                    </select>
                  </div>
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
                      <span>Fail streak</span>
                      <input
                        type="number"
                        min={1}
                        value={slaFailureThreshold}
                        onChange={(e) => setSlaFailureThreshold(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                        aria-label="Failure streak threshold"
                      />
                    </label>
                    <label className="health-input">
                      <span>Avg latency (ms)</span>
                      <input
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
                      />
                    </label>
                  </div>
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
            <div className="top-buttons">
              <button className="ghost" onClick={handleUndo} disabled={!canUndo} title="Cmd/Ctrl+Z">
                Undo
              </button>
              <button className="ghost" onClick={handleRedo} disabled={!canRedo} title="Shift+Cmd/Ctrl+Z">
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
                <button className="ghost" onClick={() => handleDeleteDraft(activeDraftId)} title="Delete draft">
                  Remove
                </button>
              )}
              <button
                className="ghost"
                onClick={() => void openDraftDiffPanel()}
                onMouseEnter={prefetchDraftDiffPanel}
                onFocus={prefetchDraftDiffPanel}
              >
                Draft diff
              </button>
              <button className="ghost" onClick={handleLoadPip} disabled={loadingManifest}>
                {loadingManifest ? "Loading manifest…" : "Load PIP"}
              </button>
              <button className="ghost" onClick={handleFetchPipFromWorker} disabled={loadingManifest}>
                {loadingManifest ? "…" : "Fetch PIP (worker)"}
              </button>
              <button className="ghost" onClick={handleLoadPipFromVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Load vault"}
              </button>
              <button className="ghost" onClick={handleClearPipVault} disabled={pipVaultBusy || pipVaultLocked}>
                {pipVaultBusy ? "Vault…" : "Delete vault"}
              </button>
              <button className="ghost" onClick={() => startNewDraft("New draft started")}>
                New draft
              </button>
              <button className="ghost" onClick={handleImportDrafts}>
                Import drafts
              </button>
              <button className="ghost" onClick={handleExportDrafts}>
                Export drafts
              </button>
              <button className="ghost" onClick={handleExportManifest}>
                Export manifest
              </button>
              <button className="ghost" onClick={handleDuplicateDraft} disabled={saving}>
                Duplicate draft
              </button>
              <span
                className={`pill save-status ${saving ? "busy" : isDirty ? "dirty" : "saved"}`}
                title={lastSavedAt ? `Last saved ${formatDate(lastSavedAt)}` : "This draft has not been saved yet"}
              >
                <span className="save-status-label">{saveStatusLabel}</span>
                <span className="save-status-time">{saveStatusTime}</span>
              </span>
              <button className="primary" onClick={handleSaveDraft} disabled={saving}>
                {saving ? "Saving…" : "Save draft"}
              </button>
              {pipVaultStatus && <span className="pill ghost pip-vault-pill">{pipVaultStatus}</span>}
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
                <button className="ghost small" type="button" onClick={() => void openDraftDiffPanel()}>
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

      <HotkeyOverlay open={hotkeyOverlayOpen} sections={hotkeySections} onClose={closeHotkeyOverlay} />

      <section
        className="panel pip-vault-panel"
        style={{ display: workspace === "data" ? undefined : "none" }}
      >
        <div className="panel-header">
          <div>
            <p className="eyebrow">PIP vault</p>
            <h3>Local vault panel</h3>
          </div>
          <div className="pip-vault-header-actions">
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
            <span className="pill ghost">
              {pipVaultBlockingIssues.length ? `${pipVaultBlockingIssues.length} blocking issue${pipVaultBlockingIssues.length === 1 ? "" : "s"}` : "Ready to save"}
            </span>
          </div>
        </div>
        {pipVaultTask && (
          <div className="pip-vault-progress" role="status">
            <div className="pip-vault-progress-bar">
              <span className={`fill ${pipVaultTask.kind}`} />
            </div>
            <div className="pip-vault-progress-label">{pipVaultTask.label}</div>
          </div>
        )}
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
                <dd>{pip ? `${normalizeText(pip.tenant) || "tenant?"} / ${normalizeText(pip.site) || "site?"}` : "No PIP loaded"}</dd>
              </div>
            </dl>
          </article>

          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Security</p>
                <h4>Password & backups</h4>
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
                <strong className="mono">{pipVaultSnapshot?.iterations ? `${pipVaultSnapshot.iterations} · PBKDF2` : "—"}</strong>
              </div>
              <div>
                <span>Salt</span>
                <strong className="mono">{pipVaultSnapshot?.salt ? `${pipVaultSnapshot.salt.slice(0, 10)}…` : "—"}</strong>
              </div>
              <div>
                <span>Lock</span>
                <strong>{pipVaultLocked ? "Locked" : "Unlocked"}</strong>
              </div>
            </div>
            <div className="pip-vault-password-row">
              <div className={`pip-vault-password-input ${pipVaultPasswordError ? "has-error" : ""}`}>
                <input
                  type="password"
                  value={pipVaultPassword}
                  onChange={(e) => {
                    setPipVaultPassword(e.target.value);
                    if (pipVaultPasswordError) setPipVaultPasswordError(null);
                  }}
                  placeholder={pipVaultSnapshot?.mode === "password" ? "Enter vault password" : "Set a vault password"}
                  aria-label="Vault password"
                />
                {pipVaultPasswordError ? <p className="field-error">{pipVaultPasswordError}</p> : null}
              </div>
              <button
                className="primary"
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
            <div className="pip-vault-password-meta">
              <label className="remember-toggle">
                <input
                  type="checkbox"
                  checked={pipVaultRememberUnlock}
                  onChange={(e) => handleRememberUnlockToggle(e.target.checked)}
                />
                Remember unlock for this session
                {rememberedVaultPassword ? <span className="remember-hint">Stored for this session</span> : null}
              </label>
              <div className={`pip-vault-strength ${pipVaultPasswordStrength.score ? "" : "muted"}`}>
                <div className="strength-meter">
                  <span style={{ width: `${(pipVaultPasswordStrength.score / 4) * 100}%` }} />
                </div>
                <div className="strength-meta">
                  <strong>
                    {pipVaultPasswordStrength.score ? pipVaultPasswordStrength.label : "Strength"}
                  </strong>
                  <span>
                    {pipVaultPasswordStrength.score ? pipVaultPasswordStrength.hint : "Use 12+ chars with numbers & symbols."}
                  </span>
                </div>
              </div>
            </div>
            <div className="pip-vault-actions">
              <button className="ghost" onClick={handleImportVaultBundle} disabled={pipVaultBusy}>
                {pipVaultTask?.kind === "import" ? "Importing…" : "Import backup"}
              </button>
              <button
                className="ghost"
                onClick={handleExportVaultBundle}
                disabled={pipVaultBusy || (!pipVaultSnapshot?.exists && !pipVaultRecords.length)}
              >
                {pipVaultTask?.kind === "export" ? "Exporting…" : "Export backup"}
              </button>
            </div>
            <p className="hint">Use password mode for portable backups. Import uses the password field when required.</p>
          </article>

          <article className="pip-vault-card">
            <div className="stack-head">
              <div>
                <p className="eyebrow">Active document</p>
                <h4>Current PIP</h4>
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
                <h4>Vault table</h4>
              </div>
              <div className="pip-vault-records-actions">
                <input
                  className="pip-vault-filter"
                  value={pipVaultFilter}
                  onChange={(e) => setPipVaultFilter(e.target.value)}
                  placeholder="Filter by tx, tenant, or site"
                  aria-label="Filter vault records"
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
        {pipVaultStatus && <div className="pip-vault-footer"><span className="pill ghost pip-vault-pill">{pipVaultStatus}</span></div>}
      </section>

      <div className="panels" style={{ display: workspace === "studio" ? undefined : "none" }}>
        <aside className="panel catalog">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalog</p>
              <h3>Blocks</h3>
            </div>
            <span className="pill">
              {visibleCatalog.length}/{catalog.length}
            </span>
          </div>
          <div className="input-wrap">
            <input
              placeholder="Search blocks"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="filter-chips">
            <div className="filter-row">
              <span className="filter-label">Types</span>
              {catalogTypes.map((type) => (
                <button
                  key={type}
                  className={`chip ${activeTypes.includes(type) ? "active" : ""}`}
                  onClick={() => toggleTypeFilter(type)}
                  type="button"
                >
                  {type.replace(/^block\./, "")}
                </button>
              ))}
            </div>
            <div className="filter-row">
              <span className="filter-label">Tags</span>
              {catalogTags.map((tag) => (
                <button
                  key={tag}
                  className={`chip ${activeTags.includes(tag) ? "active" : ""}`}
                  onClick={() => toggleTagFilter(tag)}
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </div>
            {(activeTypes.length > 0 || activeTags.length > 0) && (
              <button
                className="chip reset"
                type="button"
                onClick={() => {
                  setActiveTypes([]);
                  setActiveTags([]);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="catalog-list">
            {visibleCatalog.map((item) => (
              <div
                key={item.id}
                className={`catalog-item ${draggedCatalogId === item.id ? "is-dragging" : ""}`}
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
                  <BlockPlaceholder type={item.type} />
                  <div className="item-title">{item.name}</div>
                  <p className="item-summary">{item.summary}</p>
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
            {visibleCatalog.length === 0 && (
              <div className="empty catalog-empty">
                <p>No blocks match your filters</p>
                <span>Try clearing type or tag filters.</span>
              </div>
            )}
          </div>
        </aside>

        <main className="panel preview">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h3>Composition</h3>
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
          <section
            className="manifest-preview-card"
            aria-label="Current manifest metadata"
            style={{ display: workspace === "preview" ? undefined : "none" }}
          >
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
          <div className="composition-toolbar">
            <div className="selection-readout">
              <span className="pill ghost selection-pill">
                {selectedNodeIds.length ? `${selectedNodeIds.length} selected` : "No selection"}
              </span>
              <span className="hint">Shift/Ctrl-click in the tree to multi-select. Drag/drop still works.</span>
            </div>
            <div className="composition-actions">
              <button className="ghost small" onClick={handleUndo} disabled={!canUndo} title="Cmd/Ctrl+Z">
                Undo
              </button>
              <button className="ghost small" onClick={handleRedo} disabled={!canRedo} title="Shift+Cmd/Ctrl+Z">
                Redo
              </button>
              <button className="ghost small" onClick={handleDuplicateSelection} disabled={!selectedNodeIds.length}>
                Duplicate
              </button>
              <button className="ghost small danger" onClick={handleDeleteSelection} disabled={!selectedNodeIds.length}>
                Delete
              </button>
            </div>
          </div>
          <div
            className={`preview-surface ${compositionDropActive ? "drop-active" : ""}`}
            onDragOver={handleCompositionDragOver}
            onDragEnter={handleCompositionDragOver}
            onDragLeave={handleCompositionDragLeave}
            onDrop={handleCompositionDrop}
          >
            {(!manifest.nodes.length || compositionDropActive) && (
              <div className="composition-dropzone" aria-hidden>
                <div className="dropzone-copy">
                  <span className="dropzone-badge">Drop here</span>
                  <strong>Build the composition by dragging blocks from the catalog.</strong>
                  <p>Drop a block anywhere in this panel to add it to the manifest.</p>
                </div>
                <div className="dropzone-stack">
                  <BlockPlaceholder type="block.hero" />
                  <BlockPlaceholder type="block.featureGrid" />
                  <BlockPlaceholder type="block.gallery" />
                </div>
              </div>
            )}
            {manifest.nodes.length > 0 && (
              <Suspense fallback={<ManifestRendererFallback />}>
                <ManifestRenderer
                  manifest={manifest}
                  selectedIds={selectedNodeIds}
                  primarySelectedId={selectedNodeId}
                  onSelect={(id, meta) => handleSelectNode(id, meta)}
                  dropTargetId={treeDropTargetId}
                  onDropTargetChange={setTreeDropTargetId}
                  onDropCatalogItem={handleTreeDrop}
                  diffHighlight={draftDiffOpen ? draftDiffHighlight : undefined}
                />
              </Suspense>
            )}
          </div>
        </main>

        <aside className="panel props">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inspector</p>
              <h3>Properties</h3>
            </div>
          </div>
          {!selectedNode ? (
            <div className="empty">
              <p>No node selected</p>
              <span>Click a block in the preview to edit props.</span>
            </div>
          ) : (
            <div className="props-body">
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
                <span className="badge schema">{selectedCatalogItem?.type ?? selectedNode.type}</span>
                <span className={`badge ${propsInspection?.valid ? "valid" : "invalid"}`}>
                  {propsInspection?.valid ? "Valid" : "Needs attention"}
                </span>
                <span className="badge ghost">
                  {propsInspection?.diffEntries.length ?? 0} diff
                  {(propsInspection?.diffEntries.length ?? 0) === 1 ? "" : "s"}
                </span>
                <span className="badge ghost">
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
                    <span className="badge ghost">{propsInspection?.issueCount ?? 0}</span>
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
                    <span className="eyebrow">Diff vs defaults</span>
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

      <div className="panel deploy" style={{ display: workspace === "ao" ? undefined : "none" }}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">AO deploy</p>
            <h3>Wallet · Module · Process</h3>
          </div>
          <div className="deploy-chips">
            <span className={`progress-chip ${deployState}`}>
              {deployState === "pending"
                ? "Deploying"
                : deployState === "success"
                  ? "Deploy ready"
                  : deployState === "error"
                    ? "Deploy error"
                    : "Deploy idle"}
            </span>
            <span className={`progress-chip ${spawnState}`}>
              {spawnState === "pending"
                ? "Spawning"
                : spawnState === "success"
                  ? "Spawn ready"
                  : spawnState === "error"
                    ? "Spawn error"
                    : "Spawn idle"}
            </span>
            <div className="pill ghost">
              {deployedModuleTx ? `Module tx • ${deployedModuleTx.slice(0, 10)}…` : "Awaiting module"}
            </div>
          </div>
        </div>
        <div className="deploy-grid">
          <div className="stack">
            <div className="stack-head">
              <p className="eyebrow">Wallet</p>
              <span className={`progress-chip wallet ${walletMode}`}>
                {walletMode === "ipc" ? "IPC" : walletMode === "path" ? "Path" : "JWK"}
              </span>
            </div>
            <div className="mode-switch">
              <button
                className={`chip ${walletMode === "ipc" ? "active" : ""}`}
                type="button"
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
            {walletFieldError ? <p className="error field-error">{walletFieldError}</p> : <p className="subtle">{walletNote ?? "Choose IPC, path, or pasted JWK."}</p>}
          </div>

          <div className="stack">
            <label className="field">
              <span>Module path (optional)</span>
              <input
                placeholder="/path/to/module.js"
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
              <span>Module source</span>
              <textarea
                rows={8}
                value={moduleSource}
                onChange={(e) => {
                  setModuleSource(e.target.value);
                  setModuleSourceError(null);
                }}
                placeholder="Paste AO module JavaScript"
              />
              {moduleSourceError ? <p className="error field-error">{moduleSourceError}</p> : <p className="hint">Deploy reads this source and writes a module tx.</p>}
            </label>
            <div className="inline-actions">
              <button
                className="primary"
                onClick={handleDeployModuleClick}
                disabled={deploying}
                type="button"
                aria-label="Deploy module"
              >
                {deploying ? "Deploying…" : "Deploy module"}
              </button>
              {(deployOutcome || deployStep) && (
                <span className={`pill ${deployState === "error" ? "error" : "ghost"}`}>
                  {deployOutcome || deployStep}
                </span>
              )}
            </div>
            {deployedModuleTx && <p className="subtle mono">Latest module tx: {deployedModuleTx}</p>}
          </div>

          <div className="stack">
            <label className="field">
              <span>manifestTx</span>
              <input
                placeholder="Manifest transaction id"
                value={manifestTxInput}
                onChange={(e) => {
                  setManifestTxInput(e.target.value);
                  setManifestTxError(null);
                }}
              />
              {manifestTxError ? <p className="error field-error">{manifestTxError}</p> : <p className="hint">PIP-loaded manifests auto-fill this field.</p>}
            </label>
            <label className="field">
              <span>AO_MODULE_TX</span>
              <input
                placeholder="Module transaction id"
                value={moduleTxInput}
                onChange={(e) => {
                  setModuleTxInput(e.target.value);
                  setModuleTxError(null);
                }}
              />
              {moduleTxError ? <p className="error field-error">{moduleTxError}</p> : <p className="hint">Autofills from the latest deploy, or read from env.</p>}
            </label>
            <label className="field">
              <span>Scheduler</span>
              <input
                placeholder="Scheduler process id"
                value={scheduler}
                onChange={(e) => {
                  setScheduler(e.target.value);
                  setSchedulerError(null);
                }}
              />
              {schedulerError ? <p className="error field-error">{schedulerError}</p> : <p className="hint">Optional. Leave blank to use AO defaults.</p>}
            </label>
            <div className="inline-actions">
              <button
                className="primary"
                onClick={handleSpawnProcessClick}
                disabled={spawning || !canSpawn}
                type="button"
                aria-label="Spawn process"
                title={!canSpawn ? "Add manifestTx and moduleTx to spawn" : "Spawn process"}
              >
                {spawning ? "Spawning…" : "Spawn process"}
              </button>
              {(spawnOutcome || spawnStep) && (
                <span className={`pill ${spawnState === "error" ? "error" : "ghost"}`}>
                  {spawnOutcome || spawnStep}
                </span>
              )}
            </div>
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
          <AoLogPanel aoLog={aoLog} onCopy={handleCopyAoId} onOpen={handleOpenAoId} />
        </Suspense>
      </div>

      {(draftDiffOpen || draftDiffLoading) && (
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
          />
        </Suspense>
      )}

      {pipVaultModeConfirm && (
        <div className="pip-vault-modal-backdrop">
          <div className="pip-vault-modal" role="dialog" aria-modal="true" aria-label="Confirm vault mode change">
            <p className="eyebrow">Vault mode</p>
            <h4>{pipVaultModeConfirm.action === "enable" ? "Enable password mode?" : "Switch to keychain storage?"}</h4>
            <p>
              {pipVaultModeConfirm.action === "enable"
                ? "Your vault will be re-encrypted with the password you entered. Backups created after this will require that password to open."
                : "Vault encryption will use the system keychain or local key. Password-protected backups will still need their password to restore."}
            </p>
            <div className="pip-vault-modal-actions">
              <button className="ghost" onClick={handleCancelVaultModeConfirm}>
                Cancel
              </button>
              <button className="primary" onClick={handleConfirmVaultMode}>
                {pipVaultModeConfirm.action === "enable" ? "Enable password" : "Use keychain"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status && <div className="status-bar toast">{status}</div>}
      {(pip?.manifestTx || remoteError) && (
        <div className="status-bar ghost">
          {pip?.manifestTx && <span className="pill ghost">manifestTx: {pip.manifestTx}</span>}
          {remoteError && <span className="error">{remoteError}</span>}
        </div>
      )}
      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        selectedIndex={safePaletteIndex}
        actions={filteredPaletteActions}
        inputRef={paletteInputRef}
        onQueryChange={setPaletteQuery}
        onSelectIndex={setPaletteIndex}
        onExecute={runPaletteAction}
        onClose={closePalette}
      />
    </div>
  );
}

export default App;
