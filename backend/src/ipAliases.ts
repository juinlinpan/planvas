import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { AppSettings } from './settings.js';
import type { IpAlias, IpAliasRegistry } from './types.js';
import {
  exists,
  projectDataDir,
  projectStoreDir,
  readJson,
  writeJsonAtomic,
} from './storage/paths.js';

export const ipAliasesFilename = 'ip_aliases.json';

export function ipAliasesPath(planvasRoot: string): string {
  return path.join(planvasRoot, ipAliasesFilename);
}

export function resolveClientIp(
  settings: AppSettings,
  request: IncomingMessage,
): string {
  if (settings.trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(',')[0]
      .trim();
    if (first) return normalizeIp(first);
  }
  return normalizeIp(request.socket.remoteAddress ?? '');
}

export async function readIpAliases(
  settings: AppSettings,
): Promise<IpAlias[]> {
  const registryPath = ipAliasesPath(settings.planvasRoot);
  if (!(await exists(registryPath))) return [];
  const payload = await readJson(registryPath);
  return Array.isArray(payload.aliases)
    ? payload.aliases.filter(isIpAlias)
    : [];
}

export async function writeIpAlias(
  settings: AppSettings,
  ip: string,
  alias: string,
): Promise<IpAlias> {
  const entry: IpAlias = {
    ip,
    alias,
    updated_at: new Date().toISOString(),
  };
  const aliases = (await readIpAliases(settings)).filter(
    (existing) => existing.ip !== ip,
  );
  if (alias.length > 0) aliases.push(entry);
  await writeJsonAtomic(ipAliasesPath(settings.planvasRoot), {
    version: 1,
    aliases,
  } satisfies IpAliasRegistry);
  return entry;
}

export async function listVisitorIps(
  settings: AppSettings,
): Promise<IpAlias[]> {
  const aliases = await readIpAliases(settings);
  const entryByIp = new Map<string, IpAlias>(
    aliases.map((entry) => [entry.ip, entry]),
  );
  for (const ownerDir of await listOwnerDirs(settings)) {
    if (!entryByIp.has(ownerDir)) {
      entryByIp.set(ownerDir, { ip: ownerDir, alias: '', updated_at: '' });
    }
  }
  return [...entryByIp.values()].sort((left, right) =>
    left.ip.localeCompare(right.ip),
  );
}

async function listOwnerDirs(settings: AppSettings): Promise<string[]> {
  const storeDir = projectStoreDir(settings.planvasRoot);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(storeDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const ownerDirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    // Directories that are themselves projects (created locally in the
    // project_store root) are not owner folders.
    if (await exists(projectDataDir(path.join(storeDir, entry.name)))) continue;
    ownerDirs.push(entry.name);
  }
  return ownerDirs;
}

function isIpAlias(value: unknown): value is IpAlias {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<IpAlias>;
  return (
    typeof candidate.ip === 'string' &&
    typeof candidate.alias === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function normalizeIp(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice('::ffff:'.length);
  if (trimmed === '::1') return '127.0.0.1';
  return trimmed;
}
