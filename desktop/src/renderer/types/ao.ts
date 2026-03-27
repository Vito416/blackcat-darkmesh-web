export type AoActionKind = "deploy" | "spawn";

export type AoLogSeverity = "success" | "warning" | "error" | "info";

export type AoLogContext = {
  manifestTx?: string;
  moduleTx?: string;
  scheduler?: string;
  transient?: boolean;
  dryRun?: boolean;
  profileId?: string;
};

export type AoLogSparkline = {
  path: string;
  points: { x: number; y: number; value: number }[];
  width: number;
  height: number;
  min: number;
  max: number;
  latest: number;
};

export type AoLogMetrics = {
  successRate: number | null;
  averageLatency: number | null;
  sparkline: AoLogSparkline | null;
  counts: Record<AoLogSeverity | "all", number>;
};

export type AoMiniLogEntry = {
  kind: AoActionKind;
  id: string | null;
  status: string;
  time: string;
  href: string | null;
  severity: AoLogSeverity;
  durationMs?: number;
  context?: AoLogContext;
  payload?: unknown;
  raw?: string;
};

export type AoWalletMode = "ipc" | "path" | "jwk";

export type SpawnSnapshot = {
  processId: string;
  manifestTx: string;
  moduleTx: string;
  scheduler?: string;
  time: string;
};

export type AoDeployProfile = {
  id: string;
  label: string;
  walletMode: AoWalletMode;
  walletPath?: string | null;
  moduleTx?: string | null;
  manifestTx?: string | null;
  scheduler?: string | null;
  dryRun?: boolean;
  lastKind: AoActionKind;
  createdAt: string;
  updatedAt: string;
};

export type AoProfileSnapshot = {
  id?: string;
  label?: string;
  walletMode: AoWalletMode;
  walletPath?: string | null;
  moduleTx?: string | null;
  manifestTx?: string | null;
  scheduler?: string | null;
  dryRun?: boolean;
  lastKind: AoActionKind;
};
