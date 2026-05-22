import { useCallback, useEffect, useState } from 'react';
import {
  getPageBoardData,
  regulatePage,
  replacePageBoardState,
} from './api';
import { normalizeConnectorArrowsToSegments } from './canvasHelpers/connectorAnchors';
import type { ConnectorsUpdater, ItemsUpdater, SegmentDraftState } from './canvasTypes';
import type { Viewport } from './types';

type Params = {
  pageId: string;
  setItemsAndSync: (updater: ItemsUpdater) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void;
  setViewportAndSync: (viewport: Viewport) => void;
  clearSelection: () => void;
  setEditingId: (id: string | null) => void;
  setSegmentDraft: (draft: SegmentDraftState | null) => void;
  resetHistory: () => void;
};

/**
 * Handles initial board data loading and page regulation.
 * Extracted from Canvas.tsx to isolate data-fetching side effects.
 */
export function useCanvasBoardLoader({
  pageId,
  setItemsAndSync,
  setConnectorsAndSync,
  setViewportAndSync,
  clearSelection,
  setEditingId,
  setSegmentDraft,
  resetHistory,
}: Params) {
  const [isRegulatingPage, setIsRegulatingPage] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getPageBoardData(pageId, controller.signal);
        const normalized = normalizeConnectorArrowsToSegments(
          data.board_items,
          data.connector_links,
        );
        setItemsAndSync(normalized.items);
        setConnectorsAndSync(data.connector_links);
        setViewportAndSync({
          x: data.page.viewport_x,
          y: data.page.viewport_y,
          zoom: data.page.zoom,
        });
        clearSelection();
        setEditingId(null);
        setSegmentDraft(null);
        resetHistory();
        if (normalized.migratedIds.length > 0) {
          void replacePageBoardState(pageId, {
            board_items: normalized.items,
            connector_links: data.connector_links,
          }).catch((err) => {
            console.error('[Canvas] Failed to migrate connector arrows', err);
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[Canvas] Failed to load board data', err);
      }
    }

    void load();
    return () => controller.abort();
  }, [
    pageId,
    resetHistory,
    clearSelection,
    setConnectorsAndSync,
    setItemsAndSync,
    setViewportAndSync,
    setEditingId,
    setSegmentDraft,
  ]);

  const handleRegulatePage = useCallback(async () => {
    if (isRegulatingPage) return;
    setIsRegulatingPage(true);
    try {
      const data = await regulatePage(pageId);
      const normalized = normalizeConnectorArrowsToSegments(
        data.board_items,
        data.connector_links,
      );
      setItemsAndSync(normalized.items);
      setConnectorsAndSync(data.connector_links);
      setViewportAndSync({
        x: data.page.viewport_x,
        y: data.page.viewport_y,
        zoom: data.page.zoom,
      });
      clearSelection();
      setEditingId(null);
      setSegmentDraft(null);
      resetHistory();
      if (normalized.migratedIds.length > 0) {
        void replacePageBoardState(pageId, {
          board_items: normalized.items,
          connector_links: data.connector_links,
        }).catch((err) => {
          console.error('[Canvas] Failed to persist regulated segments', err);
        });
      }
    } catch (err) {
      console.error('[Canvas] Failed to regulate page XML', err);
    } finally {
      setIsRegulatingPage(false);
    }
  }, [
    clearSelection,
    isRegulatingPage,
    pageId,
    resetHistory,
    setConnectorsAndSync,
    setItemsAndSync,
    setViewportAndSync,
    setEditingId,
    setSegmentDraft,
  ]);

  return { isRegulatingPage, handleRegulatePage };
}
