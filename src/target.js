export const TARGET_SOURCE = Object.freeze({
  MANUAL: "manual",
  PRESET: "preset",
});

export const RUN_LIMITS = Object.freeze({
  CONCURRENCY_MIN: 1,
  CONCURRENCY_MAX: 8,
  CONCURRENCY_DEFAULT: 1,
  DURATION_SECONDS_MIN: 1,
  DURATION_SECONDS_MAX: 60,
  DURATION_SECONDS_DEFAULT: 10,
});

export class TargetInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TargetInputError";
    this.code = code;
  }
}

export function createTarget(
  { url, label = "", source = TARGET_SOURCE.MANUAL },
  pageProtocol = globalThis.location?.protocol ?? "https:"
) {
  const input = String(url ?? "").trim();
  if (!input) {
    throw new TargetInputError("missing-url", "请输入要测速的大文件 URL。");
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new TargetInputError("invalid-url", "请输入完整的 HTTP(S) URL。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TargetInputError("unsupported-protocol", "目标 URL 必须使用 HTTP 或 HTTPS。");
  }

  if (parsed.username || parsed.password) {
    throw new TargetInputError("embedded-credentials", "目标 URL 请使用签名参数，不要嵌入用户名或密码。");
  }

  if (pageProtocol === "https:" && parsed.protocol === "http:") {
    throw new TargetInputError(
      "mixed-content",
      "当前页面使用 HTTPS，浏览器仅允许测速 HTTPS 目标。"
    );
  }

  // Fragments are client-side identifiers and never form part of an HTTP request.
  parsed.hash = "";

  if (!Object.values(TARGET_SOURCE).includes(source)) {
    throw new TargetInputError("invalid-source", "目标来源无效。");
  }

  return Object.freeze({
    label: String(label).trim() || `${parsed.host}${parsed.pathname}`,
    source,
    url: parsed.href,
  });
}

export function sanitizeTargetUrl(url) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function parseBoundedInteger(value, { min, max, fieldName }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new TargetInputError(
      "invalid-number",
      `${fieldName}必须是 ${min} 到 ${max} 之间的整数。`
    );
  }
  return number;
}

export function parsePresetDocument(document) {
  if (!document || !Array.isArray(document.targets)) {
    throw new TargetInputError("invalid-presets", "预置目标配置必须包含 targets 数组。");
  }

  const ids = new Set();
  return document.targets.map((candidate, index) => {
    const id = String(candidate?.id ?? "").trim();
    const label = String(candidate?.label ?? "").trim();
    const url = String(candidate?.url ?? "").trim();

    if (!id || !label || !url) {
      throw new TargetInputError(
        "invalid-preset",
        `第 ${index + 1} 个预置目标必须声明 id、label 和 url。`
      );
    }
    if (ids.has(id)) {
      throw new TargetInputError("duplicate-preset", `预置目标 id 重复：${id}`);
    }
    ids.add(id);

    return Object.freeze({ id, label, url });
  });
}
