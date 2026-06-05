import { describe, expect, it } from 'vitest';

import {
  adjustResetZoomByStep,
  adjustZoomByStep,
  getWheelZoomMultiplier,
  getDisplayZoom,
  getResetZoom,
  isTrackpadWheelEvent,
  normalizeResetZoom,
  zoomViewportAroundPoint,
} from './viewport';

describe('viewport helpers', () => {
  it('rounds display zoom to toolbar precision', () => {
    expect(getDisplayZoom(1.74)).toBe(1.7);
    expect(getDisplayZoom(1.75)).toBe(1.8);
  });

  it('adjusts zoom in tenth-step increments', () => {
    expect(adjustZoomByStep(1.73, 1)).toBe(1.8);
    expect(adjustZoomByStep(1.73, -1)).toBe(1.6);
  });

  it('keeps the target point fixed while zooming around it', () => {
    expect(
      zoomViewportAroundPoint(
        {
          x: 100,
          y: 50,
          zoom: 1,
        },
        2,
        {
          x: 300,
          y: 200,
        },
      ),
    ).toEqual({
      x: -100,
      y: -100,
      zoom: 2,
    });
  });

  it('returns the canonical reset zoom value', () => {
    expect(getResetZoom()).toBe(1);
  });

  it('normalizes custom reset zoom targets to tenth-step increments', () => {
    expect(normalizeResetZoom(1.54)).toBe(1.5);
    expect(normalizeResetZoom(1.55)).toBe(1.6);
  });

  it('adjusts custom reset zoom targets in tenth-step increments', () => {
    expect(adjustResetZoomByStep(1, 1)).toBe(1.1);
    expect(adjustResetZoomByStep(1, -1)).toBe(0.9);
  });

  it('detects precision touchpad scroll as trackpad event', () => {
    // has deltaX → trackpad
    expect(isTrackpadWheelEvent({ deltaX: 12, deltaY: 18, deltaMode: 0 })).toBe(true);
    // small deltaY, no deltaX → trackpad
    expect(isTrackpadWheelEvent({ deltaX: 0, deltaY: 10, deltaMode: 0 })).toBe(true);
  });

  it('detects large pure-vertical pixel delta as mouse wheel (not trackpad)', () => {
    expect(isTrackpadWheelEvent({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(false);
  });

  it('detects DOM_DELTA_LINE input as mouse wheel (not trackpad)', () => {
    expect(isTrackpadWheelEvent({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toBe(false);
  });

  it('detects pinch gesture (ctrlKey) as mouse wheel zoom, not trackpad', () => {
    expect(isTrackpadWheelEvent({ deltaX: 0, deltaY: 10, deltaMode: 0, ctrlKey: true })).toBe(false);
  });

  it('computes the wheel zoom multiplier', () => {
    expect(getWheelZoomMultiplier({ deltaX: 0, deltaY: 100, deltaMode: 0 })).toBe(0.9);
  });
});
