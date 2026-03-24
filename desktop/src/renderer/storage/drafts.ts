import Dexie, { Table } from "dexie";

import { ManifestDocument, ManifestDraft } from "../types/manifest";

class DraftDatabase extends Dexie {
  drafts!: Table<ManifestDraft, number>;

  constructor() {
    super("darkmesh-manifest-drafts");
    this.version(1).stores({
      drafts: "++id, updatedAt, name",
    });
  }
}

const db = new DraftDatabase();

export async function listDrafts(): Promise<ManifestDraft[]> {
  return db.drafts.orderBy("updatedAt").reverse().toArray();
}

export async function getDraft(id: number): Promise<ManifestDraft | undefined> {
  return db.drafts.get(id);
}

export async function saveDraft(
  draft: Omit<ManifestDraft, "updatedAt" | "createdAt"> & Partial<Pick<ManifestDraft, "id" | "createdAt">>,
): Promise<number> {
  const timestamp = new Date().toISOString();
  const payload: ManifestDraft = {
    ...draft,
    document: draft.document as ManifestDocument,
    name: draft.name || draft.document.name,
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
  } as ManifestDraft;

  if (draft.id) {
    await db.drafts.put({ ...payload, id: draft.id });
    return draft.id;
  }

  return db.drafts.add(payload);
}

export async function deleteDraft(id: number): Promise<void> {
  await db.drafts.delete(id);
}

export default db;
