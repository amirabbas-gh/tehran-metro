/** Chromium beforeinstallprompt event (not in all DOM lib typings). */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    "pwa-update-ready": CustomEvent<ServiceWorkerRegistration>;
  }

  interface Navigator {
    /** iOS Safari standalone PWA flag. */
    standalone?: boolean;
  }
}

export {};
