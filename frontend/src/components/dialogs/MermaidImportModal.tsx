import { useState } from 'react';

type Props = {
  onConfirm: (title: string, code: string) => void;
  onCancel: () => void;
  isBusy: boolean;
};

export function MermaidImportModal({ onConfirm, onCancel, isBusy }: Props) {
  const [title, setTitle] = useState('Mermaid Import');
  const [code, setCode] = useState('flowchart TD\nA[Start] --> B(End)');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && code.trim()) {
      onConfirm(title.trim(), code.trim());
    }
  };

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form
        className="confirmation-dialog mermaid-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mermaid-import-dialog-title"
        onSubmit={handleSubmit}
        style={{ maxWidth: '600px', width: '90%' }}
      >
        <div className="confirmation-dialog-header">
          <h2 id="mermaid-import-dialog-title">Import Mermaid</h2>
          <button
            type="button"
            className="ghost-button confirmation-dialog-close"
            disabled={isBusy}
            onClick={onCancel}
            aria-label="Close dialog"
          >
            X
          </button>
        </div>

        <div
          className="confirmation-dialog-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <label className="confirmation-dialog-label">
            Page Title
            <input
              className="confirmation-dialog-input"
              style={{ width: '100%', marginTop: '4px' }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isBusy}
              placeholder="Enter page title..."
              autoFocus
            />
          </label>

          <label className="confirmation-dialog-label">
            Mermaid Code
            <textarea
              className="confirmation-dialog-input"
              style={{
                width: '100%',
                height: '300px',
                marginTop: '4px',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isBusy}
              placeholder="flowchart TD..."
            />
          </label>
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
            type="submit"
            className="ghost-button primary-action-button"
            disabled={isBusy || !title.trim() || !code.trim()}
          >
            Import as Page
          </button>
        </div>
      </form>
    </div>
  );
}
