import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const versionConfigPath = path.join(root, 'app.version.json');
const versionConfig = readJson(versionConfigPath);
const version = versionConfig.version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid app.version.json version: ${String(version)}`);
}

const changes = [];

syncPackageJson('package.json');
syncPackageJson('frontend/package.json');
syncPackageJson('backend/package.json');
syncPackageLock();
syncJsonVersion('src-tauri/tauri.conf.json');
syncTomlPackageVersion('src-tauri/Cargo.toml');
syncCargoLockPackageVersion('src-tauri/Cargo.lock', 'planvas-desktop');
syncTextReplace(
  'backend/src/mcp.ts',
  /(\{ name: 'planvas-mcp', version: ')([^']+)(' \})/,
  `$1${version}$3`,
);
syncJsonVersion('plugins/planvas-ai/gemini-extension.json');

if (checkOnly && changes.length > 0) {
  console.error('Version files are out of sync with app.version.json:');
  for (const filePath of changes) console.error(`- ${filePath}`);
  process.exit(1);
}

if (changes.length > 0) {
  const action = checkOnly ? 'Checked' : 'Updated';
  console.log(`${action} ${changes.length} version file(s) to ${version}.`);
} else {
  console.log(`All version files already match ${version}.`);
}

function readJson(relativeOrAbsolutePath) {
  const filePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(root, relativeOrAbsolutePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeIfChanged(relativePath, nextContent) {
  const filePath = path.join(root, relativePath);
  const previous = fs.readFileSync(filePath, 'utf8');
  if (previous === nextContent) return;
  changes.push(relativePath);
  if (!checkOnly) fs.writeFileSync(filePath, nextContent, 'utf8');
}

function syncPackageJson(relativePath) {
  syncJsonVersion(relativePath);
}

function syncJsonVersion(relativePath) {
  const data = readJson(relativePath);
  if (data.version === version) return;
  data.version = version;
  writeIfChanged(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

function syncPackageLock() {
  const relativePath = 'package-lock.json';
  const data = readJson(relativePath);
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  if (data.packages?.backend) data.packages.backend.version = version;
  if (data.packages?.frontend) data.packages.frontend.version = version;
  writeIfChanged(relativePath, `${JSON.stringify(data, null, 2)}\n`);
}

function syncTomlPackageVersion(relativePath) {
  syncTextReplace(
    relativePath,
    /(^\[package\]\r?\n(?:[^\[]*\r?\n)*?version\s*=\s*")([^"]+)(")/m,
    `$1${version}$3`,
  );
}

function syncCargoLockPackageVersion(relativePath, packageName) {
  syncTextReplace(
    relativePath,
    new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${escapeRegExp(packageName)}"\\r?\\nversion = ")([^"]+)(")`),
    `$1${version}$3`,
  );
}

function syncTextReplace(relativePath, pattern, replacement) {
  const filePath = path.join(root, relativePath);
  const previous = fs.readFileSync(filePath, 'utf8');
  const next = previous.replace(pattern, replacement);
  if (next === previous) {
    if (!pattern.test(previous)) {
      throw new Error(`Version pattern not found in ${relativePath}`);
    }
    return;
  }
  writeIfChanged(relativePath, next);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
