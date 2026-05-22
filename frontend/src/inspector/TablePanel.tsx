import type { BoardItem } from '../api';
import {
  TEXT_COLOR_OPTIONS,
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ProjectDefaultStyle,
} from '../itemStyles';
import {
  DEFAULT_TABLE_LABEL_FONT_SIZE,
  TABLE_LABEL_FONT_SIZE_MAX,
  TABLE_LABEL_FONT_SIZE_MIN,
  getEffectiveTableCellChildLayoutDirection,
  getNextTableLayoutUpdatedAt,
  parseTableData,
  sanitizeTableLabelFontSize,
  sanitizeTableName,
  serializeTableData,
  type TableCellData,
  type TableChildLayoutDirection,
  type TableData,
} from '../tableData';
import { ITEM_TYPE } from '../types';
import { ColorPaletteField, CommitNumberInput } from '../Inspector';

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
  item: BoardItem;
  tableData: TableData | null;
  selectedTableCells: TableCellData[];
  selectedTableCellIds: string[];
  selectedTableCellBackgroundColor: string;
  selectedTableCellTextContent: string;
  selectedTableCellHorizontalAlign: string;
  selectedTableCellVerticalAlign: string;
  selectedTableCellChildLayoutDirection: string;
  tableChildLayoutDirection: string;
  projectDefaultStyle?: ProjectDefaultStyle;
  onUpdate: (item: BoardItem) => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
};

/**
 * Inspector panel for table items. Covers table settings (name, label font
 * size, child layout) and table cell settings (cell text, text/font styling,
 * alignment, child layout, bold/italic).
 * Extracted from Inspector.tsx.
 */
export function TablePanel({
  item,
  tableData,
  selectedTableCells,
  selectedTableCellIds,
  selectedTableCellTextContent,
  selectedTableCellHorizontalAlign,
  selectedTableCellVerticalAlign,
  selectedTableCellChildLayoutDirection,
  tableChildLayoutDirection,
  projectDefaultStyle,
  onUpdate,
  onUpdateTableCells,
}: Props) {
  if (item.type !== ITEM_TYPE.table) return null;

  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);

  function handleStyleChange(patch: BoardItemStyle) {
    const currentStyle = parseBoardItemStyle(item.style_json);
    onUpdate({
      ...item,
      style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
    });
  }

  function handleFontSizeChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    handleStyleChange({ fontSize: value });
  }

  function handleTableChildLayoutChange(value: TableChildLayoutDirection) {
    if (tableData === null) return;
    onUpdate({
      ...item,
      data_json: serializeTableData({
        ...tableData,
        childLayoutDirection: value,
        childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(tableData),
      }),
    });
  }

  function handleTableNameChange(rawValue: string) {
    if (tableData === null) return;
    onUpdate({
      ...item,
      data_json: serializeTableData({
        ...tableData,
        name: sanitizeTableName(rawValue),
      }),
    });
  }

  function handleTableLabelFontSizeChange(rawValue: string) {
    if (tableData === null) return;
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    onUpdate({
      ...item,
      data_json: serializeTableData({
        ...tableData,
        labelFontSize: sanitizeTableLabelFontSize(value),
      }),
    });
  }

  function handleTableCellChildLayoutChange(value: TableChildLayoutDirection) {
    if (tableData === null || selectedTableCellIds.length === 0) return;
    onUpdateTableCells(item.id, selectedTableCellIds, {
      childLayoutDirection: value,
      childLayoutUpdatedAt: getNextTableLayoutUpdatedAt(tableData),
    });
  }

  return (
    <>
      {tableData !== null ? (
        <section className="inspector-section">
          <p className="meta-label">Table</p>
          <label className="inspector-field">
            名子
            <input
              key={`${item.id}-table-name-${tableData.name ?? ''}`}
              type="text"
              defaultValue={tableData.name ?? ''}
              placeholder="不顯示標籤"
              onBlur={(e) => handleTableNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
          <label className="inspector-field">
            標籤字級
            <CommitNumberInput
              inputKey={`${item.id}-table-label-font-size-${
                tableData.labelFontSize ?? DEFAULT_TABLE_LABEL_FONT_SIZE
              }`}
              min={TABLE_LABEL_FONT_SIZE_MIN}
              max={TABLE_LABEL_FONT_SIZE_MAX}
              value={tableData.labelFontSize ?? DEFAULT_TABLE_LABEL_FONT_SIZE}
              onCommit={handleTableLabelFontSizeChange}
            />
          </label>
          <label className="inspector-field">
            內部物件分割
            <select
              value={tableChildLayoutDirection}
              onChange={(e) =>
                handleTableChildLayoutChange(
                  e.target.value as TableChildLayoutDirection,
                )
              }
            >
              {TABLE_CHILD_LAYOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

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
              onUpdateTableCells(item.id, selectedTableCellIds, {
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
            <CommitNumberInput
              inputKey={`${item.id}-table-font-size-${resolvedStyle.fontSize}`}
              min={12}
              max={32}
              value={resolvedStyle.fontSize}
              onCommit={handleFontSizeChange}
            />
          </label>
        </div>
        <div className="inspector-grid">
          <label className="inspector-field">
            水平對齊
            <select
              value={selectedTableCellHorizontalAlign}
              disabled={selectedTableCells.length === 0}
              onChange={(e) =>
                onUpdateTableCells(item.id, selectedTableCellIds, {
                  textHorizontalAlign: e.target
                    .value as TableCellData['textHorizontalAlign'],
                })
              }
            >
              {TEXT_HORIZONTAL_ALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inspector-field">
            垂直對齊
            <select
              value={selectedTableCellVerticalAlign}
              disabled={selectedTableCells.length === 0}
              onChange={(e) =>
                onUpdateTableCells(item.id, selectedTableCellIds, {
                  textVerticalAlign: e.target
                    .value as TableCellData['textVerticalAlign'],
                })
              }
            >
              {TEXT_VERTICAL_ALIGN_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="inspector-field">
          內部物件分割
          <select
            value={selectedTableCellChildLayoutDirection}
            disabled={selectedTableCells.length === 0}
            onChange={(e) =>
              handleTableCellChildLayoutChange(
                e.target.value as TableChildLayoutDirection,
              )
            }
          >
            {TABLE_CHILD_LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
                  resolvedStyle.fontStyle === 'italic' ? 'normal' : 'italic',
              })
            }
          >
            Italic
          </button>
        </div>
      </section>
    </>
  );
}
