import { isInstalledPwa } from "./pwa";
import { safeStorageGet, safeStorageSet } from "./storage";
import type { GoatCounterHit } from "../types/telemetry";
import "../types/telemetry";

/** Self-hosted GoatCounter (https://goat.rayamand.ir). */
export const GOATCOUNTER_ENDPOINT = "https://goat.rayamand.ir/count";

const INSTALL_COUNTED_KEY = "telemetry-install-counted";
const DISPLAY_MODE_KEY = "telemetry-display-mode";

export const TelemetryEvent = {
  install: "install",
  installPromptShown: "install-prompt-shown",
  installPromptAccepted: "install-prompt-accepted",
  installPromptDismissed: "install-prompt-dismissed",
  route: "route",
  launchPwa: "launch-pwa",
} as const;

export type TelemetryEventName =
  (typeof TelemetryEvent)[keyof typeof TelemetryEvent];

type PendingHit = {
  path: string;
  title: string;
  event: boolean;
};

let started = false;
let ready = false;
const pending: PendingHit[] = [];

function allowLocalOverride(): boolean {
  return new URLSearchParams(location.search).has("telemetry");
}

function isLocalHost(): boolean {
  return /localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$/.test(
    location.hostname
  );
}

function shouldSend(): boolean {
  try {
    if (safeStorageGet("skipgc") === "t") return false;
  } catch {
    /* ignore */
  }
  if (!isLocalHost()) return true;
  return allowLocalOverride();
}

function sendPixel(hit: PendingHit): void {
  const params = new URLSearchParams();
  params.set("p", hit.path);
  params.set("t", hit.title);
  if (hit.event) params.set("e", "true");
  params.set("s", String(window.screen.width));
  params.set("q", location.search);
  if (document.referrer) params.set("r", document.referrer);
  params.set("rnd", Math.random().toString(36).slice(2, 7));
  const url = `${GOATCOUNTER_ENDPOINT}?${params.toString()}`;
  if (navigator.sendBeacon(url)) return;
  const img = new Image();
  img.referrerPolicy = "no-referrer-when-downgrade";
  img.src = url;
}

function send(hit: PendingHit): void {
  if (!shouldSend()) return;

  if (allowLocalOverride() && window.goatcounter) {
    window.goatcounter.allow_local = true;
  }

  const vars: GoatCounterHit = {
    path: hit.path,
    title: hit.title,
    event: hit.event,
  };

  if (typeof window.goatcounter?.count === "function") {
    window.goatcounter.count(vars);
    return;
  }

  sendPixel(hit);
}

function record(hit: PendingHit): void {
  if (!ready) {
    pending.push(hit);
    return;
  }
  send(hit);
}

function waitForGoatCounter(timeoutMs = 4000): Promise<boolean> {
  if (typeof window.goatcounter?.count === "function") return Promise.resolve(true);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      if (typeof window.goatcounter?.count === "function") {
        window.clearInterval(id);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(id);
        resolve(false);
      }
    }, 50);
  });
}

function currentDisplayMode(): "pwa" | "web" {
  return isInstalledPwa() ? "pwa" : "web";
}

function pageviewPath(): string {
  return isInstalledPwa() ? "/pwa" : location.pathname || "/";
}

function pageviewTitle(): string {
  const mode = isInstalledPwa() ? "PWA" : "Web";
  return `${document.title} · ${mode} · ${__APP_VERSION__}`;
}

/** Pageview: `/` in the browser, `/pwa` when running as an installed app. */
export function trackPageview(): void {
  record({
    path: pageviewPath(),
    title: pageviewTitle(),
    event: false,
  });
}

/**
 * Custom event. GoatCounter event names must not start with `/`.
 * Shown under Events in the dashboard, separate from pageviews.
 */
export function trackEvent(
  name: TelemetryEventName | string,
  title?: string
): void {
  const path = name.replace(/^\//, "");
  if (!path) return;
  record({
    path,
    title: title ?? path,
    event: true,
  });
}

/**
 * Count a unique install once per browser profile.
 * Covers Chromium `appinstalled`, the install prompt, iOS A2HS, and TWA
 * (first time the app is opened in standalone after a web visit).
 */
export function trackInstall(): void {
  if (safeStorageGet(INSTALL_COUNTED_KEY) === "1") return;
  safeStorageSet(INSTALL_COUNTED_KEY, "1");
  safeStorageSet(DISPLAY_MODE_KEY, "pwa");
  trackEvent(TelemetryEvent.install, "App installed");
}

function maybeTrackInstallFromStandalone(): void {
  const mode = currentDisplayMode();
  const previous = safeStorageGet(DISPLAY_MODE_KEY);

  if (mode === "pwa") {
    trackEvent(TelemetryEvent.launchPwa, "Opened as installed app");
    if (previous !== "pwa") trackInstall();
  }

  safeStorageSet(DISPLAY_MODE_KEY, mode);
}

/**
 * Load-once setup: pageview, install detection, `appinstalled` listener.
 * Safe to call more than once. Skips localhost unless `?telemetry` is set
 * (GoatCounter ignores local hits unless `allow_local` is on).
 */
export function initTelemetry(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  if (!window.goatcounter) window.goatcounter = {};
  window.goatcounter.no_onload = true;
  window.goatcounter.allow_local = allowLocalOverride();

  window.addEventListener("appinstalled", () => {
    trackInstall();
  });

  void waitForGoatCounter().then(() => {
    ready = true;
    for (const hit of pending) send(hit);
    pending.length = 0;
    trackPageview();
    maybeTrackInstallFromStandalone();
  });
}
