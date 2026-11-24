import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Film,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  MousePointer2,
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Unlock,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  MIN_CLIP_DURATION,
  computeSnapTargets,
  getCompatibleTracks,
  snapEdge,
  splitClipAtTime,
} from '../../features/timeline-engine/timelineOps';
import {
  FILTER_CATALOG,
  VIDEO_EFFECT_CATALOG,
  blendColorWithIntensity,
  createEffectItemFromDef,
  loadCustomFilterPresets,
} from '../../features/creative-library/creativeCatalog';
import { useEditorStore } from '../../stores/useEditorStore';
import type { Clip, Track, TrackType } from '../../types/editor';
import { formatRulerTimecode } from '../../utils/timecode';
import { StudioTooltip } from '../common/StudioTooltip';
import { ClipFilmstrip } from './ClipFilmstrip';
import { WaveformCanvas } from './WaveformCanvas';

const TRACK_HEADER_WIDTH = 152;

interface DragOperation {
  kind: 'move' | 'trim-left' | 'trim-right';
  clipId: string;
  startX: number;
  startY: number;
  origStart: number;
  origDuration: number;
  origSourceIn: number;
  origSourceOut: number;
  origTrackId: string;
  snapTargets: number[];
}

export const TimelinePanel: React.FC = () => {
  const {
    project,
    assetsMap,
    selectedClipId,
    selectedTrackId,
    selectClip,
    selectTrack,
    setRightPanelTab,
    playhead,
    setPlayhead,
    setIsPlaying,
    zoomPps,
    setZoomPps,
    snapEnabled,
    setSnapEnabled,
    activeTool,
    setActiveTool,
    projectDuration,
    updateTrack,
    addTrack,
    deleteTrack,
    renameTrack,
    reorderTrack,
    updateClip,
    commitProjectEdit,
    pushHistoryCheckpoint,
    splitAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
    freezeFrameAtPlayhead,
    addMediaToTimeline,
    addMediaToNewTrack,
    addTextClipToTimeline,
    notify,
  } = useEditorStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addTrackMenuRef = useRef<HTMLDivElement>(null);
  const dragOpRef = useRef<DragOperation | null>(null);
  const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const [dropSpawnZone, setDropSpawnZone] = useState<'top' | 'bottom' | null>(null);
  const [isDraggingExternalMedia, setIsDraggingExternalMedia] = useState(false);
  const [trackHeight, setTrackHeight] = useState<number>(52);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [trackNameDraft, setTrackNameDraft] = useState('');

  useEffect(() => {
    if (!addTrackMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (addTrackMenuRef.current && !addTrackMenuRef.current.contains(e.target as Node)) {
        setAddTrackMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [addTrackMenuOpen]);

  const timelineTotalSeconds = Math.max(30, Math.ceil(projectDuration + 15));
  const timelineWidthPx = Math.max(900, Math.ceil(timelineTotalSeconds * zoomPps));

  const tickInterval = useMemo(() => {
    if (zoomPps >= 140) return 0.5;
    if (zoomPps >= 70) return 1;
    if (zoomPps >= 36) return 2;
    if (zoomPps >= 20) return 5;
    return 10;
  }, [zoomPps]);

  const rulerTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = 0; t <= timelineTotalSeconds; t += tickInterval) {
      ticks.push(Number(t.toFixed(2)));
    }
    return ticks;
  }, [timelineTotalSeconds, tickInterval]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const scroller = scrollContainerRef.current;
      if (!scroller) return 0;
      const rect = scroller.getBoundingClientRect();
      const xInTimeline = clientX - rect.left + scroller.scrollLeft - TRACK_HEADER_WIDTH;
      return Math.max(0, xInTimeline / zoomPps);
    },
    [zoomPps]
  );

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsPlaying(false);
    const updateFromEvent = (clientX: number) => {
      setPlayhead(timeFromClientX(clientX));
    };
    updateFromEvent(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromEvent(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleClipPointerDown = (
    e: React.PointerEvent,
    clip: Clip,
    kind: DragOperation['kind']
  ) => {
    if (!project || e.button !== 0) return;
    e.stopPropagation();

    const track = project.tracks.find((t) => t.id === clip.trackId);
    selectClip(clip.id);

    if (activeTool === 'razor') {
      if (track?.locked) {
        notify(`Track ${track.name} is locked.`, 'warning');
        return;
      }
      const clickTime = timeFromClientX(e.clientX);
      const nextClips = splitClipAtTime(project.clips, clip.id, clickTime);
      if (nextClips) {
        commitProjectEdit((prev) => ({ ...prev, clips: nextClips }));
      } else {
        notify('Click further inside the clip to split it.', 'info');
      }
      return;
    }

    if (track?.locked) {
      notify(`Track ${track.name} is locked.`, 'warning');
      return;
    }

    e.preventDefault();
    pushHistoryCheckpoint();

    const snapTargets = computeSnapTargets(project.clips, clip.id, playhead);
    const compatibleTracks = getCompatibleTracks(clip.type, project.tracks);

    dragOpRef.current = {
      kind,
      clipId: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      origStart: clip.startTime,
      origDuration: clip.duration,
      origSourceIn: clip.sourceIn,
      origSourceOut: clip.sourceOut,
      origTrackId: clip.trackId,
      snapTargets,
    };

    const snapThreshold = 8 / zoomPps;

    const onMove = (ev: PointerEvent) => {
      const op = dragOpRef.current;
      if (!op) return;
      const dt = (ev.clientX - op.startX) / zoomPps;

      if (op.kind === 'move') {
        let nextStart = Math.max(0, op.origStart + dt);
        let guide: number | null = null;

        if (snapEnabled) {
          const leftSnap = snapEdge(nextStart, op.snapTargets, snapThreshold);
          const rightSnap = snapEdge(nextStart + op.origDuration, op.snapTargets, snapThreshold);
          if (leftSnap.snappedTo !== null) {
            nextStart = leftSnap.value;
            guide = leftSnap.snappedTo;
          } else if (rightSnap.snappedTo !== null) {
            nextStart = Math.max(0, rightSnap.value - op.origDuration);
            guide = rightSnap.snappedTo;
          }
        }
        setSnapGuideTime(guide);

        const dy = ev.clientY - op.startY;
        const rowShift = Math.round(dy / trackHeight);
        const orderedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
        const origGlobalIdx = orderedTracks.findIndex((t) => t.id === op.origTrackId);
        let nextTrackId = op.origTrackId;
        if (origGlobalIdx !== -1 && rowShift !== 0) {
          const candidateIdx = Math.max(
            0,
            Math.min(orderedTracks.length - 1, origGlobalIdx + rowShift)
          );
          const candidateTrack = orderedTracks[candidateIdx];
          if (
            candidateTrack &&
            !candidateTrack.locked &&
            compatibleTracks.some((ct) => ct.id === candidateTrack.id)
          ) {
            nextTrackId = candidateTrack.id;
          }
        }

        updateClip(
          op.clipId,
          (c) => ({
            ...c,
            startTime: Number(nextStart.toFixed(3)),
            trackId: nextTrackId,
          }),
          false
        );
      } else if (op.kind === 'trim-left') {
        const maxDelta = op.origDuration - MIN_CLIP_DURATION;
        const minDelta = -Math.min(op.origStart, op.origSourceIn / clip.speed);
        let delta = Math.max(minDelta, Math.min(maxDelta, dt));
        let nextStart = op.origStart + delta;

        if (snapEnabled) {
          const snapped = snapEdge(nextStart, op.snapTargets, snapThreshold);
          if (snapped.snappedTo !== null) {
            const snappedDelta = snapped.value - op.origStart;
            if (snappedDelta >= minDelta && snappedDelta <= maxDelta) {
              delta = snappedDelta;
              nextStart = snapped.value;
              setSnapGuideTime(snapped.snappedTo);
            }
          } else {
            setSnapGuideTime(null);
          }
        }

        const nextDur = op.origDuration - delta;
        const nextSourceIn = Math.max(0, op.origSourceIn + delta * clip.speed);
        updateClip(
          op.clipId,
          (c) => ({
            ...c,
            startTime: Number(nextStart.toFixed(3)),
            duration: Number(nextDur.toFixed(3)),
            sourceIn: Number(nextSourceIn.toFixed(3)),
          }),
          false
        );
      } else if (op.kind === 'trim-right') {
        const maxDur = Number.isFinite(clip.mediaDuration)
          ? Math.max(MIN_CLIP_DURATION, (clip.mediaDuration - op.origSourceIn) / clip.speed)
          : 3600;
        let nextDur = Math.max(MIN_CLIP_DURATION, Math.min(maxDur, op.origDuration + dt));

        if (snapEnabled) {
          const endEdge = op.origStart + nextDur;
          const snapped = snapEdge(endEdge, op.snapTargets, snapThreshold);
          if (snapped.snappedTo !== null) {
            const candidateDur = snapped.value - op.origStart;
            if (candidateDur >= MIN_CLIP_DURATION && candidateDur <= maxDur) {
              nextDur = candidateDur;
              setSnapGuideTime(snapped.snappedTo);
            }
          } else {
            setSnapGuideTime(null);
          }
        }

        const nextSourceOut = op.origSourceIn + nextDur * clip.speed;
        updateClip(
          op.clipId,
          (c) => ({
            ...c,
            duration: Number(nextDur.toFixed(3)),
            sourceOut: Number(nextSourceOut.toFixed(3)),
          }),
          false
        );
      }
    };

    const onUp = () => {
      dragOpRef.current = null;
      setSnapGuideTime(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const clearExternalDragState = () => {
    setIsDraggingExternalMedia(false);
    setDropTargetTrackId(null);
    setDropSpawnZone(null);
  };

  const handleTrackDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    clearExternalDragState();
    const mediaId = e.dataTransfer.getData('application/x-framestudio-media');
    if (!mediaId) return;
    const asset = assetsMap.get(mediaId);
    if (!asset) return;

    const dropTime = timeFromClientX(e.clientX);
    const compatible =
      (asset.type === 'audio' && track.type === 'audio') ||
      ((asset.type === 'video' || asset.type === 'image') && track.type === 'video');

    if (!compatible) {
      // Auto-resolve compatible track or spawn a new track at dropTime
      addMediaToTimeline(asset, undefined, dropTime);
      return;
    }

    addMediaToTimeline(asset, track.id, dropTime);
  };

  const handleSpawnZoneDrop = (e: React.DragEvent, zone: 'top' | 'bottom') => {
    e.preventDefault();
    clearExternalDragState();
    const mediaId = e.dataTransfer.getData('application/x-framestudio-media');
    if (!mediaId) return;
    const asset = assetsMap.get(mediaId);
    if (!asset) return;

    const dropTime = timeFromClientX(e.clientX);
    const targetType: TrackType =
      asset.type === 'audio' ? 'audio' : zone === 'bottom' ? 'video' : 'video';
    addMediaToNewTrack(asset, dropTime, targetType);
  };

  const handleFitTimeline = () => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    const availW = Math.max(400, scroller.clientWidth - TRACK_HEADER_WIDTH - 48);
    const targetDur = Math.max(10, projectDuration + 2);
    const nextPps = Math.max(16, Math.min(200, Math.round(availW / targetDur)));
    setZoomPps(nextPps);
  };

  const handleCenterOnPlayhead = () => {
    const scroller = scrollContainerRef.current;
    if (!scroller) return;
    const playheadPx = playhead * zoomPps;
    const visibleTimelineW = scroller.clientWidth - TRACK_HEADER_WIDTH;
    scroller.scrollTo({
      left: Math.max(0, playheadPx - visibleTimelineW * 0.35),
      behavior: 'smooth',
    });
  };

  const handleTimelineWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoomPps((z) => Math.max(16, Math.min(240, Math.round(z * factor))));
    } else if (e.shiftKey && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const startTrackRename = (track: Track) => {
    setEditingTrackId(track.id);
    setTrackNameDraft(track.name);
  };

  const commitTrackRename = (trackId: string) => {
    if (trackNameDraft.trim()) {
      renameTrack(trackId, trackNameDraft.trim());
    }
    setEditingTrackId(null);
  };

  if (!project) return null;

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);

  const getClipStyle = (type: Clip['type'], isSelected: boolean) => {
    const base =
      type === 'video'
        ? 'bg-[#1A2D3E] border-[#365675]/85'
        : type === 'image'
        ? 'bg-[#222B42] border-[#435078]/85'
        : type === 'audio'
        ? 'bg-[#19332A] border-[#325E4E]/85'
        : type === 'sticker'
        ? 'bg-[#352C20] border-[#5E503B]/85'
        : 'bg-[#2E243D] border-[#54406E]/85';
    return `${base} ${
      isSelected
        ? 'ring-1.5 ring-[#38BDF8] border-[#38BDF8] shadow-[0_2px_12px_rgba(56,189,248,0.28)]'
        : 'hover:border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
    }`;
  };

  return (
    <section className="h-full w-full bg-[#121418] flex flex-col overflow-hidden select-none">
      {/* Timeline Action Bar */}
      <div className="h-9 shrink-0 px-3 bg-[#14161B] border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex items-center bg-[#1A1D24] border border-white/[0.06] rounded-lg p-0.5">
            <StudioTooltip label="Select & Move Tool" shortcut="V" side="top">
              <button
                type="button"
                onClick={() => setActiveTool('select')}
                className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${
                  activeTool === 'select'
                    ? 'bg-[#0284C7]/90 text-[#FAF9F6]'
                    : 'text-[#9BA3AB] hover:text-[#FAF9F6]'
                }`}
              >
                <MousePointer2 className="w-3 h-3" />
                <span className="hidden sm:inline">Select</span>
              </button>
            </StudioTooltip>
            <StudioTooltip label="Razor Split Tool" shortcut="C" side="top">
              <button
                type="button"
                onClick={() => setActiveTool('razor')}
                className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 transition-colors ${
                  activeTool === 'razor'
                    ? 'bg-[#0284C7]/90 text-[#FAF9F6]'
                    : 'text-[#9BA3AB] hover:text-[#FAF9F6]'
                }`}
              >
                <Scissors className="w-3 h-3" />
                <span className="hidden sm:inline">Razor</span>
              </button>
            </StudioTooltip>
          </div>

          <div className="h-4 w-px bg-[#2A2E37]" />

          <StudioTooltip label="Split Clip at Playhead" shortcut="S" side="top">
            <button
              type="button"
              onClick={() => splitAtPlayhead()}
              className="h-7 px-2 bg-[#20232A] hover:bg-[#282C35] border border-[#2A2E37] hover:border-[#343A46] rounded text-[11px] text-[#dce4e4] flex items-center gap-1 transition-colors"
            >
              <Scissors className="w-3 h-3" />
              <span className="hidden md:inline">Split</span>
            </button>
          </StudioTooltip>

          <StudioTooltip label="Capture Freeze Frame at Playhead" side="top">
            <button
              type="button"
              onClick={() => void freezeFrameAtPlayhead()}
              className="h-7 px-2 bg-[#20232A] hover:bg-[#282C35] border border-[#2A2E37] hover:border-[#343A46] rounded text-[11px] text-[#dce4e4] flex items-center gap-1 transition-colors"
            >
              <Camera className="w-3 h-3" />
              <span className="hidden lg:inline">Freeze</span>
            </button>
          </StudioTooltip>

          <StudioTooltip label="Duplicate Selected Clip" side="top">
            <button
              type="button"
              onClick={duplicateSelectedClip}
              disabled={!selectedClipId}
              aria-label="Duplicate Selected Clip"
              className="h-7 px-2 bg-[#20232A] hover:bg-[#282C35] disabled:opacity-35 disabled:pointer-events-none border border-[#2A2E37] rounded text-[11px] text-[#dce4e4] flex items-center gap-1 transition-colors"
            >
              <Copy className="w-3 h-3" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Delete Selected Clip" shortcut="Del" side="top">
            <button
              type="button"
              onClick={deleteSelectedClip}
              disabled={!selectedClipId}
              aria-label="Delete Selected Clip"
              className="h-7 px-2 bg-[#20232A] hover:bg-[#93000a]/60 disabled:opacity-35 disabled:pointer-events-none border border-[#2A2E37] rounded text-[11px] text-[#dce4e4] hover:text-[#ffdad6] flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </StudioTooltip>

          <div className="h-4 w-px bg-[#2A2E37]" />

          <StudioTooltip label="Insert Text Layer at Playhead" side="top">
            <button
              type="button"
              onClick={() => addTextClipToTimeline('Title Layer')}
              className="h-7 px-2 bg-[#20232A] hover:bg-[#282C35] border border-[#2A2E37] hover:border-[#343A46] rounded text-[11px] text-[#dce4e4] flex items-center gap-1 transition-colors"
            >
              <Type className="w-3 h-3 text-[#C4B5FD]" />
              <span className="hidden sm:inline">+ Text</span>
            </button>
          </StudioTooltip>

          {/* Dynamic Add Track Dropdown */}
          <div ref={addTrackMenuRef} className="relative">
            <StudioTooltip label="Add Unlimited Video, Audio, or Text Track" side="top">
              <button
                type="button"
                onClick={() => setAddTrackMenuOpen((o) => !o)}
                className={`h-7 px-2 border rounded text-[11px] flex items-center gap-1 transition-colors ${
                  addTrackMenuOpen
                    ? 'bg-[#3A4950] border-[#516168] text-[#FAF9F6]'
                    : 'bg-[#20232A] hover:bg-[#282C35] border-[#2A2E37] hover:border-[#343A46] text-[#dce4e4]'
                }`}
              >
                <Layers className="w-3 h-3 text-[#38BDF8]" />
                <span className="hidden sm:inline">+ Track</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-70" />
              </button>
            </StudioTooltip>

            <AnimatePresence>
              {addTrackMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="absolute left-0 top-full mt-1.5 w-48 bg-[#1D2027] border border-[#343A46] rounded-lg shadow-[0_14px_36px_rgba(0,0,0,0.6)] py-1 z-50"
                >
                  <div className="px-3 py-1 border-b border-white/[0.06] text-[10px] font-semibold text-[#9BA3AB]">
                    Add Timeline Track
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addTrack('video');
                      setAddTrackMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-[#dce4e4] hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                  >
                    <Film className="w-3.5 h-3.5 text-[#7DD3FC]" />
                    <span>Add Video Overlay Track</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addTrack('audio');
                      setAddTrackMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-[#dce4e4] hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                  >
                    <Music className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>Add Audio Track</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addTrack('text');
                      setAddTrackMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-[#dce4e4] hover:bg-white/[0.06] flex items-center gap-2 transition-colors"
                  >
                    <Type className="w-3.5 h-3.5 text-[#C4B5FD]" />
                    <span>Add Text / Subtitle Track</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <StudioTooltip label="Toggle Snapping" side="top">
            <button
              type="button"
              onClick={() => setSnapEnabled(!snapEnabled)}
              className={`h-7 px-2 rounded border text-[11px] flex items-center gap-1 transition-colors ${
                snapEnabled
                  ? 'bg-[#3A4950] border-[#b9c9d1]/40 text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#FAF9F6]'
              }`}
            >
              <Magnet className="w-3 h-3" />
              <span className="hidden md:inline">Snap</span>
            </button>
          </StudioTooltip>
        </div>

        {/* Right: Track Height, Center Playhead & Timeline Zoom */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden xl:flex items-center bg-[#20232A] border border-[#2A2E37] rounded p-0.5 text-[9px] font-mono">
            {(
              [
                { h: 44, label: 'S' },
                { h: 52, label: 'M' },
                { h: 68, label: 'L' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => setTrackHeight(opt.h)}
                title={`Track row height: ${opt.label}`}
                className={`px-1.5 py-0.5 rounded-[2px] transition-colors ${
                  trackHeight === opt.h
                    ? 'bg-[#3A4950] text-[#FAF9F6]'
                    : 'text-[#8A9299] hover:text-[#FAF9F6]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <StudioTooltip label="Scroll to Playhead" side="top">
            <button
              type="button"
              onClick={handleCenterOnPlayhead}
              aria-label="Scroll to Playhead"
              className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] rounded hover:bg-[#22262E] transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>

          <div className="h-4 w-px bg-[#2A2E37]" />

          <StudioTooltip label="Zoom Out Timeline" shortcut="-" side="top">
            <button
              type="button"
              onClick={() => setZoomPps((z) => Math.max(16, Math.round(z / 1.25)))}
              aria-label="Zoom Out"
              className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] rounded hover:bg-[#22262E] transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>

          <input
            type="range"
            min={16}
            max={240}
            value={zoomPps}
            onChange={(e) => setZoomPps(parseInt(e.target.value, 10))}
            className="w-24 studio-slider"
            aria-label="Timeline horizontal zoom"
          />

          <StudioTooltip label="Zoom In Timeline" shortcut="+" side="top">
            <button
              type="button"
              onClick={() => setZoomPps((z) => Math.min(240, Math.round(z * 1.25)))}
              aria-label="Zoom In"
              className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] rounded hover:bg-[#22262E] transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Fit Entire Sequence to Timeline" side="top">
            <button
              type="button"
              onClick={handleFitTimeline}
              aria-label="Fit Sequence to Timeline"
              className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] rounded hover:bg-[#22262E] transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        </div>
      </div>

      {/* Scrollable Multi-Track Grid */}
      <div
        ref={scrollContainerRef}
        onWheel={handleTimelineWheel}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-framestudio-media')) {
            e.preventDefault();
            setIsDraggingExternalMedia(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            clearExternalDragState();
          }
        }}
        onDrop={() => clearExternalDragState()}
        className="flex-1 overflow-auto relative bg-[#0E1014]"
        onClick={() => selectClip(null)}
      >
        <div
          className="relative min-h-full"
          style={{ width: TRACK_HEADER_WIDTH + timelineWidthPx }}
        >
          {/* Sticky Timecode Ruler */}
          <div className="sticky top-0 z-30 h-7 flex bg-[#121419] border-b border-white/[0.06]">
            <div
              className="sticky left-0 z-40 shrink-0 bg-[#121419] border-r border-white/[0.06] px-2.5 flex items-center justify-between"
              style={{ width: TRACK_HEADER_WIDTH }}
            >
              <span className="font-mono text-[10px] font-medium text-[#7B838D] tabular-nums">
                {sortedTracks.length} {sortedTracks.length === 1 ? 'Track' : 'Tracks'}
              </span>
              <span className="font-mono text-[9px] text-[#5B626B] tabular-nums">
                {project.fps}p
              </span>
            </div>

            <div
              onPointerDown={handleRulerPointerDown}
              className="relative flex-1 h-full cursor-ew-resize overflow-hidden bg-[#121419]"
            >
              {rulerTicks.map((t) => {
                const left = t * zoomPps;
                const subSpacing = (tickInterval * zoomPps) / 4;
                return (
                  <React.Fragment key={t}>
                    <div
                      className="absolute top-0 bottom-0 border-l border-white/[0.12]"
                      style={{ left }}
                    >
                      <span className="pl-1.5 pt-0.5 block font-mono text-[9px] tabular-nums text-[#8A9299] leading-none">
                        {formatRulerTimecode(t, project.fps, zoomPps >= 140)}
                      </span>
                    </div>
                    {subSpacing >= 10 &&
                      [1, 2, 3].map((sub) => (
                        <div
                          key={`${t}-sub-${sub}`}
                          className="absolute bottom-0 h-1.5 border-l border-white/[0.06]"
                          style={{ left: left + sub * subSpacing }}
                        />
                      ))}
                  </React.Fragment>
                );
              })}

              {/* Playhead Cap */}
              <div
                className="absolute top-0 bottom-0 z-40 pointer-events-none"
                style={{ left: playhead * zoomPps }}
              >
                <div
                  className="-translate-x-1/2 w-2.5 h-3.5 bg-[#38BDF8] shadow-md"
                  style={{ clipPath: 'polygon(0 0, 100% 0, 100% 58%, 50% 100%, 0 58%)' }}
                />
              </div>
            </div>
          </div>

          {/* Tracks Stack + Dynamic Drop-to-New-Track Zones */}
          <div className="relative">
            {isDraggingExternalMedia && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropSpawnZone('top');
                  setDropTargetTrackId(null);
                }}
                onDragLeave={() => setDropSpawnZone(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleSpawnZoneDrop(e, 'top');
                }}
                className={`h-8 flex items-center border-b border-dashed transition-colors ${
                  dropSpawnZone === 'top'
                    ? 'bg-[#0EA5E9]/20 border-[#38BDF8] text-[#FAF9F6]'
                    : 'bg-[#121822]/90 border-[#38BDF8]/40 text-[#7DD3FC]'
                }`}
              >
                <div
                  className="sticky left-0 shrink-0 px-3 text-[10px] font-medium flex items-center gap-1.5"
                  style={{ width: TRACK_HEADER_WIDTH }}
                >
                  <Plus className="w-3 h-3" />
                  <span>New Track</span>
                </div>
                <div className="flex-1 px-4 text-[10px] font-medium">
                  Drop here to automatically spawn a new overlay track at cursor time
                </div>
              </div>
            )}

            {sortedTracks.map((track, idx) => {
              const trackClips = project.clips.filter((c) => c.trackId === track.id);
              const isSelectedTrack = selectedTrackId === track.id;
              const isDropHover = dropTargetTrackId === track.id;
              const TrackTypeIcon =
                track.type === 'text' ? Type : track.type === 'audio' ? Music : Film;
              const trackAccentClass =
                track.type === 'text'
                  ? 'text-[#C4B5FD]'
                  : track.type === 'audio'
                  ? 'text-[#6EE7B7]'
                  : 'text-[#7DD3FC]';

              return (
                <div
                  key={track.id}
                  className="group/track flex border-b border-white/[0.04] transition-[height] duration-150"
                  style={{ height: trackHeight }}
                >
                  {/* Sticky Compact Dynamic Track Header */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      selectTrack(track.id);
                    }}
                    title={`${track.name} · Double-click to rename`}
                    className={`sticky left-0 z-20 shrink-0 border-r border-white/[0.06] px-1.5 flex items-center justify-between gap-1 transition-colors ${
                      isSelectedTrack
                        ? 'bg-[#171B22]'
                        : idx % 2 === 0
                        ? 'bg-[#101216] hover:bg-[#15181F]'
                        : 'bg-[#111318] hover:bg-[#161920]'
                    }`}
                    style={{ width: TRACK_HEADER_WIDTH }}
                  >
                    {/* Track Identity & Inline Rename */}
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <TrackTypeIcon
                        className={`w-2.5 h-2.5 shrink-0 opacity-85 ${trackAccentClass}`}
                      />
                      {editingTrackId === track.id ? (
                        <input
                          type="text"
                          autoFocus
                          value={trackNameDraft}
                          onChange={(e) => setTrackNameDraft(e.target.value)}
                          onBlur={() => commitTrackRename(track.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitTrackRename(track.id);
                            if (e.key === 'Escape') setEditingTrackId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full min-w-0 bg-[#0B0D11] border border-[#38BDF8]/60 rounded px-1 py-0.5 text-[10px] text-[#FAF9F6] outline-none"
                        />
                      ) : (
                        <span
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startTrackRename(track);
                          }}
                          className="text-[10px] font-medium text-[#dce4e4] truncate cursor-text"
                        >
                          {track.name}
                        </span>
                      )}
                    </div>

                    {/* Track Action Controls */}
                    <div
                      className="flex items-center gap-[1px] shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Reorder & Delete on hover or track selection */}
                      <div className="hidden group-hover/track:flex items-center gap-[1px] mr-0.5">
                        <button
                          type="button"
                          onClick={() => reorderTrack(track.id, 'up')}
                          disabled={idx === 0}
                          title="Move Track Up (Higher Composite Layer)"
                          className="w-[14px] h-[18px] rounded flex items-center justify-center text-[#7B838D] hover:text-[#FAF9F6] disabled:opacity-25 hover:bg-white/[0.08]"
                        >
                          <ChevronUp className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => reorderTrack(track.id, 'down')}
                          disabled={idx === sortedTracks.length - 1}
                          title="Move Track Down"
                          className="w-[14px] h-[18px] rounded flex items-center justify-center text-[#7B838D] hover:text-[#FAF9F6] disabled:opacity-25 hover:bg-white/[0.08]"
                        >
                          <ChevronDown className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTrack(track.id)}
                          disabled={sortedTracks.length <= 1}
                          title={`Delete ${track.name}`}
                          className="w-[14px] h-[18px] rounded flex items-center justify-center text-[#7B838D] hover:text-rose-400 disabled:opacity-25 hover:bg-rose-500/15"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {track.type !== 'audio' && (
                        <button
                          type="button"
                          onClick={() =>
                            updateTrack(track.id, (t) => ({ ...t, hidden: !t.hidden }))
                          }
                          title={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`}
                          className={`w-[17px] h-[18px] rounded flex items-center justify-center transition-colors ${
                            track.hidden
                              ? 'text-rose-400 bg-rose-500/15'
                              : 'text-[#6D7580] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                          }`}
                        >
                          {track.hidden ? (
                            <EyeOff className="w-2.5 h-2.5" />
                          ) : (
                            <Eye className="w-2.5 h-2.5" />
                          )}
                        </button>
                      )}

                      {track.type !== 'text' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              updateTrack(track.id, (t) => ({ ...t, muted: !t.muted }))
                            }
                            title={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
                            className={`w-[17px] h-[18px] rounded flex items-center justify-center transition-colors ${
                              track.muted
                                ? 'text-rose-400 bg-rose-500/15'
                                : 'text-[#6D7580] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                            }`}
                          >
                            {track.muted ? (
                              <VolumeX className="w-2.5 h-2.5" />
                            ) : (
                              <Volume2 className="w-2.5 h-2.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              updateTrack(track.id, (t) => ({ ...t, solo: !t.solo }))
                            }
                            title={`Solo ${track.name}`}
                            className={`w-[16px] h-[18px] text-[9px] font-mono font-bold rounded flex items-center justify-center transition-colors ${
                              track.solo
                                ? 'text-[#38BDF8] bg-[#38BDF8]/15'
                                : 'text-[#6D7580] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                            }`}
                          >
                            S
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          updateTrack(track.id, (t) => ({ ...t, locked: !t.locked }))
                        }
                        title={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
                        className={`w-[17px] h-[18px] rounded flex items-center justify-center transition-colors ${
                          track.locked
                            ? 'text-amber-300 bg-amber-500/15'
                            : 'text-[#5C636D] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                        }`}
                      >
                        {track.locked ? (
                          <Lock className="w-2.5 h-2.5" />
                        ) : (
                          <Unlock className="w-2.5 h-2.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Track Lane */}
                  <div
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-framestudio-media')) {
                        e.preventDefault();
                        setDropTargetTrackId(track.id);
                        setDropSpawnZone(null);
                      }
                    }}
                    onDragLeave={() => setDropTargetTrackId(null)}
                    onDrop={(e) => handleTrackDrop(e, track)}
                    className={`relative flex-1 h-full transition-colors ${
                      track.locked
                        ? 'bg-[#0D0F13] opacity-75'
                        : isDropHover
                        ? 'bg-[#0EA5E9]/15 ring-1 ring-inset ring-[#38BDF8]/50'
                        : idx % 2 === 0
                        ? 'bg-[#101216]'
                        : 'bg-[#121419]'
                    }`}
                  >
                    {trackClips.map((clip) => {
                      const left = clip.startTime * zoomPps;
                      const width = Math.max(18, clip.duration * zoomPps);
                      const isSelected = selectedClipId === clip.id;
                      const asset = clip.mediaId ? assetsMap.get(clip.mediaId) : undefined;
                      const mediaDur =
                        Number.isFinite(clip.mediaDuration) && clip.mediaDuration > 0
                          ? clip.mediaDuration
                          : clip.duration;
                      const inRatio = Math.max(0, Math.min(1, clip.sourceIn / mediaDur));
                      const outRatio = Math.max(
                        inRatio + 0.01,
                        Math.min(1, clip.sourceOut / mediaDur)
                      );
                      const isVisualClip =
                        (clip.type === 'video' || clip.type === 'image') && Boolean(asset);

                      return (
                        <div
                          key={clip.id}
                          onPointerDown={(e) => handleClipPointerDown(e, clip, 'move')}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            selectClip(clip.id);
                            setRightPanelTab('inspector');
                          }}
                          onDragOver={(e) => {
                            if (
                              (clip.type === 'video' || clip.type === 'image') &&
                              (e.dataTransfer.types.includes('application/x-framestudio-effect') ||
                                e.dataTransfer.types.includes('application/x-framestudio-filter'))
                            ) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onDrop={(e) => {
                            const fxType = e.dataTransfer.getData('application/x-framestudio-effect');
                            const filterId = e.dataTransfer.getData('application/x-framestudio-filter');
                            if (!fxType && !filterId) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (clip.type !== 'video' && clip.type !== 'image') {
                              notify('Drop effects or filters onto a video or image clip.', 'info');
                              return;
                            }
                            if (fxType) {
                              const def = VIDEO_EFFECT_CATALOG.find((d) => d.type === fxType);
                              if (def) {
                                const item = createEffectItemFromDef(def);
                                updateClip(clip.id, (c) => ({
                                  ...c,
                                  effectsStack: [...(c.effectsStack ?? []), item],
                                }));
                                selectClip(clip.id);
                                notify(`Added "${def.name}" effect to "${clip.name}".`, 'success');
                              }
                            } else if (filterId) {
                              const allFilters = [...FILTER_CATALOG, ...loadCustomFilterPresets()];
                              const preset = allFilters.find((f) => f.id === filterId);
                              if (preset) {
                                const blended = blendColorWithIntensity(preset.color, 100);
                                updateClip(clip.id, (c) => ({
                                  ...c,
                                  color: blended,
                                  effects: preset.effects ? { ...c.effects, ...preset.effects } : c.effects,
                                  appliedFilter: { id: preset.id, name: preset.name, intensity: 100 },
                                }));
                                selectClip(clip.id);
                                notify(`Applied "${preset.name}" filter to "${clip.name}".`, 'success');
                              }
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ left, width }}
                          className={`group/clip absolute top-1 bottom-1 rounded-[5px] border overflow-hidden transition-[box-shadow,border-color] ${getClipStyle(
                            clip.type,
                            isSelected
                          )} ${activeTool === 'razor' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          {/* Full-Width Multi-Frame Video Filmstrip or Image Strip */}
                          {isVisualClip && asset && (
                            <ClipFilmstrip
                              clip={clip}
                              asset={asset}
                              widthPx={Math.round(width)}
                              heightPx={trackHeight - 8}
                            />
                          )}

                          {/* Full-Width Audio Waveform (full height for audio tracks, lower strip for video tracks) */}
                          {asset?.waveformPeaks && asset.waveformPeaks.length > 0 && (
                            <div
                              className={
                                clip.type === 'audio'
                                  ? 'absolute inset-0 opacity-85 pointer-events-none'
                                  : 'absolute left-0 right-0 bottom-0 h-[30%] bg-black/35 opacity-85 pointer-events-none'
                              }
                            >
                              <WaveformCanvas
                                peaks={asset.waveformPeaks}
                                width={Math.max(18, Math.round(width))}
                                height={
                                  clip.type === 'audio'
                                    ? trackHeight - 10
                                    : Math.max(10, Math.round((trackHeight - 10) * 0.3))
                                }
                                sourceInRatio={inRatio}
                                sourceOutRatio={outRatio}
                                color={
                                  clip.type === 'audio'
                                    ? 'rgba(110, 231, 183, 0.65)'
                                    : 'rgba(186, 230, 253, 0.55)'
                                }
                              />
                            </div>
                          )}

                          {/* Crisp Clip Title & Badges */}
                          <div className="relative z-10 px-1.5 pt-1 flex items-center justify-between gap-1 pointer-events-none">
                            <span
                              className={`text-[10px] font-medium text-[#FAF9F6] truncate px-1 rounded-xs ${
                                isVisualClip
                                  ? 'bg-black/45 backdrop-blur-[1px] drop-shadow-sm'
                                  : 'drop-shadow-sm'
                              }`}
                            >
                              {clip.type === 'text' ? clip.text?.content || clip.name : clip.name}
                            </span>
                            {width > 92 && (
                              <span
                                className={`font-mono text-[9px] tabular-nums shrink-0 px-1 rounded-xs ${
                                  isVisualClip
                                    ? 'bg-black/45 text-[#dce4e4]'
                                    : 'text-[#dce4e4]/85'
                                }`}
                              >
                                {(clip.effectsStack?.filter((fx) => fx.enabled).length ?? 0) > 0
                                  ? `FX×${clip.effectsStack!.filter((fx) => fx.enabled).length} · `
                                  : ''}
                                {clip.reversed ? 'REV · ' : ''}
                                {clip.speedCurve.preset !== 'constant' ? 'RAMP · ' : ''}
                                {clip.duration.toFixed(1)}s
                              </span>
                            )}
                          </div>

                          {/* Keyframe Diamond Markers */}
                          {clip.keyframes.map((kf) => (
                            <div
                              key={kf.id}
                              style={{ left: Math.max(5, Math.min(width - 6, kf.time * zoomPps)) }}
                              className="absolute bottom-1.5 w-2 h-2 bg-[#FAF9F6] rotate-45 -translate-x-1/2 pointer-events-none z-20 shadow-xs"
                            />
                          ))}

                          {clip.transitionIn.type !== 'none' && (
                            <div
                              className="absolute left-0 bottom-0 h-1 bg-[#38BDF8]/85 pointer-events-none z-10"
                              style={{
                                width: Math.min(width / 2, clip.transitionIn.duration * zoomPps),
                              }}
                            />
                          )}
                          {clip.transitionOut.type !== 'none' && (
                            <div
                              className="absolute right-0 bottom-0 h-1 bg-[#38BDF8]/85 pointer-events-none z-10"
                              style={{
                                width: Math.min(width / 2, clip.transitionOut.duration * zoomPps),
                              }}
                            />
                          )}

                          {activeTool === 'select' && (
                            <>
                              <div
                                onPointerDown={(e) => handleClipPointerDown(e, clip, 'trim-left')}
                                title="Trim Clip Start"
                                className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-[#FAF9F6]/30 flex items-center justify-center z-20 transition-colors"
                              >
                                <div className="w-[2px] h-3 rounded-full bg-[#FAF9F6]/60 opacity-0 group-hover/clip:opacity-100" />
                              </div>
                              <div
                                onPointerDown={(e) => handleClipPointerDown(e, clip, 'trim-right')}
                                title="Trim Clip End"
                                className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-[#FAF9F6]/30 flex items-center justify-center z-20 transition-colors"
                              >
                                <div className="w-[2px] h-3 rounded-full bg-[#FAF9F6]/60 opacity-0 group-hover/clip:opacity-100" />
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {isDraggingExternalMedia && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropSpawnZone('bottom');
                  setDropTargetTrackId(null);
                }}
                onDragLeave={() => setDropSpawnZone(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleSpawnZoneDrop(e, 'bottom');
                }}
                className={`h-8 flex items-center border-b border-dashed transition-colors ${
                  dropSpawnZone === 'bottom'
                    ? 'bg-[#10B981]/20 border-[#6EE7B7] text-[#FAF9F6]'
                    : 'bg-[#111916]/90 border-[#6EE7B7]/40 text-[#6EE7B7]'
                }`}
              >
                <div
                  className="sticky left-0 shrink-0 px-3 text-[10px] font-medium flex items-center gap-1.5"
                  style={{ width: TRACK_HEADER_WIDTH }}
                >
                  <Plus className="w-3 h-3" />
                  <span>New Track</span>
                </div>
                <div className="flex-1 px-4 text-[10px] font-medium">
                  Drop here to automatically create a new track below
                </div>
              </div>
            )}

            {snapGuideTime !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-[#38BDF8]/80 pointer-events-none z-[25]"
                style={{ left: TRACK_HEADER_WIDTH + snapGuideTime * zoomPps }}
              />
            )}

            <div
              className="absolute top-0 bottom-0 w-[1.5px] bg-[#38BDF8] pointer-events-none z-30 shadow-[0_0_8px_rgba(56,189,248,0.55)]"
              style={{ left: TRACK_HEADER_WIDTH + playhead * zoomPps }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
