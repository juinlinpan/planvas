import type { BoardItem, ProjectNote } from './api';
import { ITEM_TYPE } from '../types/index';

function getNoteFileName(item: BoardItem): string | null {
  if (item.type !== ITEM_TYPE.note_paper || item.data_json === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(item.data_json) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { noteFile?: unknown }).noteFile === 'string'
    ) {
      return (parsed as { noteFile: string }).noteFile;
    }
  } catch {
    return null;
  }

  return null;
}

export function syncMarkdownBackedItems(
  items: BoardItem[],
  projectNotes: ProjectNote[],
  skippedItemId: string | null = null,
): BoardItem[] {
  if (projectNotes.length === 0) {
    return items;
  }

  const noteByFile = new Map(
    projectNotes.map((note) => [note.note_file, note] as const),
  );
  let changed = false;
  const nextItems = items.map((item) => {
    if (item.id === skippedItemId) {
      return item;
    }

    const noteFile = getNoteFileName(item);
    if (noteFile === null) {
      return item;
    }

    const note = noteByFile.get(noteFile);
    if (note === undefined || item.content === note.content) {
      return item;
    }

    changed = true;
    return {
      ...item,
      title: note.title,
      content: note.content,
      content_format: 'markdown',
    };
  });

  return changed ? nextItems : items;
}
