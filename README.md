# Tehran Metro Map

An interactive Tehran Metro map built with React + Vite. It renders all 7 metro lines (plus their branches), lets you search for stations, and finds the shortest path between an origin and a destination.

## Data source

Station and line data (`src/assets/data/stations.json` and `src/assets/data/lines.json`) is derived from the [tehran-metro-data](https://github.com/mostafa-kheibary/tehran-metro-data) project by [mostafa-kheibary](https://github.com/mostafa-kheibary), licensed under [ODbL-1.0](https://github.com/mostafa-kheibary/tehran-metro-data/blob/main/LICENSE.md). The raw station graph (names, coordinates, per-line adjacency) was converted into this app's line/serial-number schema; lines with branches (e.g. Line 1's airport/Kahrizak branches, Line 4's Mehrabad Airport branch) are represented as separate line segments sharing the same color. Operating hours are approximate defaults since the source dataset doesn't include them.

## Development

```bash
npm install
npm run dev
```

- `npm run build` – production build
- `npm run lint` – ESLint (flat config)
- `npm run preview` – preview the production build
