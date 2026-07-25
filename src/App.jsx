import { useEffect, useMemo, useRef, useState } from "react";
import "./assets/style.css";
import Stations from "./assets/data/stations.json";
import Lines from "./assets/data/lines.json";
import Search from "./Search";

const BASE_SCALE = 1100;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 3;
const DEFAULT_ZOOM = 2.45;
const MOBILE_MAX_WIDTH = 899;
// Rough center of central Tehran (around Imam Khomeini / Enghelab).
const TEHRAN_CENTER = { longitude: 51.421, latitude: 35.701 };
// Positive Y shifts the initial view down so the map sits a bit higher.
const DEFAULT_PAN_OFFSET_Y = 110;
const MOBILE_PAN_OFFSET_Y = 220;

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
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

function App() {
  const viewport = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const animating = useRef(false);
  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [focusedLine, setFocusedLine] = useState(null);
  const [routeStationIds, setRouteStationIds] = useState([]);
  const [lines, setLines] = useState([]);

  const bounds = useMemo(
    () => ({
      minLatitude: Math.min(...Stations.map((station) => station.latitude)),
      maxLatitude: Math.max(...Stations.map((station) => station.latitude)),
      minLongitude: Math.min(...Stations.map((station) => station.longtitude)),
      maxLongitude: Math.max(...Stations.map((station) => station.longtitude)),
    }),
    []
  );

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
      const active = document.querySelector(".circle.active");
      if (active && !active.contains(target)) active.classList.remove("active");
    };

    window.addEventListener("click", closeStation);
    return () => window.removeEventListener("click", closeStation);
  }, []);

  const applyZoomAroundPoint = (nextZoom, clientX, clientY) => {
    const box = viewport.current;
    if (!box) {
      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      return;
    }

    const rect = box.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const contentX = (box.scrollLeft + offsetX) / zoomRef.current;
    const contentY = (box.scrollTop + offsetY) / zoomRef.current;

    zoomRef.current = nextZoom;
    setZoom(nextZoom);

    requestAnimationFrame(() => {
      box.scrollLeft = contentX * nextZoom - offsetX;
      box.scrollTop = contentY * nextZoom - offsetY;
    });
  };

  const animateToZoom = (target, clientX, clientY) => {
    const goal = clampZoom(target);
    const start = zoomRef.current;
    if (goal === start) return;

    const box = viewport.current;
    const rect = box?.getBoundingClientRect();
    const pointX = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pointY = clientY ?? (rect ? rect.top + rect.height / 2 : 0);
    const startedAt = performance.now();
    const duration = 180;
    animating.current = true;

    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + (goal - start) * eased;
      applyZoomAroundPoint(value, pointX, pointY);

      if (progress < 1 && animating.current) {
        requestAnimationFrame(tick);
      } else {
        applyZoomAroundPoint(goal, pointX, pointY);
        animating.current = false;
      }
    };

    requestAnimationFrame(tick);
  };

  useEffect(() => {
    const box = viewport.current;
    if (!box) return;

    const onWheel = (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const next = clampZoom(zoomRef.current + direction * 0.12);
      if (next === zoomRef.current) return;
      applyZoomAroundPoint(next, event.clientX, event.clientY);
    };

    const onPointerDown = (event) => {
      if (event.button !== 0) return;
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
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onPointerDown);
      box.removeEventListener("pointermove", onPointerMove);
      box.removeEventListener("pointerup", endDrag);
      box.removeEventListener("pointercancel", endDrag);
      box.removeEventListener("pointerleave", endDrag);
    };
  }, [lines.length]);

  const width = (bounds.maxLongitude - bounds.minLongitude) * BASE_SCALE + 48;
  const height = (bounds.maxLatitude - bounds.minLatitude) * BASE_SCALE + 48;

  const routeSet = useMemo(() => new Set(routeStationIds), [routeStationIds]);
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
            style={{
              width: `${width * zoom}px`,
              height: `${height * zoom}px`,
            }}
          >
            <div
              id="map"
              className={focusedLine ? "hasFocus" : ""}
              style={{
                width: `${width}px`,
                height: `${height}px`,
                transform: `scale(${zoom})`,
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
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                    }}
                    className={`station${station.id} circle ${
                      station.intersection ? "intersection" : ""
                    }`}
                    onClick={({ currentTarget }) => {
                      if (drag.current.moved) return;
                      document
                        .querySelectorAll(".circle.active")
                        .forEach((circle) => circle.classList.remove("active"));
                      currentTarget.classList.add("active");
                    }}
                  >
                    <span>{stationLabel(station)}</span>
                    <div className="dataBox">
                      <div className="title">
                        <strong>{stationLabel(station)}</strong>
                        <small>{station.name}</small>
                      </div>
                      <div className="lines">
                        {station.timing_lines.map((line) => (
                          <div key={line.id}>
                            <b style={{ backgroundColor: line.data.color }}>
                              {line.data.title} · {stationLabel(line.start.data)}{" "}
                              ← {stationLabel(line.end.data)}
                            </b>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
