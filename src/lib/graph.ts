import type {
  ConnectivityInfo,
  DijkstraOptions,
  EnrichedLine,
  GraphStation,
  MetroGraph,
  PathFindResult,
  WeightedPathResult,
} from "../types/metro";
import { haversineKm, stationLongitude } from "./geo";

/**
 * Discrete Mathematics — Tehran Metro as G = (V, E)
 *
 * V = metro stations, E = undirected rail links between consecutive stations.
 * Representation: adjacency list (optimal for a sparse transit network:
 * space Θ(n + e) vs Θ(n²) for an adjacency matrix).
 *
 * Routing uses a weighted graph: edge weight = geographic distance (km).
 * Line changes add a transfer penalty, so Dijkstra prefers fewer transfers
 * unless the detour is significantly longer.
 */

/** Default transfer cost ≈ a few inter-station hops (km-equivalent). */
export const DEFAULT_TRANSFER_PENALTY_KM = 3;

type DijkstraState = {
  stationId: number;
  /** Line used to arrive here; 0 = start (no incoming line yet). */
  lineId: number;
  cost: number;
};

function stateKey(stationId: number, lineId: number): number {
  // lineId ∈ [0, 9] for Tehran metro; pack into a single integer key.
  return stationId * 16 + lineId;
}

function unpackState(key: number): { stationId: number; lineId: number } {
  return { stationId: Math.floor(key / 16), lineId: key % 16 };
}

/** Binary min-heap priority queue for Dijkstra. */
class MinHeap {
  private readonly items: DijkstraState[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: DijkstraState): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): DijkstraState | undefined {
    if (!this.items.length) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length && last) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[i].cost >= this.items[parent].cost) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  private bubbleDown(index: number): void {
    let i = index;
    const n = this.items.length;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.items[left].cost < this.items[smallest].cost) {
        smallest = left;
      }
      if (right < n && this.items[right].cost < this.items[smallest].cost) {
        smallest = right;
      }
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [
        this.items[smallest],
        this.items[i],
      ];
      i = smallest;
    }
  }
}

/** Lines on which `from` and `to` are consecutive stations. */
function connectingLineIds(
  from: GraphStation,
  to: GraphStation
): number[] {
  const ids: number[] = [];
  for (const line of from.lines) {
    for (const other of to.lines) {
      if (
        line.id === other.id &&
        Math.abs(line.serial_number - other.serial_number) === 1
      ) {
        ids.push(line.id);
      }
    }
  }
  return ids;
}

function edgeDistanceKm(from: GraphStation, to: GraphStation): number {
  const lon1 = stationLongitude(from);
  const lon2 = stationLongitude(to);
  if (
    from.latitude == null ||
    to.latitude == null ||
    lon1 == null ||
    lon2 == null
  ) {
    return 1;
  }
  return haversineKm(from.latitude, lon1, to.latitude, lon2);
}

/**
 * Build an undirected adjacency-list graph from ordered line station sequences.
 * Each consecutive pair on a line becomes a bidirectional edge.
 */
export function buildAdjacencyList(lines: EnrichedLine[]): MetroGraph {
  const stationsById: MetroGraph = new Map();

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
      const u = stationsById.get(ordered[i].id);
      const v = stationsById.get(ordered[i + 1].id);
      if (!u || !v) continue;
      u.neighbors.add(v.id);
      v.neighbors.add(u.id);
    }
  });

  return stationsById;
}

function reconstructPath(
  stationsById: MetroGraph,
  parent: Map<number, number | null>,
  destinationId: number
): GraphStation[] {
  const path: GraphStation[] = [];
  let cursor: number | null = destinationId;
  while (cursor !== null) {
    const station = stationsById.get(cursor);
    if (!station) break;
    path.push(station);
    cursor = parent.get(cursor) ?? null;
  }
  return path.reverse();
}

/**
 * Depth-First Search (recursive / backtracking).
 * Discovers a path from origin to destination; edges taken into unvisited
 * vertices are tree edges of the DFS spanning tree.
 *
 * Time: O(n + e). The path found is not necessarily shortest.
 */
export function dfsFindPath(
  stationsById: MetroGraph,
  originId: number,
  destinationId: number
): PathFindResult {
  if (!stationsById.has(originId) || !stationsById.has(destinationId)) {
    return { path: [], treeEdges: [], visited: new Set() };
  }

  if (originId === destinationId) {
    const origin = stationsById.get(originId);
    return {
      path: origin ? [origin] : [],
      treeEdges: [],
      visited: new Set([originId]),
    };
  }

  const visited = new Set<number>();
  const parent = new Map<number, number | null>([[originId, null]]);
  const treeEdges: Array<[number, number]> = [];
  let found = false;

  const visit = (uId: number): void => {
    visited.add(uId);
    if (uId === destinationId) {
      found = true;
      return;
    }

    const u = stationsById.get(uId);
    if (!u) return;

    for (const vId of u.neighbors) {
      if (visited.has(vId)) continue;
      parent.set(vId, uId);
      treeEdges.push([uId, vId]);
      visit(vId);
      if (found) return;
    }
  };

  visit(originId);

  return {
    path: found ? reconstructPath(stationsById, parent, destinationId) : [],
    treeEdges,
    visited,
  };
}

/**
 * Breadth-First Search — fewest stations (unweighted shortest path).
 * Time: O(n + e). Prefer this over DFS when minimizing hop count.
 * Kept for graph-theory demos; the UI routes with {@link dijkstraFindPath}.
 */
export function bfsFindPath(
  stationsById: MetroGraph,
  originId: number,
  destinationId: number
): GraphStation[] {
  if (!stationsById.has(originId) || !stationsById.has(destinationId)) {
    return [];
  }

  if (originId === destinationId) {
    const origin = stationsById.get(originId);
    return origin ? [origin] : [];
  }

  const queue: number[] = [originId];
  const seen = new Set<number>([originId]);
  const parent = new Map<number, number | null>([[originId, null]]);

  while (queue.length) {
    const uId = queue.shift();
    if (uId === undefined) break;
    const u = stationsById.get(uId);
    if (!u) continue;

    for (const vId of u.neighbors) {
      if (seen.has(vId)) continue;
      seen.add(vId);
      parent.set(vId, uId);

      if (vId === destinationId) {
        return reconstructPath(stationsById, parent, destinationId);
      }

      queue.push(vId);
    }
  }

  return [];
}

/**
 * Dijkstra — weighted shortest path.
 *
 * State space is (station, arrival line) so transfer cost can be applied when
 * the rider leaves on a different line than they arrived on.
 *
 * Edge weight = haversine distance (km). Changing lines adds `transferPenaltyKm`.
 * Time: O((n·L + e·L) log(n·L)) with a binary heap (L = lines per station).
 */
export function dijkstraFindPath(
  stationsById: MetroGraph,
  originId: number,
  destinationId: number,
  options: DijkstraOptions = {}
): WeightedPathResult {
  const empty: WeightedPathResult = {
    path: [],
    distanceKm: 0,
    transferCount: 0,
    cost: 0,
  };

  if (!stationsById.has(originId) || !stationsById.has(destinationId)) {
    return empty;
  }

  if (originId === destinationId) {
    const origin = stationsById.get(originId);
    return {
      path: origin ? [origin] : [],
      distanceKm: 0,
      transferCount: 0,
      cost: 0,
    };
  }

  const transferPenaltyKm =
    options.transferPenaltyKm ?? DEFAULT_TRANSFER_PENALTY_KM;

  const dist = new Map<number, number>();
  const parent = new Map<number, number | null>();
  const heap = new MinHeap();

  const startKey = stateKey(originId, 0);
  dist.set(startKey, 0);
  parent.set(startKey, null);
  heap.push({ stationId: originId, lineId: 0, cost: 0 });

  let bestGoalKey: number | null = null;

  while (heap.size) {
    const current = heap.pop();
    if (!current) break;

    const uKey = stateKey(current.stationId, current.lineId);
    const bestKnown = dist.get(uKey);
    if (bestKnown !== undefined && current.cost > bestKnown) continue;

    if (current.stationId === destinationId) {
      bestGoalKey = uKey;
      break;
    }

    const u = stationsById.get(current.stationId);
    if (!u) continue;

    for (const vId of u.neighbors) {
      const v = stationsById.get(vId);
      if (!v) continue;

      const lines = connectingLineIds(u, v);
      if (!lines.length) continue;

      const hopKm = edgeDistanceKm(u, v);

      for (const nextLineId of lines) {
        const transferCost =
          current.lineId !== 0 && current.lineId !== nextLineId
            ? transferPenaltyKm
            : 0;
        const nextCost = current.cost + hopKm + transferCost;
        const vKey = stateKey(vId, nextLineId);
        const prev = dist.get(vKey);

        if (prev !== undefined && nextCost >= prev) continue;

        dist.set(vKey, nextCost);
        parent.set(vKey, uKey);
        heap.push({ stationId: vId, lineId: nextLineId, cost: nextCost });
      }
    }
  }

  if (bestGoalKey === null) return empty;

  const stateKeys: number[] = [];
  let cursor: number | null = bestGoalKey;
  while (cursor !== null) {
    stateKeys.push(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  stateKeys.reverse();

  const path: GraphStation[] = [];
  let transferCount = 0;
  let distanceKm = 0;
  let previousLineId = 0;

  for (let i = 0; i < stateKeys.length; i++) {
    const { stationId, lineId } = unpackState(stateKeys[i]);
    const station = stationsById.get(stationId);
    if (!station) break;

    if (
      i > 0 &&
      previousLineId !== 0 &&
      lineId !== 0 &&
      previousLineId !== lineId
    ) {
      transferCount += 1;
    }

    if (i > 0) {
      const prevStation = path[path.length - 1];
      distanceKm += edgeDistanceKm(prevStation, station);
    }

    // Collapse consecutive duplicate stations (should not happen, but safe).
    if (!path.length || path[path.length - 1].id !== station.id) {
      path.push(station);
    }

    if (lineId !== 0) previousLineId = lineId;
  }

  return {
    path,
    distanceKm,
    transferCount,
    cost: dist.get(bestGoalKey) ?? distanceKm,
  };
}

/**
 * Connectivity via DFS: start from an arbitrary vertex; if all vertices are
 * visited, G is connected; otherwise the unvisited vertices belong to other
 * connected components.
 *
 * Time: O(n + e).
 */
export function analyzeConnectivity(stationsById: MetroGraph): ConnectivityInfo {
  const n = stationsById.size;
  if (n === 0) {
    return { connected: true, componentCount: 0, n: 0, e: 0 };
  }

  let e = 0;
  for (const station of stationsById.values()) {
    e += station.neighbors.size;
  }
  e /= 2;

  const remaining = new Set(stationsById.keys());
  let componentCount = 0;

  while (remaining.size) {
    const startId = remaining.values().next().value;
    if (startId === undefined) break;
    componentCount += 1;

    const stack: number[] = [startId];
    remaining.delete(startId);

    while (stack.length) {
      const uId = stack.pop();
      if (uId === undefined) break;
      const u = stationsById.get(uId);
      if (!u) continue;
      for (const vId of u.neighbors) {
        if (!remaining.has(vId)) continue;
        remaining.delete(vId);
        stack.push(vId);
      }
    }
  }

  return {
    connected: componentCount === 1,
    componentCount,
    n,
    e,
  };
}
