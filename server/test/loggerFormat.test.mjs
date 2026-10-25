import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { formatLogRecord } from "../src/logger/loggerFormat.ts";

const record = { timestamp: new Date(2026, 9, 6, 12, 35, 10, 87), level: "DEBUG", scope: "stable", component: "irc", message: "Connected", fields: {} };
const render = (changes = {}, options = {}) => formatLogRecord({ ...record, ...changes }, { colors: false, isTTY: true, columns: 80, ...options });

test("operation output includes boundaries, shared ID, outcome and duration", () => {
  const start = render({ level: "TRACE", message: "MakeRoom", operation: { id: 18, phase: "start" }, fields: { beatmapId: 123 } }, { isTTY: false });
  const end = render({ level: "TRACE", message: "MakeRoom", operation: { id: 18, phase: "end", durationMs: 86 }, fields: { roomId: 987654 } }, { isTTY: false });
  const failure = render({ level: "WARN", message: "MakeRoom", operation: { id: 18, phase: "failed", durationMs: 86 } }, { isTTY: false });
  assert.ok(start.includes("> #18 MakeRoom  beatmapId=123"));
  assert.ok(end.includes("< #18 MakeRoom OK  roomId=987654 duration=86ms"));
  assert.ok(failure.includes("< #18 MakeRoom FAILED duration=86ms"));
});

test("banner includes runtime details and brand colors without changing layout", () => {
  const banner = { version: "0.4.0-alpha", url: "http://localhost:3000", nodeVersion: "v24.0.0", os: "Linux 6.10", arch: "x64", level: "WARN" };
  const plain = render({ kind: "banner", banner });
  assert.equal(plain, "\n┃ WhistleRef v0.4.0-alpha\n┃ Web UI     http://localhost:3000\n┃ Node.js    v24.0.0\n┃ OS         Linux 6.10 / x64\n┃ Logging    WARN\n\n");
  const colored = render({ kind: "banner", banner }, { colors: true });
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.ok(colored.includes("\u001b[1;38;5;135mWhistle"));
  assert.ok(colored.includes("\u001b[1;37mRef"));
  assert.ok(colored.includes("\u001b[90mNode.js"));
  assert.ok(colored.includes("\u001b[90mv24.0.0"));
  assert.ok(colored.includes("\u001b[1;38;5;208mWARN"));
  for (const columns of [12, 30]) {
    for (const line of render({ kind: "banner", banner }, { columns }).trimEnd().split("\n")) assert.ok(stringWidth(line) <= columns);
  }
});

test("separators fill terminal width and become plain messages outside TTY", () => {
  const output = render({ kind: "separator", message: "Starting session" });
  assert.equal(stringWidth(output.trimEnd()), 80);
  assert.ok(output.includes("┃ ── Starting session ─"));
  const plain = render({ kind: "separator", message: "Starting session" }, { isTTY: false });
  assert.ok(plain.endsWith("┃ Starting session\n"));
  assert.ok(!plain.includes("─"));
});

test("error stacks appear only when the active logging level is TRACE", () => {
  const cause = new Error("Underlying failure");
  const error = Object.assign(new AggregateError([cause], "Request failed", { cause }), { code: "REQUEST_TIMEOUT" });
  for (const level of ["CRITICAL", "ERROR", "WARN", "INFO", "DEBUG"]) {
    const output = render({ level: "WARN", fields: { error } }, { level, isTTY: false });
    assert.ok(output.includes("Request failed"));
    assert.ok(output.includes("Underlying failure"));
    assert.ok(output.includes("REQUEST_TIMEOUT"));
    assert.ok(!output.includes("at TestContext"));
    assert.ok(!output.includes("loggerFormat.test.mjs:"));
  }
  const output = render({ level: "WARN", fields: { error } }, { level: "TRACE", isTTY: false });
  assert.ok(output.includes("loggerFormat.test.mjs:"));
  assert.ok(error.stack.includes("loggerFormat.test.mjs:"));
});

test("normal logs use the chosen prefix and one separator", () => {
  assert.equal(render(), "[12:35:10.087] ■ DEBUG stable/irc          ┃ Connected\n");
});

test("scope columns align roomManager with shorter components across levels", () => {
  const positions = [];
  for (const level of ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"]) {
    for (const [scope, component] of [
      ["lazer", "roomManager"],
      ["lazer", "refereeHub"],
      ["lazer", "session"],
      ["stable", "irc"],
      ["core", "server"],
    ]) {
      const output = render({ level, scope, component }, { colors: true, columns: 120 });
      positions.push(stripVTControlCharacters(output).indexOf("┃"));
    }
  }
  assert.equal(new Set(positions).size, 1);
});

test("word wrapping preserves words and aligns continuation separators", () => {
  const message = "This is a test for a very long string handling ".repeat(5).trim();
  const lines = render({ message }).trimEnd().split("\n");
  assert.ok(lines.length > 1);
  const position = lines[0].indexOf("┃");
  for (const line of lines) {
    assert.equal(line.indexOf("┃"), position);
    assert.ok(stringWidth(line) <= 80);
  }
  assert.equal(lines.map((line) => line.split("┃ ")[1]).join(" "), message);
});

test("explicit newlines and stack indentation are preserved", () => {
  const lines = render({ message: "Failed\n  at handler\n\nCause" }).trimEnd().split("\n");
  assert.deepEqual(
    lines.map((line) => line.split("┃ ")[1]),
    ["Failed", "  at handler", "", "Cause"],
  );
});

test("oversized words wrap without breaking graphemes", () => {
  const message = "界👩‍💻é".repeat(30);
  const lines = render({ message }).trimEnd().split("\n");
  const parts = lines.map((line) => line.split("┃ ")[1]);
  assert.equal(parts.join(""), message);
  for (const line of lines) assert.ok(stringWidth(line) <= 80);
  for (const part of parts) assert.ok(!part.startsWith("\u200d") && !part.startsWith("\u0301"));
});

test("critical frames fit content and wrap within the terminal", () => {
  for (const columns of [30, 80, 140]) {
    const lines = render({ level: "CRITICAL", message: "HTTP server failed to start " + "long message ".repeat(30) }, { columns })
      .trim()
      .split("\n");
    assert.ok(lines[0].startsWith("┏"));
    assert.ok(lines.at(-1).endsWith("┛"));
    const frameWidth = stringWidth(lines[0]);
    assert.ok(frameWidth <= columns);
    for (const line of lines) assert.equal(stringWidth(line), frameWidth);
    for (const line of lines.slice(1, -1)) assert.ok(line.startsWith("┃ ") && line.endsWith(" ┃"));
  }
});

test("short critical frames use only the width required by their content", () => {
  const lines = render({ level: "CRITICAL", message: "Failed" }, { columns: 140 }).trim().split("\n");
  const contentWidth = Math.max(...lines.slice(1, -1).map((line) => stringWidth(line.slice(2, -2).trimEnd())));
  assert.equal(stringWidth(lines[0]), contentWidth + 4);
  assert.ok(stringWidth(lines[0]) < 140);
});

test("small terminals shorten prefixes and omit critical frames", () => {
  for (const columns of [4, 12, 20, 29, 50]) {
    const lines = render({ level: "CRITICAL", message: "Long message for a small terminal" }, { columns }).trimEnd().split("\n");
    if (columns < 30) assert.ok(!lines[0].startsWith("┏"));
    for (const line of lines) assert.ok(stringWidth(line) <= columns);
  }
});

test("non-TTY output has no colors, automatic wrapping or frames", () => {
  const message = "long message ".repeat(50);
  const output = render({ level: "CRITICAL", message }, { isTTY: false, colors: true, columns: 30 });
  assert.equal(output, stripVTControlCharacters(output));
  assert.equal(output.split("\n").length, 3);
  assert.ok(output.includes(message));
  assert.ok(!output.includes("┏"));
});

test("coloring does not change layout and payload controls cannot inject ANSI", () => {
  const message = "\u001b[31m" + "Long colored message ".repeat(20) + "\u001b[0m";
  const plain = render({ message });
  const colored = render({ message }, { colors: true });
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.ok(colored.includes("\u001b["));
  assert.equal(plain, stripVTControlCharacters(plain));
});
