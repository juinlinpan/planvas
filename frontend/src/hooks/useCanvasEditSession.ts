import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BoardItem } from '../services/api';
import type { EditSessionState } from '../types/canvas';
import { isInlineEditable } from '../canvasHelpers/core';

export function useCanvasEditSession() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editSessionRef = useRef<EditSessionState | null>(null);

  const handleStartEdit = useCallback((itemId: string) => {
    setEditingId(itemId);
  }, []);

  const handleCommitEdit = useCallback((itemId: string) => {
    if (editSessionRef.current?.itemId === itemId) {
      editSessionRef.current = null;
    }
    setEditingId((current) => (current === itemId ? null : current));
  }, []);

  const handleCancelEdit = useCallback(() => {
    editSessionRef.current = null;
    setEditingId(null);
  }, []);

  const handleDoubleClickForEdit = useCallback(
    (item: BoardItem): boolean => {
      if (isInlineEditable(item)) {
        handleStartEdit(item.id);
        return true;
      }
      return false;
    },
    [handleStartEdit],
  );

  return {
    editingId,
    setEditingId,
    editSessionRef,
    handleStartEdit,
    handleCommitEdit,
    handleCancelEdit,
    handleDoubleClickForEdit,
  };
}
