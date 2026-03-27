import type { AoMiniLogEntry } from "../types/ao";

const csvEscape = (value: unknown) => {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const aoLogToCsv = (entries: AoMiniLogEntry[]): string => {
  const headers = [
    "kind",
    "id",
    "status",
    "severity",
    "time",
    "durationMs",
    "manifestTx",
    "moduleTx",
    "scheduler",
    "profileId",
    "dryRun",
    "transient",
    "href",
  ];

  const rows = entries.map((entry) => {
    const context = entry.context ?? {};
    return [
      entry.kind,
      entry.id ?? "",
      entry.status,
      entry.severity,
      entry.time,
      entry.durationMs ?? "",
      context.manifestTx ?? "",
      context.moduleTx ?? "",
      context.scheduler ?? "",
      context.profileId ?? "",
      context.dryRun ? "true" : "",
      context.transient ? "true" : "",
      entry.href ?? "",
    ]
      .map(csvEscape)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
};

export const aoLogToJson = (entries: AoMiniLogEntry[]): string => JSON.stringify(entries, null, 2);
