import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BoardItem } from '../services/api';
import {
  getItemMagnetBounds,
  getUniqueItemIds,
  isHiddenByCollapsedFrame,
} from '../canvasHelpers/selection';
import type { MarqueeSelectionState } from '../types/canvas';
import type { Point } from '../utils/export/segmentData';

export type UseCanvasMarqueeParams = {
  marqueeSelectionRef: MutableRefObject<{
    startClientX: number;
    startClientY: number;
    appendToSelection: boolean;
    baseSelectionIds: string[];
  } | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  itemsRef: RefObject<BoardItem[]>;
  selectedIdsRef: RefObject<string[]>;
  screenToWorld: (x: number, y: number) => Point;
  setMarqueeSelection: (selection: MarqueeSelectionState | null) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  setEditingId: (id: string | null) => void;
};

export function useCanvasMarquee({
  marqueeSelectionRef,
  containerRef,
  itemsRef,
  selectedIdsRef,
  screenToWorld,
  setMarqueeSelection,
  setSelection,
  clearSelection,
  setEditingId,
}: UseCanvasMarqueeParams) {
  function startMarqueeSelection(e: React.MouseEvent) {
    setEditingId(null);
    marqueeSelectionRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      appendToSelection: e.shiftKey || e.ctrlKey || e.metaKey,
      baseSelectionIds: selectedIdsRef.current,
    };
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
      clearSelection();
    }
  }

  function handleMarqueeMove(e: React.MouseEvent): boolean {
    const marqueeSelection = marqueeSelectionRef.current;
    if (marqueeSelection === null) {
      return false;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return true;
    }

    const left =
      Math.min(marqueeSelection.startClientX, e.clientX) - rect.left;
    const top = Math.min(marqueeSelection.startClientY, e.clientY) - rect.top;
    const width = Math.abs(e.clientX - marqueeSelection.startClientX);
    const height = Math.abs(e.clientY - marqueeSelection.startClientY);
    setMarqueeSelection({ left, top, width, height });

    const startWorld = screenToWorld(
      marqueeSelection.startClientX,
      marqueeSelection.startClientY,
    );
    const endWorld = screenToWorld(e.clientX, e.clientY);
    const selectionRect = {
      left: Math.min(startWorld.x, endWorld.x),
      top: Math.min(startWorld.y, endWorld.y),
      right: Math.max(startWorld.x, endWorld.x),
      bottom: Math.max(startWorld.y, endWorld.y),
    };
    const enclosedIds = itemsRef.current
      .filter((item) => !isHiddenByCollapsedFrame(item, itemsRef.current))
      .filter((item) => {
        const bounds = getItemMagnetBounds(item);
        return (
          bounds.x >= selectionRect.left &&
          bounds.y >= selectionRect.top &&
          bounds.x + bounds.width <= selectionRect.right &&
          bounds.y + bounds.height <= selectionRect.bottom
        );
      })
      .map((item) => item.id);
    setSelection(
      marqueeSelection.appendToSelection
        ? getUniqueItemIds([
            ...marqueeSelection.baseSelectionIds,
            ...enclosedIds,
          ])
        : enclosedIds,
    );
    return true;
  }

  function handleMarqueeEnd(): boolean {
    if (marqueeSelectionRef.current !== null) {
      marqueeSelectionRef.current = null;
      setMarqueeSelection(null);
      return true;
    }
    return false;
  }

  return {
    startMarqueeSelection,
    handleMarqueeMove,
    handleMarqueeEnd,
  };
}
