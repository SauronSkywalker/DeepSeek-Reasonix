/**
 * DPI zoom scale service.
 *
 * Uses CSS `zoom` on `document.documentElement` for reliable, layout-safe
 * zooming that survives window minimize/restore (unlike WebView2 ZoomFactor
 * which can reset to 1.0 after restoring from minimized state).
 *
 * The restart zoom is read from localStorage by a synchronous inline <script>
 * in index.html before any DOM renders, so there is no flash of unzoomed content.
 *
 * The Go-side ZoomFactor in main.go is kept at 1.0 — CSS zoom handles the rest.
 * See the package comment in zoom_factor.go for the transition rationale.
 */

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.0;
export const ZOOM_STEP = 0.05;

export type ZoomLevel = number; // 0.5 – 2.0

export const DEFAULT_ZOOM: ZoomLevel = 1.0;

const ZOOM_KEY = "reasonix-zoom-restart";

// ─── helpers ────────────────────────────────────────────────────────

/** Snap a number to the nearest valid step within [MIN, MAX]. */
export function snapZoom(value: number): ZoomLevel {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  const steps = Math.round((clamped - MIN_ZOOM) / ZOOM_STEP);
  return parseFloat((MIN_ZOOM + steps * ZOOM_STEP).toFixed(2));
}

/** Convert a zoom value (0.5-2.0) to a percentage integer (50-200). */
export function zoomToPercent(zoom: ZoomLevel): number {
  return Math.round(zoom * 100);
}

/** Convert a percentage integer (50-200) back to a zoom value (0.5-2.0). */
export function percentToZoom(pct: number): ZoomLevel {
  return snapZoom(pct / 100);
}

function readZoom(fallback: ZoomLevel): ZoomLevel {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(ZOOM_KEY) : null;
  if (stored === null) return fallback;
  const parsed = parseFloat(stored);
  if (isNaN(parsed)) return fallback;
  return snapZoom(parsed);
}

function writeZoom(value: ZoomLevel): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(value));
  } catch {
    /* private mode / no storage */
  }
}

// ─── public API ─────────────────────────────────────────────────────

/**
 * Return `window.innerWidth` adjusted for CSS zoom.
 * CSS zoom does NOT change `window.innerWidth`, but `getBoundingClientRect()`
 * returns values in the zoomed coordinate space.  Floating UI that mixes the
 * two must use this helper to avoid positioning misalignment.
 */
export function actualInnerWidth(): number {
  const zoom = parseFloat(document.documentElement?.style.zoom) || 1;
  return window.innerWidth / zoom;
}

/**
 * Return `window.innerHeight` adjusted for CSS zoom.  See actualInnerWidth.
 */
export function actualInnerHeight(): number {
  const zoom = parseFloat(document.documentElement?.style.zoom) || 1;
  return window.innerHeight / zoom;
}

/** Read the saved zoom level that will be applied on next restart. */
export function getRestartZoom(): ZoomLevel {
  return readZoom(DEFAULT_ZOOM);
}

/**
 * Save a zoom factor to localStorage and apply it to the DOM immediately
 * via CSS `zoom` on `document.documentElement` — no restart needed.
 *
 * A synchronous inline <script> in index.html also reads localStorage on
 * cold start so there is no flash of unzoomed content before React mounts.
 */
export function saveRestartZoom(userZoom: ZoomLevel): void {
  const snapped = snapZoom(userZoom);
  writeZoom(snapped);
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.style.zoom = String(snapped);
    // CSS zoom does not fire resize events, so --app-viewport-height won't
    // be recalculated by useViewportHeightVar.  Update it inline so the
    // main container and all height-dependent children stay in sync.
    const root = document.documentElement;
    const zoom = snapped;
    const height = Math.round((window.visualViewport?.height ?? window.innerHeight) / zoom);
    if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
  }
}

/**
 * Init: no-op for zoom — the inline <script> in index.html applies CSS zoom
 * synchronously before any DOM renders. This function exists for future
 * startup-time initialization if needed.
 */
export function initDpiScale(): void {
  /* zoom is applied in index.html's inline script */
}
