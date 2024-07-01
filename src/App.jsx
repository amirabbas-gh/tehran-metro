import { useEffect, useRef, useState } from "react";
import "./assets/style.css";
import Stations from "./assets/data/stations.json";
import Lines from "./assets/data/lines.json";
import Search from "./Search";

function App() {
  const map = useRef();
  const [points, setPoints] = useState(0),
    [lines, setLines] = useState([]),
    [min, setMin] = useState({ longtitude: 0, latitude: 0 }),
    [max, setMax] = useState({ longtitude: 0, latitude: 0 }),
    [scale, setScale] = useState(3000);

  useEffect(() => {
    // set minimum numbers
    let minLat = Math.min(...Stations.map((s) => s.latitude)),
      minLon = Math.min(...Stations.map((s) => s.longtitude));
    setMin({ latitude: minLat, longtitude: minLon });
    // set maximum numbers
    let maxLat = Math.max(...Stations.map((s) => s.latitude)),
      maxLon = Math.max(...Stations.map((s) => s.longtitude));
    setMax({ latitude: maxLat, longtitude: maxLon });

    // out click for indicator
    onclick = ({ target }) => {
      if (
        document.querySelector(".circle.active") &&
        target != document.querySelector(".circle.active")
      ) {
        document.querySelector(".circle.active").classList.remove("active");
      }
      let indicators = Array.from(
        document.querySelectorAll(".indicator > strong")
      );
      let find = false;
      for (let i of indicators) {
        if (!find) find = i.contains(target);
      }
      if (!find) {
        map.current.className = "";
      }
    };
  }, []);

  useEffect(() => {
    // set width and height
    let width = (max.longtitude - min.longtitude) * scale + 70,
      height = (max.latitude - min.latitude) * scale + 30;
    map.current.style.width = width + "px";
    map.current.style.height = height + "px";
    let nLines = [],
      points = 0;
    Lines.forEach((line) => {
      let newLine = line;
      newLine.stations = Stations.filter((s) =>
        s.lines.map((line) => line.id).includes(line.id)
      );
      newLine.stations = newLine.stations.map((station) => {
        station.x = (station.longtitude - min.longtitude) * scale + 8;
        station.y = (station.latitude - min.latitude) * scale + 8;
        station.intersection = station.lines.length > 1 ? true : false;
        points++;
        station.line = station.lines.filter((l) => l.id == line.id)[0];
        return station;
      });
      newLine.stations.sort(
        (a, b) => a.line.serial_number - b.line.serial_number
      );
      nLines.push(newLine);
    });
    nLines = nLines.map((line) => {
      line.stations = line.stations.map((station) => {
        station.timing_lines = station.lines.map((line) => {
          let newLine = nLines.filter((l) => l.id == line.id)[0];
          let data = Lines.filter((l) => l.id == line.id)[0];
          if (typeof data != "undefined") {
            let lastMove =
              new Date(`01-01-2024 ${data.end_time}`).getTime() -
              1000 * 60 * (newLine.stations.length - 1) * 3;
            let startFirst = new Date(
                new Date(`01-01-2024 ${data.start_time}`).getTime() +
                  1000 * 60 * 3 * (line.serial_number - 1)
              ),
              startLast = new Date(
                lastMove + 1000 * 60 * 3 * (line.serial_number - 1)
              );
            line.start = {
              first: startFirst.getHours() + ":" + startFirst.getMinutes(),
              last: startLast.getHours() + ":" + startLast.getMinutes(),
              data: newLine.stations[0],
            };

            let endLast = new Date(
                lastMove +
                  1000 * 60 * 3 * (newLine.stations.length - line.serial_number)
              ),
              endFirst = new Date(
                new Date(`01-01-2024 ${data.start_time}`).getTime() +
                  1000 *
                    60 *
                    3 *
                    (newLine.stations.length - line.serial_number - 1)
              );
            line.end = {
              first: endFirst.getHours() + ":" + endFirst.getMinutes(),
              last: endLast.getHours() + ":" + endLast.getMinutes(),
              data: newLine.stations[newLine.stations.length - 1],
            };
          }
          line.data = data;
          return line;
        });
        return station;
      });
      return line;
    });
    setPoints(points);
    setLines([...nLines]);
  }, [scale, min, max]);

  return (
    <>
      <Search lines={lines} />
      <div id="map" ref={map}>
        <div className="indicator">
          {lines.map((line) => (
            <strong
              onClick={() => {
                map.current.className = `focus${line.id}`;
              }}
            >
              <b style={{ backgroundColor: line.color }}></b>
              {line.name}
            </strong>
          ))}
        </div>
        <svg>
          {lines.map((line) =>
            line.stations.map((station, index) => (
              <path
                id={`path${line.id}`}
                className={`station${station.id}`}
                d={`M${index > 0 ? line.stations[index - 1].x : station.x} ${
                  index > 0 ? line.stations[index - 1].y : station.y
                } L${station.x} ${station.y}`}
                strokeWidth={5}
                style={{ fill: "none", stroke: line.color }}
              ></path>
            ))
          )}
        </svg>
        {lines.map((line, i) =>
          line.stations.map((station, i2) => (
            <div
              id={`path${line.id}`}
              style={{
                left: station.x,
                top: station.y,
                backgroundColor: "#fff",
                borderColor: station.intersection ? "#000" : line.color,
              }}
              className={`station${station.id} circle ${
                station.intersection ? "intersection" : ""
              }`}
              onClick={({ currentTarget }) => {
                Array.from(document.querySelectorAll(".circle.active")).map(
                  (c) => c.classList.remove("active")
                );
                currentTarget.classList.add("active");
              }}
            >
              <span>{station.name}</span>
              <div className="dataBox">
                <div className="title">
                  <span>{station.name}</span>
                  <span>More details {`>>`}</span>
                </div>
                <div className={`lines`}>
                  {station.timing_lines.map((l) => (
                    <div>
                      <span className="h" style={{ borderColor: l.data.color }}>
                        <b style={{ backgroundColor: l.data.color }}>
                          {l.data.name}
                        </b>
                      </span>
                      <strong>
                        <span>{l.start.data.name}</span>
                        <p>
                          <i>First:</i>
                          {l.start.first}
                          <i>Last:</i>
                          {l.start.last}
                        </p>
                      </strong>
                      <strong>
                        <span>{l.end.data.name}</span>
                        <p>
                          <i>First:</i>
                          {l.end.first}
                          <i>Last:</i>
                          {l.end.last}
                        </p>
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export default App;
