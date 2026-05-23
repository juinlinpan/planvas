function isScrollableOverflow(value: string): boolean {
  return value === 'auto' || value === 'scroll' || value === 'overlay';
}

export function isScrollableWheelTarget(
  target: EventTarget | null,
  container: HTMLElement | null,
  deltaX: number,
  deltaY: number,
): boolean {
  if (!(target instanceof Element) || !container) {
    return false;
  }

  const prefersHorizontalScroll = Math.abs(deltaX) > Math.abs(deltaY);
  let element: Element | null = target;

  while (element && element !== container) {
    if (element instanceof HTMLElement) {
      const style = window.getComputedStyle(element);
      const canScrollY =
        isScrollableOverflow(style.overflowY) &&
        element.scrollHeight > element.clientHeight;
      const canScrollX =
        isScrollableOverflow(style.overflowX) &&
        element.scrollWidth > element.clientWidth;

      if (prefersHorizontalScroll ? canScrollX : canScrollY) {
        return true;
      }

      if (!prefersHorizontalScroll && deltaY === 0 && canScrollX) {
        return true;
      }
    }

    element = element.parentElement;
  }

  return false;
}
