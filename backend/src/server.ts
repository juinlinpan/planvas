import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSettings, type AppSettings } from './settings.js';
import { getErrorCode, HttpError } from './httpError.js';
import {
  appendLog,
  initializeStorage,
  WhiteboardRepository,
} from './repository.js';
import {
  validateBoardItemPayload,
  validateBoardStatePayload,
  validateConnectorPayload,
  validateNoteUpdate,
  validateOrderedIds,
  validatePageCreate,
  validatePageUpdate,
  validateProjectCreate,
  validateProjectOpenPath,
  validateProjectUpdate,
  validateViewport,
} from './validation.js';

const devOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

type RouteMatch = {
  params: Record<string, string>;
};

type HandlerContext = {
  settings: AppSettings;
  repository: WhiteboardRepository;
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  body: unknown;
};

type Route = {
  method: string;
  pattern: RegExp;
  handler: (
    context: HandlerContext,
    match: RouteMatch,
  ) => unknown | Promise<unknown>;
  statusCode?: number;
};

export function createRequestHandler(
  settings: AppSettings = buildSettings(),
): http.RequestListener {
  initializeStorage(settings);
  appendLog(settings, `Backend started with root ${settings.backendRoot}`);

  const routes = buildRoutes();
  return async (request, response) => {
    applyCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/') {
        serveFrontendIndex(settings, response);
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        serveAsset(settings, url.pathname, response);
        return;
      }

      const route = routes.find(
        (candidate) =>
          candidate.method === request.method &&
          candidate.pattern.test(url.pathname),
      );
      if (!route) throw new HttpError(404, 'Request path was not found.');
      const match = route.pattern.exec(url.pathname);
      if (!match) throw new HttpError(404, 'Request path was not found.');
      const body = await readRequestBody(request);
      const repository = new WhiteboardRepository(settings);
      const result = await route.handler(
        { settings, repository, request, response, url, body },
        { params: match.groups ?? {} },
      );
      if (route.statusCode === 204) {
        response.writeHead(204);
        response.end();
        return;
      }
      sendJson(response, route.statusCode ?? 200, { data: result });
    } catch (error) {
      handleError(settings, request, response, error);
    }
  };
}

export function createServer(
  settings: AppSettings = buildSettings(),
): http.Server {
  return http.createServer(createRequestHandler(settings));
}

export function startServer(
  settings: AppSettings = buildSettings(),
  host = '127.0.0.1',
  port = 18000,
): http.Server {
  const server = createServer(settings);
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Backend port ${host}:${port} is already in use. Stop the existing backend process, then restart npm run dev.`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  });
  server.listen(port, host, () => {
    console.log(`Whiteboard backend listening on http://${host}:${port}`);
  });
  return server;
}

function buildRoutes(): Route[] {
  return [
    {
      method: 'GET',
      pattern: /^\/healthz$/,
      handler: () => ({ service: 'whiteboard-backend', status: 'ok' }),
    },
    {
      method: 'GET',
      pattern: /^\/fs\/dirs$/,
      handler: ({ settings, url }) => listDirectoryContents(settings, url),
    },
    {
      method: 'GET',
      pattern: /^\/projects$/,
      handler: ({ repository }) => repository.listProjects(),
    },
    {
      method: 'POST',
      pattern: /^\/projects$/,
      statusCode: 201,
      handler: ({ repository, body }) =>
        repository.createProject(validateProjectCreate(body)),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/open-path$/,
      handler: ({ repository, body }) =>
        repository.openProjectPath(validateProjectOpenPath(body).path),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/open-dialog$/,
      handler: async ({ repository }) =>
        repository.openProjectPath(await selectProjectDirectory()),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/reorder$/,
      handler: ({ repository, body }) =>
        repository.reorderProjects(validateOrderedIds(body).ordered_ids),
    },
    {
      method: 'GET',
      pattern: /^\/projects\/(?<projectId>[^/]+)$/,
      handler: ({ repository }, { params }) =>
        repository.getProject(params.projectId),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/reveal$/,
      handler: ({ repository }, { params }) =>
        repository.revealProject(params.projectId),
    },
    {
      method: 'PATCH',
      pattern: /^\/projects\/(?<projectId>[^/]+)$/,
      handler: ({ repository, body }, { params }) =>
        repository.updateProject(params.projectId, validateProjectUpdate(body)),
    },
    {
      method: 'DELETE',
      pattern: /^\/projects\/(?<projectId>[^/]+)$/,
      statusCode: 204,
      handler: ({ repository }, { params }) =>
        repository.deleteProject(params.projectId),
    },
    {
      method: 'GET',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/pages$/,
      handler: ({ repository }, { params }) =>
        repository.listPages(params.projectId),
    },
    {
      method: 'GET',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/notes$/,
      handler: ({ repository }, { params }) =>
        repository.listProjectNotes(params.projectId),
    },
    {
      method: 'PATCH',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/notes\/(?<noteFile>[^/]+\.md)$/,
      handler: ({ repository, body }, { params }) => {
        const { content } = validateNoteUpdate(body);
        return repository.updateProjectNote(params.projectId, params.noteFile, content);
      },
    },
    {
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/pages$/,
      statusCode: 201,
      handler: ({ repository, body }, { params }) =>
        repository.createPage(params.projectId, validatePageCreate(body)),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/pages\/reorder$/,
      handler: ({ repository, body }, { params }) =>
        repository.reorderPages(
          params.projectId,
          validateOrderedIds(body).ordered_ids,
        ),
    },
    {
      method: 'GET',
      pattern: /^\/pages\/(?<pageId>[^/]+)$/,
      handler: ({ repository }, { params }) =>
        repository.getPage(params.pageId),
    },
    {
      method: 'PATCH',
      pattern: /^\/pages\/(?<pageId>[^/]+)$/,
      handler: ({ repository, body }, { params }) =>
        repository.updatePage(params.pageId, validatePageUpdate(body)),
    },
    {
      method: 'DELETE',
      pattern: /^\/pages\/(?<pageId>[^/]+)$/,
      statusCode: 204,
      handler: ({ repository }, { params }) =>
        repository.deletePage(params.pageId),
    },
    {
      method: 'POST',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/duplicate$/,
      statusCode: 201,
      handler: ({ repository }, { params }) =>
        repository.duplicatePage(params.pageId),
    },
    {
      method: 'PATCH',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/viewport$/,
      handler: ({ repository, body }, { params }) =>
        repository.updatePageViewport(params.pageId, validateViewport(body)),
    },
    {
      method: 'GET',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/board-data$/,
      handler: ({ repository }, { params }) =>
        repository.getPageBoardData(params.pageId),
    },
    {
      method: 'PUT',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/board-state$/,
      handler: ({ repository, body }, { params }) => {
        const payload = validateBoardStatePayload(body);
        return repository.replacePageBoardState(
          params.pageId,
          payload.board_items,
          payload.connector_links,
        );
      },
    },
    {
      method: 'GET',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/board-items$/,
      handler: ({ repository }, { params }) =>
        repository.listBoardItems(params.pageId),
    },
    {
      method: 'POST',
      pattern: /^\/board-items$/,
      statusCode: 201,
      handler: ({ repository, body }) =>
        repository.createBoardItem(validateBoardItemPayload(body)),
    },
    {
      method: 'GET',
      pattern: /^\/board-items\/(?<itemId>[^/]+)$/,
      handler: ({ repository }, { params }) =>
        repository.getBoardItem(params.itemId),
    },
    {
      method: 'PATCH',
      pattern: /^\/board-items\/(?<itemId>[^/]+)$/,
      handler: ({ repository, body }, { params }) =>
        repository.updateBoardItem(
          params.itemId,
          validateBoardItemPayload(body),
        ),
    },
    {
      method: 'DELETE',
      pattern: /^\/board-items\/(?<itemId>[^/]+)$/,
      statusCode: 204,
      handler: ({ repository }, { params }) =>
        repository.deleteBoardItem(params.itemId),
    },
    {
      method: 'GET',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/connectors$/,
      handler: ({ repository }, { params }) =>
        repository.listConnectorLinks(params.pageId),
    },
    {
      method: 'POST',
      pattern: /^\/connectors$/,
      statusCode: 201,
      handler: ({ repository, body }) =>
        repository.createConnectorLink(validateConnectorPayload(body)),
    },
    {
      method: 'GET',
      pattern: /^\/connectors\/(?<connectorId>[^/]+)$/,
      handler: ({ repository }, { params }) =>
        repository.getConnectorLink(params.connectorId),
    },
    {
      method: 'PATCH',
      pattern: /^\/connectors\/(?<connectorId>[^/]+)$/,
      handler: ({ repository, body }, { params }) =>
        repository.updateConnectorLink(
          params.connectorId,
          validateConnectorPayload(body),
        ),
    },
    {
      method: 'DELETE',
      pattern: /^\/connectors\/(?<connectorId>[^/]+)$/,
      statusCode: 204,
      handler: ({ repository }, { params }) =>
        repository.deleteConnectorLink(params.connectorId),
    },
  ];
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'DELETE') return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (rawBody.trim().length === 0) return {};
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

type DirEntry = { name: string; path: string };
type DirListing = { current: string; home: string; dirs: DirEntry[] };

function listDirectoryContents(settings: AppSettings, url: URL): DirListing {
  const home = path.dirname(settings.planvasRoot);
  const rawPath = url.searchParams.get('path');
  const target = rawPath ? path.resolve(rawPath) : home;

  const normalizedHome = path.resolve(home);
  const normalizedTarget = path.resolve(target);

  if (
    normalizedTarget !== normalizedHome &&
    !normalizedTarget.startsWith(normalizedHome + path.sep)
  ) {
    throw new HttpError(400, 'Path must be within the user home directory.');
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(normalizedTarget, { withFileTypes: true });
  } catch {
    throw new HttpError(400, `Cannot read directory: ${normalizedTarget}`);
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({ name: e.name, path: path.join(normalizedTarget, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { current: normalizedTarget, home: normalizedHome, dirs };
}

function selectProjectDirectory(): Promise<string> {
  if (process.platform !== 'win32') {
    throw new HttpError(
      400,
      'Native folder picker is not available on this system.',
    );
  }
  const script = `
$shell = New-Object -ComObject Shell.Application
$folder = $shell.BrowseForFolder(0, "Open Planvas Project", 0x51, 0)
if ($null -ne $folder) {
  [Console]::Out.Write($folder.Self.Path)
} else {
  [Console]::Out.Write("__CANCELLED__")
}
`;
  const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-STA',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript,
      ],
      { windowsHide: false },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(
        new HttpError(
          400,
          `Native folder picker is not available on this system: ${error.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim();
        reject(
          new HttpError(
            400,
            detail.length > 0
              ? `Native folder picker failed: ${detail}`
              : 'Native folder picker is not available on this system.',
          ),
        );
        return;
      }
      const selectedPath = stdout.trim();
      if (!selectedPath || selectedPath === '__CANCELLED__') {
        reject(new HttpError(400, 'Project folder selection was cancelled.'));
        return;
      }
      resolve(selectedPath);
    });
  });
}

function serveFrontendIndex(
  settings: AppSettings,
  response: ServerResponse,
): void {
  if (!fs.existsSync(settings.frontendIndexPath)) {
    sendText(
      response,
      503,
      'Frontend bundle not found. Run `npm run build` and then `npm run serve`, or keep using `npm run dev` for split frontend/backend development.',
    );
    return;
  }
  sendFile(response, settings.frontendIndexPath, 'text/html; charset=utf-8');
}

function serveAsset(
  settings: AppSettings,
  urlPath: string,
  response: ServerResponse,
): void {
  const relativeAsset = urlPath.replace(/^\/assets\//, '');
  const assetPath = path.resolve(
    settings.frontendDistDir,
    'assets',
    relativeAsset,
  );
  const assetsRoot = path.resolve(settings.frontendDistDir, 'assets');
  const relativeToAssetsRoot = path.relative(assetsRoot, assetPath);
  if (
    relativeToAssetsRoot.startsWith('..') ||
    path.isAbsolute(relativeToAssetsRoot) ||
    !fs.existsSync(assetPath) ||
    !fs.statSync(assetPath).isFile()
  ) {
    throw new HttpError(404, 'Request path was not found.');
  }
  sendFile(response, assetPath, contentTypeFor(assetPath));
}

function sendFile(
  response: ServerResponse,
  filePath: string,
  contentType: string,
): void {
  response.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(response);
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  text: string,
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function handleError(
  settings: AppSettings,
  request: IncomingMessage,
  response: ServerResponse,
  error: unknown,
): void {
  const httpError =
    error instanceof HttpError
      ? error
      : new HttpError(500, 'Internal server error.');
  appendLog(
    settings,
    `HTTP error ${httpError.statusCode} on ${request.method} ${request.url}: ${httpError.message}`,
  );
  sendJson(response, httpError.statusCode, {
    error: {
      code: getErrorCode(httpError.statusCode),
      message: httpError.message,
      details: httpError.details,
    },
  });
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && devOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
  }
  response.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  );
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function cliArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const host = cliArg('--host', '127.0.0.1');
  const port = Number(cliArg('--port', '18000'));
  startServer(buildSettings(), host, port);
}
