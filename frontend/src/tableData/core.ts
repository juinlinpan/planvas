import {
  TABLE_CELL_MIN_WIDTH,
  TABLE_CELL_MIN_HEIGHT,
  type TableCellData,
  type TableData,
  type TableChildLayoutDirection,
} from './types';
import { parseTableData } from './serialization';
import { clampDim } from './cellOps';

export function getTableMinSize(
  rows: number,
  cols: number,
): { width: number; height: number } {
  const safeRows = clampDim(rows, 1);
  const safeCols = clampDim(cols, 1);

  return {
    width: safeCols * TABLE_CELL_MIN_WIDTH,
    height: safeRows * TABLE_CELL_MIN_HEIGHT,
  };
}

export function getTableMinSizeFromDataJson(dataJson: string | null): {
  width: number;
  height: number;
} {
  const tableData = parseTableData(dataJson);
  return getTableMinSize(tableData.rows, tableData.cols);
}

// ── Find root cell ────────────────────────────────────────────────────────

/** Returns the non-null cell whose span covers position [row, col]. */
export function getRootCellAt(
  data: TableData,
  row: number,
  col: number,
): { cell: TableCellData; row: number; col: number } | null {
  const direct = data.cells[row]?.[col];
  if (direct !== null && direct !== undefined) {
    return { cell: direct, row, col };
  }
  for (let r = 0; r <= row; r++) {
    for (let c = 0; c <= col; c++) {
      const candidate = data.cells[r]?.[c];
      if (!candidate) continue;
      if (r + candidate.rowSpan > row && c + candidate.colSpan > col) {
        return { cell: candidate, row: r, col: c };
      }
    }
  }
  return null;
}

export function getEffectiveTableCellChildLayoutDirection(
  data: Pick<TableData, 'childLayoutDirection' | 'childLayoutUpdatedAt'>,
  cell: Pick<TableCellData, 'childLayoutDirection' | 'childLayoutUpdatedAt'>,
): TableChildLayoutDirection {
  const tableDirection = data.childLayoutDirection ?? 'vertical';
  const tableUpdatedAt = data.childLayoutUpdatedAt ?? 0;
  const cellUpdatedAt = cell.childLayoutUpdatedAt ?? -1;

  if (
    cell.childLayoutDirection !== undefined &&
    cellUpdatedAt >= tableUpdatedAt
  ) {
    return cell.childLayoutDirection;
  }

  return tableDirection;
}

export function getNextTableLayoutUpdatedAt(data: TableData): number {
  const cellMax = data.cells
    .flat()
    .reduce((max, cell) => Math.max(max, cell?.childLayoutUpdatedAt ?? 0), 0);
  return Math.max(data.childLayoutUpdatedAt ?? 0, cellMax) + 1;
}

// ── Cumulative positions ────────────────────────────────────────────────

export function getCumulativeColPositions(colWidths: number[]): number[] {
  const result: number[] = [0];
  for (const w of colWidths) result.push((result[result.length - 1] ?? 0) + w);
  return result;
}

export function getCumulativeRowPositions(rowHeights: number[]): number[] {
  const result: number[] = [0];
  for (const h of rowHeights) result.push((result[result.length - 1] ?? 0) + h);
  return result;
}

// ── Effective edge positions (supports per-segment overrides) ───────────

/**
 * Get the effective x-position of column edge `edgeIndex` at a given row.
 * edgeIndex 0 = left table edge (always 0), edgeIndex cols = right table edge (always 1).
 * Internal edges 1..cols-1 correspond to boundary (edgeIndex-1).
 */
export function getEffectiveColEdge(
  data: TableData,
  edgeIndex: number,
  row: number,
): number {
  if (edgeIndex <= 0) return 0;
  if (edgeIndex >= data.cols) return 1;
  const bIdx = edgeIndex - 1; // boundary index
  const key = `c${bIdx}r${row}`;
  const override = data.colDividerPositions?.[key];
  if (override !== undefined) return override;
  const cum = getCumulativeColPositions(data.colWidths);
  return cum[edgeIndex] ?? 0;
}

/**
 * Get the effective y-position of row edge `edgeIndex` at a given column.
 */
export function getEffectiveRowEdge(
  data: TableData,
  edgeIndex: number,
  col: number,
): number {
  if (edgeIndex <= 0) return 0;
  if (edgeIndex >= data.rows) return 1;
  const bIdx = edgeIndex - 1; // boundary index
  const key = `r${bIdx}c${col}`;
  const override = data.rowDividerPositions?.[key];
  if (override !== undefined) return override;
  const cum = getCumulativeRowPositions(data.rowHeights);
  return cum[edgeIndex] ?? 0;
}

// ── Cell bounds ─────────────────────────────────────────────────────────

export function getCellBounds(
  data: TableData,
  row: number,
  col: number,
  colSpan: number,
  rowSpan: number,
): { left: number; top: number; width: number; height: number } {
  const left = getEffectiveColEdge(data, col, row);
  const right = getEffectiveColEdge(data, col + colSpan, row);
  const top = getEffectiveRowEdge(data, row, col);
  const bottom = getEffectiveRowEdge(data, row + rowSpan, col);
  return { left, top, width: right - left, height: bottom - top };
}
