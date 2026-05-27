import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { snapPointToGrid } from '../utils/magnet';
import { CANVAS_GRID_SIZE } from '../constants/canvas';
import {
  getTableInsertCanvasDimensions,
  getTableInsertCanvasSize,
} from '../tableData/tableInsertPreview';
import {
  TABLE_MAX_DIMENSION,
  createTableData,
  serializeTableData,
} from '../tableData/tableData';
import { ITEM_TYPE, ITEM_DEFAULT_SIZE, type ActiveTool } from '../types/index';
import type { Point } from '../utils/export/segmentData';
import type { TableInsertDraftState, TableInsertPreviewState } from '../types/canvas';

export type UseCanvasTableInsertParams = {
  tableInsertDraftRef: MutableRefObject<TableInsertDraftState | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  magnetEnabled: boolean;
  activeTool: ActiveTool;
  toolbarTableInsertPreviewActive: boolean;
  screenToWorld: (x: number, y: number) => Point;
  setTableInsertPreview: (preview: TableInsertPreviewState | null) => void;
  setActiveTool: (tool: ActiveTool) => void;
  handleCreateItem: (params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content?: string | null;
    dataJson?: string | null;
  }) => void;
};

export function useCanvasTableInsert({
  tableInsertDraftRef,
  containerRef,
  magnetEnabled,
  activeTool,
  toolbarTableInsertPreviewActive,
  screenToWorld,
  setTableInsertPreview,
  setActiveTool,
  handleCreateItem,
}: UseCanvasTableInsertParams) {
  function getSnappedPoint(point: Point, shouldSnap: boolean): Point {
    return shouldSnap ? snapPointToGrid(point, CANVAS_GRID_SIZE) : point;
  }

  function startTableInsertDraft(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const worldPos = screenToWorld(clientX, clientY);
    const snappedWorldPos = getSnappedPoint(worldPos, magnetEnabled);
    tableInsertDraftRef.current = {
      startClientX: clientX,
      startClientY: clientY,
      startWorldX: snappedWorldPos.x,
      startWorldY: snappedWorldPos.y,
    };
    setTableInsertPreview({
      cursorX: clientX - rect.left,
      cursorY: clientY - rect.top,
      cols: 1,
      rows: 1,
      isActive: true,
      worldX: snappedWorldPos.x,
      worldY: snappedWorldPos.y,
      width: getTableInsertCanvasSize(0, 0).width,
      height: getTableInsertCanvasSize(0, 0).height,
    });
  }

  function handleTableInsertMouseMove(e: React.MouseEvent): boolean {
    if (activeTool !== 'table') {
      return false;
    }

    if (toolbarTableInsertPreviewActive) {
      setTableInsertPreview(null);
      return true;
    }
    const draft = tableInsertDraftRef.current;
    if (draft === null) {
      setTableInsertPreview(null);
      return true;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setTableInsertPreview(null);
      return true;
    }

    const worldPos = getSnappedPoint(
      screenToWorld(e.clientX, e.clientY),
      magnetEnabled,
    );
    const deltaWorldX = worldPos.x - draft.startWorldX;
    const deltaWorldY = worldPos.y - draft.startWorldY;
    const dims = getTableInsertCanvasDimensions(
      deltaWorldX,
      deltaWorldY,
      TABLE_MAX_DIMENSION,
      TABLE_MAX_DIMENSION,
    );
    const size = getTableInsertCanvasSize(
      deltaWorldX,
      deltaWorldY,
      dims.rows,
      dims.cols,
    );
    setTableInsertPreview({
      cursorX: draft.startClientX - rect.left,
      cursorY: draft.startClientY - rect.top,
      cols: dims.cols,
      rows: dims.rows,
      isActive: true,
      worldX: draft.startWorldX,
      worldY: draft.startWorldY,
      width: size.width,
      height: size.height,
    });
    return true;
  }

  function handleTableInsertMouseUp(e: React.MouseEvent | undefined): boolean {
    const tableInsertDraft = tableInsertDraftRef.current;
    tableInsertDraftRef.current = null;
    setTableInsertPreview(null);

    if (tableInsertDraft !== null) {
      const worldPos =
        e === undefined
          ? {
              x:
                tableInsertDraft.startWorldX +
                ITEM_DEFAULT_SIZE[ITEM_TYPE.table].width,
              y:
                tableInsertDraft.startWorldY +
                ITEM_DEFAULT_SIZE[ITEM_TYPE.table].height,
            }
          : getSnappedPoint(screenToWorld(e.clientX, e.clientY), magnetEnabled);
      const deltaWorldX = worldPos.x - tableInsertDraft.startWorldX;
      const deltaWorldY = worldPos.y - tableInsertDraft.startWorldY;
      const dims = getTableInsertCanvasDimensions(
        deltaWorldX,
        deltaWorldY,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      const size = getTableInsertCanvasSize(
        deltaWorldX,
        deltaWorldY,
        dims.rows,
        dims.cols,
      );
      void handleCreateItem({
        type: ITEM_TYPE.table,
        x: tableInsertDraft.startWorldX,
        y: tableInsertDraft.startWorldY,
        width: size.width,
        height: size.height,
        dataJson: serializeTableData(createTableData(dims.rows, dims.cols)),
      });
      setActiveTool('select');
      return true;
    }

    return false;
  }

  return {
    startTableInsertDraft,
    handleTableInsertMouseMove,
    handleTableInsertMouseUp,
  };
}
