import {
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  type Page,
  type Project,
  type ProjectNote,
} from '../services/api';
import type { WorkspaceTab } from '../utils/workspaceTabState';
import type { DropPosition } from '../utils/dragDrop';
import {
  IconChevronDown,
  IconPencil,
  IconRefresh,
  IconSettings,
  IconTrash,
} from './AppIcons';

export type SidebarListKind = 'pages' | 'notes';
export type SidebarDragState =
  | {
      kind: SidebarListKind;
      itemId: string;
    }
  | {
      kind: 'tabs';
      itemId: string;
    };
export type SidebarDropState = SidebarDragState & {
  position: DropPosition;
};

type SidebarSectionId = 'pages' | 'notes';

export interface WorkspaceSidebarProps {
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (value: boolean | ((curr: boolean) => boolean)) => void;
  selectedProject: Project | null;
  selectedPageId: string | null;
  activeNoteFile: string | null;
  isMutating: boolean;
  isLoadingPages: boolean;
  isLoadingNotes: boolean;
  pages: Page[];
  projectNotes: ProjectNote[];
  hasProjectNoteUpdates: boolean;
  openTabs: WorkspaceTab[];
  dragState: SidebarDragState | null;
  dropState: SidebarDropState | null;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onRefreshPages: () => void;
  onRefreshNotes: () => void;
  onActivatePageTab: (pageId: string) => void;
  onSavePageName: (page: Page | null, nextName: string) => Promise<void>;
  onDeletePage: (page: Page) => Promise<void>;
  onCreatePage: () => Promise<void>;
  onOpenNoteTab: (noteFile: string) => void;
  onDeleteNote: (noteFile: string) => Promise<void>;
  onDragStart: (kind: SidebarListKind, itemId: string, event: ReactDragEvent<HTMLButtonElement>) => void;
  onDragOver: (kind: SidebarListKind, targetId: string, event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (kind: SidebarListKind, targetId: string, event: ReactDragEvent<HTMLElement>) => void;
  onClearDragState: () => void;
}

export function WorkspaceSidebar({
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  selectedProject,
  selectedPageId,
  activeNoteFile,
  isMutating,
  isLoadingPages,
  isLoadingNotes,
  pages,
  projectNotes,
  hasProjectNoteUpdates,
  openTabs,
  dragState,
  dropState,
  onGoHome,
  onOpenSettings,
  onRefreshPages,
  onRefreshNotes,
  onActivatePageTab,
  onSavePageName,
  onDeletePage,
  onCreatePage,
  onOpenNoteTab,
  onDeleteNote,
  onDragStart,
  onDragOver,
  onDrop,
  onClearDragState,
}: WorkspaceSidebarProps) {
  const [expandedSidebarSections, setExpandedSidebarSections] = useState<
    Record<SidebarSectionId, boolean>
  >({
    pages: true,
    notes: true,
  });

  const [pageRenameTargetId, setPageRenameTargetId] = useState<string | null>(null);
  const [pageRenameDraft, setPageRenameDraft] = useState('');

  // Reset rename states when project changes
  useEffect(() => {
    setPageRenameTargetId(null);
    setPageRenameDraft('');
  }, [selectedProject?.id]);

  // Cancel renaming if rename target page is deleted or not found in list
  useEffect(() => {
    if (
      pageRenameTargetId !== null &&
      !pages.some((page) => page.id === pageRenameTargetId)
    ) {
      setPageRenameTargetId(null);
      setPageRenameDraft('');
    }
  }, [pageRenameTargetId, pages]);

  function toggleSidebarSection(sectionId: SidebarSectionId): void {
    setExpandedSidebarSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function beginPageRename(page: Page): void {
    if (isMutating) {
      return;
    }
    setPageRenameTargetId(page.id);
    setPageRenameDraft(page.name);
  }

  function cancelPageRename(): void {
    setPageRenameTargetId(null);
    setPageRenameDraft('');
  }

  async function handleLocalSavePageName(page: Page | null, nextName: string) {
    try {
      await onSavePageName(page, nextName);
    } finally {
      setPageRenameTargetId(null);
      setPageRenameDraft('');
    }
  }

  function handleLocalSidebarDragOver(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    onDragOver(kind, targetId, event);
  }

  function handleLocalSidebarDrop(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    onDrop(kind, targetId, event);
  }

  return (
    <aside className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
      <button
        type="button"
        className="ghost-button sidebar-edge-toggle"
        aria-label={
          isSidebarCollapsed ? 'Expand pages panel' : 'Collapse pages panel'
        }
        aria-expanded={!isSidebarCollapsed}
        onClick={() => setIsSidebarCollapsed((current) => !current)}
        title={
          isSidebarCollapsed ? 'Expand pages panel' : 'Collapse pages panel'
        }
      >
        {isSidebarCollapsed ? '>' : '<'}
      </button>
      <section className="sidebar-header">
        <div className="sidebar-brand-row">
          <div>
            <h1>Planvas</h1>
            <p className="sidebar-copy">
              {selectedProject !== null ? 'Local workspace' : 'Select a project'}
            </p>
          </div>
          <button
            className="ghost-button sidebar-home-button"
            aria-label="Home"
            disabled={isMutating}
            onClick={onGoHome}
            title="Home"
          >
            <span className="sidebar-home-button-label">Home</span>
          </button>
        </div>
        <div className="sidebar-project-strip">
          <div className="sidebar-project-strip-label">Project</div>
          <div className="sidebar-project-strip-row">
            <strong
              className="sidebar-project-strip-name"
              title={selectedProject?.name ?? 'No project selected'}
            >
              {selectedProject?.name ?? 'No project selected'}
            </strong>
            <button
              type="button"
              className="ghost-button sidebar-project-settings-button"
              disabled={selectedProject === null || isMutating}
              aria-label={
                selectedProject !== null
                  ? `Open settings for ${selectedProject.name}`
                  : 'Project settings unavailable'
              }
              title={
                selectedProject !== null
                  ? `Project settings for ${selectedProject.name}`
                  : 'Project settings unavailable'
              }
              onClick={onOpenSettings}
            >
              <IconSettings />
            </button>
          </div>
        </div>
      </section>
      <section
        className={`sidebar-section sidebar-foldout-section ${
          expandedSidebarSections.pages ? 'is-expanded' : 'is-collapsed'
        }`}
      >
        <div className="section-title-row">
          <button
            type="button"
            className="sidebar-foldout-trigger"
            aria-expanded={expandedSidebarSections.pages}
            onClick={() => toggleSidebarSection('pages')}
          >
            <span className="sidebar-foldout-title">
              <span className="sidebar-pages-heading">Pages</span>
              <IconChevronDown />
            </span>
          </button>
          <div className="sidebar-section-actions">
            <button
              type="button"
              className="ghost-button sidebar-section-refresh"
              disabled={isMutating || isLoadingPages}
              title="Refresh pages"
              onClick={(e) => {
                e.stopPropagation();
                onRefreshPages();
              }}
            >
              <IconRefresh />
            </button>
            <span className="count-badge">{pages.length}</span>
          </div>
        </div>
        <div className="sidebar-section-body">
          {selectedProject === null ? (
            <p className="empty-copy">Select a project to view pages.</p>
          ) : isLoadingPages ? (
            <p className="empty-copy">Loading pages...</p>
          ) : pages.length === 0 ? (
            <p className="empty-copy">This project has no pages yet.</p>
          ) : (
            <div className="list-stack">
              {pages.map((page) => {
                const isDragging =
                  dragState?.kind === 'pages' && dragState.itemId === page.id;
                const isRenaming = pageRenameTargetId === page.id;
                const isOpenInTab = openTabs.some(
                  (tab) => tab.kind === 'page' && tab.id === page.id,
                );
                const isSelectedPage =
                  page.id === selectedPageId && activeNoteFile === null;
                const isDropBefore =
                  dropState?.kind === 'pages' &&
                  dropState.itemId === page.id &&
                  dropState.position === 'before';
                const isDropAfter =
                  dropState?.kind === 'pages' &&
                  dropState.itemId === page.id &&
                  dropState.position === 'after';

                return (
                  <div
                    key={page.id}
                    className={`list-entry ${isDropBefore ? 'is-drop-before' : ''} ${
                      isDropAfter ? 'is-drop-after' : ''
                    }`}
                    onDragOver={(event) =>
                      handleLocalSidebarDragOver('pages', page.id, event)
                    }
                    onDrop={(event) =>
                      handleLocalSidebarDrop('pages', page.id, event)
                    }
                  >
                    {isRenaming ? (
                      <div
                        className={`list-button list-button-rename is-editing ${
                          isOpenInTab ? 'is-open-tab' : ''
                        } ${isSelectedPage ? 'is-selected' : ''}`}
                        onMouseDown={(event) => event.stopPropagation()}
                      >
                        <input
                          className="page-rename-input"
                          aria-label={`Rename page ${page.name}`}
                          disabled={isMutating}
                          value={pageRenameDraft}
                          placeholder="Page name"
                          autoFocus
                          onChange={(event) =>
                            setPageRenameDraft(event.target.value)
                          }
                          onBlur={() => {
                            void handleLocalSavePageName(page, pageRenameDraft);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void handleLocalSavePageName(page, pageRenameDraft);
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelPageRename();
                            }
                          }}
                        />
                        <small>zoom {page.zoom.toFixed(1)}x</small>
                      </div>
                    ) : (
                      <button
                        className={`list-button ${
                          isOpenInTab ? 'is-open-tab' : ''
                        } ${isSelectedPage ? 'is-selected' : ''} ${
                          isDragging ? 'is-dragging' : ''
                        } ${pages.length > 1 ? 'is-sortable' : ''}`}
                        draggable={!isMutating && pages.length > 1}
                        aria-label={
                          pages.length > 1 ? `Move page ${page.name}` : undefined
                        }
                        title={
                          pages.length > 1 ? `Move page ${page.name}` : undefined
                        }
                        onDragStart={(event) =>
                          onDragStart('pages', page.id, event)
                        }
                        onDragEnd={onClearDragState}
                        onClick={() => onActivatePageTab(page.id)}
                      >
                        <span>{page.name}</span>
                        <small>zoom {page.zoom.toFixed(1)}x</small>
                      </button>
                    )}
                    <div className="page-row-actions">
                      <button
                        type="button"
                        className={`ghost-button page-icon-button page-rename-button ${
                          isRenaming ? 'is-active' : ''
                        }`}
                        disabled={isMutating}
                        title={
                          isRenaming
                            ? `Save page name for ${page.name}`
                            : `Rename page ${page.name}`
                        }
                        aria-label={
                          isRenaming
                            ? `Save page name for ${page.name}`
                            : `Rename page ${page.name}`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isRenaming) {
                            void handleLocalSavePageName(page, pageRenameDraft);
                            return;
                          }

                          beginPageRename(page);
                        }}
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        className="ghost-button danger-button page-icon-button page-trash-button"
                        disabled={isMutating}
                        title={`Delete page ${page.name}`}
                        aria-label={`Delete page ${page.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeletePage(page);
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            className="primary-button sidebar-add-page-button"
            disabled={selectedProject === null || isMutating}
            onClick={() => void onCreatePage()}
          >
            New page
          </button>
        </div>
      </section>
      <section
        className={`sidebar-section sidebar-notes-section sidebar-foldout-section ${
          expandedSidebarSections.notes ? 'is-expanded' : 'is-collapsed'
        }`}
      >
        <div className="section-title-row">
          <button
            type="button"
            className="sidebar-foldout-trigger"
            aria-expanded={expandedSidebarSections.notes}
            onClick={() => toggleSidebarSection('notes')}
          >
            <span className="sidebar-foldout-title">
              <span className="sidebar-pages-heading">Notes</span>
              <IconChevronDown />
            </span>
          </button>
          <div className="sidebar-section-actions">
            <button
              type="button"
              className={`ghost-button sidebar-section-refresh ${
                hasProjectNoteUpdates ? 'has-updates' : ''
              }`}
              disabled={isMutating || isLoadingNotes}
              title={
                hasProjectNoteUpdates
                  ? 'Refresh notes: updates available'
                  : 'Refresh notes'
              }
              onClick={(e) => {
                e.stopPropagation();
                onRefreshNotes();
              }}
            >
              <IconRefresh />
              {hasProjectNoteUpdates ? (
                <span className="sidebar-refresh-indicator" />
              ) : null}
            </button>
            <span className="count-badge">{projectNotes.length}</span>
          </div>
        </div>
        <div className="sidebar-section-body">
          {selectedProject === null ? (
            <p className="empty-copy">Select a project to view notes.</p>
          ) : isLoadingNotes ? (
            <p className="empty-copy">Loading notes...</p>
          ) : projectNotes.length === 0 ? (
            <p className="empty-copy">
              This project has no markdown notes yet.
            </p>
          ) : (
            <div className="list-stack sidebar-notes-list">
              {projectNotes.map((note) => {
                const isDragging =
                  dragState?.kind === 'notes' &&
                  dragState.itemId === note.note_file;
                const isOpenInTab = openTabs.some(
                  (tab) => tab.kind === 'note' && tab.id === note.note_file,
                );
                const isSelectedNote = activeNoteFile === note.note_file;

                return (
                  <div key={note.note_file} className="list-entry">
                    <button
                      type="button"
                      className={`list-button note-list-button ${
                        isDragging ? 'is-dragging' : ''
                      } ${isOpenInTab ? 'is-open-tab' : ''} ${
                        isSelectedNote ? 'is-selected' : ''
                      }`}
                      draggable={!isMutating}
                      title={`Click to edit · Drag to place on a page`}
                      aria-label={`Open note ${note.note_file} in editor`}
                      onClick={() => onOpenNoteTab(note.note_file)}
                      onDragStart={(event) =>
                        onDragStart('notes', note.note_file, event)
                      }
                      onDragEnd={onClearDragState}
                    >
                      <span>{note.note_file}</span>
                      <small>{note.title}</small>
                    </button>
                    <div className="note-row-actions">
                      <button
                        type="button"
                        className="ghost-button danger-button page-icon-button note-trash-button"
                        disabled={isMutating}
                        title={`Delete note ${note.note_file}`}
                        aria-label={`Delete note ${note.note_file}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDeleteNote(note.note_file);
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
