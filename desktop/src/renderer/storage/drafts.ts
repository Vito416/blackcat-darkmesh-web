import Dexie, { Table } from "dexie";

import { ManifestDocument, ManifestDraft } from "../types/manifest";

const DB_NAME = "darkmesh-manifest-drafts";
const DB_VERSION = 2;
const CURRENT_SCHEMA_VERSION = 2;
const EXPORT_FORMAT_VERSION = 1;

type DraftInput =
  | ManifestDraft
  | (Omit<ManifestDraft, "updatedAt" | "createdAt"> & Partial<Pick<ManifestDraft, "id" | "createdAt" | "updatedAt">>);

type DraftWriteResult = ManifestDraft;

type DraftRow = ManifestDraft & { schemaVersion: number };

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

  return {
    ...(draft as ManifestDraft),
    id: draft.id,
    name,
    createdAt,
    updatedAt,
    document,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  } as DraftRow;
};

const stripSchema = (draft: DraftRow): ManifestDraft => {
  const { schemaVersion, ...rest } = draft;
  return rest;
};

class DraftDatabase extends Dexie {
  drafts!: Table<DraftRow, number>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      drafts: "++id, updatedAt, name",
    });

    this.version(DB_VERSION)
      .stores({
        drafts: "++id, updatedAt, name, schemaVersion",
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
): Promise<DraftWriteResult> {
  const payload = toDraftRow(draft);

  if (draft.id) {
    await db.drafts.put({ ...payload, id: draft.id });
    return { ...stripSchema({ ...payload, id: draft.id }) };
  }

  const id = await db.drafts.add(payload);
  return { ...stripSchema({ ...payload, id }) };
}

export async function duplicateDraft(
  draft: Pick<ManifestDraft, "name" | "document">,
): Promise<DraftWriteResult> {
  const copyName = draft.name.endsWith(" (copy)") ? `${draft.name} 2` : `${draft.name} (copy)`;
  return saveDraft({
    name: copyName,
    document: draft.document,
  });
}

export async function deleteDraft(id: number): Promise<void> {
  await db.drafts.delete(id);
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
