import { expect, test } from "@playwright/test";
import { goHome, setupPage, TEST_PASSWORD } from "./helpers";

test.describe("Vault password and Argon2 UI", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("unlocks vault and saves Argon2 tuning", async ({ page }) => {
    await goHome(page);
    await page.getByRole("button", { name: "Data Core" }).click();

    const header = page.locator(".pip-vault-header-actions");
    await expect(header).toContainText("Password locked");

    await page.getByLabel("Vault password").fill(TEST_PASSWORD);
    await page.getByTestId("vault-unlock-btn").click();
    await expect(header).toContainText("Unlocked");

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
});
