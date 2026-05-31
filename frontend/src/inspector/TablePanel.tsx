import { useEffect, useState } from 'react';
import type { BoardItem } from '../services/api';
import {
  BACKGROUND_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ProjectDefaultStyle,
} from '../items/itemStyles';
import {
  DEFAULT_TABLE_LABEL_FONT_SIZE,
  TABLE_LABEL_FONT_SIZE_MAX,
  TABLE_LABEL_FONT_SIZE_MIN,
  getTableCellSelectionColIndexes,
  getTableCellSelectionRowIndexes,
  getNextTableLayoutUpdatedAt,
  sanitizeTableLabelFontSize,
  sanitizeTableName,
  serializeTableData,
  type TableCellData,
  type TableChildLayoutDirection,
  type TableData,
} from '../tableData/tableData';
import { ITEM_TYPE } from '../types/index';
import { ColorPaletteField, CommitNumberInput } from '../components/Inspector';

const TEXT_HORIZONTAL_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

const TEXT_VERTICAL_ALIGN_OPTIONS = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
] as const;

const TABLE_CHILD_LAYOUT_OPTIONS = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
] as const;

type Props = {
  activeTab: 'style' | 'text';
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
  onDistributeRows: () => void;
  onDistributeCols: () => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
};

export function TablePanel({
  activeTab,
  item,
  tableData,
  selectedTableCells,
  selectedTableCellIds,
  selectedTableCellBackgroundColor,
  selectedTableCellTextContent,
  selectedTableCellHorizontalAlign,
  selectedTableCellVerticalAlign,
  selectedTableCellChildLayoutDirection,
  tableChildLayoutDirection,
  projectDefaultStyle,
  onUpdate,
  onDistributeRows,
  onDistributeCols,
  onUpdateTableCells,
}: Props) {
  if (item.type !== ITEM_TYPE.table) return null;

  const [localCellContent, setLocalCellContent] = useState(selectedTableCellTextContent);
  const [isCellContentFocused, setIsCellContentFocused] = useState(false);

  const selectedCellIdsKey = selectedTableCellIds.join(',');

  useEffect(() => {
    if (!isCellContentFocused) {
      setLocalCellContent(selectedTableCellTextContent);
    }
  }, [selectedTableCellTextContent, isCellContentFocused, selectedCellIdsKey]);

  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const hasCustomStyle =
    item.style_json !== null && item.style_json.trim().length > 0;
  const canDistributeRows =
    tableData !== null &&
    getTableCellSelectionRowIndexes(tableData, selectedTableCellIds).length >=
      2;
  const canDistributeCols =
    tableData !== null &&
    getTableCellSelectionColIndexes(tableData, selectedTableCellIds).length >=
      2;

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

  if (activeTab === 'style') {
    return (
      <>
        {tableData !== null ? (
          <section className="inspector-section">
            <p className="meta-label">Table</p>
            <label className="inspector-field">
              Table name
              <input
                key={`${item.id}-table-name-${tableData.name ?? ''}`}
                type="text"
                defaultValue={tableData.name ?? ''}
                placeholder="Table name"
                onBlur={(e) => handleTableNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </label>
            <label className="inspector-field">
              Item layout
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
            <div className="inspector-toggle-group">
              <button
                type="button"
                className="ghost-button"
                disabled={!canDistributeRows}
                onClick={onDistributeRows}
              >
                平均分配高
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={!canDistributeCols}
                onClick={onDistributeCols}
              >
                平均分配寬
              </button>
            </div>
          </section>
        ) : null}

        <section className="inspector-section">
          <div className="inspector-title-row">
            <p className="meta-label">Table Cell</p>
            <button
              type="button"
              className="ghost-button"
              disabled={!hasCustomStyle}
              onClick={() => onUpdate({ ...item, style_json: null })}
            >
              Reset
            </button>
          </div>
          <label className="inspector-field">
            Cell text
            <textarea
              className="inspector-textarea"
              value={localCellContent}
              disabled={selectedTableCells.length === 0}
              placeholder={
                selectedTableCells.length === 0
                  ? 'Select a table cell to edit text'
                  : selectedTableCells.length > 1
                    ? `Editing ${selectedTableCells.length} selected cells`
                    : undefined
              }
              onChange={(e) => setLocalCellContent(e.target.value)}
              onFocus={() => setIsCellContentFocused(true)}
              onBlur={() => {
                setIsCellContentFocused(false);
                onUpdateTableCells(item.id, selectedTableCellIds, {
                  content: localCellContent,
                });
              }}
            />
          </label>
          <ColorPaletteField
            label="Background color"
            options={BACKGROUND_COLOR_OPTIONS}
            selectedValue={selectedTableCellBackgroundColor}
            tone="background"
            onSelect={(value) =>
              onUpdateTableCells(item.id, selectedTableCellIds, {
                backgroundColor: value,
              })
            }
          />
        </section>
      </>
    );
  }

  return (
    <>
      {tableData !== null ? (
        <section className="inspector-section">
          <p className="meta-label">Table Text</p>
          <label className="inspector-field">
            Label font size
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
        </section>
      ) : null}

      <section className="inspector-section">
        <p className="meta-label">Cell Text</p>
        <ColorPaletteField
          label="Text color"
          options={TEXT_COLOR_OPTIONS}
          selectedValue={resolvedStyle.textColor}
          tone="text"
          onSelect={(value) => handleStyleChange({ textColor: value })}
        />
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
            Horizontal align
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
            Vertical align
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
          Item layout
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
