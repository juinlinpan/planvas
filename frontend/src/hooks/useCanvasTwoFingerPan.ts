import type React from 'react';
import { useRef } from 'react';
import type { RefObject } from 'react';
import type { Viewport } from '../types/index';

type PanState = {
  startVpX: number;
  startVpY: number;
  startMidX: number;
  startMidY: number;
};

export function useCanvasTwoFingerPan({
  viewportRef,
  setViewportAndSync,
  scheduleViewportSave,
}: {
  viewportRef: RefObject<Viewport>;
  setViewportAndSync: (vp: Viewport) => void;
  scheduleViewportSave: (vp: Viewport) => void;
}) {
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const panStateRef = useRef<PanState | null>(null);

  function getMidpoint() {
    const pts = [...pointersRef.current.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const mid = getMidpoint();
      const vp = viewportRef.current;
      panStateRef.current = {
        startVpX: vp.x,
        startVpY: vp.y,
        startMidX: mid.x,
        startMidY: mid.y,
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    if (!pointersRef.current.has(e.pointerId)) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pan = panStateRef.current;
    if (!pan || pointersRef.current.size !== 2) return;

    const mid = getMidpoint();
    const nextViewport: Viewport = {
      ...viewportRef.current,
      x: pan.startVpX + (mid.x - pan.startMidX),
      y: pan.startVpY + (mid.y - pan.startMidY),
    };
    setViewportAndSync(nextViewport);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;

    pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size < 2 && panStateRef.current) {
      panStateRef.current = null;
      scheduleViewportSave(viewportRef.current);
    }
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
