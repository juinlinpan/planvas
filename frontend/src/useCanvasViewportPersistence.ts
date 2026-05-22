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

  const scheduleViewportSave = useCallback(
    (nextViewport: Viewport) => {
      onViewportChange?.(nextViewport);
      if (vpSaveTimerRef.current !== null) {
        clearTimeout(vpSaveTimerRef.current);
      }
      vpSaveTimerRef.current = setTimeout(() => {
        void updatePageViewport(pageId, {
          viewport_x: nextViewport.x,
          viewport_y: nextViewport.y,
          zoom: nextViewport.zoom,
        });
      }, VIEWPORT_SAVE_DELAY);
    },
    [pageId, onViewportChange],
  );

  useEffect(() => {
    return () => {
      if (vpSaveTimerRef.current !== null) {
        clearTimeout(vpSaveTimerRef.current);
      }
    };
  }, []);

  return { scheduleViewportSave };
}
