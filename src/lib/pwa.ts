import {
  isNewerVersion,
  parseLatestChangelogEntries,
  parseLatestChangelogVersion,
} from "./changelog";
import { safeStorageGet, safeStorageSet } from "./storage";

export const REMOTE_CHANGELOG_URL =
  "https://raw.githubusercontent.com/amirabbas-gh/tehran-metro/main/CHANGELOG.md";

const DISMISSED_UPDATE_KEY = "dismissed-remote-update";

export function isInstalledPwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export type RemoteUpdateInfo = {
  version: string;
  changelogLead: string | undefined;
};

export function wasRemoteUpdateDismissed(version: string): boolean {
  return safeStorageGet(DISMISSED_UPDATE_KEY) === version;
}

export function dismissRemoteUpdate(version: string): void {
  safeStorageSet(DISMISSED_UPDATE_KEY, version);
}

/** Fetch GitHub CHANGELOG and report if a newer release exists than `currentVersion`. */
export async function fetchRemoteUpdate(
  currentVersion: string,
  signal?: AbortSignal
): Promise<RemoteUpdateInfo | null> {
  if (!navigator.onLine) return null;

  const response = await fetch(REMOTE_CHANGELOG_URL, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return null;

  const raw = await response.text();
  const version = parseLatestChangelogVersion(raw);
  if (!version || !isNewerVersion(version, currentVersion)) return null;
  if (wasRemoteUpdateDismissed(version)) return null;

  return {
    version,
    changelogLead: parseLatestChangelogEntries(raw)[0],
  };
}
