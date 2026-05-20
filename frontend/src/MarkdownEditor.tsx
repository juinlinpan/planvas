import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  renameProjectNote,
  updateProjectNote,
  type ProjectNote,
} from './api';
import { MarkdownPreview } from './markdownPreview';

type Props = {
  projectId: string;
  noteFile: string;
  projectNotes: ProjectNote[];
  onNotesChanged: () => void;
  onNoteRenamed: (previousNoteFile: string, renamedNote: ProjectNote) => void;
};

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'renaming';
type ViewMode = 'edit' | 'split' | 'preview';

const AUTOSAVE_DELAY_MS = 1500;

function IconBold() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function IconItalic() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function IconCode() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5H3v8h4c0 4.48-3.52 8-8 8z" />
      <path d="M13 21c3 0 7-1 7-8V5h-7v8h4c0 4.48-3.52 8-8 8z" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export function MarkdownEditor({
  projectId,
  noteFile,
  projectNotes,
  onNotesChanged,
  onNoteRenamed,
}: Props) {
  const note = projectNotes.find((n) => n.note_file === noteFile);
  const [content, setContent] = useState(note?.content ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState(noteFile);
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContent = useRef(note?.content ?? '');
  // Tracks the latest content so the unmount flush can access it without
  // capturing a stale closure.
  const latestContentRef = useRef(note?.content ?? '');

  // When the noteFile changes (tab switch), reload content from projectNotes
  useEffect(() => {
    const newNote = projectNotes.find((n) => n.note_file === noteFile);
    const newContent = newNote?.content ?? '';
    if (latestContentRef.current !== lastSavedContent.current) {
      return;
    }
    latestContentRef.current = newContent;
    setContent(newContent);
    setSaveStatus('saved');
    lastSavedContent.current = newContent;
    setIsEditingFileName(false);
    setFileNameDraft(noteFile);
    setFileNameError(null);
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
    latestContentRef.current = newContent;
    setContent(newContent);
    setSaveStatus('unsaved');
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void performSave(newContent);
    }, AUTOSAVE_DELAY_MS);
  }

  function normalizeFileName(value: string): string {
    const trimmed = value.trim();
    return trimmed.toLowerCase().endsWith('.md') ? trimmed : `${trimmed}.md`;
  }

  async function flushPendingSave(): Promise<void> {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await performSave(latestContentRef.current);
  }

  async function commitFileNameChange(): Promise<void> {
    const nextNoteFile = normalizeFileName(fileNameDraft);
    if (nextNoteFile === noteFile) {
      setIsEditingFileName(false);
      setFileNameDraft(noteFile);
      setFileNameError(null);
      return;
    }

    if (
      nextNoteFile.length <= 3 ||
      nextNoteFile.includes('/') ||
      nextNoteFile.includes('\\')
    ) {
      setFileNameError('Use a filename like plan.md.');
      return;
    }

    setSaveStatus('renaming');
    setFileNameError(null);
    try {
      await flushPendingSave();
      const renamed = await renameProjectNote(projectId, noteFile, nextNoteFile);
      setIsEditingFileName(false);
      setFileNameDraft(renamed.note_file);
      setSaveStatus('saved');
      onNoteRenamed(noteFile, renamed);
      onNotesChanged();
    } catch (error) {
      setSaveStatus(
        latestContentRef.current === lastSavedContent.current
          ? 'saved'
          : 'unsaved',
      );
      setFileNameError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : 'Rename failed.',
      );
    }
  }

  // Flush on unmount: fire an immediate save for any pending unsaved content so
  // that the title on the Page reflects the latest markdown H1 when the user
  // switches back from the editor tab.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        const unsaved = latestContentRef.current;
        if (unsaved !== lastSavedContent.current) {
          void updateProjectNote(projectId, noteFile, unsaved).catch(() => {});
        }
      }
    };
  }, [projectId, noteFile]);

  // Keyboard shortcut: Ctrl+S / Cmd+S immediate save.
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

  /* Toolbar helpers */
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

  /* Tab key in textarea inserts spaces */
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
        ? 'Saving'
        : saveStatus === 'renaming'
          ? 'Renaming'
          : 'Unsaved';

  return (
    <div className={`markdown-editor markdown-editor-${viewMode}`}>
      {/* Top bar */}
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
          {isEditingFileName ? (
            <input
              className="markdown-editor-filename-input"
              value={fileNameDraft}
              autoFocus
              onChange={(event) => setFileNameDraft(event.target.value)}
              onBlur={() => void commitFileNameChange()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setIsEditingFileName(false);
                  setFileNameDraft(noteFile);
                  setFileNameError(null);
                }
              }}
              aria-label="Markdown filename"
            />
          ) : (
            <button
              type="button"
              className="markdown-editor-filename-button"
              title="Rename markdown file"
              onClick={() => {
                setFileNameDraft(noteFile);
                setFileNameError(null);
                setIsEditingFileName(true);
              }}
            >
              {noteFile}
            </button>
          )}
          <span className={`markdown-editor-save-badge is-${saveStatus}`}>
            {saveLabel}
          </span>
          {fileNameError !== null ? (
            <span className="markdown-editor-filename-error">
              {fileNameError}
            </span>
          ) : null}
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

      {/* Formatting toolbar */}
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
        >
          <IconCode />
        </button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Blockquote"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('> '); }}
        >
          <IconQuote />
        </button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Unordered list"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('- '); }}
        >
          <IconList />
        </button>
        <button
          type="button"
          className="markdown-editor-fmt-btn"
          title="Ordered list"
          onMouseDown={(e) => { e.preventDefault(); prefixCurrentLine('1. '); }}
        >1. List</button>
      </div>

      {/* Body: write + preview panes */}
      <div className="markdown-editor-body">
        <div className="markdown-editor-write-pane">
          <textarea
            ref={textareaRef}
            className="markdown-editor-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Start writing markdown here...&#10;&#10;Use the toolbar above or type directly."
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
