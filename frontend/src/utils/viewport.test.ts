import { describe, expect, it } from 'vitest';

import {
  adjustResetZoomByStep,
  adjustZoomByStep,
  getViewportWheelPanDelta,
  getWheelZoomMultiplier,
  getDisplayZoom,
  getResetZoom,
  normalizeResetZoom,
  shouldPanViewportFromWheel,
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

  it('treats precision touchpad wheel input as viewport pan', () => {
    expect(
      shouldPanViewportFromWheel({
        deltaX: 12,
        deltaY: 18,
        deltaMode: 0,
      }),
    ).toBe(true);
    expect(
      getViewportWheelPanDelta({
        deltaX: 12,
        deltaY: 18,
        deltaMode: 0,
      }),
    ).toEqual({ x: 12, y: 18 });
  });

  it('keeps mouse wheel input on zoom by default', () => {
    expect(
      shouldPanViewportFromWheel({
        deltaX: 0,
        deltaY: 100,
        deltaMode: 0,
      }),
    ).toBe(false);
    expect(getWheelZoomMultiplier({ deltaX: 0, deltaY: 100, deltaMode: 0 }))
      .toBe(0.9);
  });

  it('keeps pinch-style modified wheel input on zoom', () => {
    expect(
      shouldPanViewportFromWheel({
        deltaX: 0,
        deltaY: 10,
        deltaMode: 0,
        ctrlKey: true,
      }),
    ).toBe(false);
  });

  it('uses shift wheel as horizontal viewport pan', () => {
    expect(
      shouldPanViewportFromWheel({
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(
      getViewportWheelPanDelta({
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
        shiftKey: true,
      }),
    ).toEqual({ x: 120, y: 0 });
  });
});
