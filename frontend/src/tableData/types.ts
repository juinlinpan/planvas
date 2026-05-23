import { ITEM_MIN_SIZE, ITEM_TYPE } from '../types';
import {
  type TextHorizontalAlign,
  type TextVerticalAlign,
} from '../itemStyles';

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLS = 3;
export const DEFAULT_TABLE_LABEL_FONT_SIZE = 12;
export const TABLE_LABEL_FONT_SIZE_MIN = 10;
export const TABLE_LABEL_FONT_SIZE_MAX = 32;

export const TABLE_MIN_DIMENSION = 1;
export const TABLE_MAX_DIMENSION = 20;
export const TABLE_CELL_MIN_WIDTH = ITEM_MIN_SIZE[ITEM_TYPE.text_box].width;
export const TABLE_CELL_MIN_HEIGHT = ITEM_MIN_SIZE[ITEM_TYPE.text_box].height;

export type TableChildLayoutDirection = 'vertical' | 'horizontal';

// null = position is covered by a spanning cell from another grid location
export type TableCellData = {
  id: string;
  content: string; // plain text label for the cell
  backgroundColor?: string;
  textHorizontalAlign?: TextHorizontalAlign;
  textVerticalAlign?: TextVerticalAlign;
  childLayoutDirection?: TableChildLayoutDirection;
  childLayoutUpdatedAt?: number;
  rowSpan: number; // >= 1
  colSpan: number; // >= 1
  isCollapsed: boolean;
  /** IDs of board items attached to this cell (max 2) */
  childItemIds: string[];
};

export type TableData = {
  name?: string;
  labelFontSize?: number;
  rows: number;
  cols: number;
  colWidths: number[]; // fractions summing to ~1.0 (one entry per column)
  rowHeights: number[]; // fractions summing to ~1.0 (one entry per row)
  cells: (TableCellData | null)[][];
  /** Per-segment column divider position overrides.
   *  Key: "c{boundaryIdx}r{row}", Value: absolute position fraction (0-1) */
  colDividerPositions?: Record<string, number>;
  /** Per-segment row divider position overrides.
   *  Key: "r{boundaryIdx}c{col}", Value: absolute position fraction (0-1) */
  rowDividerPositions?: Record<string, number>;
  /** Explicit continuity breaks between vertically adjacent column-divider segments.
   *  Key: "c{boundaryIdx}r{row}" means the segments at rows r and r+1 must not auto-join. */
  colDividerBreaks?: Record<string, true>;
  /** Explicit continuity breaks between horizontally adjacent row-divider segments.
   *  Key: "r{boundaryIdx}c{col}" means the segments at cols c and c+1 must not auto-join. */
  rowDividerBreaks?: Record<string, true>;
  childLayoutDirection?: TableChildLayoutDirection;
  childLayoutUpdatedAt?: number;
};

/** A group of contiguous divider segments that move together. */
export type SegmentGroup = {
  type: 'col' | 'row';
  boundaryIndex: number;
  /** Row indices (for col groups) or col indices (for row groups). */
  segments: number[];
  /** Effective position (fraction 0-1). */
  position: number;
  /** Unique key for React / hover tracking. */
  key: string;
};

// [row, col] index pair used by select / merge operations
export type CellPosition = [number, number];

export type TableCellDeleteOperation =
  | { type: 'cells'; cellIds: string[] }
  | { type: 'rows'; rowIndexes: number[] }
  | { type: 'cols'; colIndexes: number[] };
