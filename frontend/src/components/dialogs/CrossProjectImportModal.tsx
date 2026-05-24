import { useEffect, useState } from 'react';
import {
  listPages,
  listProjectNotes,
  type Page,
  type Project,
  type ProjectNote,
} from '../../services/api';

type Props = {
  currentProjectId: string;
  projects: Project[];
  isBusy: boolean;
  onConfirm: (
    pageIds: string[],
    noteFiles: string[],
    sourceProjectId: string,
  ) => void;
  onCancel: () => void;
};

export function CrossProjectImportModal({
  currentProjectId,
  projects,
  isBusy,
  onConfirm,
  onCancel,
}: Props) {
  const otherProjects = projects.filter(
    (p) => p.id !== currentProjectId && p.path_exists !== false,
  );

  const [sourceProjectId, setSourceProjectId] = useState<string>(
    otherProjects[0]?.id ?? '',
  );
  const [sourcePages, setSourcePages] = useState<Page[]>([]);
  const [sourceNotes, setSourceNotes] = useState<ProjectNote[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedNoteFiles, setSelectedNoteFiles] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!sourceProjectId) {
      setSourcePages([]);
      setSourceNotes([]);
      return;
    }

    setLoadingSource(true);
    setLoadError(null);
    setSelectedPageIds(new Set());
    setSelectedNoteFiles(new Set());

    Promise.all([listPages(sourceProjectId), listProjectNotes(sourceProjectId)])
      .then(([pages, notes]) => {
        setSourcePages(pages);
        setSourceNotes(notes);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load project data.',
        );
      })
      .finally(() => {
        setLoadingSource(false);
      });
  }, [sourceProjectId]);

  function togglePage(id: string) {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleNote(file: string) {
    setSelectedNoteFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }

  function toggleAllPages() {
    if (selectedPageIds.size === sourcePages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(sourcePages.map((p) => p.id)));
    }
  }

  function toggleAllNotes() {
    if (selectedNoteFiles.size === sourceNotes.length) {
      setSelectedNoteFiles(new Set());
    } else {
      setSelectedNoteFiles(new Set(sourceNotes.map((n) => n.note_file)));
    }
  }

  const nothingSelected =
    selectedPageIds.size === 0 && selectedNoteFiles.size === 0;
  const disabled =
    isBusy || loadingSource || nothingSelected || !sourceProjectId;

  function handleConfirm() {
    if (disabled) return;
    onConfirm([...selectedPageIds], [...selectedNoteFiles], sourceProjectId);
  }

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirmation-dialog cross-project-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-project-import-title"
      >
        <div className="confirmation-dialog-header">
          <h2 id="cross-project-import-title">從其他 Project 匯入</h2>
          <button
            type="button"
            className="ghost-button confirmation-dialog-close"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="cross-project-import-body">
          {/* Project selector */}
          <label className="cross-project-import-label">
            來源 Project
            <select
              className="cross-project-import-select"
              value={sourceProjectId}
              disabled={isBusy}
              onChange={(e) => setSourceProjectId(e.target.value)}
            >
              {otherProjects.length === 0 ? (
                <option value="">（沒有其他 Project）</option>
              ) : (
                otherProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </label>

          {loadError ? (
            <p className="cross-project-import-error">{loadError}</p>
          ) : loadingSource ? (
            <p className="cross-project-import-loading">載入中…</p>
          ) : sourceProjectId ? (
            <div className="cross-project-import-sections">
              {/* Pages section */}
              <section className="cross-project-import-section">
                <div className="cross-project-import-section-header">
                  <strong>Pages</strong>
                  {sourcePages.length > 0 && (
                    <button
                      type="button"
                      className="ghost-button cross-project-import-select-all"
                      onClick={toggleAllPages}
                      disabled={isBusy}
                    >
                      {selectedPageIds.size === sourcePages.length
                        ? '取消全選'
                        : '全選'}
                    </button>
                  )}
                </div>
                {sourcePages.length === 0 ? (
                  <p className="cross-project-import-empty">
                    此 Project 沒有 Pages
                  </p>
                ) : (
                  <ul className="cross-project-import-list">
                    {sourcePages.map((page) => (
                      <li key={page.id} className="cross-project-import-item">
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedPageIds.has(page.id)}
                            onChange={() => togglePage(page.id)}
                            disabled={isBusy}
                          />
                          <span>{page.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Notes section */}
              <section className="cross-project-import-section">
                <div className="cross-project-import-section-header">
                  <strong>Notes</strong>
                  {sourceNotes.length > 0 && (
                    <button
                      type="button"
                      className="ghost-button cross-project-import-select-all"
                      onClick={toggleAllNotes}
                      disabled={isBusy}
                    >
                      {selectedNoteFiles.size === sourceNotes.length
                        ? '取消全選'
                        : '全選'}
                    </button>
                  )}
                </div>
                {sourceNotes.length === 0 ? (
                  <p className="cross-project-import-empty">
                    此 Project 沒有 Notes
                  </p>
                ) : (
                  <ul className="cross-project-import-list">
                    {sourceNotes.map((note) => (
                      <li
                        key={note.note_file}
                        className="cross-project-import-item"
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedNoteFiles.has(note.note_file)}
                            onChange={() => toggleNote(note.note_file)}
                            disabled={isBusy}
                          />
                          <span>{note.title}</span>
                          <span className="cross-project-import-note-file">
                            {note.note_file}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <div className="confirmation-dialog-footer">
          <button
            type="button"
            className="ghost-button"
            disabled={isBusy}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={disabled}
            onClick={handleConfirm}
          >
            {isBusy
              ? '匯入中…'
              : `匯入${nothingSelected ? '' : ` (${selectedPageIds.size + selectedNoteFiles.size})`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
