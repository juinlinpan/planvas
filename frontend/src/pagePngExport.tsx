import type { CSSProperties, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import html2canvas from 'html2canvas';

import type { BoardItem, PageBoardData } from './api';
import {
  getFrameChildren,
  getItemMagnetBounds,
  isFrame,
  isHiddenByCollapsedFrame,
  normalizeConnectorArrowsToSegments,
  sortItemsByLayer,
  summarizeFrameChild,
} from './canvasHelpers';
import { BoardItemRenderer } from './items/BoardItemRenderer';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const EXPORT_PADDING = 24;
const MAX_EXPORT_SCALE = 2;

function getVisibleItems(items: BoardItem[]): BoardItem[] {
  return sortItemsByLayer(items).filter(
    (item) => !isHiddenByCollapsedFrame(item, items),
  );
}

export function getPagePngExportBounds(items: BoardItem[]): Rect | null {
  const visibleItems = getVisibleItems(items);
  if (visibleItems.length === 0) {
    return null;
  }

  const bounds = visibleItems.map(getItemMagnetBounds);
  const left = Math.min(...bounds.map((item) => item.x)) - EXPORT_PADDING;
  const top = Math.min(...bounds.map((item) => item.y)) - EXPORT_PADDING;
  const right =
    Math.max(...bounds.map((item) => item.x + item.width)) + EXPORT_PADDING;
  const bottom =
    Math.max(...bounds.map((item) => item.y + item.height)) + EXPORT_PADDING;

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForExportLayout(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready;
  }

  await waitForNextFrame();
  await waitForNextFrame();
}

async function renderCanvasToPngBlob(
  content: Element,
  width: number,
  height: number,
): Promise<Blob> {
  if (!(content instanceof HTMLElement)) {
    throw new Error('PNG 匯出失敗，無法建立畫面內容。');
  }

  const scale = Math.min(
    MAX_EXPORT_SCALE,
    Math.max(1, window.devicePixelRatio || 1),
  );
  const canvas = await html2canvas(content, {
    backgroundColor: null,
    height,
    logging: false,
    scale,
    useCORS: true,
    width,
    windowHeight: Math.ceil(height),
    windowWidth: Math.ceil(width),
  });

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (blob === null) {
    throw new Error('PNG 匯出失敗，無法產生檔案。');
  }

  return blob;
}

function createExportHost(width: number, height: number): HTMLDivElement {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = 'none';
  host.style.opacity = '0';
  host.style.overflow = 'hidden';
  document.body.appendChild(host);
  return host;
}

function ExportSurface({
  boardData,
  bounds,
}: {
  boardData: PageBoardData;
  bounds: Rect;
}) {
  const normalizedItems = normalizeConnectorArrowsToSegments(
    boardData.board_items,
    boardData.connector_links,
  ).items;
  const visibleItems = getVisibleItems(normalizedItems);
  const surfaceStyle: CSSProperties = {
    position: 'relative',
    width: bounds.width,
    height: bounds.height,
    overflow: 'hidden',
    background: '#ffffff',
  };
  const worldStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate(${-bounds.x}px, ${-bounds.y}px)`,
    transformOrigin: '0 0',
  };

  return (
    <div style={surfaceStyle}>
      <div className="canvas-world" style={worldStyle}>
        {visibleItems.map((item) => {
          const childItems = isFrame(item)
            ? getFrameChildren(normalizedItems, item.id)
            : [];

          return (
            <BoardItemRenderer
              key={item.id}
              item={item}
              childCount={childItems.length}
              childSummaries={childItems.map(summarizeFrameChild)}
              isSelected={false}
              isEditing={false}
              renderMode="static"
              onMouseDown={() => {}}
              onEndpointMouseDown={() => {}}
              onWaypointMouseDown={() => {}}
              onMidpointMouseDown={() => {}}
              onDoubleClick={() => {}}
              onResizeMouseDown={() => {}}
              onToggleCollapse={() => {}}
              onUpdate={() => {}}
              onEditEnd={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}

async function renderExportSurfaceToBlob(
  surface: ReactNode,
  bounds: Rect,
): Promise<Blob> {
  const host = createExportHost(bounds.width, bounds.height);
  const root = ReactDOM.createRoot(host);

  try {
    root.render(surface);
    await waitForExportLayout();

    const content = host.firstElementChild;
    if (content === null) {
      throw new Error('PNG 匯出失敗，無法建立畫面內容。');
    }

    return await renderCanvasToPngBlob(content, bounds.width, bounds.height);
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportPageAsPng(boardData: PageBoardData): Promise<Blob> {
  const normalizedItems = normalizeConnectorArrowsToSegments(
    boardData.board_items,
    boardData.connector_links,
  ).items;
  const bounds = getPagePngExportBounds(normalizedItems);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  return renderExportSurfaceToBlob(
    <ExportSurface boardData={boardData} bounds={bounds} />,
    bounds,
  );
}
