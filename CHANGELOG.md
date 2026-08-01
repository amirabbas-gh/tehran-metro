# tehran-metro

## 1.1.0

### Minor Changes

- 9bf5644: Replace BFS routing with Dijkstra: edge weights use station distance (km) and each line transfer adds a configurable penalty so paths prefer fewer transfers.

## 1.0.1

### Patch Changes

- 259b0b5: manifest bump version

## 1.0.0

### Major Changes

- a2915d5: rewrite in typescript

## 0.0.1

### Patch Changes

- 2f134ff: Fix pinch-zoom and panning breaking when a touch gesture starts with a finger on a station marker, and clean up repeated try/catch boilerplate around localStorage and Pointer Capture calls.
