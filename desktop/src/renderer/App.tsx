import React, { useEffect, useMemo, useState } from "react";
import * as pipClient from "../../../src/manifest/pipClient";
import { catalogItems, fetchCatalog } from "./services/catalog";
import {
  DraftRecord,
  deleteDraft,
  listDrafts,
  loadDraft,
  saveDraft,
} from "./storage/drafts";
import { CatalogItem, ManifestDocument, ManifestNode } from "./types/manifest";

const createId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const createManifest = (): ManifestDocument => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: "Untitled manifest",
    version: "0.1.0",
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
    nodes: [],
  };
};

const styles: Record<string, React.CSSProperties> = {
  app: {
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "280px 1fr 320px",
    background: "radial-gradient(circle at 20% 20%, #1b2333, #0c0f16 65%)",
    color: "#e7e9ef",
    fontFamily: "Inter, 'Soehne', system-ui, -apple-system, sans-serif",
  },
  sidebar: {
    borderRight: "1px solid #1f232d",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "rgba(18, 22, 33, 0.85)",
    backdropFilter: "blur(6px)",
  },
  middle: {
    padding: "18px 18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  right: {
    borderLeft: "1px solid #1f232d",
    padding: "16px",
    background: "#0f141f",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  panelTitle: {
    fontSize: 12,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#8a94a7",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #252c3b",
    background: "#0c111a",
    color: "#e7e9ef",
    fontSize: 14,
  },
  smallButton: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #2d3344",
    background: "linear-gradient(135deg, #1f2735, #1a202e)",
    color: "#e7e9ef",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },
  ghostButton: {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #293040",
    background: "transparent",
    color: "#9ca5b5",
    cursor: "pointer",
    fontSize: 13,
  },
  catalogCard: {
    border: "1px solid #1f2637",
    borderRadius: 10,
    padding: "10px 12px",
    background: "#0e121c",
    boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
  },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 999,
    background: "#1e2635",
    color: "#aeb7c7",
    fontSize: 11,
  },
  placeholder: {
    border: "1px dashed #2d3650",
    borderRadius: 12,
    padding: "18px",
    background: "rgba(18, 22, 33, 0.55)",
    color: "#94a1b9",
    minHeight: 180,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

const withUpdatedAt = (manifest: ManifestDocument): ManifestDocument => ({
  ...manifest,
  metadata: { ...manifest.metadata, updatedAt: new Date().toISOString() },
});

const updateNode = (
  nodes: ManifestNode[],
  id: string,
  updater: (node: ManifestNode) => ManifestNode,
): ManifestNode[] =>
  nodes.map((node) =>
    node.id === id
      ? updater(node)
      : {
          ...node,
          children: node.children ? updateNode(node.children, id, updater) : undefined,
        },
  );

const formatStamp = (stamp?: number | string) => {
  if (!stamp) return "—";
  const date = typeof stamp === "number" ? new Date(stamp) : new Date(stamp);
  return date.toLocaleString();
};

export default function App() {
  const [catalog, setCatalog] = useState<CatalogItem[]>(catalogItems);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [manifest, setManifest] = useState<ManifestDocument>(() => createManifest());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [propsEditor, setPropsEditor] = useState<string>("{}");
  const [draftName, setDraftName] = useState("Untitled draft");
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const env = typeof import.meta !== "undefined" ? (import.meta as any).env ?? {} : {};
  const [pipTenant, setPipTenant] = useState<string>(env.VITE_PIP_TENANT ?? "");
  const [pipSite, setPipSite] = useState<string>(env.VITE_PIP_SITE ?? "");
  const [pipSubject, setPipSubject] = useState<string>(env.VITE_PIP_SUBJECT ?? "");
  const [pipNonce, setPipNonce] = useState<string>(env.VITE_PIP_NONCE ?? "");
  const [pipBaseUrl, setPipBaseUrl] = useState<string>(
    env.VITE_PIP_BASE ?? env.VITE_WORKER_PIP_BASE ?? env.VITE_WORKER_BASE_URL ?? "",
  );
  const [pipToken, setPipToken] = useState<string>(env.VITE_PIP_TOKEN ?? "");
  const [pipLatestPath, setPipLatestPath] = useState<string>(env.VITE_PIP_LATEST_PATH ?? "");
  const [pipLoading, setPipLoading] = useState(false);

  const selectedNode = useMemo(() => {
    const match = manifest.nodes.find((node) => node.id === selectedNodeId);
    return match ?? manifest.nodes[0] ?? null;
  }, [manifest.nodes, selectedNodeId]);

  useEffect(() => {
    const handle = setTimeout(() => {
      refreshCatalog(catalogSearch);
    }, 160);
    return () => clearTimeout(handle);
  }, [catalogSearch]);

  useEffect(() => {
    refreshDrafts();
  }, []);

  useEffect(() => {
    if (selectedNode) {
      setPropsEditor(JSON.stringify(selectedNode.props, null, 2));
    } else {
      setPropsEditor("{}");
    }
  }, [selectedNode]);

  const refreshCatalog = async (query?: string) => {
    setCatalogLoading(true);
    const items = await fetchCatalog(query);
    setCatalog(items);
    setCatalogLoading(false);
  };

  const refreshDrafts = async () => {
    const items = await listDrafts();
    setDrafts(items);
  };

  const handleAddBlock = (item: CatalogItem) => {
    const node: ManifestNode = {
      id: createId(),
      type: item.type,
      title: item.name,
      props: item.defaultProps ?? {},
    };

    setManifest((prev) => withUpdatedAt({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedNodeId(node.id);
    setStatus(`Added "${item.name}" to canvas`);
  };

  const handlePropsApply = () => {
    if (!selectedNode) return;
    try {
      const parsed = JSON.parse(propsEditor);
      setManifest((prev) =>
        withUpdatedAt({
          ...prev,
          nodes: updateNode(prev.nodes, selectedNode.id, (node) => ({
            ...node,
            props: parsed,
          })),
        }),
      );
      setStatus("Props updated");
    } catch (err) {
      setStatus("Props JSON is invalid");
    }
  };

  const handleExport = () => {
    const slug = (manifest.name || "manifest").toLowerCase().replace(/\s+/g, "-");
    const blob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug || "manifest"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Manifest exported as JSON");
  };

  const handleSaveDraft = async () => {
    const saved = await saveDraft({
      id: manifest.id,
      name: draftName || manifest.name,
      updatedAt: Date.now(),
      manifest,
    });
    setStatus(`Draft saved @ ${formatStamp(saved.updatedAt)}`);
    refreshDrafts();
  };

  const handleLoadDraft = async (id: string) => {
    const record = await loadDraft(id);
    if (!record) {
      setStatus("Draft not found");
      return;
    }
    setManifest(record.manifest);
    setDraftName(record.name);
    setSelectedNodeId(record.manifest.nodes[0]?.id ?? null);
    setStatus(`Loaded draft "${record.name}"`);
  };

  const handleDeleteDraft = async (id: string) => {
    await deleteDraft(id);
    if (manifest.id === id) {
      const fresh = createManifest();
      setManifest(fresh);
      setSelectedNodeId(null);
      setDraftName("Untitled draft");
    }
    refreshDrafts();
    setStatus("Draft removed");
  };

  const handleNewManifest = () => {
    const fresh = createManifest();
    setManifest(fresh);
    setSelectedNodeId(null);
    setDraftName("Untitled draft");
    setStatus("New manifest created");
  };

  const handleLoadFromPip = async () => {
    setPipLoading(true);
    setStatus("Fetching PIP document...");

    try {
      const options: Record<string, unknown> = {};
      if (pipBaseUrl) options.baseUrl = pipBaseUrl;
      if (pipToken) options.token = pipToken;
      if (pipLatestPath) options.latestPath = pipLatestPath;
      let pip;
      const hasInboxParams = pipSubject.trim() && pipNonce.trim();

      if (hasInboxParams) {
        pip = await pipClient.fetchPip(pipSubject.trim(), pipNonce.trim(), options as any);
      } else {
        if (!pipTenant.trim() || !pipSite.trim()) {
          throw new Error("Provide tenant and site before loading latest PIP");
        }
        pip = await pipClient.getLatestPip(pipTenant.trim(), pipSite.trim(), options as any);
      }

      setManifest((prev) =>
        withUpdatedAt({
          ...prev,
          name:
            prev.name === "Untitled manifest"
              ? `PIP ${pip.manifestTx ?? "manifest"}`
              : prev.name,
          metadata: {
            ...prev.metadata,
            description: `PIP for ${pip.tenant ?? pipTenant}/${pip.site ?? pipSite}`,
          },
        }),
      );

      setStatus(
        `PIP loaded for ${pip.tenant ?? pipTenant}/${pip.site ?? pipSite} · manifestTx ${pip.manifestTx}`,
      );
    } catch (err: any) {
      setStatus(err?.message ?? "Failed to load PIP");
    } finally {
      setPipLoading(false);
    }
  };

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div>
          <div style={styles.panelTitle}>Catalog</div>
          <input
            style={styles.input}
            placeholder="Search blocks or tags"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={styles.smallButton} onClick={() => refreshCatalog(catalogSearch)}>
            {catalogLoading ? "Refreshing..." : "Refresh"}
          </button>
          <span style={{ color: "#7c8699", fontSize: 12 }}>
            Fake service ({catalog.length} blocks)
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            overflowY: "auto",
          }}
        >
          {catalog.map((item) => (
            <div key={item.id} style={styles.catalogCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: "#94a1b9", fontSize: 13 }}>{item.summary}</div>
                </div>
                <button style={styles.smallButton} onClick={() => handleAddBlock(item)}>
                  Add
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {item.tags?.map((tag) => (
                  <span key={tag} style={styles.tag}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 6, borderTop: "1px solid #1f2637" }}>
          <div style={styles.panelTitle}>Drafts (IndexedDB)</div>
          <input
            style={styles.input}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Draft name"
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={styles.smallButton} onClick={handleSaveDraft}>
              Save draft
            </button>
            <button style={styles.ghostButton} onClick={handleNewManifest}>
              New
            </button>
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 160,
              overflowY: "auto",
            }}
          >
            {drafts.length === 0 && (
              <div style={{ color: "#6f7a8f", fontSize: 13 }}>No drafts yet</div>
            )}
            {drafts.map((draft) => (
              <div
                key={draft.id}
                style={{
                  border: "1px solid #1f2637",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: draft.id === manifest.id ? "#141b29" : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{draft.name}</div>
                  <div style={{ color: "#7b879b", fontSize: 12 }}>
                    {formatStamp(draft.updatedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={styles.smallButton} onClick={() => handleLoadDraft(draft.id)}>
                    Load
                  </button>
                  <button style={styles.ghostButton} onClick={() => handleDeleteDraft(draft.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={styles.middle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              style={{ ...styles.input, width: 240 }}
              value={manifest.name}
              onChange={(e) =>
                setManifest((prev) => withUpdatedAt({ ...prev, name: e.target.value }))
              }
              placeholder="Manifest name"
            />
            <span style={{ color: "#7c8699", fontSize: 13 }}>
              v{manifest.version} · updated {formatStamp(manifest.metadata.updatedAt)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.smallButton} onClick={handleExport}>
              Export JSON
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #1f2637",
            borderRadius: 12,
            padding: 12,
            background: "#0d111a",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={styles.panelTitle}>Load from PIP</div>
            <button style={styles.smallButton} onClick={handleLoadFromPip} disabled={pipLoading}>
              {pipLoading ? "Loading..." : "Load from PIP"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Tenant"
              value={pipTenant}
              onChange={(e) => setPipTenant(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Site"
              value={pipSite}
              onChange={(e) => setPipSite(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Subject (optional)"
              value={pipSubject}
              onChange={(e) => setPipSubject(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Nonce (optional)"
              value={pipNonce}
              onChange={(e) => setPipNonce(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <input
              style={styles.input}
              placeholder="Worker base URL"
              value={pipBaseUrl}
              onChange={(e) => setPipBaseUrl(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Token (Bearer, optional)"
              value={pipToken}
              onChange={(e) => setPipToken(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="Latest path (optional, defaults to /pip/latest)"
              value={pipLatestPath}
              onChange={(e) => setPipLatestPath(e.target.value)}
            />
          </div>
          <div style={{ color: "#6f7a8f", fontSize: 12 }}>
            Uses shared pipClient (fetchPip when subject+nonce provided, otherwise getLatestPip).
            Does not fetch manifest JSON yet; shows manifestTx for manual retrieval.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #1f2637",
            borderRadius: 12,
            padding: 14,
            background: "rgba(12, 16, 24, 0.75)",
            display: "flex",
            gap: 14,
            flex: 1,
            minHeight: 320,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={styles.panelTitle}>Preview placeholder</div>
            <div style={styles.placeholder}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Canvas preview</div>
                <div style={{ color: "#7c8699", maxWidth: 480 }}>
                  Blocks you add will appear here. Swap in the real renderer once the manifest
                  schema is finalized.
                </div>
              </div>
            </div>

            <div>
              <div style={styles.panelTitle}>Manifest nodes</div>
              {manifest.nodes.length === 0 && (
                <div
                  style={{ ...styles.placeholder, justifyContent: "flex-start", minHeight: 90 }}
                >
                  Start by adding blocks from the catalog.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {manifest.nodes.map((node, idx) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border:
                        node.id === selectedNode?.id ? "1px solid #3b82f6" : "1px solid #1f2637",
                      background:
                        node.id === selectedNode?.id ? "rgba(59,130,246,0.08)" : "#0d121a",
                      color: "#e7e9ef",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {idx + 1}. {node.title}
                      </div>
                      <span style={styles.tag}>{node.type}</span>
                    </div>
                    <div style={{ color: "#8fa0b8", fontSize: 13, marginTop: 4 }}>
                      {Object.keys(node.props || {}).length} props
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {status && (
          <div
            style={{
              border: "1px solid #1f2637",
              borderRadius: 10,
              padding: "8px 10px",
              color: "#9fb0c7",
              fontSize: 13,
              background: "#0f141d",
            }}
          >
            {status}
          </div>
        )}
      </main>

      <aside style={styles.right}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={styles.panelTitle}>Props</div>
          <span style={{ color: "#7c8699", fontSize: 12 }}>
            {selectedNode ? selectedNode.title : "Nothing selected"}
          </span>
        </div>

        <textarea
          style={{
            ...styles.input,
            minHeight: 260,
            fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
            background: "#0b1018",
            border: "1px solid #1f2637",
          }}
          value={propsEditor}
          onChange={(e) => setPropsEditor(e.target.value)}
        />

        <button style={styles.smallButton} onClick={handlePropsApply} disabled={!selectedNode}>
          Apply props JSON
        </button>

        <div style={{ marginTop: 10, borderTop: "1px solid #1f2637", paddingTop: 10 }}>
          <div style={styles.panelTitle}>Manifest meta</div>
          <div style={{ color: "#9fb0c7", fontSize: 13, display: "grid", gap: 4 }}>
            <span>ID: {manifest.id}</span>
            <span>Version: {manifest.version}</span>
            <span>Created: {formatStamp(manifest.metadata.createdAt)}</span>
            <span>Updated: {formatStamp(manifest.metadata.updatedAt)}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
