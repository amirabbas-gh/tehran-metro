/** Membership of a station on a metro line (from stations.json). */
export type StationLineMembership = {
  id: number;
  serial_number: number;
};

/** Raw station record from stations.json. Note: source data uses `longtitude`. */
export type RawStation = {
  id: number;
  name: string;
  translations: { fa: string };
  longtitude: number;
  latitude: number;
  disabled: boolean;
  lines: StationLineMembership[];
};

/** Raw line record from lines.json. */
export type RawLine = {
  id: number;
  name: string;
  color: string;
  start_time: string;
  end_time: string;
};

/** Station projected onto the map SVG, before timing_lines enrichment. */
export type StationOnLine = RawStation & {
  x: number;
  y: number;
  intersection: boolean;
  line: StationLineMembership & { color: string };
};

/** Line with projected stations (used inside timing_lines references). */
export type LineWithStations = RawLine & {
  title: string;
  stations: StationOnLine[];
};

/** Line membership enriched with schedule endpoints for the station card. */
export type TimingLine = StationLineMembership & {
  data: LineWithStations;
  start: { data: StationOnLine };
  end: { data: StationOnLine };
};

/** Fully enriched station used across the map and search UI. */
export type EnrichedStation = StationOnLine & {
  timing_lines: TimingLine[];
};

/** Fully enriched line used across the map and search UI. */
export type EnrichedLine = RawLine & {
  title: string;
  stations: EnrichedStation[];
};

/** Station node in the adjacency-list graph. */
export type GraphStation = EnrichedStation & {
  neighbors: Set<number>;
};

export type MetroGraph = Map<number, GraphStation>;

export type PathFindResult = {
  path: GraphStation[];
  treeEdges: Array<[number, number]>;
  visited: Set<number>;
};

/** Weighted shortest path from Dijkstra (distance + transfer penalties). */
export type WeightedPathResult = {
  path: GraphStation[];
  /** Sum of haversine edge lengths along the path (km), excluding transfer penalties. */
  distanceKm: number;
  /** Number of line changes along the path. */
  transferCount: number;
  /** Total Dijkstra cost (distanceKm + transfer penalties). */
  cost: number;
};

export type DijkstraOptions = {
  /** Extra cost (km-equivalent) applied each time the rider changes lines. */
  transferPenaltyKm?: number;
};

export type ConnectivityInfo = {
  connected: boolean;
  componentCount: number;
  n: number;
  e: number;
};

export type RouteStep = {
  station: GraphStation;
  index: number;
  segmentColor: string;
  isStart: boolean;
  isEnd: boolean;
  isTransfer: boolean;
};

export type GoRequest = {
  destinationId: number;
  token: number;
};

export type Theme = "light" | "dark";

export type StationCardUi = "closed" | "open" | "leaving";

export type InstallUi = "banner" | "leaving" | "chip";

export type SearchFocus = false | "o" | "d";

export type AutofillStation = Omit<EnrichedStation, "lines"> & {
  lines: Array<StationLineMembership & { color: string }>;
};

export type MapBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};
