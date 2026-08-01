import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { toPersianDigits } from "../lib/format";
import { stationLabel } from "../lib/geo";
import {
  clampZoom,
  DEFAULT_PAN_OFFSET_Y,
  easeOutCubic,
  initialZoom,
  isMobileViewport,
  MOBILE_PAN_OFFSET_Y,
  pointerDistance,
  pointerMidpoint,
  releasePointerCaptureSafe,
  setPointerCaptureSafe,
  TEHRAN_CENTER,
} from "../lib/map";
import { BASE_SCALE } from "../lib/metro-data";
import type {
  EnrichedLine,
  EnrichedStation,
  MapBounds,
} from "../types/metro";

export type MapViewProps = {
  lines: EnrichedLine[];
  bounds: MapBounds;
  width: number;
  height: number;
  focusedLine: number | null;
  routeStationIds: number[];
  selectedStationId: number | null;
  stationCardId: number | null;
  onSelectStation: (stationId: number) => void;
  onDeselectStation: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  showInstallChip: boolean;
  onInstallChipClick: () => void;
  children?: ReactNode;
};

type DragState = {
  active: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  stationId: string | null;
};

type PinchState = {
  active: boolean;
  startDistance: number;
  startZoom: number;
};

export default function MapView({
  lines,
  bounds,
  width,
  height,
  focusedLine,
  routeStationIds,
  selectedStationId,
  stationCardId,
  onSelectStation,
  onDeselectStation,
  theme,
  onToggleTheme,
  showInstallChip,
  onInstallChipClick,
  children,
}: MapViewProps): ReactElement {
  const viewport = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(initialZoom());
  const animToken = useRef(0);
  const zoomSyncTimer = useRef(0);
  const mapSize = useRef({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, { clientX: number; clientY: number }>());
  const pinch = useRef<PinchState>({
    active: false,
    startDistance: 0,
    startZoom: 1,
  });
  const drag = useRef<DragState>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
    stationId: null,
  });
  const skipStationClick = useRef(false);
  const [zoom, setZoom] = useState(() => initialZoom());
  const [dragging, setDragging] = useState(false);

  mapSize.current = { width, height };

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

  const syncZoomState = (nextZoom: number, immediate = false) => {
    window.clearTimeout(zoomSyncTimer.current);
    if (immediate) {
      setZoom(nextZoom);
      return;
    }
    zoomSyncTimer.current = window.setTimeout(() => {
      setZoom(zoomRef.current);
    }, 48);
  };

  const paintZoom = (nextZoom: number, clientX: number, clientY: number) => {
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

  const animateToZoom = (target: number, clientX?: number, clientY?: number) => {
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

    const tick = (now: number) => {
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
      setDragging(true);
    };

    const onWheel = (event: WheelEvent) => {
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

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;

      const target = event.target as Element | null;
      const stationEl = target?.closest?.(".circle") ?? null;
      const stationId = stationEl?.getAttribute("data-station-id") ?? null;

      animToken.current += 1;
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

      if (!stationId) {
        setPointerCaptureSafe(box, event.pointerId);
      }

      drag.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: box.scrollLeft,
        scrollTop: box.scrollTop,
        stationId,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
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
          if (drag.current.stationId) {
            skipStationClick.current = true;
            setPointerCaptureSafe(box, event.pointerId);
          }
        }
      }
      if (!drag.current.moved) return;

      box.scrollLeft = drag.current.scrollLeft - dx;
      box.scrollTop = drag.current.scrollTop - dy;
    };

    const endPointer = (event: PointerEvent) => {
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
        window.setTimeout(() => {
          skipStationClick.current = false;
        }, 0);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
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
  const routeEdges = useMemo(() => {
    const edges = new Set<string>();
    for (let i = 0; i < routeStationIds.length - 1; i++) {
      const a = routeStationIds[i];
      const b = routeStationIds[i + 1];
      edges.add(`${a}-${b}`);
      edges.add(`${b}-${a}`);
    }
    return edges;
  }, [routeStationIds]);
  const hasRoute = routeStationIds.length > 0;

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

  const handleStationClick = (
    event: MouseEvent<HTMLButtonElement>,
    station: EnrichedStation
  ) => {
    event.stopPropagation();
    if (skipStationClick.current) {
      skipStationClick.current = false;
      return;
    }
    if (selectedStationId === station.id) {
      onDeselectStation();
      return;
    }
    onSelectStation(station.id);
  };

  const mapStyle = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `scale(${zoom})`,
    "--map-zoom": zoom,
  } as CSSProperties;

  return (
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
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
              />
            </svg>
            <span>Star</span>
          </a>

          {showInstallChip ? (
            <button
              type="button"
              className="installChip"
              onClick={onInstallChipClick}
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
            onClick={onToggleTheme}
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
            <span>{toPersianDigits(Math.round(zoom * 100))}٪</span>
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
            style={mapStyle}
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
                  onClick={(event) => handleStationClick(event, station)}
                >
                  <span>{stationLabel(station)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {children}
    </section>
  );
}
