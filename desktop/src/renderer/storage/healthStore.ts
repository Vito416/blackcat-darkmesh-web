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
  offline: number;
};

type HealthEventRow = HealthSnapshot & {
  id?: number;
  overall: HealthStatusSummary["overall"];
  ok: number;
  warn: number;
  error: number;
  missing: number;
  offline: number;
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
  offline: row.offline ?? 0,
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
    offline: snapshot.summary.offline,
  };

  const id = await db.events.add(payload);
  await enforceLimit(limit);
  return id;
}

export async function getRecentHealthEvents(limit = 20): Promise<HealthEvent[]> {
  const rows = await db.events.orderBy("recordedAt").reverse().limit(limit).toArray();
  return rows.map(stripRow);
}

export async function listHealthEvents(limit?: number): Promise<HealthEvent[]> {
  const query = db.events.orderBy("recordedAt").reverse();
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

export const healthEventsToCsv = (events: HealthEvent[]): string => {
  const headers = [
    "id",
    "recordedAt",
    "overall",
    "ok",
    "warn",
    "error",
    "missing",
    "offline",
    "averageLatencyMs",
    "failing",
    "checks",
  ];

  const rows = events.map((event) => {
    const failing =
      event.summary?.failing?.map((item) => `${item.id}:${item.status}`).join(" | ") ??
      event.checks
        ?.filter((check) => check.status === "error" || check.status === "missing")
        .map((check) => `${check.id}:${check.status}`)
        .join(" | ") ??
      "";

    const checks = event.checks?.map((check) => `${check.id}:${check.status}`).join(" | ") ?? "";

    return [
      event.id,
      event.recordedAt,
      event.overall,
      event.ok,
      event.warn,
      event.error,
      event.missing,
      event.offline ?? "",
      event.averageLatencyMs ?? "",
      failing,
      checks,
    ]
      .map(csvEscape)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
};

export async function clearHealthEvents(): Promise<void> {
  await db.events.clear();
}

export default db;
