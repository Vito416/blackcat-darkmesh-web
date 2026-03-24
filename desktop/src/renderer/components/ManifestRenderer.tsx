import React, { useMemo } from "react";

import { ManifestDocument, ManifestNode, ManifestShape, ManifestValue } from "../types/manifest";

type NodeWithRefs = ManifestNode & { children?: Array<ManifestNode | string> };
type RenderNode = ManifestNode & { children?: RenderNode[] };

interface ManifestRendererProps {
  manifest: ManifestDocument;
  selectedId?: string | null;
  onSelect?: (nodeId: string) => void;
}

const formatValue = (value: ManifestValue): string => {
  if (value === null) return "null";

  if (Array.isArray(value)) {
    const sample = value.slice(0, 3).map((entry) => formatValue(entry));
    const suffix = value.length > sample.length ? " …" : "";
    return `[${sample.join(", ")}${suffix}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    const suffix = keys.length > 3 ? " …" : "";
    return `{${keys.slice(0, 3).join(", ")}${suffix}}`;
  }

  if (typeof value === "string") {
    return value.length > 42 ? `${value.slice(0, 39)}…` : value;
  }

  return String(value);
};

const PropsPreview: React.FC<{ props?: ManifestShape }> = ({ props }) => {
  const entries = Object.entries(props ?? {});

  if (entries.length === 0) {
    return <div className="prop-chip ghost">No props</div>;
  }

  const visible = entries.slice(0, 4);

  return (
    <div className="props-grid">
      {visible.map(([key, value]) => (
        <span key={key} className="prop-chip">
          <span className="prop-key">{key}</span>
          <span className="prop-value">{formatValue(value)}</span>
        </span>
      ))}
      {entries.length > visible.length && (
        <span className="prop-chip ghost">+{entries.length - visible.length} more</span>
      )}
    </div>
  );
};

const toRenderable = (
  node: NodeWithRefs,
  index: Map<string, NodeWithRefs>,
  ancestors: Set<string> = new Set(),
): RenderNode => {
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(node.id);

  const resolvedChildren =
    (node.children as Array<ManifestNode | string> | undefined)?.flatMap((child) => {
      const candidate = typeof child === "string" ? index.get(child) : child;
      if (!candidate || nextAncestors.has(candidate.id)) return [];
      return [toRenderable(candidate as NodeWithRefs, index, nextAncestors)];
    }) ?? [];

  return {
    ...node,
    children: resolvedChildren,
  };
};

const collectIds = (node: RenderNode, bag: Set<string>) => {
  bag.add(node.id);
  node.children?.forEach((child) => collectIds(child, bag));
};

const RenderBranch: React.FC<{
  node: RenderNode;
  entryId?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}> = ({ node, entryId, selectedId, onSelect }) => {
  const isSelected = node.id === selectedId;
  const isEntry = node.id === entryId;

  return (
    <div className="tree-branch">
      <article
        className={`tree-card ${isSelected ? "selected" : ""}`}
        onClick={() => onSelect?.(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(node.id);
          }
        }}
      >
        <div className="card-top">
          <div className="node-tags">
            <span className="pill ghost">{node.type || "node"}</span>
            {isEntry && <span className="pill accent">entry</span>}
          </div>
          <span className="node-id">{node.id}</span>
        </div>
        <h4>{node.title || "Untitled node"}</h4>
        <PropsPreview props={node.props} />
        {node.children?.length ? (
          <p className="node-foot">{node.children.length} child{node.children.length > 1 ? "ren" : ""}</p>
        ) : (
          <p className="node-foot muted">Leaf</p>
        )}
      </article>

      {node.children && node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <RenderBranch
              key={child.id}
              node={child}
              entryId={entryId}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ManifestRenderer: React.FC<ManifestRendererProps> = ({ manifest, selectedId, onSelect }) => {
  const { roots, orphans } = useMemo(() => {
    const index = new Map((manifest.nodes as NodeWithRefs[]).map((node) => [node.id, node]));

    const entryNode = manifest.entry ? index.get(manifest.entry) : undefined;
    const covered = new Set<string>();
    const rootTrees: RenderNode[] = [];
    const orphanTrees: RenderNode[] = [];

    if (entryNode) {
      const built = toRenderable(entryNode, index);
      rootTrees.push(built);
      collectIds(built, covered);
    }

    for (const node of manifest.nodes as NodeWithRefs[]) {
      if (covered.has(node.id)) continue;
      const built = toRenderable(node, index);
      if (entryNode) {
        orphanTrees.push(built);
      } else {
        rootTrees.push(built);
      }
      collectIds(built, covered);
    }

    return { roots: rootTrees, orphans: orphanTrees };
  }, [manifest]);

  if (!roots.length && !orphans.length) {
    return (
      <div className="empty">
        <p>No nodes yet</p>
        <span>Pick a block from the catalog to begin.</span>
      </div>
    );
  }

  return (
    <div className="manifest-renderer">
      {roots.map((node) => (
        <RenderBranch key={node.id} node={node} entryId={manifest.entry} selectedId={selectedId} onSelect={onSelect} />
      ))}

      {orphans.length > 0 && (
        <div className="orphan-stack">
          <p className="eyebrow">Unlinked nodes</p>
          <div className="orphan-list">
            {orphans.map((node) => (
              <RenderBranch
                key={node.id}
                node={node}
                entryId={manifest.entry}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManifestRenderer;
