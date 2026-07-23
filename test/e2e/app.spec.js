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

  const decodedAverage = Number(
    await page.locator("#decoded-average-speed").textContent()
  );
  expect(decodedAverage).toBeGreaterThan(0);
  const average = Number(await page.locator("#transfer-average-speed").textContent());
  expect(average).toBeGreaterThan(0);
  const historyRow = page.locator("#history-body tr");
  await expect(historyRow).toHaveCount(1);
  await expect(historyRow).toContainText("响应读取完成");
  await expect(historyRow).toContainText("HTTP 200");

  const storedHistory = await page.evaluate(() =>
    localStorage.getItem("url-speed-test.history.v2")
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
  expect(
    Number(await page.locator("#transfer-average-speed").textContent())
  ).toBeGreaterThan(0);
  await expect(page.locator("#transfer-note")).toContainText("Content-Length");
});

test("completes a long response at the declared duration limit", async ({ page }) => {
  await page.goto("/");
  await page.locator("#target-url").fill("http://127.0.0.1:4174/long.bin?token=manual-secret");
  await page.locator("#duration").fill("1");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("达到时长上限", {
    timeout: 10_000,
  });
  await expect(page.locator("#run-status")).toContainText("解码平均");
  await expect(page.locator("#response-meta")).toContainText("达到时长上限");
  expect(
    Number(await page.locator("#decoded-average-speed").textContent())
  ).toBeGreaterThan(0);
  expect(
    Number(await page.locator("#decoded-current-speed").textContent())
  ).toBeGreaterThan(0);
  expect(
    Number(await page.locator("#decoded-peak-speed").textContent())
  ).toBeGreaterThan(0);
  await expect(page.locator("#transfer-average-speed")).toHaveText("不可见");
  const historyRow = page.locator("#history-body tr");
  await expect(historyRow).toHaveCount(1);
  await expect(historyRow.locator("td")).toHaveCount(7);
  expect(
    Number((await historyRow.locator("td").nth(2).textContent()).replace(" Mbps", ""))
  ).toBeGreaterThan(0);
  expect(
    Number((await historyRow.locator("td").nth(3).textContent()).replace(" Mbps", ""))
  ).toBeGreaterThan(0);
  await expect(historyRow).toContainText("HTTP 200 · 达到时长上限");
  const limitedSummary = await page.evaluate(
    () => JSON.parse(localStorage.getItem("url-speed-test.history.v2")).results[0].summary
  );
  expect(limitedSummary.decodedAverageMbps).toBeGreaterThan(0);
  expect(limitedSummary.transferredBodyBytes).toBeNull();
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
    await page.evaluate(() => localStorage.getItem("url-speed-test.history.v2"))
  ).toBeNull();
});

test("reports compressed transfer bytes separately from decoded bytes", async ({ page }) => {
  await page.goto("/");
  await page
    .locator("#target-url")
    .fill("http://127.0.0.1:4174/compressed.bin?token=manual-secret");
  await page.locator("#concurrency").fill("2");
  await page.locator("#duration").fill("2");
  await page.locator("#start-button").click();

  await expect(page.locator("#run-status")).toContainText("完成", { timeout: 10_000 });
  await expect(page.locator("#response-meta")).toContainText("gzip");
  await expect(page.locator("#transfer-note")).toContainText("Resource Timing");
  expect(
    Number(await page.locator("#decoded-average-speed").textContent())
  ).toBeGreaterThan(0);
  expect(
    Number(await page.locator("#transfer-average-speed").textContent())
  ).toBeGreaterThan(0);
  await expect(page.locator("#history-body tr")).toContainText("响应读取完成");

  const summary = await page.evaluate(
    () => JSON.parse(localStorage.getItem("url-speed-test.history.v2")).results[0].summary
  );
  expect(summary.transferSource).toBe("resource-timing");
  expect(summary.transferredBodyBytes).toBeGreaterThan(0);
  expect(summary.decodedBytes).toBeGreaterThan(summary.transferredBodyBytes);
  expect(summary.decodedBytes).toBe(12_000_000);
  expect(summary.compressionRatio).toBeGreaterThan(1);
  expect(summary.compressionSavingsPercent).toBeGreaterThan(0);
});

test("contains long active and historical URLs without widening the page", async ({ page }) => {
  const longPath = "a".repeat(4_000);
  const longLabel = `127.0.0.1:4174/${longPath}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(
    ({ label, location }) => {
      localStorage.setItem(
        "url-speed-test.history.v2",
        JSON.stringify({
          results: [
            {
              completionReason: "response-complete",
              elapsedMs: 1_000,
              endedAt: "2026-07-22T01:00:01.000Z",
              id: "long-url-run",
              options: { concurrency: 1, durationMs: 10_000, sampleIntervalMs: 250 },
              response: { contentEncoding: null, contentLength: 1_000, status: 200 },
              samples: [{ decodedBytes: 1_000, decodedMbps: 0.008, elapsedMs: 1_000 }],
              schemaVersion: 2,
              startedAt: "2026-07-22T01:00:00.000Z",
              summary: {
                compressionRatio: 1,
                compressionSavingsPercent: 0,
                decodedAverageMbps: 0.008,
                decodedBytes: 1_000,
                decodedCurrentMbps: 0.008,
                decodedPeakMbps: 0.008,
                transferAverageMbps: 0.008,
                transferredBodyBytes: 1_000,
                transferSource: "content-length",
              },
              target: { label, location, source: "manual" },
              timing: { available: true, detailAvailable: true, protocol: "h2" },
            },
          ],
          schemaVersion: 2,
        })
      );
    },
    { label: longLabel, location: `http://${longLabel}` }
  );

  await page.goto("/");
  await page.locator("#target-url").fill(`http://${longLabel}?token=manual-secret`);
  await page.locator("#start-button").click();
  await expect(page.locator("#active-target")).toContainText("127.0.0.1:4174");

  const layout = await page.evaluate(() => ({
    pageClientWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    tableClientWidth: document.querySelector(".table-wrap").clientWidth,
    tableScrollWidth: document.querySelector(".table-wrap").scrollWidth,
  }));
  expect(layout.pageScrollWidth).toBe(layout.pageClientWidth);
  expect(layout.tableScrollWidth).toBeGreaterThan(layout.tableClientWidth);
});
