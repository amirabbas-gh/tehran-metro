import { useEffect, useState } from "react";

const Search = ({ lines }) => {
  const [origin, setOrigin] = useState(""),
    [destination, setDestination] = useState(""),
    [autofills, setAutofills] = useState([]),
    [autofill, setAutofill] = useState(false),
    [originId, setOriginId] = useState(0),
    [destinationId, setDestinationId] = useState(0),
    [focus, setFocus] = useState(false),
    [way, setWay] = useState([]);

  const angle2Radian = (angle) => {
    return (angle * Math.PI) / 180;
  };

  const calculateDistance = (lon1, lat1, lon2, lat2) => {
    const radLon1 = angle2Radian(lon1);
    const radLat1 = angle2Radian(lat1);
    const radLon2 = angle2Radian(lon2);
    const radLat2 = angle2Radian(lat2);

    const a = radLat1 - radLat2;
    const b = radLon1 - radLon2;

    const distance =
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
      6378.137;

    return distance;
  };

  useEffect(() => {
    document.querySelector("html").onclick = () => {
      if (!document.querySelector("input:focus")) {
        setAutofill(false);
        setFocus(false);
      }
    };
  }, []);

  const fillAutoFill = (searchedText) => {
    let stations = [];
    lines.forEach((line) => {
      line.stations.forEach((s) => {
        if (s.name.toLowerCase().includes(searchedText.toLowerCase())) {
          s.lines = s.lines.map((line) => {
            line.color = lines.filter((l) => l.id == line.id)[0].color;
            return line;
          });
          stations.push(s);
        }
      });
    });
    setAutofills(stations);
  };

  useEffect(() => {
    fillAutoFill(origin);
  }, [origin]);

  useEffect(() => {
    fillAutoFill(destination);
  }, [destination]);

  const move = (a, b) => {
    let stations = [].concat(...lines.map((l) => l.stations));

    const aIndex = stations.indexOf(stations.filter((s) => s.id == a)[0]),
      bIndex = stations.indexOf(stations.filter((s) => s.id == b)[0]);
    let points = stations.length;
    let adjacents = new Array(points).fill([]),
      distances = new Array(points).fill(Number.POSITIVE_INFINITY),
      ways = new Array(points).fill([]),
      seen = new Array(points).fill(false);
    stations.forEach((station, index) => {
      station.lines.forEach((line) => {
        let front = stations.indexOf(
          stations.filter(
            (s) =>
              s.lines.filter(
                (l) =>
                  l.serial_number == line.serial_number + 1 && l.id == line.id
              ).length
          )[0]
        );
        if (front > 0) {
          if (!adjacents[index].includes(front))
            adjacents[index] = adjacents[index].concat([front]);
          if (!adjacents[front].includes(index))
            adjacents[front] = adjacents[front].concat([index]);
        }
      });
    });
    distances[aIndex] = 0;
    seen[aIndex] = true;
    let letsSee = [];
    letsSee.push(aIndex);
    while (letsSee.length) {
      let s = letsSee[0];
      letsSee.shift();
      adjacents[s].forEach((a) => {
        if (!seen[a]) {
          seen[a] = true;
          ways[a] = ways[s].concat(a);
          distances[a] = distances[s] + 1;
          letsSee.push(a);
        }
      });
    }
    let way = [stations.filter((_, index) => index == aIndex)[0]];
    ways[bIndex].forEach((i) => {
      let station = stations.filter((_, index) => i == index)[0];
      way.push(station);
    });
    document.querySelector("path").style.strokeOpacity = 0;
    setWay(way);
  };

  useEffect(() => {
    if (originId && destinationId) {
      move(originId, destinationId);
    }
  }, [originId, destinationId]);

  useEffect(() => {
    if (way.length) {
      let pathes = Array.from(document.querySelectorAll(`path`));
      pathes.forEach((path) => {
        if (way.map((w) => `station${w.id}`).includes(path.className.baseVal)) {
          path.style.opacity = 1;
          return (path.style.strokeOpacity = 1);
        }
        path.style.strokeOpacity = 0.2;
        path.style.opacity = 0.2;
      });
      let circles = Array.from(document.querySelectorAll(`.circle`));
      circles.forEach((circle) => {
        if (
          way
            .map(
              (w) =>
                `station${w.id} circle ${w.intersection ? "intersection" : ""}`
            )
            .includes(circle.className)
        ) {
          return (circle.style.opacity = 1);
        }
        circle.style.opacity = 0.2;
      });
    }
  }, [way]);

  return (
    <div className="searchForm">
      <div className="searchInputs">
        <div className="searchInput">
          <b style={{ borderColor: "green" }}></b>
          <input
            id="o"
            placeholder="Origin"
            value={origin}
            onChange={({ target }) => {
              setOrigin(target.value);
            }}
            onFocus={() => {
              setFocus("o");
              setAutofill(true);
            }}
          />
        </div>
        <div className="searchInput">
          <b style={{ borderColor: "red" }}></b>
          <input
            id="d"
            placeholder="Destination"
            value={destination}
            onChange={({ target }) => {
              setDestination(target.value);
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
            let focusCopy = focus;
            if (focusCopy) {
              let stations = [].concat(...lines.map((l) => l.stations));
              navigator.geolocation.getCurrentPosition(
                (addr) => {
                  let near = [];
                  let coords = addr.coords;
                  stations.forEach((station) => {
                    near.push({
                      dis: calculateDistance(
                        station.longtitude,
                        station.latitude,
                        coords.longitude,
                        coords.latitude
                      ),
                      station,
                    });
                  });
                  near.sort((a, b) => a.dis - b.dis);
                  if (focusCopy == "o") {
                    setOrigin(near[0].station.name);
                    setOriginId(near[0].station.id);
                  } else if (focusCopy == "d") {
                    setDestination(near.station.name);
                    setDestinationId(near.station.id);
                  }
                },
                (err) => {
                  console.log(err);
                },
                { enableHighAccuracy: true }
              );
            }
          }}
        >
          Use your current location{" "}
        </strong>
        {autofills.map((fill) => (
          <strong
            onClick={() => {
              if (focus) {
                if (focus == "o") {
                  setOrigin(fill.name);
                  setOriginId(fill.id);
                } else if (focus == "d") {
                  setDestination(fill.name);
                  setDestinationId(fill.id);
                }
              }
            }}
          >
            {fill.name}{" "}
            <div className="lines">
              {fill.lines.map((line) => (
                <b style={{ backgroundColor: line.color }}>
                  {line.serial_number}
                </b>
              ))}
            </div>
          </strong>
        ))}
      </div>
      <div className="inquiry">
        <strong>Transfer Inquiry</strong>
        {way.map((station, index) => (
          <span
            className={station.intersection ? "intersection" : ""}
            style={{ borderColor: station.line.color }}
          >
            {index == 0 || way.length - 1 == index || station.intersection ? (
              <b
                style={{
                  borderColor:
                    index == 0 || way.length - 1 == index
                      ? station.line.color
                      : "",
                }}
              ></b>
            ) : (
              ""
            )}
            {station.name}
          </span>
        ))}
      </div>
    </div>
  );
};

export default Search;
