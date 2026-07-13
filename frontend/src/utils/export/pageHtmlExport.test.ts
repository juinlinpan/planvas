// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardItem, PageBoardData, ProjectNote } from '../../services/api';
import { ITEM_CATEGORY, ITEM_TYPE } from '../../types/index';
import { exportPageAsHtml } from './pageHtmlExport';

const FIXTURE_TIMESTAMP = '2026-04-27T00:00:00.000Z';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'note-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.note_paper,
    title: null,
    content: '# Card Preview',
    content_format: 'markdown',
    x: 120,
    y: 80,
    width: 180,
    height: 140,
    rotation: 0,
    z_index: 1,
    is_collapsed: false,
    style_json: null,
    data_json: JSON.stringify({ noteFile: 'sprint note.md' }),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

function createBoardData(items: BoardItem[]): PageBoardData {
  return {
    page: {
      id: 'page-1',
      project_id: 'project-1',
      name: 'Page 1',
      sort_order: 0,
      viewport_x: 0,
      viewport_y: 0,
      zoom: 1,
      created_at: FIXTURE_TIMESTAMP,
      updated_at: FIXTURE_TIMESTAMP,
    },
    board_items: items,
    connector_links: [],
  };
}

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('pageHtmlExport', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      window.setTimeout(callback, 0);
      return 1;
    });
  });

  it('embeds full markdown-backed note content in the note modal', async () => {
    const notes: ProjectNote[] = [
      {
        note_file: 'sprint note.md',
        title: 'Sprint Note',
        content: '# Sprint Note\n\nFull markdown body from file.',
        content_format: 'markdown',
        updated_at: FIXTURE_TIMESTAMP,
      },
    ];
    const blob = await exportPageAsHtml(
      createBoardData([createBoardItem()]),
      notes,
    );
    const html = await readBlobText(blob);

    expect(html).not.toContain('class="html-export-note-link"');
    expect(html).toContain('html-export-note-template-note-1');
    expect(html).toContain('Sprint Note');
    expect(html).toContain('Full markdown body from file.');
  });
});
