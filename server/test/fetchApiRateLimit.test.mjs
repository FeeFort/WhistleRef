import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchApi } from "../src/osu-api/osuApiClient.ts";

// Real timers: the rate limiter pause relies on performance.now(), so Retry-After of 1s is waited for real.
await test("429 with small Retry-After is retried after the pause", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return new Response("", { status: 429, headers: { "Retry-After": "1" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const startedAt = performance.now();
  assert.deepEqual(await fetchApi("token", "me"), { ok: true });
  assert.equal(calls, 2);
  assert.ok(performance.now() - startedAt >= 950);
});

await test("429 with big Retry-After is not retried", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  });

  await assert.rejects(fetchApi("token", "me"), { code: "RATE_LIMITED" });
  assert.equal(calls, 1);
});
