import { HttpError, validationError, type ErrorDetail } from './httpError.js';
import {
  projectThemeColors,
  type BoardItem,
  type BoardItemBase,
  type ConnectorLink,
  type ConnectorLinkBase,
  type ImportFromPayload,
  type OrderedIdsPayload,
  type CloudPublishPayload,
  type PageCreatePayload,
  type ProjectPublishPayload,
  type PageUpdatePayload,
  type PageViewportPayload,
  type ProjectCreatePayload,
  type ProjectOpenPathPayload,
  type ProjectThemeColor,
  type ProjectUpdatePayload,
  type UserProfileUpdatePayload,
} from './types.js';

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return value as UnknownRecord;
}

export function validateProjectCreate(value: unknown): ProjectCreatePayload {
  const body = asRecord(value);
  return {
    name: validateName(body.name, ['body', 'name']),
    theme_color: validateThemeColor(body.theme_color ?? 'default', [
      'body',
      'theme_color',
    ]),
  };
}

export function validateProjectUpdate(value: unknown): ProjectUpdatePayload {
  const body = asRecord(value);
  const payload: ProjectUpdatePayload = {};
  const details: ErrorDetail[] = [];

  if ('name' in body) {
    try {
      payload.name = validateName(body.name, ['body', 'name']);
    } catch (error) {
      collectValidation(error, details);
    }
  }
  if ('theme_color' in body) {
    try {
      payload.theme_color = validateThemeColor(body.theme_color, [
        'body',
        'theme_color',
      ]);
    } catch (error) {
      collectValidation(error, details);
    }
  }
  if ('default_style_json' in body) {
    try {
      payload.default_style_json = optionalString(body.default_style_json, [
        'body',
        'default_style_json',
      ]);
    } catch (error) {
      collectValidation(error, details);
    }
  }
  if (details.length > 0) throw validationError(details);
  if (
    payload.name === undefined &&
    payload.theme_color === undefined &&
    payload.default_style_json === undefined
  ) {
    throw validationError([
      {
        loc: ['body'],
        msg: 'Project update requires a name, theme color, or default style.',
        type: 'value_error',
      },
    ]);
  }
  return payload;
}

export function validateProjectOpenPath(
  value: unknown,
): ProjectOpenPathPayload {
  const body = asRecord(value);
  const pathValue = requireString(body.path, ['body', 'path'])
    .trim()
    .replace(/^"|"$/g, '');
  if (pathValue.length === 0) {
    throw validationError([
      {
        loc: ['body', 'path'],
        msg: 'Path cannot be blank.',
        type: 'value_error',
      },
    ]);
  }
  return { path: pathValue };
}

export function validateUserProfileUpdate(
  value: unknown,
): UserProfileUpdatePayload {
  const body = asRecord(value);
  return { name: validateDisplayName(body.name, ['body', 'name']) };
}

export function validateProjectPublishPayload(
  value: unknown,
): ProjectPublishPayload {
  const body = asRecord(value);
  return {
    publish_url: validatePublishUrl(body.publish_url, [
      'body',
      'publish_url',
    ]),
    user_name: validateDisplayName(body.user_name, ['body', 'user_name']),
  };
}

export function validateCloudPublishPayload(
  value: unknown,
): CloudPublishPayload {
  const body = asRecord(value);
  const snapshot = asNestedRecord(body.snapshot, ['body', 'snapshot']);
  const project = asNestedRecord(snapshot.project, [
    'body',
    'snapshot',
    'project',
  ]);
  if (
    typeof project.id !== 'string' ||
    typeof project.name !== 'string' ||
    typeof project.theme_color !== 'string' ||
    typeof project.sort_order !== 'number' ||
    typeof project.created_at !== 'string'
  ) {
    throw new HttpError(400, 'snapshot.project is not valid project metadata.');
  }
  if (!Array.isArray(snapshot.pages)) {
    throw new HttpError(400, 'snapshot.pages must be an array.');
  }
  if (!Array.isArray(snapshot.notes)) {
    throw new HttpError(400, 'snapshot.notes must be an array.');
  }
  const pages = snapshot.pages.map((page, index) => {
    const pageRecord = asNestedRecord(page, [
      'body',
      'snapshot',
      'pages',
      index,
    ]);
    return {
      semantic_file: validateSnapshotFilename(pageRecord.semantic_file, [
        'body',
        'snapshot',
        'pages',
        index,
        'semantic_file',
      ]),
      semantic_xml: requireString(pageRecord.semantic_xml, [
        'body',
        'snapshot',
        'pages',
        index,
        'semantic_xml',
      ]),
      presentation_file: validateSnapshotFilename(pageRecord.presentation_file, [
        'body',
        'snapshot',
        'pages',
        index,
        'presentation_file',
      ]),
      presentation_xml: requireString(pageRecord.presentation_xml, [
        'body',
        'snapshot',
        'pages',
        index,
        'presentation_xml',
      ]),
    };
  });
  const notes = snapshot.notes.map((note, index) => {
    const noteRecord = asNestedRecord(note, [
      'body',
      'snapshot',
      'notes',
      index,
    ]);
    return {
      file: validateSnapshotFilename(noteRecord.file, [
        'body',
        'snapshot',
        'notes',
        index,
        'file',
      ]),
      content: requireString(noteRecord.content, [
        'body',
        'snapshot',
        'notes',
        index,
        'content',
      ]),
    };
  });
  return {
    user_name: validateDisplayName(body.user_name, ['body', 'user_name']),
    snapshot: {
      project: project as CloudPublishPayload['snapshot']['project'],
      pages,
      notes,
    },
  };
}

export function validatePageCreate(value: unknown): PageCreatePayload {
  const body = asRecord(value);
  return { name: validateName(body.name, ['body', 'name']) };
}

export const validatePageUpdate = validatePageCreate as (
  value: unknown,
) => PageUpdatePayload;

export function validateNoteUpdate(value: unknown): { content: string } {
  const body = asRecord(value);
  if (typeof body.content !== 'string') {
    throw validationError([
      {
        loc: ['body', 'content'],
        msg: 'content must be a string.',
        type: 'type_error',
      },
    ]);
  }
  return { content: body.content };
}

export function validateNoteRename(value: unknown): { note_file: string } {
  const body = asRecord(value);
  const noteFile = requireString(body.note_file, ['body', 'note_file']).trim();
  if (noteFile.length === 0) {
    throw validationError([
      {
        loc: ['body', 'note_file'],
        msg: 'note_file cannot be blank.',
        type: 'value_error',
      },
    ]);
  }
  return { note_file: noteFile };
}

export function validateImportFromPayload(value: unknown): ImportFromPayload {
  const body = asRecord(value);
  if (
    typeof body.source_project_id !== 'string' ||
    !body.source_project_id.trim()
  ) {
    throw new HttpError(400, 'source_project_id must be a non-empty string.');
  }
  if (
    !Array.isArray(body.page_ids) ||
    !(body.page_ids as unknown[]).every((id) => typeof id === 'string')
  ) {
    throw new HttpError(400, 'page_ids must be an array of strings.');
  }
  if (
    !Array.isArray(body.note_files) ||
    !(body.note_files as unknown[]).every((f) => typeof f === 'string')
  ) {
    throw new HttpError(400, 'note_files must be an array of strings.');
  }
  return {
    source_project_id: body.source_project_id as string,
    page_ids: body.page_ids as string[],
    note_files: body.note_files as string[],
  };
}

export function validateViewport(value: unknown): PageViewportPayload {
  const body = asRecord(value);
  const zoom = requireNumber(body.zoom, ['body', 'zoom']);
  if (zoom <= 0) {
    throw validationError([
      {
        loc: ['body', 'zoom'],
        msg: 'Zoom must be greater than 0.',
        type: 'value_error',
      },
    ]);
  }
  return {
    viewport_x: requireNumber(body.viewport_x, ['body', 'viewport_x']),
    viewport_y: requireNumber(body.viewport_y, ['body', 'viewport_y']),
    zoom,
  };
}

export function validateOrderedIds(value: unknown): OrderedIdsPayload {
  const body = asRecord(value);
  if (!Array.isArray(body.ordered_ids) || body.ordered_ids.length === 0) {
    throw validationError([
      {
        loc: ['body', 'ordered_ids'],
        msg: 'Ordered ids are required.',
        type: 'value_error',
      },
    ]);
  }
  const orderedIds = body.ordered_ids.map((item, index) =>
    requireString(item, ['body', 'ordered_ids', index]).trim(),
  );
  if (orderedIds.some((item) => item.length === 0)) {
    throw validationError([
      {
        loc: ['body', 'ordered_ids'],
        msg: 'Ordered ids cannot contain blank values.',
        type: 'value_error',
      },
    ]);
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw validationError([
      {
        loc: ['body', 'ordered_ids'],
        msg: 'Ordered ids must be unique.',
        type: 'value_error',
      },
    ]);
  }
  return { ordered_ids: orderedIds };
}

function categoryForType(type: string): string {
  if (type === 'frame') return 'large_item';
  if (type === 'line' || type === 'table') return 'shape';
  if (type === 'sticky_note') return 'sticky_item';
  if (type === 'arrow') return 'connector';
  return 'small_item';
}

function asNestedRecord(value: unknown, loc: Array<string | number>): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw validationError([
      {
        loc,
        msg: 'Value must be an object.',
        type: 'type_error',
      },
    ]);
  }
  return value as UnknownRecord;
}

function validateDisplayName(
  value: unknown,
  loc: Array<string | number>,
): string {
  const name = requireString(value, loc).trim();
  if (name.length === 0 || name.length > 80) {
    throw validationError([
      {
        loc,
        msg: 'Name must be between 1 and 80 characters.',
        type: 'value_error',
      },
    ]);
  }
  return name;
}

function validatePublishUrl(
  value: unknown,
  loc: Array<string | number>,
): string {
  const url = requireString(value, loc).trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // handled below
  }
  throw validationError([
    {
      loc,
      msg: 'Publish URL must be an http or https URL.',
      type: 'value_error',
    },
  ]);
}

function validateSnapshotFilename(
  value: unknown,
  loc: Array<string | number>,
): string {
  const filename = requireString(value, loc).trim();
  if (
    filename.length === 0 ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename === '.' ||
    filename === '..'
  ) {
    throw validationError([
      {
        loc,
        msg: 'Filename must be a basename.',
        type: 'value_error',
      },
    ]);
  }
  return filename;
}

export function validateBoardItemPayload(value: unknown): BoardItemBase {
  const body = asRecord(value);
  const type = requireString(body.type, ['body', 'type']);
  return {
    page_id: requireString(body.page_id, ['body', 'page_id']),
    parent_item_id: optionalString(body.parent_item_id, [
      'body',
      'parent_item_id',
    ]),
    category:
      typeof body.category === 'string' && body.category
        ? body.category
        : categoryForType(type),
    type,
    title: optionalString(body.title, ['body', 'title']),
    content: optionalString(body.content, ['body', 'content']),
    content_format: optionalString(body.content_format, [
      'body',
      'content_format',
    ]),
    x: requireNumber(body.x, ['body', 'x']),
    y: requireNumber(body.y, ['body', 'y']),
    width: requireNumber(body.width, ['body', 'width']),
    height: requireNumber(body.height, ['body', 'height']),
    rotation: requireNumber(body.rotation, ['body', 'rotation']),
    z_index: requireInteger(body.z_index, ['body', 'z_index']),
    is_collapsed: requireBoolean(body.is_collapsed, ['body', 'is_collapsed']),
    style_json: optionalString(body.style_json, ['body', 'style_json']),
    data_json: optionalString(body.data_json, ['body', 'data_json']),
  };
}

export function validateBoardStatePayload(
  value: unknown,
  pageId = '',
): {
  board_items: BoardItem[];
  connector_links: ConnectorLink[];
} {
  const body = asRecord(value);
  if (!Array.isArray(body.board_items)) {
    throw validationError([
      {
        loc: ['body', 'board_items'],
        msg: 'Board items must be a list.',
        type: 'type_error',
      },
    ]);
  }
  if (!Array.isArray(body.connector_links)) {
    throw validationError([
      {
        loc: ['body', 'connector_links'],
        msg: 'Connector links must be a list.',
        type: 'type_error',
      },
    ]);
  }
  return {
    board_items: body.board_items.map((item, index) =>
      validateBoardItemForBoardState(
        item,
        ['body', 'board_items', index],
        pageId,
      ),
    ),
    connector_links: body.connector_links.map((item, index) =>
      validateConnectorLink(item, ['body', 'connector_links', index]),
    ),
  };
}

function validateBoardItemForBoardState(
  value: unknown,
  loc: Array<string | number>,
  pageId: string,
): BoardItem {
  const body = asRecord(value);
  const type = requireString(body.type, [...loc, 'type']);
  const now = new Date().toISOString();
  return {
    id: requireString(body.id, [...loc, 'id']),
    page_id:
      typeof body.page_id === 'string' && body.page_id ? body.page_id : pageId,
    parent_item_id: optionalString(body.parent_item_id, [
      ...loc,
      'parent_item_id',
    ]),
    category:
      typeof body.category === 'string' && body.category
        ? body.category
        : categoryForType(type),
    type,
    title: optionalString(body.title, [...loc, 'title']),
    content: optionalString(body.content, [...loc, 'content']),
    content_format: optionalString(body.content_format, [
      ...loc,
      'content_format',
    ]),
    x: requireNumber(body.x, [...loc, 'x']),
    y: requireNumber(body.y, [...loc, 'y']),
    width: requireNumber(body.width, [...loc, 'width']),
    height: requireNumber(body.height, [...loc, 'height']),
    rotation: requireNumber(body.rotation, [...loc, 'rotation']),
    z_index: requireInteger(body.z_index, [...loc, 'z_index']),
    is_collapsed:
      typeof body.is_collapsed === 'boolean' ? body.is_collapsed : false,
    style_json: optionalString(body.style_json, [...loc, 'style_json']),
    data_json: optionalString(body.data_json, [...loc, 'data_json']),
    created_at:
      typeof body.created_at === 'string' && body.created_at
        ? body.created_at
        : now,
    updated_at:
      typeof body.updated_at === 'string' && body.updated_at
        ? body.updated_at
        : now,
  };
}

export function validateConnectorPayload(value: unknown): ConnectorLinkBase {
  const body = asRecord(value);
  return {
    connector_item_id: requireString(body.connector_item_id, [
      'body',
      'connector_item_id',
    ]),
    from_item_id: optionalString(body.from_item_id, ['body', 'from_item_id']),
    to_item_id: optionalString(body.to_item_id, ['body', 'to_item_id']),
    from_anchor: optionalString(body.from_anchor, ['body', 'from_anchor']),
    to_anchor: optionalString(body.to_anchor, ['body', 'to_anchor']),
  };
}

function validateBoardItem(
  value: unknown,
  loc: Array<string | number>,
): BoardItem {
  const body = asRecord(value);
  return {
    ...validateBoardItemPayload(body),
    id: requireString(body.id, [...loc, 'id']),
    created_at: requireString(body.created_at, [...loc, 'created_at']),
    updated_at: requireString(body.updated_at, [...loc, 'updated_at']),
  };
}

function validateConnectorLink(
  value: unknown,
  loc: Array<string | number>,
): ConnectorLink {
  const body = asRecord(value);
  return {
    ...validateConnectorPayload(body),
    id: requireString(body.id, [...loc, 'id']),
  };
}

function validateName(value: unknown, loc: Array<string | number>): string {
  const normalized = requireString(value, loc).trim();
  if (normalized.length === 0) {
    throw validationError([
      { loc, msg: 'Name cannot be blank.', type: 'value_error' },
    ]);
  }
  if (normalized.length > 120) {
    throw validationError([
      { loc, msg: 'Name is too long.', type: 'value_error' },
    ]);
  }
  return normalized;
}

function validateThemeColor(
  value: unknown,
  loc: Array<string | number>,
): ProjectThemeColor {
  const normalized = requireString(value, loc).trim();
  if (!projectThemeColors.includes(normalized as ProjectThemeColor)) {
    throw validationError([
      {
        loc,
        msg: 'Project theme color is not supported.',
        type: 'value_error',
      },
    ]);
  }
  return normalized as ProjectThemeColor;
}

function requireString(value: unknown, loc: Array<string | number>): string {
  if (typeof value !== 'string') {
    throw validationError([
      { loc, msg: 'Expected string.', type: 'type_error' },
    ]);
  }
  return value;
}

function optionalString(
  value: unknown,
  loc: Array<string | number>,
): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, loc);
}

function requireNumber(value: unknown, loc: Array<string | number>): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw validationError([
      { loc, msg: 'Expected number.', type: 'type_error' },
    ]);
  }
  return value;
}

function requireInteger(value: unknown, loc: Array<string | number>): number {
  const numberValue = requireNumber(value, loc);
  if (!Number.isInteger(numberValue)) {
    throw validationError([
      { loc, msg: 'Expected integer.', type: 'type_error' },
    ]);
  }
  return numberValue;
}

function requireBoolean(value: unknown, loc: Array<string | number>): boolean {
  if (typeof value !== 'boolean') {
    throw validationError([
      { loc, msg: 'Expected boolean.', type: 'type_error' },
    ]);
  }
  return value;
}

function collectValidation(error: unknown, details: ErrorDetail[]): void {
  if (error instanceof HttpError && error.statusCode === 422 && error.details) {
    details.push(...error.details);
    return;
  }
  throw error;
}
