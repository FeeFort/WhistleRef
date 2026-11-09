import assert from "node:assert/strict";
import { test } from "node:test";
import { UserNameResolver } from "../src/chats/userNameResolver.ts";

test("resolver remembers names, caches API results and bounds the cache", async () => {
  let calls = 0;
  const resolver = new UserNameResolver(
    async (id) => {
      calls++;
      return { username: `name-${id}` };
    },
    25,
    2,
  );
  assert.equal(await resolver.resolve(1), "name-1");
  assert.equal(await resolver.resolve(1), "name-1");
  assert.equal(calls, 1);
  resolver.remember(2, "remembered");
  assert.equal(await resolver.resolve(2), "remembered");
  resolver.remember(3, "third");
  assert.equal(await resolver.resolve(1), "name-1");
  assert.equal(calls, 2);
});

test("resolver falls back on fetch failure and timeout", async () => {
  const failure = new UserNameResolver(async () => {
    throw new Error("offline");
  });
  assert.equal(await failure.resolve(9), "user 9");
  const timeout = new UserNameResolver(() => new Promise(() => {}), 1);
  assert.equal(await timeout.resolve(10), "user 10");
});
