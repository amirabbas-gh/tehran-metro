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

/** Weighted shortest path from Dijkstra (distance + transfer / wait times). */
export type WeightedPathResult = {
  path: GraphStation[];
  /** Sum of haversine edge lengths along the path (km). */
  distanceKm: number;
  /** Number of line changes along the path. */
  transferCount: number;
  /**
   * Total Dijkstra cost.
   * With schedules: arrival minutes from midnight.
   * Without schedules (legacy): distanceKm + transfer km-penalties.
   */
  cost: number;
  /** Door-to-door duration in minutes (includes waits), when time-aware. */
  durationMinutes?: number;
  /** Clock time of arrival at destination (HH:mm), when time-aware. */
  arrivalClock?: string;
  /** Wait at origin before first boarding (minutes), when time-aware. */
  initialWaitMinutes?: number;
};

export type DijkstraOptions = {
  /** Extra cost (km-equivalent) when schedules are disabled. */
  transferPenaltyKm?: number;
  /**
   * Device / journey start time. Defaults to now when schedules are enabled.
   * Official headways drive boarding / transfer waits.
   */
  departureTime?: Date;
  /** Override day-type detection (tests). */
  dayType?: DayType;
  /** When false, use legacy km + transfer-penalty costs. Default true. */
  useSchedule?: boolean;
};

/** Official headway day categories from metro.tehran.ir. */
export type DayType = "weekday" | "thursday" | "friday";

export type TravelDirection = "ascending" | "descending";

export type HeadwayPeriod = {
  from: string;
  to: string;
  headwayMinutes: number;
};

export type ScheduleDirection = {
  originLabel: string;
  weekday: HeadwayPeriod[];
  thursday: HeadwayPeriod[];
  friday: HeadwayPeriod[];
};

export type LineSchedule = {
  officialLine: number;
  name: string;
  startTime: string;
  endTime: string;
  fridayStartTime?: string;
  directions: Record<TravelDirection, ScheduleDirection>;
};

export type SchedulesFile = {
  source: string;
  sourceNote?: string;
  avgHopMinutes: number;
  transferWalkMinutes: number;
  dayTypes: Record<DayType, string>;
  lines: Record<string, LineSchedule>;
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
  lines: Array<StationLineMembership & { color: string; label: string }>;
};

export type MapBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};
