import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Film,
  FolderKanban,
  Layers,
  LayoutPanelLeft,
  Palette,
  PanelRight,
  Redo2,
  Save,
  Sparkles,
  Type,
  Undo2,
  Volume2,
  Wand2,
} from 'lucide-react';
import { useEditorStore } from '../../stores/useEditorStore';
import { RESOLUTION_PRESETS, type WorkspaceMode } from '../../types/editor';
import { StudioTooltip } from '../common/StudioTooltip';

interface TopToolbarProps {
  onBackToDashboard: () => void;
  onOpenExport: () => void;
  rightCollapsed: boolean;
  onToggleRight: () => void;
  onExpandRight: () => void;
  onResetLayout: () => void;
}

const WORKSPACE_TABS: { id: WorkspaceMode; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'edit', label: 'Edit', icon: Film },
  { id: 'media', label: 'Media', icon: FolderKanban },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'color', label: 'Filters', icon: Palette },
  { id: 'transitions', label: 'Transitions', icon: Sparkles },
];

export const TopToolbar: React.FC<TopToolbarProps> = ({
  onBackToDashboard,
  onOpenExport,
  rightCollapsed,
  onToggleRight,
  onExpandRight,
  onResetLayout,
}) => {
  const {
    project,
    workspaceMode,
    setWorkspaceMode,
    canUndo,
    canRedo,
    undo,
    redo,
    isDirty,
    saveNow,
    renameProject,
    setProjectResolution,
    toggleProxyMode,
    notify,
  } = useEditorStore();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const formatMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formatMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (formatMenuRef.current && !formatMenuRef.current.contains(e.target as Node)) {
        setFormatMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [formatMenuOpen]);

  if (!project) return null;

  const startEditing = () => {
    setNameDraft(project.name);
    setEditingName(true);
  };

  const commitName = () => {
    if (nameDraft.trim()) {
      renameProject(nameDraft.trim());
    }
    setEditingName(false);
  };

  return (
    <header className="h-11 shrink-0 px-3 bg-[#14161B] border-b border-white/[0.06] flex items-center justify-between gap-3 select-none relative z-40">
      {/* Left: Back + Project Title + Format Dropdown */}
      <div className="flex items-center gap-2 min-w-0">
        <StudioTooltip label="Return to Projects Dashboard" side="bottom">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="h-7 px-2 flex items-center gap-1.5 text-xs text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] border border-transparent hover:border-[#2A2E37] rounded transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </button>
        </StudioTooltip>

        <div className="h-4 w-px bg-[#2A2E37]" />

        {editingName ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') setEditingName(false);
              }}
              className="h-7 px-2 w-40 bg-[#101114] border border-[#516168] rounded text-xs text-[#FAF9F6] outline-none"
            />
            <button
              type="button"
              onClick={commitName}
              className="p-1.5 bg-[#3A4950] text-[#FAF9F6] rounded"
              aria-label="Confirm project name"
            >
              <Check className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <StudioTooltip label="Click to rename sequence" side="bottom">
            <button
              type="button"
              onClick={startEditing}
              className="h-7 px-2 rounded text-xs font-semibold text-[#FAF9F6] hover:bg-[#22262E] hover:text-[#d5e5ee] truncate max-w-[160px] text-left transition-colors"
            >
              {project.name}
            </button>
          </StudioTooltip>
        )}

        {/* Custom Animated Sequence Format Dropdown */}
        <div ref={formatMenuRef} className="relative hidden xl:block">
          <StudioTooltip label="Sequence Canvas & Social Format" side="bottom">
            <button
              type="button"
              onClick={() => setFormatMenuOpen((o) => !o)}
              className={`h-7 px-2.5 flex items-center gap-1.5 rounded border font-mono text-[10px] tabular-nums transition-colors whitespace-nowrap ${
                formatMenuOpen
                  ? 'bg-[#282C35] border-[#516168] text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] hover:border-[#343A46] text-[#dce4e4]'
              }`}
            >
              <span>{project.resolution.width}×{project.resolution.height}</span>
              <span className="text-[#6C7378]">·</span>
              <span className="text-[#A5ADAD]">{project.fps}p</span>
              <ChevronDown
                className={`w-3 h-3 text-[#A5ADAD] transition-transform duration-150 ${
                  formatMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </StudioTooltip>

          <AnimatePresence>
            {formatMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-0 top-full mt-1.5 w-64 bg-[#1D2027] border border-[#343A46] rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.6)] py-1 z-50"
              >
                <div className="px-3 py-1.5 border-b border-[#2A2E37] text-[10px] font-semibold text-[#A5ADAD]">
                  Sequence Format Preset
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {RESOLUTION_PRESETS.map((preset) => {
                    const active =
                      preset.width === project.resolution.width &&
                      preset.height === project.resolution.height;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setProjectResolution(preset);
                          setFormatMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left flex items-center justify-between gap-2 text-[11px] transition-colors ${
                          active
                            ? 'bg-[#3A4950]/70 text-[#FAF9F6]'
                            : 'text-[#dce4e4] hover:bg-[#262A33]'
                        }`}
                      >
                        <span className="truncate font-medium">{preset.label}</span>
                        <span className="font-mono text-[10px] tabular-nums text-[#A5ADAD] shrink-0">
                          {preset.width}×{preset.height}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Center: Studio Workspace Tabs */}
      <nav className="hidden lg:flex items-center gap-0.5 h-full">
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = workspaceMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setWorkspaceMode(tab.id);
                if (tab.id !== 'edit' && rightCollapsed) {
                  onExpandRight();
                }
              }}
              className={`relative h-full px-2.5 flex items-center gap-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                active ? 'text-[#FAF9F6]' : 'text-[#A5ADAD] hover:text-[#dce4e4]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#38BDF8]' : ''}`} />
              <span>{tab.label}</span>
              {active && (
                <motion.div
                  layoutId="workspaceTabIndicator"
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-0 left-1.5 right-1.5 h-[2px] bg-[#38BDF8] rounded-t"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right: Panel Toggles, Proxy Toggle, Undo/Redo, Save, Export */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Panel Layout Controls */}
        <div className="hidden md:flex items-center bg-[#20232A] border border-[#2A2E37] rounded p-0.5">
          <StudioTooltip
            label={rightCollapsed ? 'Expand Resources & Inspector' : 'Collapse Resources & Inspector'}
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleRight}
              aria-label="Toggle right studio panel"
              className={`p-1 rounded transition-colors ${
                !rightCollapsed
                  ? 'bg-[#3A4950] text-[#FAF9F6]'
                  : 'text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#2A2E37]'
              }`}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Reset Workspace Layout" side="bottom">
            <button
              type="button"
              onClick={onResetLayout}
              aria-label="Reset panel dimensions"
              className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#2A2E37] rounded transition-colors"
            >
              <LayoutPanelLeft className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        </div>

        <StudioTooltip
          label="Proxy Playback Mode (uses 360p copies for editing; export always renders full-res masters)"
          side="bottom"
        >
          <button
            type="button"
            onClick={toggleProxyMode}
            className={`h-7 px-2 flex items-center gap-1 text-[10px] font-mono rounded border transition-colors whitespace-nowrap ${
              project.proxyMode
                ? 'bg-[#3A4950] border-[#b9c9d1]/60 text-[#FAF9F6]'
                : 'bg-[#20232A] border-[#2A2E37] hover:border-[#343A46] text-[#A5ADAD] hover:text-[#dce4e4]'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span className="hidden sm:inline">Proxy {project.proxyMode ? 'ON' : 'OFF'}</span>
          </button>
        </StudioTooltip>

        <div className="flex items-center bg-[#20232A] border border-[#2A2E37] rounded p-0.5">
          <StudioTooltip label="Undo" shortcut="Ctrl+Z" side="bottom">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              className="p-1 text-[#dce4e4] hover:text-[#FAF9F6] disabled:opacity-35 disabled:pointer-events-none rounded hover:bg-[#2A2E37] transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
          <StudioTooltip label="Redo" shortcut="Ctrl+Shift+Z" side="bottom">
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              className="p-1 text-[#dce4e4] hover:text-[#FAF9F6] disabled:opacity-35 disabled:pointer-events-none rounded hover:bg-[#2A2E37] transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        </div>

        <StudioTooltip label="Save Project Locally" shortcut="Ctrl+S" side="bottom">
          <button
            type="button"
            onClick={() => {
              void saveNow().then(() => notify('Project saved to IndexedDB.', 'success'));
            }}
            className={`h-7 px-2.5 flex items-center gap-1.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
              isDirty
                ? 'bg-[#20232A] border-[#516168] text-[#FAF9F6] hover:bg-[#2A2E37]'
                : 'bg-[#181A1F] border-[#2A2E37] text-[#A5ADAD] hover:text-[#dce4e4]'
            }`}
          >
            <Save className="w-3 h-3" />
            <span className="hidden sm:inline">{isDirty ? 'Save*' : 'Saved'}</span>
          </button>
        </StudioTooltip>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={onOpenExport}
          className="h-7 px-3.5 flex items-center gap-1.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </motion.button>
      </div>
    </header>
  );
};
