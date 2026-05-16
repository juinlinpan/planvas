import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import {
  BACKGROUND_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  getStickyNoteColor,
  parseBoardItemStyle,
  parseProjectDefaultStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  serializeProjectDefaultStyle,
} from './itemStyles';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: 'plain_text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
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

describe('itemStyles palette restrictions', () => {
  it('maps legacy saved colors into the curated palettes', () => {
    const parsed = parseBoardItemStyle(
      '{"backgroundColor":"#ecfeff","textColor":"#164e63"}',
    );

    expect(parsed.backgroundColor).toBe(BACKGROUND_COLOR_OPTIONS[5].value);
    expect(parsed.textColor).toBe(TEXT_COLOR_OPTIONS[2].value);
  });

  it('remaps old green and purple backgrounds to the new neutral palette', () => {
    const legacyGreen = parseBoardItemStyle('{"backgroundColor":"#bbf7d0"}');
    const legacyPurple = parseBoardItemStyle('{"backgroundColor":"#e9d5ff"}');

    expect(legacyGreen.backgroundColor).toBe(BACKGROUND_COLOR_OPTIONS[4].value);
    expect(legacyPurple.backgroundColor).toBe(
      BACKGROUND_COLOR_OPTIONS[7].value,
    );
  });

  it('serializes allowed background and text colors to canonical palette values', () => {
    expect(
      serializeBoardItemStyle({
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        fontSize: 16,
      }),
    ).toBe('{"backgroundColor":"#f9f8f5","textColor":"#1f2937","fontSize":16}');
  });

  it('allows transparent backgrounds for line text labels', () => {
    expect(
      serializeBoardItemStyle({
        backgroundColor: 'transparent',
        segmentTextHorizontalPosition: 'end',
        segmentTextVerticalPosition: 'top',
        segmentTextOrientation: 'slope',
      }),
    ).toBe(
      '{"backgroundColor":"transparent","segmentTextHorizontalPosition":"end","segmentTextVerticalPosition":"top","segmentTextOrientation":"slope"}',
    );
  });

  it('drops unsupported background and text colors while preserving other style fields', () => {
    expect(
      serializeBoardItemStyle({
        backgroundColor: '#123456',
        textColor: '#abcdef',
        strokeColor: '#123456',
      }),
    ).toBe('{"strokeColor":"#123456"}');
  });

  it('falls back to palette defaults when persisted colors are outside the whitelist', () => {
    const resolved = resolveBoardItemStyle(
      createBoardItem({
        style_json: '{"backgroundColor":"#123456","textColor":"#abcdef"}',
      }),
    );

    expect(resolved.backgroundColor).toBe(BACKGROUND_COLOR_OPTIONS[0].value);
    expect(resolved.textColor).toBe(TEXT_COLOR_OPTIONS[0].value);
  });

  it('uses curated sticky note colors for default note backgrounds', () => {
    const stickyPalette = BACKGROUND_COLOR_OPTIONS.slice(1).map(
      (option) => option.value,
    );

    expect(stickyPalette).toContain(getStickyNoteColor('sticky-1'));
  });

  it('resolves project-level defaults for object and link styles', () => {
    const projectStyle = parseProjectDefaultStyle(
      serializeProjectDefaultStyle({
        textColor: TEXT_COLOR_OPTIONS[1].value,
        smallItemBackgroundColor: BACKGROUND_COLOR_OPTIONS[2].value,
        largeObjectBackgroundColor: BACKGROUND_COLOR_OPTIONS[5].value,
        linkColor: '#ef4444',
        linkTextColor: TEXT_COLOR_OPTIONS[3].value,
      }),
    );

    const textBox = resolveBoardItemStyle(createBoardItem(), projectStyle);
    const frame = resolveBoardItemStyle(
      createBoardItem({
        category: ITEM_CATEGORY.large_item,
        type: ITEM_TYPE.frame,
      }),
      projectStyle,
    );
    const arrow = resolveBoardItemStyle(
      createBoardItem({
        category: ITEM_CATEGORY.connector,
        type: ITEM_TYPE.arrow,
      }),
      projectStyle,
    );

    expect(textBox.backgroundColor).toBe(BACKGROUND_COLOR_OPTIONS[2].value);
    expect(textBox.textColor).toBe(TEXT_COLOR_OPTIONS[1].value);
    expect(frame.backgroundColor).toBe(BACKGROUND_COLOR_OPTIONS[5].value);
    expect(arrow.strokeColor).toBe('#ef4444');
    expect(arrow.textColor).toBe(TEXT_COLOR_OPTIONS[3].value);
    expect(arrow.backgroundColor).toBe('transparent');
  });
});
