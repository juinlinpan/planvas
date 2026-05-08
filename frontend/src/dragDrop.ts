export type DropPosition = 'before' | 'after';

type HorizontalBounds = Pick<DOMRect, 'left' | 'width'>;

export function getInlineDropPosition(
  clientX: number,
  bounds: HorizontalBounds,
): DropPosition {
  return clientX - bounds.left < bounds.width / 2 ? 'before' : 'after';
}
