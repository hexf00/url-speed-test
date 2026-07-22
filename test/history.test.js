import test from "node:test";
import assert from "node:assert/strict";

import {
  HISTORY_KEY,
  HISTORY_LIMIT,
  clearHistory,
  prependHistoryResult,
  readHistory,
  toHistoryResult,
} from "../src/history.js";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

function result(id = "run-1") {
  return {
    completionReason: "response-complete",
    elapsedMs: 1_000,
    endedAt: "2026-07-22T01:00:01.000Z",
    id,
    options: { concurrency: 1, durationMs: 10_000, sampleIntervalMs: 250 },
    response: {
      completed: true,
      contentEncoding: "gzip",
      contentLength: 1_000_000,
      finalUrl: "https://cdn.example.test/file.bin?token=final-secret",
      status: 200,
      streamIndex: 0,
    },
    samples: [{ decodedBytes: 1_000_000, decodedMbps: 8, elapsedMs: 1_000 }],
    schemaVersion: 2,
    startedAt: "2026-07-22T01:00:00.000Z",
    summary: {
      compressionRatio: 1.25,
      compressionSavingsPercent: 20,
      decodedAverageMbps: 8,
      decodedBytes: 1_000_000,
      decodedCurrentMbps: 8,
      decodedPeakMbps: 8,
      transferAverageMbps: 6.4,
      transferredBodyBytes: 800_000,
      transferSource: "resource-timing",
    },
    target: {
      label: "Signed file",
      source: "manual",
      url: "https://cdn.example.test/file.bin?token=request-secret#fragment",
    },
    timing: { available: true, detailAvailable: true, protocol: "h2" },
  };
}

test("history projection never persists query, fragment, or final response URL", () => {
  const projected = toHistoryResult(result());
  const serialized = JSON.stringify(projected);

  assert.equal(projected.target.location, "https://cdn.example.test/file.bin");
  assert.equal(projected.response.finalUrl, undefined);
  assert.doesNotMatch(serialized, /request-secret|final-secret|fragment|token=/);
});

test("history prepends results and enforces the local limit", () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) {
    prependHistoryResult(result(`run-${index}`), storage);
  }

  const history = readHistory(storage);
  assert.equal(history.recovered, false);
  assert.equal(history.results.length, HISTORY_LIMIT);
  assert.equal(history.results[0].id, `run-${HISTORY_LIMIT + 2}`);
});

test("invalid history is removed instead of reaching the UI", () => {
  const storage = new MemoryStorage();
  storage.setItem(HISTORY_KEY, JSON.stringify({ results: [{}], schemaVersion: 2 }));

  assert.deepEqual(readHistory(storage), { recovered: true, results: [] });
  assert.equal(storage.getItem(HISTORY_KEY), null);
});

test("clearHistory removes the versioned document", () => {
  const storage = new MemoryStorage();
  prependHistoryResult(result(), storage);
  clearHistory(storage);
  assert.deepEqual(readHistory(storage), { recovered: false, results: [] });
});

test("reading v2 history removes the retired v1 document", () => {
  const storage = new MemoryStorage();
  storage.setItem("url-speed-test.history.v1", "retired");

  assert.deepEqual(readHistory(storage), { recovered: false, results: [] });
  assert.equal(storage.getItem("url-speed-test.history.v1"), null);
});

test("unavailable storage does not block the measurement UI from starting", () => {
  const storage = {
    getItem() {
      throw new DOMException("blocked", "SecurityError");
    },
  };

  assert.deepEqual(readHistory(storage), { recovered: false, results: [] });
});

test("read-only storage can still provide current history", () => {
  const writable = new MemoryStorage();
  prependHistoryResult(result(), writable);
  const serialized = writable.getItem(HISTORY_KEY);
  const readOnly = {
    getItem(key) {
      return key === HISTORY_KEY ? serialized : null;
    },
    removeItem() {
      throw new DOMException("blocked", "SecurityError");
    },
  };

  assert.equal(readHistory(readOnly).results.length, 1);
});
