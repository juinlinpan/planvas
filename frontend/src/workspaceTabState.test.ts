import { describe, expect, it } from 'vitest';

import { reorderWorkspaceTabs, type WorkspaceTab } from './workspaceTabState';

describe('workspace tab state', () => {
  const tabs: WorkspaceTab[] = [
    { kind: 'page', id: 'page-1' },
    { kind: 'note', id: 'note-a.md' },
    { kind: 'page', id: 'page-2' },
  ];

  it('moves a dragged tab before a target tab', () => {
    expect(
      reorderWorkspaceTabs(tabs, 'page:page-2', 'page:page-1', 'before'),
    ).toEqual([
      { kind: 'page', id: 'page-2' },
      { kind: 'page', id: 'page-1' },
      { kind: 'note', id: 'note-a.md' },
    ]);
  });

  it('moves a dragged tab after a target tab', () => {
    expect(
      reorderWorkspaceTabs(tabs, 'page:page-1', 'note:note-a.md', 'after'),
    ).toEqual([
      { kind: 'note', id: 'note-a.md' },
      { kind: 'page', id: 'page-1' },
      { kind: 'page', id: 'page-2' },
    ]);
  });

  it('keeps the original array when the drag ids are invalid', () => {
    expect(reorderWorkspaceTabs(tabs, 'page:missing', 'page:page-1', 'after'))
      .toBe(tabs);
  });
});
