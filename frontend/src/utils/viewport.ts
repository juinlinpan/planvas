import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  TOOLBAR_ZOOM_STEP,
} from '../constants/canvas';
import type { Viewport } from '../types/index';

type ScreenPoint = {
  x: number;
  y: number;
};

type WheelViewportInput = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};


const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const WHEEL_LINE_HEIGHT_PX = 16;
const WHEEL_PAGE_HEIGHT_PX = 800;
const MAX_WHEEL_ZOOM_DELTA = 0.25;

function roundToStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function getDisplayZoom(zoom: number): number {
  return roundToStep(zoom, TOOLBAR_ZOOM_STEP);
}

export function adjustZoomByStep(
  currentZoom: number,
  direction: -1 | 1,
): number {
  const roundedCurrentZoom = getDisplayZoom(currentZoom);
  return clampZoom(
    roundToStep(
      roundedCurrentZoom + direction * TOOLBAR_ZOOM_STEP,
      TOOLBAR_ZOOM_STEP,
    ),
  );
}

export function normalizeResetZoom(zoom: number): number {
  return clampZoom(roundToStep(zoom, TOOLBAR_ZOOM_STEP));
}

export function adjustResetZoomByStep(
  currentZoom: number,
  direction: -1 | 1,
): number {
  return normalizeResetZoom(currentZoom + direction * TOOLBAR_ZOOM_STEP);
}

export function getResetZoom(resetZoom = DEFAULT_ZOOM): number {
  return normalizeResetZoom(resetZoom);
}

export function zoomViewportAroundPoint(
  viewport: Viewport,
  targetZoom: number,
  point: ScreenPoint,
): Viewport {
  const nextZoom = clampZoom(targetZoom);
  if (nextZoom === viewport.zoom) {
    return viewport;
  }

  const scale = nextZoom / viewport.zoom;
  return {
    x: point.x - scale * (point.x - viewport.x),
    y: point.y - scale * (point.y - viewport.y),
    zoom: nextZoom,
  };
}

export function normalizeWheelDeltaToPixels(
  delta: number,
  deltaMode: number,
): number {
  if (deltaMode === DOM_DELTA_LINE) {
    return delta * WHEEL_LINE_HEIGHT_PX;
  }

  if (deltaMode === DOM_DELTA_PAGE) {
    return delta * WHEEL_PAGE_HEIGHT_PX;
  }

  return delta;
}

// Returns true when the wheel event looks like a trackpad scroll (should be ignored).
// Mouse wheel: deltaMode=LINE/PAGE, or large pure-vertical pixel delta (~100 px in Chrome).
// Trackpad: DOM_DELTA_PIXEL with small deltaY or any deltaX.
export function isTrackpadWheelEvent(input: WheelViewportInput): boolean {
  if (input.ctrlKey || input.metaKey) {
    return false; // pinch gesture → treat as mouse wheel zoom
  }

  if (input.deltaMode !== DOM_DELTA_PIXEL) {
    return false; // DOM_DELTA_LINE/PAGE = physical scroll wheel
  }

  if (Math.abs(input.deltaX) > 0) {
    return true; // horizontal component = trackpad
  }

  // Chrome normalises a mouse-wheel notch to ~100 px; trackpad is usually < 30 px
  return Math.abs(input.deltaY) < 40;
}


export function getWheelZoomMultiplier(input: WheelViewportInput): number {
  const deltaY = normalizeWheelDeltaToPixels(input.deltaY, input.deltaMode);
  const zoomDelta = Math.max(
    -MAX_WHEEL_ZOOM_DELTA,
    Math.min(MAX_WHEEL_ZOOM_DELTA, -deltaY * 0.001),
  );
  return 1 + zoomDelta;
}
