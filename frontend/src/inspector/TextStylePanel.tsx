import type { BoardItem } from '../api';
import {
  BACKGROUND_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ProjectDefaultStyle,
} from '../itemStyles';
import { countFilledTableCells, parseTableData } from '../tableData';
import { ITEM_TYPE } from '../types';
import { ColorPaletteField, CommitNumberInput } from '../Inspector';
import type { TableCellData } from '../tableData';

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

type Props = {
  item: BoardItem;
  isTable: boolean;
  isSegmentItem: boolean;
  selectedTableCells: TableCellData[];
  selectedTableCellIds: string[];
  selectedTableCellBackgroundColor: string;
  projectDefaultStyle?: ProjectDefaultStyle;
  onUpdate: (item: BoardItem) => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
};

/**
 * Inspector style section for text-capable items (text_box, sticky_note,
 * note_paper, frame, table). Covers background/text color, font size,
 * text alignment, bold, and italic.
 * Extracted from Inspector.tsx.
 */
export function TextStylePanel({
  item,
  isTable,
  isSegmentItem,
  selectedTableCells,
  selectedTableCellIds,
  selectedTableCellBackgroundColor,
  projectDefaultStyle,
  onUpdate,
  onUpdateTableCells,
}: Props) {
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const parsedStyle = parseBoardItemStyle(item.style_json);
  const hasCustomStyle =
    item.style_json !== null && item.style_json.trim().length > 0;

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

  return (
    <section className="inspector-section">
      <div className="inspector-title-row">
        <p className="meta-label">Style</p>
        <button
          type="button"
          className="ghost-button"
          disabled={!hasCustomStyle}
          onClick={() => onUpdate({ ...item, style_json: null })}
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
              ? onUpdateTableCells(item.id, selectedTableCellIds, {
                  backgroundColor: value,
                })
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
              <CommitNumberInput
                inputKey={`${item.id}-text-font-size-${resolvedStyle.fontSize}`}
                min={12}
                max={32}
                value={resolvedStyle.fontSize}
                onCommit={handleFontSizeChange}
              />
            </label>
          </div>
          {item.type === ITEM_TYPE.text_box ? (
            <div className="inspector-grid">
              <label className="inspector-field">
                水平對齊
                <select
                  value={resolvedStyle.textHorizontalAlign}
                  onChange={(e) =>
                    handleStyleChange({
                      textHorizontalAlign: e.target
                        .value as BoardItemStyle['textHorizontalAlign'],
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
                  value={resolvedStyle.textVerticalAlign}
                  onChange={(e) =>
                    handleStyleChange({
                      textVerticalAlign: e.target
                        .value as BoardItemStyle['textVerticalAlign'],
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
          ) : null}
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
                    resolvedStyle.fontStyle === 'italic' ? 'normal' : 'italic',
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
          : summarizeContent(item)}
      </p>
    </section>
  );
}
