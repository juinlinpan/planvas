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

export abstract class RepositoryStorageContext {
  protected readonly projectIndex: ProjectIndexStore;

  constructor(protected readonly settings: AppSettings) {
    this.projectIndex = new ProjectIndexStore(settings.planvasRoot);
  }

  abstract listProjects(): Promise<Project[]>;

  abstract getBoardItem(itemId: string): Promise<BoardItem>;

  protected projectStoreDir(): string {
    return storageProjectStoreDir(this.settings.planvasRoot);
  }

  protected projectDataDir(projectDir: string): string {
    return storageProjectDataDir(projectDir);
  }

  protected metadataPath(projectDir: string): string {
    return storageMetadataPath(projectDir);
  }

  protected legacyMetadataPath(projectDir: string): string {
    return storageLegacyMetadataPath(projectDir);
  }

  protected async readProjectIndex(): Promise<ProjectIndex> {
    return this.projectIndex.read();
  }

  protected async writeProjectIndex(index: ProjectIndex): Promise<void> {
    await this.projectIndex.write(index);
  }

  protected storageKindForPath(projectDir: string): 'project_store' | 'external' {
    return storageKindForPathForRoot(this.settings.planvasRoot, projectDir);
  }

  protected async writeProjectMarker(projectDir: string): Promise<void> {
    await writeProjectMarkerDir(projectDir);
  }

  protected async ensureProjectMetadata(
    projectDir: string,
    timestamp: string,
  ): Promise<ProjectMetadata> {
    const markerPath = this.projectDataDir(projectDir);
    const metadataPath = this.metadataPath(projectDir);
    const legacyMetadataPath = this.legacyMetadataPath(projectDir);
    const hadPlanvasDataDir =
      (await exists(markerPath)) && (await fs.promises.stat(markerPath)).isDirectory();
    await this.writeProjectMarker(projectDir);

    let metadata: Partial<ProjectMetadata> = {};
    try {
      if (await exists(metadataPath))
        metadata = (await readJson(metadataPath)) as Partial<ProjectMetadata>;
      else if (await exists(legacyMetadataPath))
        metadata = (await readJson(legacyMetadataPath)) as Partial<ProjectMetadata>;
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
        default_style_json: null,
        sort_order: (await this.listProjects()).length,
        created_at: timestamp,
      };
      changed = true;
    } else if (!projectThemeColors.includes(metadata.project.theme_color)) {
      metadata.project.theme_color = 'default';
      changed = true;
    }
    if ('updated_at' in metadata.project) {
      delete metadata.project.updated_at;
      changed = true;
    }
    if (metadata.project.default_style_json === undefined) {
      metadata.project.default_style_json = null;
      changed = true;
    }

    if ('pages' in metadata) {
      delete (metadata as Record<string, unknown>).pages;
      changed = true;
    }

    const completeMetadata = metadata as ProjectMetadata;
    if (changed || !(await exists(metadataPath)))
      await writeJsonAtomic(metadataPath, completeMetadata);
    return completeMetadata;
  }

  protected async registerProjectPath(
    projectDir: string,
    projectId: string,
    storageKind: 'project_store' | 'external',
    timestamp: string,
  ): Promise<void> {
    return this.projectIndex.registerPath({
      projectDir,
      projectId,
      storageKind,
      timestamp,
    });
  }

  protected async updateProjectIndexPath(projectId: string, projectDir: string): Promise<void> {
    return this.projectIndex.updatePath({
      projectId,
      projectDir,
      storageKind: this.storageKindForPath(projectDir),
      timestamp: utcTimestamp(),
    });
  }

  protected async removeProjectFromIndex(projectId: string): Promise<void> {
    return this.projectIndex.remove(projectId);
  }

  protected async refreshProjectIndex(): Promise<ProjectIndex> {
    return lockIndex(async () => {
      const timestamp = utcTimestamp();
      const index = await this.readProjectIndex();
      index.projects = dedupeProjectIndexEntriesByPath(index.projects);

      for (const projectDir of await this.discoverProjectStoreDirs()) {
        const metadata = await this.ensureProjectMetadata(projectDir, timestamp);
        await this.ensureUniqueProjectIdentity(projectDir, metadata, timestamp, index);
        const project = this.projectFromMetadata(
          metadata,
          projectDir,
          'project_store',
          true,
        );
        const projectDirKey = projectPathKey(projectDir);
        let entry = index.projects.find(
          (candidate) => projectPathKey(candidate.path) === projectDirKey,
        );
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
        } else {
          entry.project_id = project.id;
          entry.path = path.resolve(projectDir);
          entry.storage_kind = 'project_store';
          entry.last_seen_at = timestamp;
        }
      }

      for (const entry of index.projects) {
        if (
          (await exists(this.metadataPath(entry.path))) ||
          (await exists(this.legacyMetadataPath(entry.path)))
        ) {
          const metadata = await this.ensureProjectMetadata(entry.path, timestamp);
          await this.ensureUniqueProjectIdentity(
            entry.path,
            metadata,
            timestamp,
            index,
          );
          entry.project_id = metadata.project.id;
          entry.last_seen_at = timestamp;
        }
      }
      await this.ensureUniquePageIdentities(index, timestamp);
      await this.writeProjectIndex(index);
      return index;
    });
  }

  protected async discoverProjectStoreDirs(): Promise<string[]> {
    const candidates: string[] = [];
    for (const baseDir of [this.projectStoreDir(), this.settings.planvasRoot]) {
      if (!(await exists(baseDir))) continue;
      const childNames = await fs.promises.readdir(baseDir);
      for (const childName of childNames) {
        if (childName === projectStoreDirname) continue;
        const child = path.join(baseDir, childName);
        if (
          (await fs.promises.stat(child)).isDirectory() &&
          ((await exists(this.metadataPath(child))) ||
            (await exists(this.legacyMetadataPath(child))))
        ) {
          candidates.push(child);
        }
      }
    }
    return candidates;
  }

  protected async iterProjectMetadata(
    options: { includeMissing?: boolean } = {},
  ): Promise<ProjectEntry[]> {
    if (!(await exists(this.settings.planvasRoot))) return [];
    const index = await this.refreshProjectIndex();
    const entries: ProjectEntry[] = [];
    for (const entry of index.projects) {
      const projectDir = entry.path;
      const metadataPath = this.metadataPath(projectDir);
      const legacyMetadataPath = this.legacyMetadataPath(projectDir);
      if (
        (await exists(projectDir)) &&
        (await fs.promises.stat(projectDir)).isDirectory() &&
        ((await exists(metadataPath)) || (await exists(legacyMetadataPath)))
      ) {
        const metadata = (await exists(metadataPath))
          ? ((await readJson(metadataPath)) as ProjectMetadata)
          : await this.ensureProjectMetadata(projectDir, utcTimestamp());
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
            default_style_json: null,
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

  protected async ensureUniqueProjectIdentity(
    projectDir: string,
    metadata: ProjectMetadata,
    timestamp: string,
    projectIndex?: ProjectIndex,
  ): Promise<void> {
    const projectId = metadata.project.id;
    const projectDirKey = projectPathKey(projectDir);
    const index = projectIndex ?? await this.readProjectIndex();
    const sameIdEntries = index.projects
      .filter((entry) => entry.project_id === projectId)
      .sort(compareProjectIndexEntries);
    if (sameIdEntries.length === 0) {
      return;
    }

    const currentEntry = sameIdEntries.find(
      (entry) => projectPathKey(entry.path) === projectDirKey,
    );
    const owningEntry = sameIdEntries[0];
    const currentPathOwnsId =
      currentEntry !== undefined &&
      projectPathKey(owningEntry.path) === projectDirKey;
    if (currentPathOwnsId) {
      return;
    }

    const oldProjectId = metadata.project.id;
    const nextProjectId = randomUUID();
    metadata.project = {
      ...metadata.project,
      id: nextProjectId,
    };
    await writeJsonAtomic(this.metadataPath(projectDir), metadata);

    await this.reassignCopiedProjectPageData(
      projectDir,
      nextProjectId,
      timestamp,
    );

    appendLog(
      this.settings,
      `Reassigned copied project id ${oldProjectId} to ${nextProjectId} for ${path.resolve(projectDir)}`,
    );
  }

  private async reassignCopiedProjectPageData(
    projectDir: string,
    nextProjectId: string,
    timestamp: string,
  ): Promise<void> {
    for (const pageEntry of await this.pageEntriesFromProject(projectDir)) {
      await this.reassignStoredPageData(
        projectDir,
        pageEntry,
        nextProjectId,
        timestamp,
      );
    }
  }

  private async ensureUniquePageIdentities(
    index: ProjectIndex,
    timestamp: string,
  ): Promise<void> {
    const owningLocationByPageId = new Map<string, string>();
    for (const entry of index.projects) {
      if (
        !(await exists(entry.path)) ||
        !(await fs.promises.stat(entry.path)).isDirectory() ||
        (!(await exists(this.metadataPath(entry.path))) &&
          !(await exists(this.legacyMetadataPath(entry.path))))
      ) {
        continue;
      }
      const metadata = await this.ensureProjectMetadata(entry.path, timestamp);
      for (const pageEntry of await this.pageEntriesFromProject(entry.path)) {
        const pageLocation = `${projectPathKey(entry.path)}:${pageEntry.pagePath}`;
        const owningLocation = owningLocationByPageId.get(pageEntry.page.id);
        if (!owningLocation) {
          owningLocationByPageId.set(pageEntry.page.id, pageLocation);
          continue;
        }
        const nextPageId = await this.reassignStoredPageData(
          entry.path,
          pageEntry,
          metadata.project.id,
          timestamp,
        );
        owningLocationByPageId.set(
          nextPageId,
          `${projectPathKey(entry.path)}:${pageEntry.pagePath}`,
        );
        appendLog(
          this.settings,
          `Reassigned duplicated copied page id ${pageEntry.page.id} to ${nextPageId} for ${path.resolve(entry.path)}`,
        );
      }
    }
  }

  private async reassignStoredPageData(
    projectDir: string,
    pageEntry: PageEntry,
    nextProjectId: string,
    timestamp: string,
  ): Promise<string> {
    const nextPageId = randomUUID();
    const { boardItems, connectorLinks } = await this.readPageXmlFile(
      pageEntry.pagePath,
      pageEntry.page,
      this.projectDataDir(projectDir),
    );
    const itemIdMap = new Map(
      boardItems.map((item) => [item.id, randomUUID()]),
    );
    const nextBoardItems = boardItems.map((item) => ({
      ...item,
      id: itemIdMap.get(item.id) ?? randomUUID(),
      page_id: nextPageId,
      parent_item_id: item.parent_item_id
        ? (itemIdMap.get(item.parent_item_id) ?? item.parent_item_id)
        : null,
      data_json: this.remapBoardItemDataJson(item.data_json, itemIdMap),
      updated_at: timestamp,
    }));
    const nextConnectorLinks = connectorLinks.map((connector) => ({
      ...connector,
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
    }));

    await this.writePageXml(
      pageEntry.pagePath,
      {
        ...pageEntry.page,
        id: nextPageId,
        project_id: nextProjectId,
        updated_at: timestamp,
      },
      nextBoardItems,
      nextConnectorLinks,
    );
    return nextPageId;
  }

  private remapBoardItemDataJson(
    dataJson: string | null,
    itemIdMap: Map<string, string>,
  ): string | null {
    if (!dataJson) return dataJson;
    const parsed = parseJsonObject(dataJson);
    if (Object.keys(parsed).length === 0) return dataJson;
    return JSON.stringify(this.remapItemReferences(parsed, itemIdMap));
  }

  private remapItemReferences(
    value: unknown,
    itemIdMap: Map<string, string>,
    key?: string,
  ): unknown {
    if (typeof value === 'string') {
      if (key === 'itemId' || key === 'childItemId') {
        return itemIdMap.get(value) ?? value;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => {
        if (key === 'childItemIds' && typeof entry === 'string') {
          return itemIdMap.get(entry) ?? entry;
        }
        return this.remapItemReferences(entry, itemIdMap);
      });
    }
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        this.remapItemReferences(entryValue, itemIdMap, entryKey),
      ]),
    );
  }

  protected async findProjectMetadata(projectId: string): Promise<{
    projectDir: string;
    metadata: ProjectMetadata;
  }> {
    for (const entry of await this.iterProjectMetadata()) {
      if (entry.metadata && entry.project.id === projectId) {
        return { projectDir: entry.projectDir, metadata: entry.metadata };
      }
    }
    throw new HttpError(404, `Project '${projectId}' was not found.`);
  }

  protected async findPageMetadata(pageId: string): Promise<{
    projectDir: string;
    metadata: ProjectMetadata;
    page: Page;
    pagePath: string;
  }> {
    for (const entry of await this.iterProjectMetadata()) {
      if (!entry.metadata) continue;
      const pageEntry = (await this.pageEntriesFromProject(entry.projectDir)).find(
        (candidate) => candidate.page.id === pageId,
      );
      if (pageEntry)
        return {
          projectDir: entry.projectDir,
          metadata: entry.metadata,
          page: pageEntry.page,
          pagePath: pageEntry.pagePath,
        };
    }
    throw new HttpError(404, `Page '${pageId}' was not found.`);
  }

  protected async allPages(): Promise<Page[]> {
    const entries = await this.iterProjectMetadata();
    const all: Page[] = [];
    for (const entry of entries) {
      if (entry.metadata) {
        all.push(...(await this.pagesFromProject(entry.projectDir)));
      }
    }
    return all;
  }

  protected projectFromMetadata(
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
    if (project.default_style_json === undefined)
      project.default_style_json = null;
    const apiProject: Project = {
      ...project,
      updated_at: project.updated_at ?? project.created_at,
    };
    if (projectDir) {
      apiProject.path = projectDir;
      apiProject.storage_kind = storageKind ?? this.storageKindForPath(projectDir);
      apiProject.path_exists = pathExists;
    }
    return apiProject;
  }

  protected storedProjectFromProject(project: Project): ProjectMetadata['project'] {
    const storedProject: Partial<Project> = { ...project };
    delete storedProject.updated_at;
    delete storedProject.path;
    delete storedProject.storage_kind;
    delete storedProject.path_exists;
    return storedProject as ProjectMetadata['project'];
  }

  protected async pagesFromProject(projectDir: string): Promise<Page[]> {
    return (await this.pageEntriesFromProject(projectDir)).map((entry) => entry.page);
  }

  protected async pageEntriesFromProject(projectDir: string): Promise<PageEntry[]> {
    const projectDataDir = this.projectDataDir(projectDir);
    if (!(await exists(projectDataDir))) return [];
    const entries = await fs.promises.readdir(projectDataDir, { withFileTypes: true });
    const semanticEntries = entries.filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.semantic.xml'),
    );
    const results: PageEntry[] = [];
    for (const entry of semanticEntries) {
      const semanticPath = path.join(projectDataDir, entry.name);
      results.push({
        page: await readPageRecordFromSemanticXml(semanticPath),
        pagePath: stemPathFromVariantPath(semanticPath, 'semantic'),
      });
    }
    return results.sort((left, right) => {
      if (left.page.sort_order !== right.page.sort_order)
        return left.page.sort_order - right.page.sort_order;
      return left.page.created_at.localeCompare(right.page.created_at);
    });
  }

  protected async replaceStoredPage(
    projectDir: string,
    pagePath: string,
    page: Page,
  ): Promise<void> {
    const { boardItems, connectorLinks } = await this.readPageXmlFile(
      pagePath,
      page,
      this.projectDataDir(projectDir),
    );
    await this.writePageXml(pagePath, page, boardItems, connectorLinks);
  }

  protected async renumberProjectPages(projectDir: string): Promise<void> {
    const timestamp = utcTimestamp();
    const entries = await this.pageEntriesFromProject(projectDir);
    for (let sortOrder = 0; sortOrder < entries.length; sortOrder++) {
      const entry = entries[sortOrder];
      await this.replaceStoredPage(projectDir, entry.pagePath, {
        ...entry.page,
        sort_order: sortOrder,
        updated_at: timestamp,
      });
    }
  }

  protected sortedPages(pages: Page[]): Page[] {
    return pages.sort((left, right) => {
      if (left.sort_order !== right.sort_order)
        return left.sort_order - right.sort_order;
      return left.created_at.localeCompare(right.created_at);
    });
  }

  protected touchProject(metadata: ProjectMetadata, _timestamp: string): void {
    metadata.project = this.storedProjectFromProject(
      this.projectFromMetadata(metadata),
    );
  }

  protected async persistPageBoard(
    page: Page,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): Promise<void> {
    const {
      projectDir,
      page: currentPage,
      pagePath,
    } = await this.findPageMetadata(page.id);
    const nextPage = { ...currentPage, updated_at: utcTimestamp() };
    await this.writePageXml(pagePath, nextPage, boardItems, connectorLinks);
  }

  protected async readPageXml(pageId: string): Promise<{
    boardItems: BoardItem[];
    connectorLinks: ConnectorLink[];
  }> {
    const { projectDir, page, pagePath } = await this.findPageMetadata(pageId);
    return this.readPageXmlFile(
      pagePath,
      page,
      this.projectDataDir(projectDir),
    );
  }

  protected async readPageXmlFile(
    pagePath: string,
    page: Page,
    projectDataDir: string,
  ): Promise<{
    boardItems: BoardItem[];
    connectorLinks: ConnectorLink[];
  }> {
    return readPageXmlFile(pagePath, page, projectDataDir);
  }

  protected async writePageXml(
    pagePath: string,
    page: Page,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): Promise<void> {
    await writePageXmlFile(pagePath, page, boardItems, connectorLinks);
  }

  protected async readMarkdownBackedNote(
    projectDataDir: string,
    item: BoardItem,
  ): Promise<BoardItem> {
    return readMarkdownBackedNote(projectDataDir, item);
  }

  async deleteProjectNote(projectId: string, noteFile: string): Promise<void> {
    const { projectDir } = await this.findProjectMetadata(projectId);
    const projectDataDir = this.projectDataDir(projectDir);
    const notePath = this.notePath(projectDataDir, noteFile);

    if (notePath && (await exists(notePath))) {
      await fs.promises.unlink(notePath);
    }

    // Cleanup all note_paper items pointing to this file across all pages of the project
    const pages = await this.pagesFromProject(projectDir);
    for (const page of pages) {
      const { boardItems, connectorLinks } = await this.readPageXml(page.id);
      const originalCount = boardItems.length;
      const nextBoardItems = boardItems.filter((item) => {
        if (item.type !== 'note_paper') return true;
        return this.noteFileFromDataJson(item.data_json) !== noteFile;
      });

      if (nextBoardItems.length !== originalCount) {
        await this.persistPageBoard(page, nextBoardItems, connectorLinks);
      }
    }
  }

  protected async writeMarkdownBackedNote(
    projectDataDir: string,
    item: BoardItem,
  ): Promise<BoardItem> {
    return writeMarkdownBackedNote(projectDataDir, item);
  }

  protected async renameProjectNoteFile(
    projectDir: string,
    previousNoteFile: string,
    nextNoteFile: string,
  ): Promise<void> {
    const projectDataDir = this.projectDataDir(projectDir);
    const previousPath = this.notePath(projectDataDir, previousNoteFile);
    const nextPath = this.notePath(projectDataDir, nextNoteFile);
    if (!previousPath || !nextPath) return;

    const content = (await exists(nextPath))
      ? await fs.promises.readFile(nextPath, 'utf8')
      : (await exists(previousPath))
        ? await fs.promises.readFile(previousPath, 'utf8')
        : '';
    await fs.promises.mkdir(projectDataDir, { recursive: true });
    await fs.promises.writeFile(nextPath, content, 'utf8');

    const pages = await this.pagesFromProject(projectDir);
    const timestamp = utcTimestamp();
    for (const page of pages) {
      const pagePath = (await this.findPageMetadata(page.id)).pagePath;
      const { boardItems } = await this.readPageXmlFile(
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
      const { connectorLinks } = await this.readPageXmlFile(
        pagePath,
        page,
        projectDataDir,
      );
      const nextPage = { ...page, updated_at: timestamp };
      await this.writePageXml(pagePath, nextPage, nextBoardItems, connectorLinks);
    }

    if (await exists(previousPath)) await fs.promises.rm(previousPath, { force: true });
  }

  protected noteFileFromDataJson(dataJson: string | null): string | null {
    return noteFileFromDataJson(dataJson);
  }

  protected notePath(projectDataDir: string, noteFile: string): string | null {
    return notePath(projectDataDir, noteFile);
  }

  protected async findPageForBoardItem(itemId: string): Promise<Page> {
    for (const page of await this.allPages()) {
      if (
        (await this.readPageXml(page.id)).boardItems.some((item) => item.id === itemId)
      )
        return page;
    }
    throw new HttpError(404, `Board item '${itemId}' was not found.`);
  }

  protected async findPageForConnector(connectorId: string): Promise<Page> {
    for (const page of await this.allPages()) {
      if (
        (await this.readPageXml(page.id)).connectorLinks.some(
          (connector) => connector.id === connectorId,
        )
      )
        return page;
    }
    throw new HttpError(404, `Connector '${connectorId}' was not found.`);
  }

  protected validateBoardStatePayload(
    pageId: string,
    boardItems: BoardItem[],
    connectorLinks: ConnectorLink[],
  ): void {
    validateBoardStatePayload(pageId, boardItems, connectorLinks);
  }

  protected validateReorderIds(
    existingIds: string[],
    orderedIds: string[],
    entityLabel: string,
  ): void {
    validateReorderIds(existingIds, orderedIds, entityLabel);
  }

  protected buildDuplicatePageName(
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

  protected getDuplicatedItemReference(
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

  protected async validateConnectorPayload(
    payload: ConnectorLinkCreatePayload | ConnectorLinkUpdatePayload,
  ): Promise<BoardItem> {
    return validateConnectorPayloadHelper(payload, (itemId) =>
      this.getBoardItem(itemId),
    );
  }

  protected validateConnectorTargets(
    connectorItem: BoardItem,
    fromItem: BoardItem | null,
    toItem: BoardItem | null,
  ): void {
    validateConnectorTargets(connectorItem, fromItem, toItem);
  }
}
