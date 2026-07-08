import fs from 'node:fs';
import path from 'node:path';
import type { BoardItem } from '../types.js';
import {
  exists,
  getMarkdownH1,
  noteFileExtension,
  parseJsonObject,
  slugify,
  uniquePath,
  writeTextAtomic,
} from './paths.js';

export function noteFileFromDataJson(dataJson: string | null): string | null {
  const noteFile = parseJsonObject(dataJson).noteFile;
  if (typeof noteFile !== 'string' || noteFile.trim().length === 0) {
    return null;
  }
  return path.basename(noteFile);
}

export function notePath(projectDataDir: string, noteFile: string): string | null {
  const safeFile = path.basename(noteFile);
  if (path.extname(safeFile).toLowerCase() !== noteFileExtension) return null;
  const targetPath = path.resolve(projectDataDir, safeFile);
  const relative = path.relative(path.resolve(projectDataDir), targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return targetPath;
}

type CachedNoteFile = { mtimeMs: number; size: number; content: string };

// Keyed by absolute path and validated against mtime+size on every read, so
// unchanged files are never re-read. Focus polling lists every project note
// on each window focus; without this, that re-reads every .md in full.
const noteFileCache = new Map<string, CachedNoteFile>();

export async function readNoteFileCached(
  targetPath: string,
): Promise<{ content: string; mtime: Date }> {
  const stats = await fs.promises.stat(targetPath);
  const cached = noteFileCache.get(targetPath);
  if (
    cached !== undefined &&
    cached.mtimeMs === stats.mtimeMs &&
    cached.size === stats.size
  ) {
    return { content: cached.content, mtime: stats.mtime };
  }
  const content = await fs.promises.readFile(targetPath, 'utf8');
  noteFileCache.set(targetPath, {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    content,
  });
  return { content, mtime: stats.mtime };
}

export async function readMarkdownBackedNote(
  projectDataDir: string,
  item: BoardItem,
): Promise<BoardItem> {
  if (item.type !== 'note_paper') return item;
  const noteFile = noteFileFromDataJson(item.data_json);
  if (!noteFile) return item;
  const targetPath = notePath(projectDataDir, noteFile);
  if (!targetPath || !(await exists(targetPath))) return item;
  try {
    return {
      ...item,
      content: (await readNoteFileCached(targetPath)).content,
      content_format: 'markdown',
    };
  } catch {
    return item;
  }
}

// Several note_paper items can point at the same noteFile, and board persists
// write them with Promise.all. Serialize the check+write per path so two tmp
// files never rename onto the same target concurrently — on Windows that
// throws EPERM and fails the whole board save.
const noteWriteQueues = new Map<string, Promise<void>>();

async function withNoteWriteQueue(
  targetPath: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = noteWriteQueues.get(targetPath) ?? Promise.resolve();
  const current = previous.then(task, task);
  const queued = current.catch(() => {});
  noteWriteQueues.set(targetPath, queued);
  try {
    await current;
  } finally {
    if (noteWriteQueues.get(targetPath) === queued) {
      noteWriteQueues.delete(targetPath);
    }
  }
}

export async function writeMarkdownBackedNote(
  projectDataDir: string,
  item: BoardItem,
): Promise<BoardItem> {
  if (item.type !== 'note_paper') return item;
  const existingNoteData = parseJsonObject(item.data_json);
  const existingNoteFile = noteFileFromDataJson(item.data_json);
  const title = getMarkdownH1(item.content) ?? item.title ?? `note-${item.id}`;
  const noteFile =
    existingNoteFile ??
    path.basename(
      await uniquePath(
        projectDataDir,
        slugify(title, `note-${item.id}`),
        noteFileExtension,
      ),
    );
  const targetPath = notePath(projectDataDir, noteFile);
  if (targetPath) {
    await withNoteWriteQueue(targetPath, async () => {
      if (item.content !== null || !(await exists(targetPath))) {
        await writeTextAtomic(targetPath, item.content ?? '');
      }
    });
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
    title,
    content: null,
    content_format: 'markdown',
    data_json: JSON.stringify(noteData),
  };
}
