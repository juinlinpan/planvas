import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../httpError.js';
import type { BoardItem, ConnectorLink, Page } from '../types.js';
import {
  exists,
  parseJsonObject,
  slugify,
  sameFilesystemPath,
} from './paths.js';
import {
  noteFileFromDataJson,
  readMarkdownBackedNote,
  writeMarkdownBackedNote,
} from './markdownNotes.js';

export type PageXmlData = {
  boardItems: BoardItem[];
  connectorLinks: ConnectorLink[];
};

const CURRENT_PAGE_XML_SCHEMA_VERSION = '5';

export async function readPageXmlFile(
  pagePath: string,
  page: Page,
  projectDataDir: string,
): Promise<PageXmlData> {
  const semanticPath = pageSemanticPath(pagePath);
  const presentationPath = pagePresentationPath(pagePath);
  if (!(await exists(semanticPath)) || !(await exists(presentationPath))) {
    return { boardItems: [], connectorLinks: [] };
  }
  let semanticXml: string;
  let presentationXml: string;
  try {
    semanticXml = await fs.promises.readFile(semanticPath, 'utf8');
    presentationXml = await fs.promises.readFile(presentationPath, 'utf8');
  } catch {
    throw new HttpError(
      500,
      `Page XML files for '${pagePath}' could not be read.`,
    );
  }

  const semanticObjectsBlock = childBlock(semanticXml, 'objects') ?? '';
  const presentationItemsBlock = childBlock(presentationXml, 'items') ?? '';
  const presentationByRef = new Map(
    [
      ...presentationItemsBlock.matchAll(
        /<item\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/item>)/g,
      ),
    ].map((match) => [
      requiredAttribute(parseAttributes(match[1]), 'ref'),
      { attributes: parseAttributes(match[1]), body: match[2] ?? '' },
    ]),
  );

  const semanticObjectMatches = [
    ...semanticObjectsBlock.matchAll(
      /<object\s+([^>]*)>([\s\S]*?)<\/object>/g,
    ),
  ];
  const tableParentByChildId =
    buildTableParentMapFromSemanticObjects(semanticObjectMatches);

  const boardItems = (
    await Promise.all(
      semanticObjectMatches.map((match) =>
        boardItemFromV2Xml(
          match[1],
          match[2],
          presentationByRef,
          page.id,
          projectDataDir,
          tableParentByChildId,
        ),
      ),
    )
  ).sort(compareBoardItems);
  const semanticLinksBlock = childBlock(semanticXml, 'links') ?? '';
  const connectorLinks = [
    ...semanticLinksBlock.matchAll(/<link\s+([^>]*?)>([\s\S]*?)<\/link>/g),
  ]
    .map((match) =>
      connectorFromSemanticLinkAttributes(parseAttributes(match[1])),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (shouldRewritePageXmlForCurrentSchema(semanticXml, presentationXml)) {
    await writePageXmlFile(pagePath, page, boardItems, connectorLinks);
  }
  return { boardItems, connectorLinks };
}

export async function writePageXmlFile(
  pagePath: string,
  page: Page,
  boardItems: BoardItem[],
  connectorLinks: ConnectorLink[],
): Promise<void> {
  const projectDataDir = path.dirname(pagePath);
  const persistedItems = await Promise.all(
    [...boardItems]
      .sort(compareBoardItems)
      .map((item) =>
        writeMarkdownBackedNote(projectDataDir, normalizePivotGridTableItem(item)),
      ),
  );
  const itemById = new Map(persistedItems.map((item) => [item.id, item]));
  const connectors = [...connectorLinks].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const connectionIndexes = buildConnectionIndexes(connectors);
  const frameChildren = buildFrameChildren(persistedItems);
  const pageAttributes = `schema_version="${CURRENT_PAGE_XML_SCHEMA_VERSION}" id="${escapeAttribute(page.id)}" project_id="${escapeAttribute(page.project_id)}" name="${escapeAttribute(page.name)}" sort_order="${page.sort_order}" viewport_x="${page.viewport_x}" viewport_y="${page.viewport_y}" zoom="${page.zoom}" created_at="${escapeAttribute(page.created_at)}"`;
  const semanticLines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<page_semantic ${pageAttributes}>`,
    '  <objects>',
  ];
  for (const persistedItem of persistedItems) {
    const parentAttr = persistedItem.parent_item_id
      ? ` parent_item_id="${escapeAttribute(persistedItem.parent_item_id)}"`
      : '';
    semanticLines.push(
      `    <object id="${escapeAttribute(persistedItem.id)}"${parentAttr} kind="${escapeAttribute(semanticKindForItem(persistedItem))}" category="${escapeAttribute(persistedItem.category)}" type="${escapeAttribute(persistedItem.type)}">`,
    );
    for (const fieldName of [
      'title',
      'content',
      'content_format',
      'data_json',
    ] as const) {
      const value = persistedItem[fieldName];
      if (value === null) semanticLines.push(`      <${fieldName} />`);
      else
        semanticLines.push(
          `      <${fieldName}>${escapeText(value)}</${fieldName}>`,
        );
    }
    if (persistedItem.type === 'note_paper') {
      const noteFile = noteFileFromDataJson(persistedItem.data_json);
      if (noteFile) {
        semanticLines.push(
          `      <content_ref type="markdown" file="${escapeAttribute(noteFile)}" />`,
        );
      }
    }
    const contained = frameChildren.get(persistedItem.id) ?? [];
    if (contained.length > 0) {
      semanticLines.push('      <contains>');
      for (const childId of contained) {
        semanticLines.push(`        <item ref="${escapeAttribute(childId)}" />`);
      }
      semanticLines.push('      </contains>');
    }
    if (persistedItem.type === 'table') {
      semanticLines.push(...tableSemanticLines(persistedItem.data_json, '      '));
    }
    const connections = connectionIndexes.get(persistedItem.id) ?? [];
    if (connections.length > 0) {
      semanticLines.push('      <connections>');
      for (const connection of connections) {
        const endpoint =
          connection.role === 'incoming'
            ? `from="${escapeAttribute(connection.otherItemId)}"`
            : `to="${escapeAttribute(connection.otherItemId)}"`;
        semanticLines.push(
          `        <connection ${endpoint} by="${escapeAttribute(connection.linkId)}" role="${connection.role}" />`,
        );
      }
      semanticLines.push('      </connections>');
    }
    semanticLines.push('    </object>');
  }
  semanticLines.push('  </objects>', '  <links>');
  for (const connector of connectors) {
    const connectorItem = itemById.get(connector.connector_item_id);
    const label = connectorItem?.content ?? connectorItem?.title ?? null;
    const meaning = semanticMeaningForConnector(connectorItem);
    semanticLines.push(
      `    <link id="${escapeAttribute(connector.id)}" type="${escapeAttribute(connectorItem?.type ?? 'link')}" connector_item_id="${escapeAttribute(connector.connector_item_id)}" from="${escapeAttribute(connector.from_item_id ?? '')}" to="${escapeAttribute(connector.to_item_id ?? '')}" from_anchor="${escapeAttribute(connector.from_anchor ?? '')}" to_anchor="${escapeAttribute(connector.to_anchor ?? '')}">`,
    );
    if (label) semanticLines.push(`      <label>${escapeText(label)}</label>`);
    if (meaning)
      semanticLines.push(`      <meaning>${escapeText(meaning)}</meaning>`);
    semanticLines.push('    </link>');
  }
  semanticLines.push('  </links>', '</page_semantic>', '');

  const presentationLines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<page_presentation ${pageAttributes}>`,
    '  <items>',
  ];
  for (const item of persistedItems) {
    presentationLines.push(
      `    <item ref="${escapeAttribute(item.id)}" x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rotation="${item.rotation}" z_index="${item.z_index}" is_collapsed="${item.is_collapsed ? 'true' : 'false'}">`,
    );
    if (item.style_json === null) presentationLines.push('      <style_json />');
    else
      presentationLines.push(
        `      <style_json>${escapeText(item.style_json)}</style_json>`,
      );
    presentationLines.push('    </item>');
  }
  presentationLines.push('  </items>', '</page_presentation>', '');
  await writeXmlLinesAtomic(pageSemanticPath(pagePath), semanticLines);
  await writeXmlLinesAtomic(pagePresentationPath(pagePath), presentationLines);
  await fs.promises.rm(pagePath, { force: true });
}

export async function readPageRecordFromSemanticXml(
  semanticPath: string,
): Promise<Page> {
  let semanticXml: string;
  try {
    semanticXml = await fs.promises.readFile(semanticPath, 'utf8');
  } catch {
    throw new HttpError(500, `Page XML '${semanticPath}' could not be read.`);
  }

  const match = semanticXml.match(/<page_semantic\s+([^>]*)>/);
  if (!match) {
    throw new HttpError(
      500,
      `Page XML '${semanticPath}' is missing page metadata.`,
    );
  }

  const attributes = parseAttributes(match[1]);
  return {
    id: requiredAttribute(attributes, 'id'),
    project_id: requiredAttribute(attributes, 'project_id'),
    name: requiredAttribute(attributes, 'name'),
    sort_order: integerAttribute(attributes, 'sort_order'),
    viewport_x: numberAttribute(attributes, 'viewport_x'),
    viewport_y: numberAttribute(attributes, 'viewport_y'),
    zoom: numberAttribute(attributes, 'zoom'),
    created_at: requiredAttribute(attributes, 'created_at'),
    updated_at: attributes.updated_at || attributes.created_at || new Date().toISOString(),
  };
}

export async function uniquePagePath(
  parent: string,
  stem: string,
): Promise<string> {
  let candidate = path.join(parent, `${stem}.xml`);
  let index = 2;
  while (await pageXmlFilesExist(candidate)) {
    candidate = path.join(parent, `${stem}-${index}.xml`);
    index += 1;
  }
  return candidate;
}

export async function pagePathForName(
  parent: string,
  currentPagePath: string,
  pageName: string,
): Promise<string> {
  const nextPath = path.join(parent, `${slugify(pageName, 'page')}.xml`);
  if (sameFilesystemPath(nextPath, currentPagePath)) return currentPagePath;
  return uniquePagePath(parent, slugify(pageName, 'page'));
}

export async function deletePageXmlFiles(pagePath: string): Promise<void> {
  for (const targetPath of [
    pagePath,
    pageSemanticPath(pagePath),
    pagePresentationPath(pagePath),
  ]) {
    await fs.promises.rm(targetPath, { force: true });
  }
}

export function pageSemanticPath(pagePath: string): string {
  return pageVariantPath(pagePath, 'semantic');
}

export function pagePresentationPath(pagePath: string): string {
  return pageVariantPath(pagePath, 'presentation');
}

export function stemPathFromVariantPath(
  variantPath: string,
  variant: 'semantic' | 'presentation',
): string {
  const suffix = `.${variant}.xml`;
  if (!variantPath.toLowerCase().endsWith(suffix)) {
    throw new HttpError(500, `Unexpected page XML path '${variantPath}'.`);
  }
  return `${variantPath.slice(0, -suffix.length)}.xml`;
}

async function pageXmlFilesExist(pagePath: string): Promise<boolean> {
  return (
    (await exists(pagePath)) ||
    (await exists(pageSemanticPath(pagePath))) ||
    (await exists(pagePresentationPath(pagePath)))
  );
}

async function writeXmlLinesAtomic(
  targetPath: string,
  lines: string[],
): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = path.join(
    path.dirname(targetPath),
    `.tmp-${randomUUID()}.xml`,
  );
  try {
    await fs.promises.writeFile(tempPath, lines.join('\n'), 'utf8');
    await renameWithTransientRetry(tempPath, targetPath);
  } catch (err) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function renameWithTransientRetry(
  fromPath: string,
  toPath: string,
): Promise<void> {
  const retryableCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);
  const delaysMs = [25, 75, 150, 300, 600];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      await fs.promises.rename(fromPath, toPath);
      return;
    } catch (err) {
      lastError = err;
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as NodeJS.ErrnoException).code)
        : '';
      if (!retryableCodes.has(code) || attempt === delaysMs.length) {
        throw err;
      }
      await sleep(delaysMs[attempt]);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pageVariantPath(pagePath: string, variant: string): string {
  const parsed = path.parse(pagePath);
  const baseName = parsed.ext ? parsed.name : parsed.base;
  return path.join(parsed.dir, `${baseName}.${variant}.xml`);
}

function compareBoardItems(left: BoardItem, right: BoardItem): number {
  if (left.z_index !== right.z_index) return left.z_index - right.z_index;
  return left.created_at.localeCompare(right.created_at);
}

function shouldRewritePageXmlForCurrentSchema(
  semanticXml: string,
  presentationXml: string,
): boolean {
  return (
    shouldRewriteSchemaVersion(schemaVersionFromRoot(semanticXml)) ||
    shouldRewriteSchemaVersion(schemaVersionFromRoot(presentationXml))
  );
}

function schemaVersionFromRoot(xml: string): string | null {
  const match = xml.match(/<page_(?:semantic|presentation)\s+([^>]*)>/);
  if (!match) return null;
  return parseAttributes(match[1]).schema_version ?? null;
}

function shouldRewriteSchemaVersion(version: string | null): boolean {
  if (version === CURRENT_PAGE_XML_SCHEMA_VERSION) return false;
  if (version === null) return true;

  const parsedVersion = Number.parseInt(version, 10);
  const currentVersionNum = Number.parseInt(CURRENT_PAGE_XML_SCHEMA_VERSION, 10);

  if (Number.isInteger(parsedVersion) && Number.isInteger(currentVersionNum)) {
    return parsedVersion < currentVersionNum;
  }

  if (version.includes('.')) {
    return true;
  }

  return true;
}

function semanticKindForItem(item: BoardItem): string {
  if (item.type === 'frame' || item.type === 'table') return 'large_object';
  if (item.type === 'line' || item.type === 'arrow') return 'link';
  if (item.type === 'sticky_note') return 'sticky_object';
  return 'small_object';
}

function categoryForType(type: string): string {
  if (type === 'frame') return 'large_item';
  if (type === 'line' || type === 'table') return 'shape';
  if (type === 'sticky_note') return 'sticky_item';
  if (type === 'arrow') return 'connector';
  return 'small_item';
}

type ConnectionIndexEntry = {
  linkId: string;
  otherItemId: string;
  role: 'incoming' | 'outgoing';
};

function buildConnectionIndexes(
  connectorLinks: ConnectorLink[],
): Map<string, ConnectionIndexEntry[]> {
  const indexes = new Map<string, ConnectionIndexEntry[]>();
  for (const link of connectorLinks) {
    if (link.from_item_id && link.to_item_id) {
      const outgoing = indexes.get(link.from_item_id) ?? [];
      outgoing.push({
        linkId: link.id,
        otherItemId: link.to_item_id,
        role: 'outgoing',
      });
      indexes.set(link.from_item_id, outgoing);

      const incoming = indexes.get(link.to_item_id) ?? [];
      incoming.push({
        linkId: link.id,
        otherItemId: link.from_item_id,
        role: 'incoming',
      });
      indexes.set(link.to_item_id, incoming);
    }
  }
  return indexes;
}

function buildFrameChildren(boardItems: BoardItem[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const item of boardItems) {
    if (!item.parent_item_id) continue;
    const next = children.get(item.parent_item_id) ?? [];
    next.push(item.id);
    children.set(item.parent_item_id, next);
  }
  return children;
}

function normalizePivotGridTableItem(item: BoardItem): BoardItem {
  if (item.type !== 'table' || item.data_json === null) return item;
  const data = parseJsonObject(item.data_json);
  const nextData = { ...data };
  delete nextData.colDividerPositions;
  delete nextData.rowDividerPositions;
  delete nextData.colDividerBreaks;
  delete nextData.rowDividerBreaks;
  return {
    ...item,
    data_json: JSON.stringify(nextData),
  };
}

function tableSemanticLines(dataJson: string | null, indent: string): string[] {
  const data = parseJsonObject(dataJson);
  const rows = typeof data.rows === 'number' ? Math.max(0, data.rows) : 0;
  const cols = typeof data.cols === 'number' ? Math.max(0, data.cols) : 0;
  const rawCells = Array.isArray(data.cells) ? data.cells : [];
  if (rows === 0 || cols === 0 || rawCells.length === 0) return [];

  const lines = [
    `${indent}<table rows="${rows}" cols="${cols}" semantic_model="pivot_grid">`,
  ];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    lines.push(`${indent}  <row index="${rowIndex}">`);
    const rawRow = Array.isArray(rawCells[rowIndex])
      ? (rawCells[rowIndex] as unknown[])
      : [];
    for (let colIndex = 0; colIndex < cols; colIndex += 1) {
      const rawCell = rawRow[colIndex];
      if (!rawCell || typeof rawCell !== 'object') continue;
      const cell = rawCell as Record<string, unknown>;
      const cellId =
        typeof cell.id === 'string' && cell.id.trim().length > 0
          ? cell.id
          : `cell-${rowIndex}-${colIndex}`;
      const rowSpan = typeof cell.rowSpan === 'number' ? cell.rowSpan : 1;
      const colSpan = typeof cell.colSpan === 'number' ? cell.colSpan : 1;
      const rowRefs = Array.from(
        { length: Math.min(rows - rowIndex, rowSpan) },
        (_, i) => rowIndex + i,
      ).join(' ');
      const columnRefs = Array.from(
        { length: Math.min(cols - colIndex, colSpan) },
        (_, i) => colIndex + i,
      ).join(' ');
      lines.push(
        `${indent}    <cell id="${escapeAttribute(cellId)}" row="${rowIndex}" column="${colIndex}" row_span="${rowSpan}" col_span="${colSpan}" row_refs="${escapeAttribute(rowRefs)}" column_refs="${escapeAttribute(columnRefs)}">`,
      );
      if (typeof cell.content === 'string' && cell.content.length > 0) {
        lines.push(`${indent}      <text>${escapeText(cell.content)}</text>`);
      }
      const childItemIds = Array.isArray(cell.childItemIds)
        ? cell.childItemIds.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      if (childItemIds.length > 0) {
        lines.push(`${indent}      <contains>`);
        for (const childId of childItemIds) {
          lines.push(`${indent}        <item ref="${escapeAttribute(childId)}" />`);
        }
        lines.push(`${indent}      </contains>`);
      }
      lines.push(`${indent}    </cell>`);
    }
    lines.push(`${indent}  </row>`);
  }
  lines.push(`${indent}</table>`);
  return lines;
}

function semanticMeaningForConnector(item: BoardItem | undefined): string | null {
  if (!item?.data_json) return null;
  const data = parseJsonObject(item.data_json);
  return typeof data.meaning === 'string' ? data.meaning : null;
}

async function boardItemFromV2Xml(
  attributeSource: string,
  body: string,
  presentationByRef: Map<
    string,
    { attributes: Record<string, string>; body: string }
  >,
  pageId: string,
  projectDataDir: string,
  tableParentByChildId: Map<string, string>,
): Promise<BoardItem> {
  const semanticAttributes = parseAttributes(attributeSource);
  const id = requiredAttribute(semanticAttributes, 'id');
  const presentation = presentationByRef.get(id);
  if (!presentation) {
    throw new HttpError(500, `Page XML presentation is missing item '${id}'.`);
  }
  const type = requiredAttribute(semanticAttributes, 'type');
  const now = new Date().toISOString();
  const semanticParentId = blankToNull(semanticAttributes.parent_item_id);
  const inferredTableParentId = tableParentByChildId.get(id) ?? null;
  const dataJson = childText(body, 'data_json');
  const item: BoardItem = {
    id,
    page_id: semanticAttributes.page_id ?? pageId,
    parent_item_id: inferredTableParentId ?? semanticParentId,
    category: semanticAttributes.category ?? categoryForType(type),
    type,
    title: childText(body, 'title'),
    content: childText(body, 'content'),
    content_format: childText(body, 'content_format'),
    x: numberAttribute(presentation.attributes, 'x'),
    y: numberAttribute(presentation.attributes, 'y'),
    width: numberAttribute(presentation.attributes, 'width'),
    height: numberAttribute(presentation.attributes, 'height'),
    rotation: numberAttribute(presentation.attributes, 'rotation'),
    z_index: integerAttribute(presentation.attributes, 'z_index'),
    is_collapsed: presentation.attributes.is_collapsed === 'true',
    style_json: childText(presentation.body, 'style_json'),
    data_json:
      type === 'table' ? mergeSemanticTableDataJson(dataJson, body) : dataJson,
    created_at: semanticAttributes.created_at ?? now,
    updated_at: semanticAttributes.updated_at ?? now,
  };
  return await readMarkdownBackedNote(projectDataDir, item);
}

function buildTableParentMapFromSemanticObjects(
  objectMatches: RegExpMatchArray[],
): Map<string, string> {
  const tableParentByChildId = new Map<string, string>();
  for (const match of objectMatches) {
    const attributes = parseAttributes(match[1]);
    if (attributes.type !== 'table' || !attributes.id) {
      continue;
    }
    const tableBlock = childBlock(match[2] ?? '', 'table');
    if (!tableBlock) {
      continue;
    }
    for (const cell of parseSemanticTableCells(tableBlock)) {
      for (const childId of cell.childItemIds) {
        tableParentByChildId.set(childId, attributes.id);
      }
    }
  }
  return tableParentByChildId;
}

function mergeSemanticTableDataJson(
  dataJson: string | null,
  objectBody: string,
): string | null {
  const tableBlock = childBlock(objectBody, 'table');
  if (!tableBlock) {
    return dataJson;
  }

  const tableOpen = objectBody.match(/<table\s+([^>]*)>/);
  const tableAttributes = parseAttributes(tableOpen?.[1] ?? '');
  const semanticCells = parseSemanticTableCells(tableBlock);
  if (semanticCells.length === 0) {
    return dataJson;
  }

  const data = parseJsonObject(dataJson);
  const rows =
    typeof data.rows === 'number'
      ? data.rows
      : Number.parseInt(tableAttributes.rows ?? '0', 10);
  const cols =
    typeof data.cols === 'number'
      ? data.cols
      : Number.parseInt(tableAttributes.cols ?? '0', 10);
  const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 1;
  const safeCols = Number.isFinite(cols) && cols > 0 ? cols : 1;
  const rawCells = Array.isArray(data.cells) ? data.cells : [];
  const cells: Array<Array<Record<string, unknown> | null>> = Array.from(
    { length: safeRows },
    (_, rowIndex) => {
    const rawRow = Array.isArray(rawCells[rowIndex])
      ? (rawCells[rowIndex] as unknown[])
      : [];
    return Array.from({ length: safeCols }, (_, colIndex) => {
      const rawCell = rawRow[colIndex];
      if (rawCell === null) return null;
      return typeof rawCell === 'object' && rawCell !== null
        ? { ...(rawCell as Record<string, unknown>) }
        : {
            id: `cell-${rowIndex}-${colIndex}`,
            content: '',
            rowSpan: 1,
            colSpan: 1,
            isCollapsed: true,
            childItemIds: [],
          };
    });
    },
  );

  for (const semanticCell of semanticCells) {
    if (
      semanticCell.row < 0 ||
      semanticCell.row >= safeRows ||
      semanticCell.col < 0 ||
      semanticCell.col >= safeCols
    ) {
      continue;
    }
    const existing = cells[semanticCell.row]?.[semanticCell.col];
    if (existing === null || existing === undefined) {
      continue;
    }
    cells[semanticCell.row]![semanticCell.col] = {
      ...existing,
      id: semanticCell.id,
      content:
        typeof existing.content === 'string' && existing.content.length > 0
          ? existing.content
          : semanticCell.content,
      rowSpan: semanticCell.rowSpan,
      colSpan: semanticCell.colSpan,
      childItemIds: semanticCell.childItemIds,
    };
  }

  return JSON.stringify({
    ...data,
    rows: safeRows,
    cols: safeCols,
    colWidths:
      Array.isArray(data.colWidths) && data.colWidths.length === safeCols
        ? data.colWidths
        : Array(safeCols).fill(1 / safeCols),
    rowHeights:
      Array.isArray(data.rowHeights) && data.rowHeights.length === safeRows
        ? data.rowHeights
        : Array(safeRows).fill(1 / safeRows),
    cells,
  });
}

function parseSemanticTableCells(tableBlock: string): Array<{
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  content: string;
  childItemIds: string[];
}> {
  return [...tableBlock.matchAll(/<cell\s+([^>]*)>([\s\S]*?)<\/cell>/g)].map(
    (match) => {
      const attributes = parseAttributes(match[1]);
      const body = match[2] ?? '';
      const rowRefs = splitAxisRefs(attributes.row_refs);
      const columnRefs = splitAxisRefs(attributes.column_refs);
      return {
        id:
          attributes.id ??
          `cell-${attributes.row ?? '0'}-${attributes.column ?? '0'}`,
        row: Number.parseInt(attributes.row ?? '0', 10),
        col: Number.parseInt(attributes.column ?? '0', 10),
        rowSpan: positiveIntAttribute(attributes.row_span, rowRefs.length || 1),
        colSpan: positiveIntAttribute(
          attributes.col_span,
          columnRefs.length || 1,
        ),
        content: childText(body, 'text') ?? '',
        childItemIds: [
          ...new Set(
            [
              ...(childBlock(body, 'contains') ?? '').matchAll(
                /<item\s+([^>]*)\/>/g,
              ),
            ]
              .map((itemMatch) => parseAttributes(itemMatch[1]).ref)
              .filter((value): value is string => typeof value === 'string'),
          ),
        ],
      };
    },
  );
}

function splitAxisRefs(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function connectorFromSemanticLinkAttributes(
  attributes: Record<string, string>,
): ConnectorLink {
  return {
    id: requiredAttribute(attributes, 'id'),
    connector_item_id: requiredAttribute(attributes, 'connector_item_id'),
    from_item_id: blankToNull(attributes.from),
    to_item_id: blankToNull(attributes.to),
    from_anchor: blankToNull(attributes.from_anchor),
    to_anchor: blankToNull(attributes.to_anchor),
  };
}

function childText(body: string, tagName: string): string | null {
  const match = body.match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`),
  );
  return match ? unescapeXml(match[1]) : null;
}

function childBlock(body: string, tagName: string): string | null {
  return childText(body, tagName);
}

function blankToNull(value: string | undefined): string | null {
  return value ? value : null;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_][A-Za-z0-9_-]*)="([^"]*)"/g)) {
    attributes[match[1]] = unescapeXml(match[2]);
  }
  return attributes;
}

function requiredAttribute(
  attributes: Record<string, string>,
  name: string,
): string {
  const value = attributes[name];
  if (value === undefined)
    throw new HttpError(500, `Page XML is missing '${name}'.`);
  return value;
}

function numberAttribute(
  attributes: Record<string, string>,
  name: string,
): number {
  return Number(requiredAttribute(attributes, name));
}

function integerAttribute(
  attributes: Record<string, string>,
  name: string,
): number {
  return Number.parseInt(requiredAttribute(attributes, name), 10);
}

function positiveIntAttribute(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
