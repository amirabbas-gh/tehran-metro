import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import "./assets/style.css";
import Stations from "./assets/data/stations.json";
import Lines from "./assets/data/lines.json";
import changelogRaw from "../CHANGELOG.md?raw";
import Search from "./components/Search";
import MapView from "./components/MapView";
import StationCard from "./components/StationCard";
import GraphInfoPanel from "./components/GraphInfoPanel";
import PwaBanners from "./components/PwaBanners";
import { analyzeConnectivity, buildAdjacencyList } from "./lib/graph";
import { parseLatestChangelogEntries } from "./lib/changelog";
import {
  BASE_SCALE,
  computeBounds,
  enrichMetroData,
} from "./lib/metro-data";
import {
  dismissRemoteUpdate,
  downloadAndroidApk,
  fetchRemoteUpdate,
  isInstalledPwa,
  shouldOfferAndroidApk,
  type RemoteUpdateInfo,
} from "./lib/pwa";
import { applyTheme, getPreferredTheme, persistTheme } from "./lib/theme";
import { safeStorageGet } from "./lib/storage";
import type {
  EnrichedLine,
  EnrichedStation,
  GoRequest,
  InstallUi,
  RawLine,
  RawStation,
  StationCardUi,
  Theme,
} from "./types/metro";
import type { BeforeInstallPromptEvent } from "./types/pwa";
import "./types/pwa";

const rawStations = Stations as RawStation[];
const rawLines = Lines as RawLine[];

export default function App(): ReactElement {
  const applyingUpdate = useRef(false);
  const stationCardIdRef = useRef<number | null>(null);

  const [focusedLine, setFocusedLine] = useState<number | null>(null);
  const [routeStationIds, setRouteStationIds] = useState<number[]>([]);
  const [lines, setLines] = useState<EnrichedLine[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(
    null
  );
  const [stationCardUi, setStationCardUi] = useState<StationCardUi>("closed");
  const [goRequest, setGoRequest] = useState<GoRequest | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [androidApkOffer, setAndroidApkOffer] = useState(() =>
    shouldOfferAndroidApk()
  );
  const [installUi, setInstallUi] = useState<InstallUi>("banner");
  const [updateReady, setUpdateReady] = useState(false);
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteUpdateInfo | null>(
    null
  );
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());

  const showInstall = Boolean(installPrompt) || androidApkOffer;
  const latestChangelogEntries = useMemo(
    () => parseLatestChangelogEntries(changelogRaw),
    []
  );
  const showUpdateBanner = updateReady || remoteUpdate !== null;
  const changelogLead =
    remoteUpdate?.changelogLead ?? latestChangelogEntries[0];

  const bounds = useMemo(() => computeBounds(rawStations), []);
  const width = (bounds.maxLongitude - bounds.minLongitude) * BASE_SCALE + 48;
  const height = (bounds.maxLatitude - bounds.minLatitude) * BASE_SCALE + 48;

  const closeStationCard = () => {
    setStationCardUi((ui) => (ui === "open" ? "leaving" : ui));
    setSelectedStationId(null);
  };

  const openStationCard = (stationId: number) => {
    stationCardIdRef.current = stationId;
    setSelectedStationId(stationId);
    setStationCardUi("open");
  };

  useLayoutEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (safeStorageGet("theme")) return;
      setTheme(media.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
      setInstallUi("banner");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => {
      setInstallPrompt(null);
      setInstallUi("banner");
    });
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    const onUpdateReady = () => setUpdateReady(true);
    const onControllerChange = () => {
      if (applyingUpdate.current) window.location.reload();
    };

    window.addEventListener("pwa-update-ready", onUpdateReady);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      onControllerChange
    );

    return () => {
      window.removeEventListener("pwa-update-ready", onUpdateReady);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  useEffect(() => {
    if (!isInstalledPwa()) return;

    const controller = new AbortController();

    const checkRemoteChangelog = () => {
      if (!navigator.onLine) return;
      void fetchRemoteUpdate(__APP_VERSION__, controller.signal)
        .then((info) => {
          if (!controller.signal.aborted) setRemoteUpdate(info);
        })
        .catch(() => {
          /* Offline or GitHub unavailable; skip the banner. */
        });
    };

    checkRemoteChangelog();
    window.addEventListener("online", checkRemoteChangelog);
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkRemoteChangelog();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      controller.abort();
      window.removeEventListener("online", checkRemoteChangelog);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!showInstall || installUi !== "banner") return;

    const dismiss = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(".installBanner")) return;
      setInstallUi("leaving");
    };

    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [showInstall, installUi]);

  async function runInstall() {
    if (androidApkOffer) {
      downloadAndroidApk();
      setAndroidApkOffer(false);
      setInstallPrompt(null);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function applyUpdate() {
    void (async () => {
      applyingUpdate.current = true;
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      await registration?.update().catch(() => {});
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      window.location.reload();
    })();
  }

  function dismissUpdate() {
    if (remoteUpdate) dismissRemoteUpdate(remoteUpdate.version);
    setRemoteUpdate(null);
    setUpdateReady(false);
  }

  useEffect(() => {
    setLines(enrichMetroData(rawStations, rawLines, bounds));
  }, [bounds]);

  useEffect(() => {
    const closeStation = ({ target }: MouseEvent) => {
      const el = target as Element | null;
      if (el?.closest?.(".circle") || el?.closest?.(".stationCard")) return;
      closeStationCard();
    };

    window.addEventListener("click", closeStation);
    return () => window.removeEventListener("click", closeStation);
  }, []);

  const graphInfo = useMemo(() => {
    if (!lines.length) return null;
    return analyzeConnectivity(buildAdjacencyList(lines));
  }, [lines]);

  const displayStations = useMemo(
    () =>
      Array.from(
        new Map(
          lines
            .flatMap((line) => line.stations)
            .map((station) => [station.id, station])
        ).values()
      ),
    [lines]
  );

  const stationCardId =
    stationCardUi === "closed"
      ? null
      : (selectedStationId ?? stationCardIdRef.current);

  const stationCardStation: EnrichedStation | null =
    displayStations.find((station) => station.id === stationCardId) || null;

  return (
    <div className="page">
      <Search
        lines={lines}
        focusedLine={focusedLine}
        onFocusLine={(lineId) =>
          setFocusedLine((current) => (current === lineId ? null : lineId))
        }
        onRouteChange={setRouteStationIds}
        goRequest={goRequest}
        onGoRequestHandled={() => setGoRequest(null)}
      />

      <MapView
        lines={lines}
        bounds={bounds}
        width={width}
        height={height}
        focusedLine={focusedLine}
        routeStationIds={routeStationIds}
        selectedStationId={selectedStationId}
        stationCardId={stationCardId}
        onSelectStation={openStationCard}
        onDeselectStation={closeStationCard}
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === "dark" ? "light" : "dark"))
        }
        showInstallChip={Boolean(showInstall && installUi === "chip")}
        onInstallChipClick={() => {
          void runInstall();
        }}
      >
        {stationCardStation ? (
          <StationCard
            station={stationCardStation}
            ui={stationCardUi}
            onClose={closeStationCard}
            onGo={(destinationId) => {
              setGoRequest({
                destinationId,
                token: Date.now(),
              });
              closeStationCard();
            }}
            onLeavingEnd={() => setStationCardUi("closed")}
          />
        ) : null}
      </MapView>

      {graphInfo ? <GraphInfoPanel info={graphInfo} /> : null}

      <PwaBanners
        updateReady={showUpdateBanner}
        onApplyUpdate={applyUpdate}
        onDismissUpdate={dismissUpdate}
        changelogLead={changelogLead}
        showInstall={showInstall}
        installUi={installUi}
        onInstall={() => {
          void runInstall();
        }}
        onDismissInstall={() => setInstallUi("leaving")}
        onInstallLeavingEnd={() => setInstallUi("chip")}
      />
    </div>
  );
}
