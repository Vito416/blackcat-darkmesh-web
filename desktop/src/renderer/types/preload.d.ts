export {};

declare global {
  interface Window {
    wallet?: {
      readWallet: (walletPath: string) => Promise<{ path: string; wallet: Record<string, unknown> }>;
    };
    desktop?: {
      selectWallet: () => Promise<
        | { path?: string; jwk?: Record<string, unknown>; error?: string; canceled?: boolean }
        | undefined
      >;
      pickModuleFile: () => Promise<
        | { path?: string; content?: string; error?: string; canceled?: boolean }
        | undefined
      >;
      readTextFile: (
        path: string,
      ) => Promise<{ path?: string; content?: string; error?: string; canceled?: boolean } | undefined>;
    };
    pipVault?: {
      read: () => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> }>;
      write: (pip: Record<string, unknown>) => Promise<{ updatedAt: string }>;
      clear: () => Promise<{ ok: true }>;
      describe: () => Promise<{ exists: boolean; updatedAt?: string; encrypted: boolean; path: string }>;
    };
  }
}
