import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { TopToolbar } from '../components/toolbar/TopToolbar';
import { ProgramMonitor } from '../components/preview/ProgramMonitor';
import { RightStudioPanel } from '../components/workspace/RightStudioPanel';
import { TimelinePanel } from '../components/timeline/TimelinePanel';
import { ExportModal } from '../components/modals/ExportModal';
import { ToastStack } from '../components/common/ToastStack';
import { ResizeHandle } from '../components/common/ResizeHandle';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { EditorProvider, useEditorStore } from '../stores/useEditorStore';

interface EditorWorkspaceProps {
  onBackToDashboard: () => void;
}

interface WorkspaceLayoutState {
  rightWidth: number;
  timelineHeight: number;
  rightCollapsed: boolean;
}

const LAYOUT_STORAGE_KEY = 'framestudio:workspace-layout:v2';

const DEFAULT_LAYOUT: WorkspaceLayoutState = {
  rightWidth: 368,
  timelineHeight: 300,
  rightCollapsed: false,
};

const MIN_RIGHT_W = 300;
const MAX_RIGHT_W = 580;
const MIN_CENTER_W = 440;
const MIN_TIMELINE_H = 210;
const MAX_TIMELINE_H = 540;
const MIN_TOP_H = 250;
const TOOLBAR_H = 44;

function loadSessionLayout(): WorkspaceLayoutState {
  try {
    const raw = sessionStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkspaceLayoutState>;
    return {
      rightWidth:
        typeof parsed.rightWidth === 'number' ? parsed.rightWidth : DEFAULT_LAYOUT.rightWidth,
      timelineHeight:
        typeof parsed.timelineHeight === 'number'
          ? parsed.timelineHeight
          : DEFAULT_LAYOUT.timelineHeight,
      rightCollapsed: Boolean(parsed.rightCollapsed),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function clampLayoutToViewport(
  layout: WorkspaceLayoutState,
  vpWidth: number,
  vpHeight: number
): WorkspaceLayoutState {
  let rightWidth = Math.max(MIN_RIGHT_W, Math.min(MAX_RIGHT_W, layout.rightWidth));
  const maxRightForViewport = Math.max(240, vpWidth - MIN_CENTER_W);
  if (!layout.rightCollapsed && rightWidth > maxRightForViewport) {
    rightWidth = maxRightForViewport;
  }

  const maxTimeline = Math.max(
    MIN_TIMELINE_H,
    Math.min(MAX_TIMELINE_H, vpHeight - TOOLBAR_H - MIN_TOP_H)
  );
  const timelineHeight = Math.max(MIN_TIMELINE_H, Math.min(maxTimeline, layout.timelineHeight));

  return {
    ...layout,
    rightWidth,
    timelineHeight,
  };
}

const EditorWorkspaceInner: React.FC<EditorWorkspaceProps> = ({ onBackToDashboard }) => {
  const { loading, loadError, project } = useEditorStore();
  const [exportOpen, setExportOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  });
  const [layout, setLayout] = useState<WorkspaceLayoutState>(() => loadSessionLayout());
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  useKeyboardShortcuts(exportOpen);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setVpSize({ w: rect.width, h: rect.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Ignore storage errors
    }
  }, [layout]);

  const effective = clampLayoutToViewport(layout, vpSize.w, vpSize.h);

  const handleRightDelta = useCallback(
    (delta: number) => {
      setLayout((prev) => {
        const maxAllowed = Math.max(MIN_RIGHT_W, Math.min(MAX_RIGHT_W, vpSize.w - MIN_CENTER_W));
        return {
          ...prev,
          rightWidth: Math.max(MIN_RIGHT_W, Math.min(maxAllowed, prev.rightWidth - delta)),
        };
      });
    },
    [vpSize.w]
  );

  const handleTimelineDelta = useCallback(
    (delta: number) => {
      setLayout((prev) => {
        const maxAllowed = Math.max(
          MIN_TIMELINE_H,
          Math.min(MAX_TIMELINE_H, vpSize.h - TOOLBAR_H - MIN_TOP_H)
        );
        return {
          ...prev,
          timelineHeight: Math.max(MIN_TIMELINE_H, Math.min(maxAllowed, prev.timelineHeight - delta)),
        };
      });
    },
    [vpSize.h]
  );

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#101114] flex flex-col">
        <div className="h-11 bg-[#14161B] border-b border-white/[0.06] animate-pulse" />
        <div className="flex-1 flex">
          <div className="flex-1 bg-[#0b0d10] flex items-center justify-center">
            <div className="w-72 h-40 rounded border border-white/[0.06] bg-[#16181D] animate-pulse" />
          </div>
          <div className="w-[368px] bg-[#14161B] border-l border-white/[0.06] animate-pulse" />
        </div>
        <div className="h-[300px] bg-[#14161B] border-t border-white/[0.06] animate-pulse" />
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="h-screen w-screen bg-[#101114] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#181A1F] border border-[#343A46] rounded-md p-6 text-center space-y-4 shadow-2xl">
          <h2 className="text-sm font-semibold text-[#FAF9F6]">Unable to Open Project</h2>
          <p className="text-xs text-[#A5ADAD]">
            {loadError ?? 'The requested sequence could not be loaded from local storage.'}
          </p>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-[#3A4950] hover:bg-[#516168] text-[#FAF9F6] text-xs font-medium rounded transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const transitionClass = isDraggingSplit
    ? ''
    : 'transition-[width,height,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]';

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="h-screen w-screen bg-[#101114] text-[#dce4e4] flex flex-col overflow-hidden"
    >
      <TopToolbar
        onBackToDashboard={onBackToDashboard}
        onOpenExport={() => setExportOpen(true)}
        rightCollapsed={effective.rightCollapsed}
        onToggleRight={() => setLayout((p) => ({ ...p, rightCollapsed: !p.rightCollapsed }))}
        onExpandRight={() => setLayout((p) => ({ ...p, rightCollapsed: false }))}
        onResetLayout={() => setLayout(DEFAULT_LAYOUT)}
      />

      {/* Top Studio Row: Primary Program Monitor (Left/Center) + Resizable Right Studio Panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <ProgramMonitor
          rightCollapsed={effective.rightCollapsed}
          onExpandRight={() => setLayout((p) => ({ ...p, rightCollapsed: false }))}
        />

        {!effective.rightCollapsed && (
          <ResizeHandle
            direction="vertical"
            label="Resize Resources & Inspector panel width"
            onDragStart={() => setIsDraggingSplit(true)}
            onDragDelta={handleRightDelta}
            onDragEnd={() => setIsDraggingSplit(false)}
            onDoubleClick={() =>
              setLayout((p) => ({ ...p, rightWidth: DEFAULT_LAYOUT.rightWidth }))
            }
          />
        )}

        <div
          style={{ width: effective.rightCollapsed ? 0 : effective.rightWidth }}
          className={`shrink-0 h-full overflow-hidden ${transitionClass} ${
            effective.rightCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div style={{ width: effective.rightWidth }} className="h-full">
            <RightStudioPanel
              onCollapse={() => setLayout((p) => ({ ...p, rightCollapsed: true }))}
            />
          </div>
        </div>
      </div>

      {/* Horizontal Splitter between Top Row and Bottom Timeline */}
      <ResizeHandle
        direction="horizontal"
        label="Resize Timeline height"
        onDragStart={() => setIsDraggingSplit(true)}
        onDragDelta={handleTimelineDelta}
        onDragEnd={() => setIsDraggingSplit(false)}
        onDoubleClick={() =>
          setLayout((p) => ({ ...p, timelineHeight: DEFAULT_LAYOUT.timelineHeight }))
        }
      />

      {/* Resizable Multi-Track Timeline */}
      <div
        style={{ height: effective.timelineHeight }}
        className={`shrink-0 w-full overflow-hidden ${transitionClass}`}
      >
        <TimelinePanel />
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ToastStack />
    </motion.div>
  );
};

export const Editor: React.FC<{ projectId: string; onBackToDashboard: () => void }> = ({
  projectId,
  onBackToDashboard,
}) => {
  return (
    <EditorProvider projectId={projectId}>
      <EditorWorkspaceInner onBackToDashboard={onBackToDashboard} />
    </EditorProvider>
  );
};
