import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { INVOKE_CHANNELS, InvokeChannel } from "./shared/ipc";

type WalletResponse = { path: string; wallet: Record<string, unknown> };
type PipVaultReadResult = { exists: boolean; updatedAt?: string; pip?: Record<string, unknown> };
type PipVaultRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  manifestTx: string;
  tenant?: string;
  site?: string;
};
type PipVaultKdfMeta = {
  algorithm: "pbkdf2" | "argon2id";
  iterations?: number;
  salt?: string;
  memoryKiB?: number;
  parallelism?: number;
  digest?: string;
  version?: number;
};
type PipVaultDescribeResult = {
  exists: boolean;
  updatedAt?: string;
  encrypted: boolean;
  path: string;
  mode: "safeStorage" | "plain" | "password";
  iterations?: number;
  salt?: string;
  locked: boolean;
  recordCount: number;
  kdf?: PipVaultKdfMeta;
  hardwarePlaceholder?: boolean;
  lockedAt?: string;
};
type PipVaultExportResult = {
  ok: true;
  bundle: string;
  checksum: string;
  bytes: number;
  createdAt: string;
  recordCount: number;
  kdf?: PipVaultKdfMeta;
};
type PipVaultIntegrityResult = {
  ok: true;
  scanned: number;
  failed: { id: string; error: string }[];
  durationMs: number;
  recordCount: number;
};
type PipVaultLockResult = { ok: true; locked: boolean; lockedAt: string };
type UpdateStatus =
  | { status: "disabled" }
  | { status: "checking" }
  | { status: "available"; info: unknown }
  | { status: "idle"; info?: unknown }
  | { status: "downloading"; progress: unknown }
  | { status: "downloaded"; info: unknown }
  | { status: "error"; message: string };

const allowedChannels = new Set(INVOKE_CHANNELS);

const sanitizePayload = (value: unknown): unknown => {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizePayload);
  }

  if (typeof value === "function") {
    return undefined;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && typeof v !== "function")
      .map(([k, v]) => [k, sanitizePayload(v)] as const);
    return Object.freeze(Object.fromEntries(entries));
  }

  return value;
};

const invoke = (channel: InvokeChannel, ...args: unknown[]) => {
  if (!allowedChannels.has(channel)) {
    throw new Error(`Blocked IPC invocation to ${channel}`);
  }
  const cleaned = args.map((arg) => sanitizePayload(arg));
  return ipcRenderer.invoke(channel, ...cleaned);
};

const freeze = <T>(value: T): Readonly<T> => Object.freeze(value);

const disableEvalAndFunction = () => {
  const blocker = () => {
    throw new Error("eval/Function are disabled in this app context");
  };

  Object.defineProperty(globalThis, "eval", { value: blocker, configurable: false, writable: false });
  Object.defineProperty(globalThis, "Function", { value: blocker as any, configurable: false, writable: false });
};

disableEvalAndFunction();

const walletApi = {
  readWallet: async (walletPath: string): Promise<WalletResponse> => {
    return invoke("wallet:read", walletPath);
  },
};
contextBridge.exposeInMainWorld("wallet", freeze(walletApi));

contextBridge.exposeInMainWorld(
  "desktop",
  freeze({
    selectWallet: () => invoke("wallet:select"),
    pickModuleFile: () => invoke("module:pick"),
    readTextFile: (path: string) => invoke("file:readText", path),
  }),
);

contextBridge.exposeInMainWorld(
  "pipVault",
  freeze({
    read: (): Promise<PipVaultReadResult> => invoke("pipVault:read"),
    write: (pip: Record<string, unknown>) => invoke("pipVault:write", pip),
    clear: (): Promise<{ ok: true }> => invoke("pipVault:clear"),
    describe: (): Promise<PipVaultDescribeResult> => invoke("pipVault:describe"),
    list: (): Promise<{ exists: boolean; records: PipVaultRecord[] }> => invoke("pipVault:list"),
    loadRecord: (id: string): Promise<PipVaultReadResult> => invoke("pipVault:readRecord", id),
    deleteRecord: (id: string): Promise<{ ok: true; removed: boolean }> => invoke("pipVault:deleteRecord", id),
    enablePasswordMode: (password: string, options?: { kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean }) =>
      invoke("pipVault:enablePassword", password, options),
    disablePasswordMode: () => invoke("pipVault:disablePassword"),
    exportVault: (): Promise<PipVaultExportResult> => invoke("pipVault:export"),
    importVault: (bundle: unknown, password?: string) => invoke("pipVault:import", bundle, password),
    scanIntegrity: (password?: string): Promise<PipVaultIntegrityResult> => invoke("pipVault:scanIntegrity", password),
    lock: (): Promise<PipVaultLockResult> => invoke("pipVault:lock"),
    repairRecord: (
      id: string,
      options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean },
    ): Promise<{ ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string }> =>
      invoke("pipVault:repairRecord", id, options),
    setHardwarePlaceholder: (enabled: boolean): Promise<{ ok: true; hardwarePlaceholder: boolean }> =>
      invoke("pipVault:setHardwarePlaceholder", enabled),
    telemetry: (event: { event: string; at?: string; detail?: Record<string, unknown> }) =>
      invoke("pipVault:telemetry", event),
  }),
);

contextBridge.exposeInMainWorld(
  "updates",
  freeze({
    onStatus: (listener: (status: UpdateStatus) => void) => {
      const channel = "autoUpdate:status";
      const handler = (_event: IpcRendererEvent, payload: UpdateStatus) => listener(payload);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    checkNow: () => invoke("autoUpdate:check"),
    quitAndInstall: () => invoke("autoUpdate:install"),
  }),
);

export {};
