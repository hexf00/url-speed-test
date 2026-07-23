import test from "node:test";
import assert from "node:assert/strict";

import {
  COMPLETION_REASON,
  TRANSFER_SOURCE,
  bytesPerWindowToMbps,
  selectPhaseResourceTiming,
  selectResourceTimings,
  summarizeDecodedSamples,
  summarizeResourceTiming,
  summarizeTransferMeasurement,
} from "../src/measurement.js";

function timingEntry(overrides = {}) {
  return {
    connectEnd: 13,
    connectStart: 8,
    decodedBodySize: 1_000,
    deliveryType: "",
    domainLookupEnd: 8,
    domainLookupStart: 5,
    encodedBodySize: 800,
    entryType: "resource",
    name: "https://cdn.example.test/file.bin?token=secret",
    nextHopProtocol: "h2",
    requestStart: 15,
    responseEnd: 45,
    responseStart: 25,
    responseStatus: 200,
    secureConnectionStart: 10,
    startTime: 2,
    transferSize: 1_100,
    ...overrides,
  };
}

test("throughput math uses decimal megabits per second", () => {
  assert.equal(bytesPerWindowToMbps(1_000_000, 1_000), 8);
  assert.equal(bytesPerWindowToMbps(1_000, 0), 0);

  assert.deepEqual(
    summarizeDecodedSamples(
      [
        { decodedMbps: 4 },
        { decodedMbps: 12 },
        { decodedMbps: 8 },
      ],
      2_000_000,
      2_000
    ),
    { decodedAverageMbps: 8, decodedCurrentMbps: 8, decodedPeakMbps: 12 }
  );
});

test("resource timing selection requires the exact URL and current run window", () => {
  const requestUrl = "https://cdn.example.test/file.bin?token=secret";
  const selected = selectResourceTimings(
    [
      timingEntry({ name: `${requestUrl}&cacheBust=1`, startTime: 12 }),
      timingEntry({ startTime: 1 }),
      timingEntry({ startTime: 12, connectEnd: 10, connectStart: 10 }),
      timingEntry({ startTime: 13 }),
    ],
    requestUrl,
    10
  );

  assert.deepEqual(
    selected.map((entry) => entry.startTime),
    [12, 13]
  );
  assert.equal(selectPhaseResourceTiming(selected).startTime, 13);
});

test("completed Runs use aggregate encoded body sizes for actual transfer metrics", () => {
  const transfer = summarizeTransferMeasurement({
    completionReason: COMPLETION_REASON.RESPONSE_COMPLETE,
    decodedBytes: 2_000,
    elapsedMs: 1_000,
    resourceEntries: [
      timingEntry({ decodedBodySize: 1_000, encodedBodySize: 800, startTime: 12 }),
      timingEntry({ decodedBodySize: 1_000, encodedBodySize: 800, startTime: 13 }),
    ],
    responses: [
      { completed: true, contentLength: 800 },
      { completed: true, contentLength: 800 },
    ],
  });

  assert.deepEqual(transfer, {
    compressionRatio: 1.25,
    compressionSavingsPercent: 20,
    transferAverageMbps: 0.0128,
    transferredBodyBytes: 1_600,
    transferSource: TRANSFER_SOURCE.RESOURCE_TIMING,
  });
});

test("completed Runs use Content-Length when cross-origin sizes are protected", () => {
  const transfer = summarizeTransferMeasurement({
    completionReason: COMPLETION_REASON.RESPONSE_COMPLETE,
    decodedBytes: 1_000,
    elapsedMs: 1_000,
    resourceEntries: [timingEntry({ decodedBodySize: 0, encodedBodySize: 0 })],
    responses: [{ completed: true, contentLength: 750 }],
  });

  assert.equal(transfer.transferredBodyBytes, 750);
  assert.equal(transfer.transferAverageMbps, 0.006);
  assert.equal(transfer.compressionRatio, 4 / 3);
  assert.equal(transfer.compressionSavingsPercent, 25);
  assert.equal(transfer.transferSource, TRANSFER_SOURCE.CONTENT_LENGTH);
});

test("duration-limited Runs never report a full response size as downloaded bytes", () => {
  const transfer = summarizeTransferMeasurement({
    completionReason: COMPLETION_REASON.DURATION_LIMIT,
    decodedBytes: 1_000,
    elapsedMs: 1_000,
    resourceEntries: [timingEntry({ decodedBodySize: 0, encodedBodySize: 0 })],
    responses: [{ completed: false, contentLength: 10_000 }],
  });

  assert.deepEqual(transfer, {
    compressionRatio: null,
    compressionSavingsPercent: null,
    transferAverageMbps: null,
    transferredBodyBytes: null,
    transferSource: null,
  });
});

test("completed Runs leave transfer metrics unavailable without exact size data", () => {
  for (const contentLength of [null, 0]) {
    const transfer = summarizeTransferMeasurement({
      completionReason: COMPLETION_REASON.RESPONSE_COMPLETE,
      decodedBytes: 1_000,
      elapsedMs: 1_000,
      resourceEntries: [timingEntry({ decodedBodySize: 0, encodedBodySize: 0 })],
      responses: [{ completed: true, contentLength }],
    });

    assert.equal(transfer.transferAverageMbps, null);
    assert.equal(transfer.transferredBodyBytes, null);
    assert.equal(transfer.compressionRatio, null);
    assert.equal(transfer.transferSource, null);
  }
});

test("resource timing exposes detailed phases for an allowed target", () => {
  const timing = summarizeResourceTiming(timingEntry(), {
    pageOrigin: "https://app.example.test",
    targetUrl: "https://cdn.example.test/file.bin?token=secret",
  });

  assert.deepEqual(timing, {
    available: true,
    connectionMs: 5,
    connectionReused: false,
    decodedBodySize: 1_000,
    deliveryType: null,
    detailAvailable: true,
    dnsMs: 3,
    encodedBodySize: 800,
    protocol: "h2",
    responseStatus: 200,
    tlsMs: 3,
    totalMs: 43,
    transferMs: 20,
    transferSize: 1_100,
    ttfbMs: 10,
  });
});

test("resource timing hides protected phases when cross-origin TAO data is zeroed", () => {
  const timing = summarizeResourceTiming(
    timingEntry({
      connectEnd: 0,
      connectStart: 0,
      domainLookupEnd: 0,
      domainLookupStart: 0,
      requestStart: 0,
      responseStart: 0,
      secureConnectionStart: 0,
    }),
    {
      pageOrigin: "https://app.example.test",
      targetUrl: "https://cdn.example.test/file.bin?token=secret",
    }
  );

  assert.equal(timing.available, true);
  assert.equal(timing.detailAvailable, false);
  assert.equal(timing.dnsMs, null);
  assert.equal(timing.ttfbMs, null);
  assert.equal(timing.totalMs, 43);
});

test("same-origin reused connections report zero connection and TLS cost", () => {
  const timing = summarizeResourceTiming(
    timingEntry({
      connectEnd: 0,
      connectStart: 0,
      domainLookupEnd: 0,
      domainLookupStart: 0,
      secureConnectionStart: 0,
    }),
    {
      pageOrigin: "https://cdn.example.test",
      targetUrl: "https://cdn.example.test/file.bin?token=secret",
    }
  );

  assert.equal(timing.connectionMs, 0);
  assert.equal(timing.connectionReused, true);
  assert.equal(timing.tlsMs, 0);
  assert.equal(timing.dnsMs, 0);
});
