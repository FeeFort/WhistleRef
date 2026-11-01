import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { DatabasePaths } from "../types/index.js";

export function resolveDataDirectory(environment: Readonly<Record<string, string | undefined>> = process.env, platform = process.platform, home = homedir()): string {
  if (environment.WHISTLEREF_DATA_DIR) return path.resolve(environment.WHISTLEREF_DATA_DIR);
  if (platform === "win32") return path.join(environment.APPDATA || path.join(home, "AppData", "Roaming"), "WhistleRef");
  if (platform === "darwin") return path.join(home, "Library", "Application Support", "WhistleRef");
  const dataHome = environment.XDG_DATA_HOME && path.isAbsolute(environment.XDG_DATA_HOME) ? environment.XDG_DATA_HOME : path.join(home, ".local", "share");
  return path.join(dataHome, "WhistleRef");
}

export function resolveDatabasePaths(environment: Readonly<Record<string, string | undefined>> = process.env, platform = process.platform, home = homedir()): DatabasePaths {
  const dataDirectory = resolveDataDirectory(environment, platform, home);
  return { dataDirectory, databaseFile: path.join(dataDirectory, "whistleref.db") };
}

export function ensureDatabasePaths(environment: Readonly<Record<string, string | undefined>> = process.env, platform = process.platform, home = homedir()): DatabasePaths {
  const paths = resolveDatabasePaths(environment, platform, home);
  mkdirSync(paths.dataDirectory, { recursive: true, mode: 0o700 });
  return paths;
}
