import { ITEM_DEFAULT_SIZE, ITEM_TYPE } from '../types/index';
import {
  TABLE_CELL_MIN_HEIGHT,
  TABLE_CELL_MIN_WIDTH,
  getTableMinSize,
} from './tableData';

export const TABLE_INSERT_PREVIEW_CELL_WIDTH = 18;
export const TABLE_INSERT_PREVIEW_CELL_HEIGHT = 18;
export const TABLE_INSERT_PREVIEW_CELL_GAP = 2;
export const TABLE_INSERT_PREVIEW_PADDING = 10;
export const TABLE_INSERT_PREVIEW_TOOL_GAP = 8;

const DEFAULT_TABLE_COLS = 3;
const DEFAULT_TABLE_ROWS = 3;
const TABLE_INSERT_TARGET_COL_WIDTH = TABLE_CELL_MIN_WIDTH;
const TABLE_INSERT_TARGET_ROW_HEIGHT = TABLE_CELL_MIN_HEIGHT;

export type TableInsertDirection = {
  x: 1 | -1;
  y: 1 | -1;
};

export type TableInsertDockPosition = 'top' | 'bottom' | 'left' | 'right';

type RectLike = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

export function getTableInsertDirection(
  toolbarPosition: TableInsertDockPosition,
): TableInsertDirection {
  if (toolbarPosition === 'bottom') {
    return { x: 1, y: -1 };
  }

  if (toolbarPosition === 'right') {
    return { x: -1, y: 1 };
  }

  return { x: 1, y: 1 };
}

export function getTableInsertAnchorPoint(
  toolbarPosition: TableInsertDockPosition,
  toolRect: RectLike,
): { x: number; y: number } {
  if (toolbarPosition === 'top') {
    return {
      x: toolRect.left,
      y:
        toolRect.bottom +
        TABLE_INSERT_PREVIEW_TOOL_GAP +
        TABLE_INSERT_PREVIEW_PADDING,
    };
  }

  if (toolbarPosition === 'left') {
    return {
      x:
        toolRect.right +
        TABLE_INSERT_PREVIEW_TOOL_GAP +
        TABLE_INSERT_PREVIEW_PADDING,
      y: toolRect.top + TABLE_INSERT_PREVIEW_PADDING,
    };
  }

  if (toolbarPosition === 'bottom') {
    return {
      x: toolRect.left,
      y:
        toolRect.top -
        TABLE_INSERT_PREVIEW_TOOL_GAP -
        TABLE_INSERT_PREVIEW_PADDING,
    };
  }

  return {
    x:
      toolRect.left -
      TABLE_INSERT_PREVIEW_TOOL_GAP -
      TABLE_INSERT_PREVIEW_PADDING,
    y: toolRect.top + TABLE_INSERT_PREVIEW_PADDING,
  };
}

export function getDirectionalTableInsertDelta(
  deltaX: number,
  deltaY: number,
  direction: TableInsertDirection,
): { x: number; y: number } {
  return {
    x: deltaX * direction.x,
    y: deltaY * direction.y,
  };
}

export function getTableInsertPreviewPosition(
  cursorX: number,
  cursorY: number,
  direction: TableInsertDirection,
  cols: number,
  rows: number,
): {
  left: number;
  top: number;
} {
  const gridWidth =
    cols * TABLE_INSERT_PREVIEW_CELL_WIDTH +
    Math.max(0, cols - 1) * TABLE_INSERT_PREVIEW_CELL_GAP;
  const gridHeight =
    rows * TABLE_INSERT_PREVIEW_CELL_HEIGHT +
    Math.max(0, rows - 1) * TABLE_INSERT_PREVIEW_CELL_GAP;
  const gridLeft = direction.x === 1 ? cursorX : cursorX - gridWidth;
  const gridTop = direction.y === 1 ? cursorY : cursorY - gridHeight;

  return {
    left: gridLeft - TABLE_INSERT_PREVIEW_PADDING,
    top: gridTop - TABLE_INSERT_PREVIEW_PADDING,
  };
}

export function getTableInsertDimensions(
  deltaX: number,
  deltaY: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  const cols = Math.min(
    maxCols,
    Math.max(
      1,
      Math.ceil(
        Math.max(0, deltaX) /
          (TABLE_INSERT_PREVIEW_CELL_WIDTH + TABLE_INSERT_PREVIEW_CELL_GAP),
      ),
    ),
  );
  const rows = Math.min(
    maxRows,
    Math.max(
      1,
      Math.ceil(
        Math.max(0, deltaY) /
          (TABLE_INSERT_PREVIEW_CELL_HEIGHT + TABLE_INSERT_PREVIEW_CELL_GAP),
      ),
    ),
  );
  return { cols, rows };
}

export function getTableInsertCanvasDimensions(
  deltaWorldX: number,
  deltaWorldY: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  const cols = Math.min(
    maxCols,
    Math.max(
      1,
      Math.floor(Math.max(0, deltaWorldX) / TABLE_INSERT_TARGET_COL_WIDTH) + 1,
    ),
  );
  const rows = Math.min(
    maxRows,
    Math.max(
      1,
      Math.floor(Math.max(0, deltaWorldY) / TABLE_INSERT_TARGET_ROW_HEIGHT) + 1,
    ),
  );
  return { cols, rows };
}

export function getTableInsertItemSize(
  cols: number,
  rows: number,
): { width: number; height: number } {
  const baseSize = ITEM_DEFAULT_SIZE[ITEM_TYPE.table];
  const widthPerCol = baseSize.width / DEFAULT_TABLE_COLS;
  const heightPerRow = baseSize.height / DEFAULT_TABLE_ROWS;
  const minSize = getTableMinSize(rows, cols);

  return {
    width: Math.max(minSize.width, widthPerCol * cols),
    height: Math.max(minSize.height, heightPerRow * rows),
  };
}

export function getTableInsertCanvasSize(
  deltaWorldX: number,
  deltaWorldY: number,
  rows = 1,
  cols = 1,
): { width: number; height: number } {
  const minSize = getTableMinSize(rows, cols);

  return {
    width: Math.max(minSize.width, Math.max(0, deltaWorldX)),
    height: Math.max(minSize.height, Math.max(0, deltaWorldY)),
  };
}
