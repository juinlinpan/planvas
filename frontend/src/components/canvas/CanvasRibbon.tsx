import { useEffect, useRef, useState } from 'react';
import {
  type CanvasBackgroundMode,
} from '../../utils/canvasBackground';
import { getDisplayZoom } from '../../utils/viewport';
import type { Viewport } from '../../types/index';

type UtilityMenuId = 'file' | 'edit' | null;

export type CanvasRibbonProps = {
  importExportDisabled: boolean;
  onImportPage: (format: 'mermaid') => void;
  onImportFromProject: () => void;
  onExportPage: (format: 'png' | 'pptx' | 'mermaid' | 'html') => void;
  canUndo: boolean;
  canRedo: boolean;
  isHistorySyncing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  magnetEnabled: boolean;
  onToggleMagnet: () => void;
  autosaveEnabled: boolean;
  onToggleAutosave: () => void;
  saveStatus: 'saved' | 'unsaved' | 'saving';
  onSaveManual: () => void;
  isRegulatingPage: boolean;
  onRegulatePage: () => void;
  viewport: Viewport;
  resetZoomTarget: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onResetZoomAdjust: (direction: -1 | 1) => void;
  backgroundMode: CanvasBackgroundMode;
  onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
};

/**
 * Top canvas ribbon bar containing File/Edit menus, magnet, zoom, and
 * background controls. Manages its own dropdown-open state internally.
 * Extracted from Canvas.tsx.
 */
export function CanvasRibbon({
  importExportDisabled,
  onImportPage,
  onImportFromProject,
  onExportPage,
  canUndo,
  canRedo,
  isHistorySyncing,
  onUndo,
  onRedo,
  magnetEnabled,
  onToggleMagnet,
  autosaveEnabled,
  onToggleAutosave,
  saveStatus,
  onSaveManual,
  isRegulatingPage,
  onRegulatePage,
  viewport,
  resetZoomTarget,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onResetZoomAdjust,
  backgroundMode,
  onBackgroundModeChange,
}: CanvasRibbonProps) {
  const [utilityMenuOpen, setUtilityMenuOpen] = useState<UtilityMenuId>(null);
  const [isExportSubmenuOpen, setIsExportSubmenuOpen] = useState(false);
  const [isImportSubmenuOpen, setIsImportSubmenuOpen] = useState(false);
  const [isResetZoomPanelOpen, setIsResetZoomPanelOpen] = useState(false);

  const utilityMenuRef = useRef<HTMLDivElement>(null);
  const resetZoomPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!utilityMenuRef.current?.contains(event.target as Node)) {
        setUtilityMenuOpen(null);
        setIsExportSubmenuOpen(false);
        setIsImportSubmenuOpen(false);
      }
      if (!resetZoomPanelRef.current?.contains(event.target as Node)) {
        setIsResetZoomPanelOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setUtilityMenuOpen(null);
        setIsExportSubmenuOpen(false);
        setIsImportSubmenuOpen(false);
        setIsResetZoomPanelOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function toggleUtilityMenu(targetMenu: Exclude<UtilityMenuId, null>) {
    setIsExportSubmenuOpen(false);
    setUtilityMenuOpen((current) =>
      current === targetMenu ? null : targetMenu,
    );
  }

  return (
    <div className="canvas-ribbon" ref={utilityMenuRef}>
      <div className="canvas-ribbon-bar">
        {/* File menu */}
        <div className="canvas-rbn-menu-wrap" aria-label="File">
          <button
            type="button"
            className={`canvas-rbn-menu-btn ${utilityMenuOpen === 'file' ? 'is-active' : ''}`}
            aria-label="File menu"
            aria-expanded={utilityMenuOpen === 'file'}
            onClick={() => toggleUtilityMenu('file')}
          >
            檔案
          </button>
          {utilityMenuOpen === 'file' ? (
            <div
              className="toolbar-dropdown-panel"
              role="menu"
              aria-label="File menu"
            >
              <button
                type="button"
                className="toolbar-dropdown-item"
                role="menuitem"
                disabled={saveStatus === 'saving'}
                onClick={() => {
                  onSaveManual();
                  setUtilityMenuOpen(null);
                }}
              >
                <span>儲存 (Ctrl+S)</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.7rem',
                    color: saveStatus === 'unsaved' ? '#d97706' : '#94a3b8',
                    fontWeight: saveStatus === 'unsaved' ? 'bold' : 'normal',
                  }}
                >
                  {saveStatus === 'saving'
                    ? '儲存中...'
                    : saveStatus === 'unsaved'
                      ? '未儲存'
                      : '已儲存'}
                </span>
              </button>
              <div className="toolbar-dropdown-divider" />

              <div
                className="toolbar-dropdown-item-submenu"
                onMouseEnter={() => {
                  if (!importExportDisabled) {
                    setIsImportSubmenuOpen(true);
                  }
                }}
                onMouseLeave={() => setIsImportSubmenuOpen(false)}
              >
                <button
                  type="button"
                  className="toolbar-dropdown-item toolbar-dropdown-item-submenu-trigger"
                  role="menuitem"
                  disabled={importExportDisabled}
                  aria-haspopup="menu"
                  aria-expanded={isImportSubmenuOpen}
                  onFocus={() => {
                    if (!importExportDisabled) {
                      setIsImportSubmenuOpen(true);
                    }
                  }}
                  onClick={() => {
                    if (!importExportDisabled) {
                      setIsImportSubmenuOpen((current) => !current);
                    }
                  }}
                >
                  <span>Import</span>
                  <span className="toolbar-submenu-chevron">&gt;</span>
                </button>
                {isImportSubmenuOpen ? (
                  <div
                    className="toolbar-submenu-panel"
                    role="menu"
                    aria-label="Import formats"
                  >
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onImportPage('mermaid');
                        setUtilityMenuOpen(null);
                        setIsImportSubmenuOpen(false);
                      }}
                    >
                      Mermaid (.md)
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        onImportFromProject();
                        setUtilityMenuOpen(null);
                        setIsImportSubmenuOpen(false);
                      }}
                    >
                      從其他 Project…
                    </button>
                  </div>
                ) : null}
              </div>
              <div
                className="toolbar-dropdown-item-submenu"
                onMouseEnter={() => {
                  if (!importExportDisabled) {
                    setIsExportSubmenuOpen(true);
                  }
                }}
                onMouseLeave={() => setIsExportSubmenuOpen(false)}
              >
                <button
                  type="button"
                  className="toolbar-dropdown-item toolbar-dropdown-item-submenu-trigger"
                  role="menuitem"
                  disabled={importExportDisabled}
                  aria-haspopup="menu"
                  aria-expanded={isExportSubmenuOpen}
                  onFocus={() => {
                    if (!importExportDisabled) {
                      setIsExportSubmenuOpen(true);
                    }
                  }}
                  onClick={() => {
                    if (!importExportDisabled) {
                      setIsExportSubmenuOpen((current) => !current);
                    }
                  }}
                >
                  <span>Export</span>
                  <span className="toolbar-submenu-chevron">&gt;</span>
                </button>
                {isExportSubmenuOpen ? (
                  <div
                    className="toolbar-submenu-panel"
                    role="menu"
                    aria-label="Export formats"
                  >
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('png');
                        setUtilityMenuOpen(null);
                        setIsExportSubmenuOpen(false);
                      }}
                    >
                      Image…
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('pptx');
                        setUtilityMenuOpen(null);
                        setIsExportSubmenuOpen(false);
                      }}
                    >
                      PPTX (.pptx)
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('mermaid');
                        setUtilityMenuOpen(null);
                        setIsExportSubmenuOpen(false);
                      }}
                    >
                      Markdown (.md)
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('html');
                        setUtilityMenuOpen(null);
                        setIsExportSubmenuOpen(false);
                      }}
                    >
                      HTML (.html)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Edit menu */}
        <div className="canvas-rbn-menu-wrap" aria-label="Edit">
          <button
            type="button"
            className={`canvas-rbn-menu-btn ${utilityMenuOpen === 'edit' ? 'is-active' : ''}`}
            aria-label="Edit menu"
            aria-expanded={utilityMenuOpen === 'edit'}
            onClick={() => toggleUtilityMenu('edit')}
          >
            編輯
          </button>
          {utilityMenuOpen === 'edit' ? (
            <div
              className="toolbar-dropdown-panel"
              role="menu"
              aria-label="Edit menu"
            >
              <button
                type="button"
                className="toolbar-dropdown-item"
                title="Undo (Ctrl/Cmd + Z)"
                role="menuitem"
                disabled={!canUndo || isHistorySyncing}
                onClick={() => {
                  onUndo();
                  setUtilityMenuOpen(null);
                }}
              >
                Undo
              </button>
              <button
                type="button"
                className="toolbar-dropdown-item"
                title="Redo (Ctrl/Cmd + Shift + Z)"
                role="menuitem"
                disabled={!canRedo || isHistorySyncing}
                onClick={() => {
                  onRedo();
                  setUtilityMenuOpen(null);
                }}
              >
                Redo
              </button>
            </div>
          ) : null}
        </div>

        {/* Spacer pushes view controls to the right */}
        <div className="canvas-rbn-grow" aria-hidden="true" />

        {/* Magnet toggle */}
        <button
          type="button"
          className={`canvas-rbn-ctrl-btn ${magnetEnabled ? 'is-active' : ''}`}
          aria-pressed={magnetEnabled}
          title={
            'Magnet ' +
            (magnetEnabled ? 'on' : 'off') +
            '; hold Alt to bypass'
          }
          onClick={onToggleMagnet}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 15A6 6 0 0 0 18 15" />
            <path d="M6 15V6h12v9" />
            <line x1="6" y1="3" x2="6" y2="6" />
            <line x1="18" y1="3" x2="18" y2="6" />
          </svg>
          <span>磁鐵</span>
        </button>

        {/* Autosave toggle button */}
        <button
          type="button"
          className={`canvas-rbn-ctrl-btn ${autosaveEnabled ? 'is-active' : ''}`}
          aria-pressed={autosaveEnabled}
          title={'Auto-save: ' + (autosaveEnabled ? 'on' : 'off')}
          onClick={onToggleAutosave}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2v8" />
            <path d="m17 5-5-5-5 5" />
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
          <span>自動儲存</span>
        </button>



        <button
          type="button"
          className={`canvas-rbn-ctrl-btn ${isRegulatingPage ? 'is-active' : ''}`}
          title="Regulate Page XML"
          aria-label="Regulate Page XML"
          disabled={isRegulatingPage}
          onClick={onRegulatePage}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 0 1-15 6.7" />
            <path d="M3 12a9 9 0 0 1 15-6.7" />
            <path d="M18 3v5h-5" />
            <path d="M6 21v-5h5" />
          </svg>
        </button>

        <div className="canvas-rbn-sep" aria-hidden="true" />

        {/* Zoom controls */}
        <div className="canvas-rbn-zoom" aria-label="Zoom controls">
          <button
            type="button"
            className="canvas-rbn-zoom-btn"
            title="Zoom out"
            onClick={onZoomOut}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="1" y="4.25" width="8" height="1.5" rx="0.75" />
            </svg>
          </button>
          <div className="canvas-rbn-zoom-display" aria-live="polite">
            {getDisplayZoom(viewport.zoom).toFixed(1)}x
          </div>
          <button
            type="button"
            className="canvas-rbn-zoom-btn"
            title="Zoom in"
            onClick={onZoomIn}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="currentColor"
              aria-hidden="true"
            >
              <rect x="4.25" y="1" width="1.5" height="8" rx="0.75" />
              <rect x="1" y="4.25" width="8" height="1.5" rx="0.75" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="canvas-rbn-ctrl-btn"
          title={'Reset zoom to ' + resetZoomTarget.toFixed(1) + 'x'}
          onClick={onResetZoom}
        >
          {resetZoomTarget.toFixed(1)}x
        </button>
        <div className="canvas-rbn-reset-zoom-wrap" ref={resetZoomPanelRef}>
          <button
            type="button"
            className="canvas-rbn-ctrl-btn canvas-rbn-ctrl-muted"
            title="Adjust reset zoom target"
            aria-haspopup="dialog"
            aria-expanded={isResetZoomPanelOpen}
            onClick={() =>
              setIsResetZoomPanelOpen((currentOpen) => !currentOpen)
            }
          >
            Adjust
          </button>
          {isResetZoomPanelOpen ? (
            <div
              className="canvas-rbn-reset-zoom-panel"
              role="dialog"
              aria-label="Adjust reset zoom"
            >
              <button
                type="button"
                className="canvas-rbn-reset-zoom-step"
                title="Decrease reset zoom target"
                onClick={() => onResetZoomAdjust(-1)}
              >
                −
              </button>
              <div className="canvas-rbn-reset-zoom-value">
                {resetZoomTarget.toFixed(1)}x
              </div>
              <button
                type="button"
                className="canvas-rbn-reset-zoom-step"
                title="Increase reset zoom target"
                onClick={() => onResetZoomAdjust(1)}
              >
                +
              </button>
            </div>
          ) : null}
        </div>

        <div className="canvas-rbn-sep" aria-hidden="true" />

        {/* Background picker */}
        <div
          className="canvas-rbn-bg-picker"
          role="group"
          aria-label="Background style"
        >
          {(
            [
              ['dots', '點狀'],
              ['grid', '格線'],
            ] as const satisfies readonly [CanvasBackgroundMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`canvas-rbn-bg-btn ${backgroundMode === mode ? 'is-active' : ''}`}
              aria-pressed={backgroundMode === mode}
              onClick={() => onBackgroundModeChange(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
