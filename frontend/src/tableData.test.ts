import { describe, expect, it } from 'vitest';

import {
  TABLE_MAX_DIMENSION,
  addCol,
  addRow,
  clearTableCells,
  computeColSegmentGroups,
  computeRowSegmentGroups,
  createTableData,
  deleteCols,
  deleteRows,
  getEffectiveTableCellChildLayoutDirection,
  getNextTableLayoutUpdatedAt,
  getTableMinSize,
  getEffectiveColEdge,
  getEffectiveRowEdge,
  getTableCellDeleteOperation,
  mergeCells,
  parseTableData,
  preserveOuterAddColLayout,
  preserveOuterAddRowLayout,
  resizeColGroup,
  resizeRowGroup,
  scaleTableDividerPositions,
  serializeTableData,
  splitCellHorizontal,
  splitCellVertical,
} from './tableData';

describe('tableData merge and split semantics', () => {
  it('keeps table labels optional for legacy data and sanitizes label settings', () => {
    const unnamed = parseTableData(
      JSON.stringify({ rows: 1, cols: 1, colWidths: [1], rowHeights: [1] }),
    );
    const named = parseTableData(
      JSON.stringify({
        rows: 1,
        cols: 1,
        name: '  Sprint planning  ',
        labelFontSize: 17.6,
        colWidths: [1],
        rowHeights: [1],
      }),
    );
    const blank = parseTableData(
      JSON.stringify({
        rows: 1,
        cols: 1,
        name: '   ',
        colWidths: [1],
        rowHeights: [1],
      }),
    );

    expect(unnamed.name).toBeUndefined();
    expect(unnamed.labelFontSize).toBeUndefined();
    expect(named.name).toBe('Sprint planning');
    expect(named.labelFontSize).toBe(18);
    expect(blank.name).toBeUndefined();
    expect(
      parseTableData(
        JSON.stringify({
          rows: 1,
          cols: 1,
          labelFontSize: 99,
          colWidths: [1],
          rowHeights: [1],
        }),
      ).labelFontSize,
    ).toBe(32);
    expect(serializeTableData(createTableData())).not.toContain('"name"');
    expect(serializeTableData(createTableData())).not.toContain(
      '"labelFontSize"',
    );
  });

  it('detects a full-row cell selection as a row delete operation', () => {
    const data = createTableData(3, 3);
    const rowCellIds = data.cells[1]
      ?.filter((cell): cell is NonNullable<typeof cell> => cell !== null)
      .map((cell) => cell.id);

    expect(rowCellIds).toBeTruthy();
    const operation = getTableCellDeleteOperation(data, rowCellIds ?? []);

    expect(operation).toEqual({ type: 'rows', rowIndexes: [1] });
  });

  it('detects a full-column cell selection as a column delete operation', () => {
    const data = createTableData(3, 3);
    const colCellIds = data.cells
      .map((row) => row[2])
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
      .map((cell) => cell.id);

    const operation = getTableCellDeleteOperation(data, colCellIds);

    expect(operation).toEqual({ type: 'cols', colIndexes: [2] });
  });

  it('deletes middle rows and joins the rows around the removed range', () => {
    const data = createTableData(4, 2);
    data.cells[0]![0]!.content = 'top';
    data.cells[3]![0]!.content = 'bottom';

    const deleted = deleteRows(data, [1, 2]);

    expect(deleted.rows).toBe(2);
    expect(deleted.cells[0]?.[0]?.content).toBe('top');
    expect(deleted.cells[1]?.[0]?.content).toBe('bottom');
  });

  it('deletes middle columns and joins the columns around the removed range', () => {
    const data = createTableData(2, 4);
    data.cells[0]![0]!.content = 'left';
    data.cells[0]![3]!.content = 'right';

    const deleted = deleteCols(data, [1, 2]);

    expect(deleted.cols).toBe(2);
    expect(deleted.cells[0]?.[0]?.content).toBe('left');
    expect(deleted.cells[0]?.[1]?.content).toBe('right');
  });

  it('clears only selected cells and reports embedded child items', () => {
    const data = createTableData(2, 2);
    const firstCell = data.cells[0]?.[0];
    const secondCell = data.cells[1]?.[1];
    expect(firstCell).toBeTruthy();
    expect(secondCell).toBeTruthy();
    if (!firstCell || !secondCell) {
      throw new Error('Expected test table cells to exist');
    }
    firstCell.content = 'delete me';
    firstCell.childItemIds = ['child-a', 'child-b'];
    secondCell.content = 'keep me';

    const result = clearTableCells(data, [firstCell.id]);

    expect(result.data.rows).toBe(2);
    expect(result.data.cols).toBe(2);
    expect(result.data.cells[0]?.[0]?.content).toBe('');
    expect(result.data.cells[0]?.[0]?.childItemIds).toEqual([]);
    expect(result.data.cells[1]?.[1]?.content).toBe('keep me');
    expect(result.clearedChildItemIds).toEqual(['child-a', 'child-b']);
  });

  it('treats split cells as new cells instead of restoring the original ones', () => {
    const data = createTableData(3, 2);
    const originalIds = [data.cells[1]?.[0]?.id, data.cells[1]?.[1]?.id];

    const merged = mergeCells(data, [
      [1, 0],
      [1, 1],
    ]);
    const mergedCellId = merged.cells[1]?.[0]?.id;
    expect(mergedCellId).toBeTruthy();

    const split = splitCellVertical(merged, mergedCellId!);

    expect(split.cells[1]?.[0]?.id).toBeTruthy();
    expect(split.cells[1]?.[1]?.id).toBeTruthy();
    expect(split.cells[1]?.[0]?.id).not.toBe(originalIds[0]);
    expect(split.cells[1]?.[1]?.id).not.toBe(originalIds[1]);

    const groups = computeColSegmentGroups(split).filter(
      (group) => group.boundaryIndex === 0,
    );
    expect(groups.map((group) => group.segments)).toEqual([[0], [1], [2]]);
    expect(split.colDividerBreaks?.['c0r0']).toBe(true);
    expect(split.colDividerBreaks?.['c0r1']).toBe(true);
  });

  it('rebuilds a split divider from the merged cell bounds instead of the original column edge', () => {
    const data = createTableData(1, 3);
    data.colWidths = [0.2, 0.5, 0.3];

    const merged = mergeCells(data, [
      [0, 0],
      [0, 1],
    ]);
    const split = splitCellVertical(merged, merged.cells[0]?.[0]?.id!);

    expect(split.colDividerPositions?.['c0r0']).toBeCloseTo(0.35, 5);
    expect(getEffectiveColEdge(split, 1, 0)).toBeCloseTo(0.35, 5);
    expect(getEffectiveColEdge(split, 1, 0)).not.toBeCloseTo(0.2, 5);
  });

  it('keeps a horizontal split isolated from the original left and right row segments', () => {
    const data = createTableData(2, 3);
    const originalId = data.cells[0]?.[1]?.id;

    const merged = mergeCells(data, [
      [0, 1],
      [1, 1],
    ]);
    const mergedCellId = merged.cells[0]?.[1]?.id;
    expect(mergedCellId).toBeTruthy();

    const split = splitCellHorizontal(merged, mergedCellId!);

    expect(split.cells[0]?.[1]?.id).toBeTruthy();
    expect(split.cells[1]?.[1]?.id).toBeTruthy();
    expect(split.cells[0]?.[1]?.id).not.toBe(originalId);

    const groups = computeRowSegmentGroups(split).filter(
      (group) => group.boundaryIndex === 0,
    );
    expect(groups.map((group) => group.segments)).toEqual([[0], [1], [2]]);
    expect(split.rowDividerBreaks?.['r0c0']).toBe(true);
    expect(split.rowDividerBreaks?.['r0c1']).toBe(true);
    expect(getEffectiveRowEdge(split, 1, 1)).toBeCloseTo(0.5, 5);
  });

  it('keeps existing x positions exact when adding an outer column', () => {
    const oldWidth = 300;
    const nextWidth = 450;
    const data = createTableData(2, 2);
    data.colDividerPositions = {
      c0r0: 0.25,
      c0r1: 0.6,
    };

    const oldPixels = [0, 1].map(
      (row) => getEffectiveColEdge(data, 1, row) * oldWidth,
    );

    const expanded = scaleTableDividerPositions(
      addCol(data, data.cols - 1),
      oldWidth / nextWidth,
      1,
    );

    const newPixels = [0, 1].map(
      (row) => getEffectiveColEdge(expanded, 1, row) * nextWidth,
    );

    expect(newPixels[0]).toBeCloseTo(oldPixels[0], 5);
    expect(newPixels[1]).toBeCloseTo(oldPixels[1], 5);
    expect(getEffectiveColEdge(expanded, 2, 0) * nextWidth).toBeCloseTo(
      oldWidth,
      5,
    );
    expect(getEffectiveColEdge(expanded, 2, 1) * nextWidth).toBeCloseTo(
      oldWidth,
      5,
    );
  });

  it('keeps existing y positions exact when adding an outer row', () => {
    const oldHeight = 240;
    const nextHeight = 360;
    const data = createTableData(2, 2);
    data.rowDividerPositions = {
      r0c0: 0.3,
      r0c1: 0.7,
    };

    const oldPixels = [0, 1].map(
      (col) => getEffectiveRowEdge(data, 1, col) * oldHeight,
    );

    const expanded = scaleTableDividerPositions(
      addRow(data, data.rows - 1),
      1,
      oldHeight / nextHeight,
    );

    const newPixels = [0, 1].map(
      (col) => getEffectiveRowEdge(expanded, 1, col) * nextHeight,
    );

    expect(newPixels[0]).toBeCloseTo(oldPixels[0], 5);
    expect(newPixels[1]).toBeCloseTo(oldPixels[1], 5);
    expect(getEffectiveRowEdge(expanded, 2, 0) * nextHeight).toBeCloseTo(
      oldHeight,
      5,
    );
    expect(getEffectiveRowEdge(expanded, 2, 1) * nextHeight).toBeCloseTo(
      oldHeight,
      5,
    );
  });

  it('preserves exact default and moved column layout after outer add with rounded width', () => {
    const oldWidth = 319;
    const nextWidth = Math.round((oldWidth * 3) / 2);
    const data = createTableData(2, 2);
    data.colDividerPositions = {
      c0r0: 0.42,
    };

    const explicitOldPx = getEffectiveColEdge(data, 1, 0) * oldWidth;
    const defaultOldPx = getEffectiveColEdge(data, 1, 1) * oldWidth;

    const expanded = preserveOuterAddColLayout(
      data,
      addCol(data, data.cols - 1),
      oldWidth,
      nextWidth,
    );

    expect(getEffectiveColEdge(expanded, 1, 0) * nextWidth).toBeCloseTo(
      explicitOldPx,
      5,
    );
    expect(getEffectiveColEdge(expanded, 1, 1) * nextWidth).toBeCloseTo(
      defaultOldPx,
      5,
    );
    expect(getEffectiveColEdge(expanded, 2, 0) * nextWidth).toBeCloseTo(
      oldWidth,
      5,
    );
    expect(getEffectiveColEdge(expanded, 2, 1) * nextWidth).toBeCloseTo(
      oldWidth,
      5,
    );
  });

  it('preserves exact default and moved row layout after outer add with rounded height', () => {
    const oldHeight = 241;
    const nextHeight = Math.round((oldHeight * 3) / 2);
    const data = createTableData(2, 2);
    data.rowDividerPositions = {
      r0c0: 0.38,
    };

    const explicitOldPx = getEffectiveRowEdge(data, 1, 0) * oldHeight;
    const defaultOldPx = getEffectiveRowEdge(data, 1, 1) * oldHeight;

    const expanded = preserveOuterAddRowLayout(
      data,
      addRow(data, data.rows - 1),
      oldHeight,
      nextHeight,
    );

    expect(getEffectiveRowEdge(expanded, 1, 0) * nextHeight).toBeCloseTo(
      explicitOldPx,
      5,
    );
    expect(getEffectiveRowEdge(expanded, 1, 1) * nextHeight).toBeCloseTo(
      defaultOldPx,
      5,
    );
    expect(getEffectiveRowEdge(expanded, 2, 0) * nextHeight).toBeCloseTo(
      oldHeight,
      5,
    );
    expect(getEffectiveRowEdge(expanded, 2, 1) * nextHeight).toBeCloseTo(
      oldHeight,
      5,
    );
  });

  it('preserves every existing boundary across merged layout after adding outer columns twice', () => {
    const originalWidth = 480;
    const base = createTableData(3, 4);
    const mergedTop = mergeCells(base, [
      [0, 1],
      [0, 2],
    ]);
    const mergedMiddle = mergeCells(mergedTop, [
      [1, 1],
      [1, 2],
    ]);
    const data = mergeCells(mergedMiddle, [
      [2, 1],
      [2, 2],
    ]);
    data.colDividerPositions = {
      c0r0: 0.22,
      c0r1: 0.22,
      c0r2: 0.22,
      c1r0: 0.5,
      c1r2: 0.5,
      c2r0: 0.64,
      c2r1: 0.64,
      c2r2: 0.64,
    };

    const baseline = new Map<string, number>();
    for (let row = 0; row < data.rows; row += 1) {
      for (let edge = 1; edge < data.cols; edge += 1) {
        baseline.set(
          `c${edge}r${row}`,
          getEffectiveColEdge(data, edge, row) * originalWidth,
        );
      }
    }

    const widthAfterFirstAdd = Math.round((originalWidth * 5) / 4);
    const afterFirstAdd = preserveOuterAddColLayout(
      data,
      addCol(data, data.cols - 1),
      originalWidth,
      widthAfterFirstAdd,
    );

    const widthAfterSecondAdd = Math.round((widthAfterFirstAdd * 6) / 5);
    const afterSecondAdd = preserveOuterAddColLayout(
      afterFirstAdd,
      addCol(afterFirstAdd, afterFirstAdd.cols - 1),
      widthAfterFirstAdd,
      widthAfterSecondAdd,
    );

    for (let row = 0; row < data.rows; row += 1) {
      for (let edge = 1; edge < data.cols; edge += 1) {
        expect(
          getEffectiveColEdge(afterFirstAdd, edge, row) * widthAfterFirstAdd,
        ).toBeCloseTo(baseline.get(`c${edge}r${row}`)!, 5);
        expect(
          getEffectiveColEdge(afterSecondAdd, edge, row) * widthAfterSecondAdd,
        ).toBeCloseTo(baseline.get(`c${edge}r${row}`)!, 5);
      }
    }
  });

  it('caps created tables at 20 by 20', () => {
    const data = createTableData(99, 99);

    expect(data.rows).toBe(20);
    expect(data.cols).toBe(20);
  });

  it('uses text box minimum size as the minimum size of each table cell', () => {
    expect(getTableMinSize(1, 1)).toEqual({ width: 48, height: 48 });
    expect(getTableMinSize(4, 5)).toEqual({ width: 240, height: 192 });
  });

  it('defaults table cell child layout to vertical', () => {
    const data = createTableData(1, 1);
    const cell = data.cells[0]?.[0];
    expect(cell).toBeTruthy();
    if (!cell) {
      throw new Error('Expected test table cell to exist');
    }

    expect(getEffectiveTableCellChildLayoutDirection(data, cell)).toBe(
      'vertical',
    );
  });

  it('uses the latest table or cell child layout setting by sequence', () => {
    const data = createTableData(1, 1);
    const cell = data.cells[0]?.[0];
    expect(cell).toBeTruthy();
    if (!cell) {
      throw new Error('Expected test table cell to exist');
    }

    const tableFirst = {
      ...data,
      childLayoutDirection: 'horizontal' as const,
      childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(data),
    };
    const cellAfter = {
      ...cell,
      childLayoutDirection: 'vertical' as const,
      childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(tableFirst),
    };
    expect(
      getEffectiveTableCellChildLayoutDirection(tableFirst, cellAfter),
    ).toBe('vertical');

    const tableAfter = {
      ...tableFirst,
      childLayoutDirection: 'horizontal' as const,
      childLayoutUpdatedAt: (cellAfter.childLayoutUpdatedAt ?? 0) + 1,
    };
    expect(
      getEffectiveTableCellChildLayoutDirection(tableAfter, cellAfter),
    ).toBe('horizontal');
  });

  it('keeps table minimum sizes on the canvas grid', () => {
    const gridSize = 24;

    for (let rows = 1; rows <= TABLE_MAX_DIMENSION; rows += 1) {
      for (let cols = 1; cols <= TABLE_MAX_DIMENSION; cols += 1) {
        const minSize = getTableMinSize(rows, cols);

        expect(minSize.width % gridSize).toBe(0);
        expect(minSize.height % gridSize).toBe(0);
      }
    }
  });

  it('keeps resized column groups above the requested minimum fraction', () => {
    const data = createTableData(2, 2);
    const group = computeColSegmentGroups(data)[0]!;

    const next = resizeColGroup(data, group, 0.05, 0.2);

    expect(next.colDividerPositions?.['c0r0']).toBeCloseTo(0.2, 5);
    expect(next.colDividerPositions?.['c0r1']).toBeCloseTo(0.2, 5);
  });

  it('keeps resized row groups above the requested minimum fraction', () => {
    const data = createTableData(2, 2);
    const group = computeRowSegmentGroups(data)[0]!;

    const next = resizeRowGroup(data, group, 0.05, 0.25);

    expect(next.rowDividerPositions?.['r0c0']).toBeCloseTo(0.25, 5);
    expect(next.rowDividerPositions?.['r0c1']).toBeCloseTo(0.25, 5);
  });
});
