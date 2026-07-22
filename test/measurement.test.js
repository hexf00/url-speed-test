import test from "node:test";
import assert from "node:assert/strict";

import {
  bytesPerWindowToMbps,
  selectResourceTiming,
  summarizeResourceTiming,
  summarizeSamples,
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
    summarizeSamples(
      [
        { mbps: 4 },
        { mbps: 12 },
        { mbps: 8 },
      ],
      2_000_000,
      2_000
    ),
    { averageMbps: 8, currentMbps: 8, peakMbps: 12 }
  );
});

test("selectResourceTiming requires the exact URL and current run window", () => {
  const requestUrl = "https://cdn.example.test/file.bin?token=secret";
  const selected = selectResourceTiming(
    [
      timingEntry({ name: `${requestUrl}&cacheBust=1`, startTime: 12 }),
      timingEntry({ startTime: 1 }),
      timingEntry({ startTime: 12, connectEnd: 10, connectStart: 10 }),
      timingEntry({ startTime: 13 }),
    ],
    requestUrl,
    10
  );

  assert.equal(selected.startTime, 13);
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
