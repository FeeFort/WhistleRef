import assert from "node:assert/strict";
import { test } from "node:test";
import isRetryableError from "../src/osu-api/retryableErrors.ts";
import OsuApiError from "../src/osu-api/osuApiError.ts";

const retryableNetworkErrors = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
];

await test("5xx server errors are retryable", () => {
  for (const status of [502, 503, 504]) {
    assert.equal(isRetryableError(new OsuApiError(status)), true);
  }
});

await test("4xx and 500 server errors are not retryable", () => {
  for (const status of [400, 401, 403, 404, 422, 500]) {
    assert.equal(isRetryableError(new OsuApiError(status)), false);
  }
});

await test("network-related fetch failures are retryable", () => {
  for (const code of retryableNetworkErrors) {
    assert.equal(isRetryableError(Object.assign(new TypeError("fetch failed"), { cause: { code } })), true);
  }
});

await test("other fetch failures are not retryable", () => {
  assert.equal(isRetryableError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECERTEXPIRED" } })), false);
});

await test("fetch failures without cause is not retryable", () => {
  assert.equal(isRetryableError(new TypeError("fetch failed")), false);
});

await test("timeout failures are retryable", () => {
  assert.equal(isRetryableError(Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" })), true);
});

await test("429 failures with small retry-after are retryable", () => {
  assert.equal(isRetryableError(Object.assign(new Error("rate limit"), { code: "RATE_LIMITED", retryAfterMs: 10_000 })), true);
});

await test("429 failures with big retry-after are not retryable", () => {
  assert.equal(isRetryableError(Object.assign(new Error("rate limit"), { code: "RATE_LIMITED", retryAfterMs: 60_000 })), false);
});

await test("body stream failures are retryable", () => {
  assert.equal(isRetryableError(Object.assign(new TypeError("terminated"), { cause: { code: "UND_ERR_SOCKET" } })), true);
});

await test("weird inputs are not retryable", () => {
  for (const weirdInput of [null, undefined, {}, 727, "WYSI", new Error("hey wysi joke in 2k26 man")]) {
    assert.equal(isRetryableError(weirdInput), false);
  }
});
