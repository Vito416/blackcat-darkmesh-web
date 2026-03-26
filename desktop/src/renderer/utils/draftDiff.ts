import { ManifestDocument, ManifestNode } from "../types/manifest";

export type DraftDiffKind = "added" | "removed" | "changed";

export interface DraftDiffEntry {
  id: string;
  title: string;
  type: string;
  kind: DraftDiffKind;
  parentId: string | null;
  path: string;
  section: string;
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
type PathCache = Map<string, string | undefined>;
type HashCache = Map<string, string | null>;

const normalizeNode = (node: ManifestNode) => ({
  id: node.id,
  title: node.title,
  type: node.type,
  props: node.props,
  children: (node.children ?? []).map((child) => child.id),
});

const hashNode = (node: ManifestNode): string | null => {
  try {
    return JSON.stringify(normalizeNode(node));
  } catch {
    return null;
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

const createPathBuilder = (index: NodeIndex) => {
  const cache: PathCache = new Map();
  return (id: string): string | undefined => {
    if (cache.has(id)) {
      return cache.get(id);
    }

    const parts: string[] = [];
    let current = index.get(id);
    let guard = 0;

    while (current && guard < 64) {
      parts.unshift(current.node.title || current.node.id);
      current = current.parentId ? index.get(current.parentId) : undefined;
      guard += 1;
    }

    const path = parts.length ? parts.join(" / ") : undefined;
    cache.set(id, path);
    return path;
  };
};

const createNodeHashLookup = (index: NodeIndex) => {
  const cache: HashCache = new Map();
  return (id: string): string | null => {
    if (cache.has(id)) {
      return cache.get(id) ?? null;
    }

    const entry = index.get(id);
    const hashed = entry ? hashNode(entry.node) : null;
    cache.set(id, hashed);
    return hashed;
  };
};

export const diffManifests = (
  left: ManifestDocument,
  right: ManifestDocument,
): { entries: DraftDiffEntry[]; highlight: Record<string, DraftDiffKind> } => {
  const leftIndex = indexManifest(left);
  const rightIndex = indexManifest(right);
  const leftPathFor = createPathBuilder(leftIndex);
  const rightPathFor = createPathBuilder(rightIndex);
  const leftHashFor = createNodeHashLookup(leftIndex);
  const rightHashFor = createNodeHashLookup(rightIndex);
  const ids = new Set([...leftIndex.keys(), ...rightIndex.keys()]);
  const entries: DraftDiffEntry[] = [];

  ids.forEach((id) => {
    const before = leftIndex.get(id);
    const after = rightIndex.get(id);
    const beforePath = before ? leftPathFor(id) : undefined;
    const afterPath = after ? rightPathFor(id) : undefined;
    const path = afterPath ?? beforePath ?? "root";
    const section = (path.split(" / ")[0] || "root").trim();

    if (before && !after) {
      entries.push({
        id,
        title: before.node.title,
        type: before.node.type,
        kind: "removed",
        parentId: before.parentId,
        path,
        section,
        before: before.node,
        beforePath,
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
        path,
        section,
        after: after.node,
        afterPath,
        afterIndex: after.index,
      });
      return;
    }

    if (before && after) {
      const leftHash = leftHashFor(id);
      const rightHash = rightHashFor(id);
      const nodesMatch = leftHash !== null && leftHash === rightHash;

      if (nodesMatch) return;

      entries.push({
        id,
        title: after.node.title || before.node.title,
        type: after.node.type || before.node.type,
        kind: "changed",
        parentId: after.parentId,
        path,
        section,
        before: before.node,
        after: after.node,
        beforePath,
        afterPath,
        beforeIndex: before.index,
        afterIndex: after.index,
      });
    }
  });

  const sortOrder: DraftDiffKind[] = ["changed", "added", "removed"];
  entries.sort((a, b) => {
    const kindDelta = sortOrder.indexOf(a.kind) - sortOrder.indexOf(b.kind);
    if (kindDelta !== 0) return kindDelta;
    return (a.path || a.title || a.id).localeCompare(b.path || b.title || b.id);
  });

  const highlight: Record<string, DraftDiffKind> = {};
  entries.forEach((entry) => {
    if (entry.kind === "added") return;
    highlight[entry.id] = entry.kind;
  });

  return { entries, highlight };
};
