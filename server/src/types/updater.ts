//Updater

export interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string;
}

export interface GithubRelease {
  tag_name: string;
  html_url?: string;
  published_at?: string;
  assets: GithubAsset[];
}

export interface UpdateInfo {
  version: string;
  asset: GithubAsset;
  releaseNotesUrl?: string;
  publishedAt?: string;
}

export type UpdateProgress =
  { type: "update_progress"; stage: "downloading"; totalBytes: number; downloadedBytes: number } | { type: "update_progress"; stage: "verifying" | "ready_to_install" | "installing" };

export type UpdateCheckResult = {
  type: "update_check_result";
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotesUrl?: string;
  publishedAt?: string;
};

export type UpdaterState = "idle" | "checking" | "available" | "downloading" | "ready_to_install" | "installing";
export type UpdateProgressSender = (payload: UpdateProgress) => void;
export type ApplyUpdate = (parentPid: number, assetPath: string) => Promise<void>;
