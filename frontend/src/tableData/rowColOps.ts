import {
  TABLE_MAX_DIMENSION,
  TABLE_MIN_DIMENSION,
  type TableData,
  type TableCellData,
} from './types';
import {
  getEffectiveColEdge,
  getEffectiveRowEdge,
} from './core';
import {
  clampDim,
  getTableCellSelectionColIndexes,
  getTableCellSelectionRowIndexes,
  normalizeFractions,
  createTableData,
  makeCell,
} from './cellOps';

// ── Position remapping for structural changes ────────────────────────────

function remapPositionsForAddRow(
  data: TableData,
  insertAt: number,
): Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> {
  const result: Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> =
    {};
  if (data.colDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r < insertAt) {
        next[key] = val;
      } else {
        next[`c${b}r${r + 1}`] = val;
      }
    }
    // New row inherits from row above
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r === insertAt - 1 || (r === insertAt && insertAt === 0)) {
        next[`c${b}r${insertAt}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.colDividerPositions = next;
  }
  if (data.rowDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (b < insertAt) {
        next[key] = val;
      } else {
        next[`r${b + 1}c${c}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.rowDividerPositions = next;
  }
  return result;
}

function remapPositionsForAddCol(
  data: TableData,
  insertAt: number,
): Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> {
  const result: Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> =
    {};
  if (data.colDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (b < insertAt) {
        next[key] = val;
      } else {
        next[`c${b + 1}r${r}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.colDividerPositions = next;
  }
  if (data.rowDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c < insertAt) {
        next[key] = val;
      } else {
        next[`r${b}c${c + 1}`] = val;
      }
    }
    // New col inherits from col to the left
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c === insertAt - 1 || (c === insertAt && insertAt === 0)) {
        next[`r${b}c${insertAt}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.rowDividerPositions = next;
  }
  return result;
}

// ── Add row / col ────────────────────────────────────────────────────────

export function addRow(data: TableData, afterRowIndex: number): TableData {
  if (data.rows >= TABLE_MAX_DIMENSION) return data;
  const insertAt = Math.max(0, Math.min(data.rows, afterRowIndex + 1));
  const newRow = Array.from({ length: data.cols }, () => makeCell());
  const nextCells = [
    ...data.cells.slice(0, insertAt),
    newRow,
    ...data.cells.slice(insertAt),
  ];
  const newFrac = 1 / (data.rows + 1);
  const scaleFactor = 1 - newFrac;
  const nextRowHeights = normalizeFractions([
    ...data.rowHeights.slice(0, insertAt).map((h) => h * scaleFactor),
    newFrac,
    ...data.rowHeights.slice(insertAt).map((h) => h * scaleFactor),
  ]);
  // Extend rowSpan of cells that cross the insertion point
  const finalCells = nextCells.map((row, ri) =>
    row.map((cell) => {
      if (!cell) return cell;
      if (ri < insertAt && ri + cell.rowSpan > insertAt) {
        return { ...cell, rowSpan: cell.rowSpan + 1 };
      }
      return cell;
    }),
  );
  return {
    ...data,
    rows: data.rows + 1,
    rowHeights: nextRowHeights,
    cells: finalCells,
    ...remapPositionsForAddRow(data, insertAt),
  };
}

export function addCol(data: TableData, afterColIndex: number): TableData {
  if (data.cols >= TABLE_MAX_DIMENSION) return data;
  const insertAt = Math.max(0, Math.min(data.cols, afterColIndex + 1));
  const nextCells = data.cells.map((row) => [
    ...row.slice(0, insertAt),
    makeCell(),
    ...row.slice(insertAt),
  ]);
  const newFrac = 1 / (data.cols + 1);
  const scaleFactor = 1 - newFrac;
  const nextColWidths = normalizeFractions([
    ...data.colWidths.slice(0, insertAt).map((w) => w * scaleFactor),
    newFrac,
    ...data.colWidths.slice(insertAt).map((w) => w * scaleFactor),
  ]);
  const finalCells = nextCells.map((row) =>
    row.map((cell, ci) => {
      if (!cell) return cell;
      if (ci < insertAt && ci + cell.colSpan > insertAt) {
        return { ...cell, colSpan: cell.colSpan + 1 };
      }
      return cell;
    }),
  );
  return {
    ...data,
    cols: data.cols + 1,
    colWidths: nextColWidths,
    cells: finalCells,
    ...remapPositionsForAddCol(data, insertAt),
  };
}

// ── Resize col / row (drag divider) ─────────────────────────────────────

const MIN_FRAC = 0.04;

function groupContiguousIndexes(indexes: number[]): number[][] {
  const groups: number[][] = [];
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);

  for (const index of sorted) {
    const current = groups[groups.length - 1];
    if (
      current === undefined ||
      index !== (current[current.length - 1] ?? -2) + 1
    ) {
      groups.push([index]);
    } else {
      current.push(index);
    }
  }

  return groups;
}

export function distributeSelectedColumnWidths(
  data: TableData,
  cellIds: string[],
): TableData {
  const groups = groupContiguousIndexes(
    getTableCellSelectionColIndexes(data, cellIds),
  ).filter((group) => group.length >= 2);
  if (groups.length === 0) return data;

  const nextColWidths = [...data.colWidths];
  const nextColPositions: Record<string, number> = {
    ...(data.colDividerPositions ?? {}),
  };

  for (const group of groups) {
    const start = group[0]!;
    const end = group[group.length - 1]!;
    const totalWidth = group.reduce(
      (sum, colIndex) => sum + (data.colWidths[colIndex] ?? 0),
      0,
    );
    const equalWidth = totalWidth / group.length;

    for (const colIndex of group) {
      nextColWidths[colIndex] = equalWidth;
    }

    for (let row = 0; row < data.rows; row += 1) {
      const left = getEffectiveColEdge(data, start, row);
      const right = getEffectiveColEdge(data, end + 1, row);
      const total = right - left;

      for (let edgeIndex = start + 1; edgeIndex <= end; edgeIndex += 1) {
        const offset = edgeIndex - start;
        nextColPositions[`c${edgeIndex - 1}r${row}`] =
          left + (total * offset) / group.length;
      }
    }
  }

  return {
    ...data,
    colWidths: normalizeFractions(nextColWidths),
    colDividerPositions:
      Object.keys(nextColPositions).length > 0 ? nextColPositions : undefined,
  };
}

export function distributeSelectedRowHeights(
  data: TableData,
  cellIds: string[],
): TableData {
  const groups = groupContiguousIndexes(
    getTableCellSelectionRowIndexes(data, cellIds),
  ).filter((group) => group.length >= 2);
  if (groups.length === 0) return data;

  const nextRowHeights = [...data.rowHeights];
  const nextRowPositions: Record<string, number> = {
    ...(data.rowDividerPositions ?? {}),
  };

  for (const group of groups) {
    const start = group[0]!;
    const end = group[group.length - 1]!;
    const totalHeight = group.reduce(
      (sum, rowIndex) => sum + (data.rowHeights[rowIndex] ?? 0),
      0,
    );
    const equalHeight = totalHeight / group.length;

    for (const rowIndex of group) {
      nextRowHeights[rowIndex] = equalHeight;
    }

    for (let col = 0; col < data.cols; col += 1) {
      const top = getEffectiveRowEdge(data, start, col);
      const bottom = getEffectiveRowEdge(data, end + 1, col);
      const total = bottom - top;

      for (let edgeIndex = start + 1; edgeIndex <= end; edgeIndex += 1) {
        const offset = edgeIndex - start;
        nextRowPositions[`r${edgeIndex - 1}c${col}`] =
          top + (total * offset) / group.length;
      }
    }
  }

  return {
    ...data,
    rowHeights: normalizeFractions(nextRowHeights),
    rowDividerPositions:
      Object.keys(nextRowPositions).length > 0 ? nextRowPositions : undefined,
  };
}

export function resizeColumn(
  data: TableData,
  colIndex: number,
  deltaFraction: number,
): TableData {
  if (colIndex + 1 >= data.colWidths.length) return data;
  const widths = [...data.colWidths];
  const total = (widths[colIndex] ?? 0) + (widths[colIndex + 1] ?? 0);
  const newA = Math.min(
    total - MIN_FRAC,
    Math.max(MIN_FRAC, (widths[colIndex] ?? 0) + deltaFraction),
  );
  widths[colIndex] = newA;
  widths[colIndex + 1] = total - newA;
  return { ...data, colWidths: widths };
}

export function resizeRow(
  data: TableData,
  rowIndex: number,
  deltaFraction: number,
): TableData {
  if (rowIndex + 1 >= data.rowHeights.length) return data;
  const heights = [...data.rowHeights];
  const total = (heights[rowIndex] ?? 0) + (heights[rowIndex + 1] ?? 0);
  const newA = Math.min(
    total - MIN_FRAC,
    Math.max(MIN_FRAC, (heights[rowIndex] ?? 0) + deltaFraction),
  );
  heights[rowIndex] = newA;
  heights[rowIndex + 1] = total - newA;
  return { ...data, rowHeights: heights };
}

// ── Legacy compat (Inspector resize UI) ─────────────────────────────────

export function resizeTableData(
  data: TableData,
  rows: number,
  cols: number,
): TableData {
  return createTableData(rows, cols);
}

export function scaleTableDividerPositions(
  data: TableData,
  colScale: number,
  rowScale: number,
): TableData {
  const nextColPositions = data.colDividerPositions
    ? Object.fromEntries(
        Object.entries(data.colDividerPositions).map(([key, value]) => [
          key,
          value * colScale,
        ]),
      )
    : undefined;
  const nextRowPositions = data.rowDividerPositions
    ? Object.fromEntries(
        Object.entries(data.rowDividerPositions).map(([key, value]) => [
          key,
          value * rowScale,
        ]),
      )
    : undefined;

  return {
    ...data,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
  };
}

export function preserveOuterAddColLayout(
  previousData: TableData,
  expandedData: TableData,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return expandedData;
  }
  const oldAreaFraction = oldWidth / newWidth;
  const nextColPositions: Record<string, number> = {
    ...(expandedData.colDividerPositions ?? {}),
  };
  const nextRowPositions: Record<string, number> = {
    ...(expandedData.rowDividerPositions ?? {}),
  };

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    for (let row = 0; row < previousData.rows; row += 1) {
      nextColPositions[`c${boundary}r${row}`] =
        getEffectiveColEdge(previousData, boundary + 1, row) * oldAreaFraction;
    }
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    const inheritedY = getEffectiveRowEdge(
      previousData,
      boundary + 1,
      Math.max(0, previousData.cols - 1),
    );
    for (let col = 0; col < expandedData.cols; col += 1) {
      const sourceCol = Math.min(col, Math.max(0, previousData.cols - 1));
      nextRowPositions[`r${boundary}c${col}`] =
        col < previousData.cols
          ? getEffectiveRowEdge(previousData, boundary + 1, sourceCol)
          : inheritedY;
    }
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    colWidths: [
      ...previousData.colWidths.map((width) => width * oldAreaFraction),
      1 - oldAreaFraction,
    ],
  };
}

export function preserveOuterAddRowLayout(
  previousData: TableData,
  expandedData: TableData,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return expandedData;
  }
  const oldAreaFraction = oldHeight / newHeight;
  const nextColPositions: Record<string, number> = {
    ...(expandedData.colDividerPositions ?? {}),
  };
  const nextRowPositions: Record<string, number> = {
    ...(expandedData.rowDividerPositions ?? {}),
  };

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    const inheritedX = getEffectiveColEdge(
      previousData,
      boundary + 1,
      Math.max(0, previousData.rows - 1),
    );
    for (let row = 0; row < expandedData.rows; row += 1) {
      const sourceRow = Math.min(row, Math.max(0, previousData.rows - 1));
      nextColPositions[`c${boundary}r${row}`] =
        row < previousData.rows
          ? getEffectiveColEdge(previousData, boundary + 1, sourceRow)
          : inheritedX;
    }
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    for (let col = 0; col < previousData.cols; col += 1) {
      nextRowPositions[`r${boundary}c${col}`] =
        getEffectiveRowEdge(previousData, boundary + 1, col) * oldAreaFraction;
    }
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    rowHeights: [
      ...previousData.rowHeights.map((height) => height * oldAreaFraction),
      1 - oldAreaFraction,
    ],
  };
}

export function preserveOuterPrependColLayout(
  previousData: TableData,
  expandedData: TableData,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return expandedData;
  }
  const oldAreaFraction = oldWidth / newWidth;
  const newAreaFraction = 1 - oldAreaFraction;
  const nextColPositions: Record<string, number> = {};
  const nextRowPositions: Record<string, number> = {
    ...(expandedData.rowDividerPositions ?? {}),
  };

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    for (let row = 0; row < previousData.rows; row += 1) {
      nextColPositions[`c${boundary + 1}r${row}`] =
        newAreaFraction +
        getEffectiveColEdge(previousData, boundary + 1, row) *
          oldAreaFraction;
    }
  }
  for (let row = 0; row < previousData.rows; row += 1) {
    nextColPositions[`c0r${row}`] = newAreaFraction;
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    const inheritedY = getEffectiveRowEdge(previousData, boundary + 1, 0);
    for (let col = 0; col < expandedData.cols; col += 1) {
      const sourceCol = Math.max(0, col - 1);
      nextRowPositions[`r${boundary}c${col}`] =
        col === 0
          ? inheritedY
          : getEffectiveRowEdge(previousData, boundary + 1, sourceCol);
    }
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    colWidths: [
      newAreaFraction,
      ...previousData.colWidths.map((width) => width * oldAreaFraction),
    ],
  };
}

export function preserveOuterPrependRowLayout(
  previousData: TableData,
  expandedData: TableData,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return expandedData;
  }
  const oldAreaFraction = oldHeight / newHeight;
  const newAreaFraction = 1 - oldAreaFraction;
  const nextColPositions: Record<string, number> = {
    ...(expandedData.colDividerPositions ?? {}),
  };
  const nextRowPositions: Record<string, number> = {};

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    const inheritedX = getEffectiveColEdge(previousData, boundary + 1, 0);
    for (let row = 0; row < expandedData.rows; row += 1) {
      const sourceRow = Math.max(0, row - 1);
      nextColPositions[`c${boundary}r${row}`] =
        row === 0
          ? inheritedX
          : getEffectiveColEdge(previousData, boundary + 1, sourceRow);
    }
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    for (let col = 0; col < previousData.cols; col += 1) {
      nextRowPositions[`r${boundary + 1}c${col}`] =
        newAreaFraction +
        getEffectiveRowEdge(previousData, boundary + 1, col) * oldAreaFraction;
    }
  }
  for (let col = 0; col < previousData.cols; col += 1) {
    nextRowPositions[`r0c${col}`] = newAreaFraction;
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    rowHeights: [
      newAreaFraction,
      ...previousData.rowHeights.map((height) => height * oldAreaFraction),
    ],
  };
}

// ── Delete row / col ─────────────────────────────────────────────────────

type DividerState = Pick<
  TableData,
  | 'colDividerPositions'
  | 'rowDividerPositions'
  | 'colDividerBreaks'
  | 'rowDividerBreaks'
>;

function remapPositionsForDeleteRow(
  data: TableData,
  rowIndex: number,
): DividerState {
  const colPos: Record<string, number> = {};
  if (data.colDividerPositions) {
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r < rowIndex) colPos[key] = val;
      else if (r > rowIndex) colPos[`c${b}r${r - 1}`] = val;
    }
  }

  const rowPos: Record<string, number> = {};
  if (data.rowDividerPositions) {
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (b < rowIndex - 1) rowPos[key] = val;
      else if (b <= rowIndex) {
        /* skip boundaries adjacent to deleted row */
      } else rowPos[`r${b - 1}c${c}`] = val;
    }
  }

  const colBreaks: Record<string, true> = {};
  if (data.colDividerBreaks) {
    for (const [key] of Object.entries(data.colDividerBreaks)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r < rowIndex) colBreaks[key] = true;
      else if (r > rowIndex) colBreaks[`c${b}r${r - 1}`] = true;
    }
  }

  const rowBreaks: Record<string, true> = {};
  if (data.rowDividerBreaks) {
    for (const [key] of Object.entries(data.rowDividerBreaks)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (b < rowIndex - 1) rowBreaks[key] = true;
      else if (b <= rowIndex) {
        /* skip */
      } else rowBreaks[`r${b - 1}c${c}`] = true;
    }
  }

  return {
    colDividerPositions: Object.keys(colPos).length > 0 ? colPos : undefined,
    rowDividerPositions: Object.keys(rowPos).length > 0 ? rowPos : undefined,
    colDividerBreaks: Object.keys(colBreaks).length > 0 ? colBreaks : undefined,
    rowDividerBreaks: Object.keys(rowBreaks).length > 0 ? rowBreaks : undefined,
  };
}

function remapPositionsForDeleteCol(
  data: TableData,
  colIndex: number,
): DividerState {
  const colPos: Record<string, number> = {};
  if (data.colDividerPositions) {
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (b < colIndex - 1) colPos[key] = val;
      else if (b <= colIndex) {
        /* skip boundaries adjacent to deleted col */
      } else colPos[`c${b - 1}r${r}`] = val;
    }
  }

  const rowPos: Record<string, number> = {};
  if (data.rowDividerPositions) {
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c < colIndex) rowPos[key] = val;
      else if (c > colIndex) rowPos[`r${b}c${c - 1}`] = val;
    }
  }

  const colBreaks: Record<string, true> = {};
  if (data.colDividerBreaks) {
    for (const [key] of Object.entries(data.colDividerBreaks)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (b < colIndex - 1) colBreaks[key] = true;
      else if (b <= colIndex) {
        /* skip */
      } else colBreaks[`c${b - 1}r${r}`] = true;
    }
  }

  const rowBreaks: Record<string, true> = {};
  if (data.rowDividerBreaks) {
    for (const [key] of Object.entries(data.rowDividerBreaks)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c < colIndex) rowBreaks[key] = true;
      else if (c > colIndex) rowBreaks[`r${b}c${c - 1}`] = true;
    }
  }

  return {
    colDividerPositions: Object.keys(colPos).length > 0 ? colPos : undefined,
    rowDividerPositions: Object.keys(rowPos).length > 0 ? rowPos : undefined,
    colDividerBreaks: Object.keys(colBreaks).length > 0 ? colBreaks : undefined,
    rowDividerBreaks: Object.keys(rowBreaks).length > 0 ? rowBreaks : undefined,
  };
}

/** Delete the row at `rowIndex`. No-op if the table only has one row. */
export function deleteRow(data: TableData, rowIndex: number): TableData {
  if (data.rows <= TABLE_MIN_DIMENSION) return data;
  if (rowIndex < 0 || rowIndex >= data.rows) return data;

  // Clone and adjust spans for cells spanning over rowIndex from above
  const adjusted: (TableCellData | null)[][] = data.cells.map((row, ri) =>
    row.map((cell) => {
      if (!cell) return null;
      if (ri < rowIndex && ri + cell.rowSpan > rowIndex) {
        return { ...cell, rowSpan: cell.rowSpan - 1 };
      }
      return cell;
    }),
  );

  // Cells starting at rowIndex with rowSpan > 1 must be promoted to the next row
  if (rowIndex + 1 < data.rows) {
    for (let c = 0; c < data.cols; c++) {
      const cell = adjusted[rowIndex]?.[c];
      if (cell && cell.rowSpan > 1) {
        adjusted[rowIndex + 1]![c] = { ...cell, rowSpan: cell.rowSpan - 1 };
      }
    }
  }

  adjusted.splice(rowIndex, 1);

  const nextRowHeights = normalizeFractions(
    data.rowHeights.filter((_, i) => i !== rowIndex),
  );
  const remapped = remapPositionsForDeleteRow(data, rowIndex);

  return {
    ...data,
    rows: data.rows - 1,
    rowHeights: nextRowHeights,
    cells: adjusted,
    colDividerPositions: remapped.colDividerPositions,
    rowDividerPositions: remapped.rowDividerPositions,
    colDividerBreaks: remapped.colDividerBreaks,
    rowDividerBreaks: remapped.rowDividerBreaks,
  };
}

/** Delete the column at `colIndex`. No-op if the table only has one column. */
export function deleteCol(data: TableData, colIndex: number): TableData {
  if (data.cols <= TABLE_MIN_DIMENSION) return data;
  if (colIndex < 0 || colIndex >= data.cols) return data;

  // Adjust spans for cells spanning over colIndex from the left
  const adjusted: (TableCellData | null)[][] = data.cells.map((row) =>
    row.map((cell, ci) => {
      if (!cell) return null;
      if (ci < colIndex && ci + cell.colSpan > colIndex) {
        return { ...cell, colSpan: cell.colSpan - 1 };
      }
      return cell;
    }),
  );

  // Cells starting at colIndex with colSpan > 1 must be promoted to the next column
  if (colIndex + 1 < data.cols) {
    for (let r = 0; r < data.rows; r++) {
      const cell = adjusted[r]?.[colIndex];
      if (cell && cell.colSpan > 1) {
        adjusted[r]![colIndex + 1] = { ...cell, colSpan: cell.colSpan - 1 };
      }
    }
  }

  const nextCells = adjusted.map((row) =>
    row.filter((_, ci) => ci !== colIndex),
  );
  const nextColWidths = normalizeFractions(
    data.colWidths.filter((_, i) => i !== colIndex),
  );
  const remapped = remapPositionsForDeleteCol(data, colIndex);

  return {
    ...data,
    cols: data.cols - 1,
    colWidths: nextColWidths,
    cells: nextCells,
    colDividerPositions: remapped.colDividerPositions,
    rowDividerPositions: remapped.rowDividerPositions,
    colDividerBreaks: remapped.colDividerBreaks,
    rowDividerBreaks: remapped.rowDividerBreaks,
  };
}
