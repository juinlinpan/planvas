import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildSettings, type AppSettings } from '../src/settings.js';
import { createServer } from '../src/server.js';

type TestServer = {
  server: http.Server;
  settings: AppSettings;
  baseUrl: string;
  root: string;
};

const activeServers: http.Server[] = [];
const tempRoots: string[] = [];

export async function cleanupTestResources(): Promise<void> {
  await Promise.all(
    activeServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export async function createTestServer(
  options: { frontendDistDir?: string } = {},
): Promise<TestServer> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-backend-'));
  tempRoots.push(root);
  const settings = buildSettings({
    backendRoot: root,
    frontendDistDir: options.frontendDistDir,
  });
  const server = createServer(settings);
  activeServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Test server did not bind to a TCP port.');
  return {
    server,
    settings,
    root,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

export async function requestJson<T>(
  baseUrl: string,
  route: string,
  options: RequestInit = {},
): Promise<{ status: number; data: T; raw: unknown }> {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const raw = (await response.json()) as unknown;
  return {
    status: response.status,
    data: (raw as { data: T }).data,
    raw,
  };
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) };
}
