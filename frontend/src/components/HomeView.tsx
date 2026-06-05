import { useState } from 'react';
import { type Project } from '../services/api';

const HERO_IMAGE_SRC = '/assets/home-whiteboard-hero.png';

function IconPlus() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </svg>
  );
}

type Props = {
  errorMessage: string | null;
  isBusy: boolean;
  isLoading: boolean;
  projects: Project[];
  userName: string;
  selectedProjectId: string | null;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onSaveUserName: (name: string) => Promise<void>;
  onCopyCloudPublishUrl: () => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onRemoveProject: (projectId: string) => void;
  onRefreshProjects: () => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function latestProject(projects: Project[]): Project | null {
  return (
    [...projects]
      .filter((project) => project.path_exists !== false)
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() -
          new Date(left.updated_at).getTime(),
      )[0] ?? null
  );
}

export function HomeView({
  errorMessage,
  isBusy,
  isLoading,
  projects,
  userName,
  selectedProjectId,
  onCreateProject,
  onOpenProject,
  onSaveUserName,
  onCopyCloudPublishUrl,
  onSelectProject,
  onRemoveProject,
  onRefreshProjects,
}: Props) {
  const [userNameDraft, setUserNameDraft] = useState(userName);
  const [previousUserName, setPreviousUserName] = useState(userName);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [publishUrlStatus, setPublishUrlStatus] = useState<string | null>(null);
  const recentProject = latestProject(projects);
  const projectStoreProjects = projects.filter(
    (project) => (project.storage_kind ?? 'project_store') === 'project_store',
  );
  const externalProjects = projects.filter(
    (project) => (project.storage_kind ?? 'project_store') !== 'project_store',
  );

  if (userName !== previousUserName) {
    setPreviousUserName(userName);
    setUserNameDraft(userName);
  }

  const normalizedUserNameDraft = userNameDraft.trim();

  const handleSaveUserName = async () => {
    if (
      normalizedUserNameDraft.length === 0 ||
      normalizedUserNameDraft === userName
    ) {
      return;
    }
    setUserStatus('Saving...');
    try {
      await onSaveUserName(normalizedUserNameDraft);
      setUserStatus('Saved.');
    } catch (error) {
      setUserStatus(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const handleCopyCloudPublishUrl = async () => {
    setPublishUrlStatus('Copying...');
    try {
      await onCopyCloudPublishUrl();
      setPublishUrlStatus('Copied.');
    } catch (error) {
      setPublishUrlStatus(error instanceof Error ? error.message : 'Copy failed.');
    }
  };

  function renderProjectCard(project: Project) {
    const canRemoveMissingProject = project.path_exists === false;

    return (
      <div
        key={project.id}
        className={`home-project-card ${project.id === selectedProjectId ? 'is-selected' : ''} ${
          project.path_exists === false ? 'is-missing' : ''
        }`}
      >
        <button
          type="button"
          className="home-project-open-button"
          disabled={isBusy || project.path_exists === false}
          onClick={() => onSelectProject(project.id)}
        >
          <span className="home-project-card-main">
            <strong>{project.name}</strong>
            <span>
              {project.path_exists === false
                ? 'Path missing'
                : formatDate(project.updated_at)}
            </span>
            {project.path !== undefined && project.path !== null ? (
              <small>{project.path}</small>
            ) : null}
          </span>
          <span className="home-project-card-arrow">
            <IconArrow />
          </span>
        </button>
        {canRemoveMissingProject ? (
          <button
            type="button"
            className="home-project-remove-button"
            disabled={isBusy}
            aria-label={`Remove ${project.name} from common projects`}
            title="Remove from common projects"
            onClick={() => onRemoveProject(project.id)}
          >
            <IconTrash />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <main className="home-shell">
      <section className="home-hero-panel" aria-label="Planvas home">
        <div className="home-copy">
          <div className="home-brand">
            <span className="home-brand-mark" aria-hidden="true">
              <IconSpark />
            </span>
            <div>
              <span className="home-brand-name">Planvas</span>
              <span className="home-brand-kicker">Local-first planning</span>
            </div>
          </div>

          <div className="home-heading-group">
            <p className="home-eyebrow">Projects</p>
            <h1 className="home-title">
              {userName.trim() ? `你好~${userName.trim()}` : 'Plan your local workspaces'}
            </h1>
          </div>

          <div className="home-user-panel">
            <label className="home-user-label" htmlFor="home-user-name-input">
              Name
            </label>
            <div className="home-user-row">
              <input
                id="home-user-name-input"
                className="home-user-input"
                disabled={isBusy}
                value={userNameDraft}
                onChange={(event) => {
                  setUserNameDraft(event.target.value);
                  setUserStatus(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSaveUserName();
                  }
                }}
              />
              <button
                type="button"
                className="home-secondary-action"
                disabled={
                  isBusy ||
                  normalizedUserNameDraft.length === 0 ||
                  normalizedUserNameDraft === userName
                }
                onClick={() => void handleSaveUserName()}
              >
                Save
              </button>
            </div>
            {userStatus ? <p className="home-action-status">{userStatus}</p> : null}
          </div>

          <div className="home-actions">
            <button
              className="home-create-button"
              disabled={isBusy}
              onClick={onCreateProject}
            >
              <IconPlus />
              Create Project
            </button>
            <button
              className="home-import-button"
              disabled={isBusy}
              onClick={onOpenProject}
            >
              <IconFolder />
              Open Project
            </button>
          </div>
          <div className="home-publish-actions">
            <button
              className="home-import-button"
              disabled={isBusy}
              onClick={() => void handleCopyCloudPublishUrl()}
            >
              <IconArrow />
              Copy Publish URL
            </button>
          </div>
          {publishUrlStatus ? (
            <p className="home-action-status">{publishUrlStatus}</p>
          ) : null}
        </div>

        <div className="home-visual" aria-hidden="true">
          <img src={HERO_IMAGE_SRC} alt="" />
        </div>
      </section>

      <section className="home-project-panel" aria-label="Project list">
        <div className="home-header">
          <div>
            <p className="home-eyebrow">Workspace</p>
            <h2 className="home-list-title">Common Projects</h2>
          </div>
          <button
            type="button"
            className="home-refresh-button"
            disabled={isBusy || isLoading}
            onClick={onRefreshProjects}
          >
            <IconRefresh />
            Refresh
          </button>
        </div>

        {errorMessage !== null ? (
          <div className="error-banner">{errorMessage}</div>
        ) : null}

        {isLoading ? (
          <div className="home-loading" aria-label="Loading projects">
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
          </div>
        ) : projects.length === 0 ? (
          <div className="home-empty-state">
            <strong>No projects yet</strong>
            <p>Create a project in project_store or open an existing folder.</p>
          </div>
        ) : (
          <div className="home-project-list home-project-list-grouped">
            {projectStoreProjects.length > 0 ? (
              <section className="home-project-group">
                <div className="home-project-group-title">
                  <span>project_store</span>
                  <strong>{projectStoreProjects.length}</strong>
                </div>
                {projectStoreProjects.map(renderProjectCard)}
              </section>
            ) : null}
            {externalProjects.length > 0 ? (
              <section className="home-project-group">
                <div className="home-project-group-title">
                  <span>Other paths</span>
                  <strong>{externalProjects.length}</strong>
                </div>
                {externalProjects.map(renderProjectCard)}
              </section>
            ) : null}
          </div>
        )}

        <div className="home-panel-footer">
          <span>Recent</span>
          <strong>{recentProject?.name ?? 'None'}</strong>
        </div>
      </section>
    </main>
  );
}
