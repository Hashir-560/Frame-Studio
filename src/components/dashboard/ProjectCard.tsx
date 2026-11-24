import React from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  Film,
  Pencil,
  Play,
  Star,
  Trash2,
} from 'lucide-react';
import type { ProjectMediaStats } from '../../services/db';
import { getProjectDuration } from '../../features/project/projectFactory';
import { getAspectRatioLabel, type Project } from '../../types/editor';
import { formatFileSize, formatRelativeDate, formatSMPTE } from '../../utils/timecode';

interface ProjectCardProps {
  project: Project;
  mediaStats?: ProjectMediaStats;
  viewMode: 'grid' | 'list';
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onStartRename: (project: Project, e: React.MouseEvent) => void;
  onCommitRename: (project: Project) => void;
  onCancelRename: () => void;
  onToggleFavorite: (project: Project, e: React.MouseEvent) => void;
  onDuplicate: (project: Project, e: React.MouseEvent) => void;
  onRequestDelete: (project: Project, e: React.MouseEvent) => void;
  onOpen: (project: Project) => void;
}

const TimelineSchematicFallback: React.FC<{ project: Project; duration: number }> = ({
  project,
  duration,
}) => {
  const safeTotal = Math.max(duration, 10);
  const topTracks = [...project.tracks]
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);

  return (
    <div className="w-full h-full bg-gradient-to-br from-[#12151E] via-[#0F1219] to-[#0B0D12] px-4 py-3 flex flex-col justify-center gap-1.5 relative overflow-hidden">
      {project.clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center gap-1.5 opacity-75">
          <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
            <Film className="w-4 h-4 text-[#7DD3FC]" />
          </div>
          <span className="text-[11px] font-medium text-[#9BA3AB]">
            Empty {getAspectRatioLabel(project.resolution.width, project.resolution.height)} Canvas
          </span>
        </div>
      ) : (
        topTracks.map((track) => {
          const laneClips = project.clips.filter((c) => c.trackId === track.id);
          const barColor =
            track.type === 'text'
              ? 'bg-[#A78BFA]/70'
              : track.type === 'audio'
              ? 'bg-[#34D399]/65'
              : 'bg-[#38BDF8]/70';
          return (
            <div
              key={track.id}
              className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden"
            >
              {laneClips.map((c) => (
                <div
                  key={c.id}
                  className={`absolute top-0 bottom-0 rounded-full ${barColor}`}
                  style={{
                    left: `${Math.min(96, (c.startTime / safeTotal) * 100)}%`,
                    width: `${Math.max(5, Math.min(100, (c.duration / safeTotal) * 100))}%`,
                  }}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
};

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  mediaStats,
  viewMode,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleFavorite,
  onDuplicate,
  onRequestDelete,
  onOpen,
}) => {
  const duration = getProjectDuration(project);
  const previewThumb = project.thumbnailDataUrl || mediaStats?.thumbnailDataUrl;
  const aspectLabel = getAspectRatioLabel(project.resolution.width, project.resolution.height);
  const categoryLabel = project.category ?? 'General';

  if (viewMode === 'list') {
    return (
      <motion.div
        layout="position"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        onClick={() => {
          if (!isRenaming) onOpen(project);
        }}
        className="group flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-[#151820] hover:bg-[#191E29] border border-white/[0.06] hover:border-[#38BDF8]/30 cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Compact 16:9 Thumbnail */}
          <div className="w-24 h-14 rounded-lg overflow-hidden bg-[#0B0D12] border border-white/[0.06] shrink-0 relative">
            {previewThumb ? (
              <img
                src={previewThumb}
                alt={project.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <TimelineSchematicFallback project={project} duration={duration} />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
              <Play className="w-4 h-4 text-[#FAF9F6] opacity-0 group-hover:opacity-100 transition-opacity fill-current" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div className="flex items-center gap-1.5 max-w-sm" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => onRenameDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitRename(project);
                    if (e.key === 'Escape') onCancelRename();
                  }}
                  className="flex-1 h-8 px-2.5 bg-[#0E1014] border border-[#38BDF8]/60 rounded-lg text-xs text-[#FAF9F6] outline-none"
                />
                <button
                  type="button"
                  onClick={() => onCommitRename(project)}
                  className="p-1.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] rounded-lg"
                  aria-label="Save name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="text-sm font-semibold text-[#FAF9F6] truncate group-hover:text-[#7DD3FC] transition-colors">
                  {project.name}
                </h3>
                {project.favorite && (
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-[#9BA3AB] tabular-nums">
              <span>{categoryLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {project.resolution.width}×{project.resolution.height}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{aspectLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{project.fps} fps</span>
              {mediaStats && mediaStats.totalBytes > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{formatFileSize(mediaStats.totalBytes)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Duration + Date + Actions */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="hidden md:block text-right">
            <div className="font-mono text-xs text-[#dce4e4] tabular-nums">
              {formatSMPTE(duration, project.fps)}
            </div>
            <div className="text-[11px] text-[#7B838D]">
              Edited {formatRelativeDate(project.updatedAt)}
            </div>
          </div>

          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => onToggleFavorite(project, e)}
              title={project.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
              className={`p-2 rounded-lg transition-colors ${
                project.favorite
                  ? 'text-amber-400 hover:bg-amber-400/10'
                  : 'text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06]'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${project.favorite ? 'fill-current' : ''}`} />
            </button>
            <button
              type="button"
              onClick={(e) => onStartRename(project, e)}
              title="Rename project"
              className="p-2 text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onDuplicate(project, e)}
              title="Duplicate project"
              className="p-2 text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onRequestDelete(project, e)}
              title="Delete project"
              className="p-2 text-[#7B838D] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => {
        if (!isRenaming) onOpen(project);
      }}
      className="group bg-[#151820] hover:bg-[#191D27] border border-white/[0.06] hover:border-[#38BDF8]/35 rounded-2xl overflow-hidden cursor-pointer transition-colors flex flex-col shadow-[0_8px_24px_rgba(0,0,0,0.22)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
    >
      {/* 16:9 Cinema Preview Surface */}
      <div className="aspect-video w-full bg-[#0C0E13] relative overflow-hidden">
        {previewThumb ? (
          <img
            src={previewThumb}
            alt={project.name}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <TimelineSchematicFallback project={project} duration={duration} />
        )}

        {/* Measured Contrast Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0D12]/90 via-transparent to-black/25 pointer-events-none" />

        {/* Hover Center Open Affordance */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-[#0E1014]/75 backdrop-blur-xs border border-white/20 flex items-center justify-center opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 shadow-lg">
            <Play className="w-4 h-4 text-[#FAF9F6] fill-current ml-0.5" />
          </div>
        </div>

        {/* Top-Right Favorite Toggle */}
        <div
          className="absolute top-2.5 right-2.5 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => onToggleFavorite(project, e)}
            aria-label={project.favorite ? 'Unfavorite project' : 'Favorite project'}
            title={project.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            className={`w-8 h-8 rounded-full backdrop-blur-xs flex items-center justify-center transition-all ${
              project.favorite
                ? 'bg-[#0E1014]/80 text-amber-400 opacity-100'
                : 'bg-[#0E1014]/65 text-[#dce4e4] opacity-0 group-hover:opacity-100 hover:text-amber-300'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${project.favorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Bottom Scrim Overlay: Category + Real Timecode */}
        <div className="absolute bottom-2.5 left-3.5 right-3.5 flex items-center justify-between gap-2 pointer-events-none">
          <span className="text-[11px] font-medium text-[#dce4e4]/90 truncate">
            {categoryLabel}
          </span>
          <span className="font-mono text-[11px] font-medium tabular-nums text-[#FAF9F6]">
            {formatSMPTE(duration, project.fps)}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3.5">
        <div>
          {isRenaming ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                autoFocus
                value={renameDraft}
                onChange={(e) => onRenameDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCommitRename(project);
                  if (e.key === 'Escape') onCancelRename();
                }}
                className="flex-1 h-8 px-2.5 bg-[#0E1014] border border-[#38BDF8]/60 rounded-lg text-xs text-[#FAF9F6] outline-none"
              />
              <button
                type="button"
                onClick={() => onCommitRename(project)}
                className="p-1.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] rounded-lg"
                aria-label="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <h3 className="font-display text-[15px] font-semibold text-[#FAF9F6] truncate group-hover:text-[#7DD3FC] transition-colors">
              {project.name}
            </h3>
          )}

          {/* Unboxed Tabular Technical Metadata */}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-[#9BA3AB] font-mono tabular-nums truncate">
            <span>
              {project.resolution.width}×{project.resolution.height}
            </span>
            <span aria-hidden="true">·</span>
            <span>{project.fps} fps</span>
            <span aria-hidden="true">·</span>
            <span>{aspectLabel}</span>
            <span aria-hidden="true">·</span>
            <span>
              {project.clips.length} {project.clips.length === 1 ? 'clip' : 'clips'}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <span className="text-[11px] text-[#7B838D]">
            Edited {formatRelativeDate(project.updatedAt)}
          </span>

          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => onStartRename(project, e)}
              title="Rename project"
              aria-label="Rename project"
              className="p-1.5 text-[#8A9299] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onDuplicate(project, e)}
              title="Duplicate project"
              aria-label="Duplicate project"
              className="p-1.5 text-[#8A9299] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => onRequestDelete(project, e)}
              title="Delete project"
              aria-label="Delete project"
              className="p-1.5 text-[#8A9299] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
