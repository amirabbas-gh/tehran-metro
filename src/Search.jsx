import { useCallback, useEffect, useMemo, useState } from "react";

function stationLabel(station) {
  return station?.translations?.fa || station?.name || "";
}

function buildRouteGraph(lines) {
  const stationsById = new Map();

  lines.forEach((line) => {
    line.stations.forEach((station) => {
      if (!stationsById.has(station.id)) {
        stationsById.set(station.id, {
          ...station,
          neighbors: new Set(),
        });
      }
    });
  });

  lines.forEach((line) => {
    const ordered = [...line.stations].sort(
      (a, b) => a.line.serial_number - b.line.serial_number
    );

    for (let i = 0; i < ordered.length - 1; i++) {
      const current = stationsById.get(ordered[i].id);
      const next = stationsById.get(ordered[i + 1].id);
      current.neighbors.add(next.id);
      next.neighbors.add(current.id);
    }
  });

  return stationsById;
}

function findShortestPath(stationsById, originId, destinationId) {
  if (!stationsById.has(originId) || !stationsById.has(destinationId)) {
    return [];
  }

  if (originId === destinationId) {
    return [stationsById.get(originId)];
  }

  const queue = [originId];
  const seen = new Set([originId]);
  const parent = new Map([[originId, null]]);

  while (queue.length) {
    const currentId = queue.shift();
    const current = stationsById.get(currentId);

    for (const neighborId of current.neighbors) {
      if (seen.has(neighborId)) continue;
      seen.add(neighborId);
      parent.set(neighborId, currentId);

      if (neighborId === destinationId) {
        const path = [];
        let cursor = destinationId;
        while (cursor !== null) {
          path.push(stationsById.get(cursor));
          cursor = parent.get(cursor);
        }
        return path.reverse();
      }

      queue.push(neighborId);
    }
  }

  return [];
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

  const stationsById = useMemo(() => buildRouteGraph(lines), [lines]);

  const angle2Radian = (angle) => (angle * Math.PI) / 180;

  const calculateDistance = (lon1, lat1, lon2, lat2) => {
    const radLon1 = angle2Radian(lon1);
    const radLat1 = angle2Radian(lat1);
    const radLon2 = angle2Radian(lon2);
    const radLat2 = angle2Radian(lat2);
    const a = radLat1 - radLat2;
    const b = radLon1 - radLon2;

    return (
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(a / 2) * Math.sin(a / 2) +
            Math.cos(radLat1) *
              Math.cos(radLat2) *
              Math.sin(b / 2) *
              Math.sin(b / 2)
        )
      ) *
      6378.137
    );
  };

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

  const fillAutoFill = useCallback(
    (searchedText) => {
      const matches = new Map();
      const query = searchedText.trim().toLowerCase();

      lines.forEach((line) => {
        line.stations.forEach((station) => {
          const persianName = station.translations?.fa || "";
          if (
            station.name.toLowerCase().includes(query) ||
            persianName.includes(searchedText.trim())
          ) {
            matches.set(station.id, {
              ...station,
              lines: station.lines.map((stationLine) => ({
                ...stationLine,
                color:
                  lines.find((item) => item.id === stationLine.id)?.color ||
                  "#999",
              })),
            });
          }
        });
      });

      setAutofills([...matches.values()]);
    },
    [lines]
  );

  useEffect(() => {
    fillAutoFill(origin);
  }, [origin, fillAutoFill]);

  useEffect(() => {
    fillAutoFill(destination);
  }, [destination, fillAutoFill]);

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

    const path = findShortestPath(stationsById, originId, destinationId);
    setWay(path);
    onRouteChange?.(path.map((station) => station.id));
  }, [originId, destinationId, stationsById, onRouteChange]);

  const uniqueStations = useMemo(
    () => [...stationsById.values()],
    [stationsById]
  );

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

  return (
    <div className="searchForm">
      <div className="searchHeader">
        <strong>مسیریابی</strong>
        <span>مبدا و مقصد را برای نمایش کوتاه‌ترین مسیر انتخاب کنید.</span>
      </div>

      <div className="searchInputs">
        <div className="searchInput">
          <b style={{ borderColor: "green" }} />
          <input
            id="o"
            placeholder="ایستگاه مبدا"
            value={origin}
            onChange={({ target }) => {
              setOrigin(target.value);
              setOriginId(0);
            }}
            onFocus={() => {
              setFocus("o");
              setAutofill(true);
            }}
          />
        </div>
        <div className="searchInput">
          <b style={{ borderColor: "red" }} />
          <input
            id="d"
            placeholder="ایستگاه مقصد"
            value={destination}
            onChange={({ target }) => {
              setDestination(target.value);
              setDestinationId(0);
            }}
            onFocus={() => {
              setFocus("d");
              setAutofill(true);
            }}
          />
        </div>
      </div>

      <div className={`autofill ${autofill ? "active" : ""}`}>
        <strong
          onClick={() => {
            if (!focus) return;
            navigator.geolocation.getCurrentPosition(
              (addr) => {
                const nearest = [...uniqueStations]
                  .map((station) => ({
                    station,
                    dis: calculateDistance(
                      station.longtitude,
                      station.latitude,
                      addr.coords.longitude,
                      addr.coords.latitude
                    ),
                  }))
                  .sort((a, b) => a.dis - b.dis)[0];

                if (!nearest) return;
                const label = stationLabel(nearest.station);
                if (focus === "o") {
                  setOrigin(label);
                  setOriginId(nearest.station.id);
                } else {
                  setDestination(label);
                  setDestinationId(nearest.station.id);
                }
                setAutofill(false);
              },
              (err) => console.log(err),
              { enableHighAccuracy: true }
            );
          }}
        >
          استفاده از موقعیت فعلی
        </strong>

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

      <div className="sidebarPanel">
        {showRoute ? (
          <div className="inquiry">
            <div className="panelTitle">
              <strong>مسیر پیشنهادی</strong>
              <button type="button" className="clearRoute" onClick={clearRoute}>
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
  );
};

export default Search;
