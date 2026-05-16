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
  ProjectNote,
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
      assert.equal(created.data.default_style_json, null);

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

      const styled = await requestJson<Project>(
        baseUrl,
        `/projects/${created.data.id}`,
        {
          method: 'PATCH',
          ...jsonBody({
            default_style_json:
              '{"textColor":"#1d4ed8","linkColor":"#ef4444"}',
          }),
        },
      );
      assert.equal(
        styled.data.default_style_json,
        '{"textColor":"#1d4ed8","linkColor":"#ef4444"}',
      );

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
            'Quarter-Planning.semantic.xml',
          ),
        ),
        true,
      );
      assert.equal(
        fs.existsSync(
          path.join(
            settings.planvasRoot,
            'project_store',
            'Roadmap-2026',
            '.pv_project',
            'Quarter-Planning.presentation.xml',
          ),
        ),
        true,
      );
      const metadataPath = path.join(
        settings.planvasRoot,
        'project_store',
        'Roadmap-2026',
        '.pv_project',
        'metadata.json',
      );
      const semanticPath = path.join(
        settings.planvasRoot,
        'project_store',
        'Roadmap-2026',
        '.pv_project',
        'Quarter-Planning.semantic.xml',
      );
      const metadataPayload = JSON.parse(
        fs.readFileSync(metadataPath, 'utf8'),
      ) as { project?: unknown; pages?: unknown };
      assert.equal('project' in metadataPayload, true);
      assert.equal('pages' in metadataPayload, false);
      const semanticXml = fs.readFileSync(semanticPath, 'utf8');
      assert.match(semanticXml, /viewport_x="240"/);
      assert.match(semanticXml, /viewport_y="160"/);
      assert.match(semanticXml, /zoom="1"/);

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
    name: 'opens manual relative paths from the user home directory',
    run: async () => {
      const previousHome = process.env.HOME;
      const previousUserProfile = process.env.USERPROFILE;
      const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-home-'));
      try {
        process.env.HOME = fakeHome;
        process.env.USERPROFILE = fakeHome;
        const { baseUrl } = await createTestServer();
        const relativeProjectPath = path.join('Documents', 'Client Plan');
        const expectedPath = path.resolve(fakeHome, relativeProjectPath);

        const opened = await requestJson<Project>(
          baseUrl,
          '/projects/open-path',
          {
            method: 'POST',
            ...jsonBody({ path: relativeProjectPath }),
          },
        );

        assert.equal(opened.data.path, expectedPath);
        assert.equal(
          fs.existsSync(path.join(expectedPath, '.pv_project', 'metadata.json')),
          true,
        );
      } finally {
        if (previousHome === undefined) {
          delete process.env.HOME;
        } else {
          process.env.HOME = previousHome;
        }
        if (previousUserProfile === undefined) {
          delete process.env.USERPROFILE;
        } else {
          process.env.USERPROFILE = previousUserProfile;
        }
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    },
  },
  {
    name: 'persists board items, connectors, and board-state replacements',
    run: async () => {
      const { baseUrl, settings } = await createTestServer();
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
      const tableChild = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'small_item',
        type: 'text_box',
        title: 'Ticket seed',
        content: 'Create Jira ticket',
        content_format: 'plain_text',
        x: 520,
        y: 132,
        width: 160,
        height: 120,
        rotation: 0,
        z_index: 3,
        is_collapsed: false,
        style_json: null,
        data_json: null,
      });
      const tableData = {
        rows: 1,
        cols: 1,
        colWidths: [1],
        rowHeights: [1],
        cells: [
          [
            {
              id: 'cell-ticket',
              content: 'Todo',
              rowSpan: 1,
              colSpan: 1,
              isCollapsed: true,
              childItemIds: [tableChild.id],
            },
          ],
        ],
      };
      const table = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'shape',
        type: 'table',
        title: 'Sprint board',
        content: null,
        content_format: null,
        x: 480,
        y: 80,
        width: 360,
        height: 216,
        rotation: 0,
        z_index: 4,
        is_collapsed: false,
        style_json: null,
        data_json: JSON.stringify(tableData),
      });

      const snapshot = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${page.id}/board-data`,
        )
      ).data;
      assert.equal(snapshot.board_items.length, 5);
      assert.deepEqual(snapshot.connector_links, [connector]);

      const projectDataDir = path.join(
        settings.planvasRoot,
        'project_store',
        'Execution',
        '.pv_project',
      );
      const semanticXml = fs.readFileSync(
        path.join(projectDataDir, 'Main-Board.semantic.xml'),
        'utf8',
      );
      const presentationXml = fs.readFileSync(
        path.join(projectDataDir, 'Main-Board.presentation.xml'),
        'utf8',
      );
      assert.match(semanticXml, /<page_semantic schema_version="2"/);
      assert.match(semanticXml, /<objects>/);
      assert.match(semanticXml, /<links>/);
      assert.match(presentationXml, /<page_presentation schema_version="2"/);
      assert.match(presentationXml, /<items>/);
      assert.match(
        semanticXml,
        new RegExp(
          `<object id="${frame.id}"[^>]*type="frame"[\\s\\S]*<contains>[\\s\\S]*<item ref="${note.id}" />`,
        ),
      );
      assert.match(
        semanticXml,
        new RegExp(
          `<object id="${table.id}"[^>]*type="table"[\\s\\S]*<cell id="cell-ticket"[^>]*>[\\s\\S]*<item ref="${tableChild.id}" />`,
        ),
      );
      assert.match(
        semanticXml,
        new RegExp(
          `<link id="${connector.id}"[^>]*connector_item_id="${arrow.id}"[^>]*from="${note.id}"[^>]*to="${frame.id}"`,
        ),
      );
      assert.match(
        semanticXml,
        new RegExp(
          `<object id="${note.id}"[\\s\\S]*<connections>[\\s\\S]*<connection to="${frame.id}" by="${connector.id}" role="outgoing" />`,
        ),
      );
      assert.match(
        presentationXml,
        new RegExp(`<item ref="${note.id}"[^>]*x="${note.x}"[^>]*y="${note.y}"`),
      );

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
        z_index: 5,
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
        [frame.id, note.id, arrow.id, tableChild.id, table.id].sort(),
      );
      assert.equal(
        replace.data.board_items.some((item) => item.id === stray.id),
        false,
      );
      assert.deepEqual(replace.data.connector_links, [connector]);
    },
  },
  {
    name: 'stores note paper content in markdown files',
    run: async () => {
      const { baseUrl, settings } = await createTestServer();
      const project = (
        await requestJson<Project>(baseUrl, '/projects', {
          method: 'POST',
          ...jsonBody({ name: 'Notes' }),
        })
      ).data;
      const page = (
        await requestJson<Page>(baseUrl, `/projects/${project.id}/pages`, {
          method: 'POST',
          ...jsonBody({ name: 'Main' }),
        })
      ).data;
      const otherPage = (
        await requestJson<Page>(baseUrl, `/projects/${project.id}/pages`, {
          method: 'POST',
          ...jsonBody({ name: 'Other' }),
        })
      ).data;
      const projectDataDir = path.join(
        settings.planvasRoot,
        'project_store',
        'Notes',
        '.pv_project',
      );

      const note = await createBoardItem(baseUrl, {
        page_id: page.id,
        parent_item_id: null,
        category: 'small_item',
        type: 'note_paper',
        title: null,
        content: '# Created note\n\nBody text',
        content_format: 'markdown',
        x: 120,
        y: 120,
        width: 264,
        height: 216,
        rotation: 0,
        z_index: 0,
        is_collapsed: false,
        style_json: null,
        data_json: null,
      });

      const markdownFiles = fs
        .readdirSync(projectDataDir)
        .filter((file) => file.endsWith('.md'));
      assert.deepEqual(markdownFiles, ['Created-note.md']);
      assert.match(note.data_json ?? '', /"noteFile":"Created-note\.md"/);
      assert.equal(note.content, '# Created note\n\nBody text');
      assert.equal(
        fs.readFileSync(path.join(projectDataDir, 'Created-note.md'), 'utf8'),
        '# Created note\n\nBody text',
      );
      const pageXml = fs.readFileSync(
        path.join(projectDataDir, 'Main.semantic.xml'),
        'utf8',
      );
      assert.doesNotMatch(pageXml, /# Created note/);
      assert.match(pageXml, /<content \/>/);
      assert.match(pageXml, /"noteFile":"Created-note\.md"/);

      const boardData = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${page.id}/board-data`,
        )
      ).data;
      assert.equal(boardData.board_items.length, 1);
      assert.equal(
        boardData.board_items[0]?.content,
        '# Created note\n\nBody text',
      );
      assert.equal(boardData.board_items[0]?.content_format, 'markdown');

      const persistedNote = boardData.board_items[0];
      if (!persistedNote) throw new Error('Missing markdown-backed note');
      await createBoardItem(baseUrl, {
        ...persistedNote,
        page_id: page.id,
        x: 420,
        y: 120,
        z_index: 1,
      });
      await createBoardItem(baseUrl, {
        ...persistedNote,
        page_id: otherPage.id,
        x: 120,
        y: 120,
        z_index: 0,
      });
      const renamedNoteData = {
        ...(JSON.parse(persistedNote.data_json ?? '{}') as Record<
          string,
          unknown
        >),
        noteFile: 'Renamed-note.md',
      };
      const renamedNote = (
        await requestJson<BoardItem>(
          baseUrl,
          `/board-items/${persistedNote.id}`,
          {
            method: 'PATCH',
            ...jsonBody({
              ...persistedNote,
              data_json: JSON.stringify(renamedNoteData),
            }),
          },
        )
      ).data;
      assert.equal(renamedNote.type, 'note_paper');
      assert.equal(
        fs.existsSync(path.join(projectDataDir, 'Created-note.md')),
        false,
      );
      assert.equal(
        fs.readFileSync(path.join(projectDataDir, 'Renamed-note.md'), 'utf8'),
        '# Created note\n\nBody text',
      );
      const mainBoardAfterRename = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${page.id}/board-data`,
        )
      ).data;
      const otherBoardAfterRename = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${otherPage.id}/board-data`,
        )
      ).data;
      assert.equal(mainBoardAfterRename.board_items.length, 2);
      assert.equal(otherBoardAfterRename.board_items.length, 1);
      assert.ok(
        [...mainBoardAfterRename.board_items, ...otherBoardAfterRename.board_items].every(
          (item) => item.data_json?.includes('"noteFile":"Renamed-note.md"'),
        ),
      );

      const deletePlacement = await fetch(
        `${baseUrl}/board-items/${persistedNote.id}`,
        { method: 'DELETE' },
      );
      assert.equal(deletePlacement.status, 204);
      const mainBoardAfterDelete = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${page.id}/board-data`,
        )
      ).data;
      assert.equal(mainBoardAfterDelete.board_items.length, 1);
      assert.equal(
        fs.readFileSync(path.join(projectDataDir, 'Renamed-note.md'), 'utf8'),
        '# Created note\n\nBody text',
      );

      assert.equal(note.type, 'note_paper');
      const looseProject = (
        await requestJson<Project>(baseUrl, '/projects', {
          method: 'POST',
          ...jsonBody({ name: 'Loose Notes' }),
        })
      ).data;
      const loosePage = (
        await requestJson<Page>(baseUrl, `/projects/${looseProject.id}/pages`, {
          method: 'POST',
          ...jsonBody({ name: 'Inbox' }),
        })
      ).data;
      const looseProjectDataDir = path.join(
        settings.planvasRoot,
        'project_store',
        'Loose-Notes',
        '.pv_project',
      );
      fs.writeFileSync(
        path.join(looseProjectDataDir, 'Loose.md'),
        '# Loose note\n\nImported body',
        'utf8',
      );
      const looseNotes = (
        await requestJson<ProjectNote[]>(
          baseUrl,
          `/projects/${looseProject.id}/notes`,
        )
      ).data;
      assert.deepEqual(
        looseNotes.map((entry) => ({
          note_file: entry.note_file,
          title: entry.title,
          content: entry.content,
          content_format: entry.content_format,
        })),
        [
          {
            note_file: 'Loose.md',
            title: 'Loose note',
            content: '# Loose note\n\nImported body',
            content_format: 'markdown',
          },
        ],
      );

      const importedBoardData = (
        await requestJson<PageBoardData>(
          baseUrl,
          `/pages/${loosePage.id}/board-data`,
        )
      ).data;
      const importedNote = importedBoardData.board_items.find(
        (item) => item.content === '# Loose note\n\nImported body',
      );
      assert.equal(importedNote, undefined);

      const loosePlacement = await createBoardItem(baseUrl, {
        page_id: loosePage.id,
        parent_item_id: null,
        category: 'small_item',
        type: 'note_paper',
        title: 'Loose note',
        content: null,
        content_format: 'markdown',
        x: 80,
        y: 80,
        width: 264,
        height: 216,
        rotation: 0,
        z_index: 0,
        is_collapsed: false,
        style_json: null,
        data_json: JSON.stringify({
          noteFile: 'Loose.md',
          noteFileManaged: false,
        }),
      });
      assert.equal(loosePlacement.content, '# Loose note\n\nImported body');
      assert.match(loosePlacement.data_json ?? '', /"noteFile":"Loose\.md"/);
      assert.equal(
        fs.readFileSync(path.join(looseProjectDataDir, 'Loose.md'), 'utf8'),
        '# Loose note\n\nImported body',
      );
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
