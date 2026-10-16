import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchApi } from "../src/osu-api/osuApiClient.ts";
import { config } from "../src/config.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

await test("fetch fails 2 times, and succeeds on 3rd", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 1);

  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls <= 2) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const promise = fetchApi("token", "me");
  await flush();
  assert.equal(calls, 1);

  t.mock.timers.tick(config.transportRetry.baseDelay - 1);
  await flush();
  assert.equal(calls, 1);

  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 2);

  t.mock.timers.tick(config.transportRetry.baseDelay * 2 - 1);
  await flush();
  assert.equal(calls, 2);

  t.mock.timers.tick(1);
  await flush();
  assert.equal(calls, 3);

  assert.deepEqual(await promise, { ok: true });
});

await test("all attempts fail", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 1);

  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" }, attempt: calls });
  });

  const assertion = assert.rejects(fetchApi("token", "me"), (error) => error.attempt === config.transportRetry.attempts);

  for (let i = 0; i < config.transportRetry.attempts - 1; i++) {
    const cap = Math.min(config.transportRetry.maxDelay, config.transportRetry.baseDelay * 2 ** i);
    await flush();
    assert.equal(calls, i + 1);
    t.mock.timers.tick(cap);
  }

  await flush();
  await assertion;
  assert.equal(calls, config.transportRetry.attempts);
});

await test("503 is retried", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(Math, "random", () => 1);

  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) return new Response("", { status: 503 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  const promise = fetchApi("token", "me");
  await flush();
  assert.equal(calls, 1);

  t.mock.timers.tick(config.transportRetry.baseDelay);
  await flush();
  assert.equal(calls, 2);

  assert.deepEqual(await promise, { ok: true });
});
