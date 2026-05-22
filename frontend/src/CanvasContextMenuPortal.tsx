import { createPortal } from 'react-dom';
import {
  isCanvasContextMenuActionDisabled,
  type CanvasContextMenuActionKey,
  type CanvasContextMenuState,
} from './canvasContextMenu';

const CONTEXT_MENU_LABELS: Record<CanvasContextMenuActionKey, string> = {
  cut: '剪下',
  copy: '複製',
  paste: '貼上',
  delete: '刪除',
  bringForward: '移上一層',
  sendBackward: '移下一層',
  bringToFront: '移到最頂',
  sendToBack: '移到最底',
  transformToNote: '轉換為筆記 (Note)',
};

const CONTEXT_MENU_SHORTCUTS: Record<CanvasContextMenuActionKey, string> = {
  cut: 'Ctrl/Cmd+X',
  copy: 'Ctrl/Cmd+C',
  paste: 'Ctrl/Cmd+V',
  delete: 'Delete',
  bringForward: '',
  sendBackward: '',
  bringToFront: '',
  sendToBack: '',
  transformToNote: '',
};

type Props = {
  contextMenu: CanvasContextMenuState | null;
  contextMenuPosition: { left: number; top: number } | null;
  contextMenuActions: CanvasContextMenuActionKey[];
  contextMenuActionHandlers: Record<CanvasContextMenuActionKey, () => void>;
};

/**
 * Renders the canvas right-click context menu as a portal to document.body.
 * Extracted from Canvas.tsx to separate the portal rendering concern.
 */
export function CanvasContextMenuPortal({
  contextMenu,
  contextMenuPosition,
  contextMenuActions,
  contextMenuActionHandlers,
}: Props) {
  if (
    contextMenu === null ||
    contextMenuPosition === null ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  return createPortal(
    <div
      className="canvas-context-menu"
      style={{
        left: contextMenuPosition.left,
        top: contextMenuPosition.top,
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {contextMenuActions.map((action) => (
        <button
          key={action}
          type="button"
          className={`canvas-context-menu-item ${
            action === 'delete' ? 'danger' : ''
          }`}
          onClick={contextMenuActionHandlers[action]}
          disabled={isCanvasContextMenuActionDisabled(contextMenu, action)}
        >
          <span>{CONTEXT_MENU_LABELS[action]}</span>
          <span className="canvas-context-menu-shortcut">
            {CONTEXT_MENU_SHORTCUTS[action]}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
