import { useState } from 'react';
import { updateIpAlias, type IpAlias } from '../../services/api';

type Props = {
  entries: IpAlias[];
  onClose: () => void;
  onChanged: () => void;
};

export function HomeSettingsDialog({ entries, onClose, onChanged }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((entry) => [entry.ip, entry.alias])),
  );
  const [savingIp, setSavingIp] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSaveAlias(ip: string): Promise<void> {
    setSavingIp(ip);
    setStatus(null);
    try {
      await updateIpAlias(ip, (drafts[ip] ?? '').trim());
      setStatus('Saved.');
      onChanged();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSavingIp(null);
    }
  }

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-settings-dialog-title"
      >
        <div className="confirmation-dialog-header">
          <h2 id="home-settings-dialog-title">Settings</h2>
          <button
            type="button"
            className="ghost-button confirmation-dialog-close"
            onClick={onClose}
            aria-label="Close settings dialog"
          >
            X
          </button>
        </div>
        <p className="confirmation-dialog-copy">
          <strong>Manage Visitor IP</strong>
          <br />
          幫來訪過的 IP 取別名，只影響顯示，不會改動資料夾名稱。
        </p>
        {entries.length === 0 ? (
          <p className="confirmation-dialog-copy">
            還沒有任何來訪 IP（有人 publish 之後就會出現）。
          </p>
        ) : (
          <div className="home-settings-ip-list">
            {entries.map((entry) => (
              <div key={entry.ip} className="home-settings-ip-row">
                <code className="home-settings-ip">{entry.ip}</code>
                <input
                  className="confirmation-dialog-input home-settings-alias-input"
                  aria-label={`Alias for ${entry.ip}`}
                  placeholder="別名"
                  disabled={savingIp !== null}
                  value={drafts[entry.ip] ?? ''}
                  onChange={(event) => {
                    setDrafts((current) => ({
                      ...current,
                      [entry.ip]: event.target.value,
                    }));
                    setStatus(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSaveAlias(entry.ip);
                    }
                  }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  disabled={
                    savingIp !== null ||
                    (drafts[entry.ip] ?? '').trim() === entry.alias
                  }
                  onClick={() => void handleSaveAlias(entry.ip)}
                >
                  {savingIp === entry.ip ? 'Saving...' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
        {status ? <p className="confirmation-dialog-copy">{status}</p> : null}
        <div className="confirmation-dialog-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
