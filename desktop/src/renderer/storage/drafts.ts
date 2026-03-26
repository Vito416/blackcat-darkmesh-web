import Dexie, { Table } from "dexie";

import { ManifestDocument, ManifestDraft } from "../types/manifest";

const DB_NAME = "darkmesh-manifest-drafts";
const DB_VERSION = 4;
const CURRENT_SCHEMA_VERSION = 3;
const EXPORT_FORMAT_VERSION = 1;
const REVISION_LIMIT = 40;

type DraftInput =
  | ManifestDraft
  | (Omit<ManifestDraft, "updatedAt" | "createdAt"> & Partial<Pick<ManifestDraft, "id" | "createdAt" | "updatedAt">>);

type DraftWriteResult = ManifestDraft;
export type DraftSaveMode = "autosave" | "manual" | "duplicate";

type DraftRow = ManifestDraft & { schemaVersion: number; versionStamp: number };

type DraftRevisionRow = {
  id?: number;
  draftId: number;
  mode: DraftSaveMode;
  savedAt: string;
  name: string;
  document: ManifestDocument;
  schemaVersion: number;
  versionStamp?: number;
};

export interface DraftRevision {
  id: number;
  draftId: number;
  mode: DraftSaveMode;
  savedAt: string;
  name: string;
  document: ManifestDocument;
  versionStamp?: number;
}

export type DraftSourceRef = { kind: "draft"; id: number } | { kind: "revision"; id: number };

export interface DraftSource {
  ref: DraftSourceRef;
  draftId: number;
  name: string;
  savedAt: string;
  mode?: DraftSaveMode;
  document: ManifestDocument;
}

export class DraftVersionConflictError extends Error {
  latest?: ManifestDraft;

  constructor(latest?: ManifestDraft, message = "Draft was updated in another tab") {
    super(message);
    this.name = "DraftVersionConflictError";
    this.latest = latest;
  }
}

export interface DraftSaveOptions {
  expectedVersionStamp?: number;
  force?: boolean;
}

interface DraftExportFile {
  format: "darkmesh-drafts";
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  drafts: ManifestDraft[];
}

const randomId = () => Math.random().toString(36).slice(2, 10);

const safeIso = (value?: string): string => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const normalizeDocument = (
  document: ManifestDocument | undefined,
  fallbackName: string,
  createdAt: string,
  updatedAt: string,
): ManifestDocument => {
  if (!document) throw new Error("Draft is missing manifest document");

  const metadata = document.metadata ?? { createdAt, updatedAt };
  return {
    ...document,
    id: document.id || `manifest-${randomId()}`,
    name: document.name || fallbackName,
    version: document.version || "0.1.0",
    metadata: {
      ...metadata,
      createdAt: metadata.createdAt || createdAt,
      updatedAt: metadata.updatedAt || updatedAt,
    },
    nodes: Array.isArray(document.nodes) ? document.nodes : [],
  } as ManifestDocument;
};

const toDraftRow = (draft: DraftInput, options?: { preserveUpdatedAt?: boolean }): DraftRow => {
  const now = new Date().toISOString();
  const createdAt = safeIso((draft as ManifestDraft).createdAt) ?? now;
  const updatedAt = options?.preserveUpdatedAt ? safeIso((draft as ManifestDraft).updatedAt) : now;
  const name = draft.name?.trim() || draft.document?.name?.trim() || "Untitled manifest";
  const document = normalizeDocument(draft.document as ManifestDocument, name, createdAt, updatedAt);
  const versionStamp = (draft as ManifestDraft).versionStamp ?? Date.now();

  return {
    ...(draft as ManifestDraft),
    id: draft.id,
    name,
    createdAt,
    updatedAt,
    document,
    versionStamp,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as DraftRow;
};

const stripSchema = (draft: DraftRow): ManifestDraft => {
  const { schemaVersion, ...rest } = draft;
  return rest;
};

const stripRevisionSchema = (revision: DraftRevisionRow): DraftRevision => {
  const { schemaVersion, ...rest } = revision;
  return rest as DraftRevision;
};

const addDraftRevision = async (draftId: number, draft: DraftRow, mode: DraftSaveMode): Promise<void> => {
  const revision: DraftRevisionRow = {
    draftId,
    mode,
    savedAt: draft.updatedAt,
    name: draft.name,
    document: draft.document,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    versionStamp: draft.versionStamp,
  };

  await db.revisions.add(revision);

  const revisions = await db.revisions.where("draftId").equals(draftId).sortBy("savedAt");
  const excess = revisions.length - REVISION_LIMIT;
  if (excess > 0) {
    const stale = revisions.slice(0, excess);
    await db.revisions.bulkDelete(stale.map((item) => item.id!).filter(Boolean));
  }
};

class DraftDatabase extends Dexie {
  drafts!: Table<DraftRow, number>;
  revisions!: Table<DraftRevisionRow, number>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      drafts: "++id, updatedAt, name",
    });

    this.version(2).stores({
      drafts: "++id, updatedAt, name, schemaVersion",
    });

    this.version(DB_VERSION)
      .stores({
        drafts: "++id, updatedAt, name, schemaVersion, versionStamp",
        revisions: "++id, draftId, savedAt, mode, schemaVersion",
      })
      .upgrade(async (tx) => {
        await tx
          .table("drafts")
          .toCollection()
          .modify((record: DraftRow & Partial<ManifestDraft>) => {
            record.schemaVersion = record.schemaVersion ?? CURRENT_SCHEMA_VERSION;
            const createdAt = safeIso((record as ManifestDraft).createdAt ?? record.updatedAt);
            const updatedAt = safeIso(record.updatedAt);
            record.createdAt = createdAt;
            record.updatedAt = updatedAt;
            record.name = record.name || record.document?.name || "Untitled manifest";
            if (record.document) {
              record.document = normalizeDocument(record.document as ManifestDocument, record.name, createdAt, updatedAt);
            }
            if (record.versionStamp == null) {
              const fallbackStamp = new Date(updatedAt).getTime();
              record.versionStamp = Number.isFinite(fallbackStamp) ? fallbackStamp : Date.now();
            }
          });
      });
  }
}

const db = new DraftDatabase();

export async function listDrafts(): Promise<ManifestDraft[]> {
  const drafts = await db.drafts.orderBy("updatedAt").reverse().toArray();
  return drafts.map(stripSchema);
}

export async function getDraft(id: number): Promise<ManifestDraft | undefined> {
  const draft = await db.drafts.get(id);
  return draft ? stripSchema(draft) : undefined;
}

export async function saveDraft(
  draft: Omit<ManifestDraft, "updatedAt" | "createdAt"> & Partial<Pick<ManifestDraft, "id" | "createdAt" | "updatedAt">>,
  mode: DraftSaveMode = "manual",
  options: DraftSaveOptions = {},
): Promise<DraftWriteResult> {
  const existing = draft.id ? await db.drafts.get(draft.id) : null;

  if (
    existing &&
    !options.force &&
    options.expectedVersionStamp != null &&
    existing.versionStamp !== options.expectedVersionStamp
  ) {
    throw new DraftVersionConflictError(stripSchema(existing));
  }

  const previousStamp = existing?.versionStamp ?? options.expectedVersionStamp ?? Date.now();
  const nextVersionStamp = Math.max(Date.now(), previousStamp + 1);
  const payload = toDraftRow({ ...draft, versionStamp: nextVersionStamp });
  const draftId = draft.id ?? (await db.drafts.add(payload));

  if (draft.id) {
    await db.drafts.put({ ...payload, id: draft.id });
  } else {
    // draftId already assigned by the add above
  }

  await addDraftRevision(draftId, { ...payload, id: draftId }, mode);
  return { ...stripSchema({ ...payload, id: draftId }) };
}

export async function duplicateDraft(
  draft: Pick<ManifestDraft, "name" | "document">,
): Promise<DraftWriteResult> {
  const copyName = draft.name.endsWith(" (copy)") ? `${draft.name} 2` : `${draft.name} (copy)`;
  return saveDraft(
    {
      name: copyName,
      document: draft.document,
    },
    "duplicate",
  );
}

export async function deleteDraft(id: number): Promise<void> {
  await db.drafts.delete(id);
  await db.revisions.where("draftId").equals(id).delete();
}

export async function listDraftRevisions(draftId: number, limit = REVISION_LIMIT): Promise<DraftRevision[]> {
  const revisions = await db.revisions.where("draftId").equals(draftId).sortBy("savedAt");
  return revisions.reverse().slice(0, limit).map(stripRevisionSchema);
}

export async function getDraftRevision(id: number): Promise<DraftRevision | undefined> {
  const revision = await db.revisions.get(id);
  return revision ? stripRevisionSchema(revision) : undefined;
}

export async function loadDraftSource(ref: DraftSourceRef): Promise<DraftSource | null> {
  if (ref.kind === "draft") {
    const draft = await getDraft(ref.id);
    if (!draft?.id) return null;
    return {
      ref,
      draftId: draft.id,
      name: draft.name,
      savedAt: draft.updatedAt,
      document: draft.document,
    };
  }

  const revision = await getDraftRevision(ref.id);
  if (!revision) return null;

  return {
    ref,
    draftId: revision.draftId,
    name: revision.name,
    savedAt: revision.savedAt,
    mode: revision.mode,
    document: revision.document,
  };
}

export async function exportDraftsToJson(): Promise<string> {
  const drafts = await listDrafts();
  const payload: DraftExportFile = {
    format: "darkmesh-drafts",
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    drafts,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importDraftsFromJson(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error("Invalid JSON file for drafts import");
  }

  const drafts = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { drafts?: ManifestDraft[] }).drafts)
      ? (parsed as { drafts: ManifestDraft[] }).drafts
      : null;

  if (!drafts) {
    throw new Error("Drafts file must be an array or contain a drafts[] property");
  }

  const rows: DraftRow[] = drafts.map((draft) => {
    const input = { ...draft, id: undefined } as DraftInput;
    return toDraftRow(input, { preserveUpdatedAt: true });
  });

  await db.drafts.bulkAdd(rows);
  return rows.length;
}

export default db;
