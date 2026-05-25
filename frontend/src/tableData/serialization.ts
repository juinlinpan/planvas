import {
  sanitizeTextHorizontalAlign,
  sanitizeTextVerticalAlign,
} from '../items/itemStyles';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  TABLE_LABEL_FONT_SIZE_MAX,
  TABLE_LABEL_FONT_SIZE_MIN,
  type TableCellData,
  type TableChildLayoutDirection,
  type TableData,
} from './types';
import {
  clampDim,
  createTableData,
  makeCell,
  makeCellId,
  normalizeFractions,
} from './cellOps';

// ── Serialize ─────────────────────────────────────────────────────────────

export function serializeTableData(data: TableData): string {
  return JSON.stringify(normalizePivotGridTableData(data));
}

export function normalizePivotGridTableData(data: TableData): TableData {
  const {
    colDividerPositions: _colDividerPositions,
    rowDividerPositions: _rowDividerPositions,
    colDividerBreaks: _colDividerBreaks,
    rowDividerBreaks: _rowDividerBreaks,
    ...rest
  } = data;
  return rest;
}

// ── Parse (handles both old string[][] and new format) ─────────────────────

function hasNewFormat(parsed: Record<string, unknown>): boolean {
  return (
    Array.isArray(parsed['colWidths']) || Array.isArray(parsed['rowHeights'])
  );
}

function parseNewFormat(parsed: Record<string, unknown>): TableData {
  const rows = clampDim(
    typeof parsed['rows'] === 'number' ? parsed['rows'] : DEFAULT_TABLE_ROWS,
    DEFAULT_TABLE_ROWS,
  );
  const cols = clampDim(
    typeof parsed['cols'] === 'number' ? parsed['cols'] : DEFAULT_TABLE_COLS,
    DEFAULT_TABLE_COLS,
  );
  const rawCW = Array.isArray(parsed['colWidths'])
    ? (parsed['colWidths'] as unknown[])
    : [];
  const rawRH = Array.isArray(parsed['rowHeights'])
    ? (parsed['rowHeights'] as unknown[])
    : [];
  const colWidths = normalizeFractions(
    Array.from({ length: cols }, (_, i) => {
      const v = rawCW[i];
      return typeof v === 'number' && v > 0 ? v : 1 / cols;
    }),
  );
  const rowHeights = normalizeFractions(
    Array.from({ length: rows }, (_, i) => {
      const v = rawRH[i];
      return typeof v === 'number' && v > 0 ? v : 1 / rows;
    }),
  );
  const rawCells = Array.isArray(parsed['cells'])
    ? (parsed['cells'] as unknown[][])
    : [];
  const cells: (TableCellData | null)[][] = Array.from(
    { length: rows },
    (_, ri) => {
      const rawRow = rawCells[ri];
      return Array.from({ length: cols }, (_, ci): TableCellData | null => {
        if (!Array.isArray(rawRow)) return makeCell();
        const raw = rawRow[ci];
        if (raw === null) return null;
        if (typeof raw !== 'object' || raw === null) return makeCell();
        const obj = raw as Record<string, unknown>;
        return {
          id: typeof obj['id'] === 'string' ? obj['id'] : makeCellId(),
          content: typeof obj['content'] === 'string' ? obj['content'] : '',
          backgroundColor:
            typeof obj['backgroundColor'] === 'string'
              ? obj['backgroundColor']
              : undefined,
          textHorizontalAlign: sanitizeTextHorizontalAlign(
            obj['textHorizontalAlign'],
          ),
          textVerticalAlign: sanitizeTextVerticalAlign(
            obj['textVerticalAlign'],
          ),
          childLayoutDirection: sanitizeTableChildLayoutDirection(
            obj['childLayoutDirection'],
          ),
          childLayoutUpdatedAt: sanitizeTableLayoutUpdatedAt(
            obj['childLayoutUpdatedAt'],
          ),
          rowSpan:
            typeof obj['rowSpan'] === 'number' && obj['rowSpan'] >= 1
              ? obj['rowSpan']
              : 1,
          colSpan:
            typeof obj['colSpan'] === 'number' && obj['colSpan'] >= 1
              ? obj['colSpan']
              : 1,
          isCollapsed:
            typeof obj['isCollapsed'] === 'boolean' ? obj['isCollapsed'] : true,
          childItemIds: Array.isArray(obj['childItemIds'])
            ? (obj['childItemIds'] as unknown[]).filter(
                (v): v is string => typeof v === 'string',
              )
            : typeof obj['childItemId'] === 'string'
              ? [obj['childItemId']]
              : [],
        };
      });
    },
  );
  return {
    name: sanitizeTableName(parsed['name']),
    labelFontSize: sanitizeTableLabelFontSize(parsed['labelFontSize']),
    rows,
    cols,
    colWidths,
    rowHeights,
    cells,
    childLayoutDirection: sanitizeTableChildLayoutDirection(
      parsed['childLayoutDirection'],
    ),
    childLayoutUpdatedAt: sanitizeTableLayoutUpdatedAt(
      parsed['childLayoutUpdatedAt'],
    ),
  };
}

function parseOldFormat(parsed: Record<string, unknown>): TableData {
  const rows = clampDim(
    typeof parsed['rows'] === 'number' ? parsed['rows'] : DEFAULT_TABLE_ROWS,
    DEFAULT_TABLE_ROWS,
  );
  const cols = clampDim(
    typeof parsed['cols'] === 'number' ? parsed['cols'] : DEFAULT_TABLE_COLS,
    DEFAULT_TABLE_COLS,
  );
  const base = createTableData(rows, cols);
  const rawCells = Array.isArray(parsed['cells'])
    ? (parsed['cells'] as unknown[][])
    : [];
  base.cells = base.cells.map((row, ri) =>
    row.map((cell, ci): TableCellData | null => {
      if (cell === null) {
        return null;
      }

      const rawRow = rawCells[ri];
      const rawVal = Array.isArray(rawRow) ? rawRow[ci] : '';
      return {
        id: cell.id,
        content: typeof rawVal === 'string' ? rawVal : '',
        backgroundColor: cell.backgroundColor,
        textHorizontalAlign: cell.textHorizontalAlign,
        textVerticalAlign: cell.textVerticalAlign,
        childLayoutDirection: cell.childLayoutDirection,
        childLayoutUpdatedAt: cell.childLayoutUpdatedAt,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        isCollapsed: cell.isCollapsed,
        childItemIds: cell.childItemIds,
      };
    }),
  );
  return base;
}

export function sanitizeTableName(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function sanitizeTableLabelFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(
    TABLE_LABEL_FONT_SIZE_MAX,
    Math.max(TABLE_LABEL_FONT_SIZE_MIN, Math.round(value)),
  );
}

export function sanitizeTableChildLayoutDirection(
  value: unknown,
): TableChildLayoutDirection | undefined {
  return value === 'horizontal' || value === 'vertical' ? value : undefined;
}

export function sanitizeTableLayoutUpdatedAt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

export function parseTableData(dataJson: string | null): TableData {
  if (!dataJson || dataJson.trim().length === 0) return createTableData();
  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    if (hasNewFormat(parsed)) return parseNewFormat(parsed);
    return parseOldFormat(parsed);
  } catch {
    return createTableData();
  }
}
