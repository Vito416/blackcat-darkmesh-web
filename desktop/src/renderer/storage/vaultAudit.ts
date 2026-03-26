import Dexie, { Table } from "dexie";

export type VaultAuditAction = "backup" | "import";

export type VaultAuditStatus = "ok" | "error";

export type VaultAuditEvent = {
  id: number;
  at: string;
  action: VaultAuditAction;
  status: VaultAuditStatus;
  mode?: "safeStorage" | "plain" | "password";
  recordCount?: number;
  filename?: string;
  path?: string;
  checksum?: string;
  bytes?: number;
  detail?: string;
  source?: string;
};

type VaultAuditRow = Omit<VaultAuditEvent, "id"> & { id?: number };

const DB_NAME = "pip-vault-audit";
const DB_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 300;

class VaultAuditDatabase extends Dexie {
  events!: Table<VaultAuditRow, number>;

  constructor() {
    super(DB_NAME);

    this.version(DB_VERSION).stores({
      events: "++id, at, action, status",
    });
  }
}

const db = new VaultAuditDatabase();

const stripRow = (row: VaultAuditRow): VaultAuditEvent => ({
  ...row,
  id: row.id ?? 0,
});

const enforceLimit = async (limit: number) => {
  const total = await db.events.count();
  if (total <= limit) return;

  const overflow = total - limit;
  const oldest = await db.events.orderBy("at").limit(overflow).toArray();
  const ids = oldest.map((item) => item.id).filter((id): id is number => typeof id === "number");
  if (ids.length) {
    await db.events.bulkDelete(ids);
  }
};

export async function addVaultAuditEvent(event: Omit<VaultAuditEvent, "id">, limit = DEFAULT_HISTORY_LIMIT): Promise<number> {
  const id = await db.events.add(event);
  await enforceLimit(limit);
  return id;
}

export async function listVaultAuditEvents(limit?: number): Promise<VaultAuditEvent[]> {
  const query = db.events.orderBy("at").reverse();
  const rows = typeof limit === "number" && limit > 0 ? await query.limit(limit).toArray() : await query.toArray();
  return rows.map(stripRow);
}

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const vaultAuditToCsv = (events: VaultAuditEvent[]): string => {
  const headers = [
    "id",
    "at",
    "action",
    "status",
    "source",
    "mode",
    "recordCount",
    "filename",
    "path",
    "checksum",
    "bytes",
    "detail",
  ];

  const rows = events.map((event) =>
    [
      event.id,
      event.at,
      event.action,
      event.status,
      event.source ?? "",
      event.mode ?? "",
      event.recordCount ?? "",
      event.filename ?? "",
      event.path ?? "",
      event.checksum ?? "",
      event.bytes ?? "",
      event.detail ?? "",
    ]
      .map(csvEscape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
};

export const vaultAuditToJson = (events: VaultAuditEvent[]): string => JSON.stringify(events, null, 2);

export async function clearVaultAuditEvents(): Promise<void> {
  await db.events.clear();
}

export const VAULT_AUDIT_DEFAULT_LIMIT = DEFAULT_HISTORY_LIMIT;

export default db;
