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
  getTableMinSizeFromDataJson,
  parseTableData,
  type TableCellData,
} from './tableData';
import { ITEM_MIN_SIZE, ITEM_TYPE, ITEM_TYPE_LABEL } from './types';

const SEGMENT_TEXT_BACKGROUND_OPTIONS = [
  { name: 'Transparent', value: 'transparent' },
  ...BACKGROUND_COLOR_OPTIONS,
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
              <p className="inspector-meta">Multi-select editing is limited to delete and layer actions.</p>
            </div>
            <button className="ghost-button danger-button" onClick={onDelete}>
              Delete
            </button>
          </div>

          <section className="inspector-section">
            <p className="meta-label">Primary Selection</p>
            <p className="inspector-meta">
              {ITEM_TYPE_LABEL[item.type as keyof typeof ITEM_TYPE_LABEL] ?? item.type}
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
  const resolvedStyle = resolveBoardItemStyle(selectedItem, projectDefaultStyle);
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

        <section className="inspector-section">
          <p className="meta-label">Position</p>
          <div className="inspector-grid">
            <label>
              X
              <input
                type="number"
                value={Math.round(selectedItem.x)}
                onChange={(e) => handleNumberChange('x', e.target.value)}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={Math.round(selectedItem.y)}
                onChange={(e) => handleNumberChange('y', e.target.value)}
              />
            </label>
          </div>
        </section>

        {!isSegmentItem ? (
          <section className="inspector-section">
            <p className="meta-label">Size</p>
            <div className="inspector-grid">
              <label>
                Width
                <input
                  type="number"
                  value={Math.round(selectedItem.width)}
                  onChange={(e) => handleNumberChange('width', e.target.value)}
                />
              </label>
              <label>
                Height
                <input
                  type="number"
                  value={Math.round(selectedItem.height)}
                  onChange={(e) => handleNumberChange('height', e.target.value)}
                />
              </label>
            </div>
            {isLine ? (
              <label className="inspector-field">
                旋轉
                <input
                  type="number"
                  min={-180}
                  max={180}
                  value={selectedItem.rotation}
                  onChange={(e) => handleRotationChange(e.target.value)}
                />
              </label>
            ) : null}
          </section>
        ) : null}

        {isTable && tableData !== null ? (
          <section className="inspector-section">
            <p className="meta-label">Table</p>
            <p className="inspector-meta">
              {summarizeContent(selectedItem)}
            </p>
          </section>
        ) : null}
        {isTable ? (
          <section className="inspector-section">
            <p className="meta-label">Table Cell</p>
            <label className="inspector-field">
              Cell text
              <textarea
                className="inspector-textarea"
                value={selectedTableCellTextContent}
                disabled={selectedTableCells.length === 0}
                placeholder={
                  selectedTableCells.length === 0
                    ? 'Select a table cell to edit text'
                    : selectedTableCells.length > 1
                      ? `Editing ${selectedTableCells.length} selected cells`
                      : undefined
                }
                onChange={(e) =>
                  onUpdateTableCells(selectedItem.id, selectedTableCellIds, {
                    content: e.target.value,
                  })
                }
              />
            </label>
            <div className="inspector-color-grid">
              <ColorPaletteField
                label="Text color"
                options={TEXT_COLOR_OPTIONS}
                selectedValue={resolvedStyle.textColor}
                tone="text"
                onSelect={(value) => handleStyleChange({ textColor: value })}
              />
            </div>
            <div className="inspector-grid">
              <label>
                Font size
                <input
                  type="number"
                  min={12}
                  max={32}
                  value={resolvedStyle.fontSize}
                  onChange={(e) => handleFontSizeChange(e.target.value)}
                />
              </label>
            </div>
            <div className="inspector-toggle-group">
              <button
                type="button"
                className={`ghost-button ${
                  resolvedStyle.fontWeight === 'bold' ? 'is-active' : ''
                }`}
                onClick={() =>
                  handleStyleChange({
                    fontWeight:
                      resolvedStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
              >
                Bold
              </button>
              <button
                type="button"
                className={`ghost-button ${
                  resolvedStyle.fontStyle === 'italic' ? 'is-active' : ''
                }`}
                onClick={() =>
                  handleStyleChange({
                    fontStyle:
                      resolvedStyle.fontStyle === 'italic'
                        ? 'normal'
                        : 'italic',
                  })
                }
              >
                Italic
              </button>
            </div>
          </section>
        ) : null}

        {supportsContent || supportsTitle ? (
          <section className="inspector-section">
            <p className="meta-label">Content</p>
            {supportsTitle ? (
              <label className="inspector-field">
                標題
                <input
                  type="text"
                  value={selectedItem.title ?? ''}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />
              </label>
            ) : null}
            {supportsContent ? (
              <label className="inspector-field">
                {selectedItem.type === ITEM_TYPE.note_paper
                  ? 'Markdown'
                  : '內文'}
                <textarea
                  className="inspector-textarea"
                  value={selectedItem.content ?? ''}
                  onChange={(e) => handleContentChange(e.target.value)}
                />
              </label>
            ) : null}
            {selectedItem.type === ITEM_TYPE.note_paper ? (
              <label className="inspector-field">
                Markdown file
                <input
                  key={`${selectedItem.id}-${getNoteFileName(selectedItem)}`}
                  type="text"
                  defaultValue={getNoteFileName(selectedItem)}
                  placeholder="note.md"
                  onBlur={(e) => handleNoteFileNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                  }}
                />
              </label>
            ) : null}
            {selectedItem.type === ITEM_TYPE.frame ? (
              <div className="inspector-row">
                <span>{childCount} child items</span>
                <button className="ghost-button" onClick={onToggleCollapse}>
                  {selectedItem.is_collapsed ? 'Expand' : 'Collapse'}
                </button>
              </div>
            ) : null}
            {selectedItem.type === ITEM_TYPE.note_paper ? (
              <p className="inspector-meta">Markdown-backed note</p>
            ) : null}
          </section>
        ) : null}

        {supportsTextStyling ? (
          <section className="inspector-section">
            <div className="inspector-title-row">
              <p className="meta-label">Style</p>
              <button
                type="button"
                className="ghost-button"
                disabled={!hasCustomStyle}
                onClick={() => onUpdate({ ...selectedItem, style_json: null })}
              >
                重設
              </button>
            </div>
            <div className="inspector-color-grid">
              <ColorPaletteField
                label="Background color"
                options={BACKGROUND_COLOR_OPTIONS}
                selectedValue={
                  isTable && selectedTableCells.length > 0
                    ? selectedTableCellBackgroundColor
                    : resolvedStyle.backgroundColor
                }
                tone="background"
                onSelect={(value) =>
                  isTable && selectedTableCells.length > 0
                    ? onUpdateTableCells(
                        selectedItem.id,
                        selectedTableCellIds,
                        {
                          backgroundColor: value,
                        },
                      )
                    : handleStyleChange({ backgroundColor: value })
                }
              />
              {!isTable ? (
                <ColorPaletteField
                  label="Text color"
                  options={TEXT_COLOR_OPTIONS}
                  selectedValue={resolvedStyle.textColor}
                  tone="text"
                  onSelect={(value) => handleStyleChange({ textColor: value })}
                />
              ) : null}
            </div>
            {!isTable ? (
              <>
                <div className="inspector-grid">
                  <label>
                    字級
                    <input
                      type="number"
                      min={12}
                      max={32}
                      value={resolvedStyle.fontSize}
                      onChange={(e) => handleFontSizeChange(e.target.value)}
                    />
                  </label>
                </div>
                <div className="inspector-toggle-group">
                  <button
                    type="button"
                    className={`ghost-button ${
                      resolvedStyle.fontWeight === 'bold' ? 'is-active' : ''
                    }`}
                    onClick={() =>
                      handleStyleChange({
                        fontWeight:
                          resolvedStyle.fontWeight === 'bold'
                            ? 'normal'
                            : 'bold',
                      })
                    }
                  >
                    粗體
                  </button>
                  <button
                    type="button"
                    className={`ghost-button ${
                      resolvedStyle.fontStyle === 'italic' ? 'is-active' : ''
                    }`}
                    onClick={() =>
                      handleStyleChange({
                        fontStyle:
                          resolvedStyle.fontStyle === 'italic'
                            ? 'normal'
                            : 'italic',
                      })
                    }
                  >
                    斜體
                  </button>
                </div>
              </>
            ) : null}
                        <p className="inspector-meta">
              {isSegmentItem
                ? 'Segment connector with editable endpoints and bends.'
                : summarizeContent(selectedItem)}
            </p>
          </section>
        ) : null}

        {supportsLineStyling ? (
          <section className="inspector-section">
            <div className="inspector-title-row">
              <p className="meta-label">Line Style</p>
              <button
                type="button"
                className="ghost-button"
                disabled={!hasCustomStyle}
                onClick={() => onUpdate({ ...selectedItem, style_json: null })}
              >
                重設
              </button>
            </div>
            <div className="inspector-field">
              <ColorPaletteField
                label="線條色"
                options={STROKE_COLOR_OPTIONS}
                selectedValue={resolvedStyle.strokeColor}
                tone="background"
                onSelect={(value) => handleStyleChange({ strokeColor: value })}
              />
            </div>
            <div className="inspector-grid">
              <label className="inspector-field">
                粗細
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={resolvedStyle.strokeWidth}
                  onChange={(e) => handleStrokeWidthChange(e.target.value)}
                />
              </label>
              <label className="inspector-field">
                線條樣式
                <select
                  value={resolvedStyle.strokeStyle}
                  onChange={(e) =>
                    handleStyleChange({
                      strokeStyle: e.target
                        .value as BoardItemStyle['strokeStyle'],
                    })
                  }
                >
                  <option value="solid">實線</option>
                  <option value="dashed">虛線</option>
                  <option value="dotted">點線</option>
                </select>
              </label>
            </div>
            <div className="inspector-grid">
              <label className="inspector-field">
                轉角
                <select
                  value={resolvedStyle.lineCornerType}
                  onChange={(e) =>
                    handleStyleChange({
                      lineCornerType: e.target
                        .value as BoardItemStyle['lineCornerType'],
                    })
                  }
                >
                  <option value="sharp">直角</option>
                  <option value="rounded">圓角</option>
                </select>
              </label>
              {isArrow ? (
                <label className="inspector-field">
                  箭頭大小
                  <input
                    key={`${selectedItem.id}-${resolvedStyle.arrowHeadSize}`}
                    type="number"
                    min={8}
                    max={40}
                    defaultValue={resolvedStyle.arrowHeadSize}
                    onBlur={(e) =>
                      handleArrowHeadSizeCommit(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </label>
              ) : null}
            </div>
                        <p className="inspector-meta">
              {isSegmentItem
                ? 'Segment connector with editable endpoints and bends.'
                : summarizeContent(selectedItem)}
            </p>
          </section>
        ) : null}

        {(isLine || isArrow) ? (
          <section className="inspector-section">
            <div className="inspector-title-row">
              <p className="meta-label">Label Text</p>
            </div>
            <label className="inspector-field">
              文字
              <textarea
                className="inspector-textarea"
                value={selectedItem.content ?? ''}
                onChange={(e) => handleContentChange(e.target.value)}
              />
            </label>
            <div className="inspector-grid">
              <label className="inspector-field">
                水平位置
                <select
                  value={resolvedStyle.segmentTextHorizontalPosition}
                  onChange={(e) =>
                    handleStyleChange({
                      segmentTextHorizontalPosition: e.target
                        .value as BoardItemStyle['segmentTextHorizontalPosition'],
                    })
                  }
                >
                  <option value="start">起點</option>
                  <option value="center">置中</option>
                  <option value="end">終點</option>
                </select>
              </label>
              <label className="inspector-field">
                垂直位置
                <select
                  value={resolvedStyle.segmentTextVerticalPosition}
                  onChange={(e) =>
                    handleStyleChange({
                      segmentTextVerticalPosition: e.target
                        .value as BoardItemStyle['segmentTextVerticalPosition'],
                    })
                  }
                >
                  <option value="top">上方</option>
                  <option value="middle">中間</option>
                  <option value="bottom">下方</option>
                </select>
              </label>
              <label className="inspector-field">
                文字方向
                <select
                  value={resolvedStyle.segmentTextOrientation}
                  onChange={(e) =>
                    handleStyleChange({
                      segmentTextOrientation: e.target
                        .value as BoardItemStyle['segmentTextOrientation'],
                    })
                  }
                >
                  <option value="horizontal">水平</option>
                  <option value="slope">斜向</option>
                </select>
              </label>
            </div>
            <div className="inspector-color-grid">
              <ColorPaletteField
                label="背景色"
                options={SEGMENT_TEXT_BACKGROUND_OPTIONS}
                selectedValue={segmentTextBackgroundColor}
                tone="background"
                onSelect={(value) =>
                  handleStyleChange({ backgroundColor: value })
                }
              />
              <ColorPaletteField
                label="文字色"
                options={TEXT_COLOR_OPTIONS}
                selectedValue={resolvedStyle.textColor}
                tone="text"
                onSelect={(value) => handleStyleChange({ textColor: value })}
              />
            </div>
            <div className="inspector-grid">
              <label>
                字級
                <input
                  type="number"
                  min={12}
                  max={32}
                  value={resolvedStyle.fontSize}
                  onChange={(e) => handleFontSizeChange(e.target.value)}
                />
              </label>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
