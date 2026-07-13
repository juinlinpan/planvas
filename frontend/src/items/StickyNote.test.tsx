import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../services/api';
import { serializeBoardItemStyle } from './itemStyles';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types/index';
import { StickyNote } from './StickyNote';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createStickyNoteItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'sticky-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.sticky_item,
    type: ITEM_TYPE.sticky_note,
    title: null,
    content: 'Check sticky font size',
    content_format: 'plain_text',
    x: 0,
    y: 0,
    width: 168,
    height: 168,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

describe('StickyNote', () => {
  it('renders item font size on the sticky shell', () => {
    const markup = renderToStaticMarkup(
      <StickyNote
        item={createStickyNoteItem({
          style_json: serializeBoardItemStyle({ fontSize: 24 }),
        })}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('font-size:24px');
    expect(markup).toContain('Check sticky font size');
  });

  it('lets the display and editor inherit the shell font size', () => {
    const cssPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../styles/items/TextBox.css',
    );
    const css = readFileSync(cssPath, 'utf8');

    expect(css).toMatch(
      /\.sticky-note-display,\s*\.sticky-note-editor\s*\{[^}]*font-size:\s*inherit;/s,
    );
    expect(css).not.toMatch(
      /\.sticky-note-display,\s*\.sticky-note-editor\s*\{[^}]*font-size:\s*0\.85rem;/s,
    );
  });
});
