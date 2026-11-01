import semver from "semver";
import { GithubAsset, GithubRelease, UpdateInfo } from "../types/index.js";

const GITHUB_OWNER = "FeeFort";
const GITHUB_REPO = "WhistleRef";

declare const __APP_VERSION__: string;

function getExpectedAssetPattern(): { extension: string; archToken: string } {
  const archToken = process.arch;
  if (process.platform === "win32") return { extension: ".exe", archToken };
  if (process.platform === "linux") return { extension: ".AppImage", archToken };
  if (process.platform === "darwin") return { extension: ".zip", archToken };
  throw new Error(`Unsupported platform: ${process.platform}`);
}

function findMatchingAsset(assets: GithubAsset[]): GithubAsset | null {
  const { extension, archToken } = getExpectedAssetPattern();
  return assets.find((asset) => asset.name.endsWith(extension) && asset.name.includes(archToken)) ?? null;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  if (!response.ok) {
    throw new Error(`GitHub API responded with ${response.status}`);
  }

  const release = (await response.json()) as GithubRelease;
  const latestVersion = release.tag_name.replace(/^v/, "");

  if (!semver.gt(latestVersion, __APP_VERSION__)) {
    return null;
  }

  const asset = findMatchingAsset(release.assets);
  if (!asset) {
    throw new Error(`No release asset found matching this platform (${process.platform}/${process.arch})`);
  }

  return { version: latestVersion, asset };
}
