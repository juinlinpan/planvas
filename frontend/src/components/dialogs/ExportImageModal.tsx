import { useState } from 'react';

export type ExportImageFormat = 'png';

export type ExportImageOptions = {
  format: ExportImageFormat;
  scale: number;
};

type Props = {
  naturalWidth: number;
  naturalHeight: number;
  onConfirm: (options: ExportImageOptions) => void;
  onCancel: () => void;
  isBusy: boolean;
};

const SCALE_PRESETS = [
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '3x', value: 3 },
] as const;

const DEFAULT_SCALE = 2;

export function ExportImageModal({
  naturalWidth,
  naturalHeight,
  onConfirm,
  onCancel,
  isBusy,
}: Props) {
  const [presetScale, setPresetScale] = useState<number>(DEFAULT_SCALE);
  const [isCustom, setIsCustom] = useState(false);
  const [customScaleStr, setCustomScaleStr] = useState('');

  const effectiveScale = isCustom
    ? Math.max(0.1, parseFloat(customScaleStr) || 1)
    : presetScale;

  const outputWidth = Math.round(naturalWidth * effectiveScale);
  const outputHeight = Math.round(naturalHeight * effectiveScale);

  const isScaleValid =
    !isCustom || (parseFloat(customScaleStr) > 0 && customScaleStr.trim() !== '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isScaleValid) return;
    onConfirm({ format: 'png', scale: effectiveScale });
  }

  function selectPreset(value: number) {
    setIsCustom(false);
    setPresetScale(value);
  }

  function activateCustom() {
    setIsCustom(true);
    if (customScaleStr === '') {
      setCustomScaleStr(String(presetScale));
    }
  }

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        className="confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-image-dialog-title"
        onSubmit={handleSubmit}
        style={{ maxWidth: '400px', width: '90%' }}
      >
        <div className="confirmation-dialog-header">
          <h2 id="export-image-dialog-title">Export Image</h2>
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

        <div
          className="confirmation-dialog-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* Format */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-dialog-label">Format</span>
            <select
              className="confirmation-dialog-input"
              disabled
              style={{ width: '100%' }}
              value="png"
              onChange={() => {}}
            >
              <option value="png">PNG (.png)</option>
            </select>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-text-subtle, #888)',
              }}
            >
              More formats coming soon
            </span>
          </div>

          {/* Scale / Resolution */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span className="confirmation-dialog-label">
              Scale / Resolution
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {SCALE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`ghost-button${
                    !isCustom && presetScale === p.value
                      ? ' primary-action-button'
                      : ''
                  }`}
                  style={{ minWidth: '48px' }}
                  onClick={() => selectPreset(p.value)}
                  disabled={isBusy}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`ghost-button${isCustom ? ' primary-action-button' : ''}`}
                onClick={activateCustom}
                disabled={isBusy}
              >
                Custom
              </button>
              {isCustom && (
                <input
                  className="confirmation-dialog-input"
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={customScaleStr}
                  onChange={(e) => setCustomScaleStr(e.target.value)}
                  placeholder="e.g. 1.5"
                  style={{ width: '80px' }}
                  disabled={isBusy}
                  autoFocus
                />
              )}
            </div>
          </div>

          {/* Output size */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="confirmation-dialog-label">Output Size</span>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--color-text-default, #333)',
              }}
            >
              {outputWidth} × {outputHeight}{' '}
              <span style={{ color: 'var(--color-text-subtle, #888)' }}>
                px
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-subtle, #888)',
              }}
            >
              Base: {naturalWidth} × {naturalHeight} px
            </div>
          </div>
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
            disabled={isBusy || !isScaleValid}
          >
            {isBusy ? 'Exporting…' : 'Export PNG'}
          </button>
        </div>
      </form>
    </div>
  );
}
