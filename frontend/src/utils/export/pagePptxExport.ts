import type { BoardItem, PageBoardData } from './api';
import { getPagePngExportBounds } from './pagePngExport';
import { parseBoardItemStyle, resolveBoardItemStyle } from './itemStyles';
import { parseTableData } from './tableData';
import { ITEM_TYPE } from './types';

const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
const SLIDE_MARGIN = 0.3;
const TITLE_HEIGHT = 0.45;
const TITLE_GAP = 0.15;
const FRAME_FOOTER_RATIO = 0.72;
let pptxGenJSImport: Promise<typeof import('pptxgenjs')> | null = null;

type Placement = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function toPptxBlob(output: string | ArrayBuffer | Blob | Uint8Array): Blob {
  if (output instanceof Blob) {
    return output;
  }

  if (typeof output === 'string' || output instanceof ArrayBuffer) {
    return new Blob([output], { type: PPTX_MIME_TYPE });
  }

  const bytes = new Uint8Array(output.byteLength);
  bytes.set(output);
  return new Blob([bytes.buffer], { type: PPTX_MIME_TYPE });
}

async function createPptxInstance() {
  pptxGenJSImport ??= import('pptxgenjs');
  const module = await pptxGenJSImport;
  return new module.default();
}

function toPptxColor(
  color: string | undefined | null,
  fallback = 'F8FAFC',
): string {
  if (!color) {
    return fallback;
  }
  const normalized = color.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return fallback;
}

function getContentLayoutTransform(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): LayoutTransform {
  const contentTop = SLIDE_MARGIN + TITLE_HEIGHT + TITLE_GAP;
  const availableWidth = SLIDE_WIDTH - SLIDE_MARGIN * 2;
  const availableHeight = SLIDE_HEIGHT - contentTop - SLIDE_MARGIN;
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );

  return {
    scale,
    offsetX: SLIDE_MARGIN + (availableWidth - bounds.width * scale) / 2,
    offsetY: contentTop + (availableHeight - bounds.height * scale) / 2,
  };
}

function projectItemPlacement(
  item: BoardItem,
  bounds: { x: number; y: number; width: number; height: number },
  transform: LayoutTransform,
): Placement {
  return {
    x: transform.offsetX + (item.x - bounds.x) * transform.scale,
    y: transform.offsetY + (item.y - bounds.y) * transform.scale,
    w: Math.max(item.width * transform.scale, 0.06),
    h: Math.max(item.height * transform.scale, 0.06),
  };
}

function getTextContent(item: BoardItem): string {
  const content = item.content?.trim();
  if (content && content.length > 0) {
    return content;
  }
  const title = item.title?.trim();
  if (title && title.length > 0) {
    return title;
  }
  return item.type;
}

type PptxTextRun = {
  text: string;
  options?: {
    bold?: boolean;
    italic?: boolean;
    color?: string;
    fontSize?: number;
    breakLine?: boolean;
    bullet?: boolean | { type: string };
  };
};

/**
 * Convert a markdown string into a pptxgenjs text-run array.
 * Handles: h1-h3 (bold + larger), **bold**, *italic*, bullet lists (- / *), plain text.
 * Each logical line becomes its own text run with breakLine:true so the layout matches.
 */
function markdownToPptxRuns(
  md: string,
  baseColor = '334155',
  baseFontSize = 11,
): PptxTextRun[] {
  const runs: PptxTextRun[] = [];

  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Heading detection
    const h1 = raw.match(/^#\s+(.*)/);
    const h2 = raw.match(/^##\s+(.*)/);
    const h3 = raw.match(/^###\s+(.*)/);
    const bullet = raw.match(/^[\-\*]\s+(.*)/);

    const isLast = i === lines.length - 1;
    const breakLine = isLast ? false : true;

    if (h1 || h2 || h3) {
      const level = h1 ? 1 : h2 ? 2 : 3;
      const text = (h1 ?? h2 ?? h3)![1];
      const fontSize =
        level === 1
          ? baseFontSize + 5
          : level === 2
            ? baseFontSize + 3
            : baseFontSize + 1;
      runs.push({
        text,
        options: { bold: true, color: '111827', fontSize, breakLine },
      });
    } else if (bullet) {
      const text = bullet[1];
      const inlineRuns = parseInlineMarkdown(text, baseColor, baseFontSize);
      // Prepend bullet character
      inlineRuns[0] = {
        text: '• ' + inlineRuns[0].text,
        options: inlineRuns[0].options,
      };
      // Only the last inline run of this line gets breakLine
      inlineRuns.forEach((r, ri) => {
        r.options = {
          ...r.options,
          breakLine: ri === inlineRuns.length - 1 ? breakLine : false,
        };
      });
      runs.push(...inlineRuns);
    } else {
      const inlineRuns = parseInlineMarkdown(raw, baseColor, baseFontSize);
      inlineRuns.forEach((r, ri) => {
        r.options = {
          ...r.options,
          breakLine: ri === inlineRuns.length - 1 ? breakLine : false,
        };
      });
      runs.push(...inlineRuns);
    }
  }

  return runs.length > 0 ? runs : [{ text: '' }];
}

function parseInlineMarkdown(
  text: string,
  color: string,
  fontSize: number,
): PptxTextRun[] {
  // Split on **bold** and *italic* tokens
  const runs: PptxTextRun[] = [];
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({
        text: text.slice(lastIndex, match.index),
        options: { color, fontSize },
      });
    }
    if (match[2] !== undefined) {
      // **bold**
      runs.push({ text: match[2], options: { bold: true, color, fontSize } });
    } else if (match[3] !== undefined) {
      // *italic*
      runs.push({ text: match[3], options: { italic: true, color, fontSize } });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), options: { color, fontSize } });
  }

  return runs.length > 0
    ? runs
    : [{ text: text, options: { color, fontSize } }];
}

function renderNoteContentSlides(
  pptx: any,
  item: BoardItem,
  index: number,
): void {
  if (!item.content || item.content.trim().length === 0) {
    return;
  }

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };

  const heading =
    item.title?.trim() ||
    item.content
      .trim()
      .split('\n')[0]
      .replace(/^#+\s*/, '')
      .slice(0, 60) ||
    'Note';
  const label = `${index}. ${heading}`;

  // Slide title
  slide.addText(label, {
    x: SLIDE_MARGIN,
    y: SLIDE_MARGIN,
    w: SLIDE_WIDTH - SLIDE_MARGIN * 2,
    h: TITLE_HEIGHT,
    bold: true,
    color: '111827',
    fontFace: 'Arial',
    fontSize: 18,
    margin: 0,
    valign: 'middle',
  });

  // Full content rendered from markdown
  const textRuns = markdownToPptxRuns(item.content);
  slide.addText(textRuns, {
    x: SLIDE_MARGIN,
    y: SLIDE_MARGIN + TITLE_HEIGHT + TITLE_GAP,
    w: SLIDE_WIDTH - SLIDE_MARGIN * 2,
    h: SLIDE_HEIGHT - (SLIDE_MARGIN * 2 + TITLE_HEIGHT + TITLE_GAP),
    fontFace: 'Arial',
    valign: 'top',
    margin: 5,
  });
}

function renderTableAsNativeTable(
  slide: any,
  item: BoardItem,
  placement: Placement,
): void {
  const table = parseTableData(item.data_json);
  const rows: Array<Array<string | Record<string, unknown>>> = [];

  for (let rowIndex = 0; rowIndex < table.rows; rowIndex += 1) {
    const row: Array<string | Record<string, unknown>> = [];
    for (let colIndex = 0; colIndex < table.cols; colIndex += 1) {
      const cell = table.cells[rowIndex]?.[colIndex] ?? null;
      if (cell === null) {
        row.push('');
        continue;
      }
      row.push({
        text: cell.content,
        options: {
          rowspan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          colspan: cell.colSpan > 1 ? cell.colSpan : undefined,
          fill: {
            color: toPptxColor(cell.backgroundColor, 'FFFFFF'),
          },
          margin: 1,
          valign: 'middle',
        },
      });
    }
    rows.push(row);
  }

  slide.addTable(rows, {
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    color: '0F172A',
    border: {
      pt: 1,
      color: 'CBD5E1',
    },
    colW: table.colWidths.map((fraction) =>
      Math.max(fraction * placement.w, 0.08),
    ),
    rowH: table.rowHeights.map((fraction) =>
      Math.max(fraction * placement.h, 0.08),
    ),
    valign: 'middle',
    fontFace: 'Arial',
    fontSize: 12,
  });
}

function renderFrameAsFooterRect(
  slide: any,
  item: BoardItem,
  placement: Placement,
): void {
  const style = resolveBoardItemStyle(item);
  const frameName = item.title?.trim() || item.content?.trim() || 'frame';
  const footerHeight = Math.max(placement.h * FRAME_FOOTER_RATIO, 0.15);
  const footerY = placement.y + placement.h - footerHeight;

  slide.addShape('rect', {
    x: placement.x,
    y: footerY,
    w: placement.w,
    h: footerHeight,
    fill: {
      color: toPptxColor(style.backgroundColor, 'E2E8F0'),
      transparency: 10,
    },
    line: {
      color: '94A3B8',
      pt: 1,
    },
  });

  slide.addText(frameName, {
    x: placement.x,
    y: Math.max(placement.y - 0.22, SLIDE_MARGIN + TITLE_HEIGHT + 0.02),
    w: placement.w,
    h: 0.2,
    bold: true,
    color: toPptxColor(style.textColor, '0F172A'),
    fontFace: 'Arial',
    fontSize: 12,
    margin: 0,
    valign: 'mid',
    align: 'left',
  });
}

function truncateText(
  text: string,
  width: number,
  height: number,
  fontSize: number,
): string {
  // Rough estimation: each character is about 0.5 * fontSize wide, each line is about 1.2 * fontSize high.
  // PPT units are inches. 1 point = 1/72 inch.
  const charWidth = (fontSize * 0.5) / 72;
  const lineHeight = (fontSize * 1.2) / 72;
  const charsPerLine = Math.floor(width / charWidth);
  const maxLines = Math.floor(height / lineHeight);
  const maxChars = charsPerLine * maxLines;

  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, Math.max(0, maxChars - 3)) + '...';
}

function renderAsTextBox(
  slide: any,
  item: BoardItem,
  placement: Placement,
): void {
  const style = resolveBoardItemStyle(item);
  const parsed = parseBoardItemStyle(item.style_json);
  const fontSize = Math.max(Math.min(style.fontSize * 0.7, 24), 9);
  let text = getTextContent(item);

  // For note_paper / sticky_note on the main slide, truncate to fit the box
  if (
    item.type === ITEM_TYPE.note_paper ||
    item.type === ITEM_TYPE.sticky_note
  ) {
    text = truncateText(text, placement.w, placement.h, fontSize);
  }

  slide.addText(text, {
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    shapeName: 'rect',
    fill: {
      color: toPptxColor(
        parsed.backgroundColor,
        item.type === ITEM_TYPE.text_box
          ? 'FFFFFF'
          : toPptxColor(style.backgroundColor),
      ),
      transparency: item.type === ITEM_TYPE.text_box ? 100 : 0,
    },
    line: {
      color: '94A3B8',
      pt: item.type === ITEM_TYPE.text_box ? 0.5 : 1,
    },
    color: toPptxColor(style.textColor, '0F172A'),
    fontFace: 'Arial',
    fontSize,
    bold: style.fontWeight === 'bold',
    italic: style.fontStyle === 'italic',
    valign: 'top',
    margin: 3,
    breakLine: true,
  });
}

export async function exportPageAsPptx(
  boardData: PageBoardData,
): Promise<Blob> {
  const bounds = getPagePngExportBounds(boardData.board_items);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  const transform = getContentLayoutTransform(bounds);
  const pptx = await createPptxInstance();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Whiteboard Planner';
  pptx.company = 'Whiteboard Planner';
  pptx.subject = 'Whiteboard page export';
  pptx.title = boardData.page.name;

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText(boardData.page.name, {
    x: SLIDE_MARGIN,
    y: SLIDE_MARGIN,
    w: SLIDE_WIDTH - SLIDE_MARGIN * 2,
    h: TITLE_HEIGHT,
    bold: true,
    color: '111827',
    fontFace: 'Arial',
    fontSize: 20,
    margin: 0,
    valign: 'middle',
  });

  const orderedItems = [...boardData.board_items].sort((left, right) => {
    if (left.z_index !== right.z_index) {
      return left.z_index - right.z_index;
    }
    return left.created_at.localeCompare(right.created_at);
  });

  for (const item of orderedItems) {
    const placement = projectItemPlacement(item, bounds, transform);
    if (item.type === ITEM_TYPE.table) {
      renderTableAsNativeTable(slide, item, placement);
      continue;
    }
    if (item.type === ITEM_TYPE.frame) {
      renderFrameAsFooterRect(slide, item, placement);
      continue;
    }
    renderAsTextBox(slide, item, placement);
  }

  // Add detail slides for notes
  let noteIndex = 0;
  for (const item of orderedItems) {
    if (
      item.type === ITEM_TYPE.note_paper ||
      item.type === ITEM_TYPE.sticky_note
    ) {
      noteIndex += 1;
      renderNoteContentSlides(pptx, item, noteIndex);
    }
  }

  slide.addNotes(`Whiteboard page export: ${boardData.page.name}`);

  const output = await pptx.write({
    compression: true,
    outputType: 'blob',
  });
  const outputBlob = toPptxBlob(output);

  if (outputBlob.size === 0) {
    throw new Error('PPTX 匯出失敗，無法產生檔案。');
  }

  return outputBlob.type === PPTX_MIME_TYPE
    ? outputBlob
    : new Blob([outputBlob], { type: PPTX_MIME_TYPE });
}
