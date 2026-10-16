import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchApi } from "../src/osu-api/osuApiClient.ts";

await test("fetch succeeds on 1st attempt", async (t) => {
  const fakeFetch = t.mock.method(globalThis, "fetch", async () => {
    return new Response(JSON.stringify({ id: 727 }), { status: 200 });
  });

  const response = await fetchApi("token", "me");

  assert.deepEqual(response, { id: 727 });
  assert.equal(fakeFetch.mock.callCount(), 1);
});

await test("404 does not retry", async (t) => {
  const fakeFetch = t.mock.method(globalThis, "fetch", async () => {
    return new Response("", { status: 404 });
  });

  await assert.rejects(fetchApi("token", "me"));
  assert.equal(fakeFetch.mock.callCount(), 1);
});

await test("POST does not retry", async (t) => {
  const fakeFetch = t.mock.method(globalThis, "fetch", async () => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
  });

  await assert.rejects(fetchApi("token", "me", "POST"));
  assert.equal(fakeFetch.mock.callCount(), 1);
});
