export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 3;
export const DEFAULT_ZOOM = 2.45;
export const MOBILE_DEFAULT_ZOOM = 1.85;
export const MOBILE_MAX_WIDTH = 899;
/** Rough center of central Tehran (around Imam Khomeini / Enghelab). */
export const TEHRAN_CENTER = { longitude: 51.421, latitude: 35.701 };
/** Positive Y shifts the initial view down so the map sits a bit higher. */
export const DEFAULT_PAN_OFFSET_Y = 110;
/** Extra offset clears the floating mobile top chrome. */
export const MOBILE_PAN_OFFSET_Y = 220;

export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

export function initialZoom(): number {
  return isMobileViewport() ? MOBILE_DEFAULT_ZOOM : DEFAULT_ZOOM;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export type PointerPoint = { clientX: number; clientY: number };

export function pointerDistance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function pointerMidpoint(
  a: PointerPoint,
  b: PointerPoint
): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export function setPointerCaptureSafe(
  element: HTMLElement,
  pointerId: number
): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    /* Pointer may have already been released; ignore. */
  }
}

export function releasePointerCaptureSafe(
  element: HTMLElement,
  pointerId: number
): void {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    /* Capture may already be lost; ignore. */
  }
}
