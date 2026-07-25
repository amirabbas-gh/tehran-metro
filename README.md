<p align="center">
  <img src="docs/ut-logo.png" alt="University of Tehran" width="140" />
</p>

<h1 align="center">Tehran Metro Map — Discrete Mathematics Project</h1>

<p align="center">
  <strong>College of Farabi, University of Tehran</strong><br />
  B.Sc. Computer Engineering · Discrete Mathematics
</p>

Interactive Tehran Metro map (React + Vite) presented as an applied **graph theory** project for the Discrete Mathematics course at the **College of Farabi, University of Tehran**.

## Mathematical model

The metro network is an **undirected graph** \(G = (V, E)\):

| Symbol | Meaning |
|--------|---------|
| \(V\) | Stations (vertices) |
| \(E\) | Rail links between consecutive stations on a line (edges) |

Trains run both ways, so each link is an undirected edge. Transfer stations are vertices of degree \(> 2\) that connect multiple lines.

## Graph representation

Stored as an **adjacency list** (`src/graph.js` → `buildAdjacencyList`).

The metro graph is **sparse** (\(|E| \ll |V|^2\)), so an adjacency list uses \(\Theta(n + e)\) space versus \(\Theta(n^2)\) for an adjacency matrix.

## Algorithms (`src/graph.js`)

| Algorithm | Role | Complexity |
|-----------|------|------------|
| **DFS** (`dfsFindPath`, `analyzeConnectivity`) | Path via recursive backtracking; builds a DFS spanning tree (tree edges / back edges); proves **connectivity** (one DFS from any vertex visits all \(V\) ⇒ \(G\) is connected) | \(O(n + e)\) |
| **BFS** (`bfsFindPath`) | Route shown in the UI: **fewest stations** (unweighted shortest path) | \(O(n + e)\) |

DFS finds *a* path, not necessarily the shortest. BFS minimizes hop count. For travel time or distance, use a **weighted** graph and **Dijkstra**.

## App features

- Interactive map of Tehran Metro lines (including branches)
- Station search and origin → destination routing (BFS)
- Floating graph panel: \(|V|\), \(|E|\), and connectivity (DFS)

## Run

```bash
npm install
npm run dev
```

- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Data

Station/line data (`src/assets/data/`) is derived from [tehran-metro-data](https://github.com/mostafa-kheibary/tehran-metro-data) ([ODbL-1.0](https://github.com/mostafa-kheibary/tehran-metro-data/blob/main/LICENSE.md)). Adapted to this app’s line/serial schema; operating hours are approximate defaults.

## Affiliation

**College of Farabi** · University of Tehran · Computer Engineering
