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
const MOBILE_PAN_OFFSET_Y = 160;

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

function App() {
  const viewport = useRef(null);
  const mapRef = useRef(null);
  const scalerRef = useRef(null);
  const zoomRef = useRef(initialZoom());
  const animToken = useRef(0);
  const zoomSyncTimer = useRef(0);
  const mapSize = useRef({ width: 0, height: 0 });
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [zoom, setZoom] = useState(() => initialZoom());
  const [dragging, setDragging] = useState(false);
  const [focusedLine, setFocusedLine] = useState(null);
  const [routeStationIds, setRouteStationIds] = useState([]);
  const [lines, setLines] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState(null);

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
      if (drag.current.moved) return;
      if (target.closest?.(".circle") || target.closest?.(".stationCard")) return;
      setSelectedStationId(null);
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
      if (event.button !== 0) return;
      animToken.current += 1;
      drag.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: box.scrollLeft,
        scrollTop: box.scrollTop,
      };
      setDragging(true);
      box.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!drag.current.active) return;
      const dx = event.clientX - drag.current.startX;
      const dy = event.clientY - drag.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
      box.scrollLeft = drag.current.scrollLeft - dx;
      box.scrollTop = drag.current.scrollTop - dy;
    };

    const endDrag = (event) => {
      if (!drag.current.active) return;
      drag.current.active = false;
      setDragging(false);
      try {
        box.releasePointerCapture?.(event.pointerId);
      } catch {
        /* ignore */
      }
    };

    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("pointerdown", onPointerDown);
    box.addEventListener("pointermove", onPointerMove);
    box.addEventListener("pointerup", endDrag);
    box.addEventListener("pointercancel", endDrag);
    box.addEventListener("pointerleave", endDrag);

    return () => {
      window.clearTimeout(zoomSyncTimer.current);
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onPointerDown);
      box.removeEventListener("pointermove", onPointerMove);
      box.removeEventListener("pointerup", endDrag);
      box.removeEventListener("pointercancel", endDrag);
      box.removeEventListener("pointerleave", endDrag);
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
  const selectedStation =
    displayStations.find((station) => station.id === selectedStationId) || null;

  return (
    <div className="page">
      <Search
        lines={lines}
        focusedLine={focusedLine}
        onFocusLine={(lineId) =>
          setFocusedLine((current) => (current === lineId ? null : lineId))
        }
        onRouteChange={setRouteStationIds}
      />

      <section className="mapBox">
        <div className="mapBoxTop">
          <strong className="mapTitle">نقشه مترو</strong>

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
                  <div
                    key={station.id}
                    style={{
                      left: station.x,
                      top: station.y,
                      backgroundColor: "#fff",
                      borderColor: station.intersection
                        ? "#222"
                        : station.timing_lines[0]?.data.color,
                      opacity: dimmed ? 0.15 : 1,
                    }}
                    className={`station${station.id} circle ${
                      station.intersection ? "intersection" : ""
                    } ${selectedStationId === station.id ? "active" : ""}`}
                    onClick={() => {
                      if (drag.current.moved) return;
                      setSelectedStationId((current) =>
                        current === station.id ? null : station.id
                      );
                    }}
                  >
                    <span>{stationLabel(station)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {selectedStation ? (
          <aside className="stationCard" aria-live="polite">
            <div className="title">
              <strong>{stationLabel(selectedStation)}</strong>
              <small>{selectedStation.name}</small>
            </div>
            <div className="lines">
              {selectedStation.timing_lines.map((line) => (
                <b key={line.id} style={{ backgroundColor: line.data.color }}>
                  {line.data.title} · {stationLabel(line.start.data)} ←{" "}
                  {stationLabel(line.end.data)}
                </b>
              ))}
            </div>
            <button
              type="button"
              className="stationCardClose"
              aria-label="بستن"
              onClick={() => setSelectedStationId(null)}
            >
              بستن
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
    </div>
  );
}

export default App;
