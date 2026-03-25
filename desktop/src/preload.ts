import { contextBridge, ipcRenderer } from "electron";

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
};

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
  enablePasswordMode: (password: string) => ipcRenderer.invoke("pipVault:enablePassword", password),
  disablePasswordMode: () => ipcRenderer.invoke("pipVault:disablePassword"),
  exportVault: () => ipcRenderer.invoke("pipVault:export"),
  importVault: (bundle: unknown, password?: string) => ipcRenderer.invoke("pipVault:import", bundle, password),
});

export {};
