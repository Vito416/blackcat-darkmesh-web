import { expect, test } from "@playwright/test";
import { goHome, setupPage } from "./helpers";

test.describe("Hotkey overlay", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("toggles learn and printable modes", async ({ page }) => {
    await goHome(page);
    await page.getByTestId("hotkey-help-button").click();

    const overlay = page.getByTestId("hotkey-overlay");
    await expect(overlay).toBeVisible();

    await page.getByTestId("hotkey-print-toggle").click();
    await expect(overlay).toHaveClass(/printable/);

    const learnToggle = page.getByTestId("hotkey-learn-toggle");
    await learnToggle.click();
    await expect(learnToggle).toHaveClass(/active/);

    await page.getByTestId("hotkey-overlay-backdrop").click({ position: { x: 2, y: 2 } });
    await expect(overlay).toBeHidden();
  });
});
