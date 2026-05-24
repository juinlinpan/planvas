import { useCallback } from 'react';
import type { CanvasContextMenuState } from '../canvasHelpers/canvasContextMenu';

type UseCanvasContextMenuActionsParams = {
  setContextMenu: (state: CanvasContextMenuState | null) => void;
  hasClipboardData: () => boolean;
  selectedIdsRef: { current: string[] };
  handlePasteSelection: () => void;
  handleCopySelection: () => void;
  handleCutSelection: () => void;
  handleDeleteSelectedTableCells: () => Promise<boolean>;
  handleDeleteSelection: () => void;
  getPrimarySelectionId: (ids: string[]) => string | null;
  handleTransformToNote: (itemId: string) => void;
  handleLayerChange: (
    change: 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack',
  ) => void;
};

export function useCanvasContextMenuActions({
  setContextMenu,
  hasClipboardData,
  selectedIdsRef,
  handlePasteSelection,
  handleCopySelection,
  handleCutSelection,
  handleDeleteSelectedTableCells,
  handleDeleteSelection,
  getPrimarySelectionId,
  handleTransformToNote,
  handleLayerChange,
}: UseCanvasContextMenuActionsParams) {
  const handleContextMenuPaste = useCallback(() => {
    if (!hasClipboardData()) {
      return;
    }
    setContextMenu(null);
    void handlePasteSelection();
  }, [handlePasteSelection, hasClipboardData, setContextMenu]);

  const handleContextMenuCopy = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    handleCopySelection();
    setContextMenu(null);
  }, [handleCopySelection, selectedIdsRef, setContextMenu]);

  const handleContextMenuCut = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    setContextMenu(null);
    void handleCutSelection();
  }, [handleCutSelection, selectedIdsRef, setContextMenu]);

  const handleContextMenuDelete = useCallback(() => {
    if (selectedIdsRef.current.length === 0) {
      return;
    }
    setContextMenu(null);
    void handleDeleteSelectedTableCells()
      .then((deletedTableCells) => {
        if (!deletedTableCells) {
          void handleDeleteSelection();
        }
      })
      .catch((err) => {
        console.error('[Canvas] Failed to handle context delete', err);
      });
  }, [
    handleDeleteSelectedTableCells,
    handleDeleteSelection,
    selectedIdsRef,
    setContextMenu,
  ]);

  const handleContextMenuTransformToNote = useCallback(() => {
    const targetId = getPrimarySelectionId(selectedIdsRef.current);
    if (targetId === null) {
      return;
    }
    setContextMenu(null);
    void handleTransformToNote(targetId);
  }, [getPrimarySelectionId, handleTransformToNote, selectedIdsRef, setContextMenu]);

  const handleContextMenuBringForward = useCallback(() => {
    handleLayerChange('bringForward');
    setContextMenu(null);
  }, [handleLayerChange, setContextMenu]);

  const handleContextMenuSendBackward = useCallback(() => {
    handleLayerChange('sendBackward');
    setContextMenu(null);
  }, [handleLayerChange, setContextMenu]);

  const handleContextMenuBringToFront = useCallback(() => {
    handleLayerChange('bringToFront');
    setContextMenu(null);
  }, [handleLayerChange, setContextMenu]);

  const handleContextMenuSendToBack = useCallback(() => {
    handleLayerChange('sendToBack');
    setContextMenu(null);
  }, [handleLayerChange, setContextMenu]);

  return {
    handleContextMenuPaste,
    handleContextMenuCopy,
    handleContextMenuCut,
    handleContextMenuDelete,
    handleContextMenuTransformToNote,
    handleContextMenuBringForward,
    handleContextMenuSendBackward,
    handleContextMenuBringToFront,
    handleContextMenuSendToBack,
  };
}