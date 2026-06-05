import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError, StorageInitializationError } from '../httpError.js';
import type { ProjectIndexEntry, StoredProject } from '../types.js';

export const metadataFilename = 'metadata.json';
export const projectIndexFilename = 'project.json';
export const userProfileFilename = 'user.json';
export const projectStoreDirname = 'project_store';
export const projectMarkerDirname = '.pv_project';
export const noteFileExtension = '.md';

export function ensureDirectory(targetPath: string, label: string): void {
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

export function ensureWritableDirectory(targetPath: string, label: string): void {
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

export function ensureWritableFile(targetPath: string, label: string): void {
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.closeSync(fs.openSync(targetPath, 'a'));
  } catch (error) {
    throw new StorageInitializationError(
      `${label} '${targetPath}' is not writable: ${String(error)}`,
    );
  }
}

export function projectStoreDir(planvasRoot: string): string {
  return path.join(planvasRoot, projectStoreDirname);
}

export function projectIndexPath(planvasRoot: string): string {
  return path.join(planvasRoot, projectIndexFilename);
}

export function userProfilePath(planvasRoot: string): string {
  return path.join(planvasRoot, userProfileFilename);
}

export function projectDataDir(projectDir: string): string {
  return path.join(projectDir, projectMarkerDirname);
}

export function metadataPath(projectDir: string): string {
  return path.join(projectDataDir(projectDir), metadataFilename);
}

export function legacyMetadataPath(projectDir: string): string {
  return path.join(projectDir, metadataFilename);
}

export function storageKindForPath(
  planvasRoot: string,
  projectDir: string,
): 'project_store' | 'external' {
  const relative = path.relative(
    path.resolve(projectStoreDir(planvasRoot)),
    path.resolve(projectDir),
  );
  return relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
    ? 'project_store'
    : 'external';
}

export async function writeProjectMarker(projectDir: string): Promise<void> {
  const markerPath = projectDataDir(projectDir);
  if ((await exists(markerPath)) && !(await fs.promises.stat(markerPath)).isDirectory()) {
    await fs.promises.rm(markerPath, { force: true });
  }
  await fs.promises.mkdir(markerPath, { recursive: true });
}

export function slugify(value: string, fallback = 'untitled'): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  return normalized.slice(0, 80) || fallback;
}

export async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function uniquePath(
  parent: string,
  stem: string,
  suffix = '',
): Promise<string> {
  let candidate = path.join(parent, `${stem}${suffix}`);
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(parent, `${stem}-${index}${suffix}`);
    index += 1;
  }
  return candidate;
}

export async function uniqueSerialPath(
  parent: string,
  stem: string,
  suffix = '',
): Promise<string> {
  let candidate = path.join(parent, `${stem}${suffix}`);
  let index = 2;
  while (await exists(candidate)) {
    candidate = path.join(parent, `${stem}_${index}${suffix}`);
    index += 1;
  }
  return candidate;
}

export async function writeJsonAtomic(
  targetPath: string,
  payload: unknown,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.tmp-${randomUUID()}.json`,
  );
  await fs.promises.writeFile(
    tempPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
  await fs.promises.rename(tempPath, targetPath);
}

export async function readJson(
  targetPath: string,
): Promise<Record<string, unknown>> {
  try {
    const payload = JSON.parse(
      await fs.promises.readFile(targetPath, 'utf8'),
    ) as unknown;
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

export function parseJsonObject(value: string | null): Record<string, unknown> {
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

export function getMarkdownH1(value: string | null): string | null {
  if (!value) return null;
  for (const line of value.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match) return match[1];
  }
  return null;
}

export function resolveProjectPath(value: string): string {
  const expanded = expandUser(value.trim());
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return path.resolve(os.homedir(), expanded);
}

export function projectPathKey(projectDir: string): string {
  const resolved = path.resolve(projectDir);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function sameFilesystemPath(left: string, right: string): boolean {
  return projectPathKey(left) === projectPathKey(right);
}

export function compareProjectIndexEntries(
  left: ProjectIndexEntry,
  right: ProjectIndexEntry,
): number {
  const addedAtComparison = left.added_at.localeCompare(right.added_at);
  if (addedAtComparison !== 0) return addedAtComparison;
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }
  return projectPathKey(left.path).localeCompare(projectPathKey(right.path));
}

export function dedupeProjectIndexEntriesByPath(
  entries: ProjectIndexEntry[],
): ProjectIndexEntry[] {
  const entryByPath = new Map<string, ProjectIndexEntry>();
  for (const entry of entries) {
    const key = projectPathKey(entry.path);
    const existing = entryByPath.get(key);
    if (!existing || compareProjectIndexEntries(entry, existing) < 0) {
      entryByPath.set(key, entry);
    }
  }
  return [...entryByPath.values()].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }
    return left.added_at.localeCompare(right.added_at);
  });
}

export function isProject(value: unknown): value is StoredProject {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredProject>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.theme_color === 'string' &&
    (candidate.default_style_json === undefined ||
      candidate.default_style_json === null ||
      typeof candidate.default_style_json === 'string') &&
    typeof candidate.sort_order === 'number' &&
    typeof candidate.created_at === 'string' &&
    (candidate.updated_at === undefined ||
      typeof candidate.updated_at === 'string')
  );
}

export function isProjectIndexEntry(value: unknown): value is ProjectIndexEntry {
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

function expandUser(value: string): string {
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
