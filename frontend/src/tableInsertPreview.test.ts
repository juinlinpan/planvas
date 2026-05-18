import { describe, expect, it } from 'vitest';
import { TABLE_MAX_DIMENSION } from './tableData';
import {
  getTableInsertCanvasDimensions,
  getTableInsertCanvasSize,
  getDirectionalTableInsertDelta,
  getTableInsertAnchorPoint,
  getTableInsertDirection,
  TABLE_INSERT_PREVIEW_CELL_HEIGHT,
  TABLE_INSERT_PREVIEW_CELL_GAP,
  TABLE_INSERT_PREVIEW_PADDING,
  TABLE_INSERT_PREVIEW_TOOL_GAP,
  TABLE_INSERT_PREVIEW_CELL_WIDTH,
  getTableInsertDimensions,
  getTableInsertItemSize,
  getTableInsertPreviewPosition,
} from './tableInsertPreview';

describe('tableInsertPreview', () => {
  it('keeps the preview at 1x1 until the drag crosses a full cell', () => {
    expect(
      getTableInsertDimensions(
        TABLE_INSERT_PREVIEW_CELL_WIDTH - 1,
        TABLE_INSERT_PREVIEW_CELL_HEIGHT - 1,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({ cols: 1, rows: 1 });
  });

  it('expands rows and cols as the drag grows', () => {
    expect(
      getTableInsertDimensions(
        (TABLE_INSERT_PREVIEW_CELL_WIDTH + TABLE_INSERT_PREVIEW_CELL_GAP) * 3,
        (TABLE_INSERT_PREVIEW_CELL_HEIGHT + TABLE_INSERT_PREVIEW_CELL_GAP) * 2,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({ cols: 3, rows: 2 });
  });

  it('clamps the created table size to the table minimum', () => {
    expect(getTableInsertItemSize(1, 1)).toEqual({ width: 48, height: 48 });
  });

  it('scales the created table size with the chosen grid', () => {
    expect(getTableInsertItemSize(6, 4)).toEqual({
      width: 288,
      height: 192,
    });
  });

  it('uses world-sized thresholds for canvas dragging', () => {
    expect(
      getTableInsertCanvasDimensions(
        47,
        47,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({
      cols: 1,
      rows: 1,
    });
    expect(
      getTableInsertCanvasDimensions(
        48,
        48,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({
      cols: 2,
      rows: 2,
    });
  });

  it('keeps the canvas preview size aligned to the dragged world distance', () => {
    expect(getTableInsertCanvasSize(320, 210, 2, 2)).toEqual({
      width: 320,
      height: 210,
    });
    expect(getTableInsertCanvasSize(40, 40, 1, 1)).toEqual({
      width: 48,
      height: 48,
    });
  });

  it('expands toolbar table previews away from the docked toolbar edge', () => {
    expect(getTableInsertDirection('top')).toEqual({ x: 1, y: 1 });
    expect(getTableInsertDirection('left')).toEqual({ x: 1, y: 1 });
    expect(getTableInsertDirection('bottom')).toEqual({ x: 1, y: -1 });
    expect(getTableInsertDirection('right')).toEqual({ x: -1, y: 1 });
  });

  it('measures toolbar table drag deltas in the preview direction', () => {
    expect(getDirectionalTableInsertDelta(40, -36, { x: 1, y: -1 })).toEqual({
      x: 40,
      y: 36,
    });
    expect(getDirectionalTableInsertDelta(-54, 36, { x: -1, y: 1 })).toEqual({
      x: 54,
      y: 36,
    });
  });

  it('anchors the fixed toolbar preview on the requested corner', () => {
    expect(getTableInsertPreviewPosition(100, 80, { x: 1, y: 1 }, 3, 2)).toEqual({
      left: 100 - TABLE_INSERT_PREVIEW_PADDING,
      top: 80 - TABLE_INSERT_PREVIEW_PADDING,
    });
    expect(getTableInsertPreviewPosition(100, 80, { x: 1, y: -1 }, 3, 2)).toEqual({
      left: 100 - TABLE_INSERT_PREVIEW_PADDING,
      top:
        80 -
        (TABLE_INSERT_PREVIEW_CELL_HEIGHT * 2 + TABLE_INSERT_PREVIEW_CELL_GAP) -
        TABLE_INSERT_PREVIEW_PADDING,
    });
    expect(getTableInsertPreviewPosition(100, 80, { x: -1, y: 1 }, 3, 2)).toEqual({
      left:
        100 -
        (TABLE_INSERT_PREVIEW_CELL_WIDTH * 3 + TABLE_INSERT_PREVIEW_CELL_GAP * 2) -
        TABLE_INSERT_PREVIEW_PADDING,
      top: 80 - TABLE_INSERT_PREVIEW_PADDING,
    });
  });

  it('uses the table button outer edge as the fixed origin', () => {
    const rect = { left: 10, top: 20, right: 50, bottom: 70 };

    expect(getTableInsertAnchorPoint('top', rect)).toEqual({
      x: 10,
      y: 70 + TABLE_INSERT_PREVIEW_TOOL_GAP + TABLE_INSERT_PREVIEW_PADDING,
    });
    expect(getTableInsertAnchorPoint('left', rect)).toEqual({
      x: 50 + TABLE_INSERT_PREVIEW_TOOL_GAP + TABLE_INSERT_PREVIEW_PADDING,
      y: 20 + TABLE_INSERT_PREVIEW_PADDING,
    });
    expect(getTableInsertAnchorPoint('bottom', rect)).toEqual({
      x: 10,
      y: 20 - TABLE_INSERT_PREVIEW_TOOL_GAP - TABLE_INSERT_PREVIEW_PADDING,
    });
    expect(getTableInsertAnchorPoint('right', rect)).toEqual({
      x: 10 - TABLE_INSERT_PREVIEW_TOOL_GAP - TABLE_INSERT_PREVIEW_PADDING,
      y: 20 + TABLE_INSERT_PREVIEW_PADDING,
    });
  });

  it('keeps the preview panel outside a left-docked table button', () => {
    const rect = { left: 86, top: 50, right: 142, bottom: 98 };
    const anchor = getTableInsertAnchorPoint('left', rect);
    const position = getTableInsertPreviewPosition(anchor.x, anchor.y, { x: 1, y: 1 }, 1, 1);

    expect(position.left).toBe(rect.right + TABLE_INSERT_PREVIEW_TOOL_GAP);
    expect(position.top).toBe(rect.top);
  });
});
