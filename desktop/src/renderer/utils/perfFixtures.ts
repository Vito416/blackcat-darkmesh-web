import { ManifestDocument, ManifestNode } from "../types/manifest";
import { DraftDiffEntry, DraftDiffKind } from "./draftDiff";

const nowIso = () => new Date().toISOString();

export function buildLargeManifest(nodeCount = 10000): ManifestDocument {
  const createdAt = nowIso();
  const updatedAt = createdAt;
  const root: ManifestNode = {
    id: "manifest-root",
    type: "block.root",
    title: "Root",
    props: {},
    children: [],
  };

  const nodes: ManifestNode[] = [root];
  const sections = Math.max(1, Math.floor(Math.sqrt(nodeCount)));
  let remaining = nodeCount;

  for (let sectionIndex = 0; sectionIndex < sections && remaining > 0; sectionIndex += 1) {
    const sectionId = `section-${sectionIndex}`;
    const section: ManifestNode = {
      id: sectionId,
      type: "block.section",
      title: `Section ${sectionIndex + 1}`,
      props: { heading: `Section ${sectionIndex + 1}` },
      children: [],
    };
    root.children?.push(section);
    nodes.push(section);

    const perSection = Math.min(Math.max(1, Math.floor(nodeCount / sections)), remaining);
    for (let i = 0; i < perSection && remaining > 0; i += 1) {
      const nodeId = `node-${sectionIndex}-${i}`;
      const node: ManifestNode = {
        id: nodeId,
        type: i % 3 === 0 ? "block.hero" : "block.feature",
        title: `Node ${sectionIndex}-${i}`,
        props: {
          headline: `Headline ${sectionIndex}-${i}`,
          body: `Copy for ${sectionIndex}-${i}`,
          metric: i,
        },
        children: [],
      };
      section.children?.push(node);
      nodes.push(node);
      remaining -= 1;
    }
  }

  return {
    id: "perf-manifest",
    name: `Perf Fixture (${nodeCount.toLocaleString()} nodes)`,
    version: "0.1.0",
    entry: root.id,
    metadata: { createdAt, updatedAt },
    nodes,
  };
}

export function buildLargeDiffEntries(count = 10000): DraftDiffEntry[] {
  const kinds: DraftDiffKind[] = ["added", "changed", "removed"];

  return Array.from({ length: count }).map((_, index) => {
    const kind = kinds[index % kinds.length];
    const section = `Section ${Math.floor(index / 200) + 1}`;
    const beforeNode: ManifestNode = {
      id: `before-${index}`,
      type: index % 2 === 0 ? "block.hero" : "block.feature",
      title: `Before ${index}`,
      props: { headline: `Before headline ${index}`, body: `Before body ${index}` },
      children: [],
    };
    const afterNode: ManifestNode = {
      id: `after-${index}`,
      type: index % 2 === 0 ? "block.hero" : "block.feature",
      title: `After ${index}`,
      props: { headline: `After headline ${index}`, body: `After body ${index}` },
      children: [],
    };

    return {
      id: `diff-${index}`,
      title: `Synthetic node ${index}`,
      type: afterNode.type,
      kind,
      parentId: null,
      path: `${section} / Node ${index}`,
      section,
      before: kind === "added" ? undefined : beforeNode,
      after: kind === "removed" ? undefined : afterNode,
      beforePath: kind === "added" ? undefined : `${section} / Node ${index}`,
      afterPath: kind === "removed" ? undefined : `${section} / Node ${index}`,
      beforeIndex: index,
      afterIndex: index,
    };
  });
}
