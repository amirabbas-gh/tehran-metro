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
 *
 * @returns {Map<number, { id: number, neighbors: Set<number>, ...station }>}
 */
export function buildAdjacencyList(lines) {
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
      const u = stationsById.get(ordered[i].id);
      const v = stationsById.get(ordered[i + 1].id);
      u.neighbors.add(v.id);
      v.neighbors.add(u.id);
    }
  });

  return stationsById;
}

function reconstructPath(stationsById, parent, destinationId) {
  const path = [];
  let cursor = destinationId;
  while (cursor !== null) {
    path.push(stationsById.get(cursor));
    cursor = parent.get(cursor);
  }
  return path.reverse();
}

/**
 * Depth-First Search (recursive / backtracking).
 * Discovers a path from origin to destination; edges taken into unvisited
 * vertices are tree edges of the DFS spanning tree; edges to already-visited
 * ancestors would be back edges.
 *
 * Time: O(n + e). The path found is not necessarily shortest.
 *
 * @returns {{ path: object[], treeEdges: Array<[number, number]>, visited: Set<number> }}
 */
export function dfsFindPath(stationsById, originId, destinationId) {
  if (!stationsById.has(originId) || !stationsById.has(destinationId)) {
    return { path: [], treeEdges: [], visited: new Set() };
  }

  if (originId === destinationId) {
    return {
      path: [stationsById.get(originId)],
      treeEdges: [],
      visited: new Set([originId]),
    };
  }

  const visited = new Set();
  const parent = new Map([[originId, null]]);
  const treeEdges = [];
  let found = false;

  const visit = (uId) => {
    visited.add(uId);
    if (uId === destinationId) {
      found = true;
      return;
    }

    const u = stationsById.get(uId);
    for (const vId of u.neighbors) {
      if (visited.has(vId)) continue; // back edge (or cross) — skip
      parent.set(vId, uId);
      treeEdges.push([uId, vId]); // tree edge
      visit(vId); // recurse / backtrack after exploring the branch
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
export function bfsFindPath(stationsById, originId, destinationId) {
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
    const uId = queue.shift();
    const u = stationsById.get(uId);

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
export function analyzeConnectivity(stationsById) {
  const n = stationsById.size;
  if (n === 0) {
    return { connected: true, componentCount: 0, n: 0, e: 0 };
  }

  let e = 0;
  for (const station of stationsById.values()) {
    e += station.neighbors.size;
  }
  e /= 2; // undirected: each edge counted twice

  const remaining = new Set(stationsById.keys());
  let componentCount = 0;

  while (remaining.size) {
    const startId = remaining.values().next().value;
    componentCount += 1;

    const stack = [startId];
    remaining.delete(startId);

    while (stack.length) {
      const uId = stack.pop();
      const u = stationsById.get(uId);
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
