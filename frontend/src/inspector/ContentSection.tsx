import type { BoardItem } from '../api';
import { ITEM_TYPE } from '../types';

function parseDataJson(value: string | null): Record<string, unknown> {
  if (value === null || value.trim().length === 0) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Legacy non-JSON data_json values
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
  if (withoutTrailingDots.length === 0) return '';
  return withoutTrailingDots.toLowerCase().endsWith('.md')
    ? withoutTrailingDots
    : `${withoutTrailingDots}.md`;
}

function serializeNoteFileName(item: BoardItem, noteFile: string): string {
  return JSON.stringify({ ...parseDataJson(item.data_json), noteFile });
}

type Props = {
  item: BoardItem;
  childCount: number;
  onUpdate: (item: BoardItem) => void;
  onToggleCollapse: () => void;
};

/**
 * Inspector section for content fields: title (frame), body text / markdown,
 * note file rename (note_paper), and frame collapse toggle.
 * Extracted from Inspector.tsx.
 */
export function ContentSection({ item, childCount, onUpdate, onToggleCollapse }: Props) {
  const supportsContent =
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper;
  const supportsTitle = item.type === ITEM_TYPE.frame;

  if (!supportsContent && !supportsTitle) return null;

  function handleTitleChange(rawValue: string) {
    onUpdate({ ...item, title: rawValue });
  }

  function handleContentChange(rawValue: string) {
    onUpdate({
      ...item,
      content: rawValue,
      content_format:
        item.type === ITEM_TYPE.note_paper ? 'markdown' : item.content_format,
    });
  }

  function handleNoteFileNameChange(rawValue: string) {
    if (item.type !== ITEM_TYPE.note_paper) return;
    const nextNoteFile = normalizeMarkdownFileName(rawValue);
    if (
      nextNoteFile.length === 0 ||
      nextNoteFile === getNoteFileName(item)
    ) {
      return;
    }
    onUpdate({
      ...item,
      data_json: serializeNoteFileName(item, nextNoteFile),
      content_format: 'markdown',
    });
  }

  return (
    <section className="inspector-section">
      <p className="meta-label">Content</p>
      {supportsTitle ? (
        <label className="inspector-field">
          標題
          <input
            type="text"
            value={item.title ?? ''}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </label>
      ) : null}
      {supportsContent ? (
        <label className="inspector-field">
          {item.type === ITEM_TYPE.note_paper ? 'Markdown' : '內文'}
          <textarea
            className="inspector-textarea"
            value={item.content ?? ''}
            onChange={(e) => handleContentChange(e.target.value)}
          />
        </label>
      ) : null}
      {item.type === ITEM_TYPE.note_paper ? (
        <label className="inspector-field">
          Markdown file
          <input
            key={`${item.id}-${getNoteFileName(item)}`}
            type="text"
            defaultValue={getNoteFileName(item)}
            placeholder="note.md"
            onBlur={(e) => handleNoteFileNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
      ) : null}
      {item.type === ITEM_TYPE.frame ? (
        <div className="inspector-row">
          <span>{childCount} child items</span>
          <button className="ghost-button" onClick={onToggleCollapse}>
            {item.is_collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      ) : null}
      {item.type === ITEM_TYPE.note_paper ? (
        <p className="inspector-meta">Markdown-backed note</p>
      ) : null}
    </section>
  );
}
