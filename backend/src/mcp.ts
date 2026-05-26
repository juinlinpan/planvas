import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { AppSettings } from './settings.js';
import { WhiteboardRepository } from './repository.js';
import type {
  BoardItemCreatePayload,
  ConnectorLinkCreatePayload,
} from './types.js';

// ── Category helper ───────────────────────────────────────────────────────────

function categoryForType(type: string): string {
  if (type === 'frame') return 'large_item';
  if (type === 'table' || type === 'line') return 'shape';
  if (type === 'sticky_note') return 'sticky_item';
  if (type === 'arrow') return 'connector';
  return 'small_item';
}

// ── Tool input schemas ────────────────────────────────────────────────────────

const ProjectIdInput = z.object({ project_id: z.string() });
const PageIdInput = z.object({ page_id: z.string() });

const ReadNoteInput = z.object({
  project_id: z.string(),
  note_file: z.string(),
});

const WriteNoteInput = z.object({
  project_id: z.string(),
  note_file: z.string().regex(/^[^/\\]+\.md$/, 'Must be a plain .md filename'),
  content: z.string(),
});

const AddItemInput = z.object({
  page_id: z.string(),
  type: z.enum(['text_box', 'sticky_note', 'note_paper', 'frame', 'table', 'arrow', 'line']),
  title: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  content_format: z.string().nullable().default('plain_text'),
  data_json: z.string().nullable().default(null),
  parent_item_id: z.string().nullable().default(null),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(200),
  height: z.number().default(80),
  rotation: z.number().default(0),
  z_index: z.number().default(1),
  is_collapsed: z.boolean().default(false),
  style_json: z.string().nullable().default(null),
  category: z.string().optional(),
});

const UpdateItemInput = z.object({
  item_id: z.string(),
  page_id: z.string(),
  type: z.string(),
  title: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  content_format: z.string().nullable().default('plain_text'),
  data_json: z.string().nullable().default(null),
  parent_item_id: z.string().nullable().default(null),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().default(0),
  z_index: z.number().default(1),
  is_collapsed: z.boolean().default(false),
  style_json: z.string().nullable().default(null),
  category: z.string().optional(),
});

const RemoveItemInput = z.object({ item_id: z.string() });

const AddLinkInput = z.object({
  page_id: z.string(),
  from_item_id: z.string().nullable().default(null),
  to_item_id: z.string().nullable().default(null),
  from_anchor: z.string().nullable().default('center'),
  to_anchor: z.string().nullable().default('center'),
  connector_item_id: z.string(),
});

const RemoveLinkInput = z.object({ link_id: z.string() });

const CreatePageInput = z.object({
  project_id: z.string(),
  name: z.string(),
});

const DeletePageInput = z.object({ page_id: z.string() });

// ── Tool list definition ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'planvas_list_projects',
    description: 'List all Planvas projects (id, name, path, sort_order).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'planvas_list_pages',
    description: 'List all pages in a project (id, name, sort_order).',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
    },
  },
  {
    name: 'planvas_read_page',
    description:
      'Read all board items and connector links from a page as structured JSON.',
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string' } },
      required: ['page_id'],
    },
  },
  {
    name: 'planvas_list_notes',
    description: 'List all markdown notes in a project (.md files).',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string' } },
      required: ['project_id'],
    },
  },
  {
    name: 'planvas_read_note',
    description: 'Read the full content of a markdown note.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        note_file: { type: 'string', description: 'e.g. "sprint.md"' },
      },
      required: ['project_id', 'note_file'],
    },
  },
  {
    name: 'planvas_write_note',
    description: 'Create or overwrite a markdown note (atomic write).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        note_file: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['project_id', 'note_file', 'content'],
    },
  },
  {
    name: 'planvas_add_item',
    description:
      'Add a single board item to a page. Returns the new item with its generated id.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        type: { type: 'string', enum: ['text_box', 'sticky_note', 'note_paper', 'frame', 'table', 'arrow', 'line'] },
        title: { type: 'string' },
        content: { type: 'string' },
        content_format: { type: 'string' },
        data_json: { type: 'string' },
        parent_item_id: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        rotation: { type: 'number' },
        z_index: { type: 'number' },
        is_collapsed: { type: 'boolean' },
        style_json: { type: 'string' },
      },
      required: ['page_id', 'type'],
    },
  },
  {
    name: 'planvas_update_item',
    description: 'Update an existing board item. Supply all fields (full replace).',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        page_id: { type: 'string' },
        type: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
      },
      required: ['item_id', 'page_id', 'type', 'x', 'y', 'width', 'height'],
    },
  },
  {
    name: 'planvas_remove_item',
    description: 'Remove a board item and all its connected links.',
    inputSchema: {
      type: 'object',
      properties: { item_id: { type: 'string' } },
      required: ['item_id'],
    },
  },
  {
    name: 'planvas_add_link',
    description: 'Add a connector link between two items.',
    inputSchema: {
      type: 'object',
      properties: {
        page_id: { type: 'string' },
        connector_item_id: { type: 'string', description: 'ID of the arrow board item' },
        from_item_id: { type: 'string' },
        to_item_id: { type: 'string' },
        from_anchor: { type: 'string', default: 'center' },
        to_anchor: { type: 'string', default: 'center' },
      },
      required: ['page_id', 'connector_item_id'],
    },
  },
  {
    name: 'planvas_remove_link',
    description: 'Remove a connector link by its id.',
    inputSchema: {
      type: 'object',
      properties: { link_id: { type: 'string' } },
      required: ['link_id'],
    },
  },
  {
    name: 'planvas_create_page',
    description: 'Create a new empty page in a project.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['project_id', 'name'],
    },
  },
  {
    name: 'planvas_delete_page',
    description: 'Delete a page and all its XML files. Irreversible.',
    inputSchema: {
      type: 'object',
      properties: { page_id: { type: 'string' } },
      required: ['page_id'],
    },
  },
] as const;

// ── Server factory ────────────────────────────────────────────────────────────

function createMcpServer(settings: AppSettings): Server {
  const server = new Server(
    { name: 'planvas-mcp', version: '0.1.8' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const repo = new WhiteboardRepository(settings);

    try {
      const result = await handleTool(name, args ?? {}, repo, settings);
      return {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

async function handleTool(
  name: string,
  args: unknown,
  repo: WhiteboardRepository,
  settings: AppSettings,
): Promise<unknown> {
  switch (name) {
    case 'planvas_list_projects':
      return repo.listProjects();

    case 'planvas_list_pages': {
      const { project_id } = ProjectIdInput.parse(args);
      return repo.listPages(project_id);
    }

    case 'planvas_read_page': {
      const { page_id } = PageIdInput.parse(args);
      return repo.getPageBoardData(page_id);
    }

    case 'planvas_list_notes': {
      const { project_id } = ProjectIdInput.parse(args);
      return repo.listProjectNotes(project_id);
    }

    case 'planvas_read_note': {
      const { project_id, note_file } = ReadNoteInput.parse(args);
      const notes = await repo.listProjectNotes(project_id);
      const note = notes.find((n) => n.note_file === note_file);
      if (!note) throw new Error(`Note '${note_file}' not found`);
      return note.content;
    }

    case 'planvas_write_note': {
      const { project_id, note_file, content } = WriteNoteInput.parse(args);
      const project = await repo.getProject(project_id);
      if (!project.path) throw new Error('Project path unavailable');
      const dataDir = path.join(project.path, '.pv_project');
      await fs.promises.mkdir(dataDir, { recursive: true });
      const notePath = path.join(dataDir, note_file);
      const tmp = path.join(dataDir, `.tmp-${randomUUID()}.md`);
      await fs.promises.writeFile(tmp, content, 'utf8');
      await fs.promises.rename(tmp, notePath);
      return `Note '${note_file}' written.`;
    }

    case 'planvas_add_item': {
      const input = AddItemInput.parse(args);
      const payload: BoardItemCreatePayload = {
        page_id: input.page_id,
        type: input.type,
        category: input.category ?? categoryForType(input.type),
        title: input.title,
        content: input.content,
        content_format: input.content_format,
        data_json: input.data_json,
        parent_item_id: input.parent_item_id,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        rotation: input.rotation,
        z_index: input.z_index,
        is_collapsed: input.is_collapsed,
        style_json: input.style_json,
      };
      return repo.createBoardItem(payload);
    }

    case 'planvas_update_item': {
      const { item_id, ...rest } = UpdateItemInput.parse(args);
      const payload: BoardItemCreatePayload = {
        page_id: rest.page_id,
        type: rest.type,
        category: rest.category ?? categoryForType(rest.type),
        title: rest.title,
        content: rest.content,
        content_format: rest.content_format,
        data_json: rest.data_json,
        parent_item_id: rest.parent_item_id,
        x: rest.x,
        y: rest.y,
        width: rest.width,
        height: rest.height,
        rotation: rest.rotation,
        z_index: rest.z_index,
        is_collapsed: rest.is_collapsed,
        style_json: rest.style_json,
      };
      return repo.updateBoardItem(item_id, payload);
    }

    case 'planvas_remove_item': {
      const { item_id } = RemoveItemInput.parse(args);
      await repo.deleteBoardItem(item_id);
      return `Item '${item_id}' removed.`;
    }

    case 'planvas_add_link': {
      const input = AddLinkInput.parse(args);
      const payload: ConnectorLinkCreatePayload = {
        connector_item_id: input.connector_item_id,
        from_item_id: input.from_item_id,
        to_item_id: input.to_item_id,
        from_anchor: input.from_anchor,
        to_anchor: input.to_anchor,
      };
      return repo.createConnectorLink(payload);
    }

    case 'planvas_remove_link': {
      const { link_id } = RemoveLinkInput.parse(args);
      await repo.deleteConnectorLink(link_id);
      return `Link '${link_id}' removed.`;
    }

    case 'planvas_create_page': {
      const { project_id, name } = CreatePageInput.parse(args);
      return repo.createPage(project_id, { name });
    }

    case 'planvas_delete_page': {
      const { page_id } = DeletePageInput.parse(args);
      await repo.deletePage(page_id);
      return `Page '${page_id}' deleted.`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── HTTP server (SSE transport) ───────────────────────────────────────────────

export function startMcpServer(
  settings: AppSettings,
  host: string,
  port: number,
): http.Server {
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? '/', `http://${host}`);

      if (req.method === 'GET' && url.pathname === '/sse') {
        const sessionId = randomUUID();
        const messagesPath = `/messages?sessionId=${encodeURIComponent(sessionId)}`;
        const transport = new SSEServerTransport(messagesPath, res);
        transports.set(sessionId, transport);
        transport.onclose = () => transports.delete(sessionId);
        const server = createMcpServer(settings);
        await server.connect(transport);
      } else if (req.method === 'POST' && url.pathname === '/messages') {
        const sessionId = url.searchParams.get('sessionId');
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or expired session' }));
          return;
        }
        await transport.handlePostMessage(req, res);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      console.error('[planvas-mcp] Unhandled error:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    }
  });

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[planvas-mcp] Port ${host}:${port} already in use.`);
    } else {
      console.error('[planvas-mcp] Server error:', error);
    }
  });

  httpServer.listen(port, host, () => {
    console.log(`Planvas MCP server: http://${host}:${port}/sse`);
  });

  return httpServer;
}
