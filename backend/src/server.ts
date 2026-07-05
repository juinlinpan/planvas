import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { buildSettings, type AppSettings } from './settings.js';
import { getErrorCode, HttpError } from './httpError.js';
import {
  appendLog,
  initializeStorage,
  WhiteboardRepository,
} from './repository.js';
import { startMcpServer } from './mcp.js';
import { withWriteLock } from './storage/writeLock.js';
import {
  validateBoardItemPayload,
  validateBoardStatePayload,
  validateConnectorPayload,
  validateImportFromPayload,
  validateNoteUpdate,
  validateNoteRename,
  validateOrderedIds,
  validatePageCreate,
  validatePageUpdate,
  validateCloudPublishPayload,
  validateProjectPublishPayload,
  validateProjectCreate,
  validateProjectOpenPath,
  validateProjectUpdate,
  validateIpAliasUpdate,
  validateViewport,
} from './validation.js';
import {
  listVisitorIps,
  resolveClientIp,
  writeIpAlias,
} from './ipAliases.js';
import type {
  CloudPublishPayload,
  ProjectPublishResult,
} from './types.js';

const devOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
const slowRequestThresholdMs = 250;
const eventLoopLagThresholdMs = 250;
const aiAgentInstallTargets = new Set([
  'codex',
  'gemini-cli',
  'antigravity-cli',
  'claude-code',
  'github-copilot',
  'opencode',
]);

let diagnosticsStarted = false;
let diagnosticsSettings: AppSettings | null = null;

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
  // Overrides the default "non-GET requests take the write lock" rule for
  // handlers that perform no local writes (e.g. publish, which only uploads
  // a snapshot and would deadlock a same-process cloud endpoint).
  mutates?: boolean;
};

export function createRequestHandler(
  settings: AppSettings = buildSettings(),
): http.RequestListener {
  initializeStorage(settings);
  startDiagnostics(settings);
  appendLog(settings, `Backend started with root ${settings.backendRoot}`);

  const routes = buildRoutes();
  return async (request, response) => {
    const startedAt = performance.now();
    const requestLabel = `${request.method ?? 'UNKNOWN'} ${request.url ?? '/'}`;
    applyCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      logRequestDuration(settings, requestLabel, startedAt, 204);
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/') {
        await serveFrontendIndex(settings, response);
        logRequestDuration(
          settings,
          requestLabel,
          startedAt,
          response.statusCode,
        );
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/assets/')) {
        await serveAsset(settings, url.pathname, response);
        logRequestDuration(
          settings,
          requestLabel,
          startedAt,
          response.statusCode,
        );
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
      const context = { settings, repository, request, response, url, body };
      const routeMatch = { params: match.groups ?? {} };
      // Mutating requests share a process-wide write lock (also held by MCP
      // tools) so two writers can never interleave read-modify-write cycles
      // on the same project files.
      const mutates = route.mutates ?? request.method !== 'GET';
      const result = mutates
        ? await withWriteLock(async () => route.handler(context, routeMatch))
        : await route.handler(context, routeMatch);
      if (route.statusCode === 204) {
        response.writeHead(204);
        response.end();
        logRequestDuration(settings, requestLabel, startedAt, 204);
        return;
      }
      sendJson(response, route.statusCode ?? 200, { data: result });
      logRequestDuration(
        settings,
        requestLabel,
        startedAt,
        route.statusCode ?? 200,
      );
    } catch (error) {
      handleError(settings, request, response, error);
      logRequestDuration(
        settings,
        requestLabel,
        startedAt,
        response.statusCode,
      );
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
  mcpPort = 18001,
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
  startMcpServer(settings, host, mcpPort);
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
      pattern: /^\/ip-aliases$/,
      handler: ({ settings }) => listVisitorIps(settings),
    },
    {
      method: 'PUT',
      pattern: /^\/ip-aliases$/,
      handler: ({ settings, body }) => {
        const payload = validateIpAliasUpdate(body);
        return writeIpAlias(settings, payload.ip, payload.alias);
      },
    },
    {
      method: 'GET',
      pattern: /^\/cloud\/publish-target$/,
      handler: ({ request, url }) => ({
        url: buildCloudPublishUrl(request, url),
      }),
    },
    {
      method: 'POST',
      pattern: /^\/cloud\/publish$/,
      statusCode: 201,
      handler: ({ settings, repository, request, body }) =>
        repository.receiveCloudPublish(
          validateCloudPublishPayload(body).snapshot,
          resolveClientIp(settings, request),
        ),
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
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/ai-agent\/install$/,
      handler: ({ repository, body }, { params }) =>
        installProjectAiAgent(repository, params.projectId, body),
    },
    {
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/publish$/,
      // Reads the local project and uploads it; the receiving /cloud/publish
      // endpoint is the writer. Taking the lock here would deadlock when the
      // cloud endpoint lives in the same process.
      mutates: false,
      handler: ({ repository, body }, { params }) =>
        publishProjectToCloud(
          repository,
          params.projectId,
          validateProjectPublishPayload(body).publish_url,
        ),
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
      pattern:
        /^\/projects\/(?<projectId>[^/]+)\/notes\/(?<noteFile>[^/]+\.md)$/,
      handler: ({ repository, body }, { params }) => {
        const { content } = validateNoteUpdate(body);
        return repository.updateProjectNote(
          params.projectId,
          decodeURIComponent(params.noteFile),
          content,
        );
      },
    },
    {
      method: 'PATCH',
      pattern:
        /^\/projects\/(?<projectId>[^/]+)\/notes\/(?<noteFile>[^/]+\.md)\/rename$/,
      handler: ({ repository, body }, { params }) => {
        const { note_file } = validateNoteRename(body);
        return repository.renameProjectNote(
          params.projectId,
          decodeURIComponent(params.noteFile),
          note_file,
        );
      },
    },
    {
      method: 'DELETE',
      pattern:
        /^\/projects\/(?<projectId>[^/]+)\/notes\/(?<noteFile>[^/]+\.md)$/,
      handler: ({ repository }, { params }) =>
        repository.deleteProjectNote(
          params.projectId,
          decodeURIComponent(params.noteFile),
        ),
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
      method: 'POST',
      pattern: /^\/projects\/(?<projectId>[^/]+)\/import-from$/,
      statusCode: 201,
      handler: ({ repository, body }, { params }) => {
        const payload = validateImportFromPayload(body);
        return repository.importFromProject(
          params.projectId,
          payload.source_project_id,
          payload.page_ids,
          payload.note_files,
        );
      },
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
        const payload = validateBoardStatePayload(body, params.pageId);
        return repository.replacePageBoardState(
          params.pageId,
          payload.board_items,
          payload.connector_links,
        );
      },
    },
    {
      method: 'POST',
      pattern: /^\/pages\/(?<pageId>[^/]+)\/regulate$/,
      handler: ({ repository }, { params }) =>
        repository.regulatePage(params.pageId),
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

type AiAgentInstallPayload = { target: string };

function buildCloudPublishUrl(request: IncomingMessage, url: URL): string {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const proto =
    typeof forwardedProto === 'string' && forwardedProto.trim().length > 0
      ? forwardedProto.split(',')[0].trim()
      : 'http';
  const host = request.headers.host ?? '127.0.0.1:18000';
  return `${proto}://${host}${url.searchParams.get('path') ?? '/cloud/publish'}`;
}

async function publishProjectToCloud(
  repository: WhiteboardRepository,
  projectId: string,
  publishUrl: string,
): Promise<ProjectPublishResult> {
  const snapshot = await repository.buildProjectPublishSnapshot(projectId);
  const response = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot } satisfies CloudPublishPayload),
  });
  if (!response.ok) {
    throw new HttpError(
      400,
      `Cloud publish failed with status ${response.status}: ${await response.text()}`,
    );
  }
  const result = (await response.json()) as { data?: ProjectPublishResult };
  if (!result.data) {
    throw new HttpError(400, 'Cloud publish response was not valid.');
  }
  return result.data;
}

function validateAiAgentInstallPayload(body: unknown): AiAgentInstallPayload {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('target' in body) ||
    typeof (body as { target?: unknown }).target !== 'string'
  ) {
    throw new HttpError(400, 'AI agent target is required.');
  }
  const target = (body as { target: string }).target;
  if (!aiAgentInstallTargets.has(target)) {
    throw new HttpError(400, `Unsupported AI agent target: ${target}`);
  }
  return { target };
}

async function installProjectAiAgent(
  repository: WhiteboardRepository,
  projectId: string,
  body: unknown,
): Promise<{
  target: string;
  command: string;
  stdout: string;
  stderr: string;
}> {
  if (process.platform !== 'win32') {
    throw new HttpError(
      400,
      'AI agent installer run is only available on Windows.',
    );
  }
  const { target } = validateAiAgentInstallPayload(body);
  const project = await repository.getProject(projectId);
  if (!project.path) {
    throw new HttpError(400, 'Project path is unavailable.');
  }

  const installerPath = path.join(
    repoRootDir(),
    'plugins',
    'planvas-ai',
    'scripts',
    'install.ps1',
  );
  if (!(await fileExists(installerPath))) {
    throw new HttpError(
      500,
      `Planvas AI installer was not found: ${installerPath}`,
    );
  }

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    installerPath,
    '-Target',
    target,
    '-Scope',
    'project',
    '-ProjectPath',
    project.path,
  ];

  const result = await runProcess('powershell.exe', args);
  const command = [
    'powershell',
    '-ExecutionPolicy Bypass',
    '-File',
    quotePowerShellPath(installerPath),
    '-Target',
    target,
    '-Scope project',
    '-ProjectPath',
    quotePowerShellPath(project.path),
  ].join(' ');
  if (result.exitCode !== 0) {
    throw new HttpError(
      500,
      result.stderr.trim() ||
        result.stdout.trim() ||
        'AI agent installer failed.',
    );
  }
  return {
    target,
    command,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runProcess(
  command: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
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
    child.on('error', reject);
    child.on('close', (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });
  });
}

function quotePowerShellPath(value: string): string {
  return `"${value.replace(/"/g, '`"')}"`;
}

function repoRootDir(): string {
  return path.resolve(path.dirname(currentFile), '..', '..', '..');
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

async function listDirectoryContents(
  settings: AppSettings,
  url: URL,
): Promise<DirListing> {
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
    entries = await fs.promises.readdir(normalizedTarget, {
      withFileTypes: true,
    });
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

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function serveFrontendIndex(
  settings: AppSettings,
  response: ServerResponse,
): Promise<void> {
  if (!(await fileExists(settings.frontendIndexPath))) {
    sendText(
      response,
      503,
      'Frontend bundle not found. Run `npm run build` and then `npm run serve`, or keep using `npm run dev` for split frontend/backend development.',
    );
    return;
  }
  sendFile(response, settings.frontendIndexPath, 'text/html; charset=utf-8');
}

async function serveAsset(
  settings: AppSettings,
  urlPath: string,
  response: ServerResponse,
): Promise<void> {
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
    path.isAbsolute(relativeToAssetsRoot)
  ) {
    throw new HttpError(404, 'Request path was not found.');
  }

  try {
    const stat = await fs.promises.stat(assetPath);
    if (!stat.isFile()) {
      throw new Error();
    }
  } catch {
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
  if (!(error instanceof HttpError)) {
    appendLog(
      settings,
      `Unhandled request error detail: ${errorToLogString(error)}`,
    );
  }
  sendJson(response, httpError.statusCode, {
    error: {
      code: getErrorCode(httpError.statusCode),
      message: httpError.message,
      details: httpError.details,
    },
  });
}

function startDiagnostics(settings: AppSettings): void {
  diagnosticsSettings = settings;
  if (diagnosticsStarted) return;
  diagnosticsStarted = true;

  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const interval = setInterval(() => {
    const activeSettings = diagnosticsSettings;
    if (!activeSettings) return;
    const maxMs = Number(delay.max) / 1_000_000;
    const meanMs = Number(delay.mean) / 1_000_000;
    if (maxMs >= eventLoopLagThresholdMs) {
      appendLog(
        activeSettings,
        `Event loop lag detected max=${maxMs.toFixed(1)}ms mean=${meanMs.toFixed(1)}ms`,
      );
    }
    delay.reset();
  }, 10_000);
  interval.unref();

  process.on('unhandledRejection', (reason) => {
    const activeSettings = diagnosticsSettings;
    if (activeSettings) {
      appendLog(
        activeSettings,
        `Unhandled promise rejection: ${errorToLogString(reason)}`,
      );
    }
    console.error('Unhandled promise rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    const activeSettings = diagnosticsSettings;
    if (activeSettings) {
      appendLog(
        activeSettings,
        `Uncaught exception: ${errorToLogString(error)}`,
      );
    }
    console.error('Uncaught exception:', error);
    process.exit(1);
  });
}

function logRequestDuration(
  settings: AppSettings,
  requestLabel: string,
  startedAt: number,
  statusCode: number,
): void {
  const durationMs = performance.now() - startedAt;
  if (durationMs < slowRequestThresholdMs) return;
  appendLog(
    settings,
    `Slow request ${requestLabel} status=${statusCode} duration=${durationMs.toFixed(1)}ms`,
  );
}

function errorToLogString(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (
    typeof origin === 'string' &&
    (devOrigins.has(origin) ||
      origin === 'tauri://localhost' ||
      origin === 'http://tauri.localhost' ||
      origin === 'https://tauri.localhost')
  ) {
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
  const mcpPort = Number(cliArg('--mcp-port', '18001'));
  startServer(buildSettings(), host, port, mcpPort);
}
