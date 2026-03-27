import { expect, test } from "@playwright/test";
import { goHome, setupPage } from "./helpers";

test.describe("AO deploy flows", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("runs dry-run and real deploy with mock gateway", async ({ page }) => {
    await goHome(page);
    await page.getByRole("button", { name: "AO Console" }).click();
    await page.addStyleTag({ content: ".top-bar{pointer-events:none !important;}" });

    const walletMode = page.getByTestId("wallet-mode-jwk");
    await walletMode.scrollIntoViewIfNeeded();
    await walletMode.click();
    await page.getByTestId("wallet-jwk-input").fill('{"kty":"RSA","n":"mock-key"}');
    await page.getByTestId("ao-module-source").fill("export const handle = (state) => state;");

    await page.getByTestId("ao-dry-run-toggle").check();
    await page.getByTestId("ao-deploy-btn").click();
    await expect(page.getByTestId("ao-deploy-status")).toContainText(/dry-run|mock gateway|simulation/i);
    await expect(page.locator(".ao-mini-log-table tbody tr").first()).toContainText("deploy");

    await page.getByTestId("ao-dry-run-toggle").uncheck();
    await page.getByTestId("ao-deploy-btn").click();
    await expect(page.getByTestId("ao-deploy-status")).toContainText(/deploy mock complete|module deployed|deploy request/i);
    await expect(page.getByTestId("ao-deploy-status")).toHaveClass(/success/);
    await expect(page.getByTestId("ao-module-tx-input")).not.toHaveValue("");
    await expect(page.locator(".ao-mini-log-table tbody tr").first()).toContainText(/Success/i);
  });
});
