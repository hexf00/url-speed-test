import { sanitizeTargetUrl } from "./target.js";

export const HISTORY_KEY = "url-speed-test.history.v1";
export const HISTORY_LIMIT = 20;

function isHistoryResult(result) {
  return (
    result?.schemaVersion === 1 &&
    typeof result.id === "string" &&
    typeof result.endedAt === "string" &&
    Number.isFinite(result.elapsedMs) &&
    typeof result.target?.label === "string" &&
    typeof result.target?.location === "string" &&
    Number.isFinite(result.summary?.averageMbps) &&
    Number.isFinite(result.summary?.peakMbps) &&
    Number.isFinite(result.summary?.totalBytes)
  );
}

export function toHistoryResult(result) {
  return Object.freeze({
    completionReason: result.completionReason,
    elapsedMs: result.elapsedMs,
    endedAt: result.endedAt,
    id: result.id,
    options: result.options,
    response: result.response
      ? Object.freeze({
          contentLength: result.response.contentLength,
          status: result.response.status,
        })
      : null,
    samples: result.samples,
    schemaVersion: result.schemaVersion,
    startedAt: result.startedAt,
    summary: result.summary,
    target: Object.freeze({
      label: result.target.label,
      location: sanitizeTargetUrl(result.target.url),
      source: result.target.source,
    }),
    timing: result.timing,
  });
}

export function readHistory(storage) {
  let serialized;
  try {
    storage ??= globalThis.localStorage;
    serialized = storage.getItem(HISTORY_KEY);
  } catch {
    return Object.freeze({ recovered: false, results: [] });
  }
  if (!serialized) return Object.freeze({ recovered: false, results: [] });

  try {
    const document = JSON.parse(serialized);
    if (
      document?.schemaVersion !== 1 ||
      !Array.isArray(document.results) ||
      !document.results.every(isHistoryResult)
    ) {
      throw new TypeError("invalid history document");
    }
    return Object.freeze({ recovered: false, results: document.results });
  } catch {
    try {
      storage.removeItem(HISTORY_KEY);
    } catch {
      // Storage may be readable but not writable under browser privacy policy.
    }
    return Object.freeze({ recovered: true, results: [] });
  }
}

export function prependHistoryResult(result, storage) {
  storage ??= globalThis.localStorage;
  const existing = readHistory(storage).results;
  const results = [toHistoryResult(result), ...existing].slice(0, HISTORY_LIMIT);
  storage.setItem(
    HISTORY_KEY,
    JSON.stringify({
      results,
      schemaVersion: 1,
    })
  );
  return results;
}

export function clearHistory(storage) {
  storage ??= globalThis.localStorage;
  storage.removeItem(HISTORY_KEY);
}
