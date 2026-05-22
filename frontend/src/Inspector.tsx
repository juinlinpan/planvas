import { type BoardItem } from './api';
import {
  BACKGROUND_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  STROKE_COLOR_OPTIONS,
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ColorOption,
  type ProjectDefaultStyle,
} from './itemStyles';
import { hasStoredSegmentData } from './segmentData';
import {
  countFilledTableCells,
  getEffectiveTableCellChildLayoutDirection,
  getNextTableLayoutUpdatedAt,
  getTableMinSizeFromDataJson,
  parseTableData,
  DEFAULT_TABLE_LABEL_FONT_SIZE,
  TABLE_LABEL_FONT_SIZE_MAX,
  TABLE_LABEL_FONT_SIZE_MIN,
  sanitizeTableLabelFontSize,
  sanitizeTableName,
  serializeTableData,
  type TableChildLayoutDirection,
  type TableCellData,
} from './tableData';
import { ITEM_MIN_SIZE, ITEM_TYPE, ITEM_TYPE_LABEL } from './types';
import { PositionSizeSection } from './inspector/PositionSizeSection';
import { ContentSection } from './inspector/ContentSection';
import { TextStylePanel } from './inspector/TextStylePanel';
import { SegmentPanel } from './inspector/SegmentPanel';
import { TablePanel } from './inspector/TablePanel';

const SEGMENT_TEXT_BACKGROUND_OPTIONS = [
  { name: 'Transparent', value: 'transparent' },
  ...BACKGROUND_COLOR_OPTIONS,
] as const;

const TEXT_HORIZONTAL_ALIGN_OPTIONS = [
  { value: 'left', label: '置左' },
  { value: 'center', label: '置中' },
  { value: 'right', label: '置右' },
] as const;

const TEXT_VERTICAL_ALIGN_OPTIONS = [
  { value: 'top', label: '靠上' },
  { value: 'middle', label: '置中' },
  { value: 'bottom', label: '靠下' },
] as const;

const TABLE_CHILD_LAYOUT_OPTIONS = [
  { value: 'vertical', label: '上下分' },
  { value: 'horizontal', label: '左右分' },
] as const;

type Props = {
  item: BoardItem | null;
  selectionCount: number;
  childCount: number;
  selectedTableCellIds: string[];
  isCollapsed: boolean;
  onUpdate: (item: BoardItem) => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
  onDelete: () => void;
  onToggleInspector: () => void;
  onToggleCollapse: () => void;
  projectDefaultStyle?: ProjectDefaultStyle;
};

function clampDimension(
  item: BoardItem,
  field: 'width' | 'height',
  value: number,
): number {
  const minSize =
    item.type === ITEM_TYPE.table
      ? getTableMinSizeFromDataJson(item.data_json)
      : ITEM_MIN_SIZE[item.type];
  if (field === 'width') {
    return Math.max(minSize?.width ?? 60, value);
  }

  return Math.max(minSize?.height ?? 40, value);
}

function summarizeContent(item: BoardItem): string {
  if (item.type === ITEM_TYPE.table) {
    const tableData = parseTableData(item.data_json);
    const filledCells = countFilledTableCells(tableData);
    return `${tableData.rows} x ${tableData.cols} table, ${filledCells} filled cells`;
  }

  if (item.content === null || item.content.trim().length === 0) {
    return 'No content';
  }

  return `${item.content.trim().length} characters`;
}

function isTextContentItem(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

function parseDataJson(value: string | null): Record<string, unknown> {
  if (value === null || value.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Legacy data_json values may be non-JSON strings.
  }

  return {};
}

function getNoteFileName(item: BoardItem): string {
  const noteFile = parseDataJson(item.data_json).noteFile;
  return typeof noteFile === 'string' ? noteFile : '';
}

function normalizeMarkdownFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, '-');
  const withoutTrailingDots = normalized.replace(/\.+$/g, '');
  if (withoutTrailingDots.length === 0) {
    return '';
  }
  return withoutTrailingDots.toLowerCase().endsWith('.md')
    ? withoutTrailingDots
    : `${withoutTrailingDots}.md`;
}

function serializeNoteFileName(item: BoardItem, noteFile: string): string {
  return JSON.stringify({ ...parseDataJson(item.data_json), noteFile });
}

function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export function ColorPaletteField({
  label,
  options,
  selectedValue,
  tone,
  onSelect,
}: {
  label: string;
  options: readonly ColorOption[];
  selectedValue: string;
  tone: 'background' | 'text';
  onSelect: (value: string) => void;
}) {
  return (
    <div className="inspector-color-field">
      <span>{label}</span>
      <div className="inspector-palette-grid" aria-label={label}>
        {options.map((option) => {
          const isActive = option.value === selectedValue;

          return (
            <button
              key={option.value}
              type="button"
              className={`inspector-swatch-button ${isActive ? 'is-active' : ''}`}
              aria-label={`${label} ${option.name}`}
              aria-pressed={isActive}
              title={`${option.name} ${option.value}`}
              onClick={() => onSelect(option.value)}
            >
              {tone === 'background' ? (
                <span
                  className="inspector-swatch-chip"
                  style={{ backgroundColor: option.value }}
                />
              ) : (
                <span
                  className="inspector-swatch-letter"
                  style={{ color: option.value }}
                >
                  A
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CommitNumberInput({
  inputKey,
  min,
  max,
  value,
  disabled,
  onCommit,
}: {
  inputKey: string;
  min: number;
  max: number;
  value: number;
  disabled?: boolean;
  onCommit: (rawValue: string) => void;
}) {
  return (
    <input
      key={inputKey}
      type="number"
      min={min}
      max={max}
      disabled={disabled}
      defaultValue={value}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function Inspector({
  item,
  selectionCount,
  childCount,
  selectedTableCellIds,
  isCollapsed,
  onUpdate,
  onUpdateTableCells,
  onDelete,
  onToggleInspector,
  onToggleCollapse,
  projectDefaultStyle,
}: Props) {
  if (isCollapsed) {
    return (
      <aside className="canvas-inspector is-collapsed">
        <div className="inspector-collapsed">
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Expand inspector"
            onClick={onToggleInspector}
            title="Expand inspector"
          >
            &lt;
          </button>
          <span className="inspector-collapsed-label">Inspector</span>
        </div>
      </aside>
    );
  }

  if (item === null) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-empty">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <p>Select an item to inspect it.</p>
        </div>
      </aside>
    );
  }

  if (selectionCount > 1) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-panel">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <div className="inspector-title-row">
            <div>
              <h3>{selectionCount} selected</h3>
              <p className="inspector-meta">
                Multi-select editing is limited to delete and layer actions.
              </p>
            </div>
            <button className="ghost-button danger-button" onClick={onDelete}>
              Delete
            </button>
          </div>

          <section className="inspector-section">
            <p className="meta-label">Primary Selection</p>
            <p className="inspector-meta">
              {ITEM_TYPE_LABEL[item.type as keyof typeof ITEM_TYPE_LABEL] ??
                item.type}
            </p>
          </section>
        </div>
      </aside>
    );
  }
  const selectedItem = item;
  const isArrow = selectedItem.type === ITEM_TYPE.arrow;
  const isLine = selectedItem.type === ITEM_TYPE.line;
  const isSegmentItem =
    (isArrow || isLine) && hasStoredSegmentData(selectedItem);
  const isTable = selectedItem.type === ITEM_TYPE.table;
  const supportsContent = isTextContentItem(selectedItem);
  const supportsTitle = selectedItem.type === ITEM_TYPE.frame;
  const supportsTextStyling = !isArrow && !isLine;
  const supportsLineStyling = isLine || isArrow;
  const tableData = isTable ? parseTableData(selectedItem.data_json) : null;
  const resolvedStyle = resolveBoardItemStyle(
    selectedItem,
    projectDefaultStyle,
  );
  const parsedStyle = parseBoardItemStyle(selectedItem.style_json);
  const segmentTextBackgroundColor =
    parsedStyle.backgroundColor ?? 'transparent';
  const selectedTableCells =
    isTable && tableData !== null && selectedTableCellIds.length > 0
      ? tableData.cells
          .flat()
          .filter(
            (cell): cell is TableCellData =>
              cell !== null && selectedTableCellIds.includes(cell.id),
          )
      : [];
  const selectedTableCellBackgroundColor =
    selectedTableCells.length > 0
      ? selectedTableCells.every(
          (cell) =>
            (cell.backgroundColor ?? resolvedStyle.backgroundColor) ===
            (selectedTableCells[0]?.backgroundColor ??
              resolvedStyle.backgroundColor),
        )
        ? (selectedTableCells[0]?.backgroundColor ??
          resolvedStyle.backgroundColor)
        : resolvedStyle.backgroundColor
      : resolvedStyle.backgroundColor;
  const selectedTableCellTextContent =
    selectedTableCells.length === 1
      ? (selectedTableCells[0]?.content ?? '')
      : '';
  const selectedTableCellHorizontalAlign =
    selectedTableCells.length > 0 &&
    selectedTableCells.every(
      (cell) =>
        (cell.textHorizontalAlign ?? 'center') ===
        (selectedTableCells[0]?.textHorizontalAlign ?? 'center'),
    )
      ? (selectedTableCells[0]?.textHorizontalAlign ?? 'center')
      : 'center';
  const selectedTableCellVerticalAlign =
    selectedTableCells.length > 0 &&
    selectedTableCells.every(
      (cell) =>
        (cell.textVerticalAlign ?? 'middle') ===
        (selectedTableCells[0]?.textVerticalAlign ?? 'middle'),
    )
      ? (selectedTableCells[0]?.textVerticalAlign ?? 'middle')
      : 'middle';
  const tableChildLayoutDirection =
    tableData?.childLayoutDirection ?? 'vertical';
  const selectedTableCellChildLayoutDirection =
    isTable && tableData !== null && selectedTableCells.length > 0
      ? selectedTableCells.every(
          (cell) =>
            getEffectiveTableCellChildLayoutDirection(tableData, cell) ===
            getEffectiveTableCellChildLayoutDirection(
              tableData,
              selectedTableCells[0],
            ),
        )
        ? getEffectiveTableCellChildLayoutDirection(
            tableData,
            selectedTableCells[0],
          )
        : 'vertical'
      : tableChildLayoutDirection;
  const hasCustomStyle =
    selectedItem.style_json !== null &&
    selectedItem.style_json.trim().length > 0;

  function handleNumberChange(
    field: 'x' | 'y' | 'width' | 'height',
    rawValue: string,
  ) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    const nextValue =
      field === 'width' || field === 'height'
        ? clampDimension(selectedItem, field, value)
        : value;

    onUpdate({ ...selectedItem, [field]: nextValue });
  }

  function handleTitleChange(rawValue: string) {
    onUpdate({ ...selectedItem, title: rawValue });
  }

  function handleContentChange(rawValue: string) {
    onUpdate({
      ...selectedItem,
      content: rawValue,
      content_format:
        selectedItem.type === ITEM_TYPE.note_paper
          ? 'markdown'
          : selectedItem.content_format,
    });
  }

  function handleNoteFileNameChange(rawValue: string) {
    if (selectedItem.type !== ITEM_TYPE.note_paper) {
      return;
    }

    const nextNoteFile = normalizeMarkdownFileName(rawValue);
    if (
      nextNoteFile.length === 0 ||
      nextNoteFile === getNoteFileName(selectedItem)
    ) {
      return;
    }

    onUpdate({
      ...selectedItem,
      data_json: serializeNoteFileName(selectedItem, nextNoteFile),
      content_format: 'markdown',
    });
  }

  function handleStyleChange(patch: BoardItemStyle) {
    const currentStyle = parseBoardItemStyle(selectedItem.style_json);
    onUpdate({
      ...selectedItem,
      style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
    });
  }

  function handleFontSizeChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    handleStyleChange({ fontSize: value });
  }

  function handleRotationChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    onUpdate({ ...selectedItem, rotation: normalizeRotation(value) });
  }

  function handleStrokeWidthChange(rawValue: string) {
    if (rawValue.trim().length === 0) {
      return;
    }

    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    handleStyleChange({ strokeWidth: value });
  }

  function handleArrowHeadSizeCommit(rawValue: string) {
    if (rawValue.trim().length === 0) {
      return;
    }

    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    handleStyleChange({ arrowHeadSize: value });
  }

  function handleTableChildLayoutChange(value: TableChildLayoutDirection) {
    if (!isTable || tableData === null) {
      return;
    }

    onUpdate({
      ...selectedItem,
      data_json: serializeTableData({
        ...tableData,
        childLayoutDirection: value,
        childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(tableData),
      }),
    });
  }

  function handleTableNameChange(rawValue: string) {
    if (!isTable || tableData === null) {
      return;
    }

    onUpdate({
      ...selectedItem,
      data_json: serializeTableData({
        ...tableData,
        name: sanitizeTableName(rawValue),
      }),
    });
  }

  function handleTableLabelFontSizeChange(rawValue: string) {
    if (!isTable || tableData === null) {
      return;
    }

    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    onUpdate({
      ...selectedItem,
      data_json: serializeTableData({
        ...tableData,
        labelFontSize: sanitizeTableLabelFontSize(value),
      }),
    });
  }

  function handleTableCellChildLayoutChange(value: TableChildLayoutDirection) {
    if (!isTable || tableData === null || selectedTableCellIds.length === 0) {
      return;
    }

    onUpdateTableCells(selectedItem.id, selectedTableCellIds, {
      childLayoutDirection: value,
      childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(tableData),
    });
  }

  return (
    <aside className="canvas-inspector">
      <div className="inspector-panel">
        <div className="inspector-header-row">
          <p className="eyebrow">Inspector</p>
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Collapse inspector"
            onClick={onToggleInspector}
            title="Collapse inspector"
          >
            &gt;
          </button>
        </div>
        <div className="inspector-title-row">
          <div>
            <h3>
              {ITEM_TYPE_LABEL[
                selectedItem.type as keyof typeof ITEM_TYPE_LABEL
              ] ?? selectedItem.type}
            </h3>
            <p className="inspector-meta">
              {isSegmentItem
                ? 'Segment connector with editable endpoints and bends.'
                : summarizeContent(selectedItem)}
            </p>
          </div>
          <button className="ghost-button danger-button" onClick={onDelete}>
            刪除
          </button>
        </div>

                <PositionSizeSection
          item={selectedItem}
          isSegmentItem={isSegmentItem}
          isLine={isLine}
          onUpdate={onUpdate}
        />

        {isTable ? (
          <TablePanel
            item={selectedItem}
            tableData={tableData}
            selectedTableCells={selectedTableCells}
            selectedTableCellIds={selectedTableCellIds}
            selectedTableCellBackgroundColor={selectedTableCellBackgroundColor}
            selectedTableCellTextContent={selectedTableCellTextContent}
            selectedTableCellHorizontalAlign={selectedTableCellHorizontalAlign}
            selectedTableCellVerticalAlign={selectedTableCellVerticalAlign}
            selectedTableCellChildLayoutDirection={selectedTableCellChildLayoutDirection}
            tableChildLayoutDirection={tableChildLayoutDirection}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
            onUpdateTableCells={onUpdateTableCells}
          />
        ) : null}

        {supportsContent || supportsTitle ? (
          <ContentSection
            item={selectedItem}
            childCount={childCount}
            onUpdate={onUpdate}
            onToggleCollapse={onToggleCollapse}
          />
        ) : null}

        {supportsTextStyling ? (
          <TextStylePanel
            item={selectedItem}
            isTable={isTable}
            isSegmentItem={isSegmentItem}
            selectedTableCells={selectedTableCells}
            selectedTableCellIds={selectedTableCellIds}
            selectedTableCellBackgroundColor={selectedTableCellBackgroundColor}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
            onUpdateTableCells={onUpdateTableCells}
          />
        ) : null}

        {supportsLineStyling ? (
          <SegmentPanel
            item={selectedItem}
            isArrow={isArrow}
            isLine={isLine}
            isSegmentItem={isSegmentItem}
            projectDefaultStyle={projectDefaultStyle}
            onUpdate={onUpdate}
          />
        ) : null}
      </div>
    </aside>
  );
}
