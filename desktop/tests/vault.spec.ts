import { expect, Page, test } from "@playwright/test";
import { goHome, setupPage, TEST_PASSWORD, type VaultIntegrityIssue, type VaultRecord } from "./helpers";

const BREACH_SUFFIX = "B6BE8C106BF9ED79E7E0826D58A4824AD28"; // SHA-1 suffix for vault-smoke-pass
const REMEMBERED_PASSWORD_B64 = "dmF1bHQtc21va2UtcGFzcw==";

const openVaultPanel = async (page: Page, options?: Parameters<typeof setupPage>[1]) => {
  if (options) {
    await setupPage(page, options);
  }
  await goHome(page);
  await page.getByRole("button", { name: "Data Core" }).click();
};

const unlockVault = async (page: Page) => {
  await page.getByLabel("Vault password").fill(TEST_PASSWORD);
  await page.getByTestId("vault-unlock-btn").click();
  await expect(page.locator(".pip-vault-header-actions")).toContainText("Unlocked");
};

test.describe("Vault password and Argon2 UI", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("unlocks vault and saves Argon2 tuning", async ({ page }) => {
    await openVaultPanel(page);
    const header = page.locator(".pip-vault-header-actions");
    await expect(header).toContainText("Password locked");

    await unlockVault(page);

    await page.getByTestId("vault-kdf-argon2").click();
    await page.getByTestId("vault-kdf-memory").evaluate((el) => {
      const input = el as HTMLInputElement;
      input.value = String(128 * 1024);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByTestId("vault-kdf-iterations").fill("4");
    await page.getByTestId("vault-kdf-parallelism").fill("2");
    await page.getByTestId("vault-kdf-save").click();

    await expect(page.getByTestId("vault-status-pill")).toContainText(/argon2id/i);
    await expect(page.getByTestId("vault-kdf-preference")).toHaveText(/Argon2id/);
  });

  test("runs breach check with HIBP range response", async ({ page }) => {
    await page.route("https://api.pwnedpasswords.com/range/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: `${BREACH_SUFFIX}:42\nFFFFF0000000000000000000000000000000000:0`,
      }),
    );

    await openVaultPanel(page);
    await page.getByLabel("Vault password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Run breach check" }).click();

    const breachPill = page.locator(".pip-vault-breach .pill");
    await expect(breachPill).toContainText("Found in 42 breach entries");
    await expect(page.locator(".pip-vault-breach .hint")).toContainText("Hits: 42");
    await expect(page.getByTestId("vault-breach-meta")).toContainText("Checked");
  });

  test("repairs integrity issues via re-wrap path", async ({ page }) => {
    const issue: VaultIntegrityIssue = { id: "rec-issue-1", error: "Checksum mismatch" };
    const record: VaultRecord = {
      id: issue.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      manifestTx: "tx-issue",
      pip: { mock: true },
    };

    await openVaultPanel(page, { records: [record], integrityIssues: [issue] });
    await unlockVault(page);

    await page.getByRole("button", { name: "Scan integrity" }).click();
    const issueRow = page.locator(".pip-vault-integrity-item");
    await expect(issueRow).toHaveCount(1);
    await expect(issueRow).toContainText(issue.id);

    await page.getByRole("button", { name: "Attempt repair" }).click();
    await expect(issueRow).toHaveCount(0);
    await expect(page.locator(".pip-vault-integrity-issues")).toContainText("Last scan clean");
  });

  test("toggles hardware placeholder flag", async ({ page }) => {
    await openVaultPanel(page);
    const hwStatus = page.locator(".pip-vault-hw strong");
    const hwToggle = page.getByRole("button", { name: /placeholder/i });

    await expect(hwStatus).toHaveText("Optional placeholder");
    await expect(hwToggle).toHaveText("Add placeholder");

    await hwToggle.click();
    await expect(hwStatus).toHaveText("Placeholder added");
    await expect(hwToggle).toHaveText("Remove placeholder");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("pip-vault-hardware-placeholder"))).toBe("1");

    await hwToggle.click();
    await expect(hwStatus).toHaveText("Optional placeholder");
    await expect.poll(async () => page.evaluate(() => window.localStorage.getItem("pip-vault-hardware-placeholder"))).toBe(null);
  });

  test("disables password mode then re-enables it", async ({ page }) => {
    await openVaultPanel(page);
    await unlockVault(page);

    await page.getByRole("button", { name: "Disable password" }).click();
    const disableModal = page.locator(".pip-vault-modal");
    await disableModal.getByRole("button", { name: "Use keychain" }).click();

    const header = page.locator(".pip-vault-header-actions");
    await expect(header).toContainText("Safe storage");
    await expect(header).toContainText("Unlocked");

    await page.getByLabel("Vault password").fill(TEST_PASSWORD);
    await page.getByTestId("vault-unlock-btn").click();
    const enableModal = page.locator(".pip-vault-modal");
    await enableModal.getByRole("button", { name: "Enable password" }).click();

    await expect(header).toContainText("Password ready");
    await expect(header).toContainText("Unlocked");
  });

  test("remembers unlock and auto-unlocks on reload", async ({ page }) => {
    await openVaultPanel(page);
    const header = page.locator(".pip-vault-header-actions");
    const rememberHint = page.getByTestId("vault-remember-hint");

    await page.getByLabel("Vault password").fill(TEST_PASSWORD);
    await page.getByLabel("Remember unlock for this session").check();
    await expect(rememberHint).toHaveText(/(will cache after unlock|auto-unlock ready)/i);
    await expect.poll(async () => page.evaluate(() => window.sessionStorage.getItem("pip-vault-remember-password"))).toBe(
      REMEMBERED_PASSWORD_B64,
    );

    await page.getByTestId("vault-unlock-btn").click();
    await expect(header).toContainText("Unlocked");
    await expect(rememberHint).toHaveText(/auto-unlock ready/i);

    await page.reload();
    await page.getByRole("button", { name: "Data Core" }).click();
    const reloadedHeader = page.locator(".pip-vault-header-actions");
    await expect(reloadedHeader).toContainText("Unlocked", { timeout: 7000 });
    await expect(page.getByTestId("vault-remember-hint")).toHaveText(/auto-unlock ready/i, { timeout: 7000 });
  });
});
