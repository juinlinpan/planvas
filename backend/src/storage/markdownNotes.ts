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
      content: await fs.promises.readFile(targetPath, 'utf8'),
      content_format: 'markdown',
    };
  } catch {
    return item;
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
  if (targetPath && (item.content !== null || !(await exists(targetPath)))) {
    await writeTextAtomic(targetPath, item.content ?? '');
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
