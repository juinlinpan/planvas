import { useCallback, useEffect, useRef } from 'react';
import { updatePageViewport } from './api';
import { VIEWPORT_SAVE_DELAY } from './canvasConstants';
import type { Viewport } from './types';

type Params = {
  pageId: string;
  onViewportChange?: (viewport: Viewport) => void;
};

/**
 * Debounces viewport save calls and persists the viewport to the backend.
 * Extracted from Canvas.tsx to isolate viewport persistence side effects.
 */
export function useCanvasViewportPersistence({ pageId, onViewportChange }: Params) {
  const vpSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingViewportRef = useRef<Viewport | null>(null);

  const persistViewport = useCallback(
    (nextViewport: Viewport) => {
      pendingViewportRef.current = null;
      void updatePageViewport(pageId, {
        viewport_x: nextViewport.x,
        viewport_y: nextViewport.y,
        zoom: nextViewport.zoom,
      }).catch((err) => {
        console.error('[Canvas] Failed to save viewport', err);
      });
    },
    [pageId],
  );

  const scheduleViewportSave = useCallback(
    (nextViewport: Viewport) => {
      onViewportChange?.(nextViewport);
      pendingViewportRef.current = nextViewport;
      if (vpSaveTimerRef.current !== null) {
        clearTimeout(vpSaveTimerRef.current);
      }
      vpSaveTimerRef.current = setTimeout(() => {
        vpSaveTimerRef.current = null;
        persistViewport(nextViewport);
      }, VIEWPORT_SAVE_DELAY);
    },
    [onViewportChange, persistViewport],
  );

  const flushViewportSave = useCallback(() => {
    if (vpSaveTimerRef.current !== null) {
      clearTimeout(vpSaveTimerRef.current);
      vpSaveTimerRef.current = null;
    }
    const pendingViewport = pendingViewportRef.current;
    if (pendingViewport !== null) {
      persistViewport(pendingViewport);
    }
  }, [persistViewport]);

  useEffect(() => {
    return () => {
      flushViewportSave();
    };
  }, [flushViewportSave]);

  return { scheduleViewportSave, flushViewportSave };
}
