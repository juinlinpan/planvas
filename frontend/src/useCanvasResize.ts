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
import type { ConnectorsUpdater, ItemsUpdater, ResizeState } from './canvasTypes';

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
      startMouseX: e.clientX,
      startMouseY: e.clientY,
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

    const rawRect = {
      x: item.x,
      y: item.y,
      width: resize.startWidth + dx,
      height: resize.startHeight + dy,
    };
    const magnetRect = shouldUseMagnet
      ? magnetResizeRect(rawRect, CANVAS_GRID_SIZE, MAGNET_TOLERANCE)
      : { width: rawRect.width, height: rawRect.height };
    const nextSize = clampItemSize(
      item.type,
      magnetRect.width,
      magnetRect.height,
      item.data_json,
    );

    setItemsAndSync((current) => {
      const resizedItems = current.map((currentItem) => {
        if (currentItem.id !== resize.itemId) {
          return currentItem;
        }

        const updated = {
          ...currentItem,
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
