import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupTestResources,
  createTestServer,
  jsonBody,
  requestJson,
} from './testUtils.js';
import { StorageInitializationError } from '../src/httpError.js';
import { initializeStorage } from '../src/repository.js';
import { buildSettings } from '../src/settings.js';
import type {
  BoardItem,
  ConnectorLink,
  Page,
  PageBoardData,
  Project,
} from '../src/types.js';

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const tests: TestCase[] = [
  {
    name: 'healthz creates runtime directories and reports health',
    run: async () => {
      const { baseUrl, settings } = await createTestServer();
      const response = await requestJson<{ service: string; status: string }>(
        baseUrl,
        '/healthz',
      );

      assert.equal(response.status, 200);
      assert.deepEqual(response.data, {
        service: 'whiteboard-backend',
        status: 'ok',
      });
      assert.equal(fs.statSync(settings.planvasRoot).isDirectory(), true);
      assert.equal(fs.statSync(settings.logsDir).isDirectory(), true);
      assert.equal(fs.existsSync(settings.appLogPath), true);
      assert.equal(fs.existsSync(settings.backendLogPath), true);
    },
  },
  {
    name: 'storage initialization rejects a file backend root',
    run: () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-root-'));
      const backendRoot = path.join(root, 'backend-root.txt');
      fs.writeFileSync(backendRoot, 'not-a-directory', 'utf8');

      assert.throws(
        () => initializeStorage(buildSettings({ backendRoot })),
        StorageInitializationError,
      );

      fs.rmSync(root, { recursive: true, force: true });
    },
  },
  {
    name: 'serves the built frontend bundle',
    run: async () => {
      const distDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'whiteboard-dist-'),
      );
      writeFrontendDist(distDir);
      const { baseUrl } = await createTestServer({ frontendDistDir: distDir });

      const indexResponse = await fetch(`${baseUrl}/`);
      assert.equal(indexResponse.status, 200);
      assert.match(
        indexResponse.headers.get('content-type') ?? '',
        /text\/html/,
      );
      assert.match(await indexResponse.text(), /<div id="root"><\/div>/);

      const assetResponse = await fetch(`${baseUrl}/assets/app.js`);
      assert.equal(assetResponse.status, 200);
      assert.match(await assetResponse.text(), /console\.log\('whiteboard'\);/);

      fs.rmSync(distDir, { recursive: true, force: true });
    },
  },
  {
    name: 'reports a missing frontend bundle',
    run: async () => {
      const missingDist = path.join(os.tmpdir(), `missing-dist-${Date.now()}`);
      const { baseUrl } = await createTestServer({
        frontendDistDir: missingDist,
      });

      const response = await fetch(`${baseUrl}/`);

      assert.equal(response.status, 503);
      const text = await response.text();
      assert.match(text, /Frontend bundle not found\./);
      assert.match(text, /npm run build/);
    },
  },
  {
    name: 'runs the project and page CRUD flow',
    run: async () => {
      const { baseUrl, settings } = await createTestServer();

      const created = await requestJson<Project>(baseUrl, '/projects', {
        method: 'POST',
        ...jsonBody({ name: 'Roadmap' }),
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.theme_color, 'default');

      const projects = await requestJson<Project[]>(baseUrl, '/projects');
      assert.deepEqual(projects.data, [created.data]);

      const updated = await requestJson<Project>(
        baseUrl,
        `/projects/${created.data.id}`,
        {
          method: 'PATCH',
          ...jsonBody({ name: 'Roadmap 2026' }),
        },
      );
      assert.equal(updated.data.name, 'Roadmap 2026');

      const themed = await requestJson<Project>(
        baseUrl,
        `/projects/${created.data.id}`,
        {
          method: 'PATCH',
          ...jsonBody({ theme_color: 'sunset' }),
        },
      );
      assert.equal(themed.data.theme_color, 'sunset');

      const pageResponse = await requestJson<Page>(
        baseUrl,
        `/projects/${created.data.id}/pages`,
        {
          method: 'POST',
          ...jsonBody({ name: 'Quarter Planning' }),
        },
      );
      assert.equal(pageResponse.status, 201);
      assert.equal(pageResponse.data.viewport_x, 240);
      assert.equal(pageResponse.data.viewport_y, 160);
      assert.equal(pageResponse.data.zoom, 1);

      assert.equal(
        fs.existsSync(
          path.join(
            settings.planvasRoot,
            'project_store',
            'Roadmap-2026',
            '.pv_project',
            'Quarter-Planning.xml',
          ),
        ),
        true,
      );

      const renamedPage = await requestJson<Page>(
        baseUrl,
        `/pages/${pageResponse.data.id}`,
        {
          method: 'PATCH',
          ...jsonBody({ name: 'Quarter Planning v2' }),
        },
      );
      assert.equal(renamedPage.data.name, 'Quarter Planning v2');

      const deletePageResponse = await fetch(
        `${baseUrl}/pages/${pageResponse.data.id}`,
        { method: 'DELETE' },
      );
      assert.equal(deletePageResponse.status, 204);

      const deleteProjectResponse = await fetch(
        `${baseUrl}/projects/${created.data.id}`,
        { method: 'DELETE' },
      );
      assert.equal(deleteProjectResponse.status, 204);

      const finalProjects = await requestJson<Project[]>(baseUrl, '/projects');
      assert.deepEqual(finalProjects.data, []);
    },
  },
  {
    name: 'opens external paths and tracks missing projects',
    run: async () => {
      const { baseUrl, root, settings } = await createTestServer();
      const externalPath = path.join(root, 'outside', 'Client Plan');

      const storeProject = await requestJson<Project>(baseUrl, '/projects', {
        method: 'POST',
        ...jsonBody({ name: 'Roadmap' }),
      });
      const opened = await requestJson<Project>(
        baseUrl,
        '/projects/open-path',
        {
          method: 'POST',
          ...jsonBody({ path: externalPath }),
        },
      );

      assert.equal(
        fs.existsSync(path.join(settings.planvasRoot, 'project.json')),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(externalPath, '.pv_project', 'metadata.json')),
        true,
      );
      assert.equal(opened.data.storage_kind, 'external');
      assert.equal(opened.data.path, path.resolve(externalPath));

      const secondOpen = await requestJson<Project>(
        baseUrl,
        '/projects/open-path',
        {
          method: 'POST',
          ...jsonBody({ path: externalPath }),
        },
      );
      assert.equal(secondOpen.data.id, opened.data.id);

      fs.rmSync(path.join(externalPath, '.pv_project'), {
        recursive: true,
        force: true,
      });
      fs.rmSync(externalPath, { recursive: true, force: true });

      const refreshed = await requestJson<Project[]>(baseUrl, '/projects');
      const missing = refreshed.data.find(
        (project) => project.id === opened.data.id,
      );
      assert.equal(missing?.path_exists, false);

      const deleteMissing = await fetch(
        `${baseUrl}/projects/${opened.data.id}`,
        { method: 'DELETE' },
      );
      assert.equal(deleteMissing.status, 204);

      const afterDelete = await requestJson<Project[]>(baseUrl, '/projects');
      assert.deepEqual(
        afterDelete.data.map((project) => project.id),
        [storeProject.data.id],
      );
    },
  },
  {
    name: 'persists board items, connectors, and board-state replacements',
    run: async () => {
      const { baseUrl } = await createTestServer();
      const project = (
        await requestJson<Project>(baseUrl, '/projects', {
          method: 'POST',
          ...jsonBody({ name: 'Execution' }),
        })
      ).data;
      const page = (
        await requestJson<Page>(baseUrl, `/projects/${project.id}/pages`, {
          method: 'POST',
          ...jsonBody({ name: 'Main Board' }),
        })
      ).data;

      const frame = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'large_item',
        type: 'frame',
        title: 'Frame',
        content: null,
        content_format: null,
        x: 80,
        y: 40,
        width: 360,
        height: 240,
        rotation: 0,
        z_index: 0,
        is_collapsed: false,
        style_json: null,
        data_json: null,
      });
      const note = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: frame.id,
        category: 'small_item',
        type: 'sticky_note',
        title: null,
        content: 'Initial note',
        content_format: 'plain_text',
        x: 160,
        y: 132,
        width: 160,
        height: 160,
        rotation: 0,
        z_index: 1,
        is_collapsed: false,
        style_json: '{"backgroundColor":"#fef08a"}',
        data_json: null,
      });
      const arrow = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'connector',
        type: 'arrow',
        title: null,
        content: null,
        content_format: null,
        x: 0,
        y: 0,
        width: 200,
        height: 60,
        rotation: 0,
        z_index: 2,
        is_collapsed: false,
        style_json: null,
        data_json: '{"kind":"straight"}',
      });
      const connector = (
        await requestJson<ConnectorLink>(baseUrl, '/connectors', {
          method: 'POST',
          ...jsonBody({
            connector_item_id: arrow.id,
            from_item_id: note.id,
            to_item_id: frame.id,
            from_anchor: 'right',
            to_anchor: 'left',
          }),
        })
      ).data;

      const snapshot = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${page.id}/board-data`,
        )
      ).data;
      assert.equal(snapshot.board_items.length, 3);
      assert.deepEqual(snapshot.connector_links, [connector]);

      const stray = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'small_item',
        type: 'text_box',
        title: null,
        content: 'Temporary item',
        content_format: 'plain_text',
        x: 160,
        y: 132,
        width: 160,
        height: 160,
        rotation: 0,
        z_index: 3,
        is_collapsed: false,
        style_json: null,
        data_json: null,
      });
      assert.equal(stray.content, 'Temporary item');

      const replace = await requestJson<PageBoardData>(
        baseUrl,
        `/pages/${page.id}/board-state`,
        {
          method: 'PUT',
          ...jsonBody({
            board_items: snapshot.board_items,
            connector_links: snapshot.connector_links,
          }),
        },
      );

      assert.deepEqual(
        replace.data.board_items.map((item) => item.id).sort(),
        [frame.id, note.id, arrow.id].sort(),
      );
      assert.equal(
        replace.data.board_items.some((item) => item.id === stray.id),
        false,
      );
      assert.deepEqual(replace.data.connector_links, [connector]);
    },
  },
  {
    name: 'uses the consistent validation error shape',
    run: async () => {
      const { baseUrl } = await createTestServer();

      const response = await requestJson<never>(baseUrl, '/projects', {
        method: 'POST',
        ...jsonBody({ name: '   ' }),
      });

      assert.equal(response.status, 422);
      assert.deepEqual(response.raw, {
        error: {
          code: 'validation_error',
          message: 'Request validation failed.',
          details: [
            {
              loc: ['body', 'name'],
              msg: 'Name cannot be blank.',
              type: 'value_error',
            },
          ],
        },
      });
    },
  },
];

let failures = 0;
for (const test of tests) {
  try {
    await test.run();
    console.log(`ok - ${test.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${test.name}`);
    console.error(error);
  } finally {
    await cleanupTestResources();
  }
}

if (failures > 0) {
  process.exitCode = 1;
}

function writeFrontendDist(distDir: string): void {
  const assetsDir = path.join(distDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html><html><head><title>Whiteboard</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
    'utf8',
  );
  fs.writeFileSync(
    path.join(assetsDir, 'app.js'),
    "console.log('whiteboard');",
    'utf8',
  );
}

async function createBoardItem(
  baseUrl: string,
  payload: Omit<BoardItem, 'id' | 'created_at' | 'updated_at'>,
): Promise<BoardItem> {
  return (
    await requestJson<BoardItem>(baseUrl, '/board-items', {
      method: 'POST',
      ...jsonBody(payload),
    })
  ).data;
}
