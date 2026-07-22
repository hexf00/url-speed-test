import test from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_SOURCE,
  TargetInputError,
  createTarget,
  parseBoundedInteger,
  parsePresetDocument,
  sanitizeTargetUrl,
} from "../src/target.js";

test("createTarget preserves an exact signed request URL and removes only the fragment", () => {
  const target = createTarget(
    {
      label: "Signed object",
      source: TARGET_SOURCE.MANUAL,
      url: "https://cdn.example.test/object.bin?signature=a%2Bb&expires=42#local",
    },
    "https:"
  );

  assert.deepEqual(target, {
    label: "Signed object",
    source: "manual",
    url: "https://cdn.example.test/object.bin?signature=a%2Bb&expires=42",
  });
});

test("createTarget rejects browser-incompatible or unsafe URL forms", () => {
  assert.throws(
    () => createTarget({ url: "ftp://example.test/file" }, "http:"),
    (error) => error instanceof TargetInputError && error.code === "unsupported-protocol"
  );
  assert.throws(
    () => createTarget({ url: "http://example.test/file" }, "https:"),
    (error) => error instanceof TargetInputError && error.code === "mixed-content"
  );
  assert.throws(
    () => createTarget({ url: "https://user:secret@example.test/file" }, "https:"),
    (error) => error instanceof TargetInputError && error.code === "embedded-credentials"
  );
});

test("sanitizeTargetUrl removes query parameters and fragments", () => {
  assert.equal(
    sanitizeTargetUrl("https://cdn.example.test/path/file.bin?token=secret#part"),
    "https://cdn.example.test/path/file.bin"
  );
});

test("parseBoundedInteger accepts only an integer inside the declared range", () => {
  assert.equal(parseBoundedInteger("4", { fieldName: "值", max: 8, min: 1 }), 4);
  assert.throws(
    () => parseBoundedInteger("1.5", { fieldName: "值", max: 8, min: 1 }),
    TargetInputError
  );
  assert.throws(
    () => parseBoundedInteger("9", { fieldName: "值", max: 8, min: 1 }),
    TargetInputError
  );
});

test("parsePresetDocument validates the preset identity boundary", () => {
  const presets = parsePresetDocument({
    targets: [{ id: "edge-a", label: "Edge A", url: "https://a.example.test/file" }],
  });
  assert.deepEqual(presets, [
    { id: "edge-a", label: "Edge A", url: "https://a.example.test/file" },
  ]);

  assert.throws(
    () =>
      parsePresetDocument({
        targets: [
          { id: "same", label: "A", url: "https://a.example.test/file" },
          { id: "same", label: "B", url: "https://b.example.test/file" },
        ],
      }),
    (error) => error instanceof TargetInputError && error.code === "duplicate-preset"
  );
});
