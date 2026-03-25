import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import "./styles.css";
import { fetchCatalog, catalogItems as seedCatalog } from "./services/catalog";
import { deployModule, spawnProcess } from "./services/aoDeploy";
import { runHealthChecks, type HealthStatus } from "./services/health";
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
import { describePipVault, type PipVaultRecord } from "./services/pipVault";
import type { PipDocument } from "./services/pipValidation";
import {
  CatalogItem,
  ManifestDocument,
  ManifestDraft,
  ManifestNode,
  ManifestShape,
  PropsSchema,
} from "./types/manifest";
import ManifestRenderer from "./components/ManifestRenderer";
import {
  deleteDraft,
  exportDraftsToJson,
  duplicateDraft,
  getDraft,
  importDraftsFromJson,
  listDrafts,
  listDraftRevisions,
  saveDraft,
  type DraftRevision,
  type DraftSaveMode,
} from "./storage/drafts";
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
import HotkeyOverlay, { type HotkeyOverlaySection } from "./components/HotkeyOverlay";

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

const mergeHealthResults = (previous: HealthStatus[], next: HealthStatus[]): HealthStatus[] => {
  const previousById = new Map(previous.map((item) => [item.id, item]));

  return next.map((item) => {
    const prior = previousById.get(item.id);
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
      ...(lastError ? { lastError } : {}),
    };
  });
};

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
type WalletMode = "ipc" | "path" | "jwk";
type TaskState = "idle" | "pending" | "success" | "error";
type AoMiniLogEntry = {
  kind: "deploy" | "spawn";
  id: string | null;
  status: string;
  time: string;
  href: string | null;
};
type PipVaultSnapshot = {
  exists: boolean;
  updatedAt?: string;
  encrypted: boolean;
  path: string;
};
type PipVaultIssue = {
  field: string;
  message: string;
  severity: "error" | "warn";
};

const THEME_STORAGE_KEY = "darkmesh-theme";
const getEnv = (key: string): string | undefined => {
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  const fromProcessPrefixed = typeof process !== "undefined" ? process.env?.[`VITE_${key}`] : undefined;
  return fromProcess ?? fromProcessPrefixed;
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
      describe: () => Promise<{ exists: boolean; updatedAt?: string; encrypted: boolean; path: string }>;
      list: () => Promise<{ exists: boolean; records: PipVaultRecord[] }>;
      loadRecord: (id: string) => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> }>;
      deleteRecord: (id: string) => Promise<{ ok: true; removed: boolean }>;
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

const countNodes = (nodes: ManifestNode[]): number =>
  nodes.reduce((total, node) => total + 1 + (node.children ? countNodes(node.children) : 0), 0);

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

const PropsSchemaField: React.FC<{
  schema: PropsSchema | undefined;
  value: unknown;
  path: PropsDraftPath;
  onChange: (path: PropsDraftPath, value: unknown) => void;
}> = ({ schema, value, path, onChange }) => {
  const type = schema?.type ?? (Array.isArray(value) ? "array" : isPlainObject(value) ? "object" : undefined);
  const label = schema?.title ?? path[path.length - 1]?.toString() ?? "Root";
  const description = schema?.description;

  if (type === "object" || (!type && isPlainObject(value))) {
    const record = isPlainObject(value) ? value : {};
    const properties = schema?.properties ?? {};
    const propertyKeys = Object.keys(properties);
    const extraKeys = Object.keys(record).filter((key) => !propertyKeys.includes(key));
    const allKeys = [...propertyKeys, ...extraKeys];

    return (
      <fieldset className="schema-fieldset">
        <div className="schema-fieldset-head">
          <div>
            <span className="schema-label">{label}</span>
            {description ? <p className="schema-description">{description}</p> : null}
          </div>
          <span className="badge ghost">{getSchemaTypeLabel(schema, value)}</span>
        </div>
        <div className="schema-grid">
          {allKeys.length ? (
            allKeys.map((key) => {
              const childSchema = properties[key] ?? (isPlainObject(schema?.additionalProperties) ? schema?.additionalProperties : undefined);
              const childValue = record[key];
              const childPath = [...path, key];
              return (
                <PropsSchemaField
                  key={childPath.join(".")}
                  schema={childSchema}
                  value={childValue}
                  path={childPath}
                  onChange={onChange}
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

  if (type === "array") {
    const items = Array.isArray(value) ? value : [];

    return (
      <fieldset className="schema-fieldset">
        <div className="schema-fieldset-head">
          <div>
            <span className="schema-label">{label}</span>
            {description ? <p className="schema-description">{description}</p> : null}
          </div>
          <button
            className="ghost small"
            type="button"
            onClick={() => onChange(path, [...items, buildFormValue(schema?.items, undefined)])}
          >
            Add item
          </button>
        </div>
        <div className="schema-list">
          {items.length ? (
            items.map((entry, index) => (
              <div key={`${path.join(".")}[${index}]`} className="schema-list-item">
                <div className="schema-list-item-head">
                  <span className="schema-label">{schema?.items?.title ?? `${label} ${index + 1}`}</span>
                  <button className="ghost small" type="button" onClick={() => onChange(path, removeDraftValue(items, [index]))}>
                    Remove
                  </button>
                </div>
                <PropsSchemaField
                  schema={schema?.items}
                  value={entry}
                  path={[...path, index]}
                  onChange={onChange}
                />
              </div>
            ))
          ) : (
            <p className="hint">No items yet.</p>
          )}
        </div>
      </fieldset>
    );
  }

  if (type === "boolean") {
    return (
      <div className="schema-control">
        <span className="schema-label">{label}</span>
        {description ? <p className="schema-description">{description}</p> : null}
        <label className="toggle schema-toggle">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(path, e.target.checked)}
          />
          <span>{Boolean(value) ? "True" : "False"}</span>
        </label>
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="schema-control">
        <span className="schema-label">{label}</span>
        {description ? <p className="schema-description">{description}</p> : null}
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => {
            const next = e.target.value.trim();
            onChange(path, next === "" ? 0 : Number(next));
          }}
        />
      </div>
    );
  }

  if (type === "string" && schema?.enum?.length) {
    return (
      <div className="schema-control">
        <span className="schema-label">{label}</span>
        {description ? <p className="schema-description">{description}</p> : null}
        <select value={typeof value === "string" ? value : String(schema.enum[0] ?? "")} onChange={(e) => onChange(path, e.target.value)}>
          {schema.enum.map((entry) => (
            <option key={String(entry)} value={String(entry)}>
              {String(entry)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "null") {
    return (
      <div className="schema-control">
        <span className="schema-label">{label}</span>
        {description ? <p className="schema-description">{description}</p> : null}
        <input value="null" disabled readOnly />
      </div>
    );
  }

  return (
    <div className="schema-control">
      <span className="schema-label">{label}</span>
      {description ? <p className="schema-description">{description}</p> : null}
      <input
        type="text"
        value={typeof value === "string" ? value : value == null ? "" : String(value)}
        onChange={(e) => onChange(path, e.target.value)}
      />
    </div>
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

function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [catalog, setCatalog] = useState<CatalogItem[]>(seedCatalog);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const initialManifest = useMemo(() => newManifest(), []);
  const [manifest, setManifest] = useState<ManifestDocument>(() => initialManifest);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
  const [saving, setSaving] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revertTargetId, setRevertTargetId] = useState<number | null>(null);
  const [pip, setPip] = useState<PipDocument | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [pipVaultStatus, setPipVaultStatus] = useState<string | null>(null);
  const [pipVaultBusy, setPipVaultBusy] = useState(false);
  const [pipVaultSnapshot, setPipVaultSnapshot] = useState<PipVaultSnapshot | null>(null);
  const [pipVaultRecords, setPipVaultRecords] = useState<PipVaultRecord[]>([]);
  const [pipVaultFilter, setPipVaultFilter] = useState("");
  const [pipVaultRecordsLoading, setPipVaultRecordsLoading] = useState(false);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
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
  const [deployLog, setDeployLog] = useState<AoMiniLogEntry | null>(null);
  const [spawnLog, setSpawnLog] = useState<AoMiniLogEntry | null>(null);
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

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(manifest.nodes, selectedNodeId) : null),
    [manifest.nodes, selectedNodeId],
  );
  const selectedCatalogItem = useMemo(
    () => catalog.find((item) => item.type === selectedNode?.type) ?? seedCatalog.find((item) => item.type === selectedNode?.type) ?? null,
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
  const saveStatusLabel = saving ? "Saving…" : isDirty ? "Unsaved changes" : "Draft saved";
  const saveStatusTime = lastSavedAt ? formatTime(lastSavedAt) : "Never saved";
  const pipVaultValidationIssues = useMemo<PipVaultIssue[]>(() => {
    if (!pip) {
      return [{ field: "vault", message: "Load or fetch a PIP to inspect vault validation", severity: "warn" }];
    }

    const issues: PipVaultIssue[] = [];
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
  }, [pip]);
  const pipVaultBlockingIssues = pipVaultValidationIssues.filter((issue) => issue.severity === "error");
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

  const aoMiniLogRows = useMemo(
    () => [deployLog, spawnLog].filter((entry): entry is AoMiniLogEntry => Boolean(entry)),
    [deployLog, spawnLog],
  );

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const results = await runHealthChecks();
      setHealth((current) => mergeHealthResults(current, results));
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "cyberpunk" ? "light" : "cyberpunk"));
  }, []);

  const refreshPipVaultSnapshot = useCallback(async () => {
    const result = await describePipVault();
    if (result.ok) {
      setPipVaultSnapshot(result);
      return result;
    }

    setPipVaultStatus(result.error);
    return null;
  }, []);

  const refreshPipVaultRecords = useCallback(async () => {
    setPipVaultRecordsLoading(true);
    try {
      const result = await listPipVaultRecords();
      if (result.ok) {
        setPipVaultRecords(result.records);
        return result.records;
      }

      setPipVaultStatus(result.error);
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

  useEffect(() => {
    void refreshDraftHistory(activeDraftId);
  }, [activeDraftId, refreshDraftHistory]);

  useEffect(() => {
    fetchCatalog().then(setCatalog);
    refreshDrafts(true);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

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

  useEffect(() => {
    if (!selectedNodeId && manifest.nodes.length > 0) {
      setSelectedNodeId(manifest.entry ?? manifest.nodes[0].id);
    }
  }, [manifest.entry, manifest.nodes, selectedNodeId]);

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
        setManifest(normalized);
        setActiveDraftId(null);
        setSavedSignature(manifestSignature(normalized));
        setLastSavedAt(normalized.metadata.updatedAt);
        setSelectedNodeId(normalized.entry ?? normalized.nodes[0]?.id ?? null);
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
  }, [pip]);

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
      setManifest(latest.document);
      setActiveDraftId(latest.id ?? null);
      setSavedSignature(manifestSignature(latest.document));
      setLastSavedAt(latest.updatedAt);
      setSelectedNodeId(latest.document.entry ?? latest.document.nodes[0]?.id ?? null);
      void refreshDraftHistory(latest.id ?? null);
      flashStatus("Loaded latest draft");
    }
  };

  const startNewDraft = useCallback((message?: string) => {
    const next = newManifest();
    setManifest(next);
    setActiveDraftId(null);
    setDraftHistory([]);
    setSelectedNodeId(null);
    setSavedSignature(manifestSignature(next));
    setLastSavedAt(null);
    if (message) {
      flashStatus(message);
    }
  }, []);

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
          setManifest(saved.document);
          setSelectedNodeId(saved.document.entry ?? saved.document.nodes[0]?.id ?? null);
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
    [],
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
    setPipVaultBusy(true);
    try {
      const loaded = await loadPipFromVault();
      if (!loaded.ok) {
        const message = loaded.error === "No PIP vault found" ? "Vault empty" : loaded.error;
        setPipVaultStatus(message);
        flashStatus(message);
        return;
      }

      setPip(loaded.pip);
      setRemoteError(null);
      setPipVaultStatus("Vault loaded");
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
      flashStatus(message);
      return;
    }

    if (pipVaultBlockingIssues.length > 0) {
      const message = "Fix validation issues before saving to vault";
      setPipVaultStatus(message);
      flashStatus(message);
      return;
    }

    setPipVaultBusy(true);
    try {
      const saved = await savePipToVault(pip);
      if (saved.ok) {
        const message = `Vault saved ${formatDate(saved.updatedAt)}`;
        setPipVaultStatus(message);
        flashStatus("PIP saved to vault");
        await refreshPipVaultSnapshot();
        await refreshPipVaultRecords();
      } else {
        setPipVaultStatus(saved.error);
        flashStatus(saved.error);
      }
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleClearPipVault = async () => {
    setPipVaultBusy(true);
    try {
      const cleared = await clearPipVaultStorage();
      if (!cleared.ok) {
        setPipVaultStatus(cleared.error);
        flashStatus(cleared.error);
        return;
      }

      setPipVaultStatus("Vault deleted");
      flashStatus("PIP vault deleted");
      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } finally {
      setPipVaultBusy(false);
    }
  };

  const handleLoadVaultRecord = async (recordId: string) => {
    setPipVaultBusy(true);
    try {
      const loaded = await loadPipFromVaultRecord(recordId);
      if (!loaded.ok) {
        setPipVaultStatus(loaded.error);
        flashStatus(loaded.error);
        return;
      }

      setPip(loaded.pip);
      setRemoteError(null);
      setPipVaultStatus(`Loaded record ${recordId}`);
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

    setPipVaultBusy(true);
    try {
      const result = await deletePipVaultRecordStorage(recordId);
      if (!result.ok) {
        setPipVaultStatus(result.error);
        flashStatus(result.error);
        return;
      }

      if (result.removed) {
        setPipVaultStatus("Vault record deleted");
        flashStatus("PIP vault record deleted");
      } else {
        setPipVaultStatus("Record not found");
        flashStatus("Record not found");
      }

      await refreshPipVaultSnapshot();
      await refreshPipVaultRecords();
    } finally {
      setPipVaultBusy(false);
    }
  };

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
      const response = await deployModule(walletSource, moduleSource);
      recordAoLog("deploy", response.txId, response.placeholder ? "Placeholder" : "Success");

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
      recordAoLog("deploy", null, "Error");
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
      const response = await spawnProcess(
        scheduler.trim() || undefined,
        manifestTx,
        moduleTx,
        walletSource,
      );
      recordAoLog("spawn", response.processId, response.placeholder ? "Placeholder" : "Success");

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
      recordAoLog("spawn", null, "Error");
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

  const addFromCatalog = (item: CatalogItem) => {
    const node = fromCatalog(item);
    setManifest((prev) =>
      touch({
        ...prev,
        entry: prev.entry ?? node.id,
        nodes: [...prev.nodes, node],
      }),
    );
    setSelectedNodeId(node.id);
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
    setSelectedNodeId(node.id);
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
      setManifest(draft.document);
      setActiveDraftId(id);
      setSavedSignature(manifestSignature(draft.document));
      setLastSavedAt(draft.updatedAt);
      setSelectedNodeId(draft.document.entry ?? draft.document.nodes[0]?.id ?? null);
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
    setManifest(revision.document);
    setActiveDraftId(revision.draftId);
    setSelectedNodeId(revision.document.entry ?? revision.document.nodes[0]?.id ?? null);
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

  const flashStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 1800);
  };

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

  const recordAoLog = (kind: "deploy" | "spawn", id: string | null, status: string) => {
    const entry: AoMiniLogEntry = {
      kind,
      id,
      status,
      time: new Date().toISOString(),
      href: buildAoExplorerUrl(id),
    };

    if (kind === "deploy") {
      setDeployLog(entry);
    } else {
      setSpawnLog(entry);
    }
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
  ]);

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
        <div className="top-actions">
          <div className={`health-card ${healthExpanded ? "is-open" : "is-collapsed"}`}>
            <div className="health-header">
              <div>
                <p className="eyebrow">Health</p>
                <h4>Diagnostics</h4>
              </div>
              <div className="health-actions">
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
                  </>
                )}
              </div>
            )}
            <div className="health-collapse" id="health-panel" aria-hidden={!healthExpanded}>
              <div className="health-list">
                {health.length === 0 ? (
                  <p className="health-empty">No checks yet</p>
                ) : (
                  health.map((item) => (
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
                        {item.lastError && (
                          <div className="health-last-error">Last error: {item.lastError}</div>
                        )}
                        <div className="health-meta">
                          {typeof item.latencyMs === "number" && <span>{item.latencyMs} ms</span>}
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
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="top-buttons">
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
            <button className="ghost" onClick={handleLoadPip} disabled={loadingManifest}>
              {loadingManifest ? "Loading manifest…" : "Load PIP"}
            </button>
            <button className="ghost" onClick={handleFetchPipFromWorker} disabled={loadingManifest}>
              {loadingManifest ? "…" : "Fetch PIP (worker)"}
            </button>
            <button className="ghost" onClick={handleLoadPipFromVault} disabled={pipVaultBusy}>
              {pipVaultBusy ? "Vault…" : "Load vault"}
            </button>
            <button className="ghost" onClick={handleClearPipVault} disabled={pipVaultBusy}>
              {pipVaultBusy ? "Vault…" : "Delete vault"}
            </button>
            <button
              className="ghost"
              onClick={() => startNewDraft("New draft started")}
            >
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
          <section className="draft-history-panel" aria-label="Draft save history">
            <div className="draft-history-head">
              <div>
                <p className="eyebrow">Draft history</p>
                <h4>Save timeline</h4>
              </div>
              <span className="pill ghost">
                {historyLoading
                  ? "Loading…"
                  : draftHistory.length
                    ? `${draftHistory.length} save${draftHistory.length === 1 ? "" : "s"}`
                    : "No saves yet"}
              </span>
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

      <section className="panel pip-vault-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">PIP vault</p>
            <h3>Local vault panel</h3>
          </div>
          <div className="pip-vault-header-actions">
            <span className={`pill ${pipVaultSnapshot?.exists ? "accent" : "ghost"}`}>
              {pipVaultSnapshot?.exists ? "Vault present" : "Vault empty"}
            </span>
            <span className="pill ghost">
              {pipVaultBlockingIssues.length ? `${pipVaultBlockingIssues.length} blocking issue${pipVaultBlockingIssues.length === 1 ? "" : "s"}` : "Ready to save"}
            </span>
          </div>
        </div>
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
              <button className="ghost" onClick={handleLoadPipFromVault} disabled={pipVaultBusy}>
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
              <button className="ghost" onClick={handleClearPipVault} disabled={pipVaultBusy}>
                {pipVaultBusy ? "Vault…" : "Delete vault"}
              </button>
              <button className="ghost" onClick={() => void refreshPipVaultSnapshot()} disabled={pipVaultBusy}>
                Refresh
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
                <button className="ghost small" onClick={() => void refreshPipVaultRecords()} disabled={pipVaultRecordsLoading || pipVaultBusy}>
                  {pipVaultRecordsLoading ? "Refreshing…" : "Refresh"}
                </button>
                {pipVaultFilter && (
                  <button className="ghost small" onClick={() => setPipVaultFilter("")}>
                    Clear
                  </button>
                )}
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
                              disabled={pipVaultBusy || pipVaultRecordsLoading}
                            >
                              Load
                            </button>
                            <button
                              className="ghost small danger"
                              onClick={() => void handleDeleteVaultRecord(record.id)}
                              disabled={pipVaultBusy || pipVaultRecordsLoading}
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

      <div className="panels">
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
              <ManifestRenderer
                manifest={manifest}
                selectedId={selectedNodeId}
                onSelect={(id) => setSelectedNodeId(id)}
                dropTargetId={treeDropTargetId}
                onDropTargetChange={setTreeDropTargetId}
                onDropCatalogItem={handleTreeDrop}
              />
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

      <div className="panel deploy">
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
                  aoMiniLogRows.map((entry) => (
                    <tr key={entry.kind}>
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
      </div>

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
