import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Frame,
  Maximize,
  Minimize,
  PanelRightOpen,
  Pause,
  Play,
  Repeat,
  Scan,
  SplitSquareHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { audioEngine } from '../../features/audio-engine/audioEngine';
import {
  evaluateSpeedAtRatio,
  mapTimelineToSourceTime,
} from '../../features/timeline-engine/keyframes';
import {
  renderFrameAtTime,
  type MediaElementPool,
} from '../../features/video-preview/compositor';
import { useEditorStore } from '../../stores/useEditorStore';
import { formatSMPTE } from '../../utils/timecode';
import { StudioTooltip } from '../common/StudioTooltip';

interface ProgramMonitorProps {
  rightCollapsed?: boolean;
  onExpandRight?: () => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150] as const;

export const ProgramMonitor: React.FC<ProgramMonitorProps> = ({
  rightCollapsed = false,
  onExpandRight,
}) => {
  const {
    project,
    assetsMap,
    playhead,
    setPlayhead,
    isPlaying,
    setIsPlaying,
    loopPlayback,
    setLoopPlayback,
    projectDuration,
    masterVolume,
    setMasterVolume,
    masterMuted,
    setMasterMuted,
    selectedClip,
    updateClip,
    pushHistoryCheckpoint,
    registerMonitorCanvas,
    isPickingTrackTarget,
    setIsPickingTrackTarget,
    setLastPickedRoi,
    notify,
  } = useEditorStore();

  const monitorSectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef<MediaElementPool>({
    videos: new Map(),
    images: new Map(),
  });
  const videoUrlTrackerRef = useRef<Map<string, string>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [, setRenderTick] = useState(0);
  const dragMoveRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showSafeGuides, setShowSafeGuides] = useState(false);
  const [beforeAfterCompare, setBeforeAfterCompare] = useState(false);
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const compareCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 800, h: 450 });

  const isFullscreenActive = isNativeFullscreen || isCinemaFullscreen;

  const triggerRender = useCallback(() => {
    setRenderTick((t) => t + 1);
  }, []);

  useEffect(() => {
    registerMonitorCanvas(canvasRef.current);
    return () => registerMonitorCanvas(null);
  }, [registerMonitorCanvas]);

  // Measure monitor viewport stage cleanly on every panel resize / window resize
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreenActive]);

  // Listen to browser fullscreenchange & Esc for fallback cinema overlay
  useEffect(() => {
    const onFsChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === monitorSectionRef.current);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCinemaFullscreen) {
        setIsCinemaFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isCinemaFullscreen]);

  const toggleFullscreen = async () => {
    if (isCinemaFullscreen) {
      setIsCinemaFullscreen(false);
      return;
    }
    if (document.fullscreenElement === monitorSectionRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore
      }
      return;
    }
    if (monitorSectionRef.current?.requestFullscreen) {
      try {
        await monitorSectionRef.current.requestFullscreen();
        return;
      } catch {
        // Fallback if sandbox blocks native fullscreen
      }
    }
    setIsCinemaFullscreen(true);
  };

  // Sync media elements with project clips, assets, and proxyMode
  useEffect(() => {
    if (!project) return;
    const pool = poolRef.current;
    const audioEls = audioElsRef.current;
    const activeVideoClipIds = new Set<string>();
    const activeAudioClipIds = new Set<string>();
    const activeImageAssetIds = new Set<string>();

    for (const clip of project.clips) {
      if (!clip.mediaId) continue;
      const asset = assetsMap.get(clip.mediaId);
      if (!asset) continue;

      if (clip.type === 'video') {
        activeVideoClipIds.add(clip.id);
        const desiredUrl =
          project.proxyMode && asset.proxyObjectUrl ? asset.proxyObjectUrl : asset.objectUrl;
        const currentUrl = videoUrlTrackerRef.current.get(clip.id);

        if (!pool.videos.has(clip.id) || currentUrl !== desiredUrl) {
          const existing = pool.videos.get(clip.id);
          if (existing) {
            existing.pause();
            existing.src = desiredUrl;
            existing.load();
          } else {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            video.src = desiredUrl;
            video.onloadeddata = triggerRender;
            video.onseeked = triggerRender;
            audioEngine.attachMediaElement(video);
            pool.videos.set(clip.id, video);
          }
          videoUrlTrackerRef.current.set(clip.id, desiredUrl);
        }
      } else if (clip.type === 'audio') {
        activeAudioClipIds.add(clip.id);
        if (!audioEls.has(clip.id)) {
          const audio = document.createElement('audio');
          audio.preload = 'auto';
          audio.src = asset.objectUrl;
          audioEngine.attachMediaElement(audio);
          audioEls.set(clip.id, audio);
        }
      } else if (clip.type === 'image') {
        activeImageAssetIds.add(asset.id);
        if (!pool.images.has(asset.id)) {
          const img = new Image();
          img.onload = triggerRender;
          img.src = asset.objectUrl;
          pool.images.set(asset.id, img);
        }
      }
    }

    for (const [clipId, vid] of pool.videos.entries()) {
      if (!activeVideoClipIds.has(clipId)) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
        pool.videos.delete(clipId);
        videoUrlTrackerRef.current.delete(clipId);
      }
    }
    for (const [clipId, aud] of audioEls.entries()) {
      if (!activeAudioClipIds.has(clipId)) {
        aud.pause();
        aud.removeAttribute('src');
        aud.load();
        audioEls.delete(clipId);
      }
    }
    for (const [assetId] of pool.images.entries()) {
      if (!activeImageAssetIds.has(assetId)) {
        pool.images.delete(assetId);
      }
    }
  }, [project, assetsMap, triggerRender]);

  useEffect(() => {
    return () => {
      for (const vid of poolRef.current.videos.values()) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      }
      for (const aud of audioElsRef.current.values()) {
        aud.pause();
        aud.removeAttribute('src');
        aud.load();
      }
      poolRef.current.videos.clear();
      poolRef.current.images.clear();
      audioElsRef.current.clear();
      videoUrlTrackerRef.current.clear();
    };
  }, []);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume, masterMuted);
  }, [masterVolume, masterMuted]);

  const syncAndDrawAtTime = useCallback(
    (time: number, playing: boolean) => {
      if (!project) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      for (const clip of project.clips) {
        const isActive = time >= clip.startTime && time < clip.startTime + clip.duration;
        const localTime = Math.max(0, time - clip.startTime);
        const sourceTime = mapTimelineToSourceTime(clip, localTime);
        const instSpeed = evaluateSpeedAtRatio(clip, localTime / Math.max(0.01, clip.duration));
        const pitchRate = audioEngine.getVoicePitchMultiplier(
          clip.audio.voiceChanger,
          clip.audio.customPitch
        );

        if (clip.type === 'video') {
          const vid = poolRef.current.videos.get(clip.id);
          if (!vid) continue;
          if (isActive) {
            const gainVal = clip.reversed
              ? 0
              : audioEngine.computeClipEffectiveGain(clip, project.tracks, localTime);
            audioEngine.updateElementAudio(
              vid,
              gainVal,
              clip.audio.voiceChanger,
              clip.audio.noiseReduction,
              clip.audio.echoMix ?? 0
            );

            if (playing && !clip.reversed) {
              vid.playbackRate = Math.max(0.25, Math.min(4, instSpeed * pitchRate));
              if (Math.abs(vid.currentTime - sourceTime) > 0.22) {
                vid.currentTime = sourceTime;
              }
              if (vid.paused && vid.readyState >= 2) {
                void vid.play().catch(() => {});
              }
            } else {
              if (!vid.paused) vid.pause();
              const tolerance = clip.reversed && playing ? 0.045 : 0.03;
              if (Math.abs(vid.currentTime - sourceTime) > tolerance) {
                vid.currentTime = sourceTime;
              }
            }
          } else {
            if (!vid.paused) vid.pause();
            audioEngine.updateElementAudio(vid, 0);
          }
        } else if (clip.type === 'audio') {
          const aud = audioElsRef.current.get(clip.id);
          if (!aud) continue;
          if (isActive && playing && !clip.reversed) {
            aud.playbackRate = Math.max(0.25, Math.min(4, instSpeed * pitchRate));
            const gainVal = audioEngine.computeClipEffectiveGain(clip, project.tracks, localTime);
            audioEngine.updateElementAudio(
              aud,
              gainVal,
              clip.audio.voiceChanger,
              clip.audio.noiseReduction,
              clip.audio.echoMix ?? 0
            );
            if (Math.abs(aud.currentTime - sourceTime) > 0.22) {
              aud.currentTime = sourceTime;
            }
            if (aud.paused && aud.readyState >= 2) {
              void aud.play().catch(() => {});
            }
          } else {
            if (!aud.paused) aud.pause();
            audioEngine.updateElementAudio(aud, 0);
          }
        }
      }

      renderFrameAtTime(ctx, canvas.width, canvas.height, time, project, assetsMap, poolRef.current);

      if (beforeAfterCompare) {
        if (!compareCanvasRef.current) {
          compareCanvasRef.current = document.createElement('canvas');
        }
        const compCanvas = compareCanvasRef.current;
        if (compCanvas.width !== canvas.width) compCanvas.width = canvas.width;
        if (compCanvas.height !== canvas.height) compCanvas.height = canvas.height;
        const compCtx = compCanvas.getContext('2d');
        if (compCtx) {
          renderFrameAtTime(
            compCtx,
            compCanvas.width,
            compCanvas.height,
            time,
            project,
            assetsMap,
            poolRef.current,
            { bypassGradingAndFx: true }
          );
          const splitPx = Math.round((compareSplitPct / 100) * canvas.width);
          if (splitPx > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, splitPx, canvas.height);
            ctx.clip();
            ctx.drawImage(compCanvas, 0, 0);
            ctx.restore();
          }
        }
      }
    },
    [project, assetsMap, beforeAfterCompare, compareSplitPct]
  );

  const playheadRef = useRef(playhead);
  playheadRef.current = playhead;

  useEffect(() => {
    if (!isPlaying || !project) {
      syncAndDrawAtTime(playhead, false);
      return;
    }

    audioEngine.ensureContext();
    let rafId = 0;
    let lastTs = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      let nextTime = playheadRef.current + dt;
      const endLimit = Math.max(projectDuration, 0.1);

      if (nextTime >= endLimit) {
        if (loopPlayback && projectDuration > 0) {
          nextTime = 0;
        } else {
          setPlayhead(projectDuration);
          setIsPlaying(false);
          syncAndDrawAtTime(projectDuration, false);
          return;
        }
      }

      playheadRef.current = nextTime;
      setPlayhead(nextTime);
      syncAndDrawAtTime(nextTime, true);
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, loopPlayback, project, projectDuration, setIsPlaying, setPlayhead, syncAndDrawAtTime]);

  useEffect(() => {
    if (!isPlaying) {
      syncAndDrawAtTime(playhead, false);
    }
  });

  if (!project) return null;

  const aspect = project.resolution.width / project.resolution.height;
  const previewW = Math.min(1280, project.resolution.width);
  const previewH = Math.round(previewW / aspect);

  // Calculate fitted dimensions inside stage padding, then apply zoom multiplier
  const pad = isFullscreenActive ? 40 : 28;
  const availW = Math.max(160, stageSize.w - pad);
  const availH = Math.max(120, stageSize.h - pad);
  let fitW = availW;
  let fitH = fitW / aspect;
  if (fitH > availH) {
    fitH = availH;
    fitW = fitH * aspect;
  }
  const activeScale = zoomMode === 'fit' ? 1 : zoomPercent / 100;
  const displayW = Math.max(120, Math.round(fitW * activeScale));
  const displayH = Math.max(80, Math.round(fitH * activeScale));

  const togglePlay = () => {
    audioEngine.ensureContext();
    if (!isPlaying && projectDuration > 0 && playhead >= projectDuration - 0.02) {
      setPlayhead(0);
    }
    setIsPlaying((prev) => !prev);
  };

  const stepFrame = (dir: -1 | 1) => {
    setIsPlaying(false);
    const step = 1 / project.fps;
    setPlayhead((prev) => Math.max(0, Number((prev + dir * step).toFixed(4))));
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPickingTrackTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      setLastPickedRoi({ x: Number(xPct.toFixed(1)), y: Number(yPct.toFixed(1)) });
      setIsPickingTrackTarget(false);
      notify(`Tracking target locked at (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%).`, 'success');
      return;
    }

    if (!selectedClip || selectedClip.type === 'audio') return;
    if (
      playhead < selectedClip.startTime ||
      playhead > selectedClip.startTime + selectedClip.duration
    ) {
      return;
    }
    e.preventDefault();
    pushHistoryCheckpoint();
    const origX =
      selectedClip.type === 'text' && selectedClip.keyframes.length === 0
        ? selectedClip.text?.x ?? 50
        : selectedClip.transform.x;
    const origY =
      selectedClip.type === 'text' && selectedClip.keyframes.length === 0
        ? selectedClip.text?.y ?? 50
        : selectedClip.transform.y;
    dragMoveRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX,
      origY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragMoveRef.current || !selectedClip) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - dragMoveRef.current.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - dragMoveRef.current.startY) / rect.height) * 100;
    const nextX = Math.round((dragMoveRef.current.origX + dxPct) * 10) / 10;
    const nextY = Math.round((dragMoveRef.current.origY + dyPct) * 10) / 10;

    updateClip(
      selectedClip.id,
      (clip) => {
        if (clip.type === 'text' && clip.text && clip.keyframes.length === 0) {
          return {
            ...clip,
            text: {
              ...clip.text,
              x: Math.max(0, Math.min(100, nextX)),
              y: Math.max(0, Math.min(100, nextY)),
            },
          };
        }
        return {
          ...clip,
          transform: {
            ...clip.transform,
            x: Math.max(-100, Math.min(100, nextX)),
            y: Math.max(-100, Math.min(100, nextY)),
          },
        };
      },
      false
    );
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragMoveRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    dragMoveRef.current = null;
  };

  const canDragSelectedOnCanvas =
    !isPickingTrackTarget &&
    selectedClip &&
    selectedClip.type !== 'audio' &&
    playhead >= selectedClip.startTime &&
    playhead <= selectedClip.startTime + selectedClip.duration;

  return (
    <section
      ref={monitorSectionRef}
      className={
        isCinemaFullscreen
          ? 'fixed inset-0 z-50 bg-[#08090c] flex flex-col overflow-hidden select-none'
          : 'flex-1 min-w-[380px] bg-[#101114] flex flex-col overflow-hidden select-none relative'
      }
    >
      {/* Monitor Header Bar */}
      <div className="h-9 shrink-0 px-3 bg-[#16181D] border-b border-[#2A2E37] flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[#FAF9F6] tracking-tight whitespace-nowrap">
            Program Monitor
          </span>
          <span className="hidden sm:inline font-mono text-[10px] tabular-nums text-[#8A9299] whitespace-nowrap">
            {project.resolution.width}×{project.resolution.height} · {project.fps}p
          </span>
          {project.proxyMode && (
            <span className="font-mono text-[10px] text-[#b9c9d1] whitespace-nowrap">· PROXY</span>
          )}
        </div>

        {/* Right: Zoom Indicators + Slider + Fit + Guides + Fullscreen */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isPickingTrackTarget ? (
            <span className="hidden xl:flex text-[10px] text-amber-300 items-center gap-1 mr-1">
              <Crosshair className="w-3 h-3" />
              Click object on monitor
            </span>
          ) : canDragSelectedOnCanvas ? (
            <span className="hidden 2xl:inline text-[10px] text-[#A5ADAD] mr-1">
              Drag canvas to reposition
            </span>
          ) : null}

          {/* Preset Zoom Indicators (50%, 75%, 100%, 125%, 150%) */}
          <div className="hidden xl:flex items-center bg-[#101114] border border-[#2A2E37] rounded p-0.5">
            {ZOOM_PRESETS.map((pct) => {
              const active = zoomMode === 'custom' && zoomPercent === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setZoomMode('custom');
                    setZoomPercent(pct);
                  }}
                  className={`px-1.5 py-0.5 rounded-[2px] font-mono text-[9px] tabular-nums transition-colors ${
                    active
                      ? 'bg-[#3A4950] text-[#FAF9F6]'
                      : 'text-[#8A9299] hover:text-[#FAF9F6]'
                  }`}
                >
                  {pct}%
                </button>
              );
            })}
          </div>

          {/* Smooth Preview Zoom Slider */}
          <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-[#101114] border border-[#2A2E37] rounded">
            <input
              type="range"
              min={50}
              max={150}
              step={5}
              value={zoomMode === 'fit' ? 100 : zoomPercent}
              onChange={(e) => {
                setZoomMode('custom');
                setZoomPercent(parseInt(e.target.value, 10));
              }}
              className="w-16 sm:w-20 studio-slider"
              aria-label="Preview zoom percentage"
              title="Adjust preview zoom (50% – 150%)"
            />
            <span className="w-9 text-right font-mono text-[10px] tabular-nums text-[#dce4e4]">
              {zoomMode === 'fit' ? 'Fit' : `${zoomPercent}%`}
            </span>
          </div>

          {/* Fit to Screen Button */}
          <StudioTooltip label="Fit Preview to Screen" side="bottom">
            <button
              type="button"
              onClick={() => {
                setZoomMode('fit');
                setZoomPercent(100);
              }}
              className={`h-6 px-2 flex items-center gap-1 rounded border text-[10px] font-medium transition-colors whitespace-nowrap ${
                zoomMode === 'fit'
                  ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#FAF9F6]'
              }`}
            >
              <Scan className="w-3 h-3" />
              <span className="hidden sm:inline">Fit</span>
            </button>
          </StudioTooltip>

          {/* Before / After Grading & FX Split Compare */}
          <StudioTooltip label="Before / After Color & FX Compare" side="bottom">
            <button
              type="button"
              onClick={() => setBeforeAfterCompare((v) => !v)}
              aria-label="Before / After Color & FX Compare"
              className={`h-6 px-2 flex items-center gap-1 rounded border text-[10px] font-medium transition-colors whitespace-nowrap ${
                beforeAfterCompare
                  ? 'bg-[#3A4950] border-[#38BDF8]/60 text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#FAF9F6]'
              }`}
            >
              <SplitSquareHorizontal className="w-3 h-3" />
              <span className="hidden md:inline">Compare</span>
            </button>
          </StudioTooltip>

          {/* Safe Frame Guides Toggle */}
          <StudioTooltip label="Toggle Title-Safe Guides" side="bottom">
            <button
              type="button"
              onClick={() => setShowSafeGuides((s) => !s)}
              aria-label="Toggle Title-Safe Guides"
              className={`h-6 w-6 flex items-center justify-center rounded border transition-colors ${
                showSafeGuides
                  ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#FAF9F6]'
              }`}
            >
              <Frame className="w-3 h-3" />
            </button>
          </StudioTooltip>

          {/* Fullscreen Preview Button */}
          <StudioTooltip
            label={isFullscreenActive ? 'Exit Fullscreen Preview' : 'Fullscreen Preview'}
            shortcut={isCinemaFullscreen ? 'Esc' : undefined}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreenActive ? 'Exit Fullscreen Preview' : 'Fullscreen Preview'}
              className={`h-6 w-6 flex items-center justify-center rounded border transition-colors ${
                isFullscreenActive
                  ? 'bg-[#3A4950] border-[#b9c9d1]/60 text-[#FAF9F6]'
                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#FAF9F6]'
              }`}
            >
              {isFullscreenActive ? (
                <Minimize className="w-3 h-3" />
              ) : (
                <Maximize className="w-3 h-3" />
              )}
            </button>
          </StudioTooltip>

          {!isFullscreenActive && rightCollapsed && onExpandRight && (
            <StudioTooltip label="Expand Resources & Inspector" side="bottom">
              <button
                type="button"
                onClick={onExpandRight}
                className="p-1 -mr-1 rounded text-[#b9c9d1] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
                aria-label="Expand Resources & Inspector"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
            </StudioTooltip>
          )}
        </div>
      </div>

      {/* Prominent Cinema Video Preview Stage */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 studio-monitor-backdrop relative overflow-auto flex items-center justify-center p-3"
      >
        <div
          className="relative bg-black border border-[#2A2E37] shadow-[0_18px_50px_rgba(0,0,0,0.75)] shrink-0 transition-[width,height] duration-150 ease-out"
          style={{ width: displayW, height: displayH }}
        >
          <canvas
            ref={canvasRef}
            width={previewW}
            height={previewH}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            className={`w-full h-full block ${
              isPickingTrackTarget
                ? 'cursor-crosshair'
                : canDragSelectedOnCanvas
                ? 'cursor-move'
                : 'cursor-default'
            }`}
          />

          {/* Broadcast Safe Frame & Center Crosshair Overlay */}
          {showSafeGuides && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-[5%] border border-dashed border-[#b9c9d1]/35" />
              <div className="absolute inset-[10%] border border-[#b9c9d1]/20" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#b9c9d1]/20" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-[#b9c9d1]/20" />
            </div>
          )}

          {/* Before / After Draggable Split Wipe Divider */}
          {beforeAfterCompare && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-2 left-2.5 font-mono text-[10px] font-semibold tracking-wider text-white/90 bg-black/65 px-2 py-0.5 rounded-full">
                ORIGINAL
              </div>
              <div className="absolute top-2 right-2.5 font-mono text-[10px] font-semibold tracking-wider text-[#38BDF8] bg-black/65 px-2 py-0.5 rounded-full">
                GRADED &amp; FX
              </div>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.8)] pointer-events-auto cursor-ew-resize"
                style={{ left: `${compareSplitPct}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const stageEl = e.currentTarget.parentElement;
                  if (!stageEl) return;
                  const target = e.currentTarget;
                  target.setPointerCapture(e.pointerId);
                  const onMove = (ev: PointerEvent) => {
                    const rect = stageEl.getBoundingClientRect();
                    const pct = Math.max(
                      5,
                      Math.min(95, ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100)
                    );
                    setCompareSplitPct(Math.round(pct));
                  };
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                  };
                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                }}
              >
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-8 rounded-full bg-[#14161B] border border-[#38BDF8] flex items-center justify-center shadow-lg">
                  <div className="w-0.5 h-3.5 bg-[#38BDF8] rounded-full" />
                </div>
              </div>
            </div>
          )}

          {project.clips.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
              <div className="px-4 py-2.5 bg-[#15171C]/80 border border-[#2A2E37] rounded backdrop-blur-xs">
                <p className="text-xs font-medium text-[#dce4e4]">
                  Sequence Canvas Ready ({project.resolution.width}×{project.resolution.height})
                </p>
                <p className="text-[11px] text-[#8A9299] mt-0.5">
                  Import media from the right Resources panel or insert a title/overlay to begin editing
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transport & Audio Monitor Bar */}
      <div className="h-11 shrink-0 px-4 bg-[#17191E] border-t border-[#2A2E37] flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono tabular-nums min-w-[175px]">
          <span className="text-[13px] font-semibold text-[#FAF9F6] tracking-tight">
            {formatSMPTE(playhead, project.fps)}
          </span>
          <span className="text-[11px] text-[#555C63]">/</span>
          <span className="text-[11px] text-[#8A9299]">
            {formatSMPTE(projectDuration, project.fps)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <StudioTooltip label="Jump to Start" side="top">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setPlayhead(0);
              }}
              aria-label="Jump to Start"
              className="w-7 h-7 flex items-center justify-center rounded text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
            >
              <ChevronFirst className="w-4 h-4" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Step Back 1 Frame" shortcut="←" side="top">
            <button
              type="button"
              onClick={() => stepFrame(-1)}
              aria-label="Step Back 1 Frame"
              className="w-7 h-7 flex items-center justify-center rounded text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </StudioTooltip>

          <StudioTooltip label={isPlaying ? 'Pause' : 'Play'} shortcut="Space" side="top">
            <motion.button
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="w-9 h-8 flex items-center justify-center rounded bg-[#3A4950] hover:bg-[#516168] border border-[#b9c9d1]/25 text-[#FAF9F6] transition-colors mx-1 shadow-sm"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </motion.button>
          </StudioTooltip>

          <StudioTooltip label="Step Forward 1 Frame" shortcut="→" side="top">
            <button
              type="button"
              onClick={() => stepFrame(1)}
              aria-label="Step Forward 1 Frame"
              className="w-7 h-7 flex items-center justify-center rounded text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Jump to End" side="top">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setPlayhead(projectDuration);
              }}
              aria-label="Jump to End"
              className="w-7 h-7 flex items-center justify-center rounded text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
            >
              <ChevronLast className="w-4 h-4" />
            </button>
          </StudioTooltip>

          <StudioTooltip label="Toggle Loop Playback" side="top">
            <button
              type="button"
              onClick={() => setLoopPlayback((l) => !l)}
              aria-label="Toggle Loop Playback"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ml-1 border ${
                loopPlayback
                  ? 'bg-[#3A4950] border-[#b9c9d1]/40 text-[#FAF9F6]'
                  : 'border-transparent text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E]'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        </div>

        <div className="flex items-center gap-2 min-w-[145px] justify-end">
          <StudioTooltip label={masterMuted ? 'Unmute Monitor Audio' : 'Mute Monitor Audio'} side="top">
            <button
              type="button"
              onClick={() => setMasterMuted(!masterMuted)}
              aria-label={masterMuted ? 'Unmute Monitor Audio' : 'Mute Monitor Audio'}
              className="p-1 rounded text-[#A5ADAD] hover:text-[#FAF9F6] hover:bg-[#22262E] transition-colors"
            >
              {masterMuted || masterVolume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-[#ffb4ab]" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
          </StudioTooltip>
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={masterMuted ? 0 : masterVolume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setMasterMuted(false);
              setMasterVolume(v);
            }}
            className="w-20 studio-slider"
            aria-label="Master monitor volume"
          />
          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-[#8A9299]">
            {masterMuted ? 'MUTE' : `${Math.round(masterVolume * 100)}%`}
          </span>
        </div>
      </div>
    </section>
  );
};
