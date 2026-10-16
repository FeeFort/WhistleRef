import assert from "node:assert/strict";
import { test } from "node:test";
import { HubConnectionBuilder, HubConnectionState } from "@microsoft/signalr";
import { config } from "../src/config.ts";
import { connectToRefereeHub, disconnectFromRefereeHub } from "../src/lazer/refereeHubClient.ts";

config.hubReconnect.baseDelay = 1;
config.hubReconnect.maxDelay = 1;

function fakeHub(start) {
  return {
    state: HubConnectionState.Disconnected,
    on() {},
    onreconnecting() {},
    onreconnected() {},
    onclose() {},
    start,
    async stop() {},
  };
}

await test("automatic reconnect policy never gives up and caps the delay", async (t) => {
  let policy;
  const original = HubConnectionBuilder.prototype.withAutomaticReconnect;
  t.mock.method(HubConnectionBuilder.prototype, "withAutomaticReconnect", function (arg) {
    policy = arg;
    return original.call(this, arg);
  });
  t.mock.method(HubConnectionBuilder.prototype, "build", () => fakeHub(async () => {}));
  await connectToRefereeHub(
    () => {},
    async () => {},
  );
  assert.equal(typeof policy?.nextRetryDelayInMilliseconds, "function");
  for (const previousRetryCount of [0, 5, 100, 10_000]) {
    const delay = policy.nextRetryDelayInMilliseconds({ previousRetryCount, elapsedMilliseconds: 0 });
    assert.ok(delay !== null && delay <= config.hubReconnect.maxDelay, `retry ${previousRetryCount}`);
  }
  await disconnectFromRefereeHub();
});

await test("initial start is retried until it succeeds", async (t) => {
  let calls = 0;
  t.mock.method(HubConnectionBuilder.prototype, "build", () =>
    fakeHub(async () => {
      if (++calls < 3) throw new Error("Failed to connect");
    }),
  );
  const statuses = [];
  await connectToRefereeHub(
    () => {},
    async () => {},
    (event) => statuses.push(event.state),
  );
  assert.equal(calls, 3);
  assert.equal(statuses.at(-1), "connected");
  await disconnectFromRefereeHub();
});

await test("initial start gives up after the configured attempts", async (t) => {
  let calls = 0;
  t.mock.method(HubConnectionBuilder.prototype, "build", () =>
    fakeHub(async () => {
      calls++;
      throw new Error("Failed to connect");
    }),
  );
  const statuses = [];
  await assert.rejects(
    connectToRefereeHub(
      () => {},
      async () => {},
      (event) => statuses.push(event.state),
    ),
    /Failed to connect/,
  );
  assert.equal(calls, config.hubReconnect.initialAttempts);
  assert.equal(statuses.at(-1), "disconnected");
  await disconnectFromRefereeHub();
});
