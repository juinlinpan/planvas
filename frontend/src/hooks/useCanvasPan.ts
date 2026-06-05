import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { PanState } from '../types/canvas';
import type { ActiveTool, Viewport } from '../types/index';

export type UseCanvasPanParams = {
  viewportRef: RefObject<Viewport>;
  isSpaceRef: RefObject<boolean>;
  activeToolRef: RefObject<ActiveTool>;
  panRef: MutableRefObject<PanState | null>;
  setViewportAndSync: (vp: Viewport) => void;
  scheduleViewportSave: (vp: Viewport) => void;
};

export function useCanvasPan({
  viewportRef,
  isSpaceRef,
  activeToolRef,
  panRef,
  setViewportAndSync,
  scheduleViewportSave,
}: UseCanvasPanParams) {
  function startViewportPan(
    e: React.MouseEvent,
    options: { preventDefault?: boolean } = {},
  ) {
    const shouldStartPan =
      e.button === 1 ||
      (e.button === 0 && isSpaceRef.current) ||
      (e.button === 0 && activeToolRef.current === 'pan');
    if (!shouldStartPan) {
      return false;
    }

    if (options.preventDefault !== false) {
      e.preventDefault();
    }
    e.stopPropagation();
    panRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startVpX: viewportRef.current.x,
      startVpY: viewportRef.current.y,
    };
    return true;
  }

  function handlePanMove(e: React.MouseEvent): boolean {
    const pan = panRef.current;
    if (!pan) {
      return false;
    }
    const nextViewport: Viewport = {
      ...viewportRef.current,
      x: pan.startVpX + (e.clientX - pan.startMouseX),
      y: pan.startVpY + (e.clientY - pan.startMouseY),
    };
    setViewportAndSync(nextViewport);
    return true;
  }

  function handlePanEnd(): boolean {
    if (panRef.current) {
      panRef.current = null;
      scheduleViewportSave(viewportRef.current);
      return true;
    }
    return false;
  }

  return {
    startViewportPan,
    handlePanMove,
    handlePanEnd,
  };
}
