import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError, StorageInitializationError } from './httpError.js';
import type { AppSettings } from './settings.js';
import {
  projectThemeColors,
  type BoardItem,
  type BoardItemCreatePayload,
  type BoardItemUpdatePayload,
  type ConnectorLink,
  type ConnectorLinkCreatePayload,
  type ConnectorLinkUpdatePayload,
  type Page,
  type PageBoardData,
  type PageCreatePayload,
  type PageUpdatePayload,
  type PageViewportPayload,
  type Project,
  type ProjectCreatePayload,
  type ProjectIndex,
  type ProjectIndexEntry,
  type ProjectMetadata,
  type ProjectNote,
  type ProjectUpdatePayload,
} from './types.js';

const connectableItemTypes = new Set([
  'text_box',
  'sticky_note',
  'note_paper',
  'frame',
]);
const newPageViewportX = 240;
const newPageViewportY = 160;
const newPageDefaultZoom = 1;
const metadataFilename = 'metadata.json';
const projectIndexFilename = 'project.json';
const projectStoreDirname = 'project_store';
const projectMarkerDirname = '.pv_project';
const noteFileExtension = '.md';

type ProjectEntry = {
  projectDir: string;
  metadata: ProjectMetadata | null;
  project: Project;
};

export function initializeStorage(settings: AppSettings): void {
  ensureDirectory(settings.backendRoot, 'Backend root');
  ensureWritableDirectory(settings.backendRoot, 'Backend root');
  ensureDirectory(settings.planvasRoot, 'Planvas root');
  ensureWritableDirectory(settings.planvasRoot, 'Planvas root');
  ensureDirectory(
    path.join(settings.planvasRoot, projectStoreDirname),
    'Project store',
  );
  ensureWritableDirectory(
    path.join(settings.planvasRoot, projectStoreDirname),
    'Project store',
  );
  ensureDirectory(settings.logsDir, 'Logs directory');
  ensureWritableDirectory(settings.logsDir, 'Logs directory');
  ensureWritableFile(settings.appLogPath, 'App log');
  ensureWritableFile(settings.backendLogPath, 'Backend log');
}

export function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function appendLog(settings: AppSettings, message: string): void {
  const line = `${new Date().toISOString()} INFO [whiteboard.app] ${message}${os.EOL}`;
  fs.appendFileSync(settings.appLogPath, line, 'utf8');
}

export class WhiteboardRepository {
  constructor(private readonly settings: AppSettings) {}

  listProjects(): Project[] {
    const projects = this.iterProjectMetadata({ includeMissing: true }).map(
      (entry) => entry.project,
    );
    return projects.sort((left, right) => {
      const leftStorage = left.storage_kind === 'project_store' ? 0 : 1;
      const rightStorage = right.storage_kind === 'project_store' ? 0 : 1;
      if (leftStorage !== rightStorage) return leftStorage - rightStorage;
      const leftMissing = left.path_exists === false ? 1 : 0;
      const rightMissing = right.path_exists === false ? 1 : 0;
      if (leftMissing !== rightMissing) return leftMissing - rightMissing;
      if (left.sort_order !== right.sort_order)
        return left.sort_order - right.sort_order;
      return left.created_at.localeCompare(right.created_at);
    });
  }

  getProject(projectId: string): Project {
    const { projectDir, metadata } = this.findProjectMetadata(projectId);
    return this.projectFromMetadata(
      metadata,
      projectDir,
      this.storageKindForPath(projectDir),
      true,
    );
  }

  createProject(payload: ProjectCreatePayload): Project {
    const timestamp = utcTimestamp();
    const project: Project = {
      id: randomUUID(),
      name: payload.name,
      theme_color: payload.theme_color,
      sort_order: this.listProjects().length,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const projectDir = uniquePath(
      this.projectStoreDir(),
      slugify(payload.name),
    );
    const metadata: ProjectMetadata = { project, pages: [] };
    fs.mkdirSync(projectDir, { recursive: true });
    this.writeProjectMarker(projectDir);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    this.registerProjectPath(
      projectDir,
      project.id,
      'project_store',
      timestamp,
    );
    return this.projectFromMetadata(
      metadata,
      projectDir,
      'project_store',
      true,
    );
  }

  openProjectPath(projectPath: string): Project {
    const projectDir = path.resolve(expandUser(projectPath));
    if (fs.existsSync(projectDir) && !fs.statSync(projectDir).isDirectory()) {
      throw new HttpError(
        400,
        `Project path '${projectDir}' must be a directory.`,
      );
    }
    const timestamp = utcTimestamp();
    fs.mkdirSync(projectDir, { recursive: true });
    const metadata = this.ensureProjectMetadata(projectDir, timestamp);
    const storageKind = this.storageKindForPath(projectDir);
    const project = this.projectFromMetadata(
      metadata,
      projectDir,
      storageKind,
      true,
    );
    this.writeProjectMarker(projectDir);
    this.registerProjectPath(projectDir, project.id, storageKind, timestamp);
    return this.projectFromMetadata(metadata, projectDir, storageKind, true);
  }

  updateProject(projectId: string, payload: ProjectUpdatePayload): Project {
    const { projectDir, metadata } = this.findProjectMetadata(projectId);
    const project = this.projectFromMetadata(metadata);
    const nextName = payload.name ?? project.name;
    const nextThemeColor = payload.theme_color ?? project.theme_color;
    const timestamp = utcTimestamp();
    const nextProject: Project = {
      ...project,
      name: nextName,
      theme_color: nextThemeColor,
      updated_at: timestamp,
    };
    metadata.project = nextProject;
    let nextDir = projectDir;
    if (
      nextName !== project.name &&
      this.storageKindForPath(projectDir) === 'project_store'
    ) {
      nextDir = uniquePath(this.projectStoreDir(), slugify(nextName));
      fs.renameSync(projectDir, nextDir);
      this.updateProjectIndexPath(projectId, nextDir);
    }
    writeJsonAtomic(this.metadataPath(nextDir), metadata);
    return this.projectFromMetadata(
      metadata,
      nextDir,
      this.storageKindForPath(nextDir),
      true,
    );
  }

  deleteProject(projectId: string): void {
    for (const { projectDir, metadata, project } of this.iterProjectMetadata({
      includeMissing: true,
    })) {
      if (project.id !== projectId) continue;
      if (metadata && this.storageKindForPath(projectDir) === 'project_store') {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      this.removeProjectFromIndex(projectId);
      return;
    }
    throw new HttpError(404, `Project '${projectId}' was not found.`);
  }

  reorderProjects(orderedIds: string[]): Project[] {
    const entries = this.iterProjectMetadata();
    const existingIds = entries
      .filter((entry) => entry.metadata)
      .map((entry) => entry.project.id);
    this.validateReorderIds(existingIds, orderedIds, 'Project');
    const timestamp = utcTimestamp();
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    const projects: Project[] = [];
    for (const { projectDir, metadata, project } of entries) {
      if (!metadata) continue;
      const nextProject = {
        ...project,
        sort_order: orderById.get(project.id) ?? project.sort_order,
        updated_at: timestamp,
      };
      metadata.project = nextProject;
      writeJsonAtomic(this.metadataPath(projectDir), metadata);
      projects.push(
        this.projectFromMetadata(
          metadata,
          projectDir,
          this.storageKindForPath(projectDir),
          true,
        ),
      );
    }
    return projects.sort((left, right) => left.sort_order - right.sort_order);
  }

  listPages(projectId: string): Page[] {
    const { metadata } = this.findProjectMetadata(projectId);
    return this.pagesFromMetadata(metadata);
  }

  listProjectNotes(projectId: string): ProjectNote[] {
    const { projectDir } = this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    if (!fs.existsSync(projectDataDir)) return [];

    return fs
      .readdirSync(projectDataDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          path.extname(entry.name).toLowerCase() === noteFileExtension,
      )
      .map((entry): ProjectNote => {
        const notePath = path.join(projectDataDir, entry.name);
        const content = fs.readFileSync(notePath, 'utf8');
        const stats = fs.statSync(notePath);
        return {
          note_file: entry.name,
          title: getMarkdownH1(content) ?? path.basename(entry.name, noteFileExtension),
          content,
          content_format: 'markdown',
          updated_at: stats.mtime.toISOString(),
        };
      })
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  updateProjectNote(
    projectId: string,
    noteFile: string,
    content: string,
  ): ProjectNote {
    const safeFile = path.basename(noteFile);
    if (safeFile !== noteFile || path.extname(safeFile).toLowerCase() !== noteFileExtension) {
      throw new HttpError(400, 'Invalid note file name.');
    }
    const { projectDir } = this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    const notePath = path.join(projectDataDir, safeFile);
    if (!fs.existsSync(notePath)) {
      throw new HttpError(404, 'Note not found.');
    }
    fs.writeFileSync(notePath, content, 'utf8');
    const stats = fs.statSync(notePath);
    return {
      note_file: safeFile,
      title: getMarkdownH1(content) ?? path.basename(safeFile, noteFileExtension),
      content,
      content_format: 'markdown',
      updated_at: stats.mtime.toISOString(),
    };
  }

  getPage(pageId: string): Page {
    return this.findPageMetadata(pageId).page;
  }

  createPage(projectId: string, payload: PageCreatePayload): Page {
    const { projectDir, metadata } = this.findProjectMetadata(projectId);
    const timestamp = utcTimestamp();
    const pages = this.pagesFromMetadata(metadata);
    const page: Page = {
      id: randomUUID(),
      project_id: projectId,
      name: payload.name,
      sort_order: pages.length,
      viewport_x: newPageViewportX,
      viewport_y: newPageViewportY,
      zoom: newPageDefaultZoom,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const pageFile = uniquePath(
      this.projectDataDir(projectDir),
      slugify(payload.name, 'page'),
      '.xml',
    );
    metadata.pages.push({ ...page, file: path.basename(pageFile) });
    this.touchProject(metadata, timestamp);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    this.writePageXml(pageFile, page, [], []);
    return page;
  }

  updatePage(pageId: string, payload: PageUpdatePayload): Page {
    const { projectDir, metadata, page } = this.findPageMetadata(pageId);
    const nextPage = {
      ...page,
      name: payload.name,
      updated_at: utcTimestamp(),
    };
    this.replacePageEntry(metadata, nextPage);
    this.touchProject(metadata, nextPage.updated_at);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    const board = this.getPageBoardData(pageId);
    this.writePageXml(
      this.pagePath(projectDir, metadata, pageId),
      nextPage,
      board.board_items,
      board.connector_links,
    );
    return nextPage;
  }

  deletePage(pageId: string): void {
    const { projectDir, metadata } = this.findPageMetadata(pageId);
    const pagePath = this.pagePath(projectDir, metadata, pageId);
    metadata.pages = metadata.pages.filter((entry) => entry.id !== pageId);
    this.renumberPages(metadata);
    this.touchProject(metadata, utcTimestamp());
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    fs.rmSync(pagePath, { force: true });
  }

  reorderPages(projectId: string, orderedIds: string[]): Page[] {
    const { projectDir, metadata } = this.findProjectMetadata(projectId);
    const pages = this.pagesFromMetadata(metadata);
    this.validateReorderIds(
      pages.map((page) => page.id),
      orderedIds,
      'Page',
    );
    const timestamp = utcTimestamp();
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    const nextPages = pages.map((page) => ({
      ...page,
      sort_order: orderById.get(page.id) ?? page.sort_order,
      updated_at: timestamp,
    }));
    for (const page of nextPages) this.replacePageEntry(metadata, page);
    this.touchProject(metadata, timestamp);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    return nextPages.sort((left, right) => left.sort_order - right.sort_order);
  }

  duplicatePage(pageId: string): Page {
    const {
      projectDir,
      metadata,
      page: sourcePage,
    } = this.findPageMetadata(pageId);
    const sourceBoard = this.getPageBoardData(pageId);
    const timestamp = utcTimestamp();
    const existingNames = new Set(
      this.pagesFromMetadata(metadata).map((page) => page.name),
    );
    const duplicatedName = this.buildDuplicatePageName(
      existingNames,
      sourcePage.name,
    );
    const duplicatedPage: Page = {
      ...sourcePage,
      id: randomUUID(),
      name: duplicatedName,
      sort_order: sourcePage.sort_order + 1,
      created_at: timestamp,
      updated_at: timestamp,
    };

    for (const entry of metadata.pages) {
      if (entry.sort_order > sourcePage.sort_order) {
        entry.sort_order += 1;
        entry.updated_at = timestamp;
      }
    }

    const duplicatedItemIdBySourceId = new Map(
      sourceBoard.board_items.map((item) => [item.id, randomUUID()]),
    );
    const duplicatedItems = sourceBoard.board_items.map((item) => ({
      ...item,
      id: duplicatedItemIdBySourceId.get(item.id) ?? randomUUID(),
      page_id: duplicatedPage.id,
      parent_item_id: this.getDuplicatedItemReference(
        duplicatedItemIdBySourceId,
        item.parent_item_id,
      ),
      created_at: timestamp,
      updated_at: timestamp,
    }));
    const duplicatedConnectors = sourceBoard.connector_links.map(
      (connector) => ({
        ...connector,
        id: randomUUID(),
        connector_item_id: this.getDuplicatedItemReference(
          duplicatedItemIdBySourceId,
          connector.connector_item_id,
          true,
        ) as string,
        from_item_id: this.getDuplicatedItemReference(
          duplicatedItemIdBySourceId,
          connector.from_item_id,
        ),
        to_item_id: this.getDuplicatedItemReference(
          duplicatedItemIdBySourceId,
          connector.to_item_id,
        ),
      }),
    );

    const pageFile = uniquePath(
      this.projectDataDir(projectDir),
      slugify(duplicatedName, 'page'),
      '.xml',
    );
    metadata.pages.push({ ...duplicatedPage, file: path.basename(pageFile) });
    this.touchProject(metadata, timestamp);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    this.writePageXml(
      pageFile,
      duplicatedPage,
      duplicatedItems,
      duplicatedConnectors,
    );
    return duplicatedPage;
  }

  updatePageViewport(pageId: string, payload: PageViewportPayload): Page {
    const { projectDir, metadata, page } = this.findPageMetadata(pageId);
    const nextPage = {
      ...page,
      viewport_x: payload.viewport_x,
      viewport_y: payload.viewport_y,
      zoom: payload.zoom,
      updated_at: utcTimestamp(),
    };
    const board = this.getPageBoardData(pageId);
    this.replacePageEntry(metadata, nextPage);
    this.touchProject(metadata, nextPage.updated_at);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    this.writePageXml(
      this.pagePath(projectDir, metadata, pageId),
      nextPage,
      board.board_items,
      board.connector_links,
    );
    return nextPage;
  }

  listBoardItems(pageId: string): BoardItem[] {
    return this.readPageXml(pageId).boardItems;
  }

  getBoardItem(itemId: string): BoardItem {
    for (const page of this.allPages()) {
      for (const item of this.readPageXml(page.id).boardItems) {
        if (item.id === itemId) return item;
      }
    }
    throw new HttpError(404, `Board item '${itemId}' was not found.`);
  }

  createBoardItem(payload: BoardItemCreatePayload): BoardItem {
    const page = this.getPage(payload.page_id);
    if (payload.parent_item_id) {
      const parent = this.getBoardItem(payload.parent_item_id);
      if (parent.page_id !== payload.page_id) {
        throw new HttpError(
          400,
          'Board item parent must belong to the same page.',
        );
      }
    }
    const item: BoardItem = {
      ...payload,
      id: randomUUID(),
      created_at: utcTimestamp(),
      updated_at: utcTimestamp(),
    };
    const { boardItems, connectorLinks } = this.readPageXml(page.id);
    const { projectDir } = this.findPageMetadata(page.id);
    const persistedItem = this.writeMarkdownBackedNote(
      this.projectDataDir(projectDir),
      item,
    );
    boardItems.push(persistedItem);
    this.persistPageBoard(page, boardItems, connectorLinks);
    return this.readMarkdownBackedNote(
      this.projectDataDir(projectDir),
      persistedItem,
    );
  }

  updateBoardItem(itemId: string, payload: BoardItemUpdatePayload): BoardItem {
    const page = this.getPage(payload.page_id);
    if (payload.parent_item_id) {
      const parent = this.getBoardItem(payload.parent_item_id);
      if (parent.page_id !== payload.page_id) {
        throw new HttpError(
          400,
          'Board item parent must belong to the same page.',
        );
      }
    }
    const { boardItems, connectorLinks } = this.readPageXml(payload.page_id);
    const index = boardItems.findIndex((item) => item.id === itemId);
    if (index === -1)
      throw new HttpError(404, `Board item '${itemId}' was not found.`);
    const { projectDir, metadata } = this.findPageMetadata(payload.page_id);
    const previousNoteFile =
      boardItems[index].type === 'note_paper'
        ? this.noteFileFromDataJson(boardItems[index].data_json)
        : null;
    const nextItem = {
      ...payload,
      id: itemId,
      created_at: boardItems[index].created_at,
      updated_at: utcTimestamp(),
    };
    boardItems[index] = nextItem;
    this.persistPageBoard(page, boardItems, connectorLinks);
    const nextNoteFile =
      nextItem.type === 'note_paper'
        ? this.noteFileFromDataJson(nextItem.data_json)
        : null;
    if (previousNoteFile && nextNoteFile && previousNoteFile !== nextNoteFile) {
      this.renameProjectNoteFile(projectDir, metadata, previousNoteFile, nextNoteFile);
    }
    return nextItem;
  }

  deleteBoardItem(itemId: string): void {
    const page = this.findPageForBoardItem(itemId);
    let { boardItems, connectorLinks } = this.readPageXml(page.id);
    if (!boardItems.some((item) => item.id === itemId)) {
      throw new HttpError(404, `Board item '${itemId}' was not found.`);
    }
    const relatedArrowIds = new Set(
      connectorLinks
        .filter(
          (connector) =>
            (connector.from_item_id === itemId ||
              connector.to_item_id === itemId) &&
            connector.connector_item_id !== itemId,
        )
        .map((connector) => connector.connector_item_id),
    );
    const deleteIds = new Set([itemId, ...relatedArrowIds]);
    boardItems = boardItems.filter(
      (item) =>
        !deleteIds.has(item.id) &&
        !(item.parent_item_id && deleteIds.has(item.parent_item_id)),
    );
    const remainingIds = new Set(boardItems.map((item) => item.id));
    connectorLinks = connectorLinks.filter(
      (connector) =>
        remainingIds.has(connector.connector_item_id) &&
        (!connector.from_item_id || remainingIds.has(connector.from_item_id)) &&
        (!connector.to_item_id || remainingIds.has(connector.to_item_id)),
    );
    this.persistPageBoard(page, boardItems, connectorLinks);
  }

  listConnectorLinks(pageId: string): ConnectorLink[] {
    return this.readPageXml(pageId).connectorLinks;
  }

  getConnectorLink(connectorId: string): ConnectorLink {
    for (const page of this.allPages()) {
      for (const connector of this.readPageXml(page.id).connectorLinks) {
        if (connector.id === connectorId) return connector;
      }
    }
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  createConnectorLink(payload: ConnectorLinkCreatePayload): ConnectorLink {
    const connectorItem = this.validateConnectorPayload(payload);
    const connector = { ...payload, id: randomUUID() };
    const { boardItems, connectorLinks } = this.readPageXml(
      connectorItem.page_id,
    );
    connectorLinks.push(connector);
    this.persistPageBoard(
      this.getPage(connectorItem.page_id),
      boardItems,
      connectorLinks,
    );
    return connector;
  }

  updateConnectorLink(
    connectorId: string,
    payload: ConnectorLinkUpdatePayload,
  ): ConnectorLink {
    const connectorItem = this.validateConnectorPayload(payload);
    const { boardItems, connectorLinks } = this.readPageXml(
      connectorItem.page_id,
    );
    const index = connectorLinks.findIndex(
      (connector) => connector.id === connectorId,
    );
    if (index === -1)
      throw new HttpError(404, `Connector '${connectorId}' was not found.`);
    const nextConnector = { ...payload, id: connectorId };
    connectorLinks[index] = nextConnector;
    this.persistPageBoard(
      this.getPage(connectorItem.page_id),
      boardItems,
      connectorLinks,
    );
    return nextConnector;
  }

  deleteConnectorLink(connectorId: string): void {
    const page = this.findPageForConnector(connectorId);
    const { boardItems, connectorLinks } = this.readPageXml(page.id);
    const nextConnectors = connectorLinks.filter(
      (connector) => connector.id !== connectorId,
    );
    if (nextConnectors.length === connectorLinks.length) {
      throw new HttpError(404, `Connector '${connectorId}' was not found.`);
    }
    this.persistPageBoard(page, boardItems, nextConnectors);
  }

  replacePageBoardState(
    pageId: string,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): PageBoardData {
    const page = this.getPage(pageId);
    this.validateBoardStatePayload(pageId, boardItems, connectorLinks);
    this.persistPageBoard(page, boardItems, connectorLinks);
    return this.getPageBoardData(pageId);
  }

  getPageBoardData(pageId: string): PageBoardData {
    const nextPage = this.getPage(pageId);
    const { boardItems, connectorLinks } = this.readPageXml(pageId);
    return {
      page: nextPage,
      board_items: boardItems,
      connector_links: connectorLinks,
    };
  }

  private projectStoreDir(): string {
    return path.join(this.settings.planvasRoot, projectStoreDirname);
  }

  private projectIndexPath(): string {
    return path.join(this.settings.planvasRoot, projectIndexFilename);
  }

  private projectDataDir(projectDir: string): string {
    return path.join(projectDir, projectMarkerDirname);
  }

  private metadataPath(projectDir: string): string {
    return path.join(this.projectDataDir(projectDir), metadataFilename);
  }

  private legacyMetadataPath(projectDir: string): string {
    return path.join(projectDir, metadataFilename);
  }

  private readProjectIndex(): ProjectIndex {
    const indexPath = this.projectIndexPath();
    if (!fs.existsSync(indexPath)) return { version: 1, projects: [] };
    const payload = readJson(indexPath);
    return {
      version: 1,
      projects: Array.isArray(payload.projects)
        ? payload.projects.filter(isProjectIndexEntry)
        : [],
    };
  }

  private writeProjectIndex(index: ProjectIndex): void {
    writeJsonAtomic(this.projectIndexPath(), index);
  }

  private storageKindForPath(projectDir: string): 'project_store' | 'external' {
    const relative = path.relative(
      path.resolve(this.projectStoreDir()),
      path.resolve(projectDir),
    );
    return relative !== '' &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
      ? 'project_store'
      : 'external';
  }

  private writeProjectMarker(projectDir: string): void {
    const markerPath = this.projectDataDir(projectDir);
    if (fs.existsSync(markerPath) && !fs.statSync(markerPath).isDirectory()) {
      fs.rmSync(markerPath, { force: true });
    }
    fs.mkdirSync(markerPath, { recursive: true });
  }

  private ensureProjectMetadata(
    projectDir: string,
    timestamp: string,
  ): ProjectMetadata {
    const markerPath = this.projectDataDir(projectDir);
    const metadataPath = this.metadataPath(projectDir);
    const legacyMetadataPath = this.legacyMetadataPath(projectDir);
    const hadPlanvasDataDir =
      fs.existsSync(markerPath) && fs.statSync(markerPath).isDirectory();
    this.writeProjectMarker(projectDir);

    let metadata: Partial<ProjectMetadata> = {};
    try {
      if (fs.existsSync(metadataPath))
        metadata = readJson(metadataPath) as Partial<ProjectMetadata>;
      else if (fs.existsSync(legacyMetadataPath))
        metadata = readJson(legacyMetadataPath) as Partial<ProjectMetadata>;
    } catch (error) {
      if (hadPlanvasDataDir) throw error;
      metadata = {};
    }

    let changed = false;
    if (!metadata.project || !isProject(metadata.project)) {
      metadata.project = {
        id: randomUUID(),
        name: path.basename(projectDir) || 'Untitled Project',
        theme_color: 'default',
        sort_order: this.listProjects().length,
        created_at: timestamp,
        updated_at: timestamp,
      };
      changed = true;
    } else if (!projectThemeColors.includes(metadata.project.theme_color)) {
      metadata.project.theme_color = 'default';
      changed = true;
    }

    if (!Array.isArray(metadata.pages)) {
      metadata.pages = [];
      changed = true;
    }

    const completeMetadata = metadata as ProjectMetadata;
    if (changed || !fs.existsSync(metadataPath))
      writeJsonAtomic(metadataPath, completeMetadata);
    return completeMetadata;
  }

  private registerProjectPath(
    projectDir: string,
    projectId: string,
    storageKind: 'project_store' | 'external',
    timestamp: string,
  ): void {
    const index = this.readProjectIndex();
    const resolvedPath = path.resolve(projectDir);
    const entry = index.projects.find(
      (item) => item.project_id === projectId || item.path === resolvedPath,
    );
    if (!entry) {
      index.projects.push({
        project_id: projectId,
        path: resolvedPath,
        storage_kind: storageKind,
        sort_order: index.projects.length,
        added_at: timestamp,
        last_seen_at: timestamp,
      });
    } else {
      entry.project_id = projectId;
      entry.path = resolvedPath;
      entry.storage_kind = storageKind;
      entry.last_seen_at = timestamp;
    }
    this.writeProjectIndex(index);
  }

  private updateProjectIndexPath(projectId: string, projectDir: string): void {
    const index = this.readProjectIndex();
    const entry = index.projects.find((item) => item.project_id === projectId);
    if (entry) {
      entry.path = path.resolve(projectDir);
      entry.storage_kind = this.storageKindForPath(projectDir);
      entry.last_seen_at = utcTimestamp();
    }
    this.writeProjectIndex(index);
  }

  private removeProjectFromIndex(projectId: string): void {
    const index = this.readProjectIndex();
    index.projects = index.projects.filter(
      (entry) => entry.project_id !== projectId,
    );
    this.writeProjectIndex(index);
  }

  private refreshProjectIndex(): ProjectIndex {
    const timestamp = utcTimestamp();
    const index = this.readProjectIndex();
    const entryById = new Map(
      index.projects.map((entry) => [entry.project_id, entry]),
    );

    for (const projectDir of this.discoverProjectStoreDirs()) {
      const metadata = this.ensureProjectMetadata(projectDir, timestamp);
      const project = this.projectFromMetadata(
        metadata,
        projectDir,
        'project_store',
        true,
      );
      let entry = entryById.get(project.id);
      if (!entry) {
        entry = {
          project_id: project.id,
          path: path.resolve(projectDir),
          storage_kind: 'project_store',
          sort_order: index.projects.length,
          added_at: project.created_at,
          last_seen_at: timestamp,
        };
        index.projects.push(entry);
        entryById.set(project.id, entry);
      } else {
        entry.path = path.resolve(projectDir);
        entry.storage_kind = 'project_store';
        entry.last_seen_at = timestamp;
      }
    }

    for (const entry of index.projects) {
      if (
        fs.existsSync(this.metadataPath(entry.path)) ||
        fs.existsSync(this.legacyMetadataPath(entry.path))
      ) {
        entry.last_seen_at = timestamp;
      }
    }
    this.writeProjectIndex(index);
    return index;
  }

  private discoverProjectStoreDirs(): string[] {
    const candidates: string[] = [];
    for (const baseDir of [this.projectStoreDir(), this.settings.planvasRoot]) {
      if (!fs.existsSync(baseDir)) continue;
      for (const childName of fs.readdirSync(baseDir)) {
        if (childName === projectStoreDirname) continue;
        const child = path.join(baseDir, childName);
        if (
          fs.statSync(child).isDirectory() &&
          (fs.existsSync(this.metadataPath(child)) ||
            fs.existsSync(this.legacyMetadataPath(child)))
        ) {
          candidates.push(child);
        }
      }
    }
    return candidates;
  }

  private iterProjectMetadata(
    options: { includeMissing?: boolean } = {},
  ): ProjectEntry[] {
    if (!fs.existsSync(this.settings.planvasRoot)) return [];
    const index = this.refreshProjectIndex();
    const entries: ProjectEntry[] = [];
    for (const entry of index.projects) {
      const projectDir = entry.path;
      const metadataPath = this.metadataPath(projectDir);
      const legacyMetadataPath = this.legacyMetadataPath(projectDir);
      if (
        fs.existsSync(projectDir) &&
        fs.statSync(projectDir).isDirectory() &&
        (fs.existsSync(metadataPath) || fs.existsSync(legacyMetadataPath))
      ) {
        const metadata = fs.existsSync(metadataPath)
          ? (readJson(metadataPath) as ProjectMetadata)
          : this.ensureProjectMetadata(projectDir, utcTimestamp());
        const project = this.projectFromMetadata(
          metadata,
          projectDir,
          entry.storage_kind,
          true,
        );
        entries.push({ projectDir, metadata, project });
      } else if (options.includeMissing) {
        entries.push({
          projectDir,
          metadata: null,
          project: {
            id: entry.project_id,
            name: path.basename(projectDir) || 'Missing Project',
            theme_color: 'default',
            sort_order: entry.sort_order,
            created_at: entry.added_at,
            updated_at: entry.added_at,
            path: projectDir,
            storage_kind: entry.storage_kind,
            path_exists: false,
          },
        });
      }
    }
    return entries;
  }

  private findProjectMetadata(projectId: string): {
    projectDir: string;
    metadata: ProjectMetadata;
  } {
    for (const entry of this.iterProjectMetadata()) {
      if (entry.metadata && entry.project.id === projectId) {
        return { projectDir: entry.projectDir, metadata: entry.metadata };
      }
    }
    throw new HttpError(404, `Project '${projectId}' was not found.`);
  }

  private findPageMetadata(pageId: string): {
    projectDir: string;
    metadata: ProjectMetadata;
    page: Page;
  } {
    for (const entry of this.iterProjectMetadata()) {
      if (!entry.metadata) continue;
      const page = this.pagesFromMetadata(entry.metadata).find(
        (candidate) => candidate.id === pageId,
      );
      if (page)
        return { projectDir: entry.projectDir, metadata: entry.metadata, page };
    }
    throw new HttpError(404, `Page '${pageId}' was not found.`);
  }

  private allPages(): Page[] {
    return this.iterProjectMetadata().flatMap((entry) =>
      entry.metadata ? this.pagesFromMetadata(entry.metadata) : [],
    );
  }

  private projectFromMetadata(
    metadata: ProjectMetadata,
    projectDir?: string,
    storageKind?: 'project_store' | 'external',
    pathExists = true,
  ): Project {
    if (!metadata.project || !isProject(metadata.project)) {
      throw new HttpError(500, 'Project metadata is missing project data.');
    }
    const project = { ...metadata.project };
    if (!projectThemeColors.includes(project.theme_color))
      project.theme_color = 'default';
    if (projectDir) {
      project.path = projectDir;
      project.storage_kind = storageKind ?? this.storageKindForPath(projectDir);
      project.path_exists = pathExists;
    }
    return project;
  }

  private pagesFromMetadata(metadata: ProjectMetadata): Page[] {
    if (!Array.isArray(metadata.pages))
      throw new HttpError(500, 'Project metadata pages data is invalid.');
    return metadata.pages.map(stripPageFile).sort((left, right) => {
      if (left.sort_order !== right.sort_order)
        return left.sort_order - right.sort_order;
      return left.created_at.localeCompare(right.created_at);
    });
  }

  private replacePageEntry(metadata: ProjectMetadata, page: Page): void {
    const entry = metadata.pages.find((candidate) => candidate.id === page.id);
    if (!entry) throw new HttpError(404, `Page '${page.id}' was not found.`);
    const file = entry.file;
    Object.assign(entry, page);
    if (file) entry.file = file;
  }

  private pagePath(
    projectDir: string,
    metadata: ProjectMetadata,
    pageId: string,
  ): string {
    const entry = metadata.pages.find((candidate) => candidate.id === pageId);
    if (!entry) throw new HttpError(404, `Page '${pageId}' was not found.`);
    if (entry.file) {
      const pagePath = path.join(this.projectDataDir(projectDir), entry.file);
      const legacyPagePath = path.join(projectDir, entry.file);
      if (!fs.existsSync(pagePath) && fs.existsSync(legacyPagePath))
        return legacyPagePath;
      return pagePath;
    }
    return path.join(this.projectDataDir(projectDir), `${pageId}.xml`);
  }

  private touchProject(metadata: ProjectMetadata, timestamp: string): void {
    metadata.project = {
      ...this.projectFromMetadata(metadata),
      updated_at: timestamp,
    };
  }

  private renumberPages(metadata: ProjectMetadata): void {
    const timestamp = utcTimestamp();
    for (const [sortOrder, page] of this.pagesFromMetadata(
      metadata,
    ).entries()) {
      this.replacePageEntry(metadata, {
        ...page,
        sort_order: sortOrder,
        updated_at: timestamp,
      });
    }
  }

  private persistPageBoard(
    page: Page,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): void {
    const {
      projectDir,
      metadata,
      page: currentPage,
    } = this.findPageMetadata(page.id);
    const nextPage = { ...currentPage, updated_at: utcTimestamp() };
    this.replacePageEntry(metadata, nextPage);
    this.touchProject(metadata, nextPage.updated_at);
    writeJsonAtomic(this.metadataPath(projectDir), metadata);
    this.writePageXml(
      this.pagePath(projectDir, metadata, page.id),
      nextPage,
      boardItems,
      connectorLinks,
    );
  }

  private readPageXml(pageId: string): {
    boardItems: BoardItem[];
    connectorLinks: ConnectorLink[];
  } {
    const { projectDir, metadata, page } = this.findPageMetadata(pageId);
    return this.readPageXmlFile(
      this.pagePath(projectDir, metadata, pageId),
      page,
      this.projectDataDir(projectDir),
    );
  }

  private readPageXmlFile(
    pagePath: string,
    page: Page,
    projectDataDir: string,
  ): {
    boardItems: BoardItem[];
    connectorLinks: ConnectorLink[];
  } {
    if (!fs.existsSync(pagePath)) return { boardItems: [], connectorLinks: [] };
    let xml: string;
    try {
      xml = fs.readFileSync(pagePath, 'utf8');
    } catch (error) {
      throw new HttpError(500, `Page XML '${pagePath}' could not be read.`);
    }
    const boardItems = [
      ...xml.matchAll(/<board_item\s+([^>]*)>([\s\S]*?)<\/board_item>/g),
    ]
      .map((match) =>
        this.boardItemFromXml(match[1], match[2], page.id, projectDataDir),
      )
      .sort(compareBoardItems);
    const connectorBlock =
      xml.match(/<connector_links>([\s\S]*?)<\/connector_links>/)?.[1] ?? '';
    const connectorLinks = [
      ...connectorBlock.matchAll(/<connector_link\s+([^>]*?)\s*\/>/g),
    ]
      .map((match) => connectorFromAttributes(parseAttributes(match[1])))
      .sort((left, right) => left.id.localeCompare(right.id));
    return { boardItems, connectorLinks };
  }

  private writePageXml(
    pagePath: string,
    page: Page,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): void {
    const projectDataDir = path.dirname(pagePath);
    const lines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      `<page id="${escapeAttribute(page.id)}" project_id="${escapeAttribute(page.project_id)}" name="${escapeAttribute(page.name)}" sort_order="${page.sort_order}" viewport_x="${page.viewport_x}" viewport_y="${page.viewport_y}" zoom="${page.zoom}" created_at="${escapeAttribute(page.created_at)}" updated_at="${escapeAttribute(page.updated_at)}">`,
      '  <board_items>',
    ];
    for (const item of [...boardItems].sort(compareBoardItems)) {
      const persistedItem = this.writeMarkdownBackedNote(projectDataDir, item);
      lines.push(
        `    <board_item id="${escapeAttribute(persistedItem.id)}" page_id="${escapeAttribute(persistedItem.page_id)}" parent_item_id="${escapeAttribute(persistedItem.parent_item_id ?? '')}" category="${escapeAttribute(persistedItem.category)}" type="${escapeAttribute(persistedItem.type)}" x="${persistedItem.x}" y="${persistedItem.y}" width="${persistedItem.width}" height="${persistedItem.height}" rotation="${persistedItem.rotation}" z_index="${persistedItem.z_index}" is_collapsed="${persistedItem.is_collapsed ? 'true' : 'false'}" created_at="${escapeAttribute(persistedItem.created_at)}" updated_at="${escapeAttribute(persistedItem.updated_at)}">`,
      );
      for (const fieldName of [
        'title',
        'content',
        'content_format',
        'style_json',
        'data_json',
      ] as const) {
        const value = persistedItem[fieldName];
        if (value === null) lines.push(`      <${fieldName} />`);
        else
          lines.push(`      <${fieldName}>${escapeText(value)}</${fieldName}>`);
      }
      lines.push('    </board_item>');
    }
    lines.push('  </board_items>', '  <connector_links>');
    for (const connector of [...connectorLinks].sort((left, right) =>
      left.id.localeCompare(right.id),
    )) {
      lines.push(
        `    <connector_link id="${escapeAttribute(connector.id)}" connector_item_id="${escapeAttribute(connector.connector_item_id)}" from_item_id="${escapeAttribute(connector.from_item_id ?? '')}" to_item_id="${escapeAttribute(connector.to_item_id ?? '')}" from_anchor="${escapeAttribute(connector.from_anchor ?? '')}" to_anchor="${escapeAttribute(connector.to_anchor ?? '')}" />`,
      );
    }
    lines.push('  </connector_links>', '</page>', '');
    fs.mkdirSync(path.dirname(pagePath), { recursive: true });
    const tempPath = path.join(
      path.dirname(pagePath),
      `.tmp-${randomUUID()}.xml`,
    );
    fs.writeFileSync(tempPath, lines.join('\n'), 'utf8');
    fs.renameSync(tempPath, pagePath);
  }

  private boardItemFromXml(
    attributeSource: string,
    body: string,
    pageId: string,
    projectDataDir: string,
  ): BoardItem {
    const attributes = parseAttributes(attributeSource);
    const item: BoardItem = {
      id: requiredAttribute(attributes, 'id'),
      page_id: attributes.page_id ?? pageId,
      parent_item_id: blankToNull(attributes.parent_item_id),
      category: requiredAttribute(attributes, 'category'),
      type: requiredAttribute(attributes, 'type'),
      title: childText(body, 'title'),
      content: childText(body, 'content'),
      content_format: childText(body, 'content_format'),
      x: numberAttribute(attributes, 'x'),
      y: numberAttribute(attributes, 'y'),
      width: numberAttribute(attributes, 'width'),
      height: numberAttribute(attributes, 'height'),
      rotation: numberAttribute(attributes, 'rotation'),
      z_index: integerAttribute(attributes, 'z_index'),
      is_collapsed: attributes.is_collapsed === 'true',
      style_json: childText(body, 'style_json'),
      data_json: childText(body, 'data_json'),
      created_at: requiredAttribute(attributes, 'created_at'),
      updated_at: requiredAttribute(attributes, 'updated_at'),
    };
    return this.readMarkdownBackedNote(projectDataDir, item);
  }

  private readMarkdownBackedNote(
    projectDataDir: string,
    item: BoardItem,
  ): BoardItem {
    if (item.type !== 'note_paper') return item;
    const noteFile = this.noteFileFromDataJson(item.data_json);
    if (!noteFile) return item;
    const notePath = this.notePath(projectDataDir, noteFile);
    if (!notePath || !fs.existsSync(notePath)) return item;
    try {
      return {
        ...item,
        content: fs.readFileSync(notePath, 'utf8'),
        content_format: 'markdown',
      };
    } catch {
      return item;
    }
  }

  private writeMarkdownBackedNote(
    projectDataDir: string,
    item: BoardItem,
  ): BoardItem {
    if (item.type !== 'note_paper') return item;
    const existingNoteData = parseJsonObject(item.data_json);
    const existingNoteFile = this.noteFileFromDataJson(item.data_json);
    const noteFile =
      existingNoteFile ??
      path.basename(
        uniquePath(
          projectDataDir,
          slugify(
            getMarkdownH1(item.content) ?? item.title ?? `note-${item.id}`,
            `note-${item.id}`,
          ),
          noteFileExtension,
        ),
      );
    const notePath = this.notePath(projectDataDir, noteFile);
    if (notePath && (item.content !== null || !fs.existsSync(notePath))) {
      fs.mkdirSync(projectDataDir, { recursive: true });
      fs.writeFileSync(notePath, item.content ?? '', 'utf8');
    }
    const noteData = {
      ...existingNoteData,
      noteFile,
      noteFileManaged:
        typeof existingNoteData.noteFileManaged === 'boolean'
          ? existingNoteData.noteFileManaged
          : false,
    };
    return {
      ...item,
      content: null,
      content_format: 'markdown',
      data_json: JSON.stringify(noteData),
    };
  }

  private renameProjectNoteFile(
    projectDir: string,
    metadata: ProjectMetadata,
    previousNoteFile: string,
    nextNoteFile: string,
  ): void {
    const projectDataDir = this.projectDataDir(projectDir);
    const previousPath = this.notePath(projectDataDir, previousNoteFile);
    const nextPath = this.notePath(projectDataDir, nextNoteFile);
    if (!previousPath || !nextPath) return;

    const content = fs.existsSync(nextPath)
      ? fs.readFileSync(nextPath, 'utf8')
      : fs.existsSync(previousPath)
        ? fs.readFileSync(previousPath, 'utf8')
        : '';
    fs.mkdirSync(projectDataDir, { recursive: true });
    fs.writeFileSync(nextPath, content, 'utf8');

    const pages = this.pagesFromMetadata(metadata);
    const timestamp = utcTimestamp();
    let changed = false;
    for (const page of pages) {
      const pagePath = this.pagePath(projectDir, metadata, page.id);
      const { boardItems } = this.readPageXmlFile(
        pagePath,
        page,
        projectDataDir,
      );
      let pageChanged = false;
      const nextBoardItems = boardItems.map((item) => {
        const noteFile = this.noteFileFromDataJson(item.data_json);
        if (noteFile !== previousNoteFile) return item;
        pageChanged = true;
        return {
          ...item,
          content,
          data_json: JSON.stringify({
            ...parseJsonObject(item.data_json),
            noteFile: nextNoteFile,
            noteFileManaged: false,
          }),
          updated_at: timestamp,
        };
      });

      if (!pageChanged) continue;
      changed = true;
      const { connectorLinks } = this.readPageXmlFile(
        pagePath,
        page,
        projectDataDir,
      );
      const nextPage = { ...page, updated_at: timestamp };
      this.replacePageEntry(metadata, nextPage);
      this.writePageXml(pagePath, nextPage, nextBoardItems, connectorLinks);
    }

    if (changed) {
      this.touchProject(metadata, timestamp);
      writeJsonAtomic(this.metadataPath(projectDir), metadata);
    }
    if (fs.existsSync(previousPath)) fs.rmSync(previousPath, { force: true });
  }

  private noteFileFromDataJson(dataJson: string | null): string | null {
    const noteFile = parseJsonObject(dataJson).noteFile;
    if (typeof noteFile !== 'string' || noteFile.trim().length === 0)
      return null;
    return path.basename(noteFile);
  }

  private notePath(projectDataDir: string, noteFile: string): string | null {
    const safeFile = path.basename(noteFile);
    if (path.extname(safeFile).toLowerCase() !== noteFileExtension) return null;
    const notePath = path.resolve(projectDataDir, safeFile);
    const relative = path.relative(path.resolve(projectDataDir), notePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return notePath;
  }

  private findPageForBoardItem(itemId: string): Page {
    for (const page of this.allPages()) {
      if (
        this.readPageXml(page.id).boardItems.some((item) => item.id === itemId)
      )
        return page;
    }
    throw new HttpError(404, `Board item '${itemId}' was not found.`);
  }

  private findPageForConnector(connectorId: string): Page {
    for (const page of this.allPages()) {
      if (
        this.readPageXml(page.id).connectorLinks.some(
          (connector) => connector.id === connectorId,
        )
      )
        return page;
    }
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  private validateBoardStatePayload(
    pageId: string,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): void {
    const itemIds = boardItems.map((item) => item.id);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new HttpError(
        400,
        'Board state contains duplicate board item ids.',
      );
    }
    const connectorIds = connectorLinks.map((connector) => connector.id);
    if (new Set(connectorIds).size !== connectorIds.length) {
      throw new HttpError(400, 'Board state contains duplicate connector ids.');
    }
    const itemById = new Map(boardItems.map((item) => [item.id, item]));
    for (const item of boardItems) {
      if (item.page_id !== pageId) {
        throw new HttpError(
          400,
          'Board state items must belong to the target page.',
        );
      }
      if (item.parent_item_id && !itemById.has(item.parent_item_id)) {
        throw new HttpError(
          400,
          'Board state item parent references must exist in the payload.',
        );
      }
    }
    for (const connector of connectorLinks) {
      const connectorItem = itemById.get(connector.connector_item_id);
      if (!connectorItem) {
        throw new HttpError(
          400,
          'Board state connector item references must exist in the payload.',
        );
      }
      this.validateConnectorTargets(
        connectorItem,
        connector.from_item_id
          ? (itemById.get(connector.from_item_id) ?? null)
          : null,
        connector.to_item_id
          ? (itemById.get(connector.to_item_id) ?? null)
          : null,
      );
      if (connector.from_item_id && !itemById.has(connector.from_item_id)) {
        throw new HttpError(
          400,
          'Board state connector from item references must exist in the payload.',
        );
      }
      if (connector.to_item_id && !itemById.has(connector.to_item_id)) {
        throw new HttpError(
          400,
          'Board state connector to item references must exist in the payload.',
        );
      }
    }
  }

  private validateReorderIds(
    existingIds: string[],
    orderedIds: string[],
    entityLabel: string,
  ): void {
    if (
      existingIds.length !== orderedIds.length ||
      !sameStringSet(existingIds, orderedIds)
    ) {
      throw new HttpError(
        400,
        `${entityLabel} reorder payload must contain every existing id exactly once.`,
      );
    }
  }

  private buildDuplicatePageName(
    existingNames: Set<string>,
    sourceName: string,
  ): string {
    let candidate = `${sourceName} Copy`;
    let copyIndex = 2;
    while (existingNames.has(candidate)) {
      candidate = `${sourceName} Copy ${copyIndex}`;
      copyIndex += 1;
    }
    return candidate;
  }

  private getDuplicatedItemReference(
    duplicatedItemIdBySourceId: Map<string, string>,
    sourceItemId: string | null,
    required = false,
  ): string | null {
    if (!sourceItemId) return null;
    const duplicatedItemId = duplicatedItemIdBySourceId.get(sourceItemId);
    if (!duplicatedItemId && required) {
      throw new HttpError(
        500,
        'Duplicated page data is missing a required board item reference.',
      );
    }
    return duplicatedItemId ?? null;
  }

  private validateConnectorPayload(
    payload: ConnectorLinkCreatePayload | ConnectorLinkUpdatePayload,
  ): BoardItem {
    const connectorItem = this.getBoardItem(payload.connector_item_id);
    const fromItem = payload.from_item_id
      ? this.getBoardItem(payload.from_item_id)
      : null;
    const toItem = payload.to_item_id
      ? this.getBoardItem(payload.to_item_id)
      : null;
    this.validateConnectorTargets(connectorItem, fromItem, toItem);
    return connectorItem;
  }

  private validateConnectorTargets(
    connectorItem: BoardItem,
    fromItem: BoardItem | null,
    toItem: BoardItem | null,
  ): void {
    if (
      connectorItem.type !== 'arrow' ||
      connectorItem.category !== 'connector'
    ) {
      throw new HttpError(400, 'Connector item must be an arrow board item.');
    }
    for (const [role, targetItem] of [
      ['from', fromItem],
      ['to', toItem],
    ] as const) {
      if (!targetItem) continue;
      if (targetItem.page_id !== connectorItem.page_id) {
        throw new HttpError(
          400,
          `Connector ${role} item must be on the same page as the arrow.`,
        );
      }
      if (!connectableItemTypes.has(targetItem.type)) {
        throw new HttpError(
          400,
          'Arrow endpoints can only connect to text_box, sticky_note, note_paper, or frame items.',
        );
      }
    }
  }
}

function ensureDirectory(targetPath: string, label: string): void {
  if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
    throw new StorageInitializationError(
      `${label} '${targetPath}' must be a directory.`,
    );
  }
  try {
    fs.mkdirSync(targetPath, { recursive: true });
  } catch (error) {
    throw new StorageInitializationError(
      `Failed to create ${label.toLowerCase()} '${targetPath}': ${String(error)}`,
    );
  }
}

function ensureWritableDirectory(targetPath: string, label: string): void {
  const probePath = path.join(
    targetPath,
    `.planvas-write-test-${randomUUID()}`,
  );
  try {
    fs.writeFileSync(probePath, '', 'utf8');
  } catch (error) {
    throw new StorageInitializationError(
      `${label} '${targetPath}' is not writable: ${String(error)}`,
    );
  } finally {
    fs.rmSync(probePath, { force: true });
  }
}

function ensureWritableFile(targetPath: string, label: string): void {
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.closeSync(fs.openSync(targetPath, 'a'));
  } catch (error) {
    throw new StorageInitializationError(
      `${label} '${targetPath}' is not writable: ${String(error)}`,
    );
  }
}

function slugify(value: string, fallback = 'untitled'): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return normalized.slice(0, 80) || fallback;
}

function uniquePath(parent: string, stem: string, suffix = ''): string {
  let candidate = path.join(parent, `${stem}${suffix}`);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parent, `${stem}-${index}${suffix}`);
    index += 1;
  }
  return candidate;
}

function writeJsonAtomic(targetPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.tmp-${randomUUID()}.json`,
  );
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, targetPath);
}

function readJson(targetPath: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as unknown;
    if (
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload)
    ) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // handled below
  }
  throw new HttpError(
    500,
    `Project metadata '${targetPath}' could not be read.`,
  );
}

function parseJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Legacy data_json values are not guaranteed to be JSON objects.
  }
  return {};
}

function getMarkdownH1(value: string | null): string | null {
  if (!value) return null;
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return null;
}

function expandUser(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function isProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Project>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.theme_color === 'string' &&
    typeof candidate.sort_order === 'number' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function isProjectIndexEntry(value: unknown): value is ProjectIndexEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProjectIndexEntry>;
  return (
    typeof candidate.project_id === 'string' &&
    typeof candidate.path === 'string' &&
    (candidate.storage_kind === 'project_store' ||
      candidate.storage_kind === 'external') &&
    typeof candidate.sort_order === 'number' &&
    typeof candidate.added_at === 'string' &&
    typeof candidate.last_seen_at === 'string'
  );
}

function stripPageFile(page: Page & { file?: string }): Page {
  const { file: _file, ...rest } = page;
  return rest;
}

function compareBoardItems(left: BoardItem, right: BoardItem): number {
  if (left.z_index !== right.z_index) return left.z_index - right.z_index;
  return left.created_at.localeCompare(right.created_at);
}

function sameStringSet(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_][A-Za-z0-9_-]*)="([^"]*)"/g)) {
    attributes[match[1]] = unescapeXml(match[2]);
  }
  return attributes;
}

function requiredAttribute(
  attributes: Record<string, string>,
  name: string,
): string {
  const value = attributes[name];
  if (value === undefined)
    throw new HttpError(500, `Page XML is missing '${name}'.`);
  return value;
}

function numberAttribute(
  attributes: Record<string, string>,
  name: string,
): number {
  return Number(requiredAttribute(attributes, name));
}

function integerAttribute(
  attributes: Record<string, string>,
  name: string,
): number {
  return Number.parseInt(requiredAttribute(attributes, name), 10);
}

function childText(body: string, tagName: string): string | null {
  const match = body.match(
    new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`),
  );
  return match ? unescapeXml(match[1]) : null;
}

function blankToNull(value: string | undefined): string | null {
  return value ? value : null;
}

function connectorFromAttributes(
  attributes: Record<string, string>,
): ConnectorLink {
  return {
    id: requiredAttribute(attributes, 'id'),
    connector_item_id: requiredAttribute(attributes, 'connector_item_id'),
    from_item_id: blankToNull(attributes.from_item_id),
    to_item_id: blankToNull(attributes.to_item_id),
    from_anchor: blankToNull(attributes.from_anchor),
    to_anchor: blankToNull(attributes.to_anchor),
  };
}
