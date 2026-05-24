import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  getHealth,
  listProjects,
  listPages,
  listProjectNotes,
  type Project,
  type Page,
  type ProjectNote,
  type PageBoardData,
} from '../services/api';
import {
  buildAppRouteUrl,
  readAppRoute,
  type AppRoute,
} from '../appRoute';
import {
  selectFallbackId,
  resolveProjectEntryPageId,
} from '../utils/workspaceNavigation';
import { syncPageViewport } from '../utils/pageViewport';
import { getErrorMessage } from '../utils/index';

export const UNLOADED_PAGE_BOARD_CACHE = Symbol('unloaded-page-board-cache');

export type PageBoardCacheEntry =
  | PageBoardData
  | typeof UNLOADED_PAGE_BOARD_CACHE;

export interface UseWorkspaceDataParams {
  appView: 'home' | 'workspace';
  setAppView: Dispatch<SetStateAction<'home' | 'workspace'>>;
}

export interface UseWorkspaceDataResult {
  loadState: 'loading' | 'ready' | 'error';
  setLoadState: Dispatch<SetStateAction<'loading' | 'ready' | 'error'>>;
  errorMessage: string | null;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  projects: Project[];
  setProjects: Dispatch<SetStateAction<Project[]>>;
  pages: Page[];
  setPages: Dispatch<SetStateAction<Page[]>>;
  projectNotes: ProjectNote[];
  setProjectNotes: Dispatch<SetStateAction<ProjectNote[]>>;
  selectedProjectId: string | null;
  setSelectedProjectId: Dispatch<SetStateAction<string | null>>;
  selectedPageId: string | null;
  setSelectedPageId: Dispatch<SetStateAction<string | null>>;
  pageRefreshTokenById: Record<string, number>;
  setPageRefreshTokenById: Dispatch<SetStateAction<Record<string, number>>>;
  isLoadingPages: boolean;
  isLoadingNotes: boolean;
  selectedProject: Project | null;
  selectedPage: Page | null;
  pageBoardCacheRef: React.MutableRefObject<Map<string, PageBoardCacheEntry>>;
  selectedPageIdRef: React.MutableRefObject<string | null>;
  loadWorkspace: (signal?: AbortSignal) => Promise<void>;
  loadProjectSidebarData: (
    projectId: string,
    preferredPageId?: string | null,
    signal?: AbortSignal,
  ) => Promise<void>;
  refreshProjectNotes: (projectId: string) => Promise<void>;
  refreshCurrentProjectFromDisk: () => Promise<void>;
  handlePageViewportChange: (
    pageId: string,
    viewport: { x: number; y: number; zoom: number },
  ) => void;
  goHome: (mode?: 'push' | 'replace') => void;
  openProject: (
    projectId: string,
    preferredPageId: string | null,
    mode?: 'push' | 'replace',
  ) => void;
  updateCachedPageBoardData: (data: PageBoardData) => void;
  clearCachedPageBoardData: (pageId: string) => void;
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}



export function useWorkspaceData({
  appView,
  setAppView,
}: UseWorkspaceDataParams): UseWorkspaceDataResult {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([]);
  const initialRoute = useMemo(() => readAppRoute(window.location.search), []);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.projectId : null,
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.pageId : null,
  );

  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [pageRefreshTokenById, setPageRefreshTokenById] = useState<
    Record<string, number>
  >({});
  const [workspaceEntryToken, setWorkspaceEntryToken] = useState(0);
  const [workspaceEntryRetryToken, setWorkspaceEntryRetryToken] = useState(0);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );

  const pageBoardCacheRef = useRef<Map<string, PageBoardCacheEntry>>(new Map());
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

  const goHome = useCallback(
    (mode: 'push' | 'replace' = 'push'): void => {
      syncBrowserRoute({ view: 'home' }, mode);
      pageBoardCacheRef.current.clear();
      setAppView('home');
    },
    [setAppView],
  );

  const openProject = useCallback(
    (
      projectId: string,
      preferredPageId: string | null,
      mode: 'push' | 'replace' = 'push',
    ): void => {
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
      setSelectedProjectId(projectId);
      setAppView('workspace');
      setWorkspaceEntryToken((current) => current + 1);
    },
    [pages, selectedProjectId, setAppView],
  );

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
    [appView, setAppView],
  );

  const refreshProjectNotes = useCallback(
    async (projectId: string): Promise<void> => {
      setIsLoadingNotes(true);
      try {
        const nextNotes = await listProjectNotes(projectId);
        setProjectNotes(nextNotes);
      } finally {
        setIsLoadingNotes(false);
      }
    },
    [],
  );

  const refreshCurrentProjectFromDisk = useCallback(async (): Promise<void> => {
    if (selectedProjectId === null) {
      return;
    }

    try {
      await refreshProjectNotes(selectedProjectId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }, [refreshProjectNotes, selectedProjectId]);

  // Initial load
  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  // popstate router integration
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
  }, [setAppView]);

  // sync route parameters to view states
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

  // verify project existence
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
  }, [appView, loadState, projects, selectedProjectId, setAppView]);

  // fetch project sidebar data on project/token change
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

  // retry entry timeout
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

  // retry load sidebar data
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

  // focus listener for refreshing project notes
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

  return {
    loadState,
    setLoadState,
    errorMessage,
    setErrorMessage,
    projects,
    setProjects,
    pages,
    setPages,
    projectNotes,
    setProjectNotes,
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
    loadWorkspace,
    loadProjectSidebarData,
    refreshProjectNotes,
    refreshCurrentProjectFromDisk,
    handlePageViewportChange,
    goHome,
    openProject,
    updateCachedPageBoardData,
    clearCachedPageBoardData,
  };
}
