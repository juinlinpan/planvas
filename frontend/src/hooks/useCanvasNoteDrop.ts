import { useCallback, type DragEvent as ReactDragEvent } from 'react';
import type { BoardItem, BoardItemPayload, ProjectNote } from './api';
import { createBoardItem } from './api';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';
import type { Point } from './segmentData';

export function resolveSidebarNoteDragFile(
  projectNotes: ProjectNote[],
  draggedProjectNoteFile: string | null,
  dataTransfer: Pick<DataTransfer, 'getData'>,
): string | null {
  const rawValue = dataTransfer.getData('text/plain');
  const prefix = 'notes:';
  if (rawValue.startsWith(prefix)) {
    const noteFile = rawValue.slice(prefix.length);
    if (projectNotes.some((note) => note.note_file === noteFile)) {
      return noteFile;
    }
  }

  return projectNotes.some((note) => note.note_file === draggedProjectNoteFile)
    ? draggedProjectNoteFile
    : null;
}

function createOptimisticId(): string {
  return `optimistic-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function createOptimisticItem(
  payload: BoardItemPayload,
  contentOverride?: string | null,
): BoardItem {
  const timestamp = new Date().toISOString();
  return {
    ...payload,
    id: createOptimisticId(),
    content: contentOverride !== undefined ? contentOverride : payload.content,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export type UseCanvasNoteDropParams = {
  pageId: string;
  projectNotes: ProjectNote[];
  draggedProjectNoteFile: string | null;
  items: BoardItem[];
  screenToWorld: (x: number, y: number) => Point;
  captureBoardSnapshot: () => any;
  pushUndoSnapshot: (snapshot: any) => void;
  setItemsAndSync: (updater: (current: BoardItem[]) => BoardItem[]) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  onProjectNotesChanged?: () => void;
};

export function useCanvasNoteDrop({
  pageId,
  projectNotes,
  draggedProjectNoteFile,
  items,
  screenToWorld,
  captureBoardSnapshot,
  pushUndoSnapshot,
  setItemsAndSync,
  setSelection,
  setEditingId,
  onProjectNotesChanged,
}: UseCanvasNoteDropParams) {
  const getSidebarNoteDragFile = useCallback(
    (event: ReactDragEvent) => {
      return resolveSidebarNoteDragFile(
        projectNotes,
        draggedProjectNoteFile,
        event.dataTransfer,
      );
    },
    [projectNotes, draggedProjectNoteFile],
  );

  const handleDragOver = useCallback(
    (event: ReactDragEvent) => {
      if (getSidebarNoteDragFile(event) !== null) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    [getSidebarNoteDragFile],
  );

  const handleDrop = useCallback(
    (event: ReactDragEvent) => {
      const noteFile = getSidebarNoteDragFile(event);
      if (noteFile === null) {
        return;
      }
      event.preventDefault();

      const note = projectNotes.find((entry) => entry.note_file === noteFile);
      if (note === undefined) {
        return;
      }

      const snapshotBeforeCreate = captureBoardSnapshot();
      const worldPoint = screenToWorld(event.clientX, event.clientY);
      const zIndexes = items.map((item) => item.z_index);
      const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;

      const payload: BoardItemPayload = {
        page_id: pageId,
        parent_item_id: null,
        category: ITEM_CATEGORY.small_item,
        type: ITEM_TYPE.note_paper,
        title: note.title,
        content: null,
        content_format: 'markdown',
        x: worldPoint.x,
        y: worldPoint.y,
        width: 264,
        height: 216,
        rotation: 0,
        z_index: maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json: JSON.stringify({
          noteFile: note.note_file,
          noteFileManaged: false,
        }),
      };
      const optimisticItem = createOptimisticItem(payload, note.content);

      setItemsAndSync((current) => [...current, optimisticItem]);
      setSelection([optimisticItem.id]);
      setEditingId(null);

      void createBoardItem(payload)
        .then((created) => {
          pushUndoSnapshot(snapshotBeforeCreate);
          setItemsAndSync((current) =>
            current.map((item) =>
              item.id === optimisticItem.id ? created : item,
            ),
          );
          setSelection([created.id]);
          onProjectNotesChanged?.();
        })
        .catch((err) => {
          setItemsAndSync((current) =>
            current.filter((item) => item.id !== optimisticItem.id),
          );
          setSelection([]);
          console.error('[Canvas] Failed to place project note', err);
        });
    },
    [
      getSidebarNoteDragFile,
      projectNotes,
      captureBoardSnapshot,
      screenToWorld,
      items,
      pageId,
      setItemsAndSync,
      setSelection,
      setEditingId,
      pushUndoSnapshot,
      onProjectNotesChanged,
    ],
  );

  return { handleDragOver, handleDrop };
}