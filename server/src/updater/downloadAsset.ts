import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import type { UpdateInfo } from "../types/index.js";

export async function downloadAsset(update: UpdateInfo): Promise<string> {
  const response = await fetch(update.asset.browser_download_url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download update asset: ${response.status}`);
  }

  const destination = path.join(os.tmpdir(), update.asset.name);
  await pipeline(Readable.fromWeb(response.body as never), fs.createWriteStream(destination));

  return destination;
}
