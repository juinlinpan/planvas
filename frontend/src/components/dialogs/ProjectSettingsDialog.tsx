import { useState } from 'react';
import {
  installProjectAiAgent,
  type AiAgentInstallTarget,
  type Project,
  type ProjectThemeColor,
} from '../../services/api';
import { ColorPaletteField, CommitNumberInput } from '../Inspector';
import {
  BACKGROUND_COLOR_OPTIONS,
  BOARD_ITEM_FONT_SIZE_MAX,
  BOARD_ITEM_FONT_SIZE_MIN,
  STROKE_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  type ProjectDefaultStyle,
} from '../../items/itemStyles';
import { IconFolder } from '../AppIcons';

const PROJECT_THEME_OPTIONS: Array<{
  value: ProjectThemeColor;
  label: string;
}> = [
  { value: 'default', label: 'Default' },
  { value: 'sage', label: 'Sage' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
];

const AI_AGENT_OPTIONS: Array<{
  value: AiAgentInstallTarget;
  label: string;
}> = [
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
  { value: 'antigravity-cli', label: 'Antigravity CLI' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'github-copilot', label: 'GitHub Copilot' },
  { value: 'opencode', label: 'OpenCode' },
];

export interface ProjectSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProject: Project | null;
  isMutating: boolean;
  selectedProjectDefaultStyle: ProjectDefaultStyle;
  onSaveProjectName: (nextName: string) => Promise<void>;
  onChangeProjectTheme: (theme: ProjectThemeColor) => Promise<void>;
  onRevealProject: () => Promise<void>;
  onChangeProjectDefaultStyle: (
    style: Partial<ProjectDefaultStyle>,
  ) => Promise<void>;
  onPublishProject: (publishUrl: string) => Promise<string>;
  onOpenProjectDeleteDialog: () => void;
}

export function ProjectSettingsDialog({
  isOpen,
  onClose,
  selectedProject,
  isMutating,
  selectedProjectDefaultStyle,
  onSaveProjectName,
  onChangeProjectTheme,
  onRevealProject,
  onChangeProjectDefaultStyle,
  onPublishProject,
  onOpenProjectDeleteDialog,
}: ProjectSettingsDialogProps) {
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [prevProjectId, setPrevProjectId] = useState<string | null>(null);
  const [prevProjectName, setPrevProjectName] = useState('');
  const [selectedAiAgent, setSelectedAiAgent] =
    useState<AiAgentInstallTarget>('codex');
  const [aiInstallStatus, setAiInstallStatus] = useState<string | null>(null);
  const [isInstallingAiAgent, setIsInstallingAiAgent] = useState(false);
  const [publishUrlDraft, setPublishUrlDraft] = useState('');
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  // Synchronize state with props during render pass
  if (
    selectedProject !== null &&
    (selectedProject.id !== prevProjectId ||
      selectedProject.name !== prevProjectName)
  ) {
    setPrevProjectId(selectedProject.id);
    setPrevProjectName(selectedProject.name);
    setProjectNameDraft(selectedProject.name);
  }

  if (!isOpen || selectedProject === null) {
    return null;
  }

  const normalizedProjectNameDraft = projectNameDraft.trim();
  const aiInstallCommand = buildAiAgentInstallCommand(
    selectedAiAgent,
    selectedProject.path,
  );
  const normalizedPublishUrlDraft = publishUrlDraft.trim();

  const handleLocalSaveProjectName = () => {
    if (
      normalizedProjectNameDraft.length === 0 ||
      normalizedProjectNameDraft === selectedProject.name
    ) {
      return;
    }
    void onSaveProjectName(normalizedProjectNameDraft);
  };

  const handleCopyAiInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(aiInstallCommand);
      setAiInstallStatus('Command copied.');
    } catch {
      setAiInstallStatus(
        'Copy failed. Select the command and copy it manually.',
      );
    }
  };

  const handleRunAiInstallCommand = async () => {
    if (!selectedProject.path) return;
    setIsInstallingAiAgent(true);
    setAiInstallStatus('Installing...');
    try {
      const result = await installProjectAiAgent(
        selectedProject.id,
        selectedAiAgent,
      );
      const output = result.stdout.trim() || result.stderr.trim();
      setAiInstallStatus(output || 'Installed.');
    } catch (error) {
      setAiInstallStatus(
        error instanceof Error ? error.message : 'Install failed.',
      );
    } finally {
      setIsInstallingAiAgent(false);
    }
  };

  const handlePublish = async () => {
    if (normalizedPublishUrlDraft.length === 0) return;
    setIsPublishing(true);
    setPublishStatus('Publishing...');
    try {
      const message = await onPublishProject(normalizedPublishUrlDraft);
      setPublishStatus(message);
    } catch (error) {
      setPublishStatus(
        error instanceof Error ? error.message : 'Publish failed.',
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="confirmation-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="project-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-dialog-title"
      >
        <div className="project-settings-dialog-header">
          <div>
            <div className="project-settings-dialog-kicker">
              Project settings
            </div>
            <h2 id="project-settings-dialog-title">{selectedProject.name}</h2>
          </div>
          <button
            type="button"
            className="ghost-button confirmation-dialog-close"
            disabled={isMutating}
            onClick={onClose}
            aria-label="Close project settings dialog"
          >
            X
          </button>
        </div>
        <div className="project-settings-dialog-grid">
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">Name</div>
            <label
              className="sidebar-name-group"
              htmlFor="sidebar-project-name-input"
            >
              <span className="sidebar-name-label">Project name</span>
              <div className="sidebar-name-edit-row">
                <input
                  id="sidebar-project-name-input"
                  className="sidebar-name-input project-settings-name-input"
                  disabled={isMutating}
                  type="text"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleLocalSaveProjectName();
                    }
                  }}
                />
                <button
                  className="ghost-button sidebar-inline-save"
                  disabled={
                    isMutating ||
                    normalizedProjectNameDraft.length === 0 ||
                    normalizedProjectNameDraft === selectedProject.name
                  }
                  onClick={handleLocalSaveProjectName}
                >
                  Save
                </button>
              </div>
            </label>
          </section>
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">Style</div>
            <label className="sidebar-project-theme-control">
              <span className="sidebar-name-label">Theme</span>
              <select
                disabled={isMutating}
                value={selectedProject.theme_color}
                onChange={(event) =>
                  void onChangeProjectTheme(
                    event.target.value as ProjectThemeColor,
                  )
                }
              >
                {PROJECT_THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">Location</div>
            <div className="project-settings-location-row">
              <code
                className="project-settings-path"
                title={selectedProject.path ?? 'No path available'}
              >
                {selectedProject.path ?? 'No path available'}
              </code>
              <button
                type="button"
                className="ghost-button project-settings-reveal-button"
                disabled={isMutating || !selectedProject.path}
                onClick={() => void onRevealProject()}
                title="Open in file explorer"
              >
                <IconFolder />
                <span>Open Folder</span>
              </button>
            </div>
          </section>
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">Publish</div>
            <label className="sidebar-name-group" htmlFor="project-publish-url-input">
              <span className="sidebar-name-label">Cloud publish URL</span>
              <input
                id="project-publish-url-input"
                className="sidebar-name-input project-settings-name-input"
                disabled={isMutating || isPublishing}
                value={publishUrlDraft}
                onChange={(event) => {
                  setPublishUrlDraft(event.target.value);
                  setPublishStatus(null);
                }}
                placeholder="https://planvas.example.com/cloud/publish"
              />
            </label>
            <div className="project-settings-ai-actions">
              <button
                type="button"
                className="ghost-button project-settings-reveal-button"
                disabled={
                  isMutating ||
                  isPublishing ||
                  normalizedPublishUrlDraft.length === 0
                }
                onClick={() => void handlePublish()}
              >
                {isPublishing ? 'Publishing...' : 'Publish'}
              </button>
            </div>
            {publishStatus ? (
              <p className="project-settings-ai-status">{publishStatus}</p>
            ) : null}
          </section>
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">
              Connect to your AI agent
            </div>
            <label className="sidebar-project-theme-control">
              <span className="sidebar-name-label">Agent</span>
              <select
                disabled={isMutating || isInstallingAiAgent}
                value={selectedAiAgent}
                onChange={(event) => {
                  setSelectedAiAgent(
                    event.target.value as AiAgentInstallTarget,
                  );
                  setAiInstallStatus(null);
                }}
              >
                {AI_AGENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <pre className="project-settings-ai-command">
              <code>{aiInstallCommand}</code>
            </pre>
            <div className="project-settings-ai-actions">
              <button
                type="button"
                className="ghost-button project-settings-reveal-button"
                disabled={isMutating || isInstallingAiAgent}
                onClick={() => void handleCopyAiInstallCommand()}
              >
                Copy
              </button>
              <button
                type="button"
                className="ghost-button project-settings-reveal-button"
                disabled={
                  isMutating || isInstallingAiAgent || !selectedProject.path
                }
                onClick={() => void handleRunAiInstallCommand()}
              >
                {isInstallingAiAgent ? 'Running...' : 'Run'}
              </button>
            </div>
            {aiInstallStatus ? (
              <p className="project-settings-ai-status">{aiInstallStatus}</p>
            ) : null}
          </section>
          <section className="project-settings-panel">
            <div className="project-settings-panel-heading">Components</div>

            <div className="project-settings-component-group">
              <div className="project-settings-dialog-kicker">
                Table & Frame
              </div>
              <div className="project-default-style-grid">
                <ColorPaletteField
                  label="Background"
                  options={BACKGROUND_COLOR_OPTIONS}
                  selectedValue={
                    selectedProjectDefaultStyle.largeObjectBackgroundColor ??
                    BACKGROUND_COLOR_OPTIONS[22].value
                  }
                  tone="background"
                  onSelect={(value) =>
                    void onChangeProjectDefaultStyle({
                      largeObjectBackgroundColor: value,
                    })
                  }
                />
              </div>
            </div>

            <div className="project-settings-component-group">
              <div className="project-settings-dialog-kicker">
                Textbox & Sticky & Note
              </div>
              <div className="project-default-style-grid">
                <ColorPaletteField
                  label="Background"
                  options={BACKGROUND_COLOR_OPTIONS}
                  selectedValue={
                    selectedProjectDefaultStyle.smallItemBackgroundColor ??
                    BACKGROUND_COLOR_OPTIONS[0].value
                  }
                  tone="background"
                  onSelect={(value) =>
                    void onChangeProjectDefaultStyle({
                      smallItemBackgroundColor: value,
                    })
                  }
                />
              </div>
            </div>

            <div className="project-settings-component-group">
              <div className="project-settings-dialog-kicker">Line & Arrow</div>
              <div className="project-default-style-grid">
                <ColorPaletteField
                  label="Stroke"
                  options={STROKE_COLOR_OPTIONS}
                  selectedValue={
                    selectedProjectDefaultStyle.linkColor ??
                    STROKE_COLOR_OPTIONS[0].value
                  }
                  tone="background"
                  onSelect={(value) =>
                    void onChangeProjectDefaultStyle({
                      linkColor: value,
                    })
                  }
                />
                <ColorPaletteField
                  label="Text color"
                  options={TEXT_COLOR_OPTIONS}
                  selectedValue={
                    selectedProjectDefaultStyle.linkTextColor ??
                    selectedProjectDefaultStyle.textColor ??
                    TEXT_COLOR_OPTIONS[0].value
                  }
                  tone="text"
                  onSelect={(value) =>
                    void onChangeProjectDefaultStyle({
                      linkTextColor: value,
                    })
                  }
                />
                <div className="inspector-grid" style={{ marginTop: '8px' }}>
                  <label className="sidebar-project-theme-control project-style-control">
                    <span className="sidebar-name-label">Width</span>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      disabled={isMutating}
                      value={selectedProjectDefaultStyle.strokeWidth ?? 3}
                      onChange={(e) =>
                        void onChangeProjectDefaultStyle({
                          strokeWidth: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="sidebar-project-theme-control project-style-control">
                    <span className="sidebar-name-label">Text position</span>
                    <select
                      disabled={isMutating}
                      value={
                        selectedProjectDefaultStyle.segmentTextVerticalPosition ??
                        'middle'
                      }
                      onChange={(e) =>
                        void onChangeProjectDefaultStyle({
                          segmentTextVerticalPosition: e.target
                            .value as ProjectDefaultStyle['segmentTextVerticalPosition'],
                        })
                      }
                    >
                      <option value="top">Top</option>
                      <option value="middle">Middle</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>

            <div className="project-settings-component-group">
              <div className="project-settings-dialog-kicker">Font</div>
              <div className="project-default-style-grid">
                <ColorPaletteField
                  label="Text color"
                  options={TEXT_COLOR_OPTIONS}
                  selectedValue={
                    selectedProjectDefaultStyle.textColor ??
                    TEXT_COLOR_OPTIONS[0].value
                  }
                  tone="text"
                  onSelect={(value) =>
                    void onChangeProjectDefaultStyle({
                      textColor: value,
                    })
                  }
                />
                <div className="inspector-grid" style={{ marginTop: '8px' }}>
                  <label className="sidebar-project-theme-control project-style-control">
                    <span className="sidebar-name-label">Size</span>
                    <CommitNumberInput
                      inputKey={`project-default-font-size-${selectedProject?.id ?? 'none'}-${selectedProjectDefaultStyle.fontSize ?? 14}`}
                      min={BOARD_ITEM_FONT_SIZE_MIN}
                      max={BOARD_ITEM_FONT_SIZE_MAX}
                      disabled={isMutating}
                      value={selectedProjectDefaultStyle.fontSize ?? 14}
                      onCommit={(rawValue) => {
                        void onChangeProjectDefaultStyle({
                          fontSize: Number(rawValue),
                        });
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>
          <section className="project-settings-panel project-settings-panel-actions">
            <div className="project-settings-panel-heading">Actions</div>
            <p className="confirmation-dialog-copy">
              Remove this project from the local workspace.
            </p>
            <div className="sidebar-project-action-row">
              <button
                type="button"
                className="ghost-button danger-button sidebar-project-delete-button"
                disabled={isMutating}
                onClick={onOpenProjectDeleteDialog}
              >
                Delete project
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function buildAiAgentInstallCommand(
  target: AiAgentInstallTarget,
  projectPath?: string | null,
): string {
  const quotedProjectPath = projectPath
    ? quotePowerShellArgument(projectPath)
    : '"<project-path>"';
  return [
    '.\\plugins\\planvas-ai\\scripts\\install.ps1',
    '-Target',
    target,
    '-Scope project',
    '-ProjectPath',
    quotedProjectPath,
  ].join(' ');
}

function quotePowerShellArgument(value: string): string {
  return `"${value.replace(/"/g, '`"')}"`;
}
