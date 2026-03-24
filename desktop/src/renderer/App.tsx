import React, { useCallback, useEffect, useMemo, useState } from "react";

import "./styles.css";
import * as pipClient from "../../../src/manifest/pipClient";
import { fetchCatalog, catalogItems as seedCatalog } from "./services/catalog";
import { deployModule, spawnProcess } from "./services/aoDeploy";
import { runHealthChecks, type HealthStatus } from "./services/health";
import { fetchManifestDocument } from "./services/manifestFetch";
import {
  CatalogItem,
  ManifestDocument,
  ManifestDraft,
  ManifestNode,
  ManifestShape,
} from "./types/manifest";
import ManifestRenderer from "./components/ManifestRenderer";
import {
  deleteDraft,
  exportDraftsToJson,
  getDraft,
  importDraftsFromJson,
  listDrafts,
  saveDraft,
} from "./storage/drafts";

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
  props: item.defaultProps ? { ...item.defaultProps } : {},
  children: [],
});

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");
const formatTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

const formatHost = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "");
  }
};

interface PipPayload {
  manifestTx: string;
  [key: string]: unknown;
}

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

declare global {
  interface Window {
    desktop?: {
      selectWallet: () => Promise<WalletBridgeResult>;
      pickModuleFile: () => Promise<FileBridgeResult>;
      readTextFile: (path: string) => Promise<FileBridgeResult>;
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

const countNodes = (nodes: ManifestNode[]): number =>
  nodes.reduce((total, node) => total + 1 + (node.children ? countNodes(node.children) : 0), 0);

function App() {
  const [catalog, setCatalog] = useState<CatalogItem[]>(seedCatalog);
  const [search, setSearch] = useState("");
  const [manifest, setManifest] = useState<ManifestDocument>(() => newManifest());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [propsDraft, setPropsDraft] = useState("");
  const [propsError, setPropsError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ManifestDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pip, setPip] = useState<PipPayload | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [walletPath, setWalletPath] = useState<string | null>(null);
  const [walletJwk, setWalletJwk] = useState<Record<string, unknown> | null>(null);
  const [walletNote, setWalletNote] = useState<string | null>(null);
  const [modulePath, setModulePath] = useState("");
  const [moduleSource, setModuleSource] = useState("");
  const [manifestTxInput, setManifestTxInput] = useState("");
  const [scheduler, setScheduler] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [deployOutcome, setDeployOutcome] = useState<string | null>(null);
  const [spawnOutcome, setSpawnOutcome] = useState<string | null>(null);
  const [deployedModuleTx, setDeployedModuleTx] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => (selectedNodeId ? findNodeById(manifest.nodes, selectedNodeId) : null),
    [manifest.nodes, selectedNodeId],
  );
  const totalNodes = useMemo(() => countNodes(manifest.nodes), [manifest.nodes]);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const results = await runHealthChecks();
      setHealth(results);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog().then(setCatalog);
    refreshDrafts(true);
  }, []);

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (selectedNode) {
      setPropsDraft(JSON.stringify(selectedNode.props ?? {}, null, 2));
      setPropsError(null);
    } else {
      setPropsDraft("");
    }
  }, [selectedNode]);

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
    }
  }, [pip?.manifestTx]);

  const refreshDrafts = async (loadLatest?: boolean) => {
    const all = await listDrafts();
    setDrafts(all);

    if (loadLatest && all.length) {
      const latest = all[0];
      setManifest(latest.document);
      setActiveDraftId(latest.id ?? null);
      setSelectedNodeId(latest.document.entry ?? latest.document.nodes[0]?.id ?? null);
      flashStatus("Loaded latest draft");
    }
  };

  const handleLoadPip = () => {
    const raw = window.prompt("Paste PIP JSON (must include manifestTx) or a manifest txid");
    if (!raw) return;

    const trimmed = raw.trim();
    if (!trimmed) return;

    try {
      const parsed = trimmed.startsWith("{")
        ? (JSON.parse(trimmed) as PipPayload)
        : ({ manifestTx: trimmed } as PipPayload);

      if (!parsed.manifestTx || typeof parsed.manifestTx !== "string") {
        throw new Error("PIP missing manifestTx");
      }

      setPip(parsed);
      setRemoteError(null);
      flashStatus("PIP loaded");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to parse PIP";
      setRemoteError(message);
      flashStatus(`PIP load failed: ${message}`);
    }
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

      const pip = subject && nonce
        ? await pipClient.fetchPip(subject, nonce)
        : await pipClient.getLatestPip(tenant, site);

      setPip(pip as PipPayload);
      flashStatus(`PIP loaded (${pip.manifestTx})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch PIP";
      setRemoteError(message);
      flashStatus(message);
    } finally {
      setLoadingManifest(false);
    }
  };

  const handlePickWallet = async () => {
    if (!window.desktop?.selectWallet) {
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
        setWalletNote(result.error);
        flashStatus(result.error);
        return;
      }

      if (result?.jwk) {
        setWalletJwk(result.jwk);
        setWalletPath(result.path ?? null);
        setWalletNote(result.path ? `Loaded wallet from ${result.path}` : "Wallet JSON received from IPC");
        flashStatus("Wallet loaded");
        return;
      }

      if (result?.path) {
        setWalletPath(result.path);
        setWalletJwk(null);
        setWalletNote("Wallet path captured; preload must provide JSON contents");
        flashStatus("Wallet path captured");
        return;
      }

      flashStatus("No wallet selected");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallet picker failed";
      setWalletNote(message);
      flashStatus(message);
    }
  };

  const handleLoadModuleFromDialog = async () => {
    if (!window.desktop?.pickModuleFile) {
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
      flashStatus(result.error);
      return;
    }

    if (result?.path) setModulePath(result.path);
    if (typeof result?.content === "string") setModuleSource(result.content);
    flashStatus(result?.path ? `Loaded module from ${result.path}` : "Module loaded");
  };

  const handleLoadModuleFromPath = async () => {
    if (!modulePath.trim()) {
      flashStatus("Enter a module file path");
      return;
    }

    if (!window.desktop?.readTextFile) {
      flashStatus("IPC file reader unavailable");
      return;
    }

    const result = await window.desktop.readTextFile(modulePath.trim());

    if (result?.error) {
      setDeployOutcome(result.error);
      flashStatus(result.error);
      return;
    }

    if (result?.path) setModulePath(result.path);
    if (typeof result?.content === "string") setModuleSource(result.content);
    flashStatus(`Loaded module from ${result?.path ?? modulePath}`);
  };

  const handleDeployModuleClick = async () => {
    if (!moduleSource.trim()) {
      flashStatus("Add module source before deploying");
      return;
    }

    setDeployOutcome(null);
    setDeploying(true);

    try {
      const response = await deployModule(walletJwk ?? walletPath ?? undefined, moduleSource);

      if (response.txId) {
        setDeployedModuleTx(response.txId);
      }

      setDeployOutcome(
        response.note ??
          (response.txId ? `Module deployed: ${response.txId}` : "Module deploy request sent"),
      );

      if (response.placeholder) {
        flashStatus(response.note ?? "Deploy requires wallet access");
      } else {
        flashStatus(response.txId ? `Module deployed (${response.txId})` : "Module deploy complete");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Module deploy failed";
      setDeployOutcome(message);
      flashStatus(message);
    } finally {
      setDeploying(false);
    }
  };

  const handleSpawnProcessClick = async () => {
    const manifestTx = manifestTxInput.trim() || pip?.manifestTx || "";
    if (!manifestTx) {
      flashStatus("Provide a manifestTx before spawning");
      return;
    }

    setSpawnOutcome(null);
    setSpawning(true);

    try {
      const response = await spawnProcess(
        scheduler.trim() || undefined,
        manifestTx,
        deployedModuleTx ?? undefined,
      );

      setSpawnOutcome(
        response.note ??
          (response.processId ? `Spawned process: ${response.processId}` : "Spawn request sent"),
      );

      if (response.placeholder) {
        flashStatus(response.note ?? "Spawn placeholder");
      } else {
        flashStatus(
          response.processId ? `Spawned process ${response.processId}` : "Spawn request dispatched",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Spawn failed";
      setSpawnOutcome(message);
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

  const updateNodeTitle = (title: string) => {
    if (!selectedNodeId) return;
    setManifest((prev) =>
      touch({
        ...prev,
        nodes: updateNodeInTree(prev.nodes, selectedNodeId, (node) => ({ ...node, title })),
      }),
    );
  };

  const applyProps = () => {
    if (!selectedNodeId) return;
    try {
      const parsed = propsDraft.trim() ? (JSON.parse(propsDraft) as ManifestShape) : {};
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Props must be an object");
      }
      setManifest((prev) =>
        touch({
          ...prev,
          nodes: updateNodeInTree(prev.nodes, selectedNodeId, (node) => ({ ...node, props: parsed })),
        }),
      );
      setPropsError(null);
      flashStatus("Props updated");
    } catch (err) {
      setPropsError(err instanceof Error ? err.message : "Unable to parse props JSON");
    }
  };

  const handleManifestName = (value: string) => {
    setManifest((prev) => touch({ ...prev, name: value || "Untitled manifest" }));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    const doc = touch(manifest);
    setManifest(doc);
    const id = await saveDraft({
      id: activeDraftId ?? undefined,
      name: doc.name,
      document: doc,
      createdAt: manifest.metadata.createdAt,
    });
    setActiveDraftId(id);
    await refreshDrafts();
    flashStatus("Draft saved to IndexedDB");
    setSaving(false);
  };

  const handleLoadDraft = async (value: string) => {
    if (!value) {
      setActiveDraftId(null);
      setManifest(newManifest());
      setSelectedNodeId(null);
      return;
    }
    const id = Number(value);
    const draft = await getDraft(id);
    if (draft) {
      setManifest(draft.document);
      setActiveDraftId(id);
      setSelectedNodeId(draft.document.entry ?? draft.document.nodes[0]?.id ?? null);
      flashStatus("Draft loaded");
    }
  };

  const handleDeleteDraft = async (id: number) => {
    await deleteDraft(id);
    if (id === activeDraftId) {
      setActiveDraftId(null);
      setManifest(newManifest());
      setSelectedNodeId(null);
    }
    refreshDrafts();
    flashStatus("Draft removed");
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

  return (
    <div className="app-shell">
      <header className="top-bar">
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
        <div className="top-actions">
          <div className="health-card">
            <div className="health-header">
              <div>
                <p className="eyebrow">Health</p>
                <h4>Diagnostics</h4>
              </div>
              <button className="ghost small" onClick={refreshHealth} disabled={healthLoading}>
                {healthLoading ? "Checking…" : "Refresh"}
              </button>
            </div>
            <div className="health-list">
              {health.length === 0 ? (
                <p className="health-empty">No checks yet</p>
              ) : (
                health.map((item) => (
                  <div key={item.id} className="health-row">
                    <span className={`status-dot ${item.status}`} aria-hidden />
                    <div className="health-row-content">
                      <div className="health-row-top">
                        <span className="health-label">{item.label}</span>
                        <span className="health-metric">
                          {typeof item.latencyMs === "number" ? `${item.latencyMs} ms` : "—"}
                        </span>
                      </div>
                      <div className="health-detail">
                        {item.detail ?? (item.status === "missing" ? "Not configured" : "No detail")}
                      </div>
                      <div className="health-meta">
                        {item.status === "missing" ? "Set env to enable" : `Checked ${formatTime(item.checkedAt)}`}
                        {item.url && <span className="health-url"> · {formatHost(item.url)}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
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
            <button
              className="ghost"
              onClick={() => {
                setManifest(newManifest());
                setActiveDraftId(null);
                setSelectedNodeId(null);
              }}
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
            <button className="primary" onClick={handleSaveDraft} disabled={saving}>
              {saving ? "Saving…" : "Save draft"}
            </button>
          </div>
        </div>
      </header>

      <div className="panels">
        <aside className="panel catalog">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Catalog</p>
              <h3>Blocks</h3>
            </div>
            <span className="pill">{catalog.length}</span>
          </div>
          <div className="input-wrap">
            <input
              placeholder="Search blocks"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="catalog-list">
            {catalog.map((item) => (
              <div key={item.id} className="catalog-item">
                <div>
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
                <button className="primary small" onClick={() => addFromCatalog(item)}>
                  Add
                </button>
              </div>
            ))}
          </div>
        </aside>

        <main className="panel preview">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Preview</p>
              <h3>Composition</h3>
            </div>
            <div className="pill ghost">
              {totalNodes} node{totalNodes === 1 ? "" : "s"}
            </div>
          </div>
          <div className="preview-surface">
            <ManifestRenderer
              manifest={manifest}
              selectedId={selectedNodeId}
              onSelect={(id) => setSelectedNodeId(id)}
            />
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
              <label className="field">
                <span>Title</span>
                <input value={selectedNode.title} onChange={(e) => updateNodeTitle(e.target.value)} />
              </label>
              <label className="field">
                <span>Props JSON</span>
                <textarea rows={10} value={propsDraft} onChange={(e) => setPropsDraft(e.target.value)} />
                {propsError ? <p className="error">{propsError}</p> : <p className="hint">Edit as JSON</p>}
              </label>
              <button className="primary" onClick={applyProps}>
                Apply props
              </button>
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
          <div className="pill ghost">
            {deployedModuleTx ? `Module tx • ${deployedModuleTx.slice(0, 10)}…` : "Awaiting module"}
          </div>
        </div>
        <div className="deploy-grid">
          <div className="stack">
            <p className="eyebrow">Wallet</p>
            <div className="pill ghost mono">
              {walletPath || walletJwk ? walletPath ?? "JWK from IPC" : "No wallet selected"}
            </div>
            <div className="inline-actions">
              <button className="ghost small" onClick={handlePickWallet}>
                Pick wallet
              </button>
              {(walletPath || walletJwk) && (
                <button
                  className="ghost small"
                  onClick={() => {
                    setWalletPath(null);
                    setWalletJwk(null);
                    setWalletNote(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <p className="subtle">
              {walletNote ?? "IPC reads the JWK file and shares JSON with the renderer."}
            </p>
          </div>

          <div className="stack">
            <label className="field">
              <span>Module path (optional)</span>
              <input
                placeholder="/path/to/module.js"
                value={modulePath}
                onChange={(e) => setModulePath(e.target.value)}
              />
              <div className="inline-actions">
                <button className="ghost small" onClick={handleLoadModuleFromPath}>
                  Load path
                </button>
                <button className="ghost small" onClick={handleLoadModuleFromDialog}>
                  Browse…
                </button>
              </div>
            </label>
            <label className="field">
              <span>Module source</span>
              <textarea
                rows={8}
                value={moduleSource}
                onChange={(e) => setModuleSource(e.target.value)}
                placeholder="Paste AO module JavaScript"
              />
            </label>
            <div className="inline-actions">
              <button className="primary" onClick={handleDeployModuleClick} disabled={deploying}>
                {deploying ? "Deploying…" : "Deploy module"}
              </button>
              {deployOutcome && <span className="pill ghost">{deployOutcome}</span>}
            </div>
            {deployedModuleTx && <p className="subtle mono">Latest module tx: {deployedModuleTx}</p>}
          </div>

          <div className="stack">
            <label className="field">
              <span>manifestTx</span>
              <input
                placeholder="Manifest transaction id"
                value={manifestTxInput}
                onChange={(e) => setManifestTxInput(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Scheduler (optional)</span>
              <input
                placeholder="Scheduler process id"
                value={scheduler}
                onChange={(e) => setScheduler(e.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button className="primary" onClick={handleSpawnProcessClick} disabled={spawning}>
                {spawning ? "Spawning…" : "Spawn process"}
              </button>
              {spawnOutcome && <span className="pill ghost">{spawnOutcome}</span>}
            </div>
            {!spawnOutcome && deployedModuleTx && (
              <p className="subtle mono">Spawn will use module tx: {deployedModuleTx}</p>
            )}
          </div>
        </div>
      </div>

      {status && <div className="status-bar">{status}</div>}
      {(pip?.manifestTx || remoteError) && (
        <div className="status-bar ghost">
          {pip?.manifestTx && <span className="pill ghost">manifestTx: {pip.manifestTx}</span>}
          {remoteError && <span className="error">{remoteError}</span>}
        </div>
      )}
    </div>
  );
}

export default App;
