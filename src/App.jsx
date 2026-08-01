import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./assets/style.css";
import Stations from "./assets/data/stations.json";
import Lines from "./assets/data/lines.json";
import Search from "./Search";
import { analyzeConnectivity, buildAdjacencyList } from "./graph";

const BASE_SCALE = 1100;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 2.45;
const MOBILE_DEFAULT_ZOOM = 1.85;
const MOBILE_MAX_WIDTH = 899;
// Rough center of central Tehran (around Imam Khomeini / Enghelab).
const TEHRAN_CENTER = { longitude: 51.421, latitude: 35.701 };
// Positive Y shifts the initial view down so the map sits a bit higher.
const DEFAULT_PAN_OFFSET_Y = 110;
// Extra offset clears the floating mobile top chrome.
const MOBILE_PAN_OFFSET_Y = 220;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function initialZoom() {
  return isMobileViewport() ? MOBILE_DEFAULT_ZOOM : DEFAULT_ZOOM;
}

function stationLabel(station) {
  return station?.translations?.fa || station?.name || "";
}

function lineNumber(line) {
  const match = String(line.name).match(/Line\s+(\d+)/i);
  return match ? match[1] : "";
}

function lineTitle(line) {
  const number = lineNumber(line);
  if (!number) return line.name;
  return /Branch/i.test(line.name) ? `خط ${number} (شاخه)` : `خط ${number}`;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function pointerDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function pointerMidpoint(a, b) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

// localStorage can throw (private mode, quota, disabled cookies, etc.), so
// every read/write goes through these two helpers instead of a local try/catch.
function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage unavailable; theme just won't persist. */
  }
}

// Pointer capture can throw if the pointer already ended or isn't supported;
// these wrappers keep call sites free of try/catch noise.
function setPointerCaptureSafe(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    /* Pointer may have already been released; ignore. */
  }
}

function releasePointerCaptureSafe(element, pointerId) {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    /* Capture may already be lost; ignore. */
  }
}

function getPreferredTheme() {
  const saved = safeStorageGet("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "dark" ? "#1c1d21" : "#ffcc00"
    );
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

function App() {
  const viewport = useRef(null);
  const mapRef = useRef(null);
  const scalerRef = useRef(null);
  const zoomRef = useRef(initialZoom());
  const animToken = useRef(0);
  const zoomSyncTimer = useRef(0);
  const mapSize = useRef({ width: 0, height: 0 });
  const applyingUpdate = useRef(false);
  const pointers = useRef(new Map());
  const pinch = useRef({
    active: false,
    startDistance: 0,
    startZoom: 1,
  });
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    stationId: null,
  });
  // After a pinch that started on a station, suppress the synthetic click.
  const skipStationClick = useRef(false);
  const [zoom, setZoom] = useState(() => initialZoom());
  const [dragging, setDragging] = useState(false);
  const [focusedLine, setFocusedLine] = useState(null);
  const [routeStationIds, setRouteStationIds] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [stationCardUi, setStationCardUi] = useState("closed"); // closed | open | leaving
  const stationCardIdRef = useRef(null);
  const [goRequest, setGoRequest] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installUi, setInstallUi] = useState("banner"); // banner | leaving | chip
  const [updateReady, setUpdateReady] = useState(false);
  const [theme, setTheme] = useState(() => getPreferredTheme());

  const closeStationCard = () => {
    setStationCardUi((ui) => (ui === "open" ? "leaving" : ui));
    setSelectedStationId(null);
  };

  const openStationCard = (stationId) => {
    stationCardIdRef.current = stationId;
    setSelectedStationId(stationId);
    setStationCardUi("open");
  };

  useLayoutEffect(() => {
    applyTheme(theme);
    safeStorageSet("theme", theme);
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
    const onPrompt = (event) => {
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
    navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

    return () => {
      window.removeEventListener("pwa-update-ready", onUpdateReady);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  // Once the user starts interacting with the app, fade the install banner away.
  useEffect(() => {
    if (!installPrompt || installUi !== "banner") return;

    const dismiss = (event) => {
      if (event.target?.closest?.(".installBanner")) return;
      setInstallUi("leaving");
    };

    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismiss, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismiss, true);
    };
  }, [installPrompt, installUi]);

  async function runInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function applyUpdate() {
    navigator.serviceWorker?.getRegistration().then((registration) => {
      applyingUpdate.current = true;
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    });
  }

  const bounds = useMemo(
    () => ({
      minLatitude: Math.min(...Stations.map((station) => station.latitude)),
      maxLatitude: Math.max(...Stations.map((station) => station.latitude)),
      minLongitude: Math.min(...Stations.map((station) => station.longtitude)),
      maxLongitude: Math.max(...Stations.map((station) => station.longtitude)),
    }),
    []
  );

  const width = (bounds.maxLongitude - bounds.minLongitude) * BASE_SCALE + 48;
  const height = (bounds.maxLatitude - bounds.minLatitude) * BASE_SCALE + 48;
  mapSize.current = { width, height };

  useEffect(() => {
    const nextLines = Lines.map((line) => {
      const lineStations = Stations.filter((station) =>
        station.lines.some((stationLine) => stationLine.id === line.id)
      )
        .map((station) => {
          const stationLine = station.lines.find(
            (item) => item.id === line.id
          );

          return {
            ...station,
            x: (station.longtitude - bounds.minLongitude) * BASE_SCALE + 24,
            y: (bounds.maxLatitude - station.latitude) * BASE_SCALE + 24,
            intersection: station.lines.length > 1,
            line: { ...stationLine, color: line.color },
          };
        })
        .sort((a, b) => a.line.serial_number - b.line.serial_number);

      return {
        ...line,
        title: lineTitle(line),
        stations: lineStations,
      };
    });

    const linesWithTiming = nextLines.map((line) => ({
      ...line,
      stations: line.stations.map((station) => ({
        ...station,
        timing_lines: station.lines
          .map((stationLine) => {
            const lineData = nextLines.find(
              (item) => item.id === stationLine.id
            );
            if (!lineData) return null;

            return {
              ...stationLine,
              data: lineData,
              start: { data: lineData.stations[0] },
              end: { data: lineData.stations.at(-1) },
            };
          })
          .filter(Boolean),
      })),
    }));

    setLines(linesWithTiming);
  }, [bounds]);

  useEffect(() => {
    if (!viewport.current || !lines.length) return;

    const box = viewport.current;

    const applyDefaultPan = () => {
      if (!box.clientWidth || !box.clientHeight) return;

      const centerX =
        (TEHRAN_CENTER.longitude - bounds.minLongitude) * BASE_SCALE + 24;
      const centerY =
        (bounds.maxLatitude - TEHRAN_CENTER.latitude) * BASE_SCALE + 24;
      const currentZoom = zoomRef.current;
      const offsetY = isMobileViewport()
        ? MOBILE_PAN_OFFSET_Y
        : DEFAULT_PAN_OFFSET_Y;

      box.scrollLeft = centerX * currentZoom - box.clientWidth / 2;
      box.scrollTop =
        centerY * currentZoom - box.clientHeight / 2 + offsetY;
    };

    // Mobile layout settles after the search panel height is applied.
    const frame = requestAnimationFrame(() => {
      applyDefaultPan();
      requestAnimationFrame(applyDefaultPan);
    });
    const retry = window.setTimeout(applyDefaultPan, 120);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, [lines.length, bounds]);

  useEffect(() => {
    const closeStation = ({ target }) => {
      if (target.closest?.(".circle") || target.closest?.(".stationCard")) return;
      closeStationCard();
    };

    window.addEventListener("click", closeStation);
    return () => window.removeEventListener("click", closeStation);
  }, []);

  // Keep DOM zoom in sync if React re-renders with a stale zoom style.
  useLayoutEffect(() => {
    const map = mapRef.current;
    const scaler = scalerRef.current;
    if (!map || !scaler) return;

    const z = zoomRef.current;
    const { width: mapWidth, height: mapHeight } = mapSize.current;
    map.style.setProperty("--map-zoom", String(z));
    map.style.transform = `scale(${z})`;
    scaler.style.width = `${mapWidth * z}px`;
    scaler.style.height = `${mapHeight * z}px`;
  });

  const syncZoomState = (nextZoom, immediate = false) => {
    window.clearTimeout(zoomSyncTimer.current);
    if (immediate) {
      setZoom(nextZoom);
      return;
    }
    zoomSyncTimer.current = window.setTimeout(() => {
      setZoom(zoomRef.current);
    }, 48);
  };

  const paintZoom = (nextZoom, clientX, clientY) => {
    const box = viewport.current;
    const map = mapRef.current;
    const scaler = scalerRef.current;
    const { width: mapWidth, height: mapHeight } = mapSize.current;

    if (!box || !map || !scaler) {
      zoomRef.current = nextZoom;
      return;
    }

    const rect = box.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const contentX = (box.scrollLeft + offsetX) / zoomRef.current;
    const contentY = (box.scrollTop + offsetY) / zoomRef.current;

    zoomRef.current = nextZoom;
    map.style.setProperty("--map-zoom", String(nextZoom));
    map.style.transform = `scale(${nextZoom})`;
    scaler.style.width = `${mapWidth * nextZoom}px`;
    scaler.style.height = `${mapHeight * nextZoom}px`;

    const stroke = Math.max(2, 5 / nextZoom);
    map.querySelectorAll("svg path").forEach((path) => {
      path.setAttribute("stroke-width", String(stroke));
    });

    box.scrollLeft = contentX * nextZoom - offsetX;
    box.scrollTop = contentY * nextZoom - offsetY;
  };

  const animateToZoom = (target, clientX, clientY) => {
    const goal = clampZoom(target);
    const start = zoomRef.current;
    if (Math.abs(goal - start) < 0.001) return;

    const box = viewport.current;
    const rect = box?.getBoundingClientRect();
    const pointX = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pointY = clientY ?? (rect ? rect.top + rect.height / 2 : 0);
    const startedAt = performance.now();
    const duration = 280;
    const token = ++animToken.current;

    const tick = (now) => {
      if (animToken.current !== token) return;

      const progress = Math.min(1, (now - startedAt) / duration);
      const value = start + (goal - start) * easeOutCubic(progress);
      paintZoom(value, pointX, pointY);

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        paintZoom(goal, pointX, pointY);
        syncZoomState(goal, true);
      }
    };

    requestAnimationFrame(tick);
  };

  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const activePointers = pointers.current;

    const stopDrag = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      setDragging(false);
    };

    const beginPinch = () => {
      const points = [...activePointers.values()];
      if (points.length < 2) return;

      animToken.current += 1;
      stopDrag();
      drag.current.moved = true;
      skipStationClick.current = true;
      pinch.current = {
        active: true,
        startDistance: Math.max(1, pointerDistance(points[0], points[1])),
        startZoom: zoomRef.current,
      };
      // Disable station hit-testing so the finger on a .circle stays with the pinch.
      setDragging(true);
    };

    const onWheel = (event) => {
      event.preventDefault();
      animToken.current += 1;

      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * box.clientHeight
            : event.deltaY;
      const next = clampZoom(zoomRef.current * Math.exp(-delta * 0.00155));
      if (Math.abs(next - zoomRef.current) < 0.0001) return;

      paintZoom(next, event.clientX, event.clientY);
      syncZoomState(next);
    };

    const onPointerDown = (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;

      const onStation = Boolean(event.target?.closest?.(".circle"));

      animToken.current += 1;
      // Always track the pointer so a finger on a station can still pinch-zoom.
      activePointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      if (activePointers.size >= 2) {
        for (const id of activePointers.keys()) {
          setPointerCaptureSafe(box, id);
        }
        beginPinch();
        return;
      }

      // Single finger on a station: track for a possible pinch, but let the
      // station button handle the tap (no capture / no pan).
      if (onStation) return;

      setPointerCaptureSafe(box, event.pointerId);

      drag.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: box.scrollLeft,
        scrollTop: box.scrollTop,
        stationId: null,
      };
    };

    const onPointerMove = (event) => {
      if (!activePointers.has(event.pointerId)) return;

      activePointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });

      if (pinch.current.active && activePointers.size >= 2) {
        event.preventDefault();
        const points = [...activePointers.values()];
        const distance = Math.max(1, pointerDistance(points[0], points[1]));
        const mid = pointerMidpoint(points[0], points[1]);
        const next = clampZoom(
          pinch.current.startZoom * (distance / pinch.current.startDistance)
        );
        if (Math.abs(next - zoomRef.current) < 0.0001) return;
        paintZoom(next, mid.x, mid.y);
        syncZoomState(next);
        return;
      }

      if (!drag.current.active || pinch.current.active) return;

      const dx = event.clientX - drag.current.startX;
      const dy = event.clientY - drag.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!drag.current.moved) {
          drag.current.moved = true;
          setDragging(true);
        }
      }
      if (!drag.current.moved) return;

      box.scrollLeft = drag.current.scrollLeft - dx;
      box.scrollTop = drag.current.scrollTop - dy;
    };

    const endPointer = (event) => {
      if (!activePointers.has(event.pointerId)) return;

      activePointers.delete(event.pointerId);
      releasePointerCaptureSafe(box, event.pointerId);

      if (activePointers.size < 2 && pinch.current.active) {
        pinch.current.active = false;
        syncZoomState(zoomRef.current, true);
      }

      if (activePointers.size === 1) {
        const remaining = [...activePointers.values()][0];
        drag.current = {
          active: true,
          moved: true,
          startX: remaining.clientX,
          startY: remaining.clientY,
          scrollLeft: box.scrollLeft,
          scrollTop: box.scrollTop,
          stationId: null,
        };
        setDragging(true);
        return;
      }

      if (activePointers.size === 0) {
        drag.current.active = false;
        setDragging(false);
        // Clear after the click that follows pointerup has been dispatched.
        window.setTimeout(() => {
          skipStationClick.current = false;
        }, 0);
      }
    };

    const onTouchMove = (event) => {
      if (event.touches.length >= 2) event.preventDefault();
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("pointerdown", onPointerDown);
    box.addEventListener("pointermove", onPointerMove, { passive: false });
    box.addEventListener("pointerup", endPointer);
    box.addEventListener("pointercancel", endPointer);
    box.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      window.clearTimeout(zoomSyncTimer.current);
      activePointers.clear();
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onPointerDown);
      box.removeEventListener("pointermove", onPointerMove);
      box.removeEventListener("pointerup", endPointer);
      box.removeEventListener("pointercancel", endPointer);
      box.removeEventListener("touchmove", onTouchMove);
    };
  }, [lines.length]);

  const routeSet = useMemo(() => new Set(routeStationIds), [routeStationIds]);
  const graphInfo = useMemo(() => {
    if (!lines.length) return null;
    return analyzeConnectivity(buildAdjacencyList(lines));
  }, [lines]);
  const routeEdges = useMemo(() => {
    const edges = new Set();
    for (let i = 0; i < routeStationIds.length - 1; i++) {
      const a = routeStationIds[i];
      const b = routeStationIds[i + 1];
      edges.add(`${a}-${b}`);
      edges.add(`${b}-${a}`);
    }
    return edges;
  }, [routeStationIds]);
  const hasRoute = routeStationIds.length > 0;

  const displayStations = Array.from(
    new Map(
      lines
        .flatMap((line) => line.stations)
        .map((station) => [station.id, station])
    ).values()
  );
  const stationCardId =
    stationCardUi === "closed"
      ? null
      : selectedStationId ?? stationCardIdRef.current;
  const stationCardStation =
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

      <section className="mapBox">
        <div className="mapBoxTop">
          <strong className="mapTitle">نقشه مترو</strong>

          <div className="mapBoxTopActions">
            <a
              className="githubStar"
              href="https://github.com/amirabbas-gh/tehran-metro"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Star this project on GitHub"
              title="Star on GitHub"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
                />
              </svg>
              <span>Star</span>
            </a>

            {installPrompt && installUi === "chip" ? (
              <button
                type="button"
                className="installChip"
                onClick={runInstall}
                title="نصب اپلیکیشن"
                aria-label="نصب اپلیکیشن"
              >
                <img src="/icon-192.png" alt="" width="14" height="14" />
                <span>نصب</span>
              </button>
            ) : null}
          </div>

          <div className="mapBoxTopTools">
            <button
              type="button"
              className="themeToggle"
              onClick={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
              aria-label={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
              title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}
            >
              {theme === "dark" ? (
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
                </svg>
              )}
            </button>

            <div className="zoomControls">
              <button
                type="button"
                onClick={() => animateToZoom(zoomRef.current + 0.25)}
                aria-label="بزرگ‌نمایی"
              >
                +
              </button>
              <span>{Math.round(zoom * 100)}٪</span>
              <button
                type="button"
                onClick={() => animateToZoom(zoomRef.current - 0.25)}
                aria-label="کوچک‌نمایی"
              >
                −
              </button>
            </div>
          </div>
        </div>

        <div
          className={`mapViewport ${dragging ? "dragging" : ""}`}
          ref={viewport}
        >
          <div
            className="mapScaler"
            ref={scalerRef}
            style={{
              width: `${width * zoom}px`,
              height: `${height * zoom}px`,
            }}
          >
            <div
              id="map"
              ref={mapRef}
              className={focusedLine ? "hasFocus" : ""}
              style={{
                width: `${width}px`,
                height: `${height}px`,
                transform: `scale(${zoom})`,
                "--map-zoom": zoom,
              }}
            >
              <svg>
                {lines.map((line) =>
                  line.stations.map((station, index) => {
                    const previous = index ? line.stations[index - 1] : null;
                    const onRoute =
                      !hasRoute ||
                      (previous &&
                        routeEdges.has(`${previous.id}-${station.id}`));

                    return (
                      <path
                        key={`${line.id}-${station.id}`}
                        className={`station${station.id} pathLine${line.id}`}
                        d={`M${previous ? previous.x : station.x} ${
                          previous ? previous.y : station.y
                        } L${station.x} ${station.y}`}
                        strokeWidth={Math.max(2, 5 / zoom)}
                        style={{
                          fill: "none",
                          stroke: line.color,
                          opacity: hasRoute
                            ? onRoute
                              ? 1
                              : 0.12
                            : focusedLine && focusedLine !== line.id
                              ? 0.12
                              : 1,
                        }}
                      />
                    );
                  })
                )}
              </svg>

              {displayStations.map((station) => {
                const dimmed = hasRoute
                  ? !routeSet.has(station.id)
                  : focusedLine &&
                    !station.lines.some((line) => line.id === focusedLine);

                return (
                  <button
                    type="button"
                    key={station.id}
                    data-station-id={station.id}
                    aria-label={stationLabel(station)}
                    style={{
                      left: station.x,
                      top: station.y,
                      borderColor: station.intersection
                        ? undefined
                        : station.timing_lines[0]?.data.color,
                      opacity: dimmed ? 0.15 : 1,
                    }}
                    className={`station${station.id} circle ${
                      station.intersection ? "intersection" : ""
                    } ${stationCardId === station.id ? "active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (skipStationClick.current) {
                        skipStationClick.current = false;
                        return;
                      }
                      if (selectedStationId === station.id) {
                        closeStationCard();
                        return;
                      }
                      openStationCard(station.id);
                    }}
                  >
                    <span>{stationLabel(station)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {stationCardStation ? (
          <aside
            className={`stationCard${stationCardUi === "leaving" ? " isLeaving" : ""}`}
            aria-live="polite"
            onAnimationEnd={() => {
              if (stationCardUi === "leaving") setStationCardUi("closed");
            }}
          >
            <div className="stationCardHead">
              <div className="title">
                <strong>{stationLabel(stationCardStation)}</strong>
                <small>{stationCardStation.name}</small>
              </div>
              <button
                type="button"
                className="stationCardClose"
                aria-label="بستن"
                onClick={closeStationCard}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71 2.89 18.3 9.17 12 2.89 5.71 4.3 4.29l6.29 6.3 6.29-6.3z"
                  />
                </svg>
              </button>
            </div>

            <div className="stationCardLines">
              {stationCardStation.timing_lines.map((line) => (
                <b
                  key={line.id}
                  className="stationCardLine"
                  style={{ backgroundColor: line.data.color }}
                >
                  {line.data.title} · {stationLabel(line.start.data)} ←{" "}
                  {stationLabel(line.end.data)}
                </b>
              ))}
            </div>

            <button
              type="button"
              className="stationCardGo"
              onClick={() => {
                setGoRequest({
                  destinationId: stationCardStation.id,
                  token: Date.now(),
                });
                closeStationCard();
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
                />
              </svg>
              <span>رفتن به اینجا</span>
            </button>
          </aside>
        ) : null}
      </section>

      {graphInfo ? (
        <aside className="graphInfo" aria-label="Graph theory summary">
          <strong>G = (V, E)</strong>
          <dl>
            <div>
              <dt>|V|</dt>
              <dd>{graphInfo.n} stations</dd>
            </div>
            <div>
              <dt>|E|</dt>
              <dd>{graphInfo.e} edges</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>Undirected · sparse</dd>
            </div>
            <div>
              <dt>Store</dt>
              <dd>Adjacency list</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>BFS · O(n+e)</dd>
            </div>
            <div>
              <dt>Connected</dt>
              <dd>
                {graphInfo.connected
                  ? "Yes (DFS)"
                  : `${graphInfo.componentCount} components`}
              </dd>
            </div>
          </dl>
        </aside>
      ) : null}

      {updateReady ? (
        <div className="installBanner" role="dialog" aria-label="آپدیت اپلیکیشن">
          <img src="/icon-192.png" alt="" width="40" height="40" />
          <div className="installBannerText">
            <strong>نسخه جدید آماده است</strong>
            <span className="installDesc">برای دریافت تغییرات جدید، اپ را به‌روزرسانی کنید</span>
            <span className="installShort">آپدیت جدید</span>
          </div>
          <button type="button" className="installBannerGo" onClick={applyUpdate}>
            آپدیت
          </button>
          <button
            type="button"
            className="installBannerClose"
            aria-label="بعداً"
            onClick={() => setUpdateReady(false)}
          >
            <span className="installLater">بعداً</span>
            <span className="installX" aria-hidden="true">
              ×
            </span>
          </button>
        </div>
      ) : installPrompt && (installUi === "banner" || installUi === "leaving") ? (
        <div
          className={`installBanner${installUi === "leaving" ? " isLeaving" : ""}`}
          role="dialog"
          aria-label="نصب اپلیکیشن"
          onAnimationEnd={() => {
            if (installUi === "leaving") setInstallUi("chip");
          }}
        >
          <img src="/icon-192.png" alt="" width="40" height="40" />
          <div className="installBannerText">
            <strong>مترو تهران</strong>
            <span className="installDesc">نصبش کن؛ آفلاین هم کار می‌کنه</span>
            <span className="installShort">نصب اپ روی گوشی</span>
          </div>
          <button type="button" className="installBannerGo" onClick={runInstall}>
            نصب
          </button>
          <button
            type="button"
            className="installBannerClose"
            aria-label="بستن"
            onClick={() => setInstallUi("leaving")}
          >
            <span className="installLater">بعداً</span>
            <span className="installX" aria-hidden="true">
              ×
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default App;
