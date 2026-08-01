import {
  isNewerVersion,
  parseLatestChangelogEntries,
  parseLatestChangelogVersion,
} from "./changelog";
import { safeStorageGet, safeStorageSet } from "./storage";

/** Prefer jsDelivr (often reachable in IR); fall back to raw.githubusercontent. */
export const REMOTE_CHANGELOG_URLS = [
  "https://cdn.jsdelivr.net/gh/amirabbas-gh/tehran-metro@main/CHANGELOG.md",
  "https://raw.githubusercontent.com/amirabbas-gh/tehran-metro/main/CHANGELOG.md",
] as const;

/** Signed TWA APK (targetSdk 35) served from /public for Android sideload. */
export const ANDROID_APK_URL = "/metro-tehran.apk";

export const ANDROID_PACKAGE_ID = "ir.rayamand.metro";

const DISMISSED_UPDATE_KEY = "dismissed-remote-update";
const ANDROID_KNOWN_INSTALLED_KEY = "android-app-known-installed";

export function isInstalledPwa(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  if (window.navigator.standalone === true) return true;
  // Trusted Web Activity referrer signal
  if (document.referrer.startsWith("android-app://")) return true;
  return false;
}

export function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Local hint set after APK download / appinstalled (survives browser sessions). */
export function wasAndroidAppKnownInstalled(): boolean {
  return safeStorageGet(ANDROID_KNOWN_INSTALLED_KEY) === "1";
}

export function markAndroidAppKnownInstalled(): void {
  safeStorageSet(ANDROID_KNOWN_INSTALLED_KEY, "1");
}

/** True when our Android package (TWA/APK) is already on the device. */
export async function isRelatedAndroidAppInstalled(): Promise<boolean> {
  if (wasAndroidAppKnownInstalled()) return true;
  const getRelated = navigator.getInstalledRelatedApps;
  if (typeof getRelated !== "function") return false;
  try {
    const apps = await getRelated.call(navigator);
    return apps.some(
      (app) =>
        app.id === ANDROID_PACKAGE_ID ||
        app.id === `android:${ANDROID_PACKAGE_ID}` ||
        (typeof app.url === "string" && app.url.includes(ANDROID_PACKAGE_ID))
    );
  } catch {
    return false;
  }
}

export function downloadAndroidApk(): void {
  markAndroidAppKnownInstalled();
  const link = document.createElement("a");
  link.href = ANDROID_APK_URL;
  link.download = "metro-tehran.apk";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
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

async function fetchChangelogText(signal?: AbortSignal): Promise<string | null> {
  for (const url of REMOTE_CHANGELOG_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) continue;
      return await response.text();
    } catch {
      if (signal?.aborted) return null;
    }
  }
  return null;
}

/** Fetch remote CHANGELOG and report if a newer release exists than `currentVersion`. */
export async function fetchRemoteUpdate(
  currentVersion: string,
  signal?: AbortSignal
): Promise<RemoteUpdateInfo | null> {
  if (!navigator.onLine) return null;

  const raw = await fetchChangelogText(signal);
  if (!raw) return null;

  const version = parseLatestChangelogVersion(raw);
  if (!version || !isNewerVersion(version, currentVersion)) return null;
  if (wasRemoteUpdateDismissed(version)) return null;

  return {
    version,
    changelogLead: parseLatestChangelogEntries(raw)[0],
  };
}
