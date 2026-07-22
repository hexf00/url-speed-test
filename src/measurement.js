const RESULT_SCHEMA_VERSION = 1;

export const COMPLETION_REASON = Object.freeze({
  RESPONSE_COMPLETE: "response-complete",
  DURATION_LIMIT: "duration-limit",
});

export class RunCancelledError extends Error {
  constructor() {
    super("测速已停止。");
    this.name = "RunCancelledError";
  }
}

export class TargetRequestError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "TargetRequestError";
  }
}

export function bytesPerWindowToMbps(bytes, elapsedMs) {
  if (bytes < 0 || elapsedMs <= 0) return 0;
  return (bytes * 8) / (elapsedMs * 1000);
}

export function summarizeSamples(samples, totalBytes, elapsedMs) {
  const averageMbps = bytesPerWindowToMbps(totalBytes, elapsedMs);
  const peakMbps = samples.reduce((peak, sample) => Math.max(peak, sample.mbps), 0);
  const currentMbps = samples.at(-1)?.mbps ?? 0;
  return { averageMbps, currentMbps, peakMbps };
}

export function selectResourceTiming(entries, requestUrl, runStartedAt) {
  const matching = entries
    .filter(
      (entry) =>
        entry.entryType === "resource" &&
        entry.name === requestUrl &&
        entry.startTime >= runStartedAt - 1
    )
    .sort((left, right) => left.startTime - right.startTime);

  return (
    matching.find((entry) => entry.connectEnd > entry.connectStart) ??
    matching[0] ??
    null
  );
}

export function summarizeResourceTiming(entry, { pageOrigin, targetUrl }) {
  if (!entry) {
    return Object.freeze({ available: false, detailAvailable: false });
  }

  const target = new URL(targetUrl);
  const sameOrigin = target.origin === pageOrigin;
  const detailAvailable = sameOrigin || entry.requestStart > 0 || entry.responseStart > 0;

  const duration = (end, start) =>
    detailAvailable && Number.isFinite(end) && Number.isFinite(start) && end >= start
      ? end - start
      : null;
  const connectionMs = duration(entry.connectEnd, entry.connectStart);
  const connectionReused =
    detailAvailable &&
    Number.isFinite(entry.connectStart) &&
    Number.isFinite(entry.connectEnd)
      ? entry.connectEnd === entry.connectStart
      : null;
  const tlsMs =
    target.protocol === "https:" &&
    detailAvailable &&
    Number.isFinite(entry.secureConnectionStart) &&
    Number.isFinite(entry.connectEnd)
      ? entry.secureConnectionStart > 0 && entry.connectEnd >= entry.secureConnectionStart
        ? entry.connectEnd - entry.secureConnectionStart
        : connectionReused
          ? 0
          : null
      : null;

  return Object.freeze({
    available: true,
    connectionMs,
    connectionReused,
    decodedBodySize: entry.decodedBodySize,
    deliveryType: entry.deliveryType || null,
    detailAvailable,
    dnsMs: duration(entry.domainLookupEnd, entry.domainLookupStart),
    encodedBodySize: entry.encodedBodySize,
    protocol: entry.nextHopProtocol || null,
    responseStatus: entry.responseStatus || null,
    tlsMs,
    totalMs: entry.responseEnd >= entry.startTime ? entry.responseEnd - entry.startTime : null,
    transferMs: duration(entry.responseEnd, entry.responseStart),
    transferSize: entry.transferSize,
    ttfbMs: duration(entry.responseStart, entry.requestStart),
  });
}

export async function runDownload(
  target,
  {
    concurrency = 1,
    durationMs = 10_000,
    onSample = () => {},
    sampleIntervalMs = 250,
    signal,
  } = {}
) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError("concurrency must be a positive integer");
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError("durationMs must be positive");
  }

  const controller = new AbortController();
  const runStartedAt = performance.now();
  const startedAt = new Date().toISOString();
  let completionReason = COMPLETION_REASON.RESPONSE_COMPLETE;
  let cancelled = false;
  let totalBytes = 0;
  let lastSampleAt = runStartedAt;
  let lastSampleBytes = 0;
  const responses = [];
  const samples = [];

  const abortFromCaller = () => {
    cancelled = true;
    controller.abort();
  };
  if (signal?.aborted) abortFromCaller();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  const recordSample = (force = false) => {
    const now = performance.now();
    const windowMs = now - lastSampleAt;
    if (windowMs <= 0 || (!force && windowMs < sampleIntervalMs * 0.8)) return;

    const windowBytes = totalBytes - lastSampleBytes;
    const sample = Object.freeze({
      bytes: totalBytes,
      elapsedMs: now - runStartedAt,
      mbps: bytesPerWindowToMbps(windowBytes, windowMs),
    });
    samples.push(sample);
    lastSampleAt = now;
    lastSampleBytes = totalBytes;

    onSample(
      sample,
      Object.freeze({
        ...summarizeSamples(samples, totalBytes, now - runStartedAt),
        elapsedMs: now - runStartedAt,
        totalBytes,
      })
    );
  };

  const sampleTimer = setInterval(recordSample, sampleIntervalMs);
  const durationTimer = setTimeout(() => {
    completionReason = COMPLETION_REASON.DURATION_LIMIT;
    controller.abort();
  }, durationMs);

  const downloadOne = async (streamIndex) => {
    let response;
    try {
      response = await fetch(target.url, {
        cache: "no-store",
        credentials: "omit",
        method: "GET",
        mode: "cors",
        redirect: "follow",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      throw new TargetRequestError(
        "浏览器无法读取目标。请检查 URL、网络、CORS 和混合内容策略。",
        { cause: error }
      );
    }

    if (!response.ok) {
      throw new TargetRequestError(`目标返回 HTTP ${response.status}。`);
    }
    if (!response.body) {
      throw new TargetRequestError("目标响应不支持流式读取。");
    }

    responses.push(
      Object.freeze({
        contentLength: Number(response.headers.get("content-length")) || null,
        finalUrl: response.url,
        status: response.status,
        streamIndex,
      })
    );

    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        throw new TargetRequestError("读取目标响应时连接中断。", { cause: error });
      }
    } finally {
      reader.releaseLock();
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, (_, index) => downloadOne(index)));
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    clearInterval(sampleTimer);
    clearTimeout(durationTimer);
    signal?.removeEventListener("abort", abortFromCaller);
  }

  if (cancelled) throw new RunCancelledError();

  recordSample(true);
  const endedAt = new Date().toISOString();
  const elapsedMs = performance.now() - runStartedAt;
  const summary = summarizeSamples(samples, totalBytes, elapsedMs);

  // Resource entries are queued after the body completes or the request is aborted.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const entry = selectResourceTiming(
    performance.getEntriesByType("resource"),
    target.url,
    runStartedAt
  );
  const timing = summarizeResourceTiming(entry, {
    pageOrigin: location.origin,
    targetUrl: target.url,
  });

  return Object.freeze({
    completionReason,
    elapsedMs,
    endedAt,
    id: crypto.randomUUID(),
    options: Object.freeze({ concurrency, durationMs, sampleIntervalMs }),
    response: responses[0] ?? null,
    samples: Object.freeze(samples),
    schemaVersion: RESULT_SCHEMA_VERSION,
    startedAt,
    summary: Object.freeze({ ...summary, totalBytes }),
    target,
    timing,
  });
}
