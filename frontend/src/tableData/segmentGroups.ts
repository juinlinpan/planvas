import { type TableData, type SegmentGroup } from './types';
import {
  getEffectiveColEdge,
  getEffectiveRowEdge,
  getRootCellAt,
  getCumulativeColPositions,
  getCumulativeRowPositions,
} from './core';

const POS_EPSILON = 0.0001;
const MIN_FRAC = 0.04;

export function computeColSegmentGroups(data: TableData): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  const defaultCum = getCumulativeColPositions(data.colWidths);

  for (let b = 0; b < data.cols - 1; b++) {
    const segs: { row: number; pos: number }[] = [];
    for (let r = 0; r < data.rows; r++) {
      const rootLeft = getRootCellAt(data, r, b);
      const rootRight = getRootCellAt(data, r, b + 1);
      if (rootLeft && rootRight && rootLeft.cell.id === rootRight.cell.id)
        continue;
      const key = `c${b}r${r}`;
      const pos = data.colDividerPositions?.[key] ?? defaultCum[b + 1] ?? 0;
      segs.push({ row: r, pos });
    }
    if (segs.length === 0) continue;

    let group: number[] = [segs[0]!.row];
    let groupPos = segs[0]!.pos;

    for (let i = 1; i < segs.length; i++) {
      const { row: r, pos } = segs[i]!;
      const prevR = segs[i - 1]!.row;
      const isAdjacent = r === prevR + 1;

      if (isAdjacent) {
        const leftAbove = getRootCellAt(data, prevR, b);
        const leftBelow = getRootCellAt(data, r, b);
        const rightAbove = getRootCellAt(data, prevR, b + 1);
        const rightBelow = getRootCellAt(data, r, b + 1);
        const structurallyConnected =
          (leftAbove && leftBelow && leftAbove.cell.id === leftBelow.cell.id) ||
          (rightAbove &&
            rightBelow &&
            rightAbove.cell.id === rightBelow.cell.id);
        const hasExplicitBreak =
          data.colDividerBreaks?.[`c${b}r${prevR}`] === true;

        if (
          structurallyConnected ||
          (!hasExplicitBreak && Math.abs(pos - groupPos) < POS_EPSILON)
        ) {
          group.push(r);
          continue;
        }
      }

      groups.push({
        type: 'col',
        boundaryIndex: b,
        segments: [...group],
        position: groupPos,
        key: `c${b}g${group[0]}`,
      });
      group = [r];
      groupPos = pos;
    }

    groups.push({
      type: 'col',
      boundaryIndex: b,
      segments: [...group],
      position: groupPos,
      key: `c${b}g${group[0]}`,
    });
  }

  return groups;
}

export function computeRowSegmentGroups(data: TableData): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  const defaultCum = getCumulativeRowPositions(data.rowHeights);

  for (let b = 0; b < data.rows - 1; b++) {
    const segs: { col: number; pos: number }[] = [];
    for (let c = 0; c < data.cols; c++) {
      const rootTop = getRootCellAt(data, b, c);
      const rootBottom = getRootCellAt(data, b + 1, c);
      if (rootTop && rootBottom && rootTop.cell.id === rootBottom.cell.id)
        continue;
      const key = `r${b}c${c}`;
      const pos = data.rowDividerPositions?.[key] ?? defaultCum[b + 1] ?? 0;
      segs.push({ col: c, pos });
    }
    if (segs.length === 0) continue;

    let group: number[] = [segs[0]!.col];
    let groupPos = segs[0]!.pos;

    for (let i = 1; i < segs.length; i++) {
      const { col: c, pos } = segs[i]!;
      const prevC = segs[i - 1]!.col;
      const isAdjacent = c === prevC + 1;

      if (isAdjacent) {
        const topLeft = getRootCellAt(data, b, prevC);
        const topRight = getRootCellAt(data, b, c);
        const bottomLeft = getRootCellAt(data, b + 1, prevC);
        const bottomRight = getRootCellAt(data, b + 1, c);
        const structurallyConnected =
          (topLeft && topRight && topLeft.cell.id === topRight.cell.id) ||
          (bottomLeft &&
            bottomRight &&
            bottomLeft.cell.id === bottomRight.cell.id);
        const hasExplicitBreak =
          data.rowDividerBreaks?.[`r${b}c${prevC}`] === true;

        if (
          structurallyConnected ||
          (!hasExplicitBreak && Math.abs(pos - groupPos) < POS_EPSILON)
        ) {
          group.push(c);
          continue;
        }
      }

      groups.push({
        type: 'row',
        boundaryIndex: b,
        segments: [...group],
        position: groupPos,
        key: `r${b}g${group[0]}`,
      });
      group = [c];
      groupPos = pos;
    }

    groups.push({
      type: 'row',
      boundaryIndex: b,
      segments: [...group],
      position: groupPos,
      key: `r${b}g${group[0]}`,
    });
  }

  return groups;
}

export function resizeColGroup(
  data: TableData,
  group: SegmentGroup,
  newPosition: number,
  minFraction = MIN_FRAC,
): TableData {
  const b = group.boundaryIndex;
  let minPos = 0 + minFraction;
  let maxPos = 1 - minFraction;
  for (const r of group.segments) {
    const leftPos = getEffectiveColEdge(data, b, r);
    const rightPos = getEffectiveColEdge(data, b + 2, r);
    minPos = Math.max(minPos, leftPos + minFraction);
    maxPos = Math.min(maxPos, rightPos - minFraction);
  }
  const clamped = Math.max(minPos, Math.min(maxPos, newPosition));

  const nextPositions = { ...(data.colDividerPositions ?? {}) };
  for (const r of group.segments) {
    nextPositions[`c${b}r${r}`] = clamped;
  }
  return { ...data, colDividerPositions: nextPositions };
}

export function resizeRowGroup(
  data: TableData,
  group: SegmentGroup,
  newPosition: number,
  minFraction = MIN_FRAC,
): TableData {
  const b = group.boundaryIndex;
  let minPos = 0 + minFraction;
  let maxPos = 1 - minFraction;
  for (const c of group.segments) {
    const topPos = getEffectiveRowEdge(data, b, c);
    const bottomPos = getEffectiveRowEdge(data, b + 2, c);
    minPos = Math.max(minPos, topPos + minFraction);
    maxPos = Math.min(maxPos, bottomPos - minFraction);
  }
  const clamped = Math.max(minPos, Math.min(maxPos, newPosition));

  const nextPositions = { ...(data.rowDividerPositions ?? {}) };
  for (const c of group.segments) {
    nextPositions[`r${b}c${c}`] = clamped;
  }
  return { ...data, rowDividerPositions: nextPositions };
}
