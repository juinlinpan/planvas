import type { DragEvent as ReactDragEvent } from 'react';

import type { Page, ProjectNote } from './api';
import { getInlineDropPosition, type DropPosition } from './dragDrop';
import {
  getWorkspaceTabId,
  reorderWorkspaceTabs,
  type WorkspaceTab,
} from './workspaceTabState';

type TabDragState = {
  kind: 'tabs';
  itemId: string;
} | null;

type TabDropState = {
  kind: 'tabs';
  itemId: string;
  position: DropPosition;
} | null;

type WorkspaceTabsProps = {
  activeNoteFile: string | null;
  dragState: TabDragState;
  dropState: TabDropState;
  isMutating: boolean;
  onActivateNote: (noteFile: string) => void;
  onActivatePage: (pageId: string) => void;
  onClearDragState: () => void;
  onCloseNote: (noteFile: string) => void;
  onClosePage: (pageId: string) => void;
  onSetDragState: (state: Exclude<TabDragState, null>) => void;
  onSetDropState: (state: Exclude<TabDropState, null>) => void;
  onSetOpenTabs: (
    updater: (current: WorkspaceTab[]) => WorkspaceTab[],
  ) => void;
  openTabs: WorkspaceTab[];
  pages: Page[];
  projectName: string;
  projectNotes: ProjectNote[];
  selectedPageId: string | null;
};

function getTabDropPosition(event: ReactDragEvent<HTMLElement>): DropPosition {
  return getInlineDropPosition(
    event.clientX,
    event.currentTarget.getBoundingClientRect(),
  );
}

export function WorkspaceTabs({
  activeNoteFile,
  dragState,
  dropState,
  isMutating,
  onActivateNote,
  onActivatePage,
  onClearDragState,
  onCloseNote,
  onClosePage,
  onSetDragState,
  onSetDropState,
  onSetOpenTabs,
  openTabs,
  pages,
  projectName,
  projectNotes,
  selectedPageId,
}: WorkspaceTabsProps) {
  const visibleTabs = openTabs.filter((tab) => {
    if (tab.kind === 'page') {
      return pages.some((page) => page.id === tab.id);
    }
    return projectNotes.some((note) => note.note_file === tab.id);
  });
  const lastVisibleTab = visibleTabs.at(-1);
  const lastVisibleTabId =
    lastVisibleTab === undefined ? null : getWorkspaceTabId(lastVisibleTab);

  function reorderTabs(
    draggedTabId: string,
    targetTabId: string,
    position: DropPosition,
  ): void {
    onSetOpenTabs((current) =>
      reorderWorkspaceTabs(current, draggedTabId, targetTabId, position),
    );
  }

  return (
    <div className="ws-tab-bar ws-tab-bar-bottom">
      <span
        className="ws-tab-project-name"
        title={projectName}
        aria-label={`Project: ${projectName}`}
      >
        <span className="ws-tab-project-value">{projectName}</span>
      </span>

      <div className="ws-tab-divider-v" />

      <div
        className="ws-tab-strip"
        onDragOver={(event) => {
          const currentDragState = dragState;
          if (
            currentDragState?.kind !== 'tabs' ||
            lastVisibleTabId === null ||
            currentDragState.itemId === lastVisibleTabId
          ) {
            return;
          }

          const target = event.target;
          if (target instanceof Element && target.closest('.ws-tab') !== null) {
            return;
          }

          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          onSetDropState({
            kind: 'tabs',
            itemId: lastVisibleTabId,
            position: 'after',
          });
        }}
        onDrop={(event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('.ws-tab') !== null) {
            return;
          }

          event.preventDefault();
          const currentDragState = dragState;
          if (
            currentDragState?.kind !== 'tabs' ||
            lastVisibleTabId === null
          ) {
            onClearDragState();
            return;
          }

          const draggedId = currentDragState.itemId;
          onClearDragState();

          if (draggedId === lastVisibleTabId) {
            return;
          }

          reorderTabs(draggedId, lastVisibleTabId, 'after');
        }}
      >
        {visibleTabs.map((tab) => {
          const tabId = getWorkspaceTabId(tab);
          const isActive =
            tab.kind === 'page'
              ? selectedPageId === tab.id && activeNoteFile === null
              : activeNoteFile === tab.id;
          const label =
            tab.kind === 'page'
              ? (pages.find((page) => page.id === tab.id)?.name ?? 'Unknown')
              : (projectNotes.find((note) => note.note_file === tab.id)
                  ?.title ?? tab.id);
          const isDraggingTab =
            dragState?.kind === 'tabs' && dragState.itemId === tabId;
          const isDropBefore =
            dropState?.kind === 'tabs' &&
            dropState.itemId === tabId &&
            dropState.position === 'before';
          const isDropAfter =
            dropState?.kind === 'tabs' &&
            dropState.itemId === tabId &&
            dropState.position === 'after';

          return (
            <div
              key={tabId}
              className={`ws-tab ws-tab-${tab.kind} ${isActive ? 'is-active' : ''} ${
                isDraggingTab ? 'is-dragging' : ''
              } ${isDropBefore ? 'is-drop-before' : ''} ${
                isDropAfter ? 'is-drop-after' : ''
              }`}
              draggable={!isMutating}
              onDragStart={(event) => {
                if (isMutating) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', `tabs:${tabId}`);
                onSetDragState({
                  kind: 'tabs',
                  itemId: tabId,
                });
              }}
              onDragOver={(event) => {
                const currentDragState = dragState;
                if (currentDragState?.kind !== 'tabs') return;
                if (currentDragState.itemId === tabId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                onSetDropState({
                  kind: 'tabs',
                  itemId: tabId,
                  position: getTabDropPosition(event),
                });
              }}
              onDrop={(event) => {
                event.preventDefault();
                const currentDragState = dragState;
                if (currentDragState?.kind !== 'tabs') {
                  onClearDragState();
                  return;
                }
                const draggedId = currentDragState.itemId;
                const position = getTabDropPosition(event);
                onClearDragState();

                if (draggedId === tabId) {
                  return;
                }

                reorderTabs(draggedId, tabId, position);
              }}
              onDragEnd={onClearDragState}
            >
              <button
                type="button"
                className="ws-tab-label-btn"
                title={label}
                onClick={() => {
                  if (tab.kind === 'page') {
                    onActivatePage(tab.id);
                  } else {
                    onActivateNote(tab.id);
                  }
                }}
              >
                {tab.kind === 'note' && (
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="ws-tab-note-icon"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
                <span className="ws-tab-label">{label}</span>
              </button>
              <button
                type="button"
                className="ws-tab-close"
                title={`Close tab: ${label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (tab.kind === 'page') {
                    onClosePage(tab.id);
                  } else {
                    onCloseNote(tab.id);
                  }
                }}
                aria-label={`Close tab ${label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
