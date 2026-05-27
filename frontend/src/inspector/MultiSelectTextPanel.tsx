import { useEffect, useState } from 'react';
import type { BoardItem } from '../services/api';
import { ITEM_TYPE } from '../types/index';
import {
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ProjectDefaultStyle,
} from '../items/itemStyles';
import { CommitNumberInput } from '../components/Inspector';

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

type Props = {
  items: BoardItem[];
  projectDefaultStyle?: ProjectDefaultStyle;
  onUpdateMultiple: (items: BoardItem[]) => void;
};

export function MultiSelectTextPanel({
  items,
  projectDefaultStyle,
  onUpdateMultiple,
}: Props) {
  if (items.length === 0) return null;

  // 1. Resolve content
  const firstItem = items[0];
  const allSameContent = items.every((it) => it.content === firstItem.content);
  const contentValue = allSameContent ? (firstItem.content ?? '') : '';

  const [localContent, setLocalContent] = useState(contentValue);
  const [isContentFocused, setIsContentFocused] = useState(false);

  const itemsKey = items.map((it) => it.id).join(',');

  useEffect(() => {
    if (!isContentFocused) {
      setLocalContent(contentValue);
    }
  }, [contentValue, isContentFocused, itemsKey]);

  const contentPlaceholder = allSameContent
    ? ''
    : '(多種內容，編輯將套用至所有選取項目)';

  // Determine if there are markdown notes in selection
  const hasMarkdown = items.some((it) => it.type === ITEM_TYPE.note_paper);

  // 2. Resolve typography settings
  const resolvedStyles = items.map((it) =>
    resolveBoardItemStyle(it, projectDefaultStyle),
  );
  const firstStyle = resolvedStyles[0];

  const allSameFontSize = resolvedStyles.every(
    (st) => st.fontSize === firstStyle.fontSize,
  );
  const fontSizeValue = allSameFontSize ? firstStyle.fontSize : 16;

  const allSameHAlign = resolvedStyles.every(
    (st) => st.textHorizontalAlign === firstStyle.textHorizontalAlign,
  );
  const hAlignValue = allSameHAlign
    ? (firstStyle.textHorizontalAlign ?? 'center')
    : 'center';

  const allSameVAlign = resolvedStyles.every(
    (st) => st.textVerticalAlign === firstStyle.textVerticalAlign,
  );
  const vAlignValue = allSameVAlign
    ? (firstStyle.textVerticalAlign ?? 'middle')
    : 'middle';

  const allBold = resolvedStyles.every((st) => st.fontWeight === 'bold');
  const allItalic = resolvedStyles.every((st) => st.fontStyle === 'italic');

  // Check if at least one text_box is selected (only text_box supports horizontal/vertical alignments)
  const hasTextBox = items.some((it) => it.type === ITEM_TYPE.text_box);

  function handleStyleChange(patch: BoardItemStyle) {
    const updatedItems = items.map((item) => {
      const currentStyle = parseBoardItemStyle(item.style_json);
      return {
        ...item,
        style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
      };
    });
    onUpdateMultiple(updatedItems);
  }

  function handleFontSizeChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    handleStyleChange({ fontSize: value });
  }

  function handleContentCommit() {
    const updatedItems = items.map((item) => {
      return {
        ...item,
        content: localContent,
        content_format:
          item.type === ITEM_TYPE.note_paper ? 'markdown' : item.content_format,
      };
    });
    onUpdateMultiple(updatedItems);
  }

  function handleToggleBold() {
    handleStyleChange({ fontWeight: allBold ? 'normal' : 'bold' });
  }

  function handleToggleItalic() {
    handleStyleChange({ fontStyle: allItalic ? 'normal' : 'italic' });
  }

  return (
    <section className="inspector-section">
      <div className="inspector-title-row">
        <p className="meta-label">文字內容</p>
      </div>

      <label className="inspector-field">
        {hasMarkdown ? 'Markdown' : '內文'}
        <textarea
          className="inspector-textarea"
          value={localContent}
          placeholder={contentPlaceholder}
          onChange={(e) => setLocalContent(e.target.value)}
          onFocus={() => setIsContentFocused(true)}
          onBlur={() => {
            setIsContentFocused(false);
            handleContentCommit();
          }}
        />
      </label>

      <div className="inspector-title-row" style={{ marginTop: '16px' }}>
        <p className="meta-label">樣式</p>
      </div>

      <div className="inspector-grid">
        <label>
          Font size
          <CommitNumberInput
            inputKey={`multi-font-size-${fontSizeValue}-${allSameFontSize}`}
            min={12}
            max={32}
            value={fontSizeValue}
            onCommit={handleFontSizeChange}
          />
        </label>
      </div>

      {hasTextBox ? (
        <div className="inspector-grid">
          <label className="inspector-field">
            Horizontal align
            <select
              value={hAlignValue}
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
            Vertical align
            <select
              value={vAlignValue}
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

      <div className="inspector-toggle-group" style={{ marginTop: '12px' }}>
        <button
          type="button"
          className={`ghost-button ${allBold ? 'is-active' : ''}`}
          onClick={handleToggleBold}
        >
          Bold
        </button>
        <button
          type="button"
          className={`ghost-button ${allItalic ? 'is-active' : ''}`}
          onClick={handleToggleItalic}
        >
          Italic
        </button>
      </div>

      <p className="inspector-meta" style={{ marginTop: '16px' }}>
        已選取 {items.length} 個文字物件進行批次編輯。
      </p>
    </section>
  );
}
