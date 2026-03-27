import Dexie, { Table } from "dexie";
import type { PipVaultIntegrityIssue } from "../services/pipVault";

export type VaultIntegrityEvent = {
  id: number;
  at: string;
  scanned: number;
  failed: number;
  durationMs: number;
  recordCount?: number;
  issues?: PipVaultIntegrityIssue[];
};

type VaultIntegrityRow = Omit<VaultIntegrityEvent, "id"> & { id?: number };

const DB_NAME = "pip-vault-integrity";
const DB_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 50;
export const VAULT_INTEGRITY_WIZARD_LIMIT = 8;

class VaultIntegrityDatabase extends Dexie {
  events!: Table<VaultIntegrityRow, number>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      events: "++id, at",
    });
  }
}

const db = new VaultIntegrityDatabase();

const stripRow = (row: VaultIntegrityRow): VaultIntegrityEvent => ({
  ...row,
  id: row.id ?? 0,
  recordCount: row.recordCount,
  issues: row.issues ?? [],
});

const enforceLimit = async (limit: number) => {
  const total = await db.events.count();
  if (total <= limit) return;
  const overflow = total - limit;
  const oldest = await db.events.orderBy("at").limit(overflow).toArray();
  const ids = oldest.map((row) => row.id).filter((id): id is number => typeof id === "number");
  if (ids.length) {
    await db.events.bulkDelete(ids);
  }
};

export async function addVaultIntegrityEvent(event: Omit<VaultIntegrityEvent, "id">, limit = DEFAULT_HISTORY_LIMIT): Promise<number> {
  const id = await db.events.add(event);
  await enforceLimit(limit);
  return id;
}

export async function listVaultIntegrityEvents(limit: number = DEFAULT_HISTORY_LIMIT): Promise<VaultIntegrityEvent[]> {
  const query = db.events.orderBy("at").reverse();
  const rows = limit > 0 ? await query.limit(limit).toArray() : await query.toArray();
  return rows.map(stripRow);
}

export async function getLastVaultIntegrityEvent(): Promise<VaultIntegrityEvent | null> {
  const row = await db.events.orderBy("at").reverse().first();
  return row ? stripRow(row) : null;
}

export async function clearVaultIntegrityEvents(): Promise<void> {
  await db.events.clear();
}

export const VAULT_INTEGRITY_DEFAULT_LIMIT = DEFAULT_HISTORY_LIMIT;

export default db;
