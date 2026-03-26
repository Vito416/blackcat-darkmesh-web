import React, { useMemo } from "react";

import { ManifestDocument, ManifestNode, ManifestShape, ManifestValue, isManifestExpression } from "../types/manifest";
import type { DraftDiffKind } from "../utils/draftDiff";

type DropPlacement = "before" | "after" | "inside";
type DropMode = "catalog" | "move";
type DropState = { id: string | null; placement?: DropPlacement; mode?: DropMode | null };
type NodeWithRefs = ManifestNode & { children?: Array<ManifestNode | string> };
type RenderNode = ManifestNode & { children?: RenderNode[] };
type NodeValidationBadge = {
  issues: number;
  missingRequired: number;
  diffCounts: { added: number; changed: number; removed: number };
  hasSchema: boolean;
};
const CATALOG_MIME = "application/x-blackcat-block";
const NODE_MIME = "application/x-darkmesh-node";

interface ManifestRendererProps {
  manifest: ManifestDocument;
  selectedIds?: string[];
  primarySelectedId?: string | null;
  onSelect?: (nodeId: string, meta?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  dropState?: DropState | null;
  onDropTargetChange?: (nodeId: string | null, placement?: DropPlacement, mode?: DropMode) => void;
  onDropItem?: (targetId: string | null, itemId: string, placement: DropPlacement, mode: DropMode) => void;
  draggedNodeId?: string | null;
  onNodeDragStart?: (id: string) => void;
  onNodeDragEnd?: () => void;
  diffHighlight?: Record<string, DraftDiffKind>;
  validation?: Record<string, NodeValidationBadge>;
}

const formatValue = (value: ManifestValue): string => {
  if (value === null) return "null";

  if (isManifestExpression(value)) {
    return `expr(${value.__expr})`;
  }

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
  selectedIds?: Set<string>;
  primarySelectedId?: string | null;
  onSelect?: (id: string, meta?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  dropState?: DropState | null;
  onDropTargetChange?: (nodeId: string | null, placement?: DropPlacement, mode?: DropMode) => void;
  onDropItem?: (targetId: string | null, itemId: string, placement: DropPlacement, mode: DropMode) => void;
  draggedNodeId?: string | null;
  draggedSubtreeIds?: Set<string>;
  onNodeDragStart?: (id: string) => void;
  onNodeDragEnd?: () => void;
  diffHighlight?: Record<string, DraftDiffKind>;
  validation?: Record<string, NodeValidationBadge>;
}> = ({
  node,
  entryId,
  selectedIds,
  primarySelectedId,
  onSelect,
  dropState,
  onDropTargetChange,
  onDropItem,
  draggedNodeId,
  draggedSubtreeIds,
  onNodeDragStart,
  onNodeDragEnd,
  diffHighlight,
  validation,
}) => {
  const isSelected = selectedIds?.has(node.id) ?? false;
  const isPrimary = primarySelectedId === node.id;
  const isEntry = node.id === entryId;
  const isDropTarget = dropState?.id === node.id;
  const dropPlacement = isDropTarget ? dropState?.placement : null;
  const dropMode = isDropTarget ? dropState?.mode : null;
  const blockedMoveTarget = dropMode === "move" && draggedNodeId && draggedSubtreeIds?.has(node.id);
  const highlightKind = diffHighlight?.[node.id];
  const nodeValidation = validation?.[node.id];
  const issueCount = nodeValidation?.issues ?? 0;
  const missingRequired = nodeValidation?.missingRequired ?? 0;
  const diffTotal = nodeValidation
    ? nodeValidation.diffCounts.added + nodeValidation.diffCounts.changed + nodeValidation.diffCounts.removed
    : 0;
  const hasSchema = nodeValidation?.hasSchema ?? true;

  const getDragMode = (event: React.DragEvent<HTMLElement>): DropMode | null => {
    const types = Array.from(event.dataTransfer.types ?? []);
    if (types.includes(NODE_MIME)) return "move";
    if (types.includes(CATALOG_MIME)) return "catalog";
    return null;
  };

  const resolvePlacement = (event: React.DragEvent<HTMLElement>): DropPlacement => {
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    if (!rect.height) return "inside";
    const ratio = (event.clientY - rect.top) / rect.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "inside";
  };

  const applyDropTilt = (event: React.DragEvent<HTMLElement>) => {
    const host = event.currentTarget;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const offsetX = (event.clientX - (rect.left + rect.width / 2)) / rect.width;
    const offsetY = (event.clientY - (rect.top + rect.height / 2)) / rect.height;
    const clamp = (value: number, limit = 0.55) => Math.max(-limit, Math.min(limit, value));
    const tiltX = -clamp(offsetY, 0.5) * 10;
    const tiltY = clamp(offsetX, 0.5) * 10;
    const tiltZ = clamp(offsetX + offsetY, 0.6) * 6;
    host.style.setProperty("--drop-tilt-x", `${tiltX.toFixed(2)}deg`);
    host.style.setProperty("--drop-tilt-y", `${tiltY.toFixed(2)}deg`);
    host.style.setProperty("--drop-tilt-z", `${tiltZ.toFixed(2)}deg`);
  };

  const resetDropTilt = (host: HTMLElement) => {
    host.style.removeProperty("--drop-tilt-x");
    host.style.removeProperty("--drop-tilt-y");
    host.style.removeProperty("--drop-tilt-z");
  };

  return (
    <div className="tree-branch">
      <article
        className={`tree-card ${isSelected ? "selected" : ""} ${isSelected && !isPrimary ? "selected-secondary" : ""} ${isPrimary ? "primary-selected" : ""} ${isDropTarget ? `drop-target drop-${dropPlacement ?? "inside"}` : ""} ${blockedMoveTarget ? "drop-blocked" : ""} ${highlightKind ? `diff-${highlightKind}` : ""}`}
        data-node-id={node.id}
        onClick={(event) =>
          onSelect?.(node.id, { shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey })
        }
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(NODE_MIME, node.id);
          event.dataTransfer.setData("text/plain", node.id);
          onNodeDragStart?.(node.id);
        }}
        onDragEnd={() => {
          onDropTargetChange?.(null);
          onNodeDragEnd?.();
        }}
        onDragEnter={(event) => {
          const mode = getDragMode(event);
          if (!mode) return;
          if (mode === "move" && blockedMoveTarget) {
            onDropTargetChange?.(null);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const placement = resolvePlacement(event);
          onDropTargetChange?.(node.id, placement, mode);
          applyDropTilt(event);
        }}
        onDragOver={(event) => {
          const mode = getDragMode(event);
          if (!mode) return;
          if (mode === "move" && blockedMoveTarget) {
            onDropTargetChange?.(null);
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = mode === "move" ? "move" : "copy";
          const placement = resolvePlacement(event);
          onDropTargetChange?.(node.id, placement, mode);
          applyDropTilt(event);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (isDropTarget) onDropTargetChange?.(null);
          resetDropTilt(event.currentTarget);
        }}
        onDrop={(event) => {
          const mode = getDragMode(event);
          if (!mode) return;
          event.preventDefault();
          event.stopPropagation();
          if (mode === "move" && blockedMoveTarget) {
            onDropTargetChange?.(null);
            resetDropTilt(event.currentTarget);
            return;
          }
          const payload =
            mode === "move"
              ? event.dataTransfer.getData(NODE_MIME)
              : event.dataTransfer.getData(CATALOG_MIME) || event.dataTransfer.getData("text/plain");
          const placement = resolvePlacement(event);
          if (payload) {
            onDropItem?.(node.id, payload, placement, mode);
          }
          onDropTargetChange?.(null);
          resetDropTilt(event.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.(node.id);
          }
        }}
      >
        {isDropTarget && !blockedMoveTarget && (
          <div className={`tree-drop-hint ${dropPlacement ?? "inside"}`}>
            {dropMode === "move" ? "Move" : "Add"}{" "}
            {dropPlacement === "before" ? "above" : dropPlacement === "after" ? "below" : "as child"}
          </div>
        )}
        {isDropTarget && blockedMoveTarget && <div className="tree-drop-hint blocked">Can't drop into selection</div>}
        <div className="card-top">
          <div className="node-tags">
            <span className="pill ghost">{node.type || "node"}</span>
            {isEntry && <span className="pill accent">entry</span>}
            {highlightKind && <span className={`pill ${highlightKind}`}>{highlightKind}</span>}
            {nodeValidation && (
              <span className={`pill ${issueCount ? "issue" : hasSchema ? "accent" : "ghost"}`}>
                {issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : hasSchema ? "Valid" : "No schema"}
              </span>
            )}
            {missingRequired > 0 && <span className="pill warn">{missingRequired} req</span>}
          </div>
          <span className="node-id">{node.id}</span>
        </div>
        <h4>{node.title || "Untitled node"}</h4>
        {nodeValidation && (
          <div className="node-validation-row">
            {diffTotal > 0 ? <span className="pill ghost">Overrides {diffTotal}</span> : <span className="pill ghost">No overrides</span>}
          </div>
        )}
        <PropsPreview props={node.props} />
        {node.children?.length ? (
          <p className="node-foot">
            {node.children.length} child{node.children.length > 1 ? "ren" : ""}
          </p>
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
              selectedIds={selectedIds}
              primarySelectedId={primarySelectedId}
              onSelect={onSelect}
              dropState={dropState}
              onDropTargetChange={onDropTargetChange}
              onDropItem={onDropItem}
              draggedNodeId={draggedNodeId}
              draggedSubtreeIds={draggedSubtreeIds}
              onNodeDragStart={onNodeDragStart}
              onNodeDragEnd={onNodeDragEnd}
              diffHighlight={diffHighlight}
              validation={validation}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ManifestRenderer: React.FC<ManifestRendererProps> = ({
  manifest,
  selectedIds,
  primarySelectedId,
  onSelect,
  dropState,
  onDropTargetChange,
  onDropItem,
  draggedNodeId,
  onNodeDragStart,
  onNodeDragEnd,
  diffHighlight,
  validation,
}) => {
  const selectedIdSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
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
  const renderIndex = useMemo(() => {
    const map = new Map<string, RenderNode>();
    const walk = (node: RenderNode) => {
      map.set(node.id, node);
      node.children?.forEach(walk);
    };
    roots.forEach(walk);
    orphans.forEach(walk);
    return map;
  }, [roots, orphans]);
  const draggedSubtreeIds = useMemo(() => {
    const bag = new Set<string>();
    if (draggedNodeId) {
      const match = renderIndex.get(draggedNodeId);
      if (match) {
        collectIds(match, bag);
      }
    }
    return bag;
  }, [draggedNodeId, renderIndex]);

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
        <RenderBranch
          key={node.id}
          node={node}
          entryId={manifest.entry}
          selectedIds={selectedIdSet}
          primarySelectedId={primarySelectedId}
          onSelect={onSelect}
          dropState={dropState}
          onDropTargetChange={onDropTargetChange}
          onDropItem={onDropItem}
          draggedNodeId={draggedNodeId}
          draggedSubtreeIds={draggedSubtreeIds}
          onNodeDragStart={onNodeDragStart}
          onNodeDragEnd={onNodeDragEnd}
          diffHighlight={diffHighlight}
          validation={validation}
        />
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
                selectedIds={selectedIdSet}
                primarySelectedId={primarySelectedId}
                onSelect={onSelect}
                dropState={dropState}
                onDropTargetChange={onDropTargetChange}
                onDropItem={onDropItem}
                draggedNodeId={draggedNodeId}
                draggedSubtreeIds={draggedSubtreeIds}
                onNodeDragStart={onNodeDragStart}
                onNodeDragEnd={onNodeDragEnd}
                validation={validation}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManifestRenderer;
