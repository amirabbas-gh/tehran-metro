import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { isInstalledPwa } from "./lib/pwa";
import { initTelemetry } from "./lib/telemetry";

initTelemetry();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        const notifyUpdate = (worker: ServiceWorker | null) => {
          if (!worker) return;

          if (!navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
            return;
          }

          if (isInstalledPwa()) {
            window.dispatchEvent(
              new CustomEvent("pwa-update-ready", { detail: registration })
            );
          }
        };

        notifyUpdate(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed") notifyUpdate(worker);
          });
        });

        const checkForUpdate = () => {
          void registration.update().catch(() => {});
        };
        setInterval(checkForUpdate, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
      } catch {
        // PWA support is optional; the web app remains usable.
      }
    })();
  });
}
