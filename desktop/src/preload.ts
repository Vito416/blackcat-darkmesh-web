import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

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

const walletApi = {
  readWallet: async (walletPath: string): Promise<WalletResponse> => {
    return ipcRenderer.invoke("wallet:read", walletPath);
  },
};

contextBridge.exposeInMainWorld("wallet", walletApi);

contextBridge.exposeInMainWorld("desktop", {
  selectWallet: () => ipcRenderer.invoke("wallet:select"),
  pickModuleFile: () => ipcRenderer.invoke("module:pick"),
  readTextFile: (path: string) => ipcRenderer.invoke("file:readText", path),
});

contextBridge.exposeInMainWorld("pipVault", {
  read: (): Promise<PipVaultReadResult> => ipcRenderer.invoke("pipVault:read"),
  write: (pip: Record<string, unknown>) => ipcRenderer.invoke("pipVault:write", pip),
  clear: (): Promise<{ ok: true }> => ipcRenderer.invoke("pipVault:clear"),
  describe: (): Promise<PipVaultDescribeResult> => ipcRenderer.invoke("pipVault:describe"),
  list: (): Promise<{ exists: boolean; records: PipVaultRecord[] }> => ipcRenderer.invoke("pipVault:list"),
  loadRecord: (id: string): Promise<PipVaultReadResult> => ipcRenderer.invoke("pipVault:readRecord", id),
  deleteRecord: (id: string): Promise<{ ok: true; removed: boolean }> => ipcRenderer.invoke("pipVault:deleteRecord", id),
  enablePasswordMode: (password: string, options?: { kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean }) =>
    ipcRenderer.invoke("pipVault:enablePassword", password, options),
  disablePasswordMode: () => ipcRenderer.invoke("pipVault:disablePassword"),
  exportVault: (): Promise<PipVaultExportResult> => ipcRenderer.invoke("pipVault:export"),
  importVault: (bundle: unknown, password?: string) => ipcRenderer.invoke("pipVault:import", bundle, password),
  scanIntegrity: (password?: string): Promise<PipVaultIntegrityResult> =>
    ipcRenderer.invoke("pipVault:scanIntegrity", password),
  lock: (): Promise<PipVaultLockResult> => ipcRenderer.invoke("pipVault:lock"),
  repairRecord: (
    id: string,
    options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean },
  ): Promise<{ ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string }> =>
    ipcRenderer.invoke("pipVault:repairRecord", id, options),
  setHardwarePlaceholder: (enabled: boolean): Promise<{ ok: true; hardwarePlaceholder: boolean }> =>
    ipcRenderer.invoke("pipVault:setHardwarePlaceholder", enabled),
  telemetry: (event: { event: string; at?: string; detail?: Record<string, unknown> }) =>
    ipcRenderer.invoke("pipVault:telemetry", event),
});

contextBridge.exposeInMainWorld("updates", {
  onStatus: (listener: (status: UpdateStatus) => void) => {
    const channel = "autoUpdate:status";
    const handler = (_event: IpcRendererEvent, payload: UpdateStatus) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  checkNow: () => ipcRenderer.invoke("autoUpdate:check"),
  quitAndInstall: () => ipcRenderer.invoke("autoUpdate:install"),
});

export {};
