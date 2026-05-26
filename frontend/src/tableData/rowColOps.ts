import {
  TABLE_MAX_DIMENSION,
  TABLE_MIN_DIMENSION,
  type TableData,
  type TableCellData,
} from './types';
import {
  getTableCellSelectionColIndexes,
  getTableCellSelectionRowIndexes,
  normalizeFractions,
  createTableData,
  makeCell,
} from './cellOps';

function withoutDividerState(data: TableData): TableData {
  const {
    colDividerPositions: _colDividerPositions,
    rowDividerPositions: _rowDividerPositions,
    colDividerBreaks: _colDividerBreaks,
    rowDividerBreaks: _rowDividerBreaks,
    ...rest
  } = data;
  return rest;
}

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
    ...data.rowHeights.slice(0, insertAt).map((height) => height * scaleFactor),
    newFrac,
    ...data.rowHeights.slice(insertAt).map((height) => height * scaleFactor),
  ]);
  const finalCells = nextCells.map((row, rowIndex) =>
    row.map((cell) => {
      if (!cell) return cell;
      if (rowIndex < insertAt && rowIndex + cell.rowSpan > insertAt) {
        return { ...cell, rowSpan: cell.rowSpan + 1 };
      }
      return cell;
    }),
  );

  return {
    ...withoutDividerState(data),
    rows: data.rows + 1,
    rowHeights: nextRowHeights,
    cells: finalCells,
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
    ...data.colWidths.slice(0, insertAt).map((width) => width * scaleFactor),
    newFrac,
    ...data.colWidths.slice(insertAt).map((width) => width * scaleFactor),
  ]);
  const finalCells = nextCells.map((row) =>
    row.map((cell, colIndex) => {
      if (!cell) return cell;
      if (colIndex < insertAt && colIndex + cell.colSpan > insertAt) {
        return { ...cell, colSpan: cell.colSpan + 1 };
      }
      return cell;
    }),
  );

  return {
    ...withoutDividerState(data),
    cols: data.cols + 1,
    colWidths: nextColWidths,
    cells: finalCells,
  };
}

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

  for (const group of groups) {
    const totalWidth = group.reduce(
      (sum, colIndex) => sum + (data.colWidths[colIndex] ?? 0),
      0,
    );
    const equalWidth = totalWidth / group.length;

    for (const colIndex of group) {
      nextColWidths[colIndex] = equalWidth;
    }
  }

  return {
    ...withoutDividerState(data),
    colWidths: normalizeFractions(nextColWidths),
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

  for (const group of groups) {
    const totalHeight = group.reduce(
      (sum, rowIndex) => sum + (data.rowHeights[rowIndex] ?? 0),
      0,
    );
    const equalHeight = totalHeight / group.length;

    for (const rowIndex of group) {
      nextRowHeights[rowIndex] = equalHeight;
    }
  }

  return {
    ...withoutDividerState(data),
    rowHeights: normalizeFractions(nextRowHeights),
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
  return { ...withoutDividerState(data), colWidths: widths };
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
  return { ...withoutDividerState(data), rowHeights: heights };
}

export function resizeTableData(
  _data: TableData,
  rows: number,
  cols: number,
): TableData {
  return createTableData(rows, cols);
}

export function scaleTableDividerPositions(
  data: TableData,
  _colScale: number,
  _rowScale: number,
): TableData {
  return withoutDividerState(data);
}

export function preserveOuterAddColLayout(
  previousData: TableData,
  expandedData: TableData,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldWidth / newWidth;

  return {
    ...withoutDividerState(expandedData),
    colWidths: normalizeFractions([
      ...previousData.colWidths.map((width) => width * oldAreaFraction),
      1 - oldAreaFraction,
    ]),
  };
}

export function preserveInnerAddColLayout(
  previousData: TableData,
  expandedData: TableData,
  insertAt: number,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldWidth / newWidth;

  return {
    ...withoutDividerState(expandedData),
    colWidths: normalizeFractions([
      ...previousData.colWidths.slice(0, insertAt).map((w) => w * oldAreaFraction),
      1 - oldAreaFraction,
      ...previousData.colWidths.slice(insertAt).map((w) => w * oldAreaFraction),
    ]),
  };
}

export function preserveOuterAddRowLayout(
  previousData: TableData,
  expandedData: TableData,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldHeight / newHeight;

  return {
    ...withoutDividerState(expandedData),
    rowHeights: normalizeFractions([
      ...previousData.rowHeights.map((height) => height * oldAreaFraction),
      1 - oldAreaFraction,
    ]),
  };
}

export function preserveInnerAddRowLayout(
  previousData: TableData,
  expandedData: TableData,
  insertAt: number,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldHeight / newHeight;

  return {
    ...withoutDividerState(expandedData),
    rowHeights: normalizeFractions([
      ...previousData.rowHeights.slice(0, insertAt).map((h) => h * oldAreaFraction),
      1 - oldAreaFraction,
      ...previousData.rowHeights.slice(insertAt).map((h) => h * oldAreaFraction),
    ]),
  };
}

export function preserveOuterPrependColLayout(
  previousData: TableData,
  expandedData: TableData,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldWidth / newWidth;
  const newAreaFraction = 1 - oldAreaFraction;

  return {
    ...withoutDividerState(expandedData),
    colWidths: normalizeFractions([
      newAreaFraction,
      ...previousData.colWidths.map((width) => width * oldAreaFraction),
    ]),
  };
}

export function preserveOuterPrependRowLayout(
  previousData: TableData,
  expandedData: TableData,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return withoutDividerState(expandedData);
  }
  const oldAreaFraction = oldHeight / newHeight;
  const newAreaFraction = 1 - oldAreaFraction;

  return {
    ...withoutDividerState(expandedData),
    rowHeights: normalizeFractions([
      newAreaFraction,
      ...previousData.rowHeights.map((height) => height * oldAreaFraction),
    ]),
  };
}

export function deleteRow(data: TableData, rowIndex: number): TableData {
  if (data.rows <= TABLE_MIN_DIMENSION) return data;
  if (rowIndex < 0 || rowIndex >= data.rows) return data;

  const adjusted: (TableCellData | null)[][] = data.cells.map((row, ri) =>
    row.map((cell) => {
      if (!cell) return null;
      if (ri < rowIndex && ri + cell.rowSpan > rowIndex) {
        return { ...cell, rowSpan: cell.rowSpan - 1 };
      }
      return cell;
    }),
  );

  if (rowIndex + 1 < data.rows) {
    for (let colIndex = 0; colIndex < data.cols; colIndex += 1) {
      const cell = adjusted[rowIndex]?.[colIndex];
      if (cell && cell.rowSpan > 1) {
        adjusted[rowIndex + 1]![colIndex] = {
          ...cell,
          rowSpan: cell.rowSpan - 1,
        };
      }
    }
  }

  adjusted.splice(rowIndex, 1);

  return {
    ...withoutDividerState(data),
    rows: data.rows - 1,
    rowHeights: normalizeFractions(
      data.rowHeights.filter((_, index) => index !== rowIndex),
    ),
    cells: adjusted,
  };
}

export function deleteCol(data: TableData, colIndex: number): TableData {
  if (data.cols <= TABLE_MIN_DIMENSION) return data;
  if (colIndex < 0 || colIndex >= data.cols) return data;

  const adjusted: (TableCellData | null)[][] = data.cells.map((row) =>
    row.map((cell, ci) => {
      if (!cell) return null;
      if (ci < colIndex && ci + cell.colSpan > colIndex) {
        return { ...cell, colSpan: cell.colSpan - 1 };
      }
      return cell;
    }),
  );

  if (colIndex + 1 < data.cols) {
    for (let rowIndex = 0; rowIndex < data.rows; rowIndex += 1) {
      const cell = adjusted[rowIndex]?.[colIndex];
      if (cell && cell.colSpan > 1) {
        adjusted[rowIndex]![colIndex + 1] = {
          ...cell,
          colSpan: cell.colSpan - 1,
        };
      }
    }
  }

  return {
    ...withoutDividerState(data),
    cols: data.cols - 1,
    colWidths: normalizeFractions(
      data.colWidths.filter((_, index) => index !== colIndex),
    ),
    cells: adjusted.map((row) => row.filter((_, ci) => ci !== colIndex)),
  };
}
