import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "../src/config.ts";
import { restRateLimiter } from "../src/rateLimiter.ts";
import { fetchApi } from "../src/osu-api/osuApiClient.ts";

await test("total timeout cancels a request waiting for rate limiter capacity", async (t) => {
  const previousTimeout = config.transportRetry.totalTimeoutMs;
  config.transportRetry.totalTimeoutMs = 25;
  const releases = await Promise.all(Array.from({ length: config.restRateLimit.concurrency }, () => restRateLimiter.acquire()));
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(fetchApi("token", "me"), { code: "REQUEST_TIMEOUT", outcomeUnknown: false });
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    clearInterval(keepAlive);
    releases.forEach((release) => release());
    config.transportRetry.totalTimeoutMs = previousTimeout;
  }
});

await test("total timeout aborts an in-flight request before the attempt timeout", async (t) => {
  const previousTotal = config.transportRetry.totalTimeoutMs;
  const previousAttempt = config.apiRequestTimeoutMs;
  config.transportRetry.totalTimeoutMs = 25;
  config.apiRequestTimeoutMs = 1000;
  let aborted = false;
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  );
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(fetchApi("token", "me"), { code: "REQUEST_TIMEOUT", outcomeUnknown: false });
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(aborted, true);
  } finally {
    clearInterval(keepAlive);
    config.transportRetry.totalTimeoutMs = previousTotal;
    config.apiRequestTimeoutMs = previousAttempt;
  }
});
