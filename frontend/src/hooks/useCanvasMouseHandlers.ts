import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BoardItem, ConnectorLink } from '../services/api';
import {
  applyAndClearOriginalSize,
  getOriginalSize,
  storeOriginalSize,
} from '../canvasHelpers/core';
import {
  clampItemToFrame,
  findFrameDropTarget,
  fitItemWithinBounds,
  getFrameChildFitSize,
  getFrameContentBounds,
  getPartialFrameExitEjectPosition,
  isFrame,
  isItemFullyOutsideFrame,
  isSmallItem,
  relayoutFrameItems,
} from '../canvasHelpers/frameLayout';
import {
  detachDraggedSegments,
  getDraggableSelectionItemIds,
  getSelectionMagnetBounds,
  getUniqueItemIds,
} from '../canvasHelpers/selection';
import {
  getAnchorPoint,
  isAnchor,
} from '../canvasHelpers/connectorAnchors';
import {
  computeCellChildLayout,
  findTableCellDropTarget,
  getTableCellBounds,
  relayoutTableItems,
} from '../canvasHelpers/tableLayout';

import type { AnchorHit, TableCellHit } from '../canvasHelpers/types';
import {
  CANVAS_GRID_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  MAGNET_TOLERANCE,
} from '../constants/canvas';
import {
  syncConnectorAnchorsForItems,
  syncSegmentConnectionsForItems,
} from '../canvasHelpers/canvasSyncHelpers';
import type { BoardSnapshot } from '../utils/boardHistory';
import type {
  ConnectorsUpdater,
  DragState,
  ItemsUpdater,
  PanState,
  ResizeEdge,
  ResizeState,
  SegmentDraftState,
  SegmentDraftTool,
  SegmentEndpointDragState,
  TableInsertDraftState,
  TableInsertPreviewState,
  MarqueeSelectionState,
  WaypointDragState,
} from '../types/canvas';
import {
  buildSegmentGeometry,
  canTranslateSegmentItem,
  getSegmentConnections,
  getSegmentWorldPoints,
  getSegmentWorldWaypoints,
  hasStoredSegmentData,
  type Point,
  type SegmentEndpoint,
} from '../utils/export/segmentData';
import {
  magnetMoveRect,
  snapValueToGrid,
} from '../utils/magnet';
import {
  findCellByChildItemId,
  getEffectiveTableCellChildLayoutDirection,
  parseTableData,
  serializeTableData,
  updateTableCell,
  getRootCellAt,
} from '../tableData/tableData';
import {
  ITEM_DEFAULT_SIZE,
  ITEM_TYPE,
  type ActiveTool,
  type Viewport,
} from '../types/index';
import { zoomViewportAroundPoint } from '../utils/viewport';
import { isScrollableWheelTarget } from '../canvasHelpers/scrollTarget';
import { useCanvasPan } from './useCanvasPan';
import { useCanvasMarquee } from './useCanvasMarquee';
import { useCanvasResize } from './useCanvasResize';
import { useCanvasSegmentDrag } from './useCanvasSegmentDrag';
import { useCanvasTableInsert } from './useCanvasTableInsert';

export type UseCanvasMouseHandlersParams = {
  // Current state values (re-captured every render)
  magnetEnabled: boolean;
  activeTool: ActiveTool;
  segmentDraft: SegmentDraftState | null;
  editingId: string | null;
  selectedItem: BoardItem | null;

  // Refs
  itemsRef: RefObject<BoardItem[]>;
  connectorsRef: RefObject<ConnectorLink[]>;
  selectedIdsRef: RefObject<string[]>;
  viewportRef: RefObject<Viewport>;
  containerRef: RefObject<HTMLDivElement | null>;
  isSpaceRef: RefObject<boolean>;
  dragRef: MutableRefObject<DragState | null>;
  resizeRef: MutableRefObject<ResizeState | null>;
  panRef: MutableRefObject<PanState | null>;
  waypointDragRef: MutableRefObject<WaypointDragState | null>;
  segmentEndpointDragRef: MutableRefObject<SegmentEndpointDragState | null>;
  tableInsertDraftRef: MutableRefObject<TableInsertDraftState | null>;
  marqueeSelectionRef: MutableRefObject<{
    startClientX: number;
    startClientY: number;
    appendToSelection: boolean;
    baseSelectionIds: string[];
  } | null>;

  // Viewport
  setViewportAndSync: (vp: Viewport) => void;
  scheduleViewportSave: (vp: Viewport) => void;

  // Item state setters
  setItemsAndSync: (updater: ItemsUpdater, silent?: boolean) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater, silent?: boolean) => void;
  triggerSave: (immediate?: boolean) => void;

  // UI state setters
  setAnchorIndicatorItems: (items: BoardItem[]) => void;
  setActiveAnchorHit: (hit: AnchorHit | null) => void;
  setActiveFrameDropTargetId: (id: string | null) => void;
  setActiveTableDropTarget: (target: TableCellHit | null) => void;
  setDeletingWaypointInfo: (
    info: { itemId: string; waypointIndex: number } | null,
  ) => void;
  setTableInsertPreview: (preview: TableInsertPreviewState | null) => void;
  setMarqueeSelection: (selection: MarqueeSelectionState | null) => void;
  toolbarTableInsertPreviewActive: boolean;

  // Selection / editing
  setSelection: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  setSegmentDraft: React.Dispatch<
    React.SetStateAction<SegmentDraftState | null>
  >;
  setActiveTool: (tool: ActiveTool) => void;

  // History
  captureBoardSnapshot: () => BoardSnapshot;
  pushUndoSnapshot: (snapshot: BoardSnapshot) => void;
  recordHistoryCheckpoint: (snapshot: BoardSnapshot) => void;

  // Item actions
  handleCreateItem: (params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    dataJson?: string | null;
  }) => void;
  handleCreateSegmentItem: (draft: SegmentDraftState) => void;
  triggerFrameItemAnimation: (
    itemIds: string[],
    type: 'ingest' | 'eject',
  ) => void;

  // Helpers (stable callbacks from Canvas)
  clearSelection: () => void;
  screenToWorld: (x: number, y: number) => Point;
  startSegmentDraft: (type: SegmentDraftTool, x: number, y: number) => void;
  onOpenNote?: (noteFile: string) => void;
  onDoubleClickForEdit?: (item: BoardItem) => boolean;
};

export function useCanvasMouseHandlers(params: UseCanvasMouseHandlersParams) {
  const {
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
    toolbarTableInsertPreviewActive,
    setSelection,
    setEditingId,
    setSegmentDraft,
    setActiveTool,
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
    onDoubleClickForEdit,
    triggerSave,
  } = params;

  const { startViewportPan, handlePanMove, handlePanEnd } = useCanvasPan({
    viewportRef,
    isSpaceRef,
    panRef,
    setViewportAndSync,
    scheduleViewportSave,
  });

  const { startMarqueeSelection, handleMarqueeMove, handleMarqueeEnd } = useCanvasMarquee({
    marqueeSelectionRef,
    containerRef,
    itemsRef,
    selectedIdsRef,
    screenToWorld,
    setMarqueeSelection,
    setSelection,
    clearSelection,
    setEditingId,
  });

  const { startResize, handleResizeMove, handleResizeEnd } = useCanvasResize({
    resizeRef,
    itemsRef,
    viewportRef,
    setItemsAndSync,
    setConnectorsAndSync,
    setSelection,
    setEditingId,
    captureBoardSnapshot,
    recordHistoryCheckpoint,
  });

  const {
    handleSegmentEndpointMouseDown: handleSegmentEndpointMouseDownFromHook,
    handleSegmentWaypointMouseDown: handleSegmentWaypointMouseDownFromHook,
    handleSegmentMidpointMouseDown: handleSegmentMidpointMouseDownFromHook,
    handleSegmentDragMove,
    handleSegmentDragEnd,
  } = useCanvasSegmentDrag({
    waypointDragRef,
    segmentEndpointDragRef,
    segmentDraft,
    setSegmentDraft,
    activeTool,
    itemsRef,
    setItemsAndSync,
    setSelection,
    setEditingId,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
    setDeletingWaypointInfo,
    screenToWorld,
    captureBoardSnapshot,
    recordHistoryCheckpoint,
    handleCreateSegmentItem,
  });

  const {
    startTableInsertDraft: startTableInsertDraftFromHook,
    handleTableInsertMouseMove,
    handleTableInsertMouseUp,
  } = useCanvasTableInsert({
    tableInsertDraftRef,
    containerRef,
    magnetEnabled,
    activeTool,
    toolbarTableInsertPreviewActive,
    screenToWorld,
    setTableInsertPreview,
    setActiveTool,
    handleCreateItem,
  });

  function handleWheel(e: React.WheelEvent) {
    const container = containerRef.current;
    if (isScrollableWheelTarget(e.target, container, e.deltaX, e.deltaY)) {
      return;
    }

    e.preventDefault();
    const rect = container?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const vp = viewportRef.current;
    const nextViewport = zoomViewportAroundPoint(
      vp,
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * (1 + delta))),
      { x: mouseX, y: mouseY },
    );

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function startTableInsertDraft(clientX: number, clientY: number) {
    startTableInsertDraftFromHook(clientX, clientY);
  }

  function handleToggleFrameCollapse(frameId: string) {
    const frame = itemsRef.current.find((item) => item.id === frameId);
    if (!frame || frame.type !== ITEM_TYPE.frame) {
      return;
    }
    const snapshotBeforeToggle = captureBoardSnapshot();

    const updatedFrame = { ...frame, is_collapsed: !frame.is_collapsed };
    pushUndoSnapshot(snapshotBeforeToggle);
    setItemsAndSync((current) =>
      current.map((item) => (item.id === frameId ? updatedFrame : item)),
      true,
    );

    if (updatedFrame.is_collapsed && selectedItem?.parent_item_id === frameId) {
      setSelection([frameId]);
      setEditingId(null);
    }

    triggerSave(true);
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    if (isSpaceRef.current) {
      startViewportPan(e, { preventDefault: false });
      return;
    }

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
      return;
    }

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        return;
      }
      startTableInsertDraft(e.clientX, e.clientY);
      return;
    }

    if (activeTool !== 'select') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const size = ITEM_DEFAULT_SIZE[activeTool] ?? { width: 200, height: 100 };
      const rawX = worldPos.x - size.width / 2;
      const rawY = worldPos.y - size.height / 2;
      void handleCreateItem({
        type: activeTool,
        x: magnetEnabled ? snapValueToGrid(rawX, CANVAS_GRID_SIZE) : rawX,
        y: magnetEnabled ? snapValueToGrid(rawY, CANVAS_GRID_SIZE) : rawY,
        ...size,
      });
      setActiveTool('select');
      return;
    }

    startMarqueeSelection(e);
  }

  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    e.stopPropagation();

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
      return;
    }

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        return;
      }
      startTableInsertDraft(e.clientX, e.clientY);
      return;
    }

    if (activeTool !== 'select') {
      return;
    }

    const isModifierSelection = e.shiftKey || e.ctrlKey || e.metaKey;
    const currentSelection = selectedIdsRef.current;
    if (isModifierSelection) {
      if (currentSelection.includes(itemId)) {
        setSelection(
          currentSelection.filter((currentId) => currentId !== itemId),
        );
        if (editingId === itemId) {
          setEditingId(null);
        }
      } else {
        setSelection([...currentSelection, itemId]);
      }
      return;
    }

    const nextSelectedIds = currentSelection.includes(itemId)
      ? currentSelection
      : [itemId];
    const draggedSelectionIds = getDraggableSelectionItemIds(
      itemsRef.current,
      nextSelectedIds,
    );
    setSelection(nextSelectedIds);
    setEditingId(null);

    if (draggedSelectionIds.length === 0) {
      return;
    }

    const selectionBounds = getSelectionMagnetBounds(
      itemsRef.current,
      draggedSelectionIds,
    );
    if (selectionBounds === null) {
      return;
    }

    // Segment items (line/arrow) cannot be moved by dragging the body —
    // only endpoints and waypoints are draggable.
    const isSegmentItem =
      item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow;
    if (isSegmentItem && !canTranslateSegmentItem(item)) {
      return;
    }

    dragRef.current = {
      itemId,
      selectedItemIds: draggedSelectionIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      hasMoved: false,
      startBoundsX: selectionBounds.x,
      startBoundsY: selectionBounds.y,
      itemPositions: draggedSelectionIds
        .map((selectedItemId) => {
          const selectedItem = itemsRef.current.find(
            (candidate) => candidate.id === selectedItemId,
          );
          return selectedItem === undefined
            ? null
            : { id: selectedItem.id, x: selectedItem.x, y: selectedItem.y };
        })
        .filter(
          (entry): entry is { id: string; x: number; y: number } =>
            entry !== null,
        ),
      snapshot: captureBoardSnapshot(),
      detachedConnectorIds: [],
      hasDetachedSegments: false,
    };
  }

  function handleSegmentEndpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    endpoint: SegmentEndpoint,
  ) {
    handleSegmentEndpointMouseDownFromHook(e, itemId, endpoint, startViewportPan);
  }

  function handleSegmentWaypointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    waypointIndex: number,
  ) {
    handleSegmentWaypointMouseDownFromHook(e, itemId, waypointIndex, startViewportPan);
  }

  function handleSegmentMidpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    segmentIndex: number,
  ) {
    handleSegmentMidpointMouseDownFromHook(e, itemId, segmentIndex, startViewportPan);
  }

  function handleResizeMouseDown(e: React.MouseEvent, itemId: string, edge: ResizeEdge) {
    startResize(e, itemId, edge, startViewportPan);
  }

  function handleMouseMove(e: React.MouseEvent) {
    const shouldUseMagnet = magnetEnabled && !e.altKey;
    if (handleMarqueeMove(e)) {
      return;
    }

    if (handleSegmentDragMove(e, shouldUseMagnet)) {
      return;
    }

    if (handleResizeMove(e, shouldUseMagnet)) {
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const vp = viewportRef.current;
      const dx = (e.clientX - drag.startMouseX) / vp.zoom;
      const dy = (e.clientY - drag.startMouseY) / vp.zoom;
      const movedScreenDistance = Math.hypot(
        e.clientX - drag.startMouseX,
        e.clientY - drag.startMouseY,
      );
      if (!drag.hasMoved && movedScreenDistance < 3) {
        return;
      }
      drag.hasMoved = true;
      let baseItems = itemsRef.current;

      if (!drag.hasDetachedSegments) {
        const detached = detachDraggedSegments(
          baseItems,
          connectorsRef.current,
          drag.selectedItemIds,
        );

        if (detached.detachedItemIds.length > 0) {
          drag.hasDetachedSegments = true;
          drag.detachedConnectorIds.push(...detached.detachedConnectorIds);
          baseItems = detached.items;
          setItemsAndSync(baseItems);
          setConnectorsAndSync(detached.connectors);

          const detachedSelectionBounds = getSelectionMagnetBounds(
            baseItems,
            drag.selectedItemIds,
          );
          if (detachedSelectionBounds !== null) {
            drag.startBoundsX = detachedSelectionBounds.x;
            drag.startBoundsY = detachedSelectionBounds.y;
          }

          drag.itemPositions = drag.selectedItemIds
            .map((selectedItemId) => {
              const selectedItem = baseItems.find(
                (candidate) => candidate.id === selectedItemId,
              );
              return selectedItem === undefined
                ? null
                : { id: selectedItem.id, x: selectedItem.x, y: selectedItem.y };
            })
            .filter(
              (entry): entry is { id: string; x: number; y: number } =>
                entry !== null,
            );
        }
      }

      if (drag.itemPositions.length === 0) {
        return;
      }

      const selectionBounds = getSelectionMagnetBounds(
        baseItems,
        drag.selectedItemIds,
      );
      if (selectionBounds === null) {
        return;
      }

      const rawX = drag.startBoundsX + dx;
      const rawY = drag.startBoundsY + dy;
      const nextBounds = shouldUseMagnet
        ? magnetMoveRect(
            {
              x: rawX,
              y: rawY,
              width: selectionBounds.width,
              height: selectionBounds.height,
            },
            CANVAS_GRID_SIZE,
            MAGNET_TOLERANCE,
          )
        : { x: rawX, y: rawY };
      const offsetX = nextBounds.x - drag.startBoundsX;
      const offsetY = nextBounds.y - drag.startBoundsY;
      const itemStartMap = new Map(
        drag.itemPositions.map((entry) => [entry.id, entry] as const),
      );

      setItemsAndSync((current) => {
        const draggedIdSet = new Set(drag.selectedItemIds);
        // First apply the drag offsets
        let nextItems = current.map((item) => {
          const itemStart = itemStartMap.get(item.id);
          if (itemStart) {
            return {
              ...item,
              x: itemStart.x + offsetX,
              y: itemStart.y + offsetY,
            };
          }

          return item;
        });

        // Then update any segments connected to dragged items
        const itemById = new Map(nextItems.map((item) => [item.id, item]));
        nextItems = nextItems.map((item) => {
          if (
            (item.type !== ITEM_TYPE.line && item.type !== ITEM_TYPE.arrow) ||
            !hasStoredSegmentData(item) ||
            draggedIdSet.has(item.id)
          ) {
            return item;
          }

          const conns = getSegmentConnections(item);
          const startTouched =
            conns.startConnection !== null &&
            draggedIdSet.has(conns.startConnection.itemId);
          const endTouched =
            conns.endConnection !== null &&
            draggedIdSet.has(conns.endConnection.itemId);

          if (!startTouched && !endTouched) {
            return item;
          }

          const worldPts = getSegmentWorldPoints(item);
          if (!worldPts) {
            return item;
          }

          let newStart = worldPts.start;
          let newEnd = worldPts.end;

          if (startTouched && conns.startConnection) {
            const target = itemById.get(conns.startConnection.itemId);
            if (target) {
              newStart = getAnchorPoint(
                target,
                isAnchor(conns.startConnection.anchor)
                  ? conns.startConnection.anchor
                  : null,
              );
            }
          }
          if (endTouched && conns.endConnection) {
            const target = itemById.get(conns.endConnection.itemId);
            if (target) {
              newEnd = getAnchorPoint(
                target,
                isAnchor(conns.endConnection.anchor)
                  ? conns.endConnection.anchor
                  : null,
              );
            }
          }

          const waypoints = getSegmentWorldWaypoints(item);
          const geometry = buildSegmentGeometry(
            newStart,
            newEnd,
            waypoints,
            conns.startConnection,
            conns.endConnection,
          );
          return { ...item, ...geometry };
        });

        return nextItems;
      });
      return;
    }

    if (handlePanMove(e)) {
      return;
    }

    if (handleTableInsertMouseMove(e)) {
      return;
    }
  }

  function handleMouseUp(e?: React.MouseEvent) {
    setAnchorIndicatorItems([]);
    setActiveAnchorHit(null);
    setActiveFrameDropTargetId(null);
    setActiveTableDropTarget(null);

    handleMarqueeEnd();
    if (handleTableInsertMouseUp(e)) {
      return;
    }

    if (handleSegmentDragEnd(e, magnetEnabled)) {
      triggerSave(true);
      return;
    }

    if (handleResizeEnd()) {
      triggerSave(true);
    }

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      setActiveFrameDropTargetId(null);
      if (!drag.hasMoved) {
        return;
      }
      let nextItems = itemsRef.current;
      const movedItemIds = getUniqueItemIds(drag.selectedItemIds);
      const changedIds = new Set<string>(movedItemIds);
      const frameIdsToRelayout = new Set<string>();
      const ingestedItemIds: string[] = [];
      const ejectedItemIds: string[] = [];
      const movedFrameIds = new Set(
        movedItemIds.filter((itemId) => {
          const item = nextItems.find((candidate) => candidate.id === itemId);
          return item !== undefined && isFrame(item);
        }),
      );
      const movedTableIds = new Set(
        movedItemIds.filter((itemId) => {
          const item = nextItems.find((candidate) => candidate.id === itemId);
          return item !== undefined && item.type === ITEM_TYPE.table;
        }),
      );

      for (const movedItemId of movedItemIds) {
        const movedItem = nextItems.find((item) => item.id === movedItemId);
        if (!movedItem || !isSmallItem(movedItem)) {
          continue;
        }

        if (
          movedItem.parent_item_id !== null &&
          (movedFrameIds.has(movedItem.parent_item_id) ||
            movedTableIds.has(movedItem.parent_item_id))
        ) {
          continue;
        }

        const previousParent =
          movedItem.parent_item_id === null
            ? null
            : (nextItems.find((item) => item.id === movedItem.parent_item_id) ??
              null);
        const targetFrame = findFrameDropTarget(movedItem, nextItems);

        let nextParentId = movedItem.parent_item_id;
        let nextWidth = movedItem.width;
        let nextHeight = movedItem.height;
        let nextX = movedItem.x;
        let nextY = movedItem.y;
        let nextDataJson = movedItem.data_json;

        if (targetFrame !== null) {
          const fittedSize =
            previousParent?.id === targetFrame.id
              ? fitItemWithinBounds(
                  movedItem,
                  getFrameContentBounds(targetFrame).width,
                  getFrameContentBounds(targetFrame).height,
                )
              : getFrameChildFitSize(movedItem, targetFrame);
          const clampedPosition = clampItemToFrame(
            movedItem,
            targetFrame,
            fittedSize,
          );

          nextParentId = targetFrame.id;
          nextWidth = fittedSize.width;
          nextHeight = fittedSize.height;
          nextX = clampedPosition.x;
          nextY = clampedPosition.y;

          if (movedItem.parent_item_id === null) {
            nextDataJson = storeOriginalSize(movedItem).data_json;
          }
        } else if (previousParent !== null) {
          if (isFrame(previousParent)) {
            // Frame parent: eject or clamp within frame
            if (isItemFullyOutsideFrame(movedItem, previousParent)) {
              nextParentId = null;
            } else {
              const ejectPosition = getPartialFrameExitEjectPosition(
                movedItem,
                previousParent,
              );
              nextParentId = null;
              nextX = ejectPosition?.x ?? nextX;
              nextY = ejectPosition?.y ?? nextY;
            }
          } else if (previousParent.type === ITEM_TYPE.table) {
            // Table parent: eject when center moves outside the table
            const itemCenterX = movedItem.x + movedItem.width / 2;
            const itemCenterY = movedItem.y + movedItem.height / 2;
            const isOutsideTable =
              itemCenterX < previousParent.x ||
              itemCenterX > previousParent.x + previousParent.width ||
              itemCenterY < previousParent.y ||
              itemCenterY > previousParent.y + previousParent.height;
            if (isOutsideTable) {
              nextParentId = null;
              // Remove this item from the cell's childItemIds
              const tData = parseTableData(previousParent.data_json);
              const cellHit = findCellByChildItemId(tData, movedItem.id);
              const newTData = {
                ...tData,
                cells: tData.cells.map((row) =>
                  row.map((c) =>
                    c?.childItemIds.includes(movedItem.id)
                      ? {
                          ...c,
                          childItemIds: c.childItemIds.filter(
                            (id) => id !== movedItem.id,
                          ),
                        }
                      : c,
                  ),
                ),
              };
              const updatedTableItem = {
                ...previousParent,
                data_json: serializeTableData(newTData),
              };
              nextItems = nextItems.map((it) =>
                it.id === previousParent.id ? updatedTableItem : it,
              );
              changedIds.add(previousParent.id);

              // If the cell still has remaining children, relayout them
              if (cellHit) {
                const remainingIds = cellHit.cell.childItemIds.filter(
                  (id) => id !== movedItem.id && !movedItemIds.includes(id),
                );
                if (remainingIds.length > 0) {
                  const CELL_INSET = 8;
                  const cellBounds = getTableCellBounds(
                    updatedTableItem,
                    cellHit.row,
                    cellHit.col,
                    cellHit.cell.rowSpan,
                    cellHit.cell.colSpan,
                  );
                  remainingIds.forEach((remainingId, idx) => {
                    const layout = computeCellChildLayout(
                      cellBounds,
                      idx,
                      remainingIds.length,
                      CELL_INSET,
                      getEffectiveTableCellChildLayoutDirection(
                        newTData,
                        cellHit.cell,
                      ),
                    );
                    nextItems = nextItems.map((it) =>
                      it.id === remainingId
                        ? {
                            ...it,
                            x: layout.x,
                            y: layout.y,
                            width: layout.width,
                            height: layout.height,
                          }
                        : it,
                    );
                    changedIds.add(remainingId);
                  });
                }
              }
            } else {
              // Still within table — check if center moved to a different cell
              const tData = parseTableData(previousParent.data_json);
              const originalCellHit = findCellByChildItemId(
                tData,
                movedItem.id,
              );

              // Determine which cell the center is hovering over now
              const itemCenterX = movedItem.x + movedItem.width / 2;
              const itemCenterY = movedItem.y + movedItem.height / 2;
              const localX = itemCenterX - previousParent.x;
              const localY = itemCenterY - previousParent.y;
              let hoverCol = -1;
              let cumX = 0;
              for (let c = 0; c < tData.cols; c++) {
                const colW =
                  (tData.colWidths[c] ?? 1 / tData.cols) * previousParent.width;
                if (localX >= cumX && localX < cumX + colW) {
                  hoverCol = c;
                  break;
                }
                cumX += colW;
              }
              let hoverRow = -1;
              let cumY = 0;
              for (let r = 0; r < tData.rows; r++) {
                const rowH =
                  (tData.rowHeights[r] ?? 1 / tData.rows) *
                  previousParent.height;
                if (localY >= cumY && localY < cumY + rowH) {
                  hoverRow = r;
                  break;
                }
                cumY += rowH;
              }
              const hoverRoot =
                hoverRow >= 0 && hoverCol >= 0
                  ? getRootCellAt(tData, hoverRow, hoverCol)
                  : null;

              const isDifferentCell =
                hoverRoot !== null &&
                originalCellHit !== null &&
                hoverRoot.cell.id !== originalCellHit.cell.id;
              const isUnassignedTableChild =
                hoverRoot !== null && originalCellHit === null;
              const canAccept = isDifferentCell || isUnassignedTableChild;

              if (canAccept && hoverRoot) {
                // Move item from an old cell, or assign a table-parented orphan
                // created by paste flows, into the hovered cell.
                const CELL_INSET = 8;
                const oldRemainingIds =
                  originalCellHit?.cell.childItemIds.filter(
                    (id) => id !== movedItem.id && !movedItemIds.includes(id),
                  ) ?? [];
                const newTargetIds = [
                  ...hoverRoot.cell.childItemIds,
                  movedItem.id,
                ];

                const updatedTData = {
                  ...tData,
                  cells: tData.cells.map((row) =>
                    row.map((c) => {
                      if (!c) return c;
                      if (
                        originalCellHit !== null &&
                        c.id === originalCellHit.cell.id
                      )
                        return { ...c, childItemIds: oldRemainingIds };
                      if (c.id === hoverRoot.cell.id)
                        return { ...c, childItemIds: newTargetIds };
                      return c;
                    }),
                  ),
                };
                const updatedTableItem = {
                  ...previousParent,
                  data_json: serializeTableData(updatedTData),
                };
                nextItems = nextItems.map((it) =>
                  it.id === previousParent.id ? updatedTableItem : it,
                );
                changedIds.add(previousParent.id);

                // Layout the moved item in its new cell
                const newCellBounds = getTableCellBounds(
                  updatedTableItem,
                  hoverRoot.row,
                  hoverRoot.col,
                  hoverRoot.cell.rowSpan,
                  hoverRoot.cell.colSpan,
                );
                const myIndex = newTargetIds.indexOf(movedItem.id);
                const myLayout = computeCellChildLayout(
                  newCellBounds,
                  myIndex,
                  newTargetIds.length,
                  CELL_INSET,
                  getEffectiveTableCellChildLayoutDirection(
                    updatedTData,
                    hoverRoot.cell,
                  ),
                  getOriginalSize(movedItem),
                );
                nextParentId = previousParent.id;
                nextX = myLayout.x;
                nextY = myLayout.y;
                nextWidth = myLayout.width;
                nextHeight = myLayout.height;

                // Relayout other items in the new cell
                newTargetIds.forEach((otherId, idx) => {
                  if (otherId === movedItem.id) return;
                  const otherItem = nextItems.find((it) => it.id === otherId);
                  const otherLayout = computeCellChildLayout(
                    newCellBounds,
                    idx,
                    newTargetIds.length,
                    CELL_INSET,
                    getEffectiveTableCellChildLayoutDirection(
                      updatedTData,
                      hoverRoot.cell,
                    ),
                    otherItem ? getOriginalSize(otherItem) : null,
                  );
                  nextItems = nextItems.map((it) =>
                    it.id === otherId
                      ? {
                          ...it,
                          x: otherLayout.x,
                          y: otherLayout.y,
                          width: otherLayout.width,
                          height: otherLayout.height,
                        }
                      : it,
                  );
                  changedIds.add(otherId);
                });

                // Relayout remaining items in the old cell
                if (originalCellHit !== null && oldRemainingIds.length > 0) {
                  const oldCellBounds = getTableCellBounds(
                    updatedTableItem,
                    originalCellHit.row,
                    originalCellHit.col,
                    originalCellHit.cell.rowSpan,
                    originalCellHit.cell.colSpan,
                  );
                  oldRemainingIds.forEach((remainId, idx) => {
                    const remainItem = nextItems.find((it) => it.id === remainId);
                    const layout = computeCellChildLayout(
                      oldCellBounds,
                      idx,
                      oldRemainingIds.length,
                      CELL_INSET,
                      getEffectiveTableCellChildLayoutDirection(
                        updatedTData,
                        originalCellHit.cell,
                      ),
                      remainItem ? getOriginalSize(remainItem) : null,
                    );
                    nextItems = nextItems.map((it) =>
                      it.id === remainId
                        ? {
                            ...it,
                            x: layout.x,
                            y: layout.y,
                            width: layout.width,
                            height: layout.height,
                          }
                        : it,
                    );
                    changedIds.add(remainId);
                  });
                }
              } else if (originalCellHit) {
                // Same cell or target full → snap back to original cell position
                const CELL_INSET = 8;
                const cellBounds = getTableCellBounds(
                  previousParent,
                  originalCellHit.row,
                  originalCellHit.col,
                  originalCellHit.cell.rowSpan,
                  originalCellHit.cell.colSpan,
                );
                const myIndex = originalCellHit.cell.childItemIds.indexOf(
                  movedItem.id,
                );
                const myLayout = computeCellChildLayout(
                  cellBounds,
                  Math.max(0, myIndex),
                  originalCellHit.cell.childItemIds.length,
                  CELL_INSET,
                  getEffectiveTableCellChildLayoutDirection(
                    tData,
                    originalCellHit.cell,
                  ),
                  getOriginalSize(movedItem),
                );
                nextParentId = previousParent.id;
                nextX = myLayout.x;
                nextY = myLayout.y;
                nextWidth = myLayout.width;
                nextHeight = myLayout.height;
              }
            }
          }

          if (nextParentId === null) {
            const restored = applyAndClearOriginalSize(movedItem);
            nextWidth = restored.width;
            nextHeight = restored.height;
            nextDataJson = restored.data_json;

            // Recalculate eject position with restored size if it was from a frame
            if (isFrame(previousParent)) {
              const ejectPosition = getPartialFrameExitEjectPosition(
                { ...movedItem, width: nextWidth, height: nextHeight },
                previousParent,
              );
              if (ejectPosition) {
                nextX = ejectPosition.x;
                nextY = ejectPosition.y;
              }
            }
          }
        }

        const parentChanged = nextParentId !== movedItem.parent_item_id;
        const positionChanged = nextX !== movedItem.x || nextY !== movedItem.y;
        const sizeChanged =
          nextWidth !== movedItem.width || nextHeight !== movedItem.height;

        if (!parentChanged && !positionChanged && !sizeChanged) {
          continue;
        }

        if (movedItem.parent_item_id !== null) {
          const prevParent = nextItems.find(
            (it) => it.id === movedItem.parent_item_id,
          );
          if (!prevParent || isFrame(prevParent)) {
            frameIdsToRelayout.add(movedItem.parent_item_id);
          }
        }
        if (nextParentId !== null) {
          const nxtParent = nextItems.find((it) => it.id === nextParentId);
          if (!nxtParent || isFrame(nxtParent)) {
            frameIdsToRelayout.add(nextParentId);
          }
        }

        if (parentChanged) {
          if (nextParentId !== null) {
            ingestedItemIds.push(movedItem.id);
          } else if (movedItem.parent_item_id !== null) {
            ejectedItemIds.push(movedItem.id);
          }
        } else if (previousParent !== null && positionChanged) {
          ingestedItemIds.push(movedItem.id);
        }

        nextItems = nextItems.map((item) =>
          item.id === movedItem.id
            ? {
                ...item,
                parent_item_id: nextParentId,
                x: nextX,
                y: nextY,
                width: nextWidth,
                height: nextHeight,
                data_json: nextDataJson,
              }
            : item,
        );
      }

      const relayoutResult = relayoutFrameItems(nextItems, [
        ...frameIdsToRelayout,
      ]);
      nextItems = relayoutResult.items;
      for (const changedId of relayoutResult.changedIds) {
        changedIds.add(changedId);
      }

      if (movedTableIds.size > 0) {
        const tableRelayoutResult = relayoutTableItems(nextItems, [
          ...movedTableIds,
        ]);
        nextItems = tableRelayoutResult.items;
        for (const changedId of tableRelayoutResult.changedIds) {
          changedIds.add(changedId);
        }
      }

      if (nextItems !== itemsRef.current) {
        setItemsAndSync(nextItems, true);
      }

      syncConnectorAnchorsForItems(
        [...changedIds],
        itemsRef,
        (updater) => setConnectorsAndSync(updater, true),
      );
      syncSegmentConnectionsForItems(
        [...changedIds],
        itemsRef,
        (updater) => setItemsAndSync(updater, true),
      );
      triggerFrameItemAnimation(ingestedItemIds, 'ingest');
      triggerFrameItemAnimation(ejectedItemIds, 'eject');

      // ── Table cell absorption ─────────────────────────────────────────
      // If exactly one small item is dragged and its center is over a table
      // cell with < 2 children, absorb it into the cell.
      const tableCellHit = (() => {
        if (drag.selectedItemIds.length !== 1) return null;
        const draggedItemId = drag.selectedItemIds[0];
        if (!draggedItemId) return null;
        const draggedItem = nextItems.find(
          (candidate) => candidate.id === draggedItemId,
        );
        if (!draggedItem || !isSmallItem(draggedItem)) return null;
        // Items already parented to a table/frame were handled above — skip re-absorption.
        if (draggedItem.parent_item_id !== null) return null;
        return findTableCellDropTarget(draggedItem, nextItems);
      })();

      if (tableCellHit) {
        const absorbedItemId = drag.selectedItemIds[0];
        if (!absorbedItemId) return;
        const absorbedItem = nextItems.find((it) => it.id === absorbedItemId);
        const tableItem = nextItems.find(
          (it) => it.id === tableCellHit.tableId,
        );

        if (absorbedItem && tableItem) {
          const tableData = parseTableData(tableItem.data_json);
          const cell = tableData.cells
            .flat()
            .find((c) => c?.id === tableCellHit.cellId);
          const rowSpan = cell?.rowSpan ?? 1;
          const colSpan = cell?.colSpan ?? 1;
          const existingChildIds = cell?.childItemIds ?? [];

          const CELL_INSET = 8;
          const cellBounds = getTableCellBounds(
            tableItem,
            tableCellHit.row,
            tableCellHit.col,
            rowSpan,
            colSpan,
          );

          const newChildIds = existingChildIds.includes(absorbedItemId)
            ? existingChildIds
            : [...existingChildIds, absorbedItemId];
          const nextTableData = updateTableCell(
            tableData,
            tableCellHit.cellId,
            {
              childItemIds: newChildIds,
            },
          );
          const updatedTableItem = {
            ...tableItem,
            data_json: serializeTableData(nextTableData),
          };

          const maxZ =
            nextItems.length > 0
              ? Math.max(...nextItems.map((it) => it.z_index))
              : 0;

          // Layout the absorbed item
          const myIndex = newChildIds.indexOf(absorbedItemId);
          const stored = storeOriginalSize(absorbedItem);
          const myLayout = computeCellChildLayout(
            cellBounds,
            myIndex,
            newChildIds.length,
            CELL_INSET,
            getEffectiveTableCellChildLayoutDirection(
              nextTableData,
              cell ?? {
                childLayoutDirection: undefined,
                childLayoutUpdatedAt: undefined,
              },
            ),
            getOriginalSize(stored),
          );
          const updatedAbsorbedItem = {
            ...absorbedItem,
            x: myLayout.x,
            y: myLayout.y,
            width: myLayout.width,
            height: myLayout.height,
            parent_item_id: tableItem.id,
            data_json: stored.data_json,
            z_index: maxZ + 1,
          };

          nextItems = nextItems.map((it) => {
            if (it.id === absorbedItemId) return updatedAbsorbedItem;
            if (it.id === tableCellHit.tableId) return updatedTableItem;
            return it;
          });

          // Relayout all existing children in the cell to accommodate the new item
          if (existingChildIds.length > 0) {
            existingChildIds.forEach((existingId, idx) => {
              const child = nextItems.find((it) => it.id === existingId);
              const layout = computeCellChildLayout(
                cellBounds,
                idx,
                newChildIds.length,
                CELL_INSET,
                getEffectiveTableCellChildLayoutDirection(
                  nextTableData,
                  cell ?? {
                    childLayoutDirection: undefined,
                    childLayoutUpdatedAt: undefined,
                  },
                ),
                child ? getOriginalSize(child) : null,
              );
              nextItems = nextItems.map((it) =>
                it.id === existingId
                  ? {
                      ...it,
                      x: layout.x,
                      y: layout.y,
                      width: layout.width,
                      height: layout.height,
                    }
                  : it,
              );
              changedIds.add(existingId);
            });
          }

          setItemsAndSync(nextItems, true);
        }
      } else {
        // Normal persistence for moves not resulting in absorption
      }
      // ─────────────────────────────────────────────────────────────────

      triggerSave(true);
      recordHistoryCheckpoint(drag.snapshot);
    }

    handlePanEnd();
  }

  function handleItemDoubleClick(item: BoardItem) {
    setSelection([item.id]);
    if (isFrame(item)) {
      handleToggleFrameCollapse(item.id);
      return;
    }

    if (item.type === ITEM_TYPE.note_paper && onOpenNote) {
      try {
        const data = JSON.parse(item.data_json ?? '{}');
        if (data.noteFile) {
          onOpenNote(data.noteFile);
          return;
        }
      } catch (e) {
        console.error('Failed to parse note_paper data_json', e);
      }
    }

    if (onDoubleClickForEdit?.(item)) {
      return;
    }
  }

  return {
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
  };
}
