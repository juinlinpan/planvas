import { useEffect, useRef } from 'react';
import { type BoardItem } from '../services/api';
import { getFirstNonEmptyLine, getMarkdownH1 } from '../canvasHelpers/canvasHelpers';
import {
  getBoardItemTypographyStyle,
  type ProjectDefaultStyle,
  resolveBoardItemStyle,
} from './itemStyles';
import { MarkdownPreview } from '../components/markdownPreview';

type NoteDisplayMode = 'expanded' | 'title';

function parseNoteDisplayMode(dataJson: string | null): NoteDisplayMode {
  if (dataJson === null || dataJson.trim().length === 0) {
    return 'expanded';
  }

  try {
    const parsed = JSON.parse(dataJson) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      (parsed as { noteDisplayMode?: unknown }).noteDisplayMode === 'title'
    ) {
      return 'title';
    }
  } catch {
    return 'expanded';
  }

  return 'expanded';
}

function serializeNoteDisplayMode(
  item: BoardItem,
  noteDisplayMode: NoteDisplayMode,
): string {
  let nextData: Record<string, unknown> = {};

  if (item.data_json !== null && item.data_json.trim().length > 0) {
    try {
      const parsed = JSON.parse(item.data_json) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        nextData = parsed as Record<string, unknown>;
      }
    } catch {
      nextData = {};
    }
  }

  nextData.noteDisplayMode = noteDisplayMode;
  return JSON.stringify(nextData);
}

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  projectDefaultStyle?: ProjectDefaultStyle;
  renderMode?: 'interactive' | 'static';
};

export function NotePaper({
  item,
  isEditing,
  onUpdate,
  onEditEnd,
  projectDefaultStyle,
  renderMode = 'interactive',
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const title =
    item.title ??
    getMarkdownH1(item.content) ??
    getFirstNonEmptyLine(item.content);
  const displayMode = parseNoteDisplayMode(item.data_json);
  const isTitleOnly = displayMode === 'title';
  const canToggleDisplayMode = renderMode === 'interactive' && !isEditing;
  const resolvedStyle = resolveBoardItemStyle(item, projectDefaultStyle);
  const typographyStyle = getBoardItemTypographyStyle(
    item,
    projectDefaultStyle,
  );
  const cardStyle = {
    background: resolvedStyle.backgroundColor,
    ...typographyStyle,
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate({
      ...item,
      content: e.target.value,
      content_format: 'markdown',
    });
  }

  function handleDisplayModeToggle(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onUpdate({
      ...item,
      data_json: serializeNoteDisplayMode(
        item,
        isTitleOnly ? 'expanded' : 'title',
      ),
    });
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="note-paper-editor"
        style={cardStyle}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div
      className={`note-paper-display ${isTitleOnly ? 'is-title-only' : ''}`.trim()}
      style={cardStyle}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="note-paper-header">
        <div className="note-paper-header-row">
          <strong className="note-paper-title">
            {title ?? 'Untitled note'}
          </strong>
          {canToggleDisplayMode ? (
            <button
              type="button"
              className="note-paper-mode-toggle"
              aria-label={
                isTitleOnly ? 'Expand note content' : 'Show title only'
              }
              title={isTitleOnly ? '展開內容' : '只顯示標題'}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={handleDisplayModeToggle}
            >
              {isTitleOnly ? '展開' : '標題'}
            </button>
          ) : null}
        </div>
      </div>
      {isTitleOnly ? null : (
        <MarkdownPreview
          content={item.content}
          omitFirstHeading={true}
          className="note-paper-body"
          maxBlocks={null}
        />
      )}
    </div>
  );
}
