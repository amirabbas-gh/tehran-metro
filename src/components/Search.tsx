import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { toPersianDigits } from "../lib/format";
import {
  findNearestStation,
  geoErrorMessage,
  stationLabel,
} from "../lib/geo";
import { buildAdjacencyList, dijkstraFindPath } from "../lib/graph";
import { lineNumber } from "../lib/metro-data";
import { formatDurationFa, minutesToClock } from "../lib/schedule";
import type {
  AutofillStation,
  EnrichedLine,
  EnrichedStation,
  GoRequest,
  RouteStep,
  SearchFocus,
  StationLineMembership,
  WeightedPathResult,
} from "../types/metro";

function withLineColors(
  station: EnrichedStation,
  lines: EnrichedLine[]
): AutofillStation {
  return {
    ...station,
    lines: station.lines.map((stationLine) => {
      const line = lines.find((item) => item.id === stationLine.id);
      return {
        ...stationLine,
        color: line?.color || "#999",
        label: toPersianDigits(
          (line && lineNumber(line)) || String(stationLine.id)
        ),
      };
    }),
  };
}

export type SearchProps = {
  lines: EnrichedLine[];
  focusedLine: number | null;
  onFocusLine: (lineId: number) => void;
  onRouteChange: (stationIds: number[]) => void;
  goRequest: GoRequest | null;
  onGoRequestHandled: () => void;
};

export default function Search({
  lines,
  focusedLine,
  onFocusLine,
  onRouteChange,
  goRequest,
  onGoRequestHandled,
}: SearchProps): ReactElement {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [autofills, setAutofills] = useState<AutofillStation[]>([]);
  const [autofill, setAutofill] = useState(false);
  const [originId, setOriginId] = useState(0);
  const [destinationId, setDestinationId] = useState(0);
  const [focus, setFocus] = useState<SearchFocus>(false);
  const [way, setWay] = useState<WeightedPathResult["path"]>([]);
  const [routeStats, setRouteStats] = useState<{
    distanceKm: number;
    transferCount: number;
    durationMinutes: number;
    arrivalClock: string;
    initialWaitMinutes: number;
  }>({
    distanceKm: 0,
    transferCount: 0,
    durationMinutes: 0,
    arrivalClock: "",
    initialWaitMinutes: 0,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [awaitingOrigin, setAwaitingOrigin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoHint, setGeoHint] = useState("");
  const [allStopsVisible, setAllStopsVisible] = useState(false);
  const originInputRef = useRef<HTMLInputElement>(null);
  const originIdRef = useRef(0);

  const stationsById = useMemo(() => buildAdjacencyList(lines), [lines]);
  const uniqueStations = useMemo(
    () => Array.from(stationsById.values()),
    [stationsById]
  );

  originIdRef.current = originId;

  useEffect(() => {
    const onDocumentClick = () => {
      if (!document.querySelector("input:focus")) {
        setAutofill(false);
        setFocus(false);
      }
    };

    document.documentElement.addEventListener("click", onDocumentClick);
    return () =>
      document.documentElement.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    if (way.length > 0) setSheetOpen(true);
  }, [way.length]);

  useEffect(() => {
    if (originId && awaitingOrigin) {
      setAwaitingOrigin(false);
      setGeoHint("");
    }
  }, [originId, awaitingOrigin]);

  useEffect(() => {
    if (!goRequest?.destinationId) return;

    const dest = stationsById.get(goRequest.destinationId);
    if (!dest) {
      onGoRequestHandled();
      return;
    }

    const label = stationLabel(dest);
    const currentOriginId = originIdRef.current;

    setDestination(label);
    setDestinationId(dest.id);
    setAutofill(false);
    setFocus(false);
    setSheetOpen(true);
    setGeoHint("");

    if (currentOriginId && currentOriginId !== dest.id) {
      setAwaitingOrigin(false);
    } else {
      if (currentOriginId === dest.id) {
        setOrigin("");
        setOriginId(0);
      }
      setAwaitingOrigin(true);
    }

    onGoRequestHandled();
  }, [goRequest, stationsById, onGoRequestHandled]);

  const applyOriginStation = useCallback((station: EnrichedStation) => {
    setOrigin(stationLabel(station));
    setOriginId(station.id);
    setAwaitingOrigin(false);
    setAutofill(false);
    setFocus(false);
    setGeoHint("");
    setSheetOpen(true);
  }, []);

  const useNearestOrigin = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoHint("مرورگر شما از موقعیت جغرافیایی پشتیبانی نمی‌کند.");
      originInputRef.current?.focus();
      setFocus("o");
      setAutofill(true);
      return;
    }

    setLocating(true);
    setGeoHint("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude, longitude } = position.coords;
        const nearest = findNearestStation(uniqueStations, latitude, longitude);

        if (!nearest) {
          setGeoHint("ایستگاه نزدیکی پیدا نشد.");
          return;
        }

        if (nearest.station.id === destinationId) {
          setGeoHint(
            "نزدیک‌ترین ایستگاه همان مقصد است. مبدا دیگری انتخاب کنید."
          );
          originInputRef.current?.focus();
          setFocus("o");
          setAutofill(true);
          return;
        }

        console.log(
          "nearest station distance (km):",
          nearest.km,
          stationLabel(nearest.station)
        );

        applyOriginStation(nearest.station);
      },
      (error) => {
        setLocating(false);
        setGeoHint(geoErrorMessage(error));
        originInputRef.current?.focus();
        setFocus("o");
        setAutofill(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  }, [uniqueStations, destinationId, applyOriginStation]);

  const pickOriginManually = useCallback(() => {
    setGeoHint("");
    setSheetOpen(true);
    setFocus("o");
    setAutofill(true);
    window.setTimeout(() => originInputRef.current?.focus(), 50);
  }, []);

  const fillAutoFill = useCallback(
    (searchedText: string, selectedId = 0) => {
      const selected = selectedId ? stationsById.get(selectedId) : null;
      const raw = searchedText.trim();
      const query =
        selected && stationLabel(selected) === raw ? "" : raw.toLowerCase();
      const persianQuery = query ? raw : "";
      const matches = new Map<number, AutofillStation>();

      lines.forEach((line) => {
        line.stations.forEach((station) => {
          if (matches.has(station.id)) return;
          if (focus === "o" && station.id === destinationId) return;
          if (focus === "d" && station.id === originId) return;

          const persianName = station.translations?.fa || "";
          if (
            !query ||
            station.name.toLowerCase().includes(query) ||
            persianName.includes(persianQuery)
          ) {
            matches.set(station.id, withLineColors(station, lines));
          }
        });
      });

      setAutofills([...matches.values()]);
    },
    [lines, focus, originId, destinationId, stationsById]
  );

  useEffect(() => {
    if (!autofill || !focus) return;
    if (focus === "o") fillAutoFill(origin, originId);
    else fillAutoFill(destination, destinationId);
  }, [
    origin,
    destination,
    originId,
    destinationId,
    fillAutoFill,
    autofill,
    focus,
  ]);

  const clearRoute = useCallback(() => {
    setOrigin("");
    setDestination("");
    setOriginId(0);
    setDestinationId(0);
    setWay([]);
    setRouteStats({
      distanceKm: 0,
      transferCount: 0,
      durationMinutes: 0,
      arrivalClock: "",
      initialWaitMinutes: 0,
    });
    setAwaitingOrigin(false);
    setLocating(false);
    setGeoHint("");
    setAllStopsVisible(false);
    onRouteChange([]);
  }, [onRouteChange]);

  useEffect(() => {
    if (!originId || !destinationId) {
      setWay([]);
      setRouteStats({
        distanceKm: 0,
        transferCount: 0,
        durationMinutes: 0,
        arrivalClock: "",
        initialWaitMinutes: 0,
      });
      setAllStopsVisible(false);
      onRouteChange([]);
      return;
    }

    setAllStopsVisible(false);
    const departureTime = new Date();
    const result = dijkstraFindPath(stationsById, originId, destinationId, {
      departureTime,
    });
    setWay(result.path);
    setRouteStats({
      distanceKm: result.distanceKm,
      transferCount: result.transferCount,
      durationMinutes: result.durationMinutes ?? 0,
      arrivalClock:
        result.arrivalClock ?? minutesToClock(
          departureTime.getHours() * 60 + departureTime.getMinutes()
        ),
      initialWaitMinutes: result.initialWaitMinutes ?? 0,
    });
    onRouteChange(result.path.map((station) => station.id));
  }, [originId, destinationId, stationsById, onRouteChange]);

  const showRoute = way.length > 0;

  const routeSteps = useMemo((): RouteStep[] => {
    if (!way.length) return [];

    const edgeLine = (
      from: EnrichedStation,
      to: EnrichedStation
    ): StationLineMembership | undefined =>
      from.lines.find((line) =>
        to.lines.some(
          (item) =>
            item.id === line.id &&
            Math.abs(item.serial_number - line.serial_number) === 1
        )
      );

    return way.map((station, index) => {
      const previous = way[index - 1];
      const next = way[index + 1];
      const incoming = previous ? edgeLine(previous, station) : undefined;
      const outgoing = next ? edgeLine(station, next) : undefined;
      const activeLine = incoming || outgoing;
      const segmentColor =
        lines.find((line) => line.id === activeLine?.id)?.color ||
        station.timing_lines?.[0]?.data?.color ||
        "#999";

      const isStart = index === 0;
      const isEnd = index === way.length - 1;
      const isTransfer =
        !isStart &&
        !isEnd &&
        !!incoming &&
        !!outgoing &&
        incoming.id !== outgoing.id;

      return {
        station,
        index,
        segmentColor,
        isStart,
        isEnd,
        isTransfer,
      };
    });
  }, [way, lines]);

  const displayedRouteSteps = useMemo(
    () =>
      allStopsVisible
        ? routeSteps
        : routeSteps.filter(
            (step) => step.isStart || step.isEnd || step.isTransfer
          ),
    [allStopsVisible, routeSteps]
  );
  const intermediateStopCount = Math.max(
    0,
    routeSteps.length -
      routeSteps.filter(
        (step) => step.isStart || step.isEnd || step.isTransfer
      ).length
  );

  const sheetClass = [
    "searchForm",
    sheetOpen ? "sheetOpen" : "sheetCollapsed",
    autofill ? "sheetAutofill" : "",
    showRoute ? "hasRoute" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={sheetClass}>
      <button
        type="button"
        className="sheetHandle"
        aria-expanded={sheetOpen}
        aria-label={sheetOpen ? "بستن پنل" : "باز کردن پنل"}
        onClick={() => setSheetOpen((open) => !open)}
      >
        <span />
      </button>

      <div className="sheetChrome">
        <div className="searchHeader">
          <div>
            <strong>مسیریابی</strong>
            <span>مبدا و مقصد را برای نمایش مسیر انتخاب کنید.</span>
          </div>
          <button
            type="button"
            className="sheetToggle"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen((open) => !open)}
          >
            {sheetOpen ? "جمع کردن" : showRoute ? "مشاهده مسیر" : "خطوط"}
          </button>
        </div>

        <div className="searchInputs">
          <div className="searchInput">
            <b style={{ borderColor: "green" }} />
            <input
              id="o"
              ref={originInputRef}
              placeholder="ایستگاه مبدا"
              value={origin}
              autoComplete="off"
              enterKeyHint="search"
              onChange={({ target }) => {
                setOrigin(target.value);
                setOriginId(0);
                setGeoHint("");
                setFocus("o");
                setAutofill(true);
                setSheetOpen(true);
              }}
              onFocus={() => {
                setFocus("o");
                setAutofill(true);
                setSheetOpen(true);
              }}
            />
            <button
              type="button"
              className={`originLocateBtn${locating ? " isLoading" : ""}`}
              onClick={useNearestOrigin}
              disabled={locating}
              title="نزدیک‌ترین ایستگاه به موقعیت فعلی"
              aria-label="نزدیک‌ترین ایستگاه به موقعیت فعلی"
            >
              {locating ? (
                <span className="originLocateSpinner" aria-hidden="true" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="7.5" />
                  <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5" />
                </svg>
              )}
            </button>
          </div>
          <div className="searchInput">
            <b style={{ borderColor: "red" }} />
            <input
              id="d"
              placeholder="ایستگاه مقصد"
              value={destination}
              autoComplete="off"
              enterKeyHint="search"
              onChange={({ target }) => {
                setDestination(target.value);
                setDestinationId(0);
                setFocus("d");
                setAutofill(true);
                setSheetOpen(true);
              }}
              onFocus={() => {
                setFocus("d");
                setAutofill(true);
                setSheetOpen(true);
              }}
            />
          </div>
        </div>

        {awaitingOrigin ? (
          <div className="originAssist" role="status">
            <p>
              مقصد <strong>{destination}</strong> ثبت شد. مبدا را مشخص کنید:
            </p>
            <div className="originAssistActions">
              <button
                type="button"
                className="originAssistPrimary"
                onClick={useNearestOrigin}
                disabled={locating}
              >
                {locating ? "در حال یافتن موقعیت…" : "نزدیک‌ترین ایستگاه به من"}
              </button>
              <button
                type="button"
                className="originAssistSecondary"
                onClick={pickOriginManually}
                disabled={locating}
              >
                انتخاب دستی
              </button>
            </div>
            {geoHint ? (
              <span className="originAssistHint isError">{geoHint}</span>
            ) : null}
          </div>
        ) : null}

        {geoHint && !awaitingOrigin ? (
          <div className="originAssist" role="status">
            <span className="originAssistHint isError">{geoHint}</span>
          </div>
        ) : null}
      </div>

      <div className="sheetBody">
        <div className="sheetBodyInner">
          <div className={`suggestPanel ${autofill ? "isOpen" : ""}`}>
            <div className="suggestPanelInner">
              <div className={`autofill ${autofill ? "active" : ""}`}>
                {autofills.map((fill) => (
                  <strong
                    key={fill.id}
                    onClick={() => {
                      if (!focus) return;
                      const label = stationLabel(fill);
                      if (focus === "o") {
                        setOrigin(label);
                        setOriginId(fill.id);
                        setAwaitingOrigin(false);
                        setGeoHint("");
                      } else {
                        setDestination(label);
                        setDestinationId(fill.id);
                      }
                      setAutofill(false);
                    }}
                  >
                    <span>
                      {stationLabel(fill)}
                      <small>{fill.name}</small>
                    </span>
                    <div className="lines">
                      {fill.lines.map((line) => (
                        <b key={line.id} style={{ backgroundColor: line.color }}>
                          {line.label}
                        </b>
                      ))}
                    </div>
                  </strong>
                ))}
              </div>
            </div>
          </div>

          <div className={`mainPanel ${autofill ? "" : "isOpen"}`}>
            <div className="mainPanelInner">
              <div className="sidebarPanel">
                {showRoute ? (
                  <div className="inquiry">
                    <div className="panelTitle">
                      <strong>مسیر پیشنهادی</strong>
                      <button
                        type="button"
                        className="clearRoute"
                        onClick={clearRoute}
                      >
                        پاک کردن
                      </button>
                    </div>

                    {routeStats.arrivalClock || way.length > 0 ? (
                      <div className="routeSummary" aria-live="polite">
                        <div className="routeSummaryEta">
                          <span className="routeSummaryLabel">
                            رسیدن تقریبی
                          </span>
                          <strong className="routeSummaryClock">
                            {routeStats.arrivalClock || "—"}
                          </strong>
                          {routeStats.durationMinutes > 0 ? (
                            <span className="routeSummaryDuration">
                              {formatDurationFa(routeStats.durationMinutes)}
                            </span>
                          ) : null}
                          {routeStats.initialWaitMinutes >= 1 ? (
                            <p className="routeSummaryWait">
                              قطار اول حدود{" "}
                              {toPersianDigits(
                                Math.round(routeStats.initialWaitMinutes)
                              )}{" "}
                              دقیقه دیگر
                            </p>
                          ) : null}
                        </div>

                        <div className="routeSummaryStats">
                          <div className="routeSummaryStat">
                            <b>{toPersianDigits(way.length)}</b>
                            <span>ایستگاه</span>
                          </div>
                          <div className="routeSummaryStat">
                            <b>
                              {toPersianDigits(
                                routeStats.distanceKm < 10
                                  ? routeStats.distanceKm.toFixed(1)
                                  : Math.round(routeStats.distanceKm)
                              )}
                            </b>
                            <span>کیلومتر</span>
                          </div>
                          <div className="routeSummaryStat">
                            <b>{toPersianDigits(routeStats.transferCount)}</b>
                            <span>
                              {routeStats.transferCount === 0
                                ? "بدون تعویض"
                                : "تعویض خط"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="routeList">
                      {intermediateStopCount > 0 ? (
                        <button
                          type="button"
                          className="routeStopsToggle"
                          aria-expanded={allStopsVisible}
                          onClick={() =>
                            setAllStopsVisible((isVisible) => !isVisible)
                          }
                        >
                          <span>
                            {allStopsVisible
                              ? "نمایش خلاصه مسیر"
                              : `نمایش ${toPersianDigits(
                                  intermediateStopCount
                                )} ایستگاه بین راه`}
                          </span>
                          <svg
                            className={`routeStopsChevron${
                              allStopsVisible ? " isOpen" : ""
                            }`}
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.25"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      ) : null}

                      {displayedRouteSteps.map((step) => (
                        <div
                          key={`${step.station.id}-${step.index}`}
                          className={[
                            "routeStep",
                            !allStopsVisible && !step.isStart && !step.isEnd
                              ? "routeStepKey"
                              : "",
                            step.isStart ? "start" : "",
                            step.isEnd ? "end" : "",
                            step.isTransfer ? "transfer" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div
                            className="routeRail"
                            style={
                              {
                                "--route-color": step.segmentColor,
                              } as CSSProperties
                            }
                          >
                            <i />
                          </div>
                          <div className="routeContent">
                            <strong>{stationLabel(step.station)}</strong>
                            {step.isStart ? <em>مبدا</em> : null}
                            {step.isEnd ? <em>مقصد</em> : null}
                            {step.isTransfer && !step.isStart && !step.isEnd ? (
                              <em>تعویض خط</em>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="lineList">
                    <strong className="panelHeading">خطوط مترو</strong>
                    {lines.map((line) => {
                      const start = line.stations[0];
                      const end = line.stations.at(-1);
                      const route =
                        start && end
                          ? `${stationLabel(start)} ← ${stationLabel(end)}`
                          : "";

                      return (
                        <button
                          type="button"
                          key={line.id}
                          className={focusedLine === line.id ? "active" : ""}
                          onClick={() => onFocusLine(line.id)}
                        >
                          <b style={{ backgroundColor: line.color }} />
                          <span>
                            <em>{line.title}</em>
                            {route ? <small>{route}</small> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
