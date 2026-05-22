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
  activeTab: 'style' | 'text';
  item: BoardItem;
  isArrow: boolean;
  isLine: boolean;
  isSegmentItem: boolean;
  projectDefaultStyle?: ProjectDefaultStyle;
  onUpdate: (item: BoardItem) => void;
};

export function SegmentPanel({
  activeTab,
  item,
  isArrow,
  isLine,
  isSegmentItem,
  projectDefaultStyle,
  onUpdate,
}: Props) {
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const parsedStyle = parseBoardItemStyle(item.style_json);
  const segmentTextBackgroundColor =
    parsedStyle.backgroundColor ?? 'transparent';
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

  if (activeTab === 'style') {
    return (
      <>
        <section className="inspector-section">
          <div className="inspector-title-row">
            <p className="meta-label">Line Style</p>
            <button
              type="button"
              className="ghost-button"
              disabled={!hasCustomStyle}
              onClick={() => onUpdate({ ...item, style_json: null })}
            >
              Reset
            </button>
          </div>
          <div className="inspector-field">
            <ColorPaletteField
              label="Stroke color"
              options={STROKE_COLOR_OPTIONS}
              selectedValue={resolvedStyle.strokeColor}
              tone="background"
              onSelect={(value) => handleStyleChange({ strokeColor: value })}
            />
          </div>
          <div className="inspector-grid">
            <label className="inspector-field">
              Stroke width
              <input
                type="number"
                min={1}
                max={16}
                value={resolvedStyle.strokeWidth}
                onChange={(e) => handleStrokeWidthChange(e.target.value)}
              />
            </label>
            <label className="inspector-field">
              Stroke style
              <select
                value={resolvedStyle.strokeStyle}
                onChange={(e) =>
                  handleStyleChange({
                    strokeStyle: e.target
                      .value as BoardItemStyle['strokeStyle'],
                  })
                }
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </label>
          </div>
          <div className="inspector-grid">
            <label className="inspector-field">
              Corner
              <select
                value={resolvedStyle.lineCornerType}
                onChange={(e) =>
                  handleStyleChange({
                    lineCornerType: e.target
                      .value as BoardItemStyle['lineCornerType'],
                  })
                }
              >
                <option value="sharp">Sharp</option>
                <option value="rounded">Rounded</option>
              </select>
            </label>
            {isArrow ? (
              <label className="inspector-field">
                Arrow head
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

        {isLine || isArrow ? (
          <section className="inspector-section">
            <p className="meta-label">Label Content</p>
            <label className="inspector-field">
              Text
              <textarea
                className="inspector-textarea"
                value={item.content ?? ''}
                onChange={(e) => handleContentChange(e.target.value)}
              />
            </label>
            <div className="inspector-color-grid">
              <ColorPaletteField
                label="Label background"
                options={SEGMENT_TEXT_BACKGROUND_OPTIONS}
                selectedValue={segmentTextBackgroundColor}
                tone="background"
                onSelect={(value) =>
                  handleStyleChange({ backgroundColor: value })
                }
              />
              <ColorPaletteField
                label="Text color"
                options={TEXT_COLOR_OPTIONS}
                selectedValue={resolvedStyle.textColor}
                tone="text"
                onSelect={(value) => handleStyleChange({ textColor: value })}
              />
            </div>
          </section>
        ) : null}
      </>
    );
  }

  return isLine || isArrow ? (
    <section className="inspector-section">
      <div className="inspector-title-row">
        <p className="meta-label">Label Text</p>
      </div>
      <div className="inspector-grid">
        <label className="inspector-field">
          Horizontal position
          <select
            value={resolvedStyle.segmentTextHorizontalPosition}
            onChange={(e) =>
              handleStyleChange({
                segmentTextHorizontalPosition: e.target
                  .value as BoardItemStyle['segmentTextHorizontalPosition'],
              })
            }
          >
            <option value="start">Start</option>
            <option value="center">Center</option>
            <option value="end">End</option>
          </select>
        </label>
        <label className="inspector-field">
          Vertical position
          <select
            value={resolvedStyle.segmentTextVerticalPosition}
            onChange={(e) =>
              handleStyleChange({
                segmentTextVerticalPosition: e.target
                  .value as BoardItemStyle['segmentTextVerticalPosition'],
              })
            }
          >
            <option value="above">Above</option>
            <option value="center">Center</option>
            <option value="below">Below</option>
          </select>
        </label>
      </div>
      <div className="inspector-grid">
        <label className="inspector-field">
          Orientation
          <select
            value={resolvedStyle.segmentTextOrientation}
            onChange={(e) =>
              handleStyleChange({
                segmentTextOrientation: e.target
                  .value as BoardItemStyle['segmentTextOrientation'],
              })
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="slope">Follow slope</option>
          </select>
        </label>
      </div>
      <div className="inspector-grid">
        <label>
          Font size
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
  ) : null;
}
