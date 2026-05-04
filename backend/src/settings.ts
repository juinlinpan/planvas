import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type AppSettings = {
  projectRoot: string;
  backendRoot: string;
  planvasRoot: string;
  logsDir: string;
  appLogPath: string;
  backendLogPath: string;
  frontendDistDir: string;
  frontendIndexPath: string;
};

export type BuildSettingsOptions = {
  backendRoot?: string;
  frontendDistDir?: string;
  planvasRoot?: string;
};

const currentFile = fileURLToPath(import.meta.url);
const backendSourceRoot = path.resolve(path.dirname(currentFile), '..');
const backendRootFromSource = path.resolve(backendSourceRoot, '..');
const projectRootFromSource = path.resolve(backendRootFromSource, '..');

export function buildSettings(options: BuildSettingsOptions = {}): AppSettings {
  const envBackendRoot = process.env.WHITEBOARD_BACKEND_ROOT;
  const envFrontendDist = process.env.WHITEBOARD_FRONTEND_DIST;
  const envPlanvasRoot = process.env.WHITEBOARD_PLANVAS_ROOT;
  const backendRoot = path.resolve(
    options.backendRoot ?? envBackendRoot ?? backendRootFromSource,
  );
  const planvasRoot = path.resolve(
    options.planvasRoot ??
      envPlanvasRoot ??
      (options.backendRoot
        ? path.join(backendRoot, '.planvas')
        : path.join(homeDir(), '.planvas')),
  );
  const frontendDistDir = path.resolve(
    options.frontendDistDir ??
      envFrontendDist ??
      path.join(projectRootFromSource, 'frontend', 'dist'),
  );
  const logsDir = path.join(backendRoot, 'logs');

  return {
    projectRoot: projectRootFromSource,
    backendRoot,
    planvasRoot,
    logsDir,
    appLogPath: path.join(logsDir, 'app.log'),
    backendLogPath: path.join(logsDir, 'backend.log'),
    frontendDistDir,
    frontendIndexPath: path.join(frontendDistDir, 'index.html'),
  };
}

function homeDir(): string {
  return process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
}
