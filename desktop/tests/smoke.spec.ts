import { test, expect, Page } from "@playwright/test";

const TEST_PASSWORD = "vault-smoke-pass";

type VaultRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  manifestTx: string;
  tenant?: string;
  site?: string;
  pip?: Record<string, unknown>;
};

type VaultState = {
  mode: "password" | "safeStorage";
  unlocked: boolean;
  password: string;
  exists: boolean;
  pip: Record<string, unknown> | null;
  records: VaultRecord[];
  iterations: number;
  salt: string;
  updatedAt: string;
};

async function setupPage(page: Page) {
  await page.addInitScript(({ password }) => {
    const state: VaultState = {
      mode: "password",
      unlocked: false,
      password,
      exists: true,
      pip: null,
      records: [],
      iterations: 100_000,
      salt: btoa("smoke-salt"),
      updatedAt: new Date().toISOString(),
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
      enablePasswordMode: async (input: string) => {
        const trimmed = (input ?? "").trim();
        if (!trimmed) {
          throw new Error("Vault password required");
        }

        if (state.mode === "password" && !state.unlocked) {
          if (trimmed !== state.password) {
            throw new Error("Invalid vault password");
          }
          state.unlocked = true;
        } else {
          state.mode = "password";
          state.password = trimmed;
          state.unlocked = true;
          state.exists = true;
        }

        state.updatedAt = new Date().toISOString();
        return {
          ok: true,
          mode: "password",
          iterations: state.iterations,
          salt: state.salt,
          records: state.records.length,
        };
      },
      disablePasswordMode: async () => {
        state.mode = "safeStorage";
        state.unlocked = true;
        state.updatedAt = new Date().toISOString();
        return { ok: true, mode: "safeStorage" };
      },
      exportVault: async () => ({ ok: true, bundle: JSON.stringify({ mock: true, at: new Date().toISOString() }) }),
      importVault: async (_bundle: unknown, pwd?: string) => {
        state.mode = pwd ? "password" : "safeStorage";
        state.unlocked = !pwd || pwd === state.password;
        state.updatedAt = new Date().toISOString();
        return { ok: true, mode: state.mode, records: state.records.length };
      },
      __lock: () => {
        state.unlocked = false;
      },
    } as Window["pipVault"];

    (window as unknown as { desktop?: unknown }).desktop = (window as any).desktop || {
      selectWallet: async () => ({ canceled: true }),
      pickModuleFile: async () => ({ canceled: true }),
      readTextFile: async (path: string) => ({ path, content: "", canceled: true }),
    };
  }, { password: TEST_PASSWORD });

  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith("http://localhost") ||
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("ws://localhost") ||
      url.startsWith("ws://127.0.0.1")
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

test.describe("Desktop renderer smoke", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("creates draft, autosaves, undoes/redoes, and opens diff", async ({ page }) => {
    await page.goto("/");

    const titleInput = page.getByLabel("Manifest name");
    const saveStatus = page.locator(".save-status-label");

    await titleInput.fill("Smoke Draft");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(saveStatus).toHaveText("Draft saved");

    await titleInput.fill("Smoke Draft v2");
    await expect(saveStatus).toHaveText("Unsaved changes");
    await expect(saveStatus).toHaveText("Draft saved", { timeout: 4_000 });

    const topButtons = page.locator(".top-buttons");
    const undo = topButtons.getByRole("button", { name: "Undo" });
    const redo = topButtons.getByRole("button", { name: "Redo" });
    await expect(undo).toBeEnabled();

    await undo.click();
    await expect(titleInput).toHaveValue("Smoke Draft");
    await redo.click();
    await expect(titleInput).toHaveValue("Smoke Draft v2");

    await page.getByTestId("draft-diff-btn").click();
    const diffDialog = page.getByRole("dialog", { name: "Draft diff panel" });
    await expect(diffDialog.getByText("Cherry-pick changes")).toBeVisible();
    await expect(diffDialog.getByText(/Select a draft|No diffs found/)).toBeVisible();
    await diffDialog.getByRole("button", { name: "Close" }).click();
  });

  test("loads AO console log panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "AO Console" }).click();

    await expect(page.getByText("AO console log")).toBeVisible();
    await expect(page.getByText("Action payloads")).toBeVisible();
    await expect(page.getByText("No AO actions logged yet.")).toBeVisible();
  });

  test("unlocks password-protected vault", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Data Core" }).click();

    const header = page.locator(".pip-vault-header-actions");
    await expect(header).toContainText("Password locked");
    await expect(header).toContainText("Locked");

    await page.getByLabel("Vault password").fill(TEST_PASSWORD);
    await page.getByTestId("vault-unlock-btn").click();

    await expect(header).toContainText("Password ready");
    await expect(header).toContainText("Unlocked");
  });
});
