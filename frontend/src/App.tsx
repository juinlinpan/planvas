import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  getPageBoardData,
  getHealth,
  importFromProject,
  listPages,
  listProjectNotes,
  listProjects,
  openProjectPath,
  revealProject,
  replacePageBoardState,
  reorderPages,
  updatePage,
  updateProject,
  type Page,
  type PageBoardData,
  type Project,
  type ProjectNote,
  type ProjectThemeColor,
} from './api';
import { Canvas } from './Canvas';
import { ColorPaletteField, CommitNumberInput } from './Inspector';
import { FolderPickerModal } from './FolderPickerModal';
import { HomeView } from './HomeView';
import { MarkdownEditor } from './MarkdownEditor';
import { syncPageViewport } from './pageViewport';
import {
  exportPageAsPng,
  getPagePngExportBoundsFromBoardData,
} from './pagePngExport';
import {
  ExportImageModal,
  type ExportImageOptions,
} from './ExportImageModal';
import { exportPageAsPptx } from './pagePptxExport';
import { exportPageAsHtml } from './pageHtmlExport';
import { exportPageAsMarkdown } from './pageMermaidExport';
import { parseMermaidToBoardData } from './mermaidImport';
import { MermaidImportModal } from './MermaidImportModal';
import { CrossProjectImportModal } from './CrossProjectImportModal';
import { buildAppRouteUrl, readAppRoute, type AppRoute } from './appRoute';
import { resolveProjectEntryPageId } from './workspaceNavigation';
import { getInlineDropPosition, type DropPosition } from './dragDrop';
import {
  BACKGROUND_COLOR_OPTIONS,
  STROKE_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  parseProjectDefaultStyle,
  serializeProjectDefaultStyle,
  type ProjectDefaultStyle,
} from './itemStyles';
import {
  IconChevronDown,
  IconFolder,
  IconPencil,
  IconRefresh,
  IconSettings,
  IconTrash,
} from './AppIcons';

type AppView = 'home' | 'workspace';
type LoadState = 'loading' | 'ready' | 'error';
type SidebarListKind = 'pages' | 'notes';
type SidebarDragState =
  | {
      kind: SidebarListKind;
      itemId: string;
    }
  | {
      kind: 'tabs';
      itemId: string; // "kind:id"
    };
type SidebarDropState = SidebarDragState & {
  position: DropPosition;
};

type SidebarSectionId = 'pages' | 'notes';
type WorkspaceTab = { kind: 'page'; id: string } | { kind: 'note'; id: string };

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'whiteboard.workspaceSidebarCollapsed';

const PROJECT_THEME_OPTIONS: Array<{
  value: ProjectThemeColor;
  label: string;
}> = [
  { value: 'default', label: 'Default' },
  { value: 'sage', label: 'Sage' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
];

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

function sanitizeExportName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'page';
}

async function saveFileWithPicker({
  data,
  suggestedName,
  description,
  accept,
}: {
  data: Blob | string;
  suggestedName: string;
  description: string;
  accept: Record<string, string[]>;
}): Promise<void> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (pickerWindow.showSaveFilePicker === undefined) {
    throw new Error(
      '目前瀏覽器不支援「選擇儲存位置」匯出，請改用支援 File System Access API 的瀏覽器。',
    );
  }

  let fileHandle: Awaited<
    ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>
  >;
  try {
    fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description,
          accept,
        },
      ],
    });
  } catch (error) {
    if (isUserCancelledFilePickerError(error)) {
      return;
    }

    throw error;
  }

  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Unknown error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isUserCancelledFilePickerError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();
    return (
      normalizedMessage.includes('user aborted') ||
      normalizedMessage.includes('aborted a request')
    );
  }

  return false;
}

function buildUntitledPageName(pages: Page[]): string {
  const takenNumbers = new Set<number>();

  for (const page of pages) {
    const matched = page.name.trim().match(/^untitled_(\d+)$/i);
    if (matched === null) {
      continue;
    }

    const parsed = Number.parseInt(matched[1], 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      takenNumbers.add(parsed);
    }
  }

  let candidate = 1;
  while (takenNumbers.has(candidate)) {
    candidate += 1;
  }

  return `untitled_${candidate}`;
}

function selectFallbackId<T extends { id: string }>(
  items: T[],
  preferredId: string | null,
): string | null {
  if (preferredId !== null && items.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  return items[0]?.id ?? null;
}

function buildDraggedOrder<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] | null {
  const orderedIds = items.map((item) => item.id);
  const draggedIndex = orderedIds.indexOf(draggedId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return null;
  }

  const [movedId] = orderedIds.splice(draggedIndex, 1);
  if (movedId === undefined) {
    return null;
  }

  const insertionIndex = orderedIds.indexOf(targetId);
  if (insertionIndex === -1) {
    return null;
  }

  orderedIds.splice(
    position === 'after' ? insertionIndex + 1 : insertionIndex,
    0,
    movedId,
  );

  return orderedIds.every((id, index) => id === items[index]?.id)
    ? null
    : orderedIds;
}

function reorderItemsByIds<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftPosition = positions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function getDropPosition(event: ReactDragEvent<HTMLElement>): DropPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after';
}

function getTabDropPosition(event: ReactDragEvent<HTMLElement>): DropPosition {
  return getInlineDropPosition(
    event.clientX,
    event.currentTarget.getBoundingClientRect(),
  );
}

function readStoredBoolean(key: string, fallbackValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === 'true') {
    return true;
  }

  if (storedValue === 'false') {
    return false;
  }

  return fallbackValue;
}

function syncBrowserRoute(route: AppRoute, mode: 'push' | 'replace'): void {
  const nextUrl = buildAppRouteUrl(route);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) {
    return;
  }

  if (mode === 'push') {
    window.history.pushState(null, '', nextUrl);
    return;
  }

  window.history.replaceState(null, '', nextUrl);
}

const UNLOADED_PAGE_BOARD_CACHE = Symbol('unloaded-page-board-cache');

type PageBoardCacheEntry =
  | PageBoardData
  | typeof UNLOADED_PAGE_BOARD_CACHE;

export function App() {
  const initialRoute = readAppRoute(window.location.search);
  const [appView, setAppView] = useState<AppView>(initialRoute.view);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.projectId : null,
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.pageId : null,
  );
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [projectSettingsDialogOpen, setProjectSettingsDialogOpen] =
    useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [createProjectNameDraft, setCreateProjectNameDraft] = useState('');
  const [pageRenameTargetId, setPageRenameTargetId] = useState<string | null>(
    null,
  );
  const [pageRenameDraft, setPageRenameDraft] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [pageRefreshTokenById, setPageRefreshTokenById] = useState<
    Record<string, number>
  >({});
  const [workspaceEntryToken, setWorkspaceEntryToken] = useState(0);
  const [workspaceEntryRetryToken, setWorkspaceEntryRetryToken] = useState(0);
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [dropState, setDropState] = useState<SidebarDropState | null>(null);
  const [projectDeleteDialogOpen, setProjectDeleteDialogOpen] = useState(false);
  const [mermaidImportDialogOpen, setMermaidImportDialogOpen] = useState(false);
  const [crossProjectImportOpen, setCrossProjectImportOpen] = useState(false);
  const [exportImageDialogData, setExportImageDialogData] = useState<{
    naturalWidth: number;
    naturalHeight: number;
    pageName: string;
    boardData: import('./api').PageBoardData;
  } | null>(null);
  const [projectDeleteConfirmation, setProjectDeleteConfirmation] =
    useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    readStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY, false),
  );
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>([]);
  const [activeNoteFile, setActiveNoteFile] = useState<string | null>(null);

  // Keep openTabs in sync whenever the selected page changes
  useEffect(() => {
    if (selectedPageId !== null) {
      setOpenTabs((prev) => {
        if (
          prev.some((tab) => tab.kind === 'page' && tab.id === selectedPageId)
        ) {
          return prev;
        }
        return [...prev, { kind: 'page', id: selectedPageId }];
      });
    }
  }, [selectedPageId]);
  const [expandedSidebarSections, setExpandedSidebarSections] = useState<
    Record<SidebarSectionId, boolean>
  >({
    pages: true,
    notes: true,
  });
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );
  const normalizedProjectNameDraft = projectNameDraft.trim();
  const projectDeletePhrase =
    selectedProject === null ? '' : `delete ${selectedProject.name}`;
  const canConfirmProjectDelete =
    selectedProject !== null &&
    projectDeleteConfirmation === projectDeletePhrase &&
    !isMutating;
  const selectedProjectDefaultStyle = useMemo(
    () => parseProjectDefaultStyle(selectedProject?.default_style_json ?? null),
    [selectedProject?.default_style_json],
  );
  const pageBoardCacheRef = useRef<Map<string, PageBoardCacheEntry>>(
    new Map(),
  );
  const selectedPageIdRef = useRef<string | null>(selectedPageId);
  const projectDataLoadIdRef = useRef(0);
  const workspaceEntryRetryAttemptedRef = useRef<number | null>(null);

  useEffect(() => {
    selectedPageIdRef.current = selectedPageId;
  }, [selectedPageId]);

  const updateCachedPageBoardData = useCallback((data: PageBoardData) => {
    pageBoardCacheRef.current.set(data.page.id, data);
  }, []);

  const clearCachedPageBoardData = useCallback((pageId: string) => {
    pageBoardCacheRef.current.delete(pageId);
  }, []);

  const markProjectPagesAsUnloaded = useCallback((nextPages: Page[]) => {
    pageBoardCacheRef.current.clear();
    for (const page of nextPages) {
      pageBoardCacheRef.current.set(page.id, UNLOADED_PAGE_BOARD_CACHE);
    }
  }, []);

  const loadProjectSidebarData = useCallback(
    async (
      projectId: string,
      preferredPageId: string | null = selectedPageIdRef.current,
      signal?: AbortSignal,
    ): Promise<void> => {
      const loadId = projectDataLoadIdRef.current + 1;
      projectDataLoadIdRef.current = loadId;
      pageBoardCacheRef.current.clear();
      setIsLoadingPages(true);
      setIsLoadingNotes(true);
      setErrorMessage(null);

      try {
        const [nextPages, nextNotes] = await Promise.all([
          listPages(projectId, signal),
          listProjectNotes(projectId, signal),
        ]);
        if (projectDataLoadIdRef.current !== loadId) {
          return;
        }

        markProjectPagesAsUnloaded(nextPages);
        setPages(nextPages);
        setProjectNotes(nextNotes);
        const nextPageId =
          preferredPageId !== null &&
          nextPages.some((page) => page.id === preferredPageId)
            ? preferredPageId
            : null;
        setSelectedPageId(nextPageId);
        if (nextPageId !== null) {
          setPageRefreshTokenById((current) => ({
            ...current,
            [nextPageId]: (current[nextPageId] ?? 0) + 1,
          }));
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        if (projectDataLoadIdRef.current !== loadId) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setPages([]);
        setProjectNotes([]);
        setSelectedPageId(null);
      } finally {
        if (!signal?.aborted && projectDataLoadIdRef.current === loadId) {
          setIsLoadingPages(false);
          setIsLoadingNotes(false);
        }
      }
    },
    [markProjectPagesAsUnloaded],
  );

  const handlePageViewportChange = useCallback(
    (pageId: string, viewport: { x: number; y: number; zoom: number }) => {
      setPages((current) => syncPageViewport(current, pageId, viewport));
      const cached = pageBoardCacheRef.current.get(pageId);
      if (cached !== undefined && cached !== UNLOADED_PAGE_BOARD_CACHE) {
        pageBoardCacheRef.current.set(pageId, {
          ...cached,
          page: {
            ...cached.page,
            viewport_x: viewport.x,
            viewport_y: viewport.y,
            zoom: viewport.zoom,
          },
        });
      }
    },
    [],
  );

  function goHome(mode: 'push' | 'replace' = 'push'): void {
    syncBrowserRoute({ view: 'home' }, mode);
    pageBoardCacheRef.current.clear();
    setAppView('home');
  }

  function openProject(
    projectId: string,
    preferredPageId: string | null,
    mode: 'push' | 'replace' = 'push',
  ): void {
    pageBoardCacheRef.current.clear();
    const isSameProject = projectId === selectedProjectId;
    const nextPageId = resolveProjectEntryPageId({
      preferredPageId,
      targetProjectId: projectId,
      pages,
    });

    if (!isSameProject) {
      setPages([]);
      setProjectNotes([]);
    }

    syncBrowserRoute(
      {
        view: 'workspace',
        projectId,
        pageId: nextPageId,
      },
      mode,
    );
    setSelectedPageId(nextPageId);
    setActiveNoteFile(null);
    setSelectedProjectId(projectId);
    setAppView('workspace');
    setWorkspaceEntryToken((current) => current + 1);
  }

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoadState('loading');
      setErrorMessage(null);

      try {
        const [, nextProjects] = await Promise.all([
          getHealth(signal),
          listProjects(signal),
        ]);

        setProjects(nextProjects);
        setSelectedProjectId((current) =>
          appView === 'workspace'
            ? current
            : selectFallbackId(nextProjects, current),
        );
        setLoadState('ready');
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setProjects([]);
        setPages([]);
        setSelectedProjectId(null);
        setSelectedPageId(null);
        setLoadState('error');
        syncBrowserRoute({ view: 'home' }, 'replace');
        setAppView('home');
      }
    },
    [appView],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    function handlePopState(): void {
      const route = readAppRoute(window.location.search);
      if (route.view === 'home') {
        setAppView('home');
        return;
      }

      setSelectedProjectId(route.projectId);
      setSelectedPageId(route.pageId);
      setAppView('workspace');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (appView === 'workspace' && selectedProjectId !== null) {
      syncBrowserRoute(
        {
          view: 'workspace',
          projectId: selectedProjectId,
          pageId: selectedPageId,
        },
        'replace',
      );
      return;
    }

    if (appView === 'home') {
      syncBrowserRoute({ view: 'home' }, 'replace');
    }
  }, [appView, selectedProjectId, selectedPageId]);

  useEffect(() => {
    if (
      loadState !== 'ready' ||
      appView !== 'workspace' ||
      selectedProjectId === null
    ) {
      return;
    }

    if (projects.some((project) => project.id === selectedProjectId)) {
      return;
    }

    if (projects.length === 0) {
      setErrorMessage(null);
      setSelectedProjectId(null);
      setSelectedPageId(null);
      syncBrowserRoute({ view: 'home' }, 'replace');
      setAppView('home');
      return;
    }

    setErrorMessage('The requested project no longer exists.');
    syncBrowserRoute({ view: 'home' }, 'replace');
    setAppView('home');
  }, [appView, loadState, projects, selectedProjectId]);

  useEffect(() => {
    setProjectNameDraft(selectedProject?.name ?? '');
  }, [selectedProject?.name]);

  useEffect(() => {
    setProjectSettingsDialogOpen(false);
    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirmation('');
  }, [selectedProjectId]);

  useEffect(() => {
    setPageRenameTargetId(null);
    setPageRenameDraft('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (
      pageRenameTargetId !== null &&
      !pages.some((page) => page.id === pageRenameTargetId)
    ) {
      setPageRenameTargetId(null);
      setPageRenameDraft('');
    }
  }, [pageRenameTargetId, pages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (selectedProjectId === null) {
      pageBoardCacheRef.current.clear();
      setPages([]);
      setProjectNotes([]);
      setSelectedPageId(null);
      return;
    }

    if (appView !== 'workspace') {
      return;
    }

    const controller = new AbortController();
    void loadProjectSidebarData(
      selectedProjectId,
      selectedPageIdRef.current,
      controller.signal,
    );
    return () => controller.abort();
  }, [appView, loadProjectSidebarData, selectedProjectId, workspaceEntryToken]);

  useEffect(() => {
    if (
      appView !== 'workspace' ||
      selectedProjectId === null ||
      isLoadingPages ||
      selectedPageId !== null ||
      pages.length > 0 ||
      workspaceEntryRetryAttemptedRef.current === workspaceEntryToken
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      workspaceEntryRetryAttemptedRef.current = workspaceEntryToken;
      setWorkspaceEntryRetryToken((current) => current + 1);
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [
    appView,
    isLoadingPages,
    pages.length,
    selectedPageId,
    selectedProjectId,
    workspaceEntryToken,
  ]);

  useEffect(() => {
    if (
      appView !== 'workspace' ||
      selectedProjectId === null ||
      workspaceEntryRetryToken === 0
    ) {
      return;
    }

    const controller = new AbortController();
    void loadProjectSidebarData(selectedProjectId, null, controller.signal);
    return () => controller.abort();
  }, [
    appView,
    loadProjectSidebarData,
    selectedProjectId,
    workspaceEntryRetryToken,
  ]);

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

  const refreshProjectNotes = useCallback(
    async (projectId: string): Promise<void> => {
      const nextNotes = await listProjectNotes(projectId);
      setProjectNotes(nextNotes);
    },
    [],
  );

  const refreshCurrentProjectFromDisk = useCallback(async (): Promise<void> => {
    if (selectedProjectId === null) {
      return;
    }

    try {
      await loadProjectSidebarData(selectedProjectId, selectedPageIdRef.current);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [loadProjectSidebarData, selectedProjectId]);

  useEffect(() => {
    if (appView !== 'workspace' || selectedProjectId === null) {
      return;
    }

    function refreshOnReturn(): void {
      void refreshCurrentProjectFromDisk();
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        refreshOnReturn();
      }
    }

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [appView, refreshCurrentProjectFromDisk, selectedProjectId]);

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

  function toggleSidebarSection(sectionId: SidebarSectionId): void {
    setExpandedSidebarSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  async function handleRevealProject(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    await runMutation(async () => {
      await revealProject(selectedProject.id);
    });
  }

  function openNoteTab(noteFile: string): void {
    setOpenTabs((current) => {
      if (current.some((tab) => tab.kind === 'note' && tab.id === noteFile)) {
        return current;
      }
      return [...current, { kind: 'note', id: noteFile }];
    });
    setActiveNoteFile(noteFile);
  }

  function closeNoteTab(noteFile: string): void {
    setOpenTabs((current) =>
      current.filter((tab) => !(tab.kind === 'note' && tab.id === noteFile)),
    );
    setActiveNoteFile((current) => {
      if (current !== noteFile) return current;
      return null;
    });
  }

  function handleNoteRenamed(
    previousNoteFile: string,
    renamedNote: ProjectNote,
  ): void {
    const nextNoteFile = renamedNote.note_file;
    setProjectNotes((current) => {
      const replaced = current.map((note) =>
        note.note_file === previousNoteFile ? renamedNote : note,
      );
      return replaced.some((note) => note.note_file === nextNoteFile)
        ? replaced
        : [...replaced, renamedNote];
    });
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
    if (selectedPageId !== null) {
      clearCachedPageBoardData(selectedPageId);
      setPageRefreshTokenById((current) => ({
        ...current,
        [selectedPageId]: (current[selectedPageId] ?? 0) + 1,
      }));
    }
  }

  function closePageTab(pageId: string): void {
    const nextTabs = openTabs.filter(
      (tab) => !(tab.kind === 'page' && tab.id === pageId),
    );
    setOpenTabs(nextTabs);
    if (selectedPageId === pageId) {
      const fallbackPage = [...nextTabs]
        .reverse()
        .find((tab) => tab.kind === 'page');
      setSelectedPageId(fallbackPage?.id ?? null);
      setActiveNoteFile(null);
    }
  }

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

  async function handleSaveProjectName(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    if (
      normalizedProjectNameDraft.length === 0 ||
      normalizedProjectNameDraft === selectedProject.name
    ) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        name: normalizedProjectNameDraft,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
      setProjectNameDraft(updatedProject.name);
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
      setPageRenameTargetId(null);
      setPageRenameDraft('');
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
      setPageRenameTargetId(null);
      setPageRenameDraft('');
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

  function handleExportPageClick(
    format: 'png' | 'pptx' | 'mermaid' | 'html',
  ): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    void runMutation(async () => {
      try {
        const boardData = await getPageBoardData(selectedPage.id);
        const safePageName = sanitizeExportName(selectedPage.name);
        if (format === 'png') {
          const bounds = getPagePngExportBoundsFromBoardData(boardData);
          if (bounds === null) {
            throw new Error('目前 Page 沒有可匯出的物件。');
          }
          setExportImageDialogData({
            naturalWidth: bounds.width,
            naturalHeight: bounds.height,
            pageName: safePageName,
            boardData,
          });
          return;
        }

        if (format === 'mermaid') {
          const markdown = exportPageAsMarkdown(boardData);
          await saveFileWithPicker({
            data: markdown,
            suggestedName: `${safePageName}.md`,
            description: 'Markdown',
            accept: {
              'text/markdown': ['.md'],
            },
          });
          return;
        }

        if (format === 'html') {
          const htmlBlob = await exportPageAsHtml(boardData);
          await saveFileWithPicker({
            data: htmlBlob,
            suggestedName: `${safePageName}.html`,
            description: 'HTML page',
            accept: { 'text/html': ['.html'] },
          });
          return;
        }

        const pptxBlob = await exportPageAsPptx(boardData);
        await saveFileWithPicker({
          data: pptxBlob,
          suggestedName: `${safePageName}.pptx`,
          description: 'PowerPoint presentation',
          accept: {
            'application/vnd.openxmlformats-officedocument.presentationml.presentation':
              ['.pptx'],
          },
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        throw error;
      }
    });
  }

  function handleExportImageConfirm(options: ExportImageOptions): void {
    if (exportImageDialogData === null) return;
    const { boardData, pageName } = exportImageDialogData;
    setExportImageDialogData(null);
    void runMutation(async () => {
      try {
        const pngBlob = await exportPageAsPng(boardData, {
          scale: options.scale,
        });
        await saveFileWithPicker({
          data: pngBlob,
          suggestedName: `${pageName}.png`,
          description: 'PNG image',
          accept: { 'image/png': ['.png'] },
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }
        throw error;
      }
    });
  }

  function handleImportPageButtonClick(format: 'mermaid'): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    if (format === 'mermaid') {
      setMermaidImportDialogOpen(true);
    }
  }

  function handleCrossProjectImportOpen(): void {
    if (isMutating) return;
    setCrossProjectImportOpen(true);
  }

  async function handleCrossProjectImportConfirm(
    pageIds: string[],
    noteFiles: string[],
    sourceProjectId: string,
  ): Promise<void> {
    if (selectedProjectId === null) return;
    await runMutation(async () => {
      const result = await importFromProject(
        selectedProjectId,
        sourceProjectId,
        pageIds,
        noteFiles,
      );
      setPages((current) => [...current, ...result.pages]);
      if (result.notes.length > 0) {
        await refreshProjectNotes(selectedProjectId);
      }
      setCrossProjectImportOpen(false);
    });
  }

  async function handleMermaidImportConfirm(
    title: string,
    code: string,
  ): Promise<void> {
    if (selectedProjectId === null) {
      return;
    }

    await runMutation(async () => {
      const page = await createPage(selectedProjectId, title);
      setPages((current) => [...current, page]);

      const parsedData = parseMermaidToBoardData(code);

      const boardState = {
        board_items: parsedData.board_items.map((item) => ({
          ...item,
          page_id: page.id,
        })),
        connector_links: parsedData.connector_links.map((link) => ({
          ...link,
          page_id: page.id,
        })),
      };

      await replacePageBoardState(page.id, boardState);
      setSelectedPageId(page.id);
      setMermaidImportDialogOpen(false);
    });
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
        <aside
          className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}
        >
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
                  {selectedProject !== null
                    ? 'Local workspace'
                    : 'Select a project'}
                </p>
              </div>
              <button
                className="ghost-button sidebar-home-button"
                aria-label="Home"
                disabled={isMutating}
                onClick={() => goHome()}
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
                  onClick={openProjectSettingsDialog}
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
                    if (selectedProjectId) {
                      void loadProjectSidebarData(
                        selectedProjectId,
                        selectedPageIdRef.current,
                      );
                    }
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
                      dragState?.kind === 'pages' &&
                      dragState.itemId === page.id;
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
                          handleSidebarDragOver('pages', page.id, event)
                        }
                        onDrop={(event) =>
                          handleSidebarDrop('pages', page.id, event)
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
                                void handleSavePageName(page, pageRenameDraft);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void handleSavePageName(
                                    page,
                                    pageRenameDraft,
                                  );
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
                              pages.length > 1
                                ? `Move page ${page.name}`
                                : undefined
                            }
                            title={
                              pages.length > 1
                                ? `Move page ${page.name}`
                                : undefined
                            }
                            onDragStart={(event) =>
                              handleSidebarDragStart('pages', page.id, event)
                            }
                            onDragEnd={clearDragState}
                            onClick={() => {
                              setSelectedPageId(page.id);
                              setActiveNoteFile(null);
                            }}
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
                                void handleSavePageName(page, pageRenameDraft);
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
                              void handleDeletePage(page);
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
                onClick={() => void handleCreatePage()}
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
                  className="ghost-button sidebar-section-refresh"
                  disabled={isMutating || isLoadingNotes}
                  title="Refresh notes"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selectedProjectId) {
                      const controller = new AbortController();
                      setIsLoadingNotes(true);
                      listProjectNotes(selectedProjectId, controller.signal)
                        .then(setProjectNotes)
                        .catch((error: unknown) => {
                          if (!isAbortError(error)) {
                            setErrorMessage(getErrorMessage(error));
                          }
                        })
                        .finally(() => setIsLoadingNotes(false));
                    }
                  }}
                >
                  <IconRefresh />
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
                          onClick={() => openNoteTab(note.note_file)}
                          onDragStart={(event) =>
                            handleSidebarDragStart(
                              'notes',
                              note.note_file,
                              event,
                            )
                          }
                          onDragEnd={clearDragState}
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
                              void handleDeleteNote(note.note_file);
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

        <section className="workspace">
          {/* ── browser-like tab bar ── */}
          {selectedProject !== null &&
            (() => {
              const visibleTabs = openTabs.filter((tab) => {
                if (tab.kind === 'page') {
                  return pages.some((p) => p.id === tab.id);
                }
                return projectNotes.some((n) => n.note_file === tab.id);
              });
              const lastVisibleTab = visibleTabs.at(-1);
              const lastVisibleTabId =
                lastVisibleTab === undefined
                  ? null
                  : `${lastVisibleTab.kind}:${lastVisibleTab.id}`;

              return (
                <div className="ws-tab-bar ws-tab-bar-bottom">
                  {/* ── Left: Project name ── */}
                  <span
                    className="ws-tab-project-name"
                    title={selectedProject.name}
                    aria-label={`Project: ${selectedProject.name}`}
                  >
                    <span className="ws-tab-project-value">
                      {selectedProject.name}
                    </span>
                  </span>

                  <div className="ws-tab-divider-v" />

                  {/* ── Tab strip ── */}
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
                      if (
                        target instanceof Element &&
                        target.closest('.ws-tab') !== null
                      ) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDropState({
                        kind: 'tabs',
                        itemId: lastVisibleTabId,
                        position: 'after',
                      });
                    }}
                    onDrop={(event) => {
                      const target = event.target;
                      if (
                        target instanceof Element &&
                        target.closest('.ws-tab') !== null
                      ) {
                        return;
                      }

                      event.preventDefault();
                      const currentDragState = dragState;
                      if (
                        currentDragState?.kind !== 'tabs' ||
                        lastVisibleTabId === null
                      ) {
                        clearDragState();
                        return;
                      }

                      const draggedId = currentDragState.itemId;
                      clearDragState();

                      if (draggedId === lastVisibleTabId) return;

                      setOpenTabs((current) => {
                        const items = current.map((tab) => ({
                          tab,
                          id: `${tab.kind}:${tab.id}`,
                        }));
                        const orderedIds = buildDraggedOrder(
                          items,
                          draggedId,
                          lastVisibleTabId,
                          'after',
                        );
                        if (orderedIds === null) return current;

                        const positions = new Map(
                          orderedIds.map((id, index) => [id, index]),
                        );
                        return [...current].sort((left, right) => {
                          const leftId = `${left.kind}:${left.id}`;
                          const rightId = `${right.kind}:${right.id}`;
                          const leftPos = positions.get(leftId) ?? 999;
                          const rightPos = positions.get(rightId) ?? 999;
                          return leftPos - rightPos;
                        });
                      });
                    }}
                  >
                    {visibleTabs.map((tab) => {
                      const isActive =
                        tab.kind === 'page'
                          ? selectedPageId === tab.id && activeNoteFile === null
                          : activeNoteFile === tab.id;

                      const label =
                        tab.kind === 'page'
                          ? (pages.find((p) => p.id === tab.id)?.name ??
                            'Unknown')
                          : (projectNotes.find((n) => n.note_file === tab.id)
                              ?.title ?? tab.id);

                      const isDraggingTab =
                        dragState?.kind === 'tabs' &&
                        dragState.itemId === `${tab.kind}:${tab.id}`;
                      const isDropBefore =
                        dropState?.kind === 'tabs' &&
                        dropState.itemId === `${tab.kind}:${tab.id}` &&
                        dropState.position === 'before';
                      const isDropAfter =
                        dropState?.kind === 'tabs' &&
                        dropState.itemId === `${tab.kind}:${tab.id}` &&
                        dropState.position === 'after';

                      return (
                        <div
                          key={`${tab.kind}:${tab.id}`}
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
                            event.dataTransfer.setData(
                              'text/plain',
                              `tabs:${tab.kind}:${tab.id}`,
                            );
                            setDragState({
                              kind: 'tabs',
                              itemId: `${tab.kind}:${tab.id}`,
                            });
                          }}
                          onDragOver={(event) => {
                            const currentDragState = dragState;
                            if (currentDragState?.kind !== 'tabs') return;
                            if (
                              currentDragState.itemId ===
                              `${tab.kind}:${tab.id}`
                            )
                              return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            const position = getTabDropPosition(event);
                            setDropState({
                              kind: 'tabs',
                              itemId: `${tab.kind}:${tab.id}`,
                              position,
                            });
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const currentDragState = dragState;
                            if (currentDragState?.kind !== 'tabs') {
                              clearDragState();
                              return;
                            }
                            const draggedId = currentDragState.itemId;
                            const targetId = `${tab.kind}:${tab.id}`;
                            const position = getTabDropPosition(event);
                            clearDragState();

                            if (draggedId === targetId) return;

                            setOpenTabs((current) => {
                              const items = current.map((t) => ({
                                tab: t,
                                id: `${t.kind}:${t.id}`,
                              }));
                              const orderedIds = buildDraggedOrder(
                                items,
                                draggedId,
                                targetId,
                                position,
                              );
                              if (orderedIds === null) return current;

                              const positions = new Map(
                                orderedIds.map((id, index) => [id, index]),
                              );
                              return [...current].sort((left, right) => {
                                const leftId = `${left.kind}:${left.id}`;
                                const rightId = `${right.kind}:${right.id}`;
                                const leftPos = positions.get(leftId) ?? 999;
                                const rightPos = positions.get(rightId) ?? 999;
                                return leftPos - rightPos;
                              });
                            });
                          }}
                          onDragEnd={clearDragState}
                        >
                          <button
                            type="button"
                            className="ws-tab-label-btn"
                            title={label}
                            onClick={() => {
                              if (tab.kind === 'page') {
                                setSelectedPageId(tab.id);
                                setActiveNoteFile(null);
                              } else {
                                setActiveNoteFile(tab.id);
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
                            onClick={(e) => {
                              e.stopPropagation();
                              if (tab.kind === 'page') {
                                closePageTab(tab.id);
                              } else {
                                closeNoteTab(tab.id);
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
            })()}

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
                onNotesChanged={() => {
                  if (selectedProjectId !== null) {
                    void refreshProjectNotes(selectedProjectId);
                  }
                }}
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
                onProjectNotesChanged={() => {
                  if (selectedProjectId !== null) {
                    void refreshProjectNotes(selectedProjectId);
                  }
                }}
              />
            )}
          </div>
        </section>
      </main>
      {projectSettingsDialogOpen && selectedProject !== null ? (
        <div
          className="confirmation-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProjectSettingsDialog();
            }
          }}
        >
          <section
            className="project-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-settings-dialog-title"
          >
            <div className="project-settings-dialog-header">
              <div>
                <div className="project-settings-dialog-kicker">
                  Project settings
                </div>
                <h2 id="project-settings-dialog-title">
                  {selectedProject.name}
                </h2>
              </div>
              <button
                type="button"
                className="ghost-button confirmation-dialog-close"
                disabled={isMutating}
                onClick={closeProjectSettingsDialog}
                aria-label="Close project settings dialog"
              >
                X
              </button>
            </div>
            <div className="project-settings-dialog-grid">
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Name</div>
                <label
                  className="sidebar-name-group"
                  htmlFor="sidebar-project-name-input"
                >
                  <span className="sidebar-name-label">Project name</span>
                  <div className="sidebar-name-edit-row">
                    <input
                      id="sidebar-project-name-input"
                      className="sidebar-name-input project-settings-name-input"
                      disabled={isMutating}
                      type="text"
                      value={projectNameDraft}
                      onChange={(event) =>
                        setProjectNameDraft(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSaveProjectName();
                        }
                      }}
                    />
                    <button
                      className="ghost-button sidebar-inline-save"
                      disabled={
                        isMutating ||
                        normalizedProjectNameDraft.length === 0 ||
                        normalizedProjectNameDraft === selectedProject.name
                      }
                      onClick={() => void handleSaveProjectName()}
                    >
                      Save
                    </button>
                  </div>
                </label>
              </section>
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Style</div>
                <label className="sidebar-project-theme-control">
                  <span className="sidebar-name-label">Theme</span>
                  <select
                    disabled={isMutating}
                    value={selectedProject.theme_color}
                    onChange={(event) =>
                      void handleChangeProjectTheme(
                        event.target.value as ProjectThemeColor,
                      )
                    }
                  >
                    {PROJECT_THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Location</div>
                <div className="project-settings-location-row">
                  <code
                    className="project-settings-path"
                    title={selectedProject.path ?? 'No path available'}
                  >
                    {selectedProject.path ?? 'No path available'}
                  </code>
                  <button
                    type="button"
                    className="ghost-button project-settings-reveal-button"
                    disabled={isMutating || !selectedProject.path}
                    onClick={() => void handleRevealProject()}
                    title="Open in file explorer"
                  >
                    <IconFolder />
                    <span>Open Folder</span>
                  </button>
                </div>
              </section>
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Components</div>

                <div className="project-settings-component-group">
                  <div className="project-settings-dialog-kicker">
                    Table & Frame
                  </div>
                  <div className="project-default-style-grid">
                    <ColorPaletteField
                      label="Background"
                      options={BACKGROUND_COLOR_OPTIONS}
                      selectedValue={
                        selectedProjectDefaultStyle.largeObjectBackgroundColor ??
                        BACKGROUND_COLOR_OPTIONS[5].value
                      }
                      tone="background"
                      onSelect={(value) =>
                        void handleChangeProjectDefaultStyle({
                          largeObjectBackgroundColor: value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="project-settings-component-group">
                  <div className="project-settings-dialog-kicker">
                    Textbox & Sticky & Note
                  </div>
                  <div className="project-default-style-grid">
                    <ColorPaletteField
                      label="Background"
                      options={BACKGROUND_COLOR_OPTIONS}
                      selectedValue={
                        selectedProjectDefaultStyle.smallItemBackgroundColor ??
                        BACKGROUND_COLOR_OPTIONS[0].value
                      }
                      tone="background"
                      onSelect={(value) =>
                        void handleChangeProjectDefaultStyle({
                          smallItemBackgroundColor: value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="project-settings-component-group">
                  <div className="project-settings-dialog-kicker">
                    Line & Arrow
                  </div>
                  <div className="project-default-style-grid">
                    <ColorPaletteField
                      label="Stroke"
                      options={STROKE_COLOR_OPTIONS}
                      selectedValue={
                        selectedProjectDefaultStyle.linkColor ??
                        STROKE_COLOR_OPTIONS[0].value
                      }
                      tone="background"
                      onSelect={(value) =>
                        void handleChangeProjectDefaultStyle({
                          linkColor: value,
                        })
                      }
                    />
                    <ColorPaletteField
                      label="Text color"
                      options={TEXT_COLOR_OPTIONS}
                      selectedValue={
                        selectedProjectDefaultStyle.linkTextColor ??
                        selectedProjectDefaultStyle.textColor ??
                        TEXT_COLOR_OPTIONS[0].value
                      }
                      tone="text"
                      onSelect={(value) =>
                        void handleChangeProjectDefaultStyle({
                          linkTextColor: value,
                        })
                      }
                    />
                    <div
                      className="inspector-grid"
                      style={{ marginTop: '8px' }}
                    >
                      <label className="sidebar-project-theme-control project-style-control">
                        <span className="sidebar-name-label">Width</span>
                        <input
                          type="number"
                          min={1}
                          max={16}
                          disabled={isMutating}
                          value={selectedProjectDefaultStyle.strokeWidth ?? 3}
                          onChange={(e) =>
                            void handleChangeProjectDefaultStyle({
                              strokeWidth: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="sidebar-project-theme-control project-style-control">
                        <span className="sidebar-name-label">
                          Text position
                        </span>
                        <select
                          disabled={isMutating}
                          value={
                            selectedProjectDefaultStyle.segmentTextVerticalPosition ??
                            'middle'
                          }
                          onChange={(e) =>
                            void handleChangeProjectDefaultStyle({
                              segmentTextVerticalPosition: e.target
                                .value as ProjectDefaultStyle['segmentTextVerticalPosition'],
                            })
                          }
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="project-settings-component-group">
                  <div className="project-settings-dialog-kicker">Font</div>
                  <div className="project-default-style-grid">
                    <ColorPaletteField
                      label="Text color"
                      options={TEXT_COLOR_OPTIONS}
                      selectedValue={
                        selectedProjectDefaultStyle.textColor ??
                        TEXT_COLOR_OPTIONS[0].value
                      }
                      tone="text"
                      onSelect={(value) =>
                        void handleChangeProjectDefaultStyle({
                          textColor: value,
                        })
                      }
                    />
                    <div
                      className="inspector-grid"
                      style={{ marginTop: '8px' }}
                    >
                      <label className="sidebar-project-theme-control project-style-control">
                        <span className="sidebar-name-label">Size</span>
                        <CommitNumberInput
                          inputKey={`project-default-font-size-${selectedProject?.id ?? 'none'}-${selectedProjectDefaultStyle.fontSize ?? 14}`}
                          min={12}
                          max={32}
                          disabled={isMutating}
                          value={selectedProjectDefaultStyle.fontSize ?? 14}
                          onCommit={(rawValue) => {
                            void handleChangeProjectDefaultStyle({
                              fontSize: Number(rawValue),
                            });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </section>
              <section className="project-settings-panel project-settings-panel-actions">
                <div className="project-settings-panel-heading">Actions</div>
                <p className="confirmation-dialog-copy">
                  Remove this project from the local workspace.
                </p>
                <div className="sidebar-project-action-row">
                  <button
                    type="button"
                    className="ghost-button danger-button sidebar-project-delete-button"
                    disabled={isMutating}
                    onClick={openProjectDeleteDialog}
                  >
                    Delete project
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
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
