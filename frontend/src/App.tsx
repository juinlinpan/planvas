import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from 'react';
import {
  createBoardItem,
  createPage,
  createProject,
  deletePage,
  deleteProject,
  deleteProjectNote,
  getCloudPublishTarget,
  getPageBoardData,
  listProjects,
  openProjectPath,
  publishProject,
  revealProject,
  reorderPages,
  updatePage,
  updateProject,
  type Page,
  type ProjectNote,
  type ProjectThemeColor,
} from './services/api';
import { Canvas } from './components/canvas/Canvas';
import { FolderPickerModal } from './components/dialogs/FolderPickerModal';
import { HomeView } from './components/HomeView';
import { MarkdownEditor } from './components/MarkdownEditor';
import { WorkspaceTabs } from './components/WorkspaceTabs';
import { ExportImageModal } from './components/dialogs/ExportImageModal';
import { MermaidImportModal } from './components/dialogs/MermaidImportModal';
import { CrossProjectImportModal } from './components/dialogs/CrossProjectImportModal';
import { usePageImportExport } from './hooks/usePageImportExport';
import { readAppRoute } from './appRoute';
import { useWorkspaceData, UNLOADED_PAGE_BOARD_CACHE } from './hooks/useWorkspaceData';
import { type DropPosition, getDropPosition, buildDraggedOrder, reorderItemsByIds } from './utils/dragDrop';
import { useWorkspaceTabs } from './utils/workspaceTabState';
import { getErrorMessage, readStoredBoolean } from './utils/index';
import { buildUntitledPageName } from './utils/workspaceNavigation';
import {
  parseProjectDefaultStyle,
  serializeProjectDefaultStyle,
  type ProjectDefaultStyle,
} from './items/itemStyles';
import {
  WorkspaceSidebar,
  type SidebarDragState,
  type SidebarDropState,
  type SidebarListKind,
} from './components/WorkspaceSidebar';
import { ProjectSettingsDialog } from './components/dialogs/ProjectSettingsDialog';

type AppView = 'home' | 'workspace';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'whiteboard.workspaceSidebarCollapsed';







export function App() {
  const initialRoute = readAppRoute(window.location.search);
  const [appView, setAppView] = useState<AppView>(initialRoute.view);

  const {
    loadState,
    errorMessage,
    setErrorMessage,
    projects,
    setProjects,
    pages,
    setPages,
    projectNotes,
    setProjectNotes,
    hasProjectNoteUpdates,
    selectedProjectId,
    setSelectedProjectId,
    selectedPageId,
    setSelectedPageId,
    pageRefreshTokenById,
    setPageRefreshTokenById,
    isLoadingPages,
    isLoadingNotes,
    selectedProject,
    selectedPage,
    pageBoardCacheRef,
    selectedPageIdRef,
    loadProjectSidebarData,
    refreshProjectNotes,
    updateProjectNotesState,
    handlePageViewportChange,
    goHome,
    openProject,
    updateCachedPageBoardData,
    clearCachedPageBoardData,
    loadWorkspace,
  } = useWorkspaceData({
    appView,
    setAppView,
  });

  const [projectSettingsDialogOpen, setProjectSettingsDialogOpen] =
    useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [createProjectNameDraft, setCreateProjectNameDraft] = useState('');

  const [isMutating, setIsMutating] = useState(false);
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [dropState, setDropState] = useState<SidebarDropState | null>(null);
  const [projectDeleteDialogOpen, setProjectDeleteDialogOpen] = useState(false);

  const [projectDeleteConfirmation, setProjectDeleteConfirmation] =
    useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    readStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY, false),
  );
  const {
    activeNoteFile,
    activatePageTab,
    closeNoteTab,
    closePageTab,
    handleNoteRenamedInTabs,
    openNoteTab,
    openTabs,
    setActiveNoteFile,
    setOpenTabs,
  } = useWorkspaceTabs({
    selectedPageId,
    setSelectedPageId,
  });

  useEffect(() => {
    setActiveNoteFile(null);
  }, [selectedProjectId, setActiveNoteFile]);

  const selectedProjectDefaultStyle = useMemo(
    () => parseProjectDefaultStyle(selectedProject?.default_style_json ?? null),
    [selectedProject?.default_style_json],
  );

  const projectDeletePhrase =
    selectedProject === null ? '' : `delete ${selectedProject.name}`;
  const canConfirmProjectDelete =
    selectedProject !== null &&
    projectDeleteConfirmation === projectDeletePhrase &&
    !isMutating;

  useEffect(() => {
    setProjectSettingsDialogOpen(false);
    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirmation('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);

  async function runMutation(task: () => Promise<void>): Promise<void> {
    setIsMutating(true);
    setErrorMessage(null);

    try {
      await task();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  const {
    exportImageDialogData,
    setExportImageDialogData,
    mermaidImportDialogOpen,
    setMermaidImportDialogOpen,
    crossProjectImportOpen,
    setCrossProjectImportOpen,
    handleExportPageClick,
    handleExportImageConfirm,
    handleImportPageButtonClick,
    handleCrossProjectImportOpen,
    handleCrossProjectImportConfirm,
    handleMermaidImportConfirm,
  } = usePageImportExport({
    selectedProjectId,
    selectedPage,
    setPages,
    setSelectedPageId,
    isMutating,
    runMutation,
    refreshProjectNotes,
  });

  async function handleDeleteNote(noteFile: string): Promise<void> {
    if (selectedProjectId === null) return;
    const confirmed = window.confirm(
      `刪除 Markdown 筆記「${noteFile}」及其在畫布上的連結？`,
    );
    if (!confirmed) return;

    await runMutation(async () => {
      await deleteProjectNote(selectedProjectId, noteFile);
      closeNoteTab(noteFile);
      await refreshProjectNotes(selectedProjectId);
      // Refresh current page if needed
      if (selectedPageId !== null) {
        clearCachedPageBoardData(selectedPageId);
        setPageRefreshTokenById((current) => ({
          ...current,
          [selectedPageId]: (current[selectedPageId] ?? 0) + 1,
        }));
      }
    });
  }

  const handleRefreshNotes = useCallback(async (): Promise<void> => {
    if (selectedProjectId === null) return;
    try {
      await refreshProjectNotes(selectedProjectId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [selectedProjectId, refreshProjectNotes, setErrorMessage]);


  async function handleRevealProject(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    await runMutation(async () => {
      await revealProject(selectedProject.id);
    });
  }

  async function handleCopyCloudPublishUrl(): Promise<void> {
    try {
      const target = await getCloudPublishTarget();
      await navigator.clipboard.writeText(target.url);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handlePublishProject(publishUrl: string): Promise<string> {
    if (selectedProject === null) {
      throw new Error('No project is selected.');
    }
    const result = await publishProject(selectedProject.id, publishUrl);
    return `Published as ${result.owner}/${result.uploaded_name}.`;
  }

  function handleNoteRenamed(
    previousNoteFile: string,
    renamedNote: ProjectNote,
  ): void {
    updateProjectNotesState([renamedNote], previousNoteFile);
    handleNoteRenamedInTabs(previousNoteFile, renamedNote);
    if (selectedPageId !== null) {
      clearCachedPageBoardData(selectedPageId);
      setPageRefreshTokenById((current) => ({
        ...current,
        [selectedPageId]: (current[selectedPageId] ?? 0) + 1,
      }));
    }
  }

  const handleNoteSaved = useCallback(
    (savedNote: ProjectNote): void => {
      updateProjectNotesState([savedNote]);
    },
    [updateProjectNotesState],
  );

  function openCreateProjectDialog(): void {
    setCreateProjectNameDraft('Untitled Project');
    setCreateProjectDialogOpen(true);
  }

  function closeCreateProjectDialog(): void {
    if (isMutating) {
      return;
    }
    setCreateProjectDialogOpen(false);
    setCreateProjectNameDraft('');
  }

  async function handleCreateProject(
    event?: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event?.preventDefault();
    const name = createProjectNameDraft.trim();
    if (name.length === 0) {
      return;
    }

    await runMutation(async () => {
      const project = await createProject(name);
      setProjects((current) => [...current, project]);
      setCreateProjectDialogOpen(false);
      setCreateProjectNameDraft('');
      openProject(project.id, null);
    });
  }

  function handleOpenProject(): void {
    setFolderPickerOpen(true);
  }

  async function handleFolderPickerConfirm(folderPath: string): Promise<void> {
    setFolderPickerOpen(false);
    await runMutation(async () => {
      const openedProject = await openProjectPath(folderPath);
      const nextProjects = await listProjects();
      setProjects(nextProjects);
      openProject(openedProject.id, null);
    });
  }

  async function handleSaveProjectName(nextName: string): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const normalized = nextName.trim();
    if (
      normalized.length === 0 ||
      normalized === selectedProject.name
    ) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        name: normalized,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
    });
  }

  async function handleCreatePage(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const name = buildUntitledPageName(pages);

    await runMutation(async () => {
      const page = await createPage(selectedProject.id, name);
      updateCachedPageBoardData({
        page,
        board_items: [],
        connector_links: [],
      });
      setPages((current) => [...current, page]);
      setSelectedPageId(page.id);
    });
  }

  async function handleSavePageName(
    pageToRename: Page | null,
    nextName: string,
  ): Promise<void> {
    if (pageToRename === null) {
      return;
    }

    const normalizedName = nextName.trim();

    if (normalizedName.length === 0 || normalizedName === pageToRename.name) {
      return;
    }

    await runMutation(async () => {
      const updatedPage = await updatePage(pageToRename.id, normalizedName);
      const cached = pageBoardCacheRef.current.get(updatedPage.id);
      if (cached !== undefined && cached !== UNLOADED_PAGE_BOARD_CACHE) {
        pageBoardCacheRef.current.set(updatedPage.id, {
          ...cached,
          page: updatedPage,
        });
      }
      setPages((current) =>
        current.map((page) =>
          page.id === updatedPage.id ? updatedPage : page,
        ),
      );
    });
  }

  async function handleDeletePage(
    pageToDelete: Page | null = selectedPage,
  ): Promise<void> {
    if (pageToDelete === null) {
      return;
    }
    const selectedPage = pageToDelete;

    const confirmed = window.confirm(`刪除 Page「${selectedPage.name}」？`);
    if (!confirmed) {
      return;
    }

    const remainingPages = pages.filter((page) => page.id !== selectedPage.id);

    await runMutation(async () => {
      await deletePage(selectedPage.id);
      clearCachedPageBoardData(selectedPage.id);
      setPages(remainingPages);
      setSelectedPageId((current) =>
        current === selectedPage.id ? (remainingPages[0]?.id ?? null) : current,
      );
    });
  }

  async function handleChangeProjectTheme(
    nextThemeColor: ProjectThemeColor,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    if (nextThemeColor === selectedProject.theme_color) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        theme_color: nextThemeColor,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
    });
  }

  async function handleChangeProjectDefaultStyle(
    patch: ProjectDefaultStyle,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const nextDefaultStyleJson = serializeProjectDefaultStyle({
      ...selectedProjectDefaultStyle,
      ...patch,
    });

    if (nextDefaultStyleJson === selectedProject.default_style_json) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        default_style_json: nextDefaultStyleJson,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
    });
  }

  function openProjectDeleteDialog(): void {
    if (selectedProject === null || isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(false);
    setProjectDeleteConfirmation('');
    setProjectDeleteDialogOpen(true);
  }

  function openProjectSettingsDialog(): void {
    if (selectedProject === null || isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(true);
  }

  function closeProjectSettingsDialog(): void {
    if (isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(false);
  }



  function closeProjectDeleteDialog(): void {
    if (isMutating) {
      return;
    }

    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirmation('');
  }

  async function handleDeleteProject(): Promise<void> {
    if (selectedProject === null || !canConfirmProjectDelete) {
      return;
    }

    const projectToDelete = selectedProject;

    await runMutation(async () => {
      await deleteProject(projectToDelete.id);
      setProjects((current) =>
        current.filter((project) => project.id !== projectToDelete.id),
      );
      setPages([]);
      setSelectedProjectId(null);
      setSelectedPageId(null);
      setProjectDeleteDialogOpen(false);
      setProjectDeleteConfirmation('');
      goHome('replace');
    });
  }

  async function handleRemoveProjectFromHome(projectId: string): Promise<void> {
    await runMutation(async () => {
      await deleteProject(projectId);
      setProjects((current) =>
        current.filter((project) => project.id !== projectId),
      );
      if (selectedProjectId === projectId) {
        setPages([]);
        setSelectedProjectId(null);
        setSelectedPageId(null);
        goHome('replace');
      }
    });
  }

  function clearDragState(): void {
    setDragState(null);
    setDropState(null);
  }

  function handleSidebarDragStart(
    kind: SidebarListKind,
    itemId: string,
    event: ReactDragEvent<HTMLButtonElement>,
  ): void {
    if (isMutating) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = kind === 'notes' ? 'copy' : 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${itemId}`);
    setDragState({ kind, itemId });
    setDropState(null);
  }

  function handleSidebarDragOver(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    if (dragState === null) {
      return;
    }

    if (dragState.kind === 'notes' && kind === 'pages') {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropState((current) => {
        if (
          current !== null &&
          current.kind === kind &&
          current.itemId === targetId &&
          current.position === 'after'
        ) {
          return current;
        }

        return { kind, itemId: targetId, position: 'after' };
      });
      return;
    }

    if (dragState.kind !== kind || dragState.itemId === targetId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = getDropPosition(event);
    setDropState((current) => {
      if (
        current !== null &&
        current.kind === kind &&
        current.itemId === targetId &&
        current.position === position
      ) {
        return current;
      }

      return { kind, itemId: targetId, position };
    });
  }

  async function handlePageDrop(
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const orderedIds = buildDraggedOrder(pages, draggedId, targetId, position);
    if (orderedIds === null) {
      return;
    }

    const previousPages = pages;
    setPages(reorderItemsByIds(pages, orderedIds));
    setIsMutating(true);
    setErrorMessage(null);

    try {
      const nextPages = await reorderPages(selectedProject.id, orderedIds);
      setPages(nextPages);
    } catch (error) {
      setPages(previousPages);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleNoteDrop(
    noteFile: string,
    targetPageId: string,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const note = projectNotes.find((entry) => entry.note_file === noteFile);
    const targetPage = pages.find((page) => page.id === targetPageId);
    if (note === undefined || targetPage === undefined) {
      return;
    }

    setIsMutating(true);
    setErrorMessage(null);

    try {
      const targetBoardData = await getPageBoardData(targetPage.id);
      const maxZIndex = targetBoardData.board_items.reduce(
        (max, item) => Math.max(max, item.z_index),
        -1,
      );
      await createBoardItem({
        page_id: targetPage.id,
        parent_item_id: null,
        category: 'small_item',
        type: 'note_paper',
        title: note.title,
        content: null,
        content_format: note.content_format,
        x: targetPage.viewport_x + 120,
        y: targetPage.viewport_y + 120,
        width: 264,
        height: 216,
        rotation: 0,
        z_index: maxZIndex + 1,
        is_collapsed: false,
        style_json: null,
        data_json: JSON.stringify({
          noteFile: note.note_file,
          noteFileManaged: false,
        }),
      });
      setPageRefreshTokenById((current) => ({
        ...current,
        [targetPage.id]: (current[targetPage.id] ?? 0) + 1,
      }));
      clearCachedPageBoardData(targetPage.id);
      await refreshProjectNotes(selectedProject.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  function handleSidebarDrop(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    event.preventDefault();
    const currentDragState = dragState;
    const position = getDropPosition(event);
    clearDragState();

    if (currentDragState === null) {
      return;
    }

    if (currentDragState.kind === 'notes' && kind === 'pages') {
      void handleNoteDrop(currentDragState.itemId, targetId);
      return;
    }

    if (
      currentDragState.kind !== kind ||
      currentDragState.itemId === targetId
    ) {
      return;
    }

    void handlePageDrop(currentDragState.itemId, targetId, position);
  }



  if (loadState === 'error' || appView === 'home') {
    return (
      <>
        <HomeView
          errorMessage={errorMessage}
          isBusy={isMutating}
          isLoading={loadState === 'loading'}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onCreateProject={openCreateProjectDialog}
          onOpenProject={() => handleOpenProject()}
          onCopyCloudPublishUrl={() => handleCopyCloudPublishUrl()}
          onSelectProject={(projectId) => openProject(projectId, null)}
          onRemoveProject={(projectId) =>
            void handleRemoveProjectFromHome(projectId)
          }
          onRefreshProjects={() => void loadWorkspace()}
        />
        {folderPickerOpen ? (
          <FolderPickerModal
            isBusy={isMutating}
            onConfirm={(folderPath) =>
              void handleFolderPickerConfirm(folderPath)
            }
            onCancel={() => setFolderPickerOpen(false)}
          />
        ) : null}
        {createProjectDialogOpen ? (
          <div
            className="confirmation-dialog-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeCreateProjectDialog();
              }
            }}
          >
            <form
              className="confirmation-dialog project-create-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-create-dialog-title"
              onSubmit={(event) => void handleCreateProject(event)}
            >
              <div className="confirmation-dialog-header">
                <h2 id="project-create-dialog-title">Create Project</h2>
                <button
                  type="button"
                  className="ghost-button confirmation-dialog-close"
                  disabled={isMutating}
                  onClick={closeCreateProjectDialog}
                  aria-label="Close create project dialog"
                >
                  X
                </button>
              </div>
              <label
                className="confirmation-dialog-label"
                htmlFor="project-create-name-input"
              >
                Project name
              </label>
              <input
                id="project-create-name-input"
                className="confirmation-dialog-input"
                disabled={isMutating}
                value={createProjectNameDraft}
                onChange={(event) =>
                  setCreateProjectNameDraft(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeCreateProjectDialog();
                  }
                }}
                autoFocus
              />
              <div className="confirmation-dialog-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={isMutating}
                  onClick={closeCreateProjectDialog}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ghost-button primary-action-button"
                  disabled={
                    isMutating || createProjectNameDraft.trim().length === 0
                  }
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <main
        className={`app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}
        data-project-theme={selectedProject?.theme_color ?? 'default'}
      >
        <WorkspaceSidebar
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          selectedProject={selectedProject}
          selectedPageId={selectedPageId}
          activeNoteFile={activeNoteFile}
          isMutating={isMutating}
          isLoadingPages={isLoadingPages}
          isLoadingNotes={isLoadingNotes}
          pages={pages}
          projectNotes={projectNotes}
          hasProjectNoteUpdates={hasProjectNoteUpdates}
          openTabs={openTabs}
          dragState={dragState}
          dropState={dropState}
          onGoHome={goHome}
          onOpenSettings={openProjectSettingsDialog}
          onRefreshPages={() => {
            if (selectedProjectId) {
              void loadProjectSidebarData(
                selectedProjectId,
                selectedPageIdRef.current,
              );
            }
          }}
          onRefreshNotes={() => {
            void handleRefreshNotes();
          }}
          onActivatePageTab={activatePageTab}
          onSavePageName={handleSavePageName}
          onDeletePage={handleDeletePage}
          onCreatePage={handleCreatePage}
          onOpenNoteTab={openNoteTab}
          onDeleteNote={handleDeleteNote}
          onDragStart={handleSidebarDragStart}
          onDragOver={handleSidebarDragOver}
          onDrop={handleSidebarDrop}
          onClearDragState={clearDragState}
        />

        <section className="workspace">
          {/* ── browser-like tab bar ── */}
          {selectedProject !== null ? (
            <WorkspaceTabs
              activeNoteFile={activeNoteFile}
              dragState={dragState?.kind === 'tabs' ? dragState : null}
              dropState={dropState?.kind === 'tabs' ? dropState : null}
              isMutating={isMutating}
              onActivateNote={setActiveNoteFile}
              onActivatePage={activatePageTab}
              onClearDragState={clearDragState}
              onCloseNote={closeNoteTab}
              onClosePage={closePageTab}
              onSetDragState={setDragState}
              onSetDropState={setDropState}
              onSetOpenTabs={setOpenTabs}
              openTabs={openTabs}
              pages={pages}
              projectName={selectedProject.name}
              projectNotes={projectNotes}
              selectedPageId={selectedPageId}
            />
          ) : null}
          <div className="workspace-content-area">
            {errorMessage !== null ? (
              <div className="error-banner">{errorMessage}</div>
            ) : null}

            {activeNoteFile !== null && selectedProjectId !== null ? (
              <MarkdownEditor
                key={activeNoteFile}
                projectId={selectedProjectId}
                noteFile={activeNoteFile}
                projectNotes={projectNotes}
                onNoteRenamed={handleNoteRenamed}
                onNoteSaved={handleNoteSaved}
              />
            ) : selectedProject === null ? (
              <section className="hero-panel">
                <div className="hero-copy">
                  <h3>Select a project</h3>
                  <p className="hero-text">
                    Open a project from the home screen to start working on a
                    board.
                  </p>
                  <button
                    className="primary-button"
                    disabled={isMutating}
                    onClick={() => goHome()}
                  >
                    Go home
                  </button>
                </div>
              </section>
            ) : selectedPage === null ? (
              <section className="hero-panel">
                <div className="hero-copy">
                  <h3>
                    {pages.length === 0
                      ? `Create a page in ${selectedProject.name}`
                      : 'Select a page'}
                  </h3>
                  <p className="hero-text">
                    {pages.length === 0
                      ? 'Add a page to start arranging notes, tables, frames, and connectors.'
                      : 'Open a page from the sidebar to continue working.'}
                  </p>
                  <button
                    className="primary-button"
                    disabled={isMutating}
                    onClick={() => void handleCreatePage()}
                  >
                    New page
                  </button>
                </div>
              </section>
            ) : (
              <Canvas
                key={`${selectedPage.id}:${pageRefreshTokenById[selectedPage.id] ?? 0}`}
                page={selectedPage}
                cachedBoardData={(() => {
                  const cached = pageBoardCacheRef.current.get(selectedPage.id);
                  return cached !== undefined &&
                    cached !== UNLOADED_PAGE_BOARD_CACHE &&
                    cached.page.project_id === selectedProject.id
                    ? cached
                    : null;
                })()}
                projectNotes={projectNotes}
                draggedProjectNoteFile={
                  dragState?.kind === 'notes' ? dragState.itemId : null
                }
                onImportPage={handleImportPageButtonClick}
                onImportFromProject={handleCrossProjectImportOpen}
                onExportPage={handleExportPageClick}
                importExportDisabled={isMutating}
                projectDefaultStyleJson={selectedProject.default_style_json}
                onViewportChange={(viewport) =>
                  handlePageViewportChange(selectedPage.id, viewport)
                }
                onBoardDataCacheChange={updateCachedPageBoardData}
                onOpenNote={openNoteTab}
                onProjectNotesChanged={(updatedNotes) => {
                  if (selectedProjectId !== null) {
                    if (updatedNotes) {
                      updateProjectNotesState(updatedNotes);
                    }
                    void refreshProjectNotes(selectedProjectId);
                  }
                }}
              />
            )}
          </div>
        </section>
      </main>
      <ProjectSettingsDialog
        isOpen={projectSettingsDialogOpen}
        onClose={closeProjectSettingsDialog}
        selectedProject={selectedProject}
        isMutating={isMutating}
        selectedProjectDefaultStyle={selectedProjectDefaultStyle}
        onSaveProjectName={handleSaveProjectName}
        onChangeProjectTheme={handleChangeProjectTheme}
        onRevealProject={handleRevealProject}
        onChangeProjectDefaultStyle={handleChangeProjectDefaultStyle}
        onPublishProject={handlePublishProject}
        onOpenProjectDeleteDialog={openProjectDeleteDialog}
      />
      {exportImageDialogData !== null ? (
        <ExportImageModal
          naturalWidth={exportImageDialogData.naturalWidth}
          naturalHeight={exportImageDialogData.naturalHeight}
          isBusy={isMutating}
          onConfirm={handleExportImageConfirm}
          onCancel={() => setExportImageDialogData(null)}
        />
      ) : null}
      {mermaidImportDialogOpen ? (
        <MermaidImportModal
          isBusy={isMutating}
          onConfirm={(title, code) =>
            void handleMermaidImportConfirm(title, code)
          }
          onCancel={() => setMermaidImportDialogOpen(false)}
        />
      ) : null}
      {crossProjectImportOpen && selectedProjectId !== null ? (
        <CrossProjectImportModal
          currentProjectId={selectedProjectId}
          projects={projects}
          isBusy={isMutating}
          onConfirm={(pageIds, noteFiles, sourceProjectId) =>
            void handleCrossProjectImportConfirm(
              pageIds,
              noteFiles,
              sourceProjectId,
            )
          }
          onCancel={() => setCrossProjectImportOpen(false)}
        />
      ) : null}
      {projectDeleteDialogOpen && selectedProject !== null ? (
        <div
          className="confirmation-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProjectDeleteDialog();
            }
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-delete-dialog-title"
          >
            <div className="confirmation-dialog-header">
              <h2 id="project-delete-dialog-title">Delete project</h2>
              <button
                type="button"
                className="ghost-button confirmation-dialog-close"
                disabled={isMutating}
                onClick={closeProjectDeleteDialog}
                aria-label="Close delete project dialog"
              >
                X
              </button>
            </div>
            <p className="confirmation-dialog-copy">
              This will delete the project, its pages, and all board content.
            </p>
            <label
              className="confirmation-dialog-label"
              htmlFor="project-delete-confirmation-input"
            >
              Type <strong>{projectDeletePhrase}</strong> to confirm.
            </label>
            <input
              id="project-delete-confirmation-input"
              className="confirmation-dialog-input"
              disabled={isMutating}
              value={projectDeleteConfirmation}
              onChange={(event) =>
                setProjectDeleteConfirmation(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canConfirmProjectDelete) {
                  event.preventDefault();
                  void handleDeleteProject();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeProjectDeleteDialog();
                }
              }}
              autoFocus
            />
            <div className="confirmation-dialog-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={isMutating}
                onClick={closeProjectDeleteDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ghost-button danger-button"
                disabled={!canConfirmProjectDelete}
                onClick={() => void handleDeleteProject()}
              >
                Delete project
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
