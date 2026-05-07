import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { updateProjectNote, type ProjectNote } from './api';
import { MarkdownPreview } from './markdownPreview';

type Props = {
  projectId: string;
  noteFile: string;
  projectNotes: ProjectNote[];
  onNotesChanged: () => void;
};

type SaveStatus = 'saved' | 'saving' | 'unsaved';
type ViewMode = 'edit' | 'split' | 'preview';

const AUTOSAVE_DELAY_MS = 1500;

function IconBold() {
  return <strong style={{ fontFamily: 'serif', fontSize: '0.92rem' }}>B</strong>;
}

function IconItalic() {
  return <em style={{ fontFamily: 'serif', fontSize: '0.92rem' }}>I</em>;
}

export function MarkdownEditor({
  projectId,
  noteFile,
  projectNotes,
  onNotesChanged,
}: Props) {
  const note = projectNotes.find((n) => n.note_file === noteFile);
  const [content, setContent] = useState(note?.content ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContent = useRef(note?.content ?? '');

  // When the noteFile changes (tab switch), reload content from projectNotes
  useEffect(() => {
    const newNote = projectNotes.find((n) => n.note_file === noteFile);
    const newContent = newNote?.content ?? '';
    setContent(newContent);
    setSaveStatus('saved');
    lastSavedContent.current = newContent;
  }, [noteFile, projectNotes]);

  const performSave = useCallback(
    async (textToSave: string) => {
      if (textToSave === lastSavedContent.current) {
        setSaveStatus('saved');
        return;
      }
      setSaveStatus('saving');
      try {
        await updateProjectNote(projectId, noteFile, textToSave);
        lastSavedContent.current = textToSave;
        setSaveStatus('saved');
        onNotesChanged();
      } catch {
        setSaveStatus('unsaved');
      }
    },
    [projectId, noteFile, onNotesChanged],
  );

  function handleContentChange(newContent: string) {
    setContent(newContent);
    setSaveStatus('unsaved');
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void performSave(newContent);
    }, AUTOSAVE_DELAY_MS);
  }

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // Keyboard shortcut: Ctrl+S / Cmd+S → immediate save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (saveTimerRef.current !== null) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void performSave(content);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [content, performSave]);

  /* ── Toolbar helpers ── */
  function wrapSelection(before: string, after = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end);
    const next =
      content.slice(0, start) + before + selected + after + content.slice(end);
    handleContentChange(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    }, 0);
  }

  function prefixCurrentLine(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', pos - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    handleContentChange(next);
    setTimeout(() => {
      ta.focus();
      const newPos = pos + prefix.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  /* ── Tab key in textarea → insert spaces ── */
  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      wrapSelection('  ');
    }
  }

  if (note === undefined) {
    return (
      <div className="markdown-editor-missing">
        <p>Note file not found: <code>{noteFile}</code></p>
      </div>
    );
  }

  const saveLabel =
    saveStatus === 'saved'
      ? 'Saved'
      : saveStatus === 'saving'
        ? 'Saving…'
        : '● Unsaved';

  return (
    <div className={`markdown-editor markdown-editor-${viewMode}`}>
      {/* ── Top bar ── */}
      <div className="markdown-editor-topbar">
        <div className="markdown-editor-file-row">
          <svg
            className="markdown-editor-doc-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <span className="markdown-editor-filename">{noteFile}</span>
          <span className={`markdown-editor-save-badge is-${saveStatus}`}>
            {saveLabel}
          </span>
        </div>

        <div className="markdown-editor-view-toggle">
          {(['edit', 'split', 'preview'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`markdown-editor-view-btn ${viewMode === mode ? 'is-active' : ''}`}
              onClick={() => setViewMode(mode)}
              title={mode.charAt(0).toUpperCase() + mode.slice(1)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Formatting toolbar ── */}
      <div className="markdown-editor-toolbar">
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Bold"
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('**', '**'); }}
        >
          <IconBold />
        </button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Italic"
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('*', '*'); }}
        >
          <IconItalic />
        </button>
        <span className="markdown-editor-fmt-sep" />
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Heading 1"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('# '); }}
        >H1</button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Heading 2"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('## '); }}
        >H2</button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Heading 3"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('### '); }}
        >H3</button>
        <span className="markdown-editor-fmt-sep" />
        <button
          type="button"
          className="markdown-editor-fmt-btn markdown-editor-fmt-mono"
          title="Inline code"
          onMouseDown={(e) => { e.preventDefault(); wrapSelection('`', '`'); }}
        >`code`</button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Blockquote"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('> '); }}
        >❝</button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Unordered list"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('- '); }}
        >• List</button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Ordered list"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('1. '); }}
        >1. List</button>
      </div>

      {/* ── Body: write + preview panes ── */}
      <div className="markdown-editor-body">
        <div className="markdown-editor-write-pane">
          <textarea
            ref={textareaRef}
            className="markdown-editor-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Start writing markdown here…&#10;&#10;Use the toolbar above or type directly."
            spellCheck
          />
        </div>
        <div className="markdown-editor-preview-pane">
          {content.trim().length === 0 ? (
            <p className="markdown-editor-empty-preview">
              Nothing to preview yet.
            </p>
          ) : (
            <MarkdownPreview content={content} className="markdown-editor-preview-content" />
          )}
        </div>
      </div>
    </div>
  );
}
