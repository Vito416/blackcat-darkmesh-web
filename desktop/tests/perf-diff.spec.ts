import { test, expect } from "@playwright/test";

import { goHome, setupPage } from "./helpers";

test.describe("Diff performance", () => {
  test.beforeEach(async ({ page }) => {
    await setupPage(page);
  });

  test("virtualized draft diff handles 10k entries within budget", async ({ page }) => {
    await goHome(page);

    await page.waitForFunction(() => Boolean((window as any).__darkmeshPerf?.seedDiff), null, {
      timeout: 10_000,
    });

    await page.evaluate(() => (window as any).__darkmeshPerf?.seedDiff?.(10_000));

    const diffDialog = page.getByRole("dialog", { name: /cherry-pick changes/i });
    await expect(diffDialog).toBeVisible({ timeout: 10_000 });

    const firstRow = diffDialog.locator(".draft-diff-row").first();
    await firstRow.waitFor({ timeout: 10_000 });

    const renderedCount = await page.evaluate(() => document.querySelectorAll(".draft-diff-row").length);
    expect(renderedCount).toBeLessThan(400);

    const perfEvent = await page.waitForFunction(
      () => {
        const log = (window as any).__darkmeshPerf?.perfLog?.();
        if (!Array.isArray(log)) return null;
        return log.find((entry: any) => entry?.name === "draftDiff.render");
      },
      null,
      { timeout: 10_000 },
    );

    const duration = await perfEvent.jsonValue();
    expect((duration as any)?.durationMs ?? 0).toBeLessThan(1500);

    const fps = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let frames = 0;
          let mounted = true;
          const start = performance.now();
          const loop = () => {
            if (!mounted) return;
            frames += 1;
            if (performance.now() - start >= 2000) {
              mounted = false;
              resolve((frames / (performance.now() - start)) * 1000);
              return;
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }),
    );
    expect(fps).toBeGreaterThanOrEqual(55);

    const heapMb = await page.evaluate(() => {
      const mem = (performance as any).memory;
      if (!mem?.usedJSHeapSize) return null;
      return mem.usedJSHeapSize / 1024 / 1024;
    });
    if (heapMb != null) {
      expect(heapMb).toBeLessThan(300);
    }
  });
});
