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
      describe: () => Promise<{
        exists: boolean;
        updatedAt?: string;
        encrypted: boolean;
        path: string;
        mode: "safeStorage" | "plain" | "password";
        iterations?: number;
        salt?: string;
        locked: boolean;
        recordCount: number;
      }>;
      list: () => Promise<
        | {
            exists: boolean;
            records: Array<{
              id: string;
              createdAt: string;
              updatedAt: string;
              manifestTx: string;
              tenant?: string;
              site?: string;
            }>;
          }
        | undefined
      >;
      loadRecord: (
        id: string,
      ) => Promise<{ exists: boolean; updatedAt?: string; pip?: Record<string, unknown> } | undefined>;
      deleteRecord: (id: string) => Promise<{ ok: true; removed: boolean } | undefined>;
      enablePasswordMode: (
        password: string,
      ) => Promise<{ ok: true; mode: "safeStorage" | "plain" | "password"; iterations?: number; salt?: string; records?: number }>;
      disablePasswordMode: () => Promise<{ ok: true; mode: "safeStorage" | "plain" | "password" }>;
      exportVault: () => Promise<{
        ok: true;
        bundle: string;
        checksum: string;
        bytes: number;
        createdAt: string;
        recordCount: number;
      }>;
      importVault: (bundle: unknown, password?: string) => Promise<{ ok: true; mode: string; records: number }>;
      scanIntegrity: (
        password?: string,
      ) => Promise<{ ok: true; scanned: number; failed: { id: string; error: string }[]; durationMs: number; recordCount: number }>;
    };
  }
}
