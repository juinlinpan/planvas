import { useEffect, useState } from 'react';
import { listDirs, type DirEntry } from './api';

type Props = {
  onConfirm: (path: string) => void;
  onCancel: () => void;
  isBusy: boolean;
};

function IconFolder() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function buildBreadcrumbs(
  home: string,
  current: string,
): Array<{ label: string; path: string }> {
  const sep = home.includes('\\') ? '\\' : '/';
  const crumbs: Array<{ label: string; path: string }> = [
    { label: '~', path: home },
  ];
  if (current === home) return crumbs;

  const rel = current.slice(home.length).replace(/^[\\/]/, '');
  const parts = rel.split(/[\\/]/);
  let acc = home;
  for (const part of parts) {
    acc = acc + sep + part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
}

export function FolderPickerModal({ onConfirm, onCancel, isBusy }: Props) {
  const [home, setHome] = useState('');
  const [current, setCurrent] = useState('');
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDir(undefined);
  }, []);

  async function loadDir(dirPath: string | undefined) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listDirs(dirPath);
      setHome(result.home);
      setCurrent(result.current);
      setDirs(result.dirs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  }

  const breadcrumbs = home ? buildBreadcrumbs(home, current) : [];

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirmation-dialog folder-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
      >
        <div className="confirmation-dialog-header">
          <h2 id="folder-picker-title">Open Project Folder</h2>
          <button
            type="button"
            className="ghost-button confirmation-dialog-close"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="folder-picker-breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="folder-picker-crumb-group">
              {i > 0 && (
                <span className="folder-picker-sep" aria-hidden="true">
                  <IconChevron />
                </span>
              )}
              <button
                type="button"
                className={`folder-picker-crumb ${i === breadcrumbs.length - 1 ? 'is-active' : ''}`}
                disabled={i === breadcrumbs.length - 1 || isLoading}
                onClick={() => void loadDir(crumb.path)}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        <div className="folder-picker-list">
          {isLoading ? (
            <div className="folder-picker-status">Loading…</div>
          ) : error !== null ? (
            <div className="folder-picker-status folder-picker-error">
              {error}
            </div>
          ) : dirs.length === 0 ? (
            <div className="folder-picker-status">No subfolders</div>
          ) : (
            dirs.map((entry) => (
              <button
                key={entry.path}
                type="button"
                className="folder-picker-entry"
                onClick={() => void loadDir(entry.path)}
              >
                <IconFolder />
                <span>{entry.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="folder-picker-selected">
          <span className="folder-picker-selected-label">Selected folder:</span>
          <code className="folder-picker-selected-path">{current}</code>
        </div>

        <div className="confirmation-dialog-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={isBusy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ghost-button primary-action-button"
            disabled={isBusy || current.length === 0}
            onClick={() => onConfirm(current)}
          >
            Open this folder
          </button>
        </div>
      </div>
    </div>
  );
}
