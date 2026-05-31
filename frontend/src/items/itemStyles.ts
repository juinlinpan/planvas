import { type CSSProperties } from 'react';
import { type BoardItem } from '../services/api';
import { ITEM_TYPE } from '../types/index';

export type FontWeightValue = 'normal' | 'bold';
export type FontStyleValue = 'normal' | 'italic';
export type StrokeStyleValue = 'solid' | 'dashed' | 'dotted';
export type LineCornerType = 'sharp' | 'rounded';
export type SegmentTextHorizontalPosition = 'start' | 'center' | 'end';
export type SegmentTextVerticalPosition = 'top' | 'middle' | 'bottom';
export type SegmentTextOrientation = 'horizontal' | 'slope';
export type TextHorizontalAlign = 'left' | 'center' | 'right';
export type TextVerticalAlign = 'top' | 'middle' | 'bottom';
export type ColorOption = {
  name: string;
  value: string;
};

export type BoardItemStyle = {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: FontWeightValue;
  fontStyle?: FontStyleValue;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyleValue;
  lineCornerType?: LineCornerType;
  arrowHeadSize?: number;
  segmentTextHorizontalPosition?: SegmentTextHorizontalPosition;
  segmentTextVerticalPosition?: SegmentTextVerticalPosition;
  segmentTextOrientation?: SegmentTextOrientation;
  textHorizontalAlign?: TextHorizontalAlign;
  textVerticalAlign?: TextVerticalAlign;
};

export type ProjectDefaultStyle = {
  textColor?: string;
  smallItemBackgroundColor?: string;
  largeObjectBackgroundColor?: string;
  linkColor?: string;
  linkTextColor?: string;
  fontSize?: number;
  strokeWidth?: number;
  segmentTextVerticalPosition?: SegmentTextVerticalPosition;
};

export type ResolvedBoardItemStyle = {
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontWeight: FontWeightValue;
  fontStyle: FontStyleValue;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyleValue;
  lineCornerType: LineCornerType;
  arrowHeadSize: number;
  segmentTextHorizontalPosition: SegmentTextHorizontalPosition;
  segmentTextVerticalPosition: SegmentTextVerticalPosition;
  segmentTextOrientation: SegmentTextOrientation;
  textHorizontalAlign: TextHorizontalAlign;
  textVerticalAlign: TextVerticalAlign;
};

export const BACKGROUND_COLOR_OPTIONS = [
  // Row 1: Grayscale (左淺右深)
  { name: 'Pearl', value: '#f1f2f4' },
  { name: 'Alabaster', value: '#e2e5e8' },
  { name: 'Snow', value: '#cbd1d6' },
  { name: 'Ash', value: '#b4bcc3' },
  { name: 'Stone', value: '#9da8b1' },
  { name: 'Slate Light', value: '#86939f' },
  { name: 'Slate Dark', value: '#6e7e8d' },

  // Row 2: Yellow -> Orange -> Red (左淺右深, 粉嫩色系)
  { name: 'Cream', value: '#faf5d6' },
  { name: 'Butter', value: '#faefbd' },
  { name: 'Peach', value: '#fadba3' },
  { name: 'Apricot', value: '#f8c390' },
  { name: 'Coral', value: '#f4aa86' },
  { name: 'Rose', value: '#f0927a' },
  { name: 'Red', value: '#eb7c7c' },

  // Row 3: Greens (左淺右深, 粉嫩色系)
  { name: 'Mint Ice', value: '#dcf5de' },
  { name: 'Mint Cream', value: '#caebcd' },
  { name: 'Pale Mint', value: '#b7dfbc' },
  { name: 'Mint', value: '#a5d2ab' },
  { name: 'Celadon', value: '#96c59d' },
  { name: 'Sage Light', value: '#84b68c' },
  { name: 'Sage Deep', value: '#73a77c' },

  // Row 4: Blues (左淺右深, 粉嫩色系)
  { name: 'Near White Blue', value: '#d8edf9' },
  { name: 'Ice Cream Blue', value: '#c6e3f4' },
  { name: 'Pale Blue', value: '#b4daf0' },
  { name: 'Ice Blue', value: '#a2d0eb' },
  { name: 'Sky Blue', value: '#93c6e6' },
  { name: 'Ocean Light', value: '#83badb' },
  { name: 'Ocean Deep', value: '#73aed1' },
] as const satisfies readonly ColorOption[];

export const TEXT_COLOR_OPTIONS = [
  { name: 'Ink', value: '#1f2937' },
  { name: 'Gray', value: '#6b7280' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
] as const satisfies readonly ColorOption[];

export const STROKE_COLOR_OPTIONS = [
  { name: 'Black', value: '#1f2937' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
] as const satisfies readonly ColorOption[];

const DEFAULT_BACKGROUND_COLOR = BACKGROUND_COLOR_OPTIONS[0].value;
const DEFAULT_FRAME_BACKGROUND_COLOR = BACKGROUND_COLOR_OPTIONS[22].value;
const DEFAULT_TEXT_COLOR = TEXT_COLOR_OPTIONS[0].value;
const DEFAULT_STROKE_COLOR = STROKE_COLOR_OPTIONS[0].value;
const DEFAULT_ARROW_HEAD_SIZE = 14;
const STICKY_COLORS = BACKGROUND_COLOR_OPTIONS.slice(7).map(
  (option) => option.value,
);

function createPaletteLookup(
  options: readonly ColorOption[],
  aliases: Record<string, string> = {},
): ReadonlyMap<string, string> {
  return new Map<string, string>([
    ...options.map((option) => [option.value, option.value] as const),
    ...Object.entries(aliases),
  ]);
}

const BACKGROUND_COLOR_LOOKUP = createPaletteLookup(BACKGROUND_COLOR_OPTIONS, {
  transparent: 'transparent',
  '#ffffff': DEFAULT_BACKGROUND_COLOR,
  '#fffdf7': DEFAULT_BACKGROUND_COLOR,
  '#f8fafc': DEFAULT_BACKGROUND_COLOR,
  '#fef08a': BACKGROUND_COLOR_OPTIONS[9].value,
  '#fde68a': BACKGROUND_COLOR_OPTIONS[9].value,
  '#fed7aa': BACKGROUND_COLOR_OPTIONS[10].value,
  '#bbf7d0': BACKGROUND_COLOR_OPTIONS[17].value,
  '#dcfce7': BACKGROUND_COLOR_OPTIONS[17].value,
  '#ecfeff': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#eff6ff': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#bfdbfe': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#fecaca': BACKGROUND_COLOR_OPTIONS[13].value,
  '#ede9fe': BACKGROUND_COLOR_OPTIONS[24].value,
  '#e9d5ff': BACKGROUND_COLOR_OPTIONS[24].value,
  // Backward compatibility with the old default palette
  '#f9f8f5': BACKGROUND_COLOR_OPTIONS[0].value,
  '#fef5b3': BACKGROUND_COLOR_OPTIONS[9].value,
  '#fdddd0': BACKGROUND_COLOR_OPTIONS[10].value,
  '#f4e8d0': BACKGROUND_COLOR_OPTIONS[11].value,
  '#f5d8e8': BACKGROUND_COLOR_OPTIONS[8].value,
  '#e2e4ea': BACKGROUND_COLOR_OPTIONS[2].value,
});

const TEXT_COLOR_LOOKUP = createPaletteLookup(TEXT_COLOR_OPTIONS, {
  '#1d1d1f': DEFAULT_TEXT_COLOR,
  '#0f172a': DEFAULT_TEXT_COLOR,
  '#164e63': TEXT_COLOR_OPTIONS[5].value,
  // Backward compatibility with the old text colors
  '#1d4ed8': TEXT_COLOR_OPTIONS[5].value, // old Blue -> new Blue
  '#0f766e': TEXT_COLOR_OPTIONS[4].value, // old Teal -> new Green
  '#15803d': TEXT_COLOR_OPTIONS[4].value, // old Green -> new Green
  '#c2410c': TEXT_COLOR_OPTIONS[3].value, // old Orange -> new Orange
  '#be123c': TEXT_COLOR_OPTIONS[2].value, // old Rose -> new Red
});

const STROKE_COLOR_LOOKUP = createPaletteLookup(STROKE_COLOR_OPTIONS, {
  '#475569': DEFAULT_STROKE_COLOR,
  '#64748b': DEFAULT_STROKE_COLOR,
});

function sanitizeFreeColor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function sanitizePaletteColor(
  value: unknown,
  lookup: ReadonlyMap<string, string>,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return lookup.get(value.trim().toLowerCase());
}

function sanitizeFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(32, Math.max(12, Math.round(value)));
}

function sanitizeFontWeight(value: unknown): FontWeightValue | undefined {
  return value === 'bold' || value === 'normal' ? value : undefined;
}

function sanitizeFontStyle(value: unknown): FontStyleValue | undefined {
  return value === 'italic' || value === 'normal' ? value : undefined;
}

function sanitizeStrokeWidth(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(16, Math.max(1, Math.round(value)));
}

function sanitizeStrokeStyle(value: unknown): StrokeStyleValue | undefined {
  return value === 'solid' || value === 'dashed' || value === 'dotted'
    ? value
    : undefined;
}

function sanitizeLineCornerType(value: unknown): LineCornerType | undefined {
  return value === 'sharp' || value === 'rounded' ? value : undefined;
}

function sanitizeArrowHeadSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(40, Math.max(8, Math.round(value)));
}

function sanitizeSegmentTextHorizontalPosition(
  value: unknown,
): SegmentTextHorizontalPosition | undefined {
  return value === 'start' || value === 'center' || value === 'end'
    ? value
    : undefined;
}

function sanitizeSegmentTextVerticalPosition(
  value: unknown,
): SegmentTextVerticalPosition | undefined {
  return value === 'top' || value === 'middle' || value === 'bottom'
    ? value
    : undefined;
}

function sanitizeSegmentTextOrientation(
  value: unknown,
): SegmentTextOrientation | undefined {
  return value === 'horizontal' || value === 'slope' ? value : undefined;
}

export function sanitizeTextHorizontalAlign(
  value: unknown,
): TextHorizontalAlign | undefined {
  return value === 'left' || value === 'center' || value === 'right'
    ? value
    : undefined;
}

export function sanitizeTextVerticalAlign(
  value: unknown,
): TextVerticalAlign | undefined {
  return value === 'top' || value === 'middle' || value === 'bottom'
    ? value
    : undefined;
}

export function getStickyNoteColor(itemId: string): string {
  let hash = 0;
  for (let index = 0; index < itemId.length; index += 1) {
    hash = (hash * 31 + itemId.charCodeAt(index)) >>> 0;
  }

  return (
    STICKY_COLORS[hash % STICKY_COLORS.length] ??
    BACKGROUND_COLOR_OPTIONS[1].value
  );
}

export function parseBoardItemStyle(styleJson: string | null): BoardItemStyle {
  if (styleJson === null || styleJson.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(styleJson) as Record<string, unknown>;
    return {
      backgroundColor: sanitizePaletteColor(
        parsed.backgroundColor,
        BACKGROUND_COLOR_LOOKUP,
      ),
      textColor: sanitizePaletteColor(parsed.textColor, TEXT_COLOR_LOOKUP),
      fontSize: sanitizeFontSize(parsed.fontSize),
      fontWeight: sanitizeFontWeight(parsed.fontWeight),
      fontStyle: sanitizeFontStyle(parsed.fontStyle),
      strokeColor:
        sanitizePaletteColor(parsed.strokeColor, STROKE_COLOR_LOOKUP) ??
        sanitizeFreeColor(parsed.strokeColor),
      strokeWidth: sanitizeStrokeWidth(parsed.strokeWidth),
      strokeStyle: sanitizeStrokeStyle(parsed.strokeStyle),
      lineCornerType: sanitizeLineCornerType(parsed.lineCornerType),
      arrowHeadSize: sanitizeArrowHeadSize(parsed.arrowHeadSize),
      segmentTextHorizontalPosition: sanitizeSegmentTextHorizontalPosition(
        parsed.segmentTextHorizontalPosition,
      ),
      segmentTextVerticalPosition: sanitizeSegmentTextVerticalPosition(
        parsed.segmentTextVerticalPosition,
      ),
      segmentTextOrientation: sanitizeSegmentTextOrientation(
        parsed.segmentTextOrientation,
      ),
      textHorizontalAlign: sanitizeTextHorizontalAlign(
        parsed.textHorizontalAlign,
      ),
      textVerticalAlign: sanitizeTextVerticalAlign(parsed.textVerticalAlign),
    };
  } catch {
    return {};
  }
}

export function serializeBoardItemStyle(style: BoardItemStyle): string | null {
  const nextStyle: BoardItemStyle = {
    backgroundColor: sanitizePaletteColor(
      style.backgroundColor,
      BACKGROUND_COLOR_LOOKUP,
    ),
    textColor: sanitizePaletteColor(style.textColor, TEXT_COLOR_LOOKUP),
    fontSize: sanitizeFontSize(style.fontSize),
    fontWeight: sanitizeFontWeight(style.fontWeight),
    fontStyle: sanitizeFontStyle(style.fontStyle),
    strokeColor:
      sanitizePaletteColor(style.strokeColor, STROKE_COLOR_LOOKUP) ??
      sanitizeFreeColor(style.strokeColor),
    strokeWidth: sanitizeStrokeWidth(style.strokeWidth),
    strokeStyle: sanitizeStrokeStyle(style.strokeStyle),
    lineCornerType: sanitizeLineCornerType(style.lineCornerType),
    arrowHeadSize: sanitizeArrowHeadSize(style.arrowHeadSize),
    segmentTextHorizontalPosition: sanitizeSegmentTextHorizontalPosition(
      style.segmentTextHorizontalPosition,
    ),
    segmentTextVerticalPosition: sanitizeSegmentTextVerticalPosition(
      style.segmentTextVerticalPosition,
    ),
    segmentTextOrientation: sanitizeSegmentTextOrientation(
      style.segmentTextOrientation,
    ),
    textHorizontalAlign: sanitizeTextHorizontalAlign(style.textHorizontalAlign),
    textVerticalAlign: sanitizeTextVerticalAlign(style.textVerticalAlign),
  };

  const entries = Object.entries(nextStyle).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify(Object.fromEntries(entries));
}

export function parseProjectDefaultStyle(
  styleJson: string | null,
): ProjectDefaultStyle {
  if (styleJson === null || styleJson.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(styleJson) as Record<string, unknown>;
    return {
      textColor: sanitizePaletteColor(parsed.textColor, TEXT_COLOR_LOOKUP),
      smallItemBackgroundColor: sanitizePaletteColor(
        parsed.smallItemBackgroundColor,
        BACKGROUND_COLOR_LOOKUP,
      ),
      largeObjectBackgroundColor: sanitizePaletteColor(
        parsed.largeObjectBackgroundColor,
        BACKGROUND_COLOR_LOOKUP,
      ),
      linkColor:
        sanitizePaletteColor(parsed.linkColor, STROKE_COLOR_LOOKUP) ??
        sanitizeFreeColor(parsed.linkColor),
      linkTextColor: sanitizePaletteColor(
        parsed.linkTextColor,
        TEXT_COLOR_LOOKUP,
      ),
      fontSize: sanitizeFontSize(parsed.fontSize),
      strokeWidth: sanitizeStrokeWidth(parsed.strokeWidth),
      segmentTextVerticalPosition: sanitizeSegmentTextVerticalPosition(
        parsed.segmentTextVerticalPosition,
      ),
    };
  } catch {
    return {};
  }
}

export function serializeProjectDefaultStyle(
  style: ProjectDefaultStyle,
): string | null {
  const nextStyle: ProjectDefaultStyle = {
    textColor: sanitizePaletteColor(style.textColor, TEXT_COLOR_LOOKUP),
    smallItemBackgroundColor: sanitizePaletteColor(
      style.smallItemBackgroundColor,
      BACKGROUND_COLOR_LOOKUP,
    ),
    largeObjectBackgroundColor: sanitizePaletteColor(
      style.largeObjectBackgroundColor,
      BACKGROUND_COLOR_LOOKUP,
    ),
    linkColor:
      sanitizePaletteColor(style.linkColor, STROKE_COLOR_LOOKUP) ??
      sanitizeFreeColor(style.linkColor),
    linkTextColor: sanitizePaletteColor(style.linkTextColor, TEXT_COLOR_LOOKUP),
    fontSize: sanitizeFontSize(style.fontSize),
    strokeWidth: sanitizeStrokeWidth(style.strokeWidth),
    segmentTextVerticalPosition: sanitizeSegmentTextVerticalPosition(
      style.segmentTextVerticalPosition,
    ),
  };

  const entries = Object.entries(nextStyle).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify(Object.fromEntries(entries));
}

function getDefaultBackgroundColor(
  item: BoardItem,
  projectDefaultStyle: ProjectDefaultStyle = {},
): string {
  if (item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow) {
    return 'transparent';
  }

  if (item.type === ITEM_TYPE.frame || item.type === ITEM_TYPE.table) {
    return (
      projectDefaultStyle.largeObjectBackgroundColor ??
      (item.type === ITEM_TYPE.frame
        ? DEFAULT_FRAME_BACKGROUND_COLOR
        : DEFAULT_BACKGROUND_COLOR)
    );
  }

  if (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.note_paper
  ) {
    return (
      projectDefaultStyle.smallItemBackgroundColor ??
      DEFAULT_BACKGROUND_COLOR
    );
  }

  if (item.type === ITEM_TYPE.sticky_note) {
    return getStickyNoteColor(item.id);
  }

  switch (item.type) {
    case ITEM_TYPE.text_box:
    default:
      return DEFAULT_BACKGROUND_COLOR;
  }
}

export function resolveBoardItemStyle(
  item: BoardItem,
  projectDefaultStyle: ProjectDefaultStyle = {},
): ResolvedBoardItemStyle {
  const parsed = parseBoardItemStyle(item.style_json);
  const isLink = item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow;
  return {
    backgroundColor:
      parsed.backgroundColor ??
      getDefaultBackgroundColor(item, projectDefaultStyle),
    textColor:
      parsed.textColor ??
      (isLink
        ? (projectDefaultStyle.linkTextColor ??
          projectDefaultStyle.textColor ??
          DEFAULT_TEXT_COLOR)
        : (projectDefaultStyle.textColor ?? DEFAULT_TEXT_COLOR)),
    fontSize: parsed.fontSize ?? projectDefaultStyle.fontSize ?? 14,
    fontWeight: parsed.fontWeight ?? 'normal',
    fontStyle: parsed.fontStyle ?? 'normal',
    strokeColor:
      parsed.strokeColor ??
      (isLink
        ? (projectDefaultStyle.linkColor ?? DEFAULT_STROKE_COLOR)
        : DEFAULT_STROKE_COLOR),
    strokeWidth: parsed.strokeWidth ?? projectDefaultStyle.strokeWidth ?? 3,
    strokeStyle: parsed.strokeStyle ?? 'solid',
    lineCornerType: parsed.lineCornerType ?? 'sharp',
    arrowHeadSize: parsed.arrowHeadSize ?? DEFAULT_ARROW_HEAD_SIZE,
    segmentTextHorizontalPosition:
      parsed.segmentTextHorizontalPosition ?? 'center',
    segmentTextVerticalPosition:
      parsed.segmentTextVerticalPosition ??
      projectDefaultStyle.segmentTextVerticalPosition ??
      'middle',
    segmentTextOrientation: parsed.segmentTextOrientation ?? 'horizontal',
    textHorizontalAlign: parsed.textHorizontalAlign ?? 'center',
    textVerticalAlign: parsed.textVerticalAlign ?? 'middle',
  };
}

export function getBoardItemTypographyStyle(
  item: BoardItem,
  projectDefaultStyle: ProjectDefaultStyle = {},
): CSSProperties {
  const style = resolveBoardItemStyle(item, projectDefaultStyle);
  return {
    color: style.textColor,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
  };
}
