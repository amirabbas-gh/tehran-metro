import { toPersianDigits } from "./format";
import type {
  EnrichedLine,
  EnrichedStation,
  MapBounds,
  RawLine,
  RawStation,
  StationOnLine,
  TimingLine,
} from "../types/metro";

export const BASE_SCALE = 1100;

/** Raw ASCII line number extracted from the English source name (e.g. "1"). */
export function lineNumber(line: Pick<RawLine, "name">): string {
  const match = String(line.name).match(/Line\s+(\d+)/i);
  return match?.[1] ?? "";
}

export function lineTitle(line: Pick<RawLine, "name">): string {
  const number = lineNumber(line);
  if (!number) return line.name;
  const localizedNumber = toPersianDigits(number);
  return /Branch/i.test(line.name)
    ? `خط ${localizedNumber} (شاخه)`
    : `خط ${localizedNumber}`;
}

export function computeBounds(stations: RawStation[]): MapBounds {
  return {
    minLatitude: Math.min(...stations.map((station) => station.latitude)),
    maxLatitude: Math.max(...stations.map((station) => station.latitude)),
    minLongitude: Math.min(...stations.map((station) => station.longtitude)),
    maxLongitude: Math.max(...stations.map((station) => station.longtitude)),
  };
}

export function enrichMetroData(
  stations: RawStation[],
  lines: RawLine[],
  bounds: MapBounds
): EnrichedLine[] {
  const nextLines = lines.map((line) => {
    const lineStations: StationOnLine[] = stations
      .filter((station) =>
        station.lines.some((stationLine) => stationLine.id === line.id)
      )
      .map((station) => {
        const stationLine = station.lines.find((item) => item.id === line.id);
        if (!stationLine) {
          throw new Error(`Station ${station.id} missing line ${line.id}`);
        }

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

  return nextLines.map((line) => ({
    ...line,
    stations: line.stations.map((station): EnrichedStation => {
      const timing_lines = station.lines
        .map((stationLine): TimingLine | null => {
          const lineData = nextLines.find((item) => item.id === stationLine.id);
          if (!lineData) return null;
          const start = lineData.stations[0];
          const end = lineData.stations.at(-1);
          if (!start || !end) return null;

          return {
            ...stationLine,
            data: lineData,
            start: { data: start },
            end: { data: end },
          };
        })
        .filter((item): item is TimingLine => item !== null);

      return {
        ...station,
        timing_lines,
      };
    }),
  }));
}
