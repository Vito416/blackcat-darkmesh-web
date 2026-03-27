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
        lockedAt?: string;
        recordCount: number;
        hardwarePlaceholder?: boolean;
        kdf?: {
          algorithm: "pbkdf2" | "argon2id";
          iterations?: number;
          salt?: string;
          memoryKiB?: number;
          parallelism?: number;
          digest?: string;
          version?: number;
        };
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
        options?: {
          kdf?: { algorithm: "pbkdf2" | "argon2id"; iterations?: number; salt?: string; memoryKiB?: number; parallelism?: number };
          hardwarePlaceholder?: boolean;
        },
      ) => Promise<{
        ok: true;
        mode: "safeStorage" | "plain" | "password";
        kdf?: { algorithm: "pbkdf2" | "argon2id"; iterations?: number; salt?: string; memoryKiB?: number; parallelism?: number };
        records?: number;
        hardwarePlaceholder?: boolean;
      }>;
      disablePasswordMode: () => Promise<{ ok: true; mode: "safeStorage" | "plain" | "password" }>;
      exportVault: () => Promise<{
        ok: true;
        bundle: string;
        checksum: string;
        bytes: number;
        createdAt: string;
        recordCount: number;
        hardwarePlaceholder?: boolean;
        kdf?: {
          algorithm: "pbkdf2" | "argon2id";
          iterations?: number;
          salt?: string;
          memoryKiB?: number;
          parallelism?: number;
          digest?: string;
          version?: number;
        };
      }>;
      importVault: (
        bundle: unknown,
        password?: string,
      ) => Promise<{
        ok: true;
        mode: string;
        records: number;
        kdf?: { algorithm: "pbkdf2" | "argon2id"; iterations?: number; salt?: string; memoryKiB?: number; parallelism?: number };
        hardwarePlaceholder?: boolean;
      }>;
      scanIntegrity: (
        password?: string,
      ) => Promise<{ ok: true; scanned: number; failed: { id: string; error: string }[]; durationMs: number; recordCount: number }>;
      repairRecord: (
        id: string,
        options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean },
      ) => Promise<{ ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string }>;
      setHardwarePlaceholder: (enabled: boolean) => Promise<{ ok: true; hardwarePlaceholder: boolean }>;
      telemetry: (event: { event: string; at?: string; detail?: Record<string, unknown> }) => Promise<{ ok: true }>;
      lock: () => Promise<{ ok: true; locked: boolean; lockedAt: string }>;
    };
    updates?: {
      onStatus: (
        listener: (
          status:
            | { status: "disabled" }
            | { status: "checking" }
            | { status: "available"; info: unknown }
            | { status: "idle"; info?: unknown }
            | { status: "downloading"; progress: unknown }
            | { status: "downloaded"; info: unknown }
            | { status: "error"; message: string },
        ) => void,
      ) => () => void;
      checkNow: () => Promise<unknown>;
      quitAndInstall: () => Promise<{ installed: boolean; reason?: string }>;
    };
  }

  // Vite asset imports with ?url in TSX
  declare module "*.css?url" {
    const url: string;
    export default url;
  }
}
