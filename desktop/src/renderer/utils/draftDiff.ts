import { ManifestDocument, ManifestNode } from "../types/manifest";

export type DraftDiffKind = "added" | "removed" | "changed";

export interface DraftDiffEntry {
  id: string;
  title: string;
  type: string;
  kind: DraftDiffKind;
  parentId: string | null;
  before?: ManifestNode;
  after?: ManifestNode;
  beforePath?: string;
  afterPath?: string;
  beforeIndex?: number;
  afterIndex?: number;
}

type IndexedNode = {
  node: ManifestNode;
  parentId: string | null;
  index: number;
};

type NodeIndex = Map<string, IndexedNode>;

const normalizeNode = (node: ManifestNode) => ({
  id: node.id,
  title: node.title,
  type: node.type,
  props: node.props,
  children: (node.children ?? []).map((child) => child.id),
});

const nodesEqual = (a: ManifestNode, b: ManifestNode): boolean => {
  try {
    return JSON.stringify(normalizeNode(a)) === JSON.stringify(normalizeNode(b));
  } catch {
    return false;
  }
};

const walkNodes = (
  nodes: ManifestNode[],
  parentId: string | null,
  index: NodeIndex,
  visited: Set<string>,
) => {
  nodes.forEach((node, idx) => {
    if (visited.has(node.id)) return;
    index.set(node.id, { node, parentId, index: idx });
    visited.add(node.id);
    if (node.children?.length) {
      walkNodes(node.children, node.id, index, visited);
    }
  });
};

const indexManifest = (manifest: ManifestDocument): NodeIndex => {
  const index: NodeIndex = new Map();
  walkNodes(manifest.nodes ?? [], null, index, new Set());
  return index;
};

const buildPath = (id: string, index: NodeIndex): string | undefined => {
  const parts: string[] = [];
  let current = index.get(id);
  let guard = 0;

  while (current && guard < 64) {
    parts.unshift(current.node.title || current.node.id);
    current = current.parentId ? index.get(current.parentId) : undefined;
    guard += 1;
  }

  return parts.length ? parts.join(" / ") : undefined;
};

export const diffManifests = (
  left: ManifestDocument,
  right: ManifestDocument,
): { entries: DraftDiffEntry[]; highlight: Record<string, DraftDiffKind> } => {
  const leftIndex = indexManifest(left);
  const rightIndex = indexManifest(right);
  const ids = new Set([...leftIndex.keys(), ...rightIndex.keys()]);
  const entries: DraftDiffEntry[] = [];

  ids.forEach((id) => {
    const before = leftIndex.get(id);
    const after = rightIndex.get(id);

    if (before && !after) {
      entries.push({
        id,
        title: before.node.title,
        type: before.node.type,
        kind: "removed",
        parentId: before.parentId,
        before: before.node,
        beforePath: buildPath(id, leftIndex),
        beforeIndex: before.index,
      });
      return;
    }

    if (!before && after) {
      entries.push({
        id,
        title: after.node.title,
        type: after.node.type,
        kind: "added",
        parentId: after.parentId,
        after: after.node,
        afterPath: buildPath(id, rightIndex),
        afterIndex: after.index,
      });
      return;
    }

    if (before && after && !nodesEqual(before.node, after.node)) {
      entries.push({
        id,
        title: after.node.title || before.node.title,
        type: after.node.type || before.node.type,
        kind: "changed",
        parentId: after.parentId,
        before: before.node,
        after: after.node,
        beforePath: buildPath(id, leftIndex),
        afterPath: buildPath(id, rightIndex),
        beforeIndex: before.index,
        afterIndex: after.index,
      });
    }
  });

  const sortOrder: DraftDiffKind[] = ["changed", "added", "removed"];
  entries.sort((a, b) => {
    const kindDelta = sortOrder.indexOf(a.kind) - sortOrder.indexOf(b.kind);
    if (kindDelta !== 0) return kindDelta;
    return (a.afterPath || a.beforePath || a.title || a.id).localeCompare(
      b.afterPath || b.beforePath || b.title || b.id,
    );
  });

  const highlight: Record<string, DraftDiffKind> = {};
  entries.forEach((entry) => {
    if (entry.kind === "added") return;
    highlight[entry.id] = entry.kind;
  });

  return { entries, highlight };
};
