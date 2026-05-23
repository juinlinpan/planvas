import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import { readStoredBoolean } from './utils';
import {
  type BoardItem,
  type BoardItemPayload,
  type ConnectorLink,
  createBoardItem,
  replacePageBoardState,
  type Page,
  type PageBoardData,
  type ProjectNote,
} from './api';
import {
  findFrameDropTarget,
  getFrameChildren,
  getFrameOverlapScore,
  isFrame,
  isSmallItem,
} from './canvasHelpers/frameLayout';
import {
  findNearestConnectorAnchor,
  getItemConnectorAnchors,
  normalizeConnectorArrowsToSegments,
} from './canvasHelpers/connectorAnchors';
import {
  findTableCellDropTarget,
  relayoutTableItems,
} from './canvasHelpers/tableLayout';
import {
  getPrimarySelectionId,
  getUniqueItemIds,
  isHiddenByCollapsedFrame,
} from './canvasHelpers/selection';
import {
  getLayerBlockIds,
  sortItemsByLayer,
} from './canvasHelpers/layerOrdering';
import { summarizeFrameChild } from './canvasHelpers/contentSummary';
import type { AnchorHit, TableCellHit } from './canvasHelpers/types';
import {
  CANVAS_GRID_SIZE,
  CONNECTOR_SNAP_THRESHOLD,
} from './canvasConstants';
import { snapPointToGrid } from './magnet';
import type {
  ConnectorsUpdater,
  DragState,
  EditSessionState,
  ItemsUpdater,
  PanState,
  ResizeState,
  SegmentDraftState,
  SegmentDraftTool,
  SegmentEndpointDragState,
  TableInsertDraftState,
  TableInsertPreviewState,
  MarqueeSelectionState,
  WaypointDragState,
} from './canvasTypes';

import { useCanvasFrameAnimation } from './useCanvasFrameAnimation';
import { useCanvasHistory } from './useCanvasHistory';
import { useCanvasItemActions } from './useCanvasItemActions';
import { useCanvasMouseHandlers } from './useCanvasMouseHandlers';
import { Inspector } from './Inspector';
import {
  buildSegmentGeometry,
  canTranslateSegmentItem,
  type Point,
  type SegmentConnection,
  type SegmentEndpoint,
} from './segmentData';
import {
  createTableData,
  clearTableCells,
  deleteCols,
  deleteRows,
  getChildItemIdsInCols,
  getChildItemIdsInRows,
  getTableCellIdsInCols,
  getTableCellIdsInRows,
  getTableCellDeleteOperation,
  parseTableData,
  serializeTableData,
  TABLE_MAX_DIMENSION,
  updateTableCell,
} from './tableData';
import {
  TABLE_INSERT_PREVIEW_CELL_HEIGHT,
  TABLE_INSERT_PREVIEW_CELL_WIDTH,
  getDirectionalTableInsertDelta,
  getTableInsertDimensions,
  getTableInsertDirection,
  getTableInsertItemSize,
  getTableInsertPreviewPosition,
  type TableInsertDockPosition,
  type TableInsertDirection,
} from './tableInsertPreview';
import { Toolbar } from './Toolbar';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { SegmentShape } from './items/SegmentShape';

import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_TYPE,
  type ActiveTool,
  type Viewport,
} from './types';
import {
  CANVAS_BACKGROUND_STORAGE_KEY,
  DEFAULT_CANVAS_BACKGROUND_MODE,
  parseCanvasBackgroundMode,
  type CanvasBackgroundMode,
} from './canvasBackground';
import {
  getCanvasContextMenuActionKeys,
  getCanvasContextMenuPosition,
  isCanvasContextMenuActionDisabled,
  type CanvasContextMenuActionKey,
  type CanvasContextMenuState,
} from './canvasContextMenu';
import {
  adjustResetZoomByStep,
  adjustZoomByStep,
  getDisplayZoom,
  getResetZoom,
  zoomViewportAroundPoint,
} from './viewport';
import { parseProjectDefaultStyle } from './itemStyles';
import { getMinimapLayout } from './minimap';
import { syncMarkdownBackedItems } from './noteSync';
import { useCanvasBoardLoader } from './useCanvasBoardLoader';
import { useCanvasViewportPersistence } from './useCanvasViewportPersistence';
import { CanvasRibbon } from './CanvasRibbon';
import { CanvasMinimap, MINIMAP_WIDTH, MINIMAP_HEIGHT } from './CanvasMinimap';
import { CanvasContextMenuPortal } from './CanvasContextMenuPortal';

type Props = {
  page: Page;
  cachedBoardData?: PageBoardData | null;
  projectNotes?: ProjectNote[];
  draggedProjectNoteFile?: string | null;
  onViewportChange?: (viewport: Viewport) => void;
  onBoardDataCacheChange?: (data: PageBoardData) => void;
  onProjectNotesChanged?: () => void;
  onOpenNote?: (noteFile: string) => void;
  onImportPage: (format: 'mermaid') => void;
  onImportFromProject: () => void;
  onExportPage: (format: 'png' | 'pptx' | 'mermaid' | 'html') => void;
  importExportDisabled: boolean;
  projectDefaultStyleJson?: string | null;
};
type TableInspectorSelection = {
  tableId: string;
  cellIds: string[];
};

const INSPECTOR_COLLAPSED_STORAGE_KEY = 'whiteboard.canvasInspectorCollapsed';
const RESET_ZOOM_STORAGE_KEY = 'whiteboard.resetZoomTarget';

function readStoredNumber(key: string, fallbackValue: number): number {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) {
    return fallbackValue;
  }

  const storedValue = Number(rawValue);
  return Number.isFinite(storedValue) ? storedValue : fallbackValue;
}

function createOptimisticId(): string {
  return `optimistic-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function createOptimisticItem(
  payload: BoardItemPayload,
  contentOverride?: string | null,
): BoardItem {
  const timestamp = new Date().toISOString();
  return {
    ...payload,
    id: createOptimisticId(),
    content:
      contentOverride !== undefined ? contentOverride : payload.content,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function resolveSidebarNoteDragFile(
  projectNotes: ProjectNote[],
  draggedProjectNoteFile: string | null,
  dataTransfer: Pick<DataTransfer, 'getData'>,
): string | null {
  const rawValue = dataTransfer.getData('text/plain');
  const prefix = 'notes:';
  if (rawValue.startsWith(prefix)) {
    const noteFile = rawValue.slice(prefix.length);
    if (projectNotes.some((note) => note.note_file === noteFile)) {
      return noteFile;
    }
  }

  return projectNotes.some((note) => note.note_file === draggedProjectNoteFile)
    ? draggedProjectNoteFile
    : null;
}

export function Canvas({
  page,
  cachedBoardData = null,
  projectNotes = [],
  draggedProjectNoteFile = null,
  onViewportChange,
  onBoardDataCacheChange,
  onProjectNotesChanged,
  onOpenNote,
  onImportPage,
  onImportFromProject,
  onExportPage,
  importExportDisabled,
  projectDefaultStyleJson = null,
}: Props) {
  const [viewport, setViewport] = useState<Viewport>({
    x: page.viewport_x,
    y: page.viewport_y,
    zoom: page.zoom,
  });
  const [items, setItems] = useState<BoardItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorLink[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(
    () => {
      if (typeof window === 'undefined') {
        return DEFAULT_CANVAS_BACKGROUND_MODE;
      }

      return parseCanvasBackgroundMode(
        window.localStorage.getItem(CANVAS_BACKGROUND_STORAGE_KEY),
      );
    },
  );
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [resetZoomTarget, setResetZoomTarget] = useState(() =>
    getResetZoom(readStoredNumber(RESET_ZOOM_STORAGE_KEY, getResetZoom())),
  );
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraftState | null>(
    null,
  );
  const [anchorIndicatorItems, setAnchorIndicatorItems] = useState<BoardItem[]>(
    [],
  );
  const [activeAnchorHit, setActiveAnchorHit] = useState<AnchorHit | null>(
    null,
  );
  const [deletingWaypointInfo, setDeletingWaypointInfo] = useState<{
    itemId: string;
    waypointIndex: number;
  } | null>(null);
  const [activeFrameDropTargetId, setActiveFrameDropTargetId] = useState<
    string | null
  >(null);
  const [activeTableDropTarget, setActiveTableDropTarget] =
    useState<TableCellHit | null>(null);
  const [tableInsertPreview, setTableInsertPreview] =
    useState<TableInsertPreviewState | null>(null);
  const [toolbarTableInsertPreview, setToolbarTableInsertPreview] =
    useState<TableInsertPreviewState | null>(null);
  const [tableInspectorSelection, setTableInspectorSelection] =
    useState<TableInspectorSelection | null>(null);
  const [tableCellSelectionResetKey, setTableCellSelectionResetKey] =
    useState(0);
  const [marqueeSelection, setMarqueeSelection] =
    useState<MarqueeSelectionState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 1, height: 1 });
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() =>
    readStoredBoolean(INSPECTOR_COLLAPSED_STORAGE_KEY, false),
  );
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(
    null,
  );
  const projectDefaultStyle = useMemo(
    () => parseProjectDefaultStyle(projectDefaultStyleJson),
    [projectDefaultStyleJson],
  );

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const segmentEndpointDragRef = useRef<SegmentEndpointDragState | null>(null);
  const waypointDragRef = useRef<WaypointDragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const tableInsertDraftRef = useRef<TableInsertDraftState | null>(null);
  const marqueeSelectionRef = useRef<{
    startClientX: number;
    startClientY: number;
    appendToSelection: boolean;
    baseSelectionIds: string[];
  } | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSessionRef = useRef<EditSessionState | null>(null);
  const toolbarTableInsertOriginRef = useRef<{
    clientX: number;
    clientY: number;
    direction: TableInsertDirection;
  } | null>(null);

  const cacheBoardData = useCallback(
    (
      nextItems: BoardItem[] = itemsRef.current,
      nextConnectors: ConnectorLink[] = connectorsRef.current,
      nextViewport: Viewport = viewportRef.current,
    ) => {
      onBoardDataCacheChange?.({
        page: {
          ...page,
          viewport_x: nextViewport.x,
          viewport_y: nextViewport.y,
          zoom: nextViewport.zoom,
        },
        board_items: nextItems,
        connector_links: nextConnectors,
      });
    },
    [onBoardDataCacheChange, page],
  );

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
    connectorsRef.current = connectors;
    selectedIdsRef.current = selectedIds;
  }, [connectors, items, selectedIds, viewport]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      });
    };

    updateSize();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { frameItemAnimations, triggerFrameItemAnimation } =
    useCanvasFrameAnimation();

  useEffect(() => {
    const drag = dragRef.current;
    if (drag === null) {
      if (activeFrameDropTargetId !== null) {
        setActiveFrameDropTargetId(null);
      }
      if (activeTableDropTarget !== null) {
        setActiveTableDropTarget(null);
      }
      return;
    }

    let nextTargetId: string | null = null;
    let bestScore = 0;
    let nextTableHit: TableCellHit | null = null;

    for (const draggedItemId of drag.selectedItemIds) {
      const draggedItem = items.find(
        (candidate) => candidate.id === draggedItemId,
      );
      if (!draggedItem || !isSmallItem(draggedItem)) {
        continue;
      }

      const frame = findFrameDropTarget(draggedItem, items);
      if (frame) {
        const score = getFrameOverlapScore(draggedItem, frame);
        if (score > bestScore) {
          bestScore = score;
          nextTargetId = frame.id;
        }
      }

      // Table cell drop detection (only when no frame target)
      if (!nextTargetId) {
        const tableHit = findTableCellDropTarget(draggedItem, items);
        if (tableHit) {
          nextTableHit = tableHit;
        }
      }
    }

    if (nextTargetId !== activeFrameDropTargetId) {
      setActiveFrameDropTargetId(nextTargetId);
    }
    const prevTableHit = activeTableDropTarget;
    const tableHitChanged =
      nextTableHit?.cellId !== prevTableHit?.cellId ||
      nextTableHit?.tableId !== prevTableHit?.tableId;
    if (tableHitChanged) {
      setActiveTableDropTarget(nextTableHit);
    }
  }, [activeFrameDropTargetId, activeTableDropTarget, items]);

  const setItemsAndSync = useCallback((updater: ItemsUpdater) => {
    const nextItems =
      typeof updater === 'function' ? updater(itemsRef.current) : updater;
    itemsRef.current = nextItems;
    setItems(nextItems);
    cacheBoardData(nextItems);
  }, [cacheBoardData]);

  useEffect(() => {
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      return;
    }

    const syncedItems = syncMarkdownBackedItems(
      currentItems,
      projectNotes,
      editingId,
    );
    if (syncedItems !== currentItems) {
      setItemsAndSync(syncedItems);
    }
  }, [editingId, projectNotes, setItemsAndSync]);

  const setViewportAndSync = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
    cacheBoardData(undefined, undefined, nextViewport);
  }, [cacheBoardData]);

  const setConnectorsAndSync = useCallback((updater: ConnectorsUpdater) => {
    const nextConnectors =
      typeof updater === 'function' ? updater(connectorsRef.current) : updater;
    connectorsRef.current = nextConnectors;
    setConnectors(nextConnectors);
    cacheBoardData(undefined, nextConnectors);
  }, [cacheBoardData]);

  const setSelection = useCallback((nextSelectedIds: string[]) => {
    const availableIds = new Set(itemsRef.current.map((item) => item.id));
    const normalizedSelection = getUniqueItemIds(
      nextSelectedIds.filter((itemId) => availableIds.has(itemId)),
    );
    selectedIdsRef.current = normalizedSelection;
    setSelectedIds(normalizedSelection);
  }, []);

  const clearSelection = useCallback(() => {
    selectedIdsRef.current = [];
    setSelectedIds([]);
  }, []);

  const handleToolChange = useCallback((tool: ActiveTool) => {
    if (tool !== ITEM_TYPE.table) {
      tableInsertDraftRef.current = null;
      setTableInsertPreview(null);
      toolbarTableInsertOriginRef.current = null;
      setToolbarTableInsertPreview(null);
    }
    setActiveTool(tool);
  }, []);

  const getViewportCenterWorldPoint = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    if (!rect) {
      return {
        x: -vp.x / vp.zoom,
        y: -vp.y / vp.zoom,
      };
    }

    return {
      x: (rect.width / 2 - vp.x) / vp.zoom,
      y: (rect.height / 2 - vp.y) / vp.zoom,
    };
  }, []);

  const handleToolbarTableClick = useCallback(
    (
      clientX: number,
      clientY: number,
      toolbarPosition: TableInsertDockPosition,
    ) => {
      if (toolbarTableInsertOriginRef.current !== null) {
        toolbarTableInsertOriginRef.current = null;
        setToolbarTableInsertPreview(null);
        handleToolChange('select');
        return;
      }

      const direction = getTableInsertDirection(toolbarPosition);
      tableInsertDraftRef.current = null;
      setTableInsertPreview(null);
      toolbarTableInsertOriginRef.current = { clientX, clientY, direction };
      setToolbarTableInsertPreview({
        cursorX: clientX,
        cursorY: clientY,
        cols: 1,
        rows: 1,
        isActive: true,
        direction,
      });
      setActiveTool(ITEM_TYPE.table);
    },
    [handleToolChange],
  );

  const primarySelectedId = useMemo(
    () => getPrimarySelectionId(selectedIds),
    [selectedIds],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === primarySelectedId) ?? null,
    [items, primarySelectedId],
  );

  useEffect(() => {
    if (
      selectedItem?.type !== ITEM_TYPE.table ||
      tableInspectorSelection?.tableId !== selectedItem.id
    ) {
      setTableInspectorSelection(null);
    }
  }, [selectedItem, tableInspectorSelection]);

  const {
    canUndo,
    canRedo,
    isHistorySyncing,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    resetHistory,
    clearPendingItemSave,
    restoreBoardSnapshot,
    handleUndo,
    handleRedo,
  } = useCanvasHistory({
    pageId: page.id,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    itemSaveTimerRef: itemSaveTimer,
    editSessionRef,
    dragRef,
    resizeRef,
    panRef,
    setItemsAndSync,
    setConnectorsAndSync,
    setSelection,
    setEditingId,
    setSegmentDraft,
  });

  const {
    isPasting,
    handleCreateItem,
    handleCreateSegmentItem,
    handleDeleteItems,
    handleDeleteSelection,
    handleCopySelection,
    handleCutSelection,
    hasClipboardData,
    handlePasteSelection,
    handleLayerChange,
    handleItemUpdate,
    handleEditEnd,
    handleTransformToNote,
    flushPendingItemSave,
  } = useCanvasItemActions({
    pageId: page.id,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    itemSaveTimerRef: itemSaveTimer,
    editSessionRef,
    editingId,
    primarySelectedId,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    setItemsAndSync,
    setConnectorsAndSync,
    setSelection,
    setEditingId,
    setActiveTool: handleToolChange,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
    projectDefaultStyle,
    onProjectNotesChanged,
  });

  // Keep a stable ref to the flush function so the cleanup effect (with [] deps)
  // can always call the latest version without capturing a stale closure.
  const flushPendingItemSaveRef = useRef(flushPendingItemSave);
  flushPendingItemSaveRef.current = flushPendingItemSave;

  const { isRegulatingPage, handleRegulatePage } = useCanvasBoardLoader({
    pageId: page.id,
    cachedBoardData,
    onBoardDataCacheChange,
    setItemsAndSync,
    setConnectorsAndSync,
    setViewportAndSync,
    clearSelection,
    setEditingId,
    setSegmentDraft,
    resetHistory,
  });

  const { scheduleViewportSave } = useCanvasViewportPersistence({
    pageId: page.id,
    onViewportChange,
  });


  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(CANVAS_BACKGROUND_STORAGE_KEY, backgroundMode);
  }, [backgroundMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      INSPECTOR_COLLAPSED_STORAGE_KEY,
      String(isInspectorCollapsed),
    );
  }, [isInspectorCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      RESET_ZOOM_STORAGE_KEY,
      String(resetZoomTarget),
    );
  }, [resetZoomTarget]);

  useEffect(() => {
    const currentOrigin = toolbarTableInsertOriginRef.current;
    if (currentOrigin === null || toolbarTableInsertPreview === null) {
      return;
    }
    const origin = currentOrigin;

    function handleWindowMouseMove(event: MouseEvent) {
      const delta = getDirectionalTableInsertDelta(
        event.clientX - origin.clientX,
        event.clientY - origin.clientY,
        origin.direction,
      );
      const dims = getTableInsertDimensions(
        delta.x,
        delta.y,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      setToolbarTableInsertPreview({
        cursorX: origin.clientX,
        cursorY: origin.clientY,
        cols: dims.cols,
        rows: dims.rows,
        isActive: true,
        direction: origin.direction,
      });
    }

    function handleWindowMouseDown(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-tool-id="table"]') !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const delta = getDirectionalTableInsertDelta(
        event.clientX - origin.clientX,
        event.clientY - origin.clientY,
        origin.direction,
      );
      const dims = getTableInsertDimensions(
        delta.x,
        delta.y,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      const size = getTableInsertItemSize(dims.cols, dims.rows);
      const center = getViewportCenterWorldPoint();

      toolbarTableInsertOriginRef.current = null;
      setToolbarTableInsertPreview(null);
      handleToolChange('select');
      void handleCreateItem({
        type: ITEM_TYPE.table,
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
        width: size.width,
        height: size.height,
        dataJson: serializeTableData(createTableData(dims.rows, dims.cols)),
      });
    }

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mousedown', handleWindowMouseDown, true);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mousedown', handleWindowMouseDown, true);
    };
  }, [
    getViewportCenterWorldPoint,
    handleCreateItem,
    handleToolChange,
    toolbarTableInsertPreview,
  ]);

  const selectedChildCount = useMemo(() => {
    if (selectedItem?.type !== ITEM_TYPE.frame) {
      return 0;
    }

    return getFrameChildren(items, selectedItem.id).length;
  }, [items, selectedItem]);

  const visibleItems = useMemo(
    () =>
      [...items]
        .filter((item) => !isHiddenByCollapsedFrame(item, items))
        .sort(
          (a, b) =>
            a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
        ),
    [items],
  );
  const frameChildrenById = useMemo(() => {
    const childrenById = new Map<string, BoardItem[]>();
    for (const item of items) {
      if (item.parent_item_id === null) {
        continue;
      }

      const children = childrenById.get(item.parent_item_id);
      if (children === undefined) {
        childrenById.set(item.parent_item_id, [item]);
      } else {
        children.push(item);
      }
    }

    return childrenById;
  }, [items]);
  const frameChildSummariesById = useMemo(() => {
    const summariesById = new Map<
      string,
      ReturnType<typeof summarizeFrameChild>[]
    >();
    for (const [frameId, childItems] of frameChildrenById) {
      summariesById.set(frameId, childItems.map(summarizeFrameChild));
    }

    return summariesById;
  }, [frameChildrenById]);

  const segmentDraftPreviewItem = useMemo(() => {
    if (segmentDraft === null) {
      return null;
    }

    const geometry = buildSegmentGeometry(
      segmentDraft.start,
      segmentDraft.end,
      null,
    );
    return {
      id: '__segment-draft__',
      page_id: page.id,
      parent_item_id: null,
      category:
        ITEM_CATEGORY_FOR_TYPE[segmentDraft.type] ?? ITEM_CATEGORY.shape,
      type: segmentDraft.type,
      title: null,
      content: null,
      content_format: null,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: geometry.rotation,
      z_index: Number.MAX_SAFE_INTEGER,
      is_collapsed: false,
      style_json: null,
      data_json: geometry.data_json,
      created_at: 'draft',
      updated_at: 'draft',
    } satisfies BoardItem;
  }, [page.id, segmentDraft]);

  const minimapLayout = useMemo(
    () =>
      getMinimapLayout(items, viewport, containerSize, {
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
      }),
    [containerSize, items, viewport],
  );



  useEffect(
    () => () => {
      // Flush any pending item save (don't cancel — the user's last edit must
      // reach the backend even when the Canvas unmounts due to a page switch or
      // the markdown-editor tab opening).
      flushPendingItemSaveRef.current();
    },
    [],
  );

  const handleDeleteTableCells = useCallback(
    async (tableId: string, cellIds: string[]): Promise<boolean> => {
      if (cellIds.length === 0) {
        return false;
      }

      const tableItem = itemsRef.current.find(
        (item) => item.id === tableId && item.type === ITEM_TYPE.table,
      );
      if (tableItem === undefined) {
        setTableInspectorSelection(null);
        setTableCellSelectionResetKey((current) => current + 1);
        return false;
      }

      const tableData = parseTableData(tableItem.data_json);
      const operation = getTableCellDeleteOperation(tableData, cellIds);
      if (operation === null) {
        setTableInspectorSelection(null);
        setTableCellSelectionResetKey((current) => current + 1);
        return false;
      }

      let nextTableData = tableData;
      let nextWidth = tableItem.width;
      let nextHeight = tableItem.height;
      let clearedChildItemIds: string[] = [];

      if (operation.type === 'rows') {
        const removedFraction = operation.rowIndexes.reduce(
          (sum, rowIndex) => sum + (tableData.rowHeights[rowIndex] ?? 0),
          0,
        );
        const clearedCells = clearTableCells(
          tableData,
          getTableCellIdsInRows(tableData, operation.rowIndexes),
        );
        nextTableData = deleteRows(clearedCells.data, operation.rowIndexes);
        nextHeight = Math.max(1, tableItem.height * (1 - removedFraction));
        clearedChildItemIds = getUniqueItemIds([
          ...clearedCells.clearedChildItemIds,
          ...getChildItemIdsInRows(
            tableData,
            operation.rowIndexes,
          ),
        ]);
      } else if (operation.type === 'cols') {
        const removedFraction = operation.colIndexes.reduce(
          (sum, colIndex) => sum + (tableData.colWidths[colIndex] ?? 0),
          0,
        );
        const clearedCells = clearTableCells(
          tableData,
          getTableCellIdsInCols(tableData, operation.colIndexes),
        );
        nextTableData = deleteCols(clearedCells.data, operation.colIndexes);
        nextWidth = Math.max(1, tableItem.width * (1 - removedFraction));
        clearedChildItemIds = getUniqueItemIds([
          ...clearedCells.clearedChildItemIds,
          ...getChildItemIdsInCols(tableData, operation.colIndexes),
        ]);
      } else {
        const clearedCells = clearTableCells(tableData, operation.cellIds);
        nextTableData = clearedCells.data;
        clearedChildItemIds = clearedCells.clearedChildItemIds;
      }

      const updatedTableItem = {
        ...tableItem,
        width: nextWidth,
        height: nextHeight,
        data_json: serializeTableData(nextTableData),
      };
      const clearedChildIdSet = new Set(clearedChildItemIds);
      const snapshotBeforeDelete = captureBoardSnapshot();
      let nextItemsAfterDelete = itemsRef.current;

      pushUndoSnapshot(snapshotBeforeDelete);
      setItemsAndSync((current) => {
        const withoutDeletedChildren = current
          .filter((item) => !clearedChildIdSet.has(item.id))
          .map((item) => (item.id === tableItem.id ? updatedTableItem : item));
        const relayoutResult = relayoutTableItems(withoutDeletedChildren, [
          tableItem.id,
        ]);
        nextItemsAfterDelete = relayoutResult.items;
        return nextItemsAfterDelete;
      });
      setSelection([tableItem.id]);
      setEditingId(tableItem.id);
      setTableInspectorSelection(null);
      setTableCellSelectionResetKey((current) => current + 1);

      try {
        await replacePageBoardState(page.id, {
          board_items: nextItemsAfterDelete,
          connector_links: connectorsRef.current,
        });
      } catch (err) {
        console.error('[Canvas] Failed to delete selected table cells', err);
      }

      return true;
    },
    [
      captureBoardSnapshot,
      itemsRef,
      pushUndoSnapshot,
      setEditingId,
      setItemsAndSync,
      setSelection,
      page.id,
    ],
  );

  const handleDeleteSelectedTableCells =
    useCallback(async (): Promise<boolean> => {
      const selection = tableInspectorSelection;
      if (selection === null) {
        return false;
      }

      return handleDeleteTableCells(selection.tableId, selection.cellIds);
    }, [handleDeleteTableCells, tableInspectorSelection]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' && !isSpaceRef.current) {
        const tag =
          (document.activeElement as HTMLElement | null)?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();
        isSpaceRef.current = true;
        setIsSpaceDown(true);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') {
        isSpaceRef.current = false;
        setIsSpaceDown(false);
        panRef.current = null;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      const isModifierDown = e.ctrlKey || e.metaKey;
      const normalizedKey = e.key.toLowerCase();

      if (isModifierDown && !e.shiftKey && normalizedKey === 'c') {
        e.preventDefault();
        handleCopySelection();
        return;
      }

      if (isModifierDown && !e.shiftKey && normalizedKey === 'x') {
        e.preventDefault();
        void handleCutSelection();
        return;
      }

      if (isModifierDown && !e.shiftKey && normalizedKey === 'v') {
        e.preventDefault();
        void handlePasteSelection();
        return;
      }

      if (isModifierDown && normalizedKey === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          void handleRedo();
          return;
        }

        void handleUndo();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        void handleDeleteSelectedTableCells()
          .then((deletedTableCells) => {
            if (!deletedTableCells && selectedIdsRef.current.length > 0) {
              void handleDeleteSelection();
            }
          })
          .catch((err) => {
            console.error('[Canvas] Failed to handle delete shortcut', err);
          });
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        clearSelection();
        setEditingId(null);
        setSegmentDraft(null);
        handleToolChange('select');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clearSelection,
    handleCopySelection,
    handleCutSelection,
    handleDeleteSelectedTableCells,
    handleDeleteSelection,
    handlePasteSelection,
    handleRedo,
    handleToolChange,
    handleUndo,
  ]);

  useEffect(() => {
    function closeContextMenu() {
      setContextMenu(null);
    }

    window.addEventListener('mousedown', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    return () => {
      window.removeEventListener('mousedown', closeContextMenu);
      window.removeEventListener('resize', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') {
        handleToolChange('select');
      }
      if (key === 'l') {
        handleToolChange('line');
      }
      if (key === 't') {
        handleToolChange('table');
      }
      if (key === 'x') {
        handleToolChange('text_box');
      }
      if (key === 's') {
        handleToolChange('sticky_note');
      }
      if (key === 'n') {
        handleToolChange('note_paper');
      }
      if (key === 'f') {
        handleToolChange('frame');
      }
      if (key === 'a') {
        handleToolChange('arrow');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToolChange]);

  useEffect(() => {
    if (segmentDraft !== null && activeTool !== segmentDraft.type) {
      setSegmentDraft(null);
    }

    // Clear anchor indicators when switching away from line/arrow tool
    if (activeTool !== 'line' && activeTool !== 'arrow') {
      setAnchorIndicatorItems([]);
      setActiveAnchorHit(null);
    }
  }, [activeTool, segmentDraft]);

  function screenToWorld(screenX: number, screenY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const vp = viewportRef.current;
    return {
      x: (screenX - rect.left - vp.x) / vp.zoom,
      y: (screenY - rect.top - vp.y) / vp.zoom,
    };
  }

  function getSidebarNoteDragFile(event: ReactDragEvent): string | null {
    return resolveSidebarNoteDragFile(
      projectNotes,
      draggedProjectNoteFile,
      event.dataTransfer,
    );
  }

  async function handleProjectNoteDrop(
    noteFile: string,
    clientX: number,
    clientY: number,
  ): Promise<void> {
    const note = projectNotes.find((entry) => entry.note_file === noteFile);
    if (note === undefined) {
      return;
    }

    const snapshotBeforeCreate = captureBoardSnapshot();
    const worldPoint = screenToWorld(clientX, clientY);
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;

    const payload: BoardItemPayload = {
      page_id: page.id,
      parent_item_id: null,
      category: ITEM_CATEGORY.small_item,
      type: ITEM_TYPE.note_paper,
      title: note.title,
      content: null,
      content_format: 'markdown',
      x: worldPoint.x,
      y: worldPoint.y,
      width: 264,
      height: 216,
      rotation: 0,
      z_index: maxZ + 1,
      is_collapsed: false,
      style_json: null,
      data_json: JSON.stringify({
        noteFile: note.note_file,
        noteFileManaged: false,
      }),
    };
    const optimisticItem = createOptimisticItem(payload, note.content);

    setItemsAndSync((current) => [...current, optimisticItem]);
    setSelection([optimisticItem.id]);
    setEditingId(null);

    try {
      const created = await createBoardItem(payload);
      pushUndoSnapshot(snapshotBeforeCreate);
      setItemsAndSync((current) =>
        current.map((item) =>
          item.id === optimisticItem.id ? created : item,
        ),
      );
      setSelection([created.id]);
      onProjectNotesChanged?.();
    } catch (err) {
      setItemsAndSync((current) =>
        current.filter((item) => item.id !== optimisticItem.id),
      );
      setSelection([]);
      console.error('[Canvas] Failed to place project note', err);
    }
  }

  const handleCanvasContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setEditingId(null);
      setContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        scope: 'canvas',
        selectionCount: 0,
        hasClipboardData: hasClipboardData(),
        canBringForward: false,
        canSendBackward: false,
        canBringToFront: false,
        canSendToBack: false,
        isStickyNoteOnly: false,
      });
    },
    [hasClipboardData],
  );

  const handleItemContextMenu = useCallback(
    (event: React.MouseEvent, itemId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const isSelectedItem = selectedIdsRef.current.includes(itemId);
      if (!isSelectedItem) {
        setSelection([itemId]);
      }
      const targetSelectionCount = isSelectedItem
        ? selectedIdsRef.current.length
        : 1;
      const ordered = sortItemsByLayer(itemsRef.current);
      const targetId = isSelectedItem
        ? getPrimarySelectionId(selectedIdsRef.current)
        : itemId;
      const movingIds =
        targetId === null ? [] : getLayerBlockIds(ordered, targetId);
      const movingSet = new Set(movingIds);
      const lastMovingIndex = ordered.reduce(
        (lastIndex, item, index) =>
          movingSet.has(item.id) ? index : lastIndex,
        -1,
      );
      const canBringForward = lastMovingIndex < ordered.length - 1;
      const canSendBackward =
        ordered.findIndex((item) => movingSet.has(item.id)) > 0;

      const isStickyNoteOnly = isSelectedItem
        ? selectedIdsRef.current.every(
            (id) =>
              itemsRef.current.find((it) => it.id === id)?.type ===
              ITEM_TYPE.sticky_note,
          )
        : itemsRef.current.find((it) => it.id === itemId)?.type ===
          ITEM_TYPE.sticky_note;

      setEditingId(null);
      setContextMenu({
        clientX: event.clientX,
        clientY: event.clientY,
        scope: 'selection',
        selectionCount: targetSelectionCount,
        hasClipboardData: hasClipboardData(),
        canBringForward,
        canSendBackward,
        canBringToFront: canBringForward,
        canSendToBack: canSendBackward,
        isStickyNoteOnly: isStickyNoteOnly ?? false,
      });
    },
    [hasClipboardData, setSelection],
  );

  const handleContextMenuPaste = useCallback(() => {
    if (!hasClipboardData()) {
      return;
    }
    setContextMenu(null);
    void handlePasteSelection();
  }, [handlePasteSelection, hasClipboardData]);

  const handleContextMenuCopy = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    handleCopySelection();
    setContextMenu(null);
  }, [handleCopySelection]);

  const handleContextMenuCut = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    setContextMenu(null);
    void handleCutSelection();
  }, [handleCutSelection]);

  const handleContextMenuDelete = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    setContextMenu(null);
    void handleDeleteSelectedTableCells()
      .then((deletedTableCells) => {
        if (!deletedTableCells) {
          void handleDeleteSelection();
        }
      })
      .catch((err) => {
        console.error('[Canvas] Failed to handle context delete', err);
      });
  }, [handleDeleteSelectedTableCells, handleDeleteSelection]);

  const handleContextMenuTransformToNote = useCallback(() => {
    const targetId = getPrimarySelectionId(selectedIdsRef.current);
    if (targetId === null) {
      return;
    }
    setContextMenu(null);
    void handleTransformToNote(targetId);
  }, [handleTransformToNote]);

  const handleContextMenuBringForward = useCallback(() => {
    handleLayerChange('bringForward');
    setContextMenu(null);
  }, [handleLayerChange]);

  const handleContextMenuSendBackward = useCallback(() => {
    handleLayerChange('sendBackward');
    setContextMenu(null);
  }, [handleLayerChange]);

  const handleContextMenuBringToFront = useCallback(() => {
    handleLayerChange('bringToFront');
    setContextMenu(null);
  }, [handleLayerChange]);

  const handleContextMenuSendToBack = useCallback(() => {
    handleLayerChange('sendToBack');
    setContextMenu(null);
  }, [handleLayerChange]);

  const contextMenuActions = useMemo(
    () =>
      contextMenu === null ? [] : getCanvasContextMenuActionKeys(contextMenu),
    [contextMenu],
  );

  const contextMenuPosition = useMemo(() => {
    if (contextMenu === null) {
      return null;
    }

    const viewportWidth =
      typeof window === 'undefined'
        ? contextMenu.clientX + 232
        : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined'
        ? contextMenu.clientY + 188
        : window.innerHeight;

    return getCanvasContextMenuPosition(
      contextMenu,
      viewportWidth,
      viewportHeight,
    );
  }, [contextMenu]);

  const contextMenuActionHandlers = useMemo<
    Record<CanvasContextMenuActionKey, () => void>
  >(
    () => ({
      cut: handleContextMenuCut,
      copy: handleContextMenuCopy,
      paste: handleContextMenuPaste,
      delete: handleContextMenuDelete,
      bringForward: handleContextMenuBringForward,
      sendBackward: handleContextMenuSendBackward,
      bringToFront: handleContextMenuBringToFront,
      sendToBack: handleContextMenuSendToBack,
      transformToNote: handleContextMenuTransformToNote,
    }),
    [
      handleContextMenuCopy,
      handleContextMenuBringForward,
      handleContextMenuBringToFront,
      handleContextMenuCut,
      handleContextMenuDelete,
      handleContextMenuPaste,
      handleContextMenuSendBackward,
      handleContextMenuSendToBack,
      handleContextMenuTransformToNote,
    ],
  );




  function handleViewportZoom(targetZoom: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const nextViewport = zoomViewportAroundPoint(
      viewportRef.current,
      targetZoom,
      {
        x: rect?.width ? rect.width / 2 : 0,
        y: rect?.height ? rect.height / 2 : 0,
      },
    );
    if (nextViewport.zoom === viewportRef.current.zoom) {
      return;
    }

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function handleZoomIn() {
    handleViewportZoom(adjustZoomByStep(viewportRef.current.zoom, 1));
  }

  function handleZoomOut() {
    handleViewportZoom(adjustZoomByStep(viewportRef.current.zoom, -1));
  }

  function handleResetZoom() {
    handleViewportZoom(getResetZoom(resetZoomTarget));
  }

  function handleResetZoomAdjust(direction: -1 | 1) {
    setResetZoomTarget((current) => adjustResetZoomByStep(current, direction));
  }


  function startSegmentDraft(
    type: SegmentDraftTool,
    clientX: number,
    clientY: number,
  ) {
    const worldPos = screenToWorld(clientX, clientY);
    const snappedWorldPos = magnetEnabled
      ? snapPointToGrid(worldPos, CANVAS_GRID_SIZE)
      : worldPos;
    const snapshot = captureBoardSnapshot();

    // Check if starting near an anchor point
    const anchorHit = findNearestConnectorAnchor(
      worldPos,
      itemsRef.current,
      new Set(),
      CONNECTOR_SNAP_THRESHOLD,
    );

    const startPoint = anchorHit ? anchorHit.point : snappedWorldPos;
    const startConn: SegmentConnection | null = anchorHit
      ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
      : null;

    clearSelection();
    setEditingId(null);
    setAnchorIndicatorItems([]);
    setActiveAnchorHit(anchorHit);
    setSegmentDraft({
      type,
      start: startPoint,
      end: startPoint,
      startConnection: startConn,
      endConnection: null,
      snapshot,
    });
  }

  const {
    handleWheel,
    handleToggleFrameCollapse,
    handleCanvasMouseDown,
    handleItemMouseDown,
    handleSegmentEndpointMouseDown,
    handleSegmentWaypointMouseDown,
    handleSegmentMidpointMouseDown,
    handleResizeMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemDoubleClick,
  } = useCanvasMouseHandlers({
    pageId: page.id,
    magnetEnabled,
    activeTool,
    segmentDraft,
    editingId,
    selectedItem,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    viewportRef,
    containerRef,
    isSpaceRef,
    dragRef,
    resizeRef,
    panRef,
    waypointDragRef,
    segmentEndpointDragRef,
    tableInsertDraftRef,
    marqueeSelectionRef,
    setViewportAndSync,
    scheduleViewportSave,
    setItemsAndSync,
    setConnectorsAndSync,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
    setActiveFrameDropTargetId,
    setActiveTableDropTarget,
    setDeletingWaypointInfo,
    setTableInsertPreview,
    setMarqueeSelection,
    toolbarTableInsertPreviewActive: toolbarTableInsertPreview !== null,
    setSelection,
    setEditingId,
    setSegmentDraft,
    setActiveTool: handleToolChange,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    handleCreateItem,
    handleCreateSegmentItem,
    triggerFrameItemAnimation,
    clearSelection,
    screenToWorld,
    startSegmentDraft,
    onOpenNote,
  });

  const cursorClass =
    isPasting
      ? 'cursor-wait'
      : activeTool !== 'select'
        ? 'cursor-crosshair'
        : isSpaceDown
          ? 'cursor-grab'
          : '';

  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  return (
    <div
      className={`canvas-root ${isInspectorCollapsed ? 'is-inspector-collapsed' : ''}`}
    >
      {toolbarTableInsertPreview !== null ? (
        <div
          className={`table-insert-preview table-insert-preview-fixed ${
            toolbarTableInsertPreview.isActive ? 'is-dragging' : ''
          }`}
          style={getTableInsertPreviewPosition(
            toolbarTableInsertPreview.cursorX,
            toolbarTableInsertPreview.cursorY,
            toolbarTableInsertPreview.direction ?? { x: 1, y: 1 },
            toolbarTableInsertPreview.cols,
            toolbarTableInsertPreview.rows,
          )}
        >
          <div
            className="table-insert-preview-grid"
            style={{
              gridTemplateColumns: `repeat(${toolbarTableInsertPreview.cols}, ${TABLE_INSERT_PREVIEW_CELL_WIDTH}px)`,
              gridTemplateRows: `repeat(${toolbarTableInsertPreview.rows}, ${TABLE_INSERT_PREVIEW_CELL_HEIGHT}px)`,
            }}
          >
            {Array.from({
              length:
                toolbarTableInsertPreview.rows * toolbarTableInsertPreview.cols,
            }).map((_, index) => (
              <span key={index} className="table-insert-preview-cell" />
            ))}
          </div>
          <div className="table-insert-preview-label">
            {toolbarTableInsertPreview.rows} × {toolbarTableInsertPreview.cols}
          </div>
        </div>
      ) : null}

      <Toolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onTableToolClick={handleToolbarTableClick}
      />
      <CanvasRibbon
        importExportDisabled={importExportDisabled}
        onImportPage={onImportPage}
        onImportFromProject={onImportFromProject}
        onExportPage={onExportPage}
        canUndo={canUndo}
        canRedo={canRedo}
        isHistorySyncing={isHistorySyncing}
        onUndo={handleUndo}
        onRedo={handleRedo}
        magnetEnabled={magnetEnabled}
        onToggleMagnet={() => setMagnetEnabled((v) => !v)}
        isRegulatingPage={isRegulatingPage}
        onRegulatePage={() => void handleRegulatePage()}
        viewport={viewport}
        resetZoomTarget={resetZoomTarget}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onResetZoomAdjust={handleResetZoomAdjust}
        backgroundMode={backgroundMode}
        onBackgroundModeChange={setBackgroundMode}
      />
      <div
        className={`canvas-content ${isInspectorCollapsed ? 'is-inspector-collapsed' : ''}`}
      >
        <div className="canvas-stage">
          <div
            ref={containerRef}
            className={`canvas-container ${cursorClass}`}
            onMouseDown={handleCanvasMouseDown}
            onContextMenu={handleCanvasContextMenu}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onDragOver={(event) => {
              if (getSidebarNoteDragFile(event) !== null) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(event) => {
              const noteFile = getSidebarNoteDragFile(event);
              if (noteFile === null) {
                return;
              }

              event.preventDefault();
              void handleProjectNoteDrop(
                noteFile,
                event.clientX,
                event.clientY,
              );
            }}
          >
            {isPasting && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 9999,
                  background: 'transparent',
                  cursor: 'wait',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onWheel={(e) => e.stopPropagation()}
              />
            )}
            <div
              className={`canvas-background canvas-background-${backgroundMode}`}
              style={{
                backgroundSize: `${CANVAS_GRID_SIZE * viewport.zoom}px ${CANVAS_GRID_SIZE * viewport.zoom}px`,
                backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              }}
            />
            <div
              className="canvas-zero-axis canvas-zero-axis-y"
              style={{ left: `${viewport.x}px` }}
            >
              <span className="canvas-zero-axis-label">Y=0</span>
            </div>
            <div
              className="canvas-zero-axis canvas-zero-axis-x"
              style={{ top: `${viewport.y}px` }}
            >
              <span className="canvas-zero-axis-label">X=0</span>
            </div>
            <CanvasMinimap
              items={items}
              minimapLayout={minimapLayout}
              projectDefaultStyle={projectDefaultStyle}
            />

            {activeTool === ITEM_TYPE.table && tableInsertPreview !== null ? (
              <div
                className={`table-insert-preview ${
                  tableInsertPreview.isActive ? 'is-dragging' : ''
                }`}
                style={getTableInsertPreviewPosition(
                  tableInsertPreview.cursorX,
                  tableInsertPreview.cursorY,
                  tableInsertPreview.direction ?? { x: 1, y: 1 },
                  tableInsertPreview.cols,
                  tableInsertPreview.rows,
                )}
              >
                <div
                  className="table-insert-preview-grid"
                  style={{
                    gridTemplateColumns: `repeat(${tableInsertPreview.cols}, ${TABLE_INSERT_PREVIEW_CELL_WIDTH}px)`,
                    gridTemplateRows: `repeat(${tableInsertPreview.rows}, ${TABLE_INSERT_PREVIEW_CELL_HEIGHT}px)`,
                  }}
                >
                  {Array.from({
                    length: tableInsertPreview.rows * tableInsertPreview.cols,
                  }).map((_, index) => (
                    <span key={index} className="table-insert-preview-cell" />
                  ))}
                </div>
                <div className="table-insert-preview-label">
                  {tableInsertPreview.rows} × {tableInsertPreview.cols}
                </div>
              </div>
            ) : null}
            {activeTool === ITEM_TYPE.table &&
            tableInsertPreview !== null &&
            tableInsertPreview.worldX !== undefined &&
            tableInsertPreview.worldY !== undefined &&
            tableInsertPreview.width !== undefined &&
            tableInsertPreview.height !== undefined ? (
              <div
                className="table-insert-canvas-preview"
                style={{
                  left: viewport.x + tableInsertPreview.worldX * viewport.zoom,
                  top: viewport.y + tableInsertPreview.worldY * viewport.zoom,
                  width: tableInsertPreview.width * viewport.zoom,
                  height: tableInsertPreview.height * viewport.zoom,
                }}
              >
                <div
                  className="table-insert-canvas-preview-grid"
                  style={{
                    gridTemplateColumns: `repeat(${tableInsertPreview.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${tableInsertPreview.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({
                    length: tableInsertPreview.rows * tableInsertPreview.cols,
                  }).map((_, index) => (
                    <span
                      key={`table-insert-preview-${index}`}
                      className="table-insert-canvas-preview-cell"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {activeTool === 'select' && marqueeSelection !== null ? (
              <div
                className="canvas-marquee-selection"
                style={{
                  left: marqueeSelection.left,
                  top: marqueeSelection.top,
                  width: marqueeSelection.width,
                  height: marqueeSelection.height,
                }}
              />
            ) : null}

            <div
              className="canvas-world"
              style={{ transform: worldTransform, transformOrigin: '0 0' }}
            >
              {visibleItems.map((item) => {
                const childItems = isFrame(item)
                  ? (frameChildrenById.get(item.id) ?? [])
                  : [];
                const itemAnimation = frameItemAnimations[item.id];
                const isTableDropTarget =
                  item.type === 'table' &&
                  activeTableDropTarget?.tableId === item.id;
                const itemClassName = [
                  isFrame(item) && activeFrameDropTargetId === item.id
                    ? 'is-frame-drop-target'
                    : '',
                  isTableDropTarget ? 'is-table-drop-target' : '',
                  itemAnimation === 'ingest' ? 'is-frame-ingest' : '',
                  itemAnimation === 'eject' ? 'is-frame-eject' : '',
                ]
                  .filter((className) => className.length > 0)
                  .join(' ');
                return (
                  <BoardItemRenderer
                    key={item.id}
                    item={item}
                    childCount={childItems.length}
                    childSummaries={frameChildSummariesById.get(item.id) ?? []}
                    className={itemClassName}
                    isSelected={selectedIdSet.has(item.id)}
                    isEditing={item.id === editingId}
                    canTranslateSegment={canTranslateSegmentItem(item)}
                    onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                    onContextMenu={(e) => handleItemContextMenu(e, item.id)}
                    onEndpointMouseDown={(e, endpoint) =>
                      handleSegmentEndpointMouseDown(e, item.id, endpoint)
                    }
                    onWaypointMouseDown={(e, waypointIndex) =>
                      handleSegmentWaypointMouseDown(e, item.id, waypointIndex)
                    }
                    onMidpointMouseDown={(e, segmentIndex) =>
                      handleSegmentMidpointMouseDown(e, item.id, segmentIndex)
                    }
                    deletingWaypointIndex={
                      deletingWaypointInfo?.itemId === item.id
                        ? deletingWaypointInfo.waypointIndex
                        : undefined
                    }
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onResizeMouseDown={(e) => handleResizeMouseDown(e, item.id)}
                    onToggleCollapse={() => handleToggleFrameCollapse(item.id)}
                    onUpdate={handleItemUpdate}
                    onEditEnd={handleEditEnd}
                    onTableCellInteractionStart={() =>
                      handleItemDoubleClick(item)
                    }
                    onTableSelectedCellsChange={(cellIds) =>
                      setTableInspectorSelection(
                        cellIds.length === 0
                          ? null
                          : { tableId: item.id, cellIds },
                      )
                    }
                    onTableDeleteSelectedCells={(cellIds) => {
                      setTableInspectorSelection({ tableId: item.id, cellIds });
                      void handleDeleteTableCells(item.id, cellIds).catch(
                        (err) => {
                          console.error(
                            '[Canvas] Failed to handle table delete shortcut',
                            err,
                          );
                        },
                      );
                    }}
                    tableCellSelectionResetKey={tableCellSelectionResetKey}
                    magnetEnabled={magnetEnabled}
                    tableDropTargetCellId={
                      isTableDropTarget
                        ? (activeTableDropTarget?.cellId ?? null)
                        : null
                    }
                    projectDefaultStyle={projectDefaultStyle}
                  />
                );
              })}
              {segmentDraftPreviewItem !== null ? (
                <div
                  className="board-item board-item-segment board-item-draft"
                  style={{
                    position: 'absolute',
                    left: segmentDraftPreviewItem.x,
                    top: segmentDraftPreviewItem.y,
                    width: segmentDraftPreviewItem.width,
                    height: segmentDraftPreviewItem.height,
                    zIndex: segmentDraftPreviewItem.z_index,
                    pointerEvents: 'none',
                  }}
                >
                  <SegmentShape
                    item={segmentDraftPreviewItem}
                    isSelected={false}
                    canTranslate={false}
                    onMouseDown={() => {}}
                    onEndpointMouseDown={() => {}}
                    onWaypointMouseDown={() => {}}
                    onMidpointMouseDown={() => {}}
                    projectDefaultStyle={projectDefaultStyle}
                  />
                </div>
              ) : null}
              {/* Connector anchor indicators on nearby items */}
              {anchorIndicatorItems.map((item) =>
                getItemConnectorAnchors(item).map(({ anchor, point }) => {
                  const isActive =
                    activeAnchorHit !== null &&
                    activeAnchorHit.itemId === item.id &&
                    activeAnchorHit.anchor === anchor;
                  return (
                    <div
                      key={`anchor-${item.id}-${anchor}`}
                      className={`connector-anchor-indicator ${isActive ? 'is-active' : ''}`}
                      style={{
                        left: point.x,
                        top: point.y,
                      }}
                    />
                  );
                }),
              )}
            </div>
          </div>
        </div>

        <Inspector
          item={selectedItem}
          selectionCount={selectedIds.length}
          childCount={selectedChildCount}
          projectDefaultStyle={projectDefaultStyle}
          selectedTableCellIds={
            selectedItem?.type === ITEM_TYPE.table &&
            tableInspectorSelection?.tableId === selectedItem.id
              ? tableInspectorSelection.cellIds
              : []
          }
          isCollapsed={isInspectorCollapsed}
          onUpdate={handleItemUpdate}
          onUpdateTableCells={(tableId, cellIds, patch) => {
            const tableItem = items.find(
              (candidate) =>
                candidate.id === tableId && candidate.type === ITEM_TYPE.table,
            );
            if (!tableItem || cellIds.length === 0) {
              return;
            }
            const tableData = parseTableData(tableItem.data_json);
            handleItemUpdate({
              ...tableItem,
              data_json: serializeTableData(
                cellIds.reduce(
                  (current, cellId) => updateTableCell(current, cellId, patch),
                  tableData,
                ),
              ),
            });
          }}
          onDelete={() => void handleDeleteSelection()}
          onToggleInspector={() =>
            setIsInspectorCollapsed((current) => !current)
          }
          onToggleCollapse={() => {
            if (selectedItem?.type === ITEM_TYPE.frame) {
              handleToggleFrameCollapse(selectedItem.id);
            }
          }}
        />
      </div>
      <CanvasContextMenuPortal
        contextMenu={contextMenu}
        contextMenuPosition={contextMenuPosition}
        contextMenuActions={contextMenuActions}
        contextMenuActionHandlers={contextMenuActionHandlers}
      />
    </div>
  );
}
