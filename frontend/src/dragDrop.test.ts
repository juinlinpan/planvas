import { describe, expect, it } from 'vitest';

import { getInlineDropPosition } from './dragDrop';

describe('getInlineDropPosition', () => {
  const bounds = { left: 100, width: 200 };

  it('uses the left half as before for horizontal rows', () => {
    expect(getInlineDropPosition(120, bounds)).toBe('before');
    expect(getInlineDropPosition(199, bounds)).toBe('before');
  });

  it('uses the right half as after so tabs can move to the end', () => {
    expect(getInlineDropPosition(200, bounds)).toBe('after');
    expect(getInlineDropPosition(280, bounds)).toBe('after');
  });
});
