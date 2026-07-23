import { sanitizeTargetUrl } from "./target.js";
import { RESULT_SCHEMA_VERSION, TRANSFER_SOURCE } from "./measurement.js";

export const HISTORY_KEY = "url-speed-test.history.v2";
export const HISTORY_LIMIT = 20;
const LEGACY_HISTORY_KEYS = Object.freeze(["url-speed-test.history.v1"]);

function isFiniteOrNull(value) {
  return value === null || Number.isFinite(value);
}

function isHistoryResult(result) {
  return (
    result?.schemaVersion === RESULT_SCHEMA_VERSION &&
    typeof result.id === "string" &&
    typeof result.endedAt === "string" &&
    Number.isFinite(result.elapsedMs) &&
    typeof result.target?.label === "string" &&
    typeof result.target?.location === "string" &&
    Number.isFinite(result.summary?.decodedAverageMbps) &&
    Number.isFinite(result.summary?.decodedBytes) &&
    Number.isFinite(result.summary?.decodedPeakMbps) &&
    isFiniteOrNull(result.summary?.transferAverageMbps) &&
    isFiniteOrNull(result.summary?.transferredBodyBytes) &&
    isFiniteOrNull(result.summary?.compressionRatio) &&
    isFiniteOrNull(result.summary?.compressionSavingsPercent) &&
    (result.summary?.transferSource === null ||
      Object.values(TRANSFER_SOURCE).includes(result.summary?.transferSource))
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
          contentEncoding: result.response.contentEncoding,
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
  for (const key of LEGACY_HISTORY_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // A readable storage implementation can still deny writes.
    }
  }
  if (!serialized) return Object.freeze({ recovered: false, results: [] });

  try {
    const document = JSON.parse(serialized);
    if (
      document?.schemaVersion !== RESULT_SCHEMA_VERSION ||
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
      schemaVersion: RESULT_SCHEMA_VERSION,
    })
  );
  return results;
}

export function clearHistory(storage) {
  storage ??= globalThis.localStorage;
  storage.removeItem(HISTORY_KEY);
  for (const key of LEGACY_HISTORY_KEYS) storage.removeItem(key);
}
