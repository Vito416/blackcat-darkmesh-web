import React, { useEffect, useMemo, useState } from "react";

import "./styles.css";
import * as pipClient from "../../../src/manifest/pipClient";
import { fetchCatalog, catalogItems as seedCatalog } from "./services/catalog";
import { fetchManifestDocument } from "./services/manifestFetch";
import {
  CatalogItem,
  ManifestDocument,
  ManifestDraft,
  ManifestNode,
  ManifestShape,
} from "./types/manifest";
import { deleteDraft, getDraft, listDrafts, saveDraft } from "./storage/drafts";

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

interface PipPayload {
  manifestTx: string;
  [key: string]: unknown;
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

  const selectedNode = useMemo(
    () => manifest.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [manifest.nodes, selectedNodeId],
  );

  useEffect(() => {
    fetchCatalog().then(setCatalog);
    refreshDrafts(true);
  }, []);

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
      setSelectedNodeId(manifest.nodes[0].id);
    }
  }, [manifest.nodes, selectedNodeId]);

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
        nodes: prev.nodes.map((node) => (node.id === selectedNodeId ? { ...node, title } : node)),
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
          nodes: prev.nodes.map((node) => (node.id === selectedNodeId ? { ...node, props: parsed } : node)),
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

  const handleExport = () => {
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
          <button className="ghost" onClick={handleExport}>
            Export JSON
          </button>
          <button className="primary" onClick={handleSaveDraft} disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </button>
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
            <div className="pill ghost">{manifest.nodes.length} nodes</div>
          </div>
          <div className="preview-surface">
            {manifest.nodes.length === 0 ? (
              <div className="empty">
                <p>No nodes yet</p>
                <span>Pick a block from the catalog to begin.</span>
              </div>
            ) : (
              manifest.nodes.map((node) => {
                const isSelected = node.id === selectedNodeId;
                return (
                  <article
                    key={node.id}
                    className={`preview-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedNodeId(node.id)}
                  >
                    <div className="card-top">
                      <span className="pill ghost">{node.type}</span>
                      {manifest.entry === node.id && <span className="pill accent">entry</span>}
                    </div>
                    <h4>{node.title}</h4>
                    <p className="item-summary">{Object.keys(node.props ?? {}).length} prop fields</p>
                  </article>
                );
              })
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
