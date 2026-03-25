import Dexie, { Table } from "dexie";

import type { HealthSnapshot, HealthStatusSummary } from "../services/health";

const DB_NAME = "darkmesh-health";
const DB_VERSION = 1;
const DEFAULT_HISTORY_LIMIT = 200;

export type HealthEvent = HealthSnapshot & {
  id: number;
  overall: HealthStatusSummary["overall"];
  ok: number;
  warn: number;
  error: number;
  missing: number;
};

type HealthEventRow = HealthSnapshot & {
  id?: number;
  overall: HealthStatusSummary["overall"];
  ok: number;
  warn: number;
  error: number;
  missing: number;
};

class HealthDatabase extends Dexie {
  events!: Table<HealthEventRow, number>;

  constructor() {
    super(DB_NAME);

    this.version(DB_VERSION).stores({
      events: "++id, recordedAt, overall",
    });
  }
}

const db = new HealthDatabase();

const stripRow = (row: HealthEventRow): HealthEvent => ({
  ...row,
  id: row.id ?? 0,
});

const enforceLimit = async (limit: number) => {
  const total = await db.events.count();
  if (total <= limit) return;

  const overflow = total - limit;
  const oldest = await db.events.orderBy("recordedAt").limit(overflow).toArray();
  const ids = oldest.map((item) => item.id).filter((id): id is number => typeof id === "number");
  if (ids.length) {
    await db.events.bulkDelete(ids);
  }
};

export async function addHealthEvent(snapshot: HealthSnapshot, limit = DEFAULT_HISTORY_LIMIT): Promise<number> {
  const payload: HealthEventRow = {
    ...snapshot,
    overall: snapshot.summary.overall,
    ok: snapshot.summary.ok,
    warn: snapshot.summary.warn,
    error: snapshot.summary.error,
    missing: snapshot.summary.missing,
  };

  const id = await db.events.add(payload);
  await enforceLimit(limit);
  return id;
}

export async function getRecentHealthEvents(limit = 20): Promise<HealthEvent[]> {
  const rows = await db.events.orderBy("recordedAt").reverse().limit(limit).toArray();
  return rows.map(stripRow);
}

export async function clearHealthEvents(): Promise<void> {
  await db.events.clear();
}

export default db;
