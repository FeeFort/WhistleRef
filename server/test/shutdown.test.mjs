import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const shutdownSource = source.slice(source.indexOf("function shutdown("), source.indexOf("\nif (process.stdin.isTTY", source.indexOf("function shutdown(")));

for (const failed of [false, true]) {
  await test(`shutdown waits for SignalR stop${failed ? " even when it fails" : ""}`, async () => {
    let finishHub;
    const exitCodes = [];
    const closures = [];
    const context = vm.createContext({
      shuttingDown: false,
      process: { stdin: { isTTY: false }, exit: (code) => exitCodes.push(code) },
      logger: { separator() {}, warn() {}, trace() {}, flush: async () => {} },
      sessionLog: { warn() {} },
      banchoConnection: { logout() {} },
      chatService: { shutdown() {} },
      webSocketServer: { clients: [], close: (callback) => closures.push(callback) },
      httpServer: { listening: true, close: (callback) => closures.push(callback) },
      setTimeout: () => ({ unref() {} }),
      stopLazerSession: () =>
        new Promise((resolve, reject) => {
          finishHub = failed ? reject : resolve;
        }),
    });
    vm.runInContext(ts.transpileModule(shutdownSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.shutdown("test");
    context.shutdown("duplicate");
    assert.equal(closures.length, 2);
    closures.forEach((callback) => callback());
    assert.deepEqual(exitCodes, []);
    finishHub(failed ? new Error("stop failed") : undefined);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(exitCodes, [0]);
  });
}
