import { ApplyUpdate } from "../types/index.js";
import { appendFile } from "node:fs/promises";
import os from "node:os";
import { applyLinuxUpdate } from "./applyUpdate.linux.js";
import { applyMacosUpdate } from "./applyUpdate.macos.js";
import { applyWindowsUpdate } from "./applyUpdate.windows.js";

export function getApplyUpdate(): ApplyUpdate {
  if (process.platform === "win32") return applyWindowsUpdate;
  if (process.platform === "linux") return applyLinuxUpdate;
  if (process.platform === "darwin") return applyMacosUpdate;
  throw new Error(`Updates are not supported on ${process.platform}.`);
}

export async function applyPendingUpdate(parentPid: string | undefined, assetPath: string | undefined): Promise<void> {
  const pid = Number(parentPid);
  if (!Number.isInteger(pid) || pid <= 0 || !assetPath) throw new Error("Invalid update helper arguments.");
  try {
    await getApplyUpdate()(pid, assetPath);
  } catch (error) {
    await appendFile(`${os.tmpdir()}/whistleref-update-error.log`, `${new Date().toISOString()} ${(error as Error).stack || (error as Error).message}\n`).catch(() => undefined);
    throw error;
  }
}
