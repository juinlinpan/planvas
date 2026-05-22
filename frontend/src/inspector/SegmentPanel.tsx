import type { BoardItem } from '../api';
import {
  BACKGROUND_COLOR_OPTIONS,
  STROKE_COLOR_OPTIONS,
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

const SEGMENT_TEXT_BACKGROUND_OPTIONS = [
  { name: 'Transparent', value: 'transparent' },
  ...BACKGROUND_COLOR_OPTIONS,
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
  isArrow: boolean;
  isLine: boolean;
  isSegmentItem: boolean;
  projectDefaultStyle?: ProjectDefaultStyle;
  onUpdate: (item: BoardItem) => void;
};

/**
 * Inspector panel for line/arrow items. Covers line style (stroke color,
 * width, style, corner type, arrow head size) and label text controls.
 * Extracted from Inspector.tsx.
 */
export function SegmentPanel({
  item,
  isArrow,
  isLine,
  isSegmentItem,
  projectDefaultStyle,
  onUpdate,
}: Props) {
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const parsedStyle = parseBoardItemStyle(item.style_json);
  const segmentTextBackgroundColor = parsedStyle.backgroundColor ?? 'transparent';
  const hasCustomStyle =
    item.style_json !== null && item.style_json.trim().length > 0;

  function handleStyleChange(patch: BoardItemStyle) {
    const currentStyle = parseBoardItemStyle(item.style_json);
    onUpdate({
      ...item,
      style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
    });
  }

  function handleStrokeWidthChange(rawValue: string) {
    if (rawValue.trim().length === 0) return;
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    handleStyleChange({ strokeWidth: value });
  }

  function handleArrowHeadSizeCommit(rawValue: string) {
    if (rawValue.trim().length === 0) return;
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    handleStyleChange({ arrowHeadSize: value });
  }

  function handleContentChange(rawValue: string) {
    onUpdate({ ...item, content: rawValue });
  }

  return (
    <>
      {/* Line style section */}
      <section className="inspector-section">
        <div className="inspector-title-row">
          <p className="meta-label">Line Style</p>
          <button
            type="button"
            className="ghost-button"
            disabled={!hasCustomStyle}
            onClick={() => onUpdate({ ...item, style_json: null })}
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
                  strokeStyle: e.target.value as BoardItemStyle['strokeStyle'],
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
                key={`${item.id}-${resolvedStyle.arrowHeadSize}`}
                type="number"
                min={8}
                max={40}
                defaultValue={resolvedStyle.arrowHeadSize}
                onBlur={(e) => handleArrowHeadSizeCommit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </label>
          ) : null}
        </div>
        <p className="inspector-meta">
          {isSegmentItem
            ? 'Segment connector with editable endpoints and bends.'
            : summarizeContent(item)}
        </p>
      </section>

      {/* Label text section */}
      {isLine || isArrow ? (
        <section className="inspector-section">
          <div className="inspector-title-row">
            <p className="meta-label">Label Text</p>
          </div>
          <label className="inspector-field">
            文字
            <textarea
              className="inspector-textarea"
              value={item.content ?? ''}
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
                <option value="above">上方</option>
                <option value="center">置中</option>
                <option value="below">下方</option>
              </select>
            </label>
          </div>
          <div className="inspector-grid">
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
              <CommitNumberInput
                inputKey={`${item.id}-seg-font-size-${resolvedStyle.fontSize}`}
                min={12}
                max={32}
                value={resolvedStyle.fontSize}
                onCommit={(rawValue) => {
                  const value = Number(rawValue);
                  if (!Number.isNaN(value)) handleStyleChange({ fontSize: value });
                }}
              />
            </label>
          </div>
        </section>
      ) : null}
    </>
  );
}
