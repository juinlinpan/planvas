import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { HttpError } from '../httpError.js';
import type { AppSettings } from '../settings.js';
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
  type PageRegulateReport,
  type PageRegulateResult,
  type PageUpdatePayload,
  type PageViewportPayload,
  type Project,
  type ProjectCreatePayload,
  type ProjectIndex,
  type ProjectIndexEntry,
  type ProjectMetadata,
  type ProjectNote,
  type ProjectUpdatePayload,
} from '../types.js';
import {
  compareProjectIndexEntries,
  dedupeProjectIndexEntriesByPath,
  ensureDirectory,
  ensureWritableDirectory,
  ensureWritableFile,
  exists,
  getMarkdownH1,
  isProject,
  legacyMetadataPath as storageLegacyMetadataPath,
  metadataPath as storageMetadataPath,
  noteFileExtension,
  parseJsonObject,
  projectDataDir as storageProjectDataDir,
  projectPathKey,
  projectStoreDir as storageProjectStoreDir,
  projectStoreDirname,
  readJson,
  resolveProjectPath,
  sameFilesystemPath,
  slugify,
  storageKindForPath as storageKindForPathForRoot,
  uniquePath,
  writeJsonAtomic,
  writeProjectMarker as writeProjectMarkerDir,
} from './paths.js';
import {
  deletePageXmlFiles,
  pagePathForName,
  readPageRecordFromSemanticXml,
  readPageXmlFile,
  stemPathFromVariantPath,
  uniquePagePath,
  writePageXmlFile,
} from './pageXml.js';
import {
  noteFileFromDataJson,
  notePath,
  readMarkdownBackedNote,
  writeMarkdownBackedNote,
} from './markdownNotes.js';
import {
  regulateBoardItems,
  validateBoardStatePayload,
  validateConnectorPayload as validateConnectorPayloadHelper,
  validateConnectorTargets,
  validateReorderIds,
} from './validationHelpers.js';
import {
  lockIndex,
  ProjectIndexStore,
} from './projectIndex.js';
import { RepositoryStorageContext } from './repositoryStorageContext.js';

const newPageViewportX = 240;
const newPageViewportY = 160;
const newPageDefaultZoom = 1;

type ProjectEntry = {
  projectDir: string;
  metadata: ProjectMetadata | null;
  project: Project;
};

type PageEntry = {
  page: Page;
  pagePath: string;
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

export class WhiteboardRepository extends RepositoryStorageContext {
  async listProjects(): Promise<Project[]> {
    const projects = (await this.iterProjectMetadata({ includeMissing: true })).map(
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

  async getProject(projectId: string): Promise<Project> {
    const { projectDir, metadata } = await this.findProjectMetadata(projectId);
    return this.projectFromMetadata(
      metadata,
      projectDir,
      this.storageKindForPath(projectDir),
      true,
    );
  }

  async createProject(payload: ProjectCreatePayload): Promise<Project> {
    const timestamp = utcTimestamp();
    const project: Project = {
      id: randomUUID(),
      name: payload.name,
      theme_color: payload.theme_color,
      default_style_json: null,
      sort_order: (await this.listProjects()).length,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const projectDir = await uniquePath(
      this.projectStoreDir(),
      slugify(payload.name),
    );
    const metadata: ProjectMetadata = {
      project: this.storedProjectFromProject(project),
    };
    await fs.promises.mkdir(projectDir, { recursive: true });
    await this.writeProjectMarker(projectDir);
    await writeJsonAtomic(this.metadataPath(projectDir), metadata);
    await this.registerProjectPath(
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

  async openProjectPath(projectPath: string): Promise<Project> {
    const projectDir = resolveProjectPath(projectPath);
    if ((await exists(projectDir)) && !(await fs.promises.stat(projectDir)).isDirectory()) {
      throw new HttpError(
        400,
        `Project path '${projectDir}' must be a directory.`,
      );
    }
    const timestamp = utcTimestamp();
    await fs.promises.mkdir(projectDir, { recursive: true });
    const metadata = await this.ensureProjectMetadata(projectDir, timestamp);
    await this.ensureUniqueProjectIdentity(projectDir, metadata, timestamp);
    const storageKind = this.storageKindForPath(projectDir);
    const project = this.projectFromMetadata(
      metadata,
      projectDir,
      storageKind,
      true,
    );
    await this.writeProjectMarker(projectDir);
    await this.registerProjectPath(projectDir, project.id, storageKind, timestamp);
    return this.projectFromMetadata(metadata, projectDir, storageKind, true);
  }

  async updateProject(projectId: string, payload: ProjectUpdatePayload): Promise<Project> {
    const { projectDir, metadata } = await this.findProjectMetadata(projectId);
    const project = this.projectFromMetadata(metadata);
    const nextName = payload.name ?? project.name;
    const nextThemeColor = payload.theme_color ?? project.theme_color;
    const nextDefaultStyleJson =
      payload.default_style_json === undefined
        ? project.default_style_json
        : payload.default_style_json;
    const nextProject: Project = {
      ...project,
      name: nextName,
      theme_color: nextThemeColor,
      default_style_json: nextDefaultStyleJson,
    };
    metadata.project = this.storedProjectFromProject(nextProject);
    let nextDir = projectDir;
    if (
      nextName !== project.name &&
      this.storageKindForPath(projectDir) === 'project_store'
    ) {
      nextDir = await uniquePath(this.projectStoreDir(), slugify(nextName));
      await fs.promises.rename(projectDir, nextDir);
      await this.updateProjectIndexPath(projectId, nextDir);
    }
    await writeJsonAtomic(this.metadataPath(nextDir), metadata);
    return this.projectFromMetadata(
      metadata,
      nextDir,
      this.storageKindForPath(nextDir),
      true,
    );
  }

  async deleteProject(projectId: string): Promise<void> {
    for (const { projectDir, metadata, project } of await this.iterProjectMetadata({
      includeMissing: true,
    })) {
      if (project.id !== projectId) continue;
      if (metadata && this.storageKindForPath(projectDir) === 'project_store') {
        await fs.promises.rm(projectDir, { recursive: true, force: true });
      }
      await this.removeProjectFromIndex(projectId);
      return;
    }
    throw new HttpError(404, `Project '${projectId}' was not found.`);
  }

  async reorderProjects(orderedIds: string[]): Promise<Project[]> {
    const entries = await this.iterProjectMetadata();
    const existingIds = entries
      .filter((entry) => entry.metadata)
      .map((entry) => entry.project.id);
    this.validateReorderIds(existingIds, orderedIds, 'Project');
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    const projects: Project[] = [];
    for (const { projectDir, metadata, project } of entries) {
      if (!metadata) continue;
      const nextProject: Project = {
        ...project,
        sort_order: orderById.get(project.id) ?? project.sort_order,
      };
      metadata.project = this.storedProjectFromProject(nextProject);
      await writeJsonAtomic(this.metadataPath(projectDir), metadata);
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

  async revealProject(projectId: string): Promise<void> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    if (!(await exists(projectDir))) {
      throw new HttpError(
        404,
        `Project directory '${projectDir}' does not exist.`,
      );
    }

    if (process.platform === 'win32') {
      spawnSync('explorer', [projectDir]);
    } else if (process.platform === 'darwin') {
      spawnSync('open', [projectDir]);
    } else {
      spawnSync('xdg-open', [projectDir]);
    }
  }

  async listPages(projectId: string): Promise<Page[]> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    return this.pagesFromProject(projectDir);
  }

  async listProjectNotes(projectId: string): Promise<ProjectNote[]> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    if (!(await exists(projectDataDir))) return [];

    const entries = await fs.promises.readdir(projectDataDir, { withFileTypes: true });
    const notes: ProjectNote[] = [];
    for (const entry of entries) {
      if (entry.isFile() && path.extname(entry.name).toLowerCase() === noteFileExtension) {
        const notePath = path.join(projectDataDir, entry.name);
        const content = await fs.promises.readFile(notePath, 'utf8');
        const stats = await fs.promises.stat(notePath);
        notes.push({
          note_file: entry.name,
          title:
            getMarkdownH1(content) ??
            path.basename(entry.name, noteFileExtension),
          content,
          content_format: 'markdown',
          updated_at: stats.mtime.toISOString(),
        });
      }
    }
    return notes.sort((left, right) => left.title.localeCompare(right.title));
  }

  async updateProjectNote(
    projectId: string,
    noteFile: string,
    content: string,
  ): Promise<ProjectNote> {
    const safeFile = path.basename(noteFile);
    if (
      safeFile !== noteFile ||
      path.extname(safeFile).toLowerCase() !== noteFileExtension
    ) {
      throw new HttpError(400, 'Invalid note file name.');
    }
    const { projectDir } = await this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    const notePath = path.join(projectDataDir, safeFile);
    if (!(await exists(notePath))) {
      throw new HttpError(404, 'Note not found.');
    }
    await fs.promises.writeFile(notePath, content, 'utf8');
    const stats = await fs.promises.stat(notePath);
    return {
      note_file: safeFile,
      title:
        getMarkdownH1(content) ?? path.basename(safeFile, noteFileExtension),
      content,
      content_format: 'markdown',
      updated_at: stats.mtime.toISOString(),
    };
  }

  async renameProjectNote(
    projectId: string,
    previousNoteFile: string,
    nextNoteFile: string,
  ): Promise<ProjectNote> {
    const safePreviousFile = path.basename(previousNoteFile);
    const safeNextFile = path.basename(nextNoteFile);
    if (
      safePreviousFile !== previousNoteFile ||
      safeNextFile !== nextNoteFile ||
      path.extname(safePreviousFile).toLowerCase() !== noteFileExtension ||
      path.extname(safeNextFile).toLowerCase() !== noteFileExtension
    ) {
      throw new HttpError(400, 'Invalid note file name.');
    }

    const { projectDir } = await this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    const previousPath = this.notePath(projectDataDir, safePreviousFile);
    const nextPath = this.notePath(projectDataDir, safeNextFile);
    if (!previousPath || !(await exists(previousPath))) {
      throw new HttpError(404, 'Note not found.');
    }
    if (!nextPath) {
      throw new HttpError(400, 'Invalid note file name.');
    }
    if (safePreviousFile !== safeNextFile && (await exists(nextPath))) {
      throw new HttpError(409, 'A note with that filename already exists.');
    }

    if (safePreviousFile === safeNextFile) {
      const content = await fs.promises.readFile(previousPath, 'utf8');
      const stats = await fs.promises.stat(previousPath);
      return {
        note_file: safePreviousFile,
        title:
          getMarkdownH1(content) ??
          path.basename(safePreviousFile, noteFileExtension),
        content,
        content_format: 'markdown',
        updated_at: stats.mtime.toISOString(),
      };
    }

    await this.renameProjectNoteFile(projectDir, safePreviousFile, safeNextFile);
    const content = await fs.promises.readFile(nextPath, 'utf8');
    const stats = await fs.promises.stat(nextPath);
    return {
      note_file: safeNextFile,
      title:
        getMarkdownH1(content) ??
        path.basename(safeNextFile, noteFileExtension),
      content,
      content_format: 'markdown',
      updated_at: stats.mtime.toISOString(),
    };
  }

  async getPage(pageId: string): Promise<Page> {
    return (await this.findPageMetadata(pageId)).page;
  }

  async createPage(projectId: string, payload: PageCreatePayload): Promise<Page> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    const timestamp = utcTimestamp();
    const pages = await this.pagesFromProject(projectDir);
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
    const pageFile = await uniquePagePath(
      this.projectDataDir(projectDir),
      slugify(payload.name, 'page'),
    );
    await this.writePageXml(pageFile, page, [], []);
    return page;
  }

  async updatePage(pageId: string, payload: PageUpdatePayload): Promise<Page> {
    const { projectDir, page, pagePath } =
      await this.findPageMetadata(pageId);
    const nextPage = {
      ...page,
      name: payload.name,
      updated_at: utcTimestamp(),
    };
    const nextPagePath = await pagePathForName(
      this.projectDataDir(projectDir),
      pagePath,
      payload.name,
    );
    const board = await this.getPageBoardData(pageId);
    await this.writePageXml(
      nextPagePath,
      nextPage,
      board.board_items,
      board.connector_links,
    );
    if (!sameFilesystemPath(pagePath, nextPagePath)) {
      await deletePageXmlFiles(pagePath);
    }
    return nextPage;
  }

  async deletePage(pageId: string): Promise<void> {
    const { projectDir, pagePath } = await this.findPageMetadata(pageId);
    await deletePageXmlFiles(pagePath);
    await this.renumberProjectPages(projectDir);
  }

  async reorderPages(projectId: string, orderedIds: string[]): Promise<Page[]> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    const pageEntries = await this.pageEntriesFromProject(projectDir);
    const pages = pageEntries.map((entry) => entry.page);
    this.validateReorderIds(
      pages.map((page) => page.id),
      orderedIds,
      'Page',
    );
    const timestamp = utcTimestamp();
    const orderById = new Map(orderedIds.map((id, index) => [id, index]));
    const nextPages = pageEntries.map(({ page, pagePath }) => ({
      page: {
        ...page,
        sort_order: orderById.get(page.id) ?? page.sort_order,
        updated_at: timestamp,
      },
      pagePath,
    }));
    for (const entry of nextPages) {
      const { boardItems, connectorLinks } = await this.readPageXmlFile(
        entry.pagePath,
        entry.page,
        this.projectDataDir(projectDir),
      );
      await this.writePageXml(entry.pagePath, entry.page, boardItems, connectorLinks);
    }
    return nextPages
      .map((entry) => entry.page)
      .sort((left, right) => left.sort_order - right.sort_order);
  }

  async duplicatePage(pageId: string): Promise<Page> {
    const {
      projectDir,
      page: sourcePage,
    } = await this.findPageMetadata(pageId);
    const sourceBoard = await this.getPageBoardData(pageId);
    const timestamp = utcTimestamp();
    const existingNames = new Set(
      (await this.pagesFromProject(projectDir)).map((page) => page.name),
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

    const shiftedPages = (await this.pageEntriesFromProject(projectDir))
      .filter((entry) => entry.page.sort_order > sourcePage.sort_order)
      .map((entry) => ({
        ...entry,
        page: {
          ...entry.page,
          sort_order: entry.page.sort_order + 1,
          updated_at: timestamp,
        },
      }));

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

    const pageFile = await uniquePagePath(
      this.projectDataDir(projectDir),
      slugify(duplicatedName, 'page'),
    );
    for (const shiftedPage of shiftedPages) {
      const { boardItems, connectorLinks } = await this.readPageXmlFile(
        shiftedPage.pagePath,
        shiftedPage.page,
        this.projectDataDir(projectDir),
      );
      await this.writePageXml(
        shiftedPage.pagePath,
        shiftedPage.page,
        boardItems,
        connectorLinks,
      );
    }
    await this.writePageXml(
      pageFile,
      duplicatedPage,
      duplicatedItems,
      duplicatedConnectors,
    );
    return duplicatedPage;
  }

  async importFromProject(
    targetProjectId: string,
    sourceProjectId: string,
    pageIds: string[],
    noteFiles: string[],
  ): Promise<{ pages: Page[]; notes: ProjectNote[] }> {
    const { projectDir: targetDir } = await this.findProjectMetadata(targetProjectId);
    const { projectDir: sourceDir } = await this.findProjectMetadata(sourceProjectId);

    const targetDataDir = this.projectDataDir(targetDir);
    const sourceDataDir = this.projectDataDir(sourceDir);
    await fs.promises.mkdir(targetDataDir, { recursive: true });

    const timestamp = utcTimestamp();
    const existingPages = await this.pagesFromProject(targetDir);
    let nextSortOrder = existingPages.length;
    const importedPages: Page[] = [];

    for (const pageId of pageIds) {
      const sourcePageEntry = (await this.pageEntriesFromProject(sourceDir)).find(
        (entry) => entry.page.id === pageId,
      );
      if (!sourcePageEntry) continue;

      const { page: sourcePage, pagePath: sourcePagePath } = sourcePageEntry;
      const { boardItems: sourceItems, connectorLinks: sourceConnectors } =
        await this.readPageXmlFile(sourcePagePath, sourcePage, sourceDataDir);

      const itemIdMap = new Map(
        sourceItems.map((item) => [item.id, randomUUID()]),
      );

      // Copy note_paper backing files referenced by this page
      const noteFileCopyMap = new Map<string, string>();
      for (const item of sourceItems) {
        if (item.type !== 'note_paper') continue;
        const srcNoteFile = this.noteFileFromDataJson(item.data_json);
        if (!srcNoteFile || noteFileCopyMap.has(srcNoteFile)) continue;
        const srcNotePath = path.join(sourceDataDir, srcNoteFile);
        if (!(await exists(srcNotePath))) continue;
        const stem = path.basename(srcNoteFile, noteFileExtension);
        const dstNotePath = await uniquePath(targetDataDir, stem, noteFileExtension);
        await fs.promises.copyFile(srcNotePath, dstNotePath);
        noteFileCopyMap.set(srcNoteFile, path.basename(dstNotePath));
      }

      const importedItems: BoardItem[] = sourceItems.map((item) => {
        const newId = itemIdMap.get(item.id) ?? randomUUID();
        const newParentId = item.parent_item_id
          ? (itemIdMap.get(item.parent_item_id) ?? null)
          : null;
        let dataJson = item.data_json;
        if (item.type === 'note_paper') {
          const srcNoteFile = this.noteFileFromDataJson(item.data_json);
          if (srcNoteFile && noteFileCopyMap.has(srcNoteFile)) {
            const noteData = parseJsonObject(dataJson);
            dataJson = JSON.stringify({
              ...noteData,
              noteFile: noteFileCopyMap.get(srcNoteFile),
              noteFileManaged: false,
            });
          }
        }
        return {
          ...item,
          id: newId,
          page_id: '',
          parent_item_id: newParentId,
          data_json: dataJson,
          created_at: timestamp,
          updated_at: timestamp,
        };
      });

      const importedPage: Page = {
        ...sourcePage,
        id: randomUUID(),
        project_id: targetProjectId,
        sort_order: nextSortOrder,
        created_at: timestamp,
        updated_at: timestamp,
      };
      nextSortOrder += 1;

      const finalItems = importedItems.map((item) => ({
        ...item,
        page_id: importedPage.id,
      }));

      const importedConnectors: ConnectorLink[] = sourceConnectors.map(
        (connector) => ({
          id: randomUUID(),
          connector_item_id:
            itemIdMap.get(connector.connector_item_id) ??
            connector.connector_item_id,
          from_item_id: connector.from_item_id
            ? (itemIdMap.get(connector.from_item_id) ?? connector.from_item_id)
            : null,
          to_item_id: connector.to_item_id
            ? (itemIdMap.get(connector.to_item_id) ?? connector.to_item_id)
            : null,
          from_anchor: connector.from_anchor,
          to_anchor: connector.to_anchor,
        }),
      );

      const pageFile = await uniquePagePath(
        targetDataDir,
        slugify(importedPage.name, 'page'),
      );
      await this.writePageXml(pageFile, importedPage, finalItems, importedConnectors);
      importedPages.push(importedPage);
    }

    // Import standalone notes
    const importedNotes: ProjectNote[] = [];
    for (const noteFile of noteFiles) {
      const safeFile = path.basename(noteFile);
      if (
        !safeFile ||
        path.extname(safeFile).toLowerCase() !== noteFileExtension
      )
        continue;
      const srcNotePath = path.join(sourceDataDir, safeFile);
      if (!(await exists(srcNotePath))) continue;
      const stem = path.basename(safeFile, noteFileExtension);
      const dstNotePath = await uniquePath(targetDataDir, stem, noteFileExtension);
      const dstNoteFile = path.basename(dstNotePath);
      await fs.promises.copyFile(srcNotePath, dstNotePath);
      const content = await fs.promises.readFile(dstNotePath, 'utf8');
      const stats = await fs.promises.stat(dstNotePath);
      importedNotes.push({
        note_file: dstNoteFile,
        title:
          getMarkdownH1(content) ??
          path.basename(dstNoteFile, noteFileExtension),
        content,
        content_format: 'markdown',
        updated_at: stats.mtime.toISOString(),
      });
    }

    return { pages: importedPages, notes: importedNotes };
  }

  async updatePageViewport(pageId: string, payload: PageViewportPayload): Promise<Page> {
    const { page, pagePath } =
      await this.findPageMetadata(pageId);
    const nextPage = {
      ...page,
      viewport_x: payload.viewport_x,
      viewport_y: payload.viewport_y,
      zoom: payload.zoom,
      updated_at: utcTimestamp(),
    };
    const board = await this.getPageBoardData(pageId);
    await this.writePageXml(
      pagePath,
      nextPage,
      board.board_items,
      board.connector_links,
    );
    return nextPage;
  }

  async listBoardItems(pageId: string): Promise<BoardItem[]> {
    return (await this.readPageXml(pageId)).boardItems;
  }

  async getBoardItem(itemId: string): Promise<BoardItem> {
    for (const page of await this.allPages()) {
      for (const item of (await this.readPageXml(page.id)).boardItems) {
        if (item.id === itemId) return item;
      }
    }
    throw new HttpError(404, `Board item '${itemId}' was not found.`);
  }

  async createBoardItem(payload: BoardItemCreatePayload): Promise<BoardItem> {
    const page = await this.getPage(payload.page_id);
    if (payload.parent_item_id) {
      const parent = await this.getBoardItem(payload.parent_item_id);
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
    const { boardItems, connectorLinks } = await this.readPageXml(page.id);
    const { projectDir } = await this.findPageMetadata(page.id);
    const persistedItem = await this.writeMarkdownBackedNote(
      this.projectDataDir(projectDir),
      item,
    );
    boardItems.push(persistedItem);
    await this.persistPageBoard(page, boardItems, connectorLinks);
    return this.readMarkdownBackedNote(
      this.projectDataDir(projectDir),
      persistedItem,
    );
  }

  async updateBoardItem(itemId: string, payload: BoardItemUpdatePayload): Promise<BoardItem> {
    const page = await this.getPage(payload.page_id);
    if (payload.parent_item_id) {
      const parent = await this.getBoardItem(payload.parent_item_id);
      if (parent.page_id !== payload.page_id) {
        throw new HttpError(
          400,
          'Board item parent must belong to the same page.',
        );
      }
    }
    const { boardItems, connectorLinks } = await this.readPageXml(payload.page_id);
    const index = boardItems.findIndex((item) => item.id === itemId);
    if (index === -1)
      throw new HttpError(404, `Board item '${itemId}' was not found.`);
    const { projectDir, metadata } = await this.findPageMetadata(payload.page_id);
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
    await this.persistPageBoard(page, boardItems, connectorLinks);
    const nextNoteFile =
      nextItem.type === 'note_paper'
        ? this.noteFileFromDataJson(nextItem.data_json)
        : null;
    if (previousNoteFile && nextNoteFile && previousNoteFile !== nextNoteFile) {
      await this.renameProjectNoteFile(projectDir, previousNoteFile, nextNoteFile);
    }
    return nextItem;
  }

  async deleteBoardItem(itemId: string): Promise<void> {
    const page = await this.findPageForBoardItem(itemId);
    let { boardItems, connectorLinks } = await this.readPageXml(page.id);
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
    await this.persistPageBoard(page, boardItems, connectorLinks);
  }

  async listConnectorLinks(pageId: string): Promise<ConnectorLink[]> {
    return (await this.readPageXml(pageId)).connectorLinks;
  }

  async getConnectorLink(connectorId: string): Promise<ConnectorLink> {
    for (const page of await this.allPages()) {
      for (const connector of (await this.readPageXml(page.id)).connectorLinks) {
        if (connector.id === connectorId) return connector;
      }
    }
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  async createConnectorLink(payload: ConnectorLinkCreatePayload): Promise<ConnectorLink> {
    const connectorItem = await this.validateConnectorPayload(payload);
    const connector = { ...payload, id: randomUUID() };
    const { boardItems, connectorLinks } = await this.readPageXml(
      connectorItem.page_id,
    );
    connectorLinks.push(connector);
    await this.persistPageBoard(
      await this.getPage(connectorItem.page_id),
      boardItems,
      connectorLinks,
    );
    return connector;
  }

  async updateConnectorLink(
    connectorId: string,
    payload: ConnectorLinkUpdatePayload,
  ): Promise<ConnectorLink> {
    const connectorItem = await this.validateConnectorPayload(payload);
    const { boardItems, connectorLinks } = await this.readPageXml(
      connectorItem.page_id,
    );
    const index = connectorLinks.findIndex(
      (connector) => connector.id === connectorId,
    );
    if (index === -1)
      throw new HttpError(404, `Connector '${connectorId}' was not found.`);
    const nextConnector = { ...payload, id: connectorId };
    connectorLinks[index] = nextConnector;
    await this.persistPageBoard(
      await this.getPage(connectorItem.page_id),
      boardItems,
      connectorLinks,
    );
    return nextConnector;
  }

  async deleteConnectorLink(connectorId: string): Promise<void> {
    const page = await this.findPageForConnector(connectorId);
    const { boardItems, connectorLinks } = await this.readPageXml(page.id);
    const nextConnectors = connectorLinks.filter(
      (connector) => connector.id !== connectorId,
    );
    if (nextConnectors.length === connectorLinks.length) {
      throw new HttpError(404, `Connector '${connectorId}' was not found.`);
    }
    await this.persistPageBoard(page, boardItems, nextConnectors);
  }

  async replacePageBoardState(
    pageId: string,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): Promise<PageBoardData> {
    const page = await this.getPage(pageId);
    await this.validateBoardStatePayload(pageId, boardItems, connectorLinks);
    await this.persistPageBoard(page, boardItems, connectorLinks);
    return this.getPageBoardData(pageId);
  }

  async regulatePage(pageId: string): Promise<PageRegulateResult> {
    const page = await this.getPage(pageId);
    const { boardItems, connectorLinks } = await this.readPageXml(pageId);
    const { boardItems: nextBoardItems, report: itemReport } =
      regulateBoardItems(boardItems);
    const itemIds = new Set(nextBoardItems.map((item) => item.id));
    const nextConnectorLinks = connectorLinks.filter((link) => {
      if (!itemIds.has(link.connector_item_id)) return false;
      if (link.from_item_id !== null && !itemIds.has(link.from_item_id)) {
        return false;
      }
      if (link.to_item_id !== null && !itemIds.has(link.to_item_id)) {
        return false;
      }
      return true;
    });
    const report: PageRegulateReport = {
      ...itemReport,
      removed_connector_links:
        connectorLinks.length - nextConnectorLinks.length,
    };

    await this.persistPageBoard(page, nextBoardItems, nextConnectorLinks);
    const regulated = await this.getPageBoardData(pageId);
    return { ...regulated, report };
  }

  async getPageBoardData(pageId: string): Promise<PageBoardData> {
    const nextPage = await this.getPage(pageId);
    const { boardItems, connectorLinks } = await this.readPageXml(pageId);
    return {
      page: nextPage,
      board_items: boardItems,
      connector_links: connectorLinks,
    };
  }

}
