import { useEffect, useState } from 'react';
import type { BoardItem } from '../services/api';
import { ITEM_TYPE } from '../types/index';

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
  existingNoteFiles?: ReadonlySet<string>;
  onUpdate: (item: BoardItem) => void;
  onToggleCollapse: () => void;
};

/**
 * Inspector section for content fields: title (frame), body text / markdown,
 * note file rename (note_paper), and frame collapse toggle.
 * Extracted from Inspector.tsx.
 */
export function ContentSection({
  item,
  childCount,
  existingNoteFiles,
  onUpdate,
  onToggleCollapse,
}: Props) {
  const [localTitle, setLocalTitle] = useState(item.title ?? '');
  const [localContent, setLocalContent] = useState(item.content ?? '');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isContentFocused, setIsContentFocused] = useState(false);
  const [noteFileError, setNoteFileError] = useState<string | null>(null);

  useEffect(() => {
    setNoteFileError(null);
  }, [item.id]);

  useEffect(() => {
    if (!isTitleFocused) {
      setLocalTitle(item.title ?? '');
    }
  }, [item.title, isTitleFocused, item.id]);

  useEffect(() => {
    if (!isContentFocused) {
      setLocalContent(item.content ?? '');
    }
  }, [item.content, isContentFocused, item.id]);

  const supportsContent =
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper;
  const supportsTitle = item.type === ITEM_TYPE.frame;

  if (!supportsContent && !supportsTitle) return null;

  function handleTitleCommit() {
    onUpdate({ ...item, title: localTitle });
  }

  function handleContentCommit() {
    onUpdate({
      ...item,
      content: localContent,
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
      setNoteFileError(null);
      return;
    }
    // The backend refuses renames onto an existing note (it would merge two
    // notes and delete one); surface that here instead of failing the save.
    if (existingNoteFiles?.has(nextNoteFile)) {
      setNoteFileError(`「${nextNoteFile}」已存在，請換一個檔名。`);
      return;
    }
    setNoteFileError(null);
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
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => {
              setIsTitleFocused(false);
              handleTitleCommit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
          />
        </label>
      ) : null}
      {supportsContent ? (
        <label className="inspector-field">
          {item.type === ITEM_TYPE.note_paper ? 'Markdown' : '內文'}
          <textarea
            className="inspector-textarea"
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            onFocus={() => setIsContentFocused(true)}
            onBlur={() => {
              setIsContentFocused(false);
              handleContentCommit();
            }}
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
          {noteFileError !== null ? (
            <span className="inspector-field-error" role="alert">
              {noteFileError}
            </span>
          ) : null}
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
