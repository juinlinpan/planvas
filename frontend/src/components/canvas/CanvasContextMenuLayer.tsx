import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  getCanvasContextMenuActionKeys,
  getCanvasContextMenuPosition,
  isCanvasContextMenuActionDisabled,
  type CanvasContextMenuActionKey,
  type CanvasContextMenuState,
} from '../../canvasHelpers/canvasContextMenu';

const CONTEXT_MENU_LABELS: Record<CanvasContextMenuActionKey, string> = {
  cut: '剪下',
  copy: '複製',
  paste: '貼上',
  delete: '刪除',
  bringForward: '上移一層',
  sendBackward: '下移一層',
  bringToFront: '移到最上層',
  sendToBack: '移到最下層',
  transformToNote: '轉成 Note',
  distributeTableRows: '平均分配高',
  distributeTableCols: '平均分配寬',
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
  distributeTableRows: '',
  distributeTableCols: '',
};

type Props = {
  contextMenu: CanvasContextMenuState | null;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onTransformToNote: () => void;
  onDistributeTableRows: () => void;
  onDistributeTableCols: () => void;
};

export function CanvasContextMenuLayer({
  contextMenu,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onTransformToNote,
  onDistributeTableRows,
  onDistributeTableCols,
}: Props) {
  const contextMenuActions = useMemo(
    () =>
      contextMenu === null ? [] : getCanvasContextMenuActionKeys(contextMenu),
    [contextMenu],
  );

  const contextMenuPosition = useMemo(() => {
    if (contextMenu === null) {
      return null;
    }

    const viewportWidth =
      typeof window === 'undefined'
        ? contextMenu.clientX + 232
        : window.innerWidth;
    const viewportHeight =
      typeof window === 'undefined'
        ? contextMenu.clientY + 188
        : window.innerHeight;

    return getCanvasContextMenuPosition(
      contextMenu,
      viewportWidth,
      viewportHeight,
    );
  }, [contextMenu]);

  const contextMenuActionHandlers = useMemo<
    Record<CanvasContextMenuActionKey, () => void>
  >(
    () => ({
      cut: onCut,
      copy: onCopy,
      paste: onPaste,
      delete: onDelete,
      bringForward: onBringForward,
      sendBackward: onSendBackward,
      bringToFront: onBringToFront,
      sendToBack: onSendToBack,
      transformToNote: onTransformToNote,
      distributeTableRows: onDistributeTableRows,
      distributeTableCols: onDistributeTableCols,
    }),
    [
      onBringForward,
      onBringToFront,
      onCopy,
      onCut,
      onDelete,
      onDistributeTableCols,
      onDistributeTableRows,
      onPaste,
      onSendBackward,
      onSendToBack,
      onTransformToNote,
    ],
  );

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
