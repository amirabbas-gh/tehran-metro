import type {
  ConnectivityInfo,
  EnrichedLine,
  GraphStation,
  MetroGraph,
  PathFindResult,
} from "../types/metro";

/**
 * Discrete Mathematics — Tehran Metro as G = (V, E)
 *
 * V = metro stations, E = undirected rail links between consecutive stations.
 * Representation: adjacency list (optimal for a sparse transit network:
 * space Θ(n + e) vs Θ(n²) for an adjacency matrix).
 */

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
