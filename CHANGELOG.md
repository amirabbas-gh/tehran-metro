# tehran-metro

## 1.4.0

### Minor Changes

- 2b65f51: Ship a Trusted Web Activity APK (targetSdk 35) for Android install, serve Digital Asset Links, and route the install banner on Android to download that package so Play Protect no longer blocks on an outdated SDK.

## 1.3.0

### Minor Changes

- 43bec85: Notify installed PWA users when a newer release appears in the remote CHANGELOG, using the same banner style as the install prompt.

## 1.2.0

### Minor Changes

- dceff86: Make routing time-aware with official Tehran Metro headways: Dijkstra now factors wait and transfer times from the device clock, search shows approximate arrival, and UI numbers render in Persian digits.

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
