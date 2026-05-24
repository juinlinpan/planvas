import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BoardItem } from './api';
import {
  clampItemSize,
  isFrame,
  relayoutFrameItems,
  getFrameChildren,
} from './canvasHelpers/frameLayout';
import { updateOriginalSize } from './canvasHelpers/core';
import { relayoutTableItems } from './canvasHelpers/tableLayout';
import {
  persistItems,
  syncConnectorAnchorsForItems,
  syncSegmentConnectionsForItems,
} from './canvasSyncHelpers';
import { magnetResizeRect } from './magnet';
import { CANVAS_GRID_SIZE, MAGNET_TOLERANCE } from './canvasConstants';
import { ITEM_TYPE, type Viewport } from './types';
import type { ConnectorsUpdater, ItemsUpdater, ResizeEdge, ResizeState } from './canvasTypes';

export type UseCanvasResizeParams = {
  resizeRef: MutableRefObject<ResizeState | null>;
  itemsRef: RefObject<BoardItem[]>;
  viewportRef: RefObject<Viewport>;
  setItemsAndSync: (updater: ItemsUpdater) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  captureBoardSnapshot: () => any;
  recordHistoryCheckpoint: (snapshot: any) => void;
};

function computeResize(
  edge: ResizeEdge,
  start: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  const movesLeft = edge.includes('w');
  const movesRight = edge.includes('e');
  const movesTop = edge.includes('n');
  const movesBottom = edge.includes('s');

  if (movesLeft) {
    x = start.x + dx;
    width = start.width - dx;
  } else if (movesRight) {
    width = start.width + dx;
  }

  if (movesTop) {
    y = start.y + dy;
    height = start.height - dy;
  } else if (movesBottom) {
    height = start.height + dy;
  }

  return { x, y, width, height };
}

export function useCanvasResize({
  resizeRef,
  itemsRef,
  viewportRef,
  setItemsAndSync,
  setConnectorsAndSync,
  setSelection,
  setEditingId,
  captureBoardSnapshot,
  recordHistoryCheckpoint,
}: UseCanvasResizeParams) {
  function startResize(
    e: React.MouseEvent,
    itemId: string,
    edge: ResizeEdge,
    startViewportPan: (e: React.MouseEvent) => boolean,
  ) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    e.stopPropagation();
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    setSelection([itemId]);
    setEditingId(null);
    resizeRef.current = {
      itemId,
      edge,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startX: item.x,
      startY: item.y,
      startWidth: item.width,
      startHeight: item.height,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleResizeMove(e: React.MouseEvent, shouldUseMagnet: boolean): boolean {
    const resize = resizeRef.current;
    if (!resize) {
      return false;
    }

    const vp = viewportRef.current;
    const dx = (e.clientX - resize.startMouseX) / vp.zoom;
    const dy = (e.clientY - resize.startMouseY) / vp.zoom;
    const item = itemsRef.current.find(
      (candidate) => candidate.id === resize.itemId,
    );
    if (!item) {
      return true;
    }

    const start = {
      x: resize.startX,
      y: resize.startY,
      width: resize.startWidth,
      height: resize.startHeight,
    };
    const rawRect = computeResize(resize.edge, start, dx, dy);

    let nextRect = rawRect;
    if (shouldUseMagnet) {
      const magnetResult = magnetResizeRect(
        { x: item.x, y: item.y, width: item.width, height: item.height },
        CANVAS_GRID_SIZE,
        MAGNET_TOLERANCE,
        resize.edge,
        rawRect,
      );
      nextRect = magnetResult;
    }

    const nextSize = clampItemSize(
      item.type,
      nextRect.width,
      nextRect.height,
      item.data_json,
    );

    setItemsAndSync((current) => {
      const resizedItems = current.map((currentItem) => {
        if (currentItem.id !== resize.itemId) {
          return currentItem;
        }

        const updated = {
          ...currentItem,
          x: nextRect.x,
          y: nextRect.y,
          width: nextSize.width,
          height: nextSize.height,
        };
        return currentItem.parent_item_id !== null
          ? updateOriginalSize(updated, nextSize.width, nextSize.height)
          : updated;
      });

      return item.type === ITEM_TYPE.table
        ? relayoutTableItems(resizedItems, [resize.itemId]).items
        : resizedItems;
    });

    return true;
  }

  function handleResizeEnd(): boolean {
    const resize = resizeRef.current;
    if (!resize) {
      return false;
    }

    resizeRef.current = null;
    const item = itemsRef.current.find(
      (candidate) => candidate.id === resize.itemId,
    );
    if (item) {
      let nextItems = itemsRef.current;
      const changedIds = new Set<string>([item.id]);

      if (isFrame(item)) {
        const relayoutResult = relayoutFrameItems(nextItems, [item.id]);
        nextItems = relayoutResult.items;
        for (const changedId of relayoutResult.changedIds) {
          changedIds.add(changedId);
        }

        if (relayoutResult.changedIds.length > 0) {
          setItemsAndSync(nextItems);
        }
      }

      if (item.type === ITEM_TYPE.table) {
        const relayoutResult = relayoutTableItems(nextItems, [item.id]);
        nextItems = relayoutResult.items;
        for (const changedId of relayoutResult.changedIds) {
          changedIds.add(changedId);
        }
        for (const child of getFrameChildren(nextItems, item.id)) {
          changedIds.add(child.id);
        }

        if (relayoutResult.changedIds.length > 0) {
          setItemsAndSync(nextItems);
        }
      }

      persistItems(
        nextItems.filter((candidate) => changedIds.has(candidate.id)),
      );
      syncConnectorAnchorsForItems(
        [...changedIds],
        itemsRef,
        setConnectorsAndSync,
      );
      syncSegmentConnectionsForItems(
        [...changedIds],
        itemsRef,
        setItemsAndSync,
      );
    }
    recordHistoryCheckpoint(resize.snapshot);
    return true;
  }

  return {
    startResize,
    handleResizeMove,
    handleResizeEnd,
  };
}
