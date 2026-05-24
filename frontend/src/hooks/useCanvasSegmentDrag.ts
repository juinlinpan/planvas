import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BoardItem } from '../services/api';
import {
  findNearestConnectorAnchor,
  getItemsNearPoint,
} from '../canvasHelpers/connectorAnchors';
import type { AnchorHit } from '../canvasHelpers/types';
import {
  CONNECTOR_SNAP_THRESHOLD,
  CANVAS_GRID_SIZE,
} from '../constants/canvas';
import {
  buildSegmentGeometry,
  getSegmentConnections,
  getSegmentWaypoints,
  getSegmentWorldPoints,
  insertWaypointAt,
  moveWaypointAt,
  updateSegmentEndpoint,
  type Point,
  type SegmentConnection,
  type SegmentEndpoint,
} from '../utils/export/segmentData';
import { snapPointToGrid } from '../utils/magnet';
import { persistItems } from '../canvasHelpers/canvasSyncHelpers';
import type {
  SegmentDraftState,
  SegmentEndpointDragState,
  WaypointDragState,
} from '../types/canvas';
import type { ActiveTool } from '../types/index';

export type UseCanvasSegmentDragParams = {
  waypointDragRef: MutableRefObject<WaypointDragState | null>;
  segmentEndpointDragRef: MutableRefObject<SegmentEndpointDragState | null>;
  segmentDraft: SegmentDraftState | null;
  setSegmentDraft: React.Dispatch<React.SetStateAction<SegmentDraftState | null>>;
  activeTool: ActiveTool;
  itemsRef: RefObject<BoardItem[]>;
  setItemsAndSync: (updater: any) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  setAnchorIndicatorItems: (items: BoardItem[]) => void;
  setActiveAnchorHit: (hit: AnchorHit | null) => void;
  setDeletingWaypointInfo: (
    info: { itemId: string; waypointIndex: number } | null,
  ) => void;
  screenToWorld: (x: number, y: number) => Point;
  captureBoardSnapshot: () => any;
  recordHistoryCheckpoint: (snapshot: any) => void;
  handleCreateSegmentItem: (draft: SegmentDraftState) => Promise<void>;
};

export function useCanvasSegmentDrag({
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
}: UseCanvasSegmentDragParams) {
  function getSnappedPoint(point: Point, shouldSnap: boolean): Point {
    return shouldSnap ? snapPointToGrid(point, CANVAS_GRID_SIZE) : point;
  }

  function handleSegmentEndpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    endpoint: SegmentEndpoint,
    startViewportPan: (e: React.MouseEvent) => boolean,
  ) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setSelection([itemId]);
    setEditingId(null);
    segmentEndpointDragRef.current = {
      itemId,
      endpoint,
      connection: null,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleSegmentWaypointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    waypointIndex: number,
    startViewportPan: (e: React.MouseEvent) => boolean,
  ) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setSelection([itemId]);
    setEditingId(null);
    waypointDragRef.current = {
      itemId,
      waypointIndex,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleSegmentMidpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    segmentIndex: number,
    startViewportPan: (e: React.MouseEvent) => boolean,
  ) {
    if (startViewportPan(e)) {
      return;
    }

    if (e.button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    const worldPoint = screenToWorld(e.clientX, e.clientY);
    const result = insertWaypointAt(item, segmentIndex, worldPoint);
    if (result === null) {
      return;
    }

    const snapshot = captureBoardSnapshot();
    const { waypointIndex: newIndex, ...geometry } = result;

    setItemsAndSync((current: BoardItem[]) =>
      current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, ...geometry } : candidate,
      ),
    );
    setSelection([itemId]);
    setEditingId(null);

    waypointDragRef.current = {
      itemId,
      waypointIndex: newIndex,
      snapshot,
    };
  }

  function handleSegmentDragMove(e: React.MouseEvent, shouldUseMagnet: boolean): boolean {
    const waypointDrag = waypointDragRef.current;
    if (waypointDrag) {
      const item = itemsRef.current.find(
        (candidate) => candidate.id === waypointDrag.itemId,
      );
      if (!item) {
        return true;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const nextPoint = getSnappedPoint(rawPoint, shouldUseMagnet);
      const nextGeometry = moveWaypointAt(
        item,
        waypointDrag.waypointIndex,
        nextPoint,
      );
      if (nextGeometry === null) {
        return true;
      }

      // Check if dragged close enough to start/end to trigger delete
      const SNAP_DELETE_DIST = 10;
      const worldPts = getSegmentWorldPoints(item);
      if (worldPts !== null) {
        const dStart = Math.hypot(
          rawPoint.x - worldPts.start.x,
          rawPoint.y - worldPts.start.y,
        );
        const dEnd = Math.hypot(
          rawPoint.x - worldPts.end.x,
          rawPoint.y - worldPts.end.y,
        );
        if (dStart < SNAP_DELETE_DIST || dEnd < SNAP_DELETE_DIST) {
          setDeletingWaypointInfo({
            itemId: waypointDrag.itemId,
            waypointIndex: waypointDrag.waypointIndex,
          });
        } else {
          setDeletingWaypointInfo(null);
        }
      }

      setItemsAndSync((current: BoardItem[]) =>
        current.map((candidate) =>
          candidate.id === waypointDrag.itemId
            ? { ...candidate, ...nextGeometry }
            : candidate,
        ),
      );
      return true;
    }

    const endpointDrag = segmentEndpointDragRef.current;
    if (endpointDrag) {
      const item = itemsRef.current.find(
        (candidate) => candidate.id === endpointDrag.itemId,
      );
      if (!item) {
        setAnchorIndicatorItems([]);
        setActiveAnchorHit(null);
        return true;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const snappedPoint = getSnappedPoint(rawPoint, shouldUseMagnet);

      // Check for connector anchor attachment
      const anchorHit = findNearestConnectorAnchor(
        rawPoint,
        itemsRef.current,
        new Set([endpointDrag.itemId]),
        CONNECTOR_SNAP_THRESHOLD,
      );
      const nextPoint = anchorHit ? anchorHit.point : snappedPoint;
      const nextConn: SegmentConnection | null = anchorHit
        ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
        : null;

      endpointDrag.connection = nextConn;

      // Show anchor indicators on nearby items
      const nearbyItems = getItemsNearPoint(
        rawPoint,
        itemsRef.current,
        new Set([endpointDrag.itemId]),
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);
      setActiveAnchorHit(anchorHit);

      const nextGeometry = updateSegmentEndpoint(
        item,
        endpointDrag.endpoint,
        nextPoint,
        nextConn,
      );
      if (nextGeometry === null) {
        return true;
      }

      setItemsAndSync((current: BoardItem[]) =>
        current.map((candidate) =>
          candidate.id === endpointDrag.itemId
            ? { ...candidate, ...nextGeometry }
            : candidate,
        ),
      );
      return true;
    }

    if (segmentDraft !== null) {
      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const snappedPoint = getSnappedPoint(rawPoint, shouldUseMagnet);

      // Check for connector anchor attachment on the end point
      const excludeIds = new Set<string>();
      if (segmentDraft.startConnection) {
        excludeIds.add(segmentDraft.startConnection.itemId);
      }
      const anchorHit = findNearestConnectorAnchor(
        rawPoint,
        itemsRef.current,
        excludeIds,
        CONNECTOR_SNAP_THRESHOLD,
      );
      const nextPoint = anchorHit ? anchorHit.point : snappedPoint;
      const nextConn: SegmentConnection | null = anchorHit
        ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
        : null;

      // Show anchor indicators on nearby items
      const nearbyItems = getItemsNearPoint(
        rawPoint,
        itemsRef.current,
        excludeIds,
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);
      setActiveAnchorHit(anchorHit);

      setSegmentDraft((current) =>
        current === null
          ? null
          : { ...current, end: nextPoint, endConnection: nextConn },
      );
      return true;
    }

    // When line/arrow tool is active but no draft, show anchor indicators on hover
    if (activeTool === 'line' || activeTool === 'arrow') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const nearbyItems = getItemsNearPoint(
        worldPos,
        itemsRef.current,
        new Set(),
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);

      const anchorHit = findNearestConnectorAnchor(
        worldPos,
        itemsRef.current,
        new Set(),
        CONNECTOR_SNAP_THRESHOLD,
      );
      setActiveAnchorHit(anchorHit);
    }

    return false;
  }

  function handleSegmentDragEnd(e: React.MouseEvent | undefined, magnetEnabled: boolean): boolean {
    const waypointDrag = waypointDragRef.current;
    if (waypointDrag) {
      waypointDragRef.current = null;
      setDeletingWaypointInfo(null);
      const item = itemsRef.current.find(
        (candidate) => candidate.id === waypointDrag.itemId,
      );
      if (item) {
        // If the waypoint is too close to start or end, remove it
        const worldPts = getSegmentWorldPoints(item);
        const waypoints = getSegmentWaypoints(item);
        const wp = waypoints[waypointDrag.waypointIndex];
        const SNAP_DELETE_DIST = 10;
        let shouldDelete = false;
        if (wp !== undefined && worldPts !== null) {
          const wpWorld = { x: item.x + wp.x, y: item.y + wp.y };
          const dStart = Math.hypot(
            wpWorld.x - worldPts.start.x,
            wpWorld.y - worldPts.start.y,
          );
          const dEnd = Math.hypot(
            wpWorld.x - worldPts.end.x,
            wpWorld.y - worldPts.end.y,
          );
          shouldDelete = dStart < SNAP_DELETE_DIST || dEnd < SNAP_DELETE_DIST;
        }

        if (shouldDelete && worldPts !== null) {
          const { startConnection, endConnection } =
            getSegmentConnections(item);
          const newWaypoints = waypoints.filter(
            (_, i) => i !== waypointDrag.waypointIndex,
          );
          const newWorldWaypoints = newWaypoints.map((w) => ({
            x: item.x + w.x,
            y: item.y + w.y,
          }));
          const geometry = buildSegmentGeometry(
            worldPts.start,
            worldPts.end,
            newWorldWaypoints,
            startConnection,
            endConnection,
          );
          const nextItem = { ...item, ...geometry };
          setItemsAndSync((current: BoardItem[]) =>
            current.map((candidate) =>
              candidate.id === waypointDrag.itemId ? nextItem : candidate,
            ),
          );
          persistItems([nextItem]);
        } else {
          persistItems([item]);
        }
        recordHistoryCheckpoint(waypointDrag.snapshot);
      }
      return true;
    }

    const endpointDrag = segmentEndpointDragRef.current;
    if (endpointDrag) {
      segmentEndpointDragRef.current = null;
      const item = itemsRef.current.find(
        (candidate) => candidate.id === endpointDrag.itemId,
      );
      if (item) {
        persistItems([item]);
        recordHistoryCheckpoint(endpointDrag.snapshot);
      }
      return true;
    }

    const pendingSegmentDraft = segmentDraft;
    if (pendingSegmentDraft !== null) {
      // Snap end point to anchor if available
      let finalEnd = pendingSegmentDraft.end;
      let finalEndConn = pendingSegmentDraft.endConnection;
      if (e !== undefined) {
        const rawEnd = screenToWorld(e.clientX, e.clientY);
        const snappedEnd = getSnappedPoint(rawEnd, magnetEnabled && !e.altKey);
        const excludeIds = new Set<string>();
        if (pendingSegmentDraft.startConnection) {
          excludeIds.add(pendingSegmentDraft.startConnection.itemId);
        }
        const anchorHit = findNearestConnectorAnchor(
          rawEnd,
          itemsRef.current,
          excludeIds,
          CONNECTOR_SNAP_THRESHOLD,
        );
        finalEnd = anchorHit ? anchorHit.point : snappedEnd;
        finalEndConn = anchorHit
          ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
          : null;
      }

      setSegmentDraft(null);
      void handleCreateSegmentItem({
        ...pendingSegmentDraft,
        end: finalEnd,
        endConnection: finalEndConn,
      });
      return true;
    }

    return false;
  }

  return {
    handleSegmentEndpointMouseDown,
    handleSegmentWaypointMouseDown,
    handleSegmentMidpointMouseDown,
    handleSegmentDragMove,
    handleSegmentDragEnd,
  };
}
