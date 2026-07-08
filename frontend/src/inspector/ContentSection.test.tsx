/** @vitest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BoardItem } from '../services/api';
import { ContentSection } from './ContentSection';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types/index';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createNotePaperItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'note-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.note_paper,
    title: null,
    content: '# hello\n\nbody',
    content_format: 'markdown',
    x: 0,
    y: 0,
    width: 264,
    height: 216,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: JSON.stringify({ noteFile: 'hello.md', noteFileManaged: false }),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

function getNoteFileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[placeholder="note.md"]',
  );
  if (input === null) throw new Error('Note file input not found');
  return input;
}

function commitNoteFileName(input: HTMLInputElement, value: string): void {
  act(() => {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
}

describe('ContentSection note file rename', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('commits a rename to an unused filename', () => {
    const onUpdate = vi.fn();
    act(() => {
      root.render(
        <ContentSection
          item={createNotePaperItem()}
          childCount={0}
          existingNoteFiles={new Set(['hello.md', 'other.md'])}
          onUpdate={onUpdate}
          onToggleCollapse={() => {}}
        />,
      );
    });

    commitNoteFileName(getNoteFileInput(container), 'fresh-name.md');

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updated = onUpdate.mock.calls[0][0] as BoardItem;
    expect(updated.data_json).toContain('"noteFile":"fresh-name.md"');
    expect(container.querySelector('.inspector-field-error')).toBeNull();
  });

  it('refuses a rename onto an existing note file and shows an error', () => {
    const onUpdate = vi.fn();
    act(() => {
      root.render(
        <ContentSection
          item={createNotePaperItem()}
          childCount={0}
          existingNoteFiles={new Set(['hello.md', 'other.md'])}
          onUpdate={onUpdate}
          onToggleCollapse={() => {}}
        />,
      );
    });

    commitNoteFileName(getNoteFileInput(container), 'other.md');

    expect(onUpdate).not.toHaveBeenCalled();
    const error = container.querySelector('.inspector-field-error');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('other.md');
  });

  it('still allows re-committing the current filename without an error', () => {
    const onUpdate = vi.fn();
    act(() => {
      root.render(
        <ContentSection
          item={createNotePaperItem()}
          childCount={0}
          existingNoteFiles={new Set(['hello.md'])}
          onUpdate={onUpdate}
          onToggleCollapse={() => {}}
        />,
      );
    });

    commitNoteFileName(getNoteFileInput(container), 'hello.md');

    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('.inspector-field-error')).toBeNull();
  });
});
