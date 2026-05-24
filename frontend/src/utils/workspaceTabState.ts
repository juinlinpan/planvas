import { useCallback, useEffect, useState } from 'react';

import type { ProjectNote } from '../services/api';

export type WorkspaceTab =
  | { kind: 'page'; id: string }
  | { kind: 'note'; id: string };

export function getWorkspaceTabId(tab: WorkspaceTab): string {
  return `${tab.kind}:${tab.id}`;
}

export function reorderWorkspaceTabs(
  tabs: WorkspaceTab[],
  draggedTabId: string,
  targetTabId: string,
  position: 'before' | 'after',
): WorkspaceTab[] {
  const orderedIds = tabs.map(getWorkspaceTabId);
  const draggedIndex = orderedIds.indexOf(draggedTabId);
  const targetIndex = orderedIds.indexOf(targetTabId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return tabs;
  }

  const [movedId] = orderedIds.splice(draggedIndex, 1);
  if (movedId === undefined) {
    return tabs;
  }

  const insertionIndex = orderedIds.indexOf(targetTabId);
  if (insertionIndex === -1) {
    return tabs;
  }

  orderedIds.splice(position === 'after' ? insertionIndex + 1 : insertionIndex, 0, movedId);

  if (orderedIds.every((id, index) => id === getWorkspaceTabId(tabs[index]))) {
    return tabs;
  }

  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return [...tabs].sort((left, right) => {
    const leftPosition = positions.get(getWorkspaceTabId(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(getWorkspaceTabId(right)) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

export function useWorkspaceTabs({
  selectedPageId,
  setSelectedPageId,
}: {
  selectedPageId: string | null;
  setSelectedPageId: (pageId: string | null) => void;
}) {
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeNoteFile, setActiveNoteFile] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPageId === null) {
      return;
    }

    setOpenTabs((current) => {
      if (current.some((tab) => tab.kind === 'page' && tab.id === selectedPageId)) {
        return current;
      }
      return [...current, { kind: 'page', id: selectedPageId }];
    });
  }, [selectedPageId]);

  const activatePageTab = useCallback(
    (pageId: string) => {
      setSelectedPageId(pageId);
      setActiveNoteFile(null);
    },
    [setSelectedPageId],
  );

  const openNoteTab = useCallback((noteFile: string) => {
    setOpenTabs((current) => {
      if (current.some((tab) => tab.kind === 'note' && tab.id === noteFile)) {
        return current;
      }
      return [...current, { kind: 'note', id: noteFile }];
    });
    setActiveNoteFile(noteFile);
  }, []);

  const closeNoteTab = useCallback((noteFile: string) => {
    setOpenTabs((current) =>
      current.filter((tab) => !(tab.kind === 'note' && tab.id === noteFile)),
    );
    setActiveNoteFile((current) => (current === noteFile ? null : current));
  }, []);

  const handleNoteRenamedInTabs = useCallback(
    (previousNoteFile: string, renamedNote: ProjectNote) => {
      const nextNoteFile = renamedNote.note_file;
      setOpenTabs((current) =>
        current.map((tab) =>
          tab.kind === 'note' && tab.id === previousNoteFile
            ? { ...tab, id: nextNoteFile }
            : tab,
        ),
      );
      setActiveNoteFile((current) =>
        current === previousNoteFile ? nextNoteFile : current,
      );
    },
    [],
  );

  const closePageTab = useCallback(
    (pageId: string) => {
      setOpenTabs((current) => {
        const nextTabs = current.filter(
          (tab) => !(tab.kind === 'page' && tab.id === pageId),
        );

        if (selectedPageId === pageId) {
          const fallbackPage = [...nextTabs]
            .reverse()
            .find((tab) => tab.kind === 'page');
          setSelectedPageId(fallbackPage?.id ?? null);
          setActiveNoteFile(null);
        }

        return nextTabs;
      });
    },
    [selectedPageId, setSelectedPageId],
  );

  return {
    activeNoteFile,
    activatePageTab,
    closeNoteTab,
    closePageTab,
    handleNoteRenamedInTabs,
    openNoteTab,
    openTabs,
    setActiveNoteFile,
    setOpenTabs,
  };
}
