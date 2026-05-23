import { useState } from 'react';
import {
  type Project,
  type ProjectThemeColor,
} from './api';
import {
  ColorPaletteField,
  CommitNumberInput,
} from './Inspector';
import {
  BACKGROUND_COLOR_OPTIONS,
  STROKE_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  type ProjectDefaultStyle,
} from './itemStyles';
import { IconFolder } from './AppIcons';

const PROJECT_THEME_OPTIONS: Array<{
  value: ProjectThemeColor;
  label: string;
}> = [
  { value: 'default', label: 'Default' },
  { value: 'sage', label: 'Sage' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
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
  onChangeProjectDefaultStyle: (style: Partial<ProjectDefaultStyle>) => Promise<void>;
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
  onOpenProjectDeleteDialog,
}: ProjectSettingsDialogProps) {
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [prevProjectId, setPrevProjectId] = useState<string | null>(null);
  const [prevProjectName, setPrevProjectName] = useState('');

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

  const handleLocalSaveProjectName = () => {
    if (
      normalizedProjectNameDraft.length === 0 ||
      normalizedProjectNameDraft === selectedProject.name
    ) {
      return;
    }
    void onSaveProjectName(normalizedProjectNameDraft);
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
            <h2 id="project-settings-dialog-title">
              {selectedProject.name}
            </h2>
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
                  onChange={(event) =>
                    setProjectNameDraft(event.target.value)
                  }
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
                    BACKGROUND_COLOR_OPTIONS[5].value
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
              <div className="project-settings-dialog-kicker">
                Line & Arrow
              </div>
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
                <div
                  className="inspector-grid"
                  style={{ marginTop: '8px' }}
                >
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
                    <span className="sidebar-name-label">
                      Text position
                    </span>
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
                <div
                  className="inspector-grid"
                  style={{ marginTop: '8px' }}
                >
                  <label className="sidebar-project-theme-control project-style-control">
                    <span className="sidebar-name-label">Size</span>
                    <CommitNumberInput
                      inputKey={`project-default-font-size-${selectedProject?.id ?? 'none'}-${selectedProjectDefaultStyle.fontSize ?? 14}`}
                      min={12}
                      max={32}
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
