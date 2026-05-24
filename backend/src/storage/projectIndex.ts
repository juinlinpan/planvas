import path from 'node:path';
import type { ProjectIndex } from '../types.js';
import {
  isProjectIndexEntry,
  projectIndexPath,
  projectPathKey,
  readJson,
  writeJsonAtomic,
  exists,
} from './paths.js';

let indexLock = Promise.resolve();

export async function lockIndex<T>(fn: () => Promise<T>): Promise<T> {
  const current = indexLock;
  let resolveLock: () => void = () => {};
  indexLock = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  await current;
  try {
    return await fn();
  } finally {
    resolveLock();
  }
}

export class ProjectIndexStore {
  constructor(private readonly planvasRoot: string) {}

  async read(): Promise<ProjectIndex> {
    const indexPath = projectIndexPath(this.planvasRoot);
    if (!(await exists(indexPath))) return { version: 1, projects: [] };
    const payload = await readJson(indexPath);
    return {
      version: 1,
      projects: Array.isArray(payload.projects)
        ? payload.projects.filter(isProjectIndexEntry)
        : [],
    };
  }

  async write(index: ProjectIndex): Promise<void> {
    await writeJsonAtomic(projectIndexPath(this.planvasRoot), index);
  }

  async registerPath(params: {
    projectDir: string;
    projectId: string;
    storageKind: 'project_store' | 'external';
    timestamp: string;
  }): Promise<void> {
    return lockIndex(async () => {
      const index = await this.read();
      const resolvedPath = path.resolve(params.projectDir);
      const resolvedPathKey = projectPathKey(resolvedPath);
      const entry = index.projects.find(
        (item) => projectPathKey(item.path) === resolvedPathKey,
      );
      if (!entry) {
        index.projects.push({
          project_id: params.projectId,
          path: resolvedPath,
          storage_kind: params.storageKind,
          sort_order: index.projects.length,
          added_at: params.timestamp,
          last_seen_at: params.timestamp,
        });
      } else {
        entry.project_id = params.projectId;
        entry.path = resolvedPath;
        entry.storage_kind = params.storageKind;
        entry.last_seen_at = params.timestamp;
      }
      await this.write(index);
    });
  }

  async updatePath(params: {
    projectId: string;
    projectDir: string;
    storageKind: 'project_store' | 'external';
    timestamp: string;
  }): Promise<void> {
    return lockIndex(async () => {
      const index = await this.read();
      const entry = index.projects.find(
        (item) => item.project_id === params.projectId,
      );
      if (entry) {
        entry.path = path.resolve(params.projectDir);
        entry.storage_kind = params.storageKind;
        entry.last_seen_at = params.timestamp;
      }
      await this.write(index);
    });
  }

  async remove(projectId: string): Promise<void> {
    return lockIndex(async () => {
      const index = await this.read();
      index.projects = index.projects.filter(
        (entry) => entry.project_id !== projectId,
      );
      await this.write(index);
    });
  }
}
