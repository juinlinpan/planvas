import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  type TableCellData,
  type TableCellDeleteOperation,
  type TableChildLayoutDirection,
  type TableData,
  type CellPosition,
} from './types';
import { getRootCellAt } from './core';
import {
  deleteCol,
  deleteRow,
} from './rowColOps';

export function clampDim(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(20, Math.max(1, Math.round(value))); // using hardcoded 20 and 1 or imports
}

export function normalizeFractions(fracs: number[]): number[] {
  const sum = fracs.reduce((a, b) => a + b, 0);
  if (sum <= 0) return fracs.map(() => 1 / fracs.length);
  return fracs.map((f) => f / sum);
}

// ── Internal helpers ─────────────────────────────────────────────────────

let _idCounter = 0;

export function makeCellId(): string {
  return `tc${Date.now().toString(36)}${(++_idCounter).toString(36)}`;
}

export function makeCell(): TableCellData {
  return {
    id: makeCellId(),
    content: '',
    backgroundColor: undefined,
    rowSpan: 1,
    colSpan: 1,
    isCollapsed: true,
    childItemIds: [],
  };
}

// ── Create ────────────────────────────────────────────────────────────────

export function createTableData(
  rows = DEFAULT_TABLE_ROWS,
  cols = DEFAULT_TABLE_COLS,
): TableData {
  const r = clampDim(rows, DEFAULT_TABLE_ROWS);
  const c = clampDim(cols, DEFAULT_TABLE_COLS);
  return {
    rows: r,
    cols: c,
    colWidths: Array(c).fill(1 / c) as number[],
    rowHeights: Array(r).fill(1 / r) as number[],
    cells: Array.from({ length: r }, () =>
      Array.from({ length: c }, () => makeCell()),
    ),
  };
}

// ── Cell helpers ─────────────────────────────────────────────────────────

export function updateTableCell(
  data: TableData,
  cellId: string,
  patch: Partial<TableCellData>,
): TableData {
  return {
    ...data,
    cells: data.cells.map((row) =>
      row.map((cell) =>
        cell && cell.id === cellId ? { ...cell, ...patch } : cell,
      ),
    ),
  };
}

export function clearTableCells(
  data: TableData,
  cellIds: string[],
): { data: TableData; clearedChildItemIds: string[] } {
  const targetIds = new Set(cellIds);
  const clearedChildItemIds: string[] = [];

  const nextCells = data.cells.map((row) =>
    row.map((cell) => {
      if (!cell || !targetIds.has(cell.id)) {
        return cell;
      }

      clearedChildItemIds.push(...cell.childItemIds);
      return {
        ...cell,
        content: '',
        childItemIds: [],
      };
    }),
  );

  return {
    data: {
      ...data,
      cells: nextCells,
    },
    clearedChildItemIds: [...new Set(clearedChildItemIds)],
  };
}

function getRootCellPositionById(
  data: TableData,
  cellId: string,
): { row: number; col: number; cell: TableCellData } | null {
  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.cols; col++) {
      const cell = data.cells[row]?.[col];
      if (cell?.id === cellId) {
        return { row, col, cell };
      }
    }
  }
  return null;
}

function getSelectedGridPositions(
  data: TableData,
  cellIds: string[],
): Set<string> {
  const positions = new Set<string>();
  const uniqueCellIds = [...new Set(cellIds)];

  for (const cellId of uniqueCellIds) {
    const root = getRootCellPositionById(data, cellId);
    if (root === null) {
      continue;
    }

    for (let rowOffset = 0; rowOffset < root.cell.rowSpan; rowOffset++) {
      for (let colOffset = 0; colOffset < root.cell.colSpan; colOffset++) {
        positions.add(`${root.row + rowOffset},${root.col + colOffset}`);
      }
    }
  }

  return positions;
}

export function getTableCellSelectionRowIndexes(
  data: TableData,
  cellIds: string[],
): number[] {
  const selectedPositions = getSelectedGridPositions(data, cellIds);
  const rows = new Set<number>();

  for (const position of selectedPositions) {
    const [rowPart] = position.split(',');
    rows.add(Number(rowPart));
  }

  return [...rows].sort((a, b) => a - b);
}

export function getTableCellSelectionColIndexes(
  data: TableData,
  cellIds: string[],
): number[] {
  const selectedPositions = getSelectedGridPositions(data, cellIds);
  const cols = new Set<number>();

  for (const position of selectedPositions) {
    const [, colPart] = position.split(',');
    cols.add(Number(colPart));
  }

  return [...cols].sort((a, b) => a - b);
}

export function getTableCellDeleteOperation(
  data: TableData,
  cellIds: string[],
): TableCellDeleteOperation | null {
  const selectedPositions = getSelectedGridPositions(data, cellIds);
  if (selectedPositions.size === 0) {
    return null;
  }

  const selectedRows = new Set<number>();
  const selectedCols = new Set<number>();
  for (const position of selectedPositions) {
    const [rowPart, colPart] = position.split(',');
    selectedRows.add(Number(rowPart));
    selectedCols.add(Number(colPart));
  }

  const rowIndexes = [...selectedRows].sort((a, b) => a - b);
  const colIndexes = [...selectedCols].sort((a, b) => a - b);
  const coversFullRows = rowIndexes.every((row) =>
    Array.from({ length: data.cols }, (_, col) =>
      selectedPositions.has(`${row},${col}`),
    ).every(Boolean),
  );
  const coversFullCols = colIndexes.every((col) =>
    Array.from({ length: data.rows }, (_, row) =>
      selectedPositions.has(`${row},${col}`),
    ).every(Boolean),
  );

  if (coversFullRows && rowIndexes.length < data.rows) {
    return { type: 'rows', rowIndexes };
  }

  if (coversFullCols && colIndexes.length < data.cols) {
    return { type: 'cols', colIndexes };
  }

  return { type: 'cells', cellIds: [...new Set(cellIds)] };
}

export function getChildItemIdsInRows(
  data: TableData,
  rowIndexes: number[],
): string[] {
  const targetRows = new Set(rowIndexes);
  const childItemIds: string[] = [];

  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.cols; col++) {
      const cell = data.cells[row]?.[col];
      if (!cell || !targetRows.has(row)) {
        continue;
      }
      childItemIds.push(...cell.childItemIds);
    }
  }

  return [...new Set(childItemIds)];
}

export function getChildItemIdsInCols(
  data: TableData,
  colIndexes: number[],
): string[] {
  const targetCols = new Set(colIndexes);
  const childItemIds: string[] = [];

  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.cols; col++) {
      const cell = data.cells[row]?.[col];
      if (!cell || !targetCols.has(col)) {
        continue;
      }
      childItemIds.push(...cell.childItemIds);
    }
  }

  return [...new Set(childItemIds)];
}

export function getTableCellIdsInRows(
  data: TableData,
  rowIndexes: number[],
): string[] {
  const targetRows = new Set(rowIndexes);
  const cellIds: string[] = [];

  for (let row = 0; row < data.rows; row++) {
    if (!targetRows.has(row)) {
      continue;
    }

    for (let col = 0; col < data.cols; col++) {
      const cell = data.cells[row]?.[col];
      if (cell) {
        cellIds.push(cell.id);
      }
    }
  }

  return [...new Set(cellIds)];
}

export function getTableCellIdsInCols(
  data: TableData,
  colIndexes: number[],
): string[] {
  const targetCols = new Set(colIndexes);
  const cellIds: string[] = [];

  for (let row = 0; row < data.rows; row++) {
    for (let col = 0; col < data.cols; col++) {
      if (!targetCols.has(col)) {
        continue;
      }

      const cell = data.cells[row]?.[col];
      if (cell) {
        cellIds.push(cell.id);
      }
    }
  }

  return [...new Set(cellIds)];
}

export function getTableCellSummary(cell: TableCellData): string {
  return cell.content;
}

export function countFilledTableCells(data: TableData): number {
  return data.cells.flat().filter((c) => {
    if (!c) return false;
    if (c.childItemIds.length > 0) return true;
    return c.content.trim().length > 0;
  }).length;
}

// ── Merge cells ──────────────────────────────────────────────────────────

function getBoundingRect(
  data: TableData,
  positions: CellPosition[],
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  if (positions.length === 0) return null;
  const allPos = new Set<string>();
  for (const [r, c] of positions) {
    const root = getRootCellAt(data, r, c);
    if (!root) continue;
    for (let dr = 0; dr < root.cell.rowSpan; dr++) {
      for (let dc = 0; dc < root.cell.colSpan; dc++) {
        allPos.add(`${root.row + dr},${root.col + dc}`);
      }
    }
  }
  const rows = [...allPos].map((k) => Number(k.split(',')[0]));
  const cols = [...allPos].map((k) => Number(k.split(',')[1]));
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (!allPos.has(`${r},${c}`)) return null;
    }
  }
  return { minRow, maxRow, minCol, maxCol };
}

export function mergeCells(
  data: TableData,
  positions: CellPosition[],
): TableData {
  const rect = getBoundingRect(data, positions);
  if (!rect) return data;
  const { minRow, maxRow, minCol, maxCol } = rect;
  if (minRow === maxRow && minCol === maxCol) return data;

  const contents: string[] = [];
  let backgroundColor: string | undefined;
  let childLayoutDirection: TableChildLayoutDirection | undefined;
  let childLayoutUpdatedAt: number | undefined;
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.content.trim()) contents.push(cell.content.trim());
      if (backgroundColor === undefined && cell?.backgroundColor) {
        backgroundColor = cell.backgroundColor;
      }
      if (
        cell?.childLayoutDirection !== undefined &&
        (childLayoutUpdatedAt === undefined ||
          (cell.childLayoutUpdatedAt ?? 0) > childLayoutUpdatedAt)
      ) {
        childLayoutDirection = cell.childLayoutDirection;
        childLayoutUpdatedAt = cell.childLayoutUpdatedAt;
      }
    }
  }

  const mergedCell: TableCellData = {
    id: makeCellId(),
    content: contents.join('\n'),
    backgroundColor,
    childLayoutDirection,
    childLayoutUpdatedAt,
    rowSpan: maxRow - minRow + 1,
    colSpan: maxCol - minCol + 1,
    isCollapsed: true,
    childItemIds: [],
  };

  const nextCells = data.cells.map((row, ri) =>
    row.map((cell, ci) => {
      if (ri === minRow && ci === minCol) return mergedCell;
      if (ri >= minRow && ri <= maxRow && ci >= minCol && ci <= maxCol)
        return null;
      return cell;
    }),
  );

  return {
    ...data,
    cells: nextCells,
  };
}

// ── Find cell by child item ID ───────────────────────────────────────────

export function findCellByChildItemId(
  data: TableData,
  childItemId: string,
): { cell: TableCellData; row: number; col: number } | null {
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.childItemIds.includes(childItemId))
        return { cell, row: r, col: c };
    }
  }
  return null;
}

// ── Split cell ───────────────────────────────────────────────────────────

function findCellById(
  data: TableData,
  cellId: string,
): { cell: TableCellData; row: number; col: number } | null {
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.id === cellId) return { cell, row: r, col: c };
    }
  }
  return null;
}

export function splitCellHorizontal(
  data: TableData,
  cellId: string,
): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.rowSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.rowSpan / 2);
  const topCell: TableCellData = { ...target, id: makeCellId(), rowSpan: half };
  const bottomCell: TableCellData = {
    ...target,
    id: makeCellId(),
    content: '',
    childItemIds: [],
    rowSpan: target.rowSpan - half,
  };
  const nextCells = data.cells.map((rowArr, ri) =>
    rowArr.map((cell, ci) => {
      if (ri === row && ci === col) return topCell;
      if (ri === row + half && ci === col) return bottomCell;
      return cell;
    }),
  );
  return {
    ...data,
    cells: nextCells,
  };
}

export function splitCellVertical(data: TableData, cellId: string): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.colSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.colSpan / 2);
  const leftCell: TableCellData = {
    ...target,
    id: makeCellId(),
    colSpan: half,
  };
  const rightCell: TableCellData = {
    ...target,
    id: makeCellId(),
    content: '',
    childItemIds: [],
    colSpan: target.colSpan - half,
  };
  const nextCells = data.cells.map((rowArr, ri) =>
    rowArr.map((cell, ci) => {
      if (ri === row && ci === col) return leftCell;
      if (ri === row && ci === col + half) return rightCell;
      return cell;
    }),
  );
  return {
    ...data,
    cells: nextCells,
  };
}

export function deleteRows(data: TableData, rowIndexes: number[]): TableData {
  return [...new Set(rowIndexes)]
    .sort((a, b) => b - a)
    .reduce((current, rowIndex) => deleteRow(current, rowIndex), data);
}

export function deleteCols(data: TableData, colIndexes: number[]): TableData {
  return [...new Set(colIndexes)]
    .sort((a, b) => b - a)
    .reduce((current, colIndex) => deleteCol(current, colIndex), data);
}
