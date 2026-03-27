import { Page } from "@playwright/test";

export const TEST_PASSWORD = "vault-smoke-pass";

export type VaultRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  manifestTx: string;
  tenant?: string;
  site?: string;
  pip?: Record<string, unknown>;
};

export type VaultKdfMeta = {
  algorithm: "pbkdf2" | "argon2id";
  iterations?: number;
  salt?: string;
  memoryKiB?: number;
  parallelism?: number;
};

export type VaultIntegrityIssue = { id: string; error: string };

export type VaultState = {
  mode: "password" | "safeStorage";
  unlocked: boolean;
  password: string;
  exists: boolean;
  pip: Record<string, unknown> | null;
  records: VaultRecord[];
  integrityIssues: VaultIntegrityIssue[];
  iterations: number;
  salt: string;
  updatedAt: string;
  kdf: VaultKdfMeta;
  hardwarePlaceholder: boolean;
  lockedAt?: string | null;
};

type SetupOptions = {
  vaultPassword?: string;
  kdf?: VaultKdfMeta;
  records?: VaultRecord[];
  integrityIssues?: VaultIntegrityIssue[];
  hardwarePlaceholder?: boolean;
};

const DEFAULT_KDF_SALT = typeof Buffer !== "undefined" ? Buffer.from("smoke-salt").toString("base64") : "c21va2Utc2FsdA==";

const DEFAULT_KDF: VaultKdfMeta = {
  algorithm: "argon2id",
  iterations: 3,
  memoryKiB: 64 * 1024,
  parallelism: 1,
  salt: DEFAULT_KDF_SALT,
};

export async function setupPage(page: Page, options: SetupOptions = {}) {
  const {
    vaultPassword = TEST_PASSWORD,
    kdf = DEFAULT_KDF,
    records = [],
    integrityIssues = [],
    hardwarePlaceholder = false,
  } = options;

  await page.addInitScript(
    ({ password, kdfProfile, seedRecords, seedIntegrityIssues, hardwarePlaceholder: seedHardwarePlaceholder }) => {
      const state: VaultState = {
        mode: "password",
        unlocked: false,
        password,
        exists: true,
        pip: null,
        records: seedRecords ?? [],
        integrityIssues: seedIntegrityIssues ?? [],
        iterations: 100_000,
        salt: kdfProfile.salt ?? btoa("smoke-salt"),
        updatedAt: new Date().toISOString(),
        kdf: kdfProfile,
        hardwarePlaceholder: Boolean(seedHardwarePlaceholder),
        lockedAt: null,
      };

      const toRecordMeta = (record: VaultRecord) => ({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        manifestTx: record.manifestTx,
        tenant: record.tenant,
        site: record.site,
      });

      const describe = () => ({
        exists: state.exists,
        updatedAt: state.updatedAt,
        encrypted: true,
        path: "/tmp/mock-pip-vault.json",
        mode: state.mode,
        iterations: state.iterations,
        salt: state.salt,
        kdf: state.kdf,
        hardwarePlaceholder: state.hardwarePlaceholder,
        lockedAt: state.lockedAt ?? undefined,
        locked: state.mode === "password" ? !state.unlocked : false,
        recordCount: state.records.length,
      });

      (window as unknown as { pipVault?: unknown }).pipVault = {
        read: async () => (state.pip ? { exists: true, updatedAt: state.updatedAt, pip: state.pip } : { exists: false }),
        write: async (pip: Record<string, unknown>) => {
          state.pip = pip;
          state.exists = true;
          state.updatedAt = new Date().toISOString();
          return { updatedAt: state.updatedAt };
        },
        clear: async () => {
          state.pip = null;
          state.exists = false;
          state.records = [];
          state.unlocked = state.mode !== "password";
          return { ok: true };
        },
        describe: async () => describe(),
        list: async () => ({ exists: state.records.length > 0, records: state.records.map(toRecordMeta) }),
        loadRecord: async (id: string) => {
          const match = state.records.find((r) => r.id === id);
          return match ? { exists: true, updatedAt: match.updatedAt, pip: match.pip } : { exists: false };
        },
        deleteRecord: async (id: string) => {
          const before = state.records.length;
          state.records = state.records.filter((r) => r.id !== id);
          return { ok: true, removed: before !== state.records.length };
        },
        enablePasswordMode: async (input: string, opts?: { kdf?: VaultKdfMeta; hardwarePlaceholder?: boolean }) => {
          const trimmed = (input ?? "").trim();
          if (!trimmed) {
            throw new Error("Vault password required");
          }
          const nextKdf = opts?.kdf ?? kdfProfile;
          const nextHardware =
            typeof opts?.hardwarePlaceholder === "boolean" ? opts.hardwarePlaceholder : state.hardwarePlaceholder;

          if (state.mode === "password" && !state.unlocked) {
            if (trimmed !== state.password) {
              throw new Error("Invalid vault password");
            }
            state.unlocked = true;
            state.lockedAt = null;
            state.kdf = nextKdf;
            state.hardwarePlaceholder = nextHardware;
          } else {
            state.mode = "password";
            state.password = trimmed;
            state.unlocked = true;
            state.exists = true;
            state.kdf = nextKdf;
            state.hardwarePlaceholder = nextHardware;
            state.lockedAt = null;
          }

          state.updatedAt = new Date().toISOString();
          return {
            ok: true,
            mode: "password",
            iterations: state.iterations,
            salt: state.salt,
            records: state.records.length,
            hardwarePlaceholder: state.hardwarePlaceholder,
            kdf: state.kdf,
          };
        },
        disablePasswordMode: async () => {
          state.mode = "safeStorage";
          state.unlocked = true;
          state.lockedAt = null;
          state.updatedAt = new Date().toISOString();
          return { ok: true, mode: "safeStorage" };
        },
        exportVault: async () => ({
          ok: true,
          bundle: JSON.stringify({ mock: true, at: new Date().toISOString() }),
          checksum: "mock-checksum",
          bytes: 64,
          createdAt: new Date().toISOString(),
          recordCount: state.records.length,
          hardwarePlaceholder: state.hardwarePlaceholder,
          kdf: state.kdf,
        }),
        importVault: async (_bundle: unknown, pwd?: string) => {
          state.mode = pwd ? "password" : "safeStorage";
          state.unlocked = !pwd || pwd === state.password;
          state.lockedAt = state.unlocked ? null : new Date().toISOString();
          state.updatedAt = new Date().toISOString();
          return { ok: true, mode: state.mode, records: state.records.length };
        },
        scanIntegrity: async () => ({
          ok: true,
          scanned: state.records.length || state.integrityIssues.length,
          failed: state.integrityIssues,
          durationMs: 5,
          recordCount: state.records.length,
        }),
        repairRecord: async (id: string, options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean }) => {
          const remaining = state.integrityIssues.filter((issue) => issue.id !== id);
          const repaired = remaining.length !== state.integrityIssues.length;
          state.integrityIssues = remaining;
          const response: { ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string } = {
            ok: true,
            repaired,
          };
          if (options?.strategy === "quarantine") {
            response.quarantinedPath = `/tmp/${id}.quarantine.json`;
            response.message = "Record quarantined";
          } else if (options?.strategy === "rewrap") {
            response.message = "Record re-wrapped";
          }
          return response;
        },
        setHardwarePlaceholder: async (enabled: boolean) => {
          state.hardwarePlaceholder = enabled;
          return { ok: true, hardwarePlaceholder: state.hardwarePlaceholder };
        },
        lock: async () => {
          state.unlocked = false;
          state.lockedAt = new Date().toISOString();
          return { ok: true, locked: true, lockedAt: state.lockedAt };
        },
        __lock: () => {
          state.unlocked = false;
          state.lockedAt = new Date().toISOString();
        },
      } as Window["pipVault"];

      (window as unknown as { desktop?: unknown }).desktop = (window as any).desktop || {
        selectWallet: async () => ({ canceled: true }),
        pickModuleFile: async () => ({ canceled: true }),
        readTextFile: async (path: string) => ({ path, content: "", canceled: true }),
      };

      (window as unknown as { wallet?: unknown }).wallet = {
        readWallet: async (path?: string) => ({
          path: path ?? "/tmp/mock-wallet.json",
          wallet: { kty: "RSA", n: "mock-wallet", path },
        }),
      };

      (window as { __AO_TEST_MODULE__?: unknown }).__AO_TEST_MODULE__ = {
        async deployModule(_wallet: unknown, moduleSrc: string) {
          return {
            txId: `tx-${Math.random().toString(36).slice(2, 10)}`,
            tags: [],
            placeholder: false,
            note: "Deploy mock complete",
            raw: { mock: true, moduleBytes: moduleSrc?.length ?? 0 },
          };
        },
        async simulateDeployModule(moduleSrc: string) {
          return {
            txId: `dryrun-${Math.random().toString(36).slice(2, 10)}`,
            tags: [],
            placeholder: false,
            note: "Dry-run mock gateway",
            raw: { mock: true, dryRun: true, moduleBytes: moduleSrc?.length ?? 0 },
          };
        },
        async spawnProcess(_scheduler?: string, manifestTx?: string, moduleTx?: string) {
          return {
            processId: `pid-${Math.random().toString(36).slice(2, 10)}`,
            tags: [],
            placeholder: false,
            note: "Spawn mock complete",
            raw: { mock: true, manifestTx, moduleTx },
            moduleTx: moduleTx ?? null,
          };
        },
      };
    },
    {
      password: vaultPassword,
      kdfProfile: kdf,
      seedRecords: records,
      seedIntegrityIssues: integrityIssues,
      hardwarePlaceholder,
    },
  );

  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("ws://localhost") ||
      url.startsWith("ws://127.0.0.1") ||
      url.startsWith("file:")
    ) {
      return route.continue();
    }
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      body: "{}",
      headers: { "content-type": "application/json" },
    });
  });
}

export async function goHome(page: Page, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      const root = page.locator("#root");
      await root.waitFor({ timeout: 10_000 });
      await page.getByTestId("manifest-name-input").waitFor({ timeout: 10_000 });
      await page.locator(".workspace-nav").waitFor({ timeout: 10_000 });
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await page.waitForTimeout(500);
    }
  }
}
