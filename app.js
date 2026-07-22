import { renderSpeedChart } from "./src/chart.js";
import {
  clearHistory,
  prependHistoryResult,
  readHistory,
} from "./src/history.js";
import {
  RunCancelledError,
  TargetRequestError,
  runDownload,
} from "./src/measurement.js";
import {
  RUN_LIMITS,
  TARGET_SOURCE,
  TargetInputError,
  createTarget,
  parseBoundedInteger,
  parsePresetDocument,
} from "./src/target.js";

const elements = {
  activeTarget: document.querySelector("#active-target"),
  averageSpeed: document.querySelector("#average-speed"),
  clearHistory: document.querySelector("#clear-history"),
  concurrency: document.querySelector("#concurrency"),
  currentSpeed: document.querySelector("#current-speed"),
  duration: document.querySelector("#duration"),
  elapsed: document.querySelector("#elapsed"),
  form: document.querySelector("#speed-test-form"),
  historyBody: document.querySelector("#history-body"),
  historyEmpty: document.querySelector("#history-empty"),
  historyTableWrap: document.querySelector("#history-table-wrap"),
  peakSpeed: document.querySelector("#peak-speed"),
  presetMessage: document.querySelector("#preset-message"),
  presetSelect: document.querySelector("#preset-select"),
  responseMeta: document.querySelector("#response-meta"),
  runStatus: document.querySelector("#run-status"),
  speedChart: document.querySelector("#speed-chart"),
  startButton: document.querySelector("#start-button"),
  stopButton: document.querySelector("#stop-button"),
  targetUrl: document.querySelector("#target-url"),
  timingConnect: document.querySelector("#timing-connect"),
  timingDns: document.querySelector("#timing-dns"),
  timingNote: document.querySelector("#timing-note"),
  timingTls: document.querySelector("#timing-tls"),
  timingTotal: document.querySelector("#timing-total"),
  timingTransfer: document.querySelector("#timing-transfer"),
  timingTtfb: document.querySelector("#timing-ttfb"),
  transferred: document.querySelector("#transferred"),
};

const timingElements = {
  connectionMs: elements.timingConnect,
  dnsMs: elements.timingDns,
  tlsMs: elements.timingTls,
  totalMs: elements.timingTotal,
  transferMs: elements.timingTransfer,
  ttfbMs: elements.timingTtfb,
};

let presets = [];
let activeController = null;

function formatMbps(value) {
  if (!Number.isFinite(value)) return "0.00";
  if (value >= 1000) return value.toFixed(0);
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unitIndex;
  const digits = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2;
  return `${amount.toFixed(digits)} ${units[unitIndex]}`;
}

function formatMilliseconds(value) {
  return Number.isFinite(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} ms` : "—";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function completionLabel(reason) {
  return reason === "duration-limit" ? "达到时长上限" : "响应读取完成";
}

function readRunOption(input, options) {
  try {
    const value = parseBoundedInteger(input.value, options);
    input.setAttribute("aria-invalid", "false");
    return value;
  } catch (error) {
    input.setAttribute("aria-invalid", "true");
    throw error;
  }
}

function setStatus(message, state = "idle") {
  elements.runStatus.textContent = message;
  elements.runStatus.dataset.state = state;
}

function setRunning(running) {
  elements.startButton.disabled = running;
  elements.stopButton.disabled = !running;
  elements.presetSelect.disabled = running;
  elements.targetUrl.disabled = running;
  elements.concurrency.disabled = running;
  elements.duration.disabled = running;
}

function resetMeasurement() {
  elements.currentSpeed.textContent = "0.00";
  elements.averageSpeed.textContent = "0.00";
  elements.peakSpeed.textContent = "0.00";
  elements.transferred.textContent = "0 B";
  elements.elapsed.textContent = "0.00 秒";
  elements.responseMeta.textContent = "测速中…";
  elements.timingNote.dataset.kind = "";
  elements.timingNote.textContent =
    "详细阶段来自 Resource Timing API；连接复用时 DNS、连接或 TLS 可能为 0 ms。";
  for (const element of Object.values(timingElements)) element.textContent = "—";
  renderSpeedChart(elements.speedChart, []);
}

function renderLiveSample(samples, live) {
  elements.currentSpeed.textContent = formatMbps(live.currentMbps);
  elements.averageSpeed.textContent = formatMbps(live.averageMbps);
  elements.peakSpeed.textContent = formatMbps(live.peakMbps);
  elements.transferred.textContent = formatBytes(live.totalBytes);
  elements.elapsed.textContent = `${(live.elapsedMs / 1000).toFixed(2)} 秒`;
  renderSpeedChart(elements.speedChart, samples);
}

function renderResult(result) {
  renderLiveSample(result.samples, {
    ...result.summary,
    elapsedMs: result.elapsedMs,
  });

  const protocol = result.timing.protocol || "协议未知";
  const status = result.response ? `HTTP ${result.response.status}` : "响应状态未知";
  elements.responseMeta.textContent = `${status} · ${protocol} · ${completionLabel(
    result.completionReason
  )}`;

  for (const [field, element] of Object.entries(timingElements)) {
    element.textContent = formatMilliseconds(result.timing[field]);
  }

  if (!result.timing.available) {
    elements.timingNote.dataset.kind = "warning";
    elements.timingNote.textContent =
      "浏览器没有生成该请求的 Resource Timing 记录，因此本次无法显示连接阶段。";
  } else if (!result.timing.detailAvailable) {
    elements.timingNote.dataset.kind = "warning";
    elements.timingNote.textContent =
      "目标未通过 Timing-Allow-Origin 向此页面开放详细耗时；吞吐仍有效，但 DNS、连接、TLS 与 TTFB 不可见。";
  } else if (result.timing.connectionReused) {
    elements.timingNote.dataset.kind = "";
    elements.timingNote.textContent =
      "本次请求复用了已有连接，因此 DNS、连接或 TLS 为 0 ms / 不适用是正常结果。";
  } else {
    elements.timingNote.dataset.kind = "";
    elements.timingNote.textContent =
      "详细阶段由浏览器 Resource Timing API 提供；它反映本次请求，而不是服务端内部处理分段。";
  }
}

function appendCell(row, value, title = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (title) cell.title = title;
  row.append(cell);
}

function renderHistory(results) {
  elements.historyBody.replaceChildren();
  elements.historyEmpty.hidden = results.length > 0;
  elements.historyTableWrap.hidden = results.length === 0;
  elements.clearHistory.disabled = results.length === 0;

  for (const result of results) {
    const row = document.createElement("tr");
    appendCell(row, formatDate(result.endedAt));
    appendCell(row, result.target.label, result.target.location);
    appendCell(row, `${formatMbps(result.summary.averageMbps)} Mbps`);
    appendCell(row, `${formatMbps(result.summary.peakMbps)} Mbps`);
    appendCell(
      row,
      `${formatBytes(result.summary.totalBytes)} / ${(result.elapsedMs / 1000).toFixed(2)} s`
    );
    appendCell(row, result.timing?.protocol || "—");
    elements.historyBody.append(row);
  }
}

function selectedPreset() {
  if (!elements.presetSelect.value.startsWith("preset:")) return null;
  const id = elements.presetSelect.value.slice("preset:".length);
  return presets.find((preset) => preset.id === id) ?? null;
}

async function loadPresets() {
  try {
    const response = await fetch("./targets.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    presets = parsePresetDocument(await response.json());

    for (const preset of presets) {
      const option = document.createElement("option");
      option.value = `preset:${preset.id}`;
      option.textContent = preset.label;
      elements.presetSelect.append(option);
    }
    elements.presetMessage.textContent = presets.length
      ? `已载入 ${presets.length} 个预置目标`
      : "当前未配置预置目标";
  } catch (error) {
    console.error("Unable to load targets.json", error);
    elements.presetMessage.textContent = "预置目标载入失败，仍可手动输入";
  }
}

elements.presetSelect.addEventListener("change", () => {
  const preset = selectedPreset();
  if (!preset) return;
  elements.targetUrl.value = preset.url;
  elements.targetUrl.setAttribute("aria-invalid", "false");
});

elements.targetUrl.addEventListener("input", () => {
  elements.targetUrl.setAttribute("aria-invalid", "false");
  const preset = selectedPreset();
  if (preset && elements.targetUrl.value !== preset.url) {
    elements.presetSelect.value = "manual";
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (activeController) return;

  try {
    const preset = selectedPreset();
    const target = createTarget(
      {
        label: preset?.label,
        source: preset ? TARGET_SOURCE.PRESET : TARGET_SOURCE.MANUAL,
        url: elements.targetUrl.value,
      },
      location.protocol
    );
    const concurrency = readRunOption(elements.concurrency, {
      fieldName: "并发请求数",
      max: RUN_LIMITS.CONCURRENCY_MAX,
      min: RUN_LIMITS.CONCURRENCY_MIN,
    });
    const durationSeconds = readRunOption(elements.duration, {
      fieldName: "最长时长",
      max: RUN_LIMITS.DURATION_SECONDS_MAX,
      min: RUN_LIMITS.DURATION_SECONDS_MIN,
    });

    activeController = new AbortController();
    elements.targetUrl.setAttribute("aria-invalid", "false");
    elements.activeTarget.textContent = target.label;
    resetMeasurement();
    setRunning(true);
    setStatus("正在下载并采样…", "running");

    const liveSamples = [];
    const result = await runDownload(target, {
      concurrency,
      durationMs: durationSeconds * 1000,
      onSample(sample, live) {
        liveSamples.push(sample);
        renderLiveSample(liveSamples, live);
      },
      signal: activeController.signal,
    });

    renderResult(result);
    try {
      renderHistory(prependHistoryResult(result));
      setStatus(`完成 · 平均 ${formatMbps(result.summary.averageMbps)} Mbps`, "complete");
    } catch (historyError) {
      console.error("Unable to persist local history", historyError);
      setStatus(
        `完成 · 平均 ${formatMbps(result.summary.averageMbps)} Mbps · 本地历史保存失败`,
        "complete"
      );
    }
  } catch (error) {
    if (error instanceof RunCancelledError) {
      elements.responseMeta.textContent = "本次测速由用户停止，未写入历史。";
      setStatus("已停止", "idle");
    } else if (error instanceof TargetInputError || error instanceof TargetRequestError) {
      if (error instanceof TargetInputError && error.code !== "invalid-number") {
        elements.targetUrl.setAttribute("aria-invalid", "true");
      }
      elements.responseMeta.textContent = error.message;
      setStatus(error.message, "error");
    } else {
      console.error(error);
      elements.responseMeta.textContent = "测速失败，请检查浏览器控制台。";
      setStatus("测速失败，请检查目标与网络设置。", "error");
    }
  } finally {
    activeController = null;
    setRunning(false);
  }
});

elements.stopButton.addEventListener("click", () => {
  if (!activeController) return;
  setStatus("正在停止…", "running");
  activeController.abort();
});

elements.clearHistory.addEventListener("click", () => {
  if (!window.confirm("清空此浏览器中的全部测速历史？")) return;
  try {
    clearHistory();
    renderHistory([]);
  } catch (error) {
    console.error("Unable to clear local history", error);
    setStatus("无法访问本地历史。", "error");
  }
});

const history = readHistory();
renderHistory(history.results);
renderSpeedChart(elements.speedChart, []);
if (history.recovered) {
  setStatus("检测到损坏的本地历史，已安全清空。", "idle");
}
await loadPresets();
