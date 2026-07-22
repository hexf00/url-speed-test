import { expect, test } from "@playwright/test";

const manualUrl = "http://127.0.0.1:4174/download.bin?token=manual-secret";

test("measures an exact signed URL and persists only a sanitized result", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#preset-message")).toHaveText("已载入 1 个预置目标");
  await page.locator("#target-url").fill(manualUrl);
  await page.locator("#duration").fill("1");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("完成", { timeout: 10_000 });
  await expect(page.locator("#response-meta")).toContainText("HTTP 200");
  await expect(page.locator("#speed-chart polyline")).toHaveCount(1);
  await expect(page.locator("#timing-ttfb")).not.toHaveText("—");

  const average = Number(await page.locator("#average-speed").textContent());
  expect(average).toBeGreaterThan(0);
  await expect(page.locator("#history-body tr")).toHaveCount(1);

  const storedHistory = await page.evaluate(() =>
    localStorage.getItem("url-speed-test.history.v1")
  );
  expect(storedHistory).toContain("http://127.0.0.1:4174/download.bin");
  expect(storedHistory).not.toContain("manual-secret");
  expect(storedHistory).not.toContain("token=");

  await expect(page.locator("#target-url")).toHaveValue(manualUrl);
});

test("normalizes a configured preset into the same single-run path", async ({ page }) => {
  await page.goto("/");
  await page.locator("#preset-select").selectOption("preset:local-stream");
  await expect(page.locator("#target-url")).toHaveValue(
    "http://127.0.0.1:4174/download.bin?token=preset-token"
  );

  await page.locator("#duration").fill("1");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("完成", { timeout: 10_000 });
  await expect(page.locator("#active-target")).toHaveText("Local streaming fixture");
  await expect(page.locator("#history-body tr")).toHaveCount(1);
});

test("keeps throughput results when cross-origin timing detail is not exposed", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("#target-url")
    .fill("http://127.0.0.1:4174/no-tao.bin?token=manual-secret");
  await page.locator("#duration").fill("1");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("完成", { timeout: 10_000 });
  await expect(page.locator("#timing-note")).toContainText("Timing-Allow-Origin");
  await expect(page.locator("#timing-dns")).toHaveText("—");
  expect(Number(await page.locator("#average-speed").textContent())).toBeGreaterThan(0);
});

test("completes a long response at the declared duration limit", async ({ page }) => {
  await page.goto("/");
  await page.locator("#target-url").fill("http://127.0.0.1:4174/long.bin?token=manual-secret");
  await page.locator("#duration").fill("1");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("完成", { timeout: 10_000 });
  await expect(page.locator("#response-meta")).toContainText("达到时长上限");
  await expect(page.locator("#history-body tr")).toHaveCount(1);
  expect(Number(await page.locator("#average-speed").textContent())).toBeGreaterThan(0);
});

test("does not persist a run stopped by the user", async ({ page }) => {
  await page.goto("/");
  await page.locator("#target-url").fill("http://127.0.0.1:4174/long.bin?token=manual-secret");
  await page.locator("#duration").fill("10");
  await page.locator("#start-button").click();
  await expect(page.locator("#run-status")).toContainText("正在下载");
  await page.waitForTimeout(300);
  await page.locator("#stop-button").click();

  await expect(page.locator("#run-status")).toHaveText("已停止");
  await expect(page.locator("#history-empty")).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("url-speed-test.history.v1"))
  ).toBeNull();
});
