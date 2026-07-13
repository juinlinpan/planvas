import { type CSSProperties, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';

import type { BoardItem, PageBoardData, ProjectNote } from '../../services/api';
import { syncMarkdownBackedItems } from '../../services/noteSync';
import {
  getFrameChildren,
  getMarkdownH1,
  getFirstNonEmptyLine,
  isFrame,
  isHiddenByCollapsedFrame,
  normalizeConnectorArrowsToSegments,
  sortItemsByLayer,
  summarizeFrameChild,
} from '../../canvasHelpers/canvasHelpers';
import { BoardItemRenderer } from '../../items/BoardItemRenderer';
import { MarkdownPreview } from '../../components/markdownPreview';
import { getPagePngExportBounds } from './pagePngExport';
import { ITEM_TYPE } from '../../types/index';

const HTML_MIME_TYPE = 'text/html;charset=utf-8';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      if (rules === null) continue;
      for (const rule of Array.from(rules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      // Cross-origin stylesheet — skip silently.
    }
  }
  return chunks.join('\n');
}

function isNoteType(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.note_paper || item.type === ITEM_TYPE.sticky_note
  );
}

function getVisibleItems(boardData: PageBoardData): BoardItem[] {
  const normalizedItems = normalizeConnectorArrowsToSegments(
    boardData.board_items,
    boardData.connector_links,
  ).items;
  return sortItemsByLayer(normalizedItems).filter(
    (item) => !isHiddenByCollapsedFrame(item, normalizedItems),
  );
}

function buildSurfaceElement(
  boardData: PageBoardData,
  visibleItems: BoardItem[],
  bounds: Rect,
): ReactNode {
  const normalizedItems = normalizeConnectorArrowsToSegments(
    boardData.board_items,
    boardData.connector_links,
  ).items;

  const surfaceStyle: CSSProperties = {
    position: 'relative',
    width: bounds.width,
    height: bounds.height,
    background: '#ffffff',
  };
  const worldStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate(${-bounds.x}px, ${-bounds.y}px)`,
    transformOrigin: '0 0',
  };

  return (
    <div className="html-export-surface" style={surfaceStyle}>
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

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function tagNotesWithItemIds(
  host: HTMLElement,
  visibleItems: BoardItem[],
): void {
  const wrappers = host.querySelectorAll<HTMLElement>('.board-item');
  for (let i = 0; i < wrappers.length && i < visibleItems.length; i += 1) {
    const item = visibleItems[i];
    wrappers[i].dataset.itemId = item.id;
    if (isNoteType(item)) {
      wrappers[i].classList.add('html-export-note-clickable');
      wrappers[i].setAttribute('role', 'button');
      wrappers[i].setAttribute('tabindex', '0');
      wrappers[i].setAttribute(
        'aria-label',
        `Open note: ${getNoteHeadline(item)}`,
      );
    }
  }
}

async function renderSurfaceToHtml(
  surface: ReactNode,
  visibleItems: BoardItem[],
  width: number,
  height: number,
): Promise<string> {
  const host = createExportHost(width, height);
  const root = ReactDOM.createRoot(host);

  try {
    root.render(surface);
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextFrame();
    await waitForNextFrame();

    const content = host.firstElementChild;
    if (content === null) {
      throw new Error('HTML 匯出失敗，無法建立畫面內容。');
    }
    tagNotesWithItemIds(host, visibleItems);
    return (content as HTMLElement).outerHTML;
  } finally {
    root.unmount();
    host.remove();
  }
}

function getNoteHeadline(item: BoardItem): string {
  const title = item.title?.trim();
  if (title && title.length > 0) return title;
  const fromHeading = getMarkdownH1(item.content);
  if (fromHeading && fromHeading.trim().length > 0) return fromHeading.trim();
  const firstLine = getFirstNonEmptyLine(item.content);
  if (firstLine && firstLine.trim().length > 0)
    return firstLine.trim().slice(0, 120);
  return 'Untitled note';
}

async function renderNoteBodiesToHtml(
  notes: BoardItem[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (notes.length === 0) return result;

  const host = createExportHost(800, 1);
  const root = ReactDOM.createRoot(host);

  try {
    root.render(
      <div>
        {notes.map((note) => (
          <div
            key={note.id}
            data-note-id={note.id}
            className="html-export-note-body"
          >
            {note.type === ITEM_TYPE.sticky_note ? (
              <p style={{ whiteSpace: 'pre-wrap' }}>{note.content ?? ''}</p>
            ) : (
              <MarkdownPreview
                content={note.content}
                omitFirstHeading={false}
                maxBlocks={null}
              />
            )}
          </div>
        ))}
      </div>,
    );
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    await waitForNextFrame();
    await waitForNextFrame();

    const wrappers = host.querySelectorAll<HTMLElement>('[data-note-id]');
    for (const wrapper of Array.from(wrappers)) {
      const id = wrapper.dataset.noteId;
      if (id) {
        result.set(id, wrapper.innerHTML);
      }
    }
  } finally {
    root.unmount();
    host.remove();
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const VIEWER_STYLES = `
  *,*::before,*::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans TC", sans-serif;
    color: #0f172a;
    overflow: hidden;
    background:
      radial-gradient(circle, rgba(148, 163, 184, 0.35) 1px, transparent 1px) 0 0 / 24px 24px,
      #f8fafc;
  }
  .html-export-viewport {
    position: fixed;
    inset: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }
  .html-export-viewport.is-panning { cursor: grabbing; }
  .html-export-world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }
  .html-export-note-clickable {
    cursor: zoom-in !important;
    transition: outline-color 0.12s ease;
    outline: 2px solid transparent;
    outline-offset: 2px;
  }
  .html-export-note-clickable:hover {
    outline-color: rgba(59, 130, 246, 0.7);
  }
  .html-export-toolbar {
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.5);
    border-radius: 999px;
    font-size: 12px;
    color: #334155;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  }
  .html-export-toolbar button {
    appearance: none;
    border: 1px solid rgba(148, 163, 184, 0.6);
    background: #ffffff;
    color: #0f172a;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .html-export-toolbar button:hover { background: #e2e8f0; }
  .html-export-zoom { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
  .html-export-hint {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 10;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.78);
    color: #f8fafc;
    font-size: 11px;
    letter-spacing: 0.02em;
    pointer-events: none;
    max-width: 60vw;
  }
  .html-export-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 50;
    padding: 24px;
  }
  .html-export-modal-backdrop.is-open { display: flex; }
  .html-export-modal {
    background: #ffffff;
    border-radius: 12px;
    width: min(720px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 64px rgba(15, 23, 42, 0.35);
    overflow: hidden;
  }
  .html-export-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.4);
    background: #f8fafc;
  }
  .html-export-modal-title {
    font-weight: 600;
    color: #0f172a;
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }
  .html-export-modal-close {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    color: #64748b;
    padding: 4px 8px;
    border-radius: 6px;
  }
  .html-export-modal-close:hover { background: #e2e8f0; color: #0f172a; }
  .html-export-modal-body {
    padding: 18px 22px 22px;
    overflow: auto;
    line-height: 1.6;
    font-size: 14px;
    color: #0f172a;
  }
  .html-export-modal-body p { margin: 0 0 0.75em; }
  .html-export-modal-body :first-child { margin-top: 0; }
  .html-export-modal-body :last-child { margin-bottom: 0; }
`;

const VIEWER_SCRIPT = `
(function () {
  var viewport = document.getElementById('html-export-viewport');
  var world = document.getElementById('html-export-world');
  var zoomLabel = document.getElementById('html-export-zoom');
  var modal = document.getElementById('html-export-modal');
  var modalBody = document.getElementById('html-export-modal-body');
  var modalTitle = document.getElementById('html-export-modal-title');
  var modalClose = document.getElementById('html-export-modal-close');
  if (!viewport || !world) return;

  var MIN = 0.1;
  var MAX = 4;
  var state = { x: 0, y: 0, zoom: 1 };

  function apply() {
    world.style.transform =
      'translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.zoom + ')';
    if (zoomLabel) zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
  }

  function zoomAround(targetZoom, px, py) {
    var clamped = Math.min(MAX, Math.max(MIN, targetZoom));
    if (clamped === state.zoom) return;
    var scale = clamped / state.zoom;
    state.x = px - scale * (px - state.x);
    state.y = py - scale * (py - state.y);
    state.zoom = clamped;
    apply();
  }

  function centerInitial() {
    var rect = viewport.getBoundingClientRect();
    var w = world.offsetWidth;
    var h = world.offsetHeight;
    state.x = Math.max(0, (rect.width - w) / 2);
    state.y = Math.max(24, (rect.height - h) / 2);
    apply();
  }

  viewport.addEventListener('wheel', function (event) {
    event.preventDefault();
    var rect = viewport.getBoundingClientRect();
    var px = event.clientX - rect.left;
    var py = event.clientY - rect.top;
    var delta = -event.deltaY * 0.001;
    zoomAround(state.zoom * (1 + delta), px, py);
  }, { passive: false });

  var dragging = false;
  var startX = 0, startY = 0, startStateX = 0, startStateY = 0;
  viewport.addEventListener('mousedown', function (event) {
    if (event.target && event.target.closest && event.target.closest('.html-export-note-clickable')) {
      return; // let the click handler open the modal
    }
    if (event.button !== 0 && event.button !== 1) return;
    dragging = true;
    viewport.classList.add('is-panning');
    startX = event.clientX;
    startY = event.clientY;
    startStateX = state.x;
    startStateY = state.y;
    event.preventDefault();
  });
  window.addEventListener('mousemove', function (event) {
    if (!dragging) return;
    state.x = startStateX + (event.clientX - startX);
    state.y = startStateY + (event.clientY - startY);
    apply();
  });
  window.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('is-panning');
  });

  // Toolbar buttons
  function buttonZoom(factor) {
    var rect = viewport.getBoundingClientRect();
    zoomAround(state.zoom * factor, rect.width / 2, rect.height / 2);
  }
  var zIn = document.getElementById('html-export-zoom-in');
  var zOut = document.getElementById('html-export-zoom-out');
  var zReset = document.getElementById('html-export-zoom-reset');
  if (zIn) zIn.addEventListener('click', function () { buttonZoom(1.2); });
  if (zOut) zOut.addEventListener('click', function () { buttonZoom(1 / 1.2); });
  if (zReset) zReset.addEventListener('click', function () {
    state.zoom = 1;
    centerInitial();
  });

  // Note click → modal
  function openNote(itemId) {
    if (!modal || !modalBody) return;
    var tpl = document.getElementById('html-export-note-template-' + itemId);
    if (!tpl) return;
    var labelEl = document.querySelector('[data-item-id="' + itemId + '"]');
    var label = labelEl && labelEl.getAttribute('aria-label') || 'Note';
    label = label.replace(/^Open note:\\s*/, '');
    if (modalTitle) modalTitle.textContent = label;
    modalBody.innerHTML = '';
    modalBody.appendChild(tpl.content.cloneNode(true));
    modal.classList.add('is-open');
  }
  function closeNote() {
    if (!modal || !modalBody) return;
    modal.classList.remove('is-open');
    modalBody.innerHTML = '';
  }
  viewport.addEventListener('click', function (event) {
    if (dragging) return;
    var target = event.target;
    if (!target || !target.closest) return;
    var hit = target.closest('.html-export-note-clickable');
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    openNote(hit.getAttribute('data-item-id'));
  });
  if (modalClose) modalClose.addEventListener('click', closeNote);
  if (modal) modal.addEventListener('click', function (event) {
    if (event.target === modal) closeNote();
  });
  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeNote();
  });

  centerInitial();
})();
`;

export function buildHtmlDocument({
  pageName,
  surfaceMarkup,
  appCss,
  noteTemplates,
}: {
  pageName: string;
  surfaceMarkup: string;
  appCss: string;
  noteTemplates: Array<{ id: string; bodyHtml: string }>;
}): string {
  const title = escapeHtml(pageName || 'Whiteboard page');
  const templates = noteTemplates
    .map(
      (note) =>
        `<template id="html-export-note-template-${escapeHtml(note.id)}">${note.bodyHtml}</template>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<style>${VIEWER_STYLES}</style>
<style>${appCss}</style>
</head>
<body>
<div id="html-export-viewport" class="html-export-viewport" role="document" aria-label="${title}">
  <div id="html-export-world" class="html-export-world">
    ${surfaceMarkup}
  </div>
</div>
<div class="html-export-toolbar" role="toolbar" aria-label="View controls">
  <button id="html-export-zoom-out" type="button" aria-label="Zoom out">&minus;</button>
  <span id="html-export-zoom" class="html-export-zoom">100%</span>
  <button id="html-export-zoom-in" type="button" aria-label="Zoom in">+</button>
  <button id="html-export-zoom-reset" type="button" aria-label="Reset view" title="Reset">&#x21bb;</button>
</div>
<div class="html-export-hint">滾輪縮放 &middot; 拖曳平移 &middot; 點擊筆記閱讀完整內容</div>
<div id="html-export-modal" class="html-export-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="html-export-modal-title">
  <div class="html-export-modal">
    <div class="html-export-modal-header">
      <h2 id="html-export-modal-title" class="html-export-modal-title">Note</h2>
      <button id="html-export-modal-close" type="button" class="html-export-modal-close" aria-label="Close">&times;</button>
    </div>
    <div id="html-export-modal-body" class="html-export-modal-body markdown-preview"></div>
  </div>
</div>
${templates}
<script>${VIEWER_SCRIPT}</script>
</body>
</html>`;
}

export async function exportPageAsHtml(
  boardData: PageBoardData,
  projectNotes: ProjectNote[] = [],
): Promise<Blob> {
  const exportBoardData =
    projectNotes.length === 0
      ? boardData
      : {
          ...boardData,
          board_items: syncMarkdownBackedItems(
            boardData.board_items,
            projectNotes,
          ),
        };
  const normalizedItems = normalizeConnectorArrowsToSegments(
    exportBoardData.board_items,
    exportBoardData.connector_links,
  ).items;
  const bounds = getPagePngExportBounds(normalizedItems);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  const visibleItems = getVisibleItems(exportBoardData);
  const noteItems = visibleItems.filter(isNoteType);

  const [surfaceMarkup, noteBodies] = await Promise.all([
    renderSurfaceToHtml(
      buildSurfaceElement(exportBoardData, visibleItems, bounds),
      visibleItems,
      bounds.width,
      bounds.height,
    ),
    renderNoteBodiesToHtml(noteItems),
  ]);

  const appCss = collectDocumentCss();
  const noteTemplates = noteItems.map((item) => ({
    id: item.id,
    bodyHtml: noteBodies.get(item.id) ?? '',
  }));

  const html = buildHtmlDocument({
    pageName: boardData.page.name,
    surfaceMarkup,
    appCss,
    noteTemplates,
  });

  return new Blob([html], { type: HTML_MIME_TYPE });
}
