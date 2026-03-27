import { expect, test } from "@playwright/test";
import { goHome, setupPage } from "./helpers";

test.describe("Review mode and drag/drop snapping", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("pins and resolves review comments on a node", async ({ page }) => {
    await goHome(page);
    await page.addStyleTag({ content: ".top-bar{pointer-events:none !important;}" });

    const catalog = page.locator(".catalog-item").first();
    await catalog.getByRole("button", { name: "Add" }).click();

    const treeCard = page.getByTestId("tree-card").first();

    await page.getByTestId("review-mode-toggle").check();
    const commentInput = page.getByTestId("review-comment-input");
    await commentInput.fill("Needs copy polish");
    await page.getByTestId("review-pin-btn").click();

    const comment = page.getByTestId("review-comment").first();
    await expect(comment).toContainText("Needs copy polish");

    await page.getByTestId("review-comment-resolve").first().click();
    await expect(comment).toHaveClass(/resolved/);
    await expect(page.getByText(/open comments/i)).toContainText(/0|No open/);
  });

  test("snaps drop target and reorders tree nodes", async ({ page }) => {
    await goHome(page);
    await page.addStyleTag({ content: ".top-bar{pointer-events:none !important;}" });

    const firstCatalog = page.locator(".catalog-item").first();
    const secondCatalog = page.locator(".catalog-item").nth(1);

    await firstCatalog.getByRole("button", { name: "Add" }).click();
    await secondCatalog.getByRole("button", { name: "Add" }).click();

    const treeCards = page.getByTestId("tree-card");
    await expect(treeCards).toHaveCount(2);

    const targetHandle = await treeCards.first().elementHandle();
    if (!targetHandle) throw new Error("Missing tree card handle");

    await page.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("application/x-darkmesh-node", "node-mock");
      const rect = el.getBoundingClientRect();
      const enter = new DragEvent("dragenter", {
        dataTransfer: dt,
        clientX: rect.left + 4,
        clientY: rect.top + 2,
        bubbles: true,
      });
      el.dispatchEvent(enter);
    }, targetHandle);
    await expect(treeCards.first()).toHaveAttribute("data-drop-placement", "before");

    await page.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("application/x-darkmesh-node", "node-mock");
      const rect = el.getBoundingClientRect();
      const enter = new DragEvent("dragenter", {
        dataTransfer: dt,
        clientX: rect.left + 4,
        clientY: rect.bottom - 2,
        bubbles: true,
      });
      el.dispatchEvent(enter);
    }, targetHandle);
    await expect(treeCards.first()).toHaveAttribute("data-drop-placement", "after");
  });
});
