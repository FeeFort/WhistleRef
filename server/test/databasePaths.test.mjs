import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ensureDatabasePaths, resolveDatabasePaths, resolveDataDirectory } from "../src/db/paths.ts";

test("database data directory follows platform conventions and supports override", () => {
  const home = path.resolve("/users/referee");
  assert.equal(resolveDataDirectory({ APPDATA: "C:/Users/ref/AppData/Roaming" }, "win32", home), path.join("C:/Users/ref/AppData/Roaming", "WhistleRef"));
  assert.equal(resolveDataDirectory({}, "win32", home), path.join(home, "AppData", "Roaming", "WhistleRef"));
  assert.equal(resolveDataDirectory({}, "darwin", home), path.join(home, "Library", "Application Support", "WhistleRef"));
  assert.equal(resolveDataDirectory({ XDG_DATA_HOME: "/var/data" }, "linux", home), "/var/data/WhistleRef");
  assert.equal(resolveDataDirectory({ XDG_DATA_HOME: "relative" }, "linux", home), path.join(home, ".local", "share", "WhistleRef"));
  assert.equal(resolveDatabasePaths({ WHISTLEREF_DATA_DIR: "./custom" }, "linux", home).databaseFile, path.resolve("./custom/whistleref.db"));

  const directory = mkdtempSync(path.join(os.tmpdir(), "whistleref-path-test-"));
  try {
    const target = path.join(directory, "nested", "data");
    const paths = ensureDatabasePaths({ WHISTLEREF_DATA_DIR: target }, "linux", home);
    assert.equal(paths.databaseFile, path.join(target, "whistleref.db"));
    assert.equal(statSync(target).isDirectory(), true);
    assert.equal(statSync(target).mode & 0o777, 0o700);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
