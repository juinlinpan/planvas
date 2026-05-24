export type MagnetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MagnetPoint = {
  x: number;
  y: number;
};

type AxisMatch = {
  delta: number;
};

function getNearestGridMatch(
  values: number[],
  gridSize: number,
  tolerance: number,
): AxisMatch | null {
  if (gridSize <= 0) {
    return null;
  }

  let bestMatch: AxisMatch | null = null;

  for (const value of values) {
    const candidate = Math.round(value / gridSize) * gridSize;
    const delta = candidate - value;
    if (Math.abs(delta) > tolerance) {
      continue;
    }

    if (bestMatch === null || Math.abs(delta) < Math.abs(bestMatch.delta)) {
      bestMatch = { delta };
    }
  }

  return bestMatch;
}

export function snapValueToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) {
    return value;
  }

  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(
  point: MagnetPoint,
  gridSize: number,
): MagnetPoint {
  return {
    x: snapValueToGrid(point.x, gridSize),
    y: snapValueToGrid(point.y, gridSize),
  };
}

export function magnetMoveRect(
  rect: MagnetRect,
  gridSize: number,
  tolerance: number,
): { x: number; y: number } {
  const horizontalMatch = getNearestGridMatch(
    [rect.x, rect.x + rect.width],
    gridSize,
    tolerance,
  );
  const verticalMatch = getNearestGridMatch(
    [rect.y, rect.y + rect.height],
    gridSize,
    tolerance,
  );

  return {
    x: rect.x + (horizontalMatch?.delta ?? 0),
    y: rect.y + (verticalMatch?.delta ?? 0),
  };
}

export type ResizeEdge = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export function magnetResizeRect(
  rect: MagnetRect,
  gridSize: number,
  tolerance: number,
  edge: ResizeEdge,
  rawRect: MagnetRect,
): MagnetRect {
  const result = { ...rawRect };

  const movesLeft = edge.includes('w');
  const movesRight = edge.includes('e');
  const movesTop = edge.includes('n');
  const movesBottom = edge.includes('s');

  if (movesRight) {
    const horizontalMatch = getNearestGridMatch(
      [result.x + result.width],
      gridSize,
      tolerance,
    );
    result.width += horizontalMatch?.delta ?? 0;
  }
  if (movesLeft) {
    const horizontalMatch = getNearestGridMatch(
      [result.x],
      gridSize,
      tolerance,
    );
    if (horizontalMatch) {
      result.x += horizontalMatch.delta;
      result.width -= horizontalMatch.delta;
    }
  }

  if (movesBottom) {
    const verticalMatch = getNearestGridMatch(
      [result.y + result.height],
      gridSize,
      tolerance,
    );
    result.height += verticalMatch?.delta ?? 0;
  }
  if (movesTop) {
    const verticalMatch = getNearestGridMatch(
      [result.y],
      gridSize,
      tolerance,
    );
    if (verticalMatch) {
      result.y += verticalMatch.delta;
      result.height -= verticalMatch.delta;
    }
  }

  return result;
}
