import { useCallback, useEffect, useMemo, useState } from "react";
import { bfsFindPath, buildAdjacencyList } from "./graph";

function stationLabel(station) {
  return station?.translations?.fa || station?.name || "";
}

function withLineColors(station, lines) {
  return {
    ...station,
    lines: station.lines.map((stationLine) => ({
      ...stationLine,
      color: lines.find((item) => item.id === stationLine.id)?.color || "#999",
    })),
  };
}

const Search = ({ lines, focusedLine, onFocusLine, onRouteChange }) => {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [autofills, setAutofills] = useState([]);
  const [autofill, setAutofill] = useState(false);
  const [originId, setOriginId] = useState(0);
  const [destinationId, setDestinationId] = useState(0);
  const [focus, setFocus] = useState(false);
  const [way, setWay] = useState([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const stationsById = useMemo(() => buildAdjacencyList(lines), [lines]);

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

  const fillAutoFill = useCallback(
    (searchedText, selectedId = 0) => {
      const selected = selectedId ? stationsById.get(selectedId) : null;
      const raw = searchedText.trim();
      const query =
        selected && stationLabel(selected) === raw ? "" : raw.toLowerCase();
      const persianQuery = query ? raw : "";
      const matches = new Map();

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
    onRouteChange?.([]);
  }, [onRouteChange]);

  useEffect(() => {
    if (!originId || !destinationId) {
      setWay([]);
      onRouteChange?.([]);
      return;
    }

    const path = bfsFindPath(stationsById, originId, destinationId);
    setWay(path);
    onRouteChange?.(path.map((station) => station.id));
  }, [originId, destinationId, stationsById, onRouteChange]);

  const showRoute = way.length > 0;

  const routeSteps = useMemo(() => {
    if (!way.length) return [];

    const edgeLine = (from, to) =>
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
      const incoming = previous ? edgeLine(previous, station) : null;
      const outgoing = next ? edgeLine(station, next) : null;
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
              placeholder="ایستگاه مبدا"
              value={origin}
              autoComplete="off"
              enterKeyHint="search"
            onChange={({ target }) => {
              setOrigin(target.value);
              setOriginId(0);
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
                          {line.id}
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

                    <div className="routeMeta">
                      <span>{way.length} ایستگاه</span>
                    </div>

                    <div className="routeList">
                      {routeSteps.map((step) => (
                        <div
                          key={`${step.station.id}-${step.index}`}
                          className={[
                            "routeStep",
                            step.isStart ? "start" : "",
                            step.isEnd ? "end" : "",
                            step.isTransfer ? "transfer" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div
                            className="routeRail"
                            style={{ "--route-color": step.segmentColor }}
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
};

export default Search;
