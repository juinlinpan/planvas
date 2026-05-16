import ReactDOM from 'react-dom/client';

import type { PageBoardData } from './api';
import {
  createExportHost,
  ExportSurface,
  getPagePngExportBounds,
  waitForExportLayout,
} from './pagePngExport';

function collectDocumentStyles(): string {
  const parts: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules);
      parts.push(rules.map((r) => r.cssText).join('\n'));
    } catch {
      // Cross-origin or inaccessible stylesheet — skip
    }
  }

  return parts.join('\n');
}

function buildViewerScript(contentWidth: number, contentHeight: number): string {
  return `(function () {
  var vp = document.getElementById('viewer-vp');
  var world = document.getElementById('viewer-world');
  var contentW = ${contentWidth};
  var contentH = ${contentHeight};
  var tx = 0, ty = 0, scale = 1;
  var dragging = false, lastX = 0, lastY = 0;

  function applyTransform() {
    world.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  }

  function centerContent() {
    tx = (vp.clientWidth - contentW) / 2;
    ty = (vp.clientHeight - contentH) / 2;
    applyTransform();
  }

  centerContent();
  window.addEventListener('resize', centerContent);

  vp.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    vp.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    tx += e.clientX - lastX;
    ty += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyTransform();
  });

  window.addEventListener('mouseup', function () {
    dragging = false;
    vp.style.cursor = 'grab';
  });

  vp.addEventListener('wheel', function (e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.9;
    var rect = vp.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    tx = px - (px - tx) * factor;
    ty = py - (py - ty) * factor;
    scale = Math.min(10, Math.max(0.05, scale * factor));
    applyTransform();
  }, { passive: false });

  // Touch support
  var lastTouches = [];
  var lastPinchDist = null;

  vp.addEventListener('touchstart', function (e) {
    lastTouches = Array.from(e.touches);
    if (e.touches.length === 2) {
      lastPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
    e.preventDefault();
  }, { passive: false });

  vp.addEventListener('touchmove', function (e) {
    e.preventDefault();
    var touches = Array.from(e.touches);
    if (touches.length === 1 && lastTouches.length === 1) {
      tx += touches[0].clientX - lastTouches[0].clientX;
      ty += touches[0].clientY - lastTouches[0].clientY;
      applyTransform();
    } else if (touches.length === 2 && lastTouches.length === 2) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      var dist = Math.hypot(dx, dy);
      if (lastPinchDist !== null && lastPinchDist > 0) {
        var factor = dist / lastPinchDist;
        var midX = (touches[0].clientX + touches[1].clientX) / 2;
        var midY = (touches[0].clientY + touches[1].clientY) / 2;
        var rect = vp.getBoundingClientRect();
        var px = midX - rect.left;
        var py = midY - rect.top;
        tx = px - (px - tx) * factor;
        ty = py - (py - ty) * factor;
        scale = Math.min(10, Math.max(0.05, scale * factor));
        applyTransform();
      }
      lastPinchDist = dist;
    }
    lastTouches = touches;
  }, { passive: false });

  vp.addEventListener('touchend', function (e) {
    lastTouches = Array.from(e.touches);
    if (e.touches.length < 2) lastPinchDist = null;
  }, { passive: false });
}());`;
}

function buildViewerHtml(
  pageName: string,
  contentHtml: string,
  contentWidth: number,
  contentHeight: number,
  allCss: string,
): string {
  const escapedTitle = pageName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const hintText = 'Drag to pan · Scroll / pinch to zoom · Read-only';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedTitle}</title>
  <style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#e8e8ec}
#viewer-vp{position:fixed;inset:0;overflow:hidden;cursor:grab;user-select:none;-webkit-user-select:none}
#viewer-world{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
#viewer-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#fff;font-family:system-ui,sans-serif;font-size:12px;padding:6px 14px;border-radius:20px;pointer-events:none;white-space:nowrap;letter-spacing:0.01em}
  </style>
  <style>${allCss}</style>
</head>
<body>
  <div id="viewer-vp">
    <div id="viewer-world">
      ${contentHtml}
    </div>
  </div>
  <div id="viewer-hint">${hintText}</div>
  <script>${buildViewerScript(contentWidth, contentHeight)}</script>
</body>
</html>`;
}

export async function exportPageAsViewer(
  boardData: PageBoardData,
  pageName: string,
): Promise<Blob> {
  const bounds = getPagePngExportBounds(boardData.board_items);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  const host = createExportHost(bounds.width, bounds.height);
  const root = ReactDOM.createRoot(host);

  try {
    root.render(
      <ExportSurface boardData={boardData} bounds={bounds} />,
    );
    await waitForExportLayout();

    const contentEl = host.firstElementChild;
    if (contentEl === null) {
      throw new Error('Viewer 匯出失敗，無法建立畫面內容。');
    }

    const contentHtml = contentEl.outerHTML;
    const allCss = collectDocumentStyles();
    const html = buildViewerHtml(
      pageName,
      contentHtml,
      bounds.width,
      bounds.height,
      allCss,
    );

    return new Blob([html], { type: 'text/html' });
  } finally {
    root.unmount();
    host.remove();
  }
}
