import test from "node:test";
import assert from "node:assert/strict";
import { TokenBucket } from "../src/rateLimiter.ts";

const settings = { tokensPerSecond: 100, capacity: 2, concurrency: 2, maxQueue: 2, maxWaitMs: 1000 };

test("burst, FIFO, concurrency and independent buckets", async () => {
  const bucket = new TokenBucket(settings, "test");
  const other = new TokenBucket(settings, "other");
  const first = await bucket.acquire();
  const second = await bucket.acquire();
  const order = [];
  const third = bucket.acquire().then((release) => {
    order.push(3);
    return release;
  });
  const fourth = bucket.acquire().then((release) => {
    order.push(4);
    return release;
  });
  await assert.rejects(bucket.acquire(), { code: "RATE_LIMIT_QUEUE_FULL", outcomeUnknown: false });
  const independent = await other.acquire();
  independent();
  assert.deepEqual(order, []);
  first();
  const releaseThird = await third;
  assert.deepEqual(order, [3]);
  second();
  const releaseFourth = await fourth;
  assert.deepEqual(order, [3, 4]);
  releaseThird();
  releaseThird();
  releaseFourth();
});

test("queue cancellation and wait timeout never dispatch", async () => {
  const bucket = new TokenBucket({ ...settings, concurrency: 1, maxWaitMs: 20 }, "test");
  const release = await bucket.acquire();
  const abort = new AbortController();
  const pending = bucket.acquire(abort.signal);
  abort.abort();
  await assert.rejects(pending, { code: "REQUEST_CANCELLED", outcomeUnknown: false });
  await assert.rejects(bucket.acquire(), { code: "RATE_LIMIT_WAIT_TIMEOUT", outcomeUnknown: false });
  release();
});

test("pause delays dispatch despite available burst tokens", async () => {
  const bucket = new TokenBucket(settings, "test");
  bucket.pause(30);
  const started = performance.now();
  const release = await bucket.acquire();
  assert.ok(performance.now() - started >= 25);
  release();
});

test("REST 429 pauses later calls and retains retry metadata", async (t) => {
  const { fetchApi } = await import("../src/osu-api/osuApiClient.ts");
  const { config } = await import("../src/config.ts");
  const previousWait = config.restRateLimit.maxWaitMs;
  config.restRateLimit.maxWaitMs = 20;
  let calls = 0;
  // Retry-After above transportRetry.maxRetryAfter, so fetchApi does not retry it.
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  });
  try {
    await assert.rejects(fetchApi("token", "me"), { code: "RATE_LIMITED", retryAfterMs: 60_000, outcomeUnknown: false });
    await assert.rejects(fetchApi("token", "me"), { code: "RATE_LIMIT_WAIT_TIMEOUT", outcomeUnknown: false });
    assert.equal(calls, 1);
  } finally {
    config.restRateLimit.maxWaitMs = previousWait;
  }
});
