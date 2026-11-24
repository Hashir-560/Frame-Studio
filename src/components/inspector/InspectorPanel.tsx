import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  Copy,
  Crosshair,
  Diamond,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Gauge,
  Layers,
  Palette,
  PanelRightClose,
  Plus,
  RotateCcw,
  RotateCw,
  Sliders,
  Sparkles,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { ScrubInput } from '../common/ScrubInput';
import { StudioScrollArea } from '../common/StudioScrollArea';
import { StudioTooltip } from '../common/StudioTooltip';
import { getSpeedPresetValues } from '../../features/timeline-engine/keyframes';
import {
  FILTER_CATALOG,
  TYPOGRAPHY_STYLE_OPTIONS,
  VIDEO_EFFECT_CATALOG,
  blendColorWithIntensity,
  createEffectItemFromDef,
  loadCustomFilterPresets,
} from '../../features/creative-library/creativeCatalog';
import {
  generateWordTimingsForText,
  isSpeechSynthesisSupported,
  speakCaptionText,
} from '../../features/captions/captionEngine';
import {
  analyzeVideoStabilization,
  trackObjectInVideo,
} from '../../features/video-preview/pixelEffects';
import { useEditorStore } from '../../stores/useEditorStore';
import {
  DEFAULT_CHROMA_KEY,
  DEFAULT_COLOR,
  DEFAULT_CROP,
  DEFAULT_EFFECTS,
  DEFAULT_MASK,
  DEFAULT_TRANSFORM,
  TEXT_ANIMATION_CATALOG,
  TRANSITION_CATALOG,
  type BlendMode,
  type Clip,
  type Keyframe,
  type MaskShape,
  type SpeedCurvePreset,
  type TextAnimation,
  type TextTypographyStyle,
  type TransitionEasing,
  type TransitionType,
  type VideoEffectType,
  type VoiceChangerPreset,
} from '../../types/editor';
import { createId } from '../../utils/id';
import { formatSMPTE, gainToDb } from '../../utils/timecode';

type InspectorTab = 'basic' | 'motion' | 'color' | 'fx' | 'audio';

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'difference', label: 'Difference' },
];

const MASK_SHAPES: { value: MaskShape; label: string }[] = [
  { value: 'none', label: 'No Mask' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'linear-wipe', label: 'Linear Wipe' },
];

const SPEED_CURVES: { value: SpeedCurvePreset; label: string }[] = [
  { value: 'constant', label: 'Constant (Linear)' },
  { value: 'ramp-up', label: 'Ramp Up (Slow → Fast)' },
  { value: 'ramp-down', label: 'Ramp Down (Fast → Slow)' },
  { value: 'hero-dip', label: 'Hero Dip (Fast → Slow → Fast)' },
  { value: 'pulse', label: 'Speed Pulse (Slow → Fast → Slow)' },
];

const VOICE_PRESETS: { value: VoiceChangerPreset; label: string }[] = [
  { value: 'none', label: 'Natural (Bypass)' },
  { value: 'deep', label: 'Deep Bass (-18%)' },
  { value: 'high', label: 'High Pitch (+24%)' },
  { value: 'radio', label: 'Walkie-Talkie / Radio' },
  { value: 'robot', label: 'Robotic Ring Mod' },
  { value: 'echo', label: 'Cathedral Echo' },
];

const EASING_OPTIONS: { value: TransitionEasing; label: string }[] = [
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'linear', label: 'Linear' },
];

interface AccordionSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  rightSlot,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <div className="px-3 py-2 flex items-center justify-between gap-2 bg-[#14161B] hover:bg-[#191C23] transition-colors">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-1.5 text-left text-[11px] font-semibold text-[#FAF9F6]"
        >
          <motion.span
            animate={{ rotate: open ? 0 : -90 }}
            transition={{ duration: 0.14 }}
            className="text-[#8A9299] inline-flex"
          >
            <ChevronDown className="w-3 h-3" />
          </motion.span>
          {icon}
          <span>{title}</span>
        </button>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface InspectorPanelProps {
  onCollapse?: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ onCollapse }) => {
  const {
    project,
    assetsMap,
    selectedClip,
    playhead,
    setPlayhead,
    updateClip,
    applyTextStyleToAllSubtitles,
    pushHistoryCheckpoint,
    deleteSelectedClip,
    duplicateSelectedClip,
    freezeFrameAtPlayhead,
    projectDuration,
    isPickingTrackTarget,
    setIsPickingTrackTarget,
    lastPickedRoi,
    setLastPickedRoi,
    notify,
  } = useEditorStore();

  const [activeTab, setActiveTab] = useState<InspectorTab>('basic');
  const [selectedKfId, setSelectedKfId] = useState<string | null>(null);
  const [trackingPct, setTrackingPct] = useState<number | null>(null);
  const [stabPct, setStabPct] = useState<number | null>(null);
  const [trackTargetClipId, setTrackTargetClipId] = useState<string>('');

  if (!project) return null;

  if (!selectedClip) {
    return (
      <aside className="w-full h-full bg-[#14161B] flex flex-col overflow-hidden select-none">
        <div className="h-10 px-3 border-b border-white/[0.06] bg-[#14161B] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#FAF9F6]">Inspector</span>
            <span className="text-[10px] text-[#7B838D]">· Sequence</span>
          </div>
          {onCollapse && (
            <StudioTooltip label="Collapse Inspector Panel" side="bottom">
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse Inspector Panel"
                className="p-1.5 rounded-full text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] transition-colors"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </StudioTooltip>
          )}
        </div>

        <StudioScrollArea
          className="flex-1 min-h-0"
          contentClassName="p-3 space-y-3 text-xs"
          ariaLabel="Sequence properties and shortcuts"
        >
          <div className="p-3 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-2">
            <div className="text-[11px] font-semibold text-[#FAF9F6]">Sequence Properties</div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9BA3AB]">Format</span>
              <span className="font-mono tabular-nums text-[#dce4e4]">{project.resolution.label}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9BA3AB]">Dimensions</span>
              <span className="font-mono tabular-nums text-[#dce4e4]">
                {project.resolution.width} × {project.resolution.height}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9BA3AB]">Frame Rate</span>
              <span className="font-mono tabular-nums text-[#dce4e4]">{project.fps} fps</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9BA3AB]">Duration</span>
              <span className="font-mono tabular-nums text-[#dce4e4]">
                {formatSMPTE(projectDuration, project.fps)}
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9BA3AB]">Proxy Playback</span>
              <span className="font-mono text-[#dce4e4]">{project.proxyMode ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div className="p-3 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-2">
            <div className="text-[11px] font-semibold text-[#FAF9F6]">Keyboard Shortcuts</div>
            <div className="space-y-1.5 text-[11px]">
              {[
                ['Space', 'Play / Pause'],
                ['S', 'Split at Playhead'],
                ['V / C', 'Select / Razor Tool'],
                ['← / →', 'Step 1 Frame (Shift: 10)'],
                ['+ / -', 'Zoom Timeline'],
                ['Ctrl/Cmd + Z', 'Undo'],
                ['Ctrl/Cmd + Shift + Z', 'Redo'],
                ['Ctrl/Cmd + S', 'Save Project'],
                ['Del', 'Delete Selected Clip'],
              ].map(([key, action]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-[#9BA3AB]">{action}</span>
                  <kbd className="px-1.5 py-0.5 bg-[#0E1014] ring-1 ring-white/[0.08] rounded font-mono text-[10px] text-[#dce4e4]">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </StudioScrollArea>
      </aside>
    );
  }

  const isVisualMedia = selectedClip.type === 'video' || selectedClip.type === 'image';
  const hasAudio = selectedClip.type === 'video' || selectedClip.type === 'audio';
  const isText = selectedClip.type === 'text' && Boolean(selectedClip.text);
  const isSticker = selectedClip.type === 'sticker' && Boolean(selectedClip.sticker);
  const isAudioOnly = selectedClip.type === 'audio';

  const effectiveTab: InspectorTab =
    isAudioOnly && activeTab !== 'basic' && activeTab !== 'motion' ? 'audio' : activeTab;

  const patchClipDirect = (updater: (c: Clip) => Clip) => {
    updateClip(selectedClip.id, updater, false);
  };

  const localPlayhead = Math.max(0, Math.min(selectedClip.duration, playhead - selectedClip.startTime));

  const handleAddKeyframe = () => {
    const kf: Keyframe = {
      id: createId('kf'),
      time: Number(localPlayhead.toFixed(3)),
      x: isText && selectedClip.keyframes.length === 0 ? selectedClip.text?.x ?? 50 : selectedClip.transform.x,
      y: isText && selectedClip.keyframes.length === 0 ? selectedClip.text?.y ?? 50 : selectedClip.transform.y,
      scale: selectedClip.transform.scale,
      rotation: selectedClip.transform.rotation,
      opacity: selectedClip.transform.opacity,
      easing: 'ease-in-out',
    };
    updateClip(selectedClip.id, (c) => {
      const filtered = c.keyframes.filter((k) => Math.abs(k.time - kf.time) > 0.04);
      return {
        ...c,
        keyframes: [...filtered, kf].sort((a, b) => a.time - b.time),
      };
    });
    setSelectedKfId(kf.id);
    notify(`Added keyframe at ${kf.time.toFixed(2)}s.`, 'success');
  };

  const handleUpdateKeyframe = (kfId: string, patch: Partial<Keyframe>, record = false) => {
    updateClip(
      selectedClip.id,
      (c) => ({
        ...c,
        keyframes: c.keyframes
          .map((item) => (item.id === kfId ? { ...item, ...patch } : item))
          .sort((a, b) => a.time - b.time),
      }),
      record
    );
  };

  const handleRunMotionTrack = async () => {
    if (selectedClip.type !== 'video' || !selectedClip.mediaId) return;
    const asset = assetsMap.get(selectedClip.mediaId);
    if (!asset) return;
    const targetOverlayId =
      trackTargetClipId ||
      project.clips.find((c) => c.type === 'text' || c.type === 'sticker')?.id ||
      '';
    if (!targetOverlayId) {
      notify('Add a Text, Sticker, or Overlay clip to receive the motion-tracked keyframes.', 'warning');
      return;
    }
    const roi = lastPickedRoi ?? { x: 50, y: 50 };
    setTrackingPct(0);
    try {
      const kfs = await trackObjectInVideo(
        asset.objectUrl,
        selectedClip,
        roi.x,
        roi.y,
        (pct) => setTrackingPct(pct)
      );
      const targetOverlay = project.clips.find((c) => c.id === targetOverlayId);
      if (targetOverlay) {
        const shiftedKfs = kfs.map((k) => ({
          ...k,
          time: Number(Math.max(0, selectedClip.startTime + k.time - targetOverlay.startTime).toFixed(3)),
        }));
        updateClip(targetOverlay.id, (c) => ({
          ...c,
          keyframes: shiftedKfs,
        }));
        notify(`Tracked ${kfs.length} keyframes onto "${targetOverlay.name}".`, 'success');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Motion tracking failed.', 'error');
    } finally {
      setTrackingPct(null);
    }
  };

  const handleAnalyzeStabilization = async () => {
    if (selectedClip.type !== 'video' || !selectedClip.mediaId) return;
    const asset = assetsMap.get(selectedClip.mediaId);
    if (!asset) return;
    setStabPct(0);
    try {
      const offsets = await analyzeVideoStabilization(
        asset.objectUrl,
        selectedClip,
        (pct) => setStabPct(pct)
      );
      updateClip(selectedClip.id, (c) => ({
        ...c,
        stabilization: {
          ...c.stabilization,
          enabled: true,
          offsets,
        },
      }));
      notify(`Computed ${offsets.length} stabilization frames.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Stabilization analysis failed.', 'error');
    } finally {
      setStabPct(null);
    }
  };

  const cSh = 50 - selectedClip.color.curveShadows * 0.7;
  const cMid = 50 - selectedClip.color.curveMidtones * 0.8;
  const cHi = 50 - selectedClip.color.curveHighlights * 0.7;

  const overlayClipsForTracking = project.clips.filter(
    (c) => c.type === 'text' || c.type === 'sticker' || (c.id !== selectedClip.id && c.type === 'image')
  );

  const roiX = lastPickedRoi?.x ?? 50;
  const roiY = lastPickedRoi?.y ?? 50;

  return (
    <aside className="w-full h-full bg-[#14161B] flex flex-col overflow-hidden select-none">
      {/* Header */}
      <div className="h-10 px-3 border-b border-white/[0.06] bg-[#14161B] flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold text-[#7DD3FC] shrink-0">
            {selectedClip.trackId}
          </span>
          <span className="text-[11px] font-semibold text-[#FAF9F6] truncate" title={selectedClip.name}>
            {selectedClip.name}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <StudioTooltip label="Duplicate Clip" side="bottom">
            <button
              type="button"
              onClick={duplicateSelectedClip}
              aria-label="Duplicate Clip"
              className="p-1.5 text-[#9BA3AB] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-full transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
          <StudioTooltip label="Delete Clip" shortcut="Del" side="bottom">
            <button
              type="button"
              onClick={deleteSelectedClip}
              aria-label="Delete Clip"
              className="p-1.5 text-[#9BA3AB] hover:text-rose-400 hover:bg-white/[0.06] rounded-full transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
          {onCollapse && (
            <StudioTooltip label="Collapse Inspector Panel" side="bottom">
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Collapse Inspector Panel"
                className="p-1.5 ml-0.5 text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] rounded-full transition-colors"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </button>
            </StudioTooltip>
          )}
        </div>
      </div>

      {/* Inspector Pill Category Tabs */}
      <div className="px-2.5 py-1.5 border-b border-white/[0.06] bg-[#121419] flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
        {(
          [
            { id: 'basic', label: isText ? 'Text' : 'Transform' },
            { id: 'motion', label: 'Motion' },
            ...(isVisualMedia ? [{ id: 'color' as const, label: 'Color' }] : []),
            ...(selectedClip.type !== 'audio' ? [{ id: 'fx' as const, label: 'FX / Mask' }] : []),
            ...(hasAudio ? [{ id: 'audio' as const, label: 'Audio' }] : []),
          ] as { id: InspectorTab; label: string }[]
        ).map((tab) => {
          const active = effectiveTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors whitespace-nowrap shrink-0 ${
                active ? 'text-[#FAF9F6]' : 'text-[#8E96A0] hover:text-[#dce4e4]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="inspectorTabPill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 bg-[#252A34] ring-1 ring-white/[0.1] rounded-full"
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Animated Inspector Content */}
      <StudioScrollArea
        className="flex-1 min-h-0"
        resetKey={`${selectedClip.id}-${effectiveTab}`}
        ariaLabel="Clip inspector controls"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${selectedClip.id}-${effectiveTab}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
          >
            {effectiveTab === 'basic' && (
              <>
                <AccordionSection
                  title="Timing & Precision Trim"
                  icon={<Sliders className="w-3 h-3 text-[#b9c9d1]" />}
                  rightSlot={
                    <span className="font-mono text-[10px] text-[#6C7378]">
                      {selectedClip.type.toUpperCase()}
                    </span>
                  }
                >
                  <ScrubInput
                    label="Start Time"
                    value={selectedClip.startTime}
                    min={0}
                    max={7200}
                    step={0.05}
                    unit="s"
                    precision={2}
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(val) => patchClipDirect((c) => ({ ...c, startTime: val }))}
                  />
                  <ScrubInput
                    label="Duration"
                    value={selectedClip.duration}
                    min={0.2}
                    max={
                      Number.isFinite(selectedClip.mediaDuration)
                        ? Math.max(0.2, (selectedClip.mediaDuration - selectedClip.sourceIn) / selectedClip.speed)
                        : 1800
                    }
                    step={0.05}
                    unit="s"
                    precision={2}
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(val) =>
                      patchClipDirect((c) => ({
                        ...c,
                        duration: val,
                        sourceOut: c.sourceIn + val * c.speed,
                      }))
                    }
                  />

                  {Number.isFinite(selectedClip.mediaDuration) && (
                    <>
                      <ScrubInput
                        label="Trim In (Source)"
                        value={selectedClip.sourceIn}
                        min={0}
                        max={Math.max(0, selectedClip.mediaDuration - 0.2)}
                        step={0.05}
                        unit="s"
                        precision={2}
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => {
                            const safeIn = Math.max(0, Math.min(val, c.mediaDuration - 0.2));
                            const nextOut = Math.max(safeIn + 0.2, c.sourceOut);
                            return {
                              ...c,
                              sourceIn: safeIn,
                              sourceOut: nextOut,
                              duration: Number(((nextOut - safeIn) / c.speed).toFixed(3)),
                            };
                          })
                        }
                      />
                      <ScrubInput
                        label="Trim Out (Source)"
                        value={selectedClip.sourceOut}
                        min={selectedClip.sourceIn + 0.2}
                        max={selectedClip.mediaDuration}
                        step={0.05}
                        unit="s"
                        precision={2}
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => {
                            const safeOut = Math.max(c.sourceIn + 0.2, Math.min(val, c.mediaDuration));
                            return {
                              ...c,
                              sourceOut: safeOut,
                              duration: Number(((safeOut - c.sourceIn) / c.speed).toFixed(3)),
                            };
                          })
                        }
                      />
                    </>
                  )}

                  {selectedClip.type === 'video' && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({ ...c, reversed: !c.reversed }))
                        }
                        className={`py-1.5 px-2 rounded border text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
                          selectedClip.reversed
                            ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                            : 'bg-[#20232A] border-[#2A2E37] text-[#dce4e4]'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reverse {selectedClip.reversed ? 'ON' : 'OFF'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void freezeFrameAtPlayhead()}
                        className="py-1.5 px-2 bg-[#20232A] hover:bg-[#2A2E37] border border-[#2A2E37] rounded text-[11px] text-[#dce4e4] flex items-center justify-center gap-1"
                      >
                        <Camera className="w-3 h-3" />
                        Freeze Frame
                      </button>
                    </div>
                  )}
                </AccordionSection>

                {isText && selectedClip.text && (
                  <AccordionSection
                    title="Typography, Box & Subtitle Motion"
                    icon={<Type className="w-3 h-3 text-[#b9c9d1]" />}
                  >
                    <textarea
                      rows={2}
                      value={selectedClip.text.content}
                      onFocus={pushHistoryCheckpoint}
                      onChange={(e) =>
                        patchClipDirect((c) => ({
                          ...c,
                          name: e.target.value.split('\n')[0]?.slice(0, 24) || 'Text Layer',
                          text: c.text ? { ...c.text, content: e.target.value } : undefined,
                        }))
                      }
                      className="w-full p-2 bg-[#101114] border border-[#2A2E37] focus:border-[#516168] rounded text-xs text-[#FAF9F6] outline-none resize-none"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#A5ADAD] mb-1">Font</label>
                        <select
                          value={selectedClip.text.fontFamily}
                          onChange={(e) =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              text: c.text ? { ...c.text, fontFamily: e.target.value } : undefined,
                            }))
                          }
                          className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                        >
                          <option value="Inter">Inter</option>
                          <option value="JetBrains Mono">JetBrains Mono</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Impact">Impact</option>
                          <option value="Courier New">Courier New</option>
                          <option value="Arial">Arial</option>
                          <option value="Trebuchet MS">Trebuchet MS</option>
                          <option value="Times New Roman">Times New Roman</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#A5ADAD] mb-1">Weight</label>
                        <select
                          value={selectedClip.text.fontWeight}
                          onChange={(e) =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              text: c.text ? { ...c.text, fontWeight: Number(e.target.value) } : undefined,
                            }))
                          }
                          className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                        >
                          <option value={300}>Light 300</option>
                          <option value={400}>Regular 400</option>
                          <option value={500}>Medium 500</option>
                          <option value={600}>SemiBold 600</option>
                          <option value={700}>Bold 700</option>
                          <option value={800}>ExtraBold 800</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#A5ADAD]">Align & Text Color</span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center bg-[#20232A] border border-[#2A2E37] rounded p-0.5">
                          {(['left', 'center', 'right'] as const).map((al) => {
                            const Icon =
                              al === 'left' ? AlignLeft : al === 'center' ? AlignCenter : AlignRight;
                            return (
                              <button
                                key={al}
                                type="button"
                                onClick={() =>
                                  updateClip(selectedClip.id, (c) => ({
                                    ...c,
                                    text: c.text ? { ...c.text, align: al } : undefined,
                                  }))
                                }
                                className={`p-1 rounded ${
                                  selectedClip.text?.align === al
                                    ? 'bg-[#3A4950] text-[#FAF9F6]'
                                    : 'text-[#A5ADAD] hover:text-[#FAF9F6]'
                                }`}
                              >
                                <Icon className="w-3 h-3" />
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="color"
                          title="Text Color"
                          value={selectedClip.text.color}
                          onChange={(e) =>
                            patchClipDirect((c) => ({
                              ...c,
                              text: c.text ? { ...c.text, color: e.target.value } : undefined,
                            }))
                          }
                          className="w-7 h-7 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Typography Style Preset */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[#A5ADAD]">Typography Style</span>
                        {selectedClip.text.typographyStyle === 'gradient' && (
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-[#7B838D]">Gradient End</span>
                            <input
                              type="color"
                              title="Gradient End Color"
                              value={selectedClip.text.gradientColor || '#38BDF8'}
                              onChange={(e) =>
                                patchClipDirect((c) => ({
                                  ...c,
                                  text: c.text ? { ...c.text, gradientColor: e.target.value } : undefined,
                                }))
                              }
                              className="w-6 h-5 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                      <select
                        value={selectedClip.text.typographyStyle ?? 'clean'}
                        onChange={(e) =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            text: c.text
                              ? { ...c.text, typographyStyle: e.target.value as TextTypographyStyle }
                              : undefined,
                          }))
                        }
                        className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                      >
                        {TYPOGRAPHY_STYLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} — {opt.desc}
                          </option>
                        ))}
                      </select>
                    </div>

                    <ScrubInput
                      label="Font Size"
                      value={selectedClip.text.fontSize}
                      min={12}
                      max={240}
                      step={1}
                      unit="px"
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({
                          ...c,
                          text: c.text ? { ...c.text, fontSize: val } : undefined,
                        }))
                      }
                    />
                    <ScrubInput
                      label="Letter Spacing"
                      value={selectedClip.text.letterSpacing ?? 0}
                      min={-4}
                      max={24}
                      step={0.5}
                      unit="px"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({
                          ...c,
                          text: c.text ? { ...c.text, letterSpacing: val } : undefined,
                        }))
                      }
                    />
                    <ScrubInput
                      label="Line Height"
                      value={selectedClip.text.lineHeight ?? 1.24}
                      min={0.8}
                      max={2.5}
                      step={0.02}
                      unit="x"
                      precision={2}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({
                          ...c,
                          text: c.text ? { ...c.text, lineHeight: val } : undefined,
                        }))
                      }
                    />
                    <ScrubInput
                      label="Position X"
                      value={selectedClip.text.x}
                      min={0}
                      max={100}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({
                          ...c,
                          text: c.text ? { ...c.text, x: val } : undefined,
                        }))
                      }
                    />
                    <ScrubInput
                      label="Position Y"
                      value={selectedClip.text.y}
                      min={0}
                      max={100}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({
                          ...c,
                          text: c.text ? { ...c.text, y: val } : undefined,
                        }))
                      }
                    />

                    {/* Outline & Drop Shadow */}
                    <div className="pt-2 border-t border-[#2A2E37] space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-[#A5ADAD]">
                        <span>Outline & Shadow Colors</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            title="Outline Color"
                            value={selectedClip.text.outlineColor || '#000000'}
                            onChange={(e) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, outlineColor: e.target.value } : undefined,
                              }))
                            }
                            className="w-6 h-6 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                          />
                          <input
                            type="color"
                            title="Shadow Color"
                            value={selectedClip.text.shadowColor.startsWith('#') ? selectedClip.text.shadowColor : '#000000'}
                            onChange={(e) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, shadowColor: e.target.value } : undefined,
                              }))
                            }
                            className="w-6 h-6 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                          />
                        </div>
                      </div>
                      <ScrubInput
                        label="Outline Width"
                        value={selectedClip.text.outlineWidth}
                        min={0}
                        max={16}
                        step={0.5}
                        unit="px"
                        precision={1}
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => ({
                            ...c,
                            text: c.text ? { ...c.text, outlineWidth: val } : undefined,
                          }))
                        }
                      />
                      <ScrubInput
                        label="Shadow Blur"
                        value={selectedClip.text.shadowBlur}
                        min={0}
                        max={40}
                        step={1}
                        unit="px"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => ({
                            ...c,
                            text: c.text ? { ...c.text, shadowBlur: val } : undefined,
                          }))
                        }
                      />
                      <ScrubInput
                        label="Shadow Offset X"
                        value={selectedClip.text.shadowOffsetX ?? 0}
                        min={-30}
                        max={30}
                        step={1}
                        unit="px"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => ({
                            ...c,
                            text: c.text ? { ...c.text, shadowOffsetX: val } : undefined,
                          }))
                        }
                      />
                      <ScrubInput
                        label="Shadow Offset Y"
                        value={selectedClip.text.shadowOffsetY ?? 2}
                        min={-30}
                        max={30}
                        step={1}
                        unit="px"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => ({
                            ...c,
                            text: c.text ? { ...c.text, shadowOffsetY: val } : undefined,
                          }))
                        }
                      />
                    </div>

                    {/* Subtitle Background Box */}
                    <div className="pt-2 border-t border-[#2A2E37] space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#A5ADAD]">Backdrop Box</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateClip(selectedClip.id, (c) => ({
                                ...c,
                                text: c.text
                                  ? {
                                      ...c.text,
                                      backgroundColor:
                                        c.text.backgroundColor === 'transparent'
                                          ? 'rgba(16, 17, 20, 0.78)'
                                          : 'transparent',
                                    }
                                  : undefined,
                              }))
                            }
                            className={`px-2 py-0.5 rounded border text-[10px] ${
                              selectedClip.text.backgroundColor !== 'transparent'
                                ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                                : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                            }`}
                          >
                            {selectedClip.text.backgroundColor !== 'transparent' ? 'Box ON' : 'No Box'}
                          </button>
                          <input
                            type="color"
                            title="Box Fill Color"
                            value={
                              selectedClip.text.backgroundColor.startsWith('#')
                                ? selectedClip.text.backgroundColor
                                : '#101114'
                            }
                            onChange={(e) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, backgroundColor: e.target.value } : undefined,
                              }))
                            }
                            className="w-6 h-6 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                          />
                        </div>
                      </div>
                      {selectedClip.text.backgroundColor !== 'transparent' && (
                        <>
                          <ScrubInput
                            label="Box Pad X"
                            value={selectedClip.text.paddingX ?? 28}
                            min={0}
                            max={80}
                            step={1}
                            unit="px"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(val) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, paddingX: val } : undefined,
                              }))
                            }
                          />
                          <ScrubInput
                            label="Box Pad Y"
                            value={selectedClip.text.paddingY ?? 14}
                            min={0}
                            max={50}
                            step={1}
                            unit="px"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(val) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, paddingY: val } : undefined,
                              }))
                            }
                          />
                          <ScrubInput
                            label="Box Radius"
                            value={selectedClip.text.borderRadius ?? 8}
                            min={0}
                            max={40}
                            step={1}
                            unit="px"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(val) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, borderRadius: val } : undefined,
                              }))
                            }
                          />
                        </>
                      )}
                    </div>

                    {/* Subtitle Animation Settings */}
                    <div className="pt-2 border-t border-[#2A2E37] space-y-2">
                      <div>
                        <label className="block text-[10px] text-[#A5ADAD] mb-1">
                          Subtitle / Text Animation
                        </label>
                        <select
                          value={selectedClip.text.animation}
                          onChange={(e) =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              text: c.text
                                ? { ...c.text, animation: e.target.value as TextAnimation }
                                : undefined,
                            }))
                          }
                          className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                        >
                          {TEXT_ANIMATION_CATALOG.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[#A5ADAD] mb-1">Easing</label>
                          <select
                            value={selectedClip.text.animationEasing ?? 'ease-out'}
                            onChange={(e) =>
                              updateClip(selectedClip.id, (c) => ({
                                ...c,
                                text: c.text
                                  ? {
                                      ...c.text,
                                      animationEasing: e.target.value as TransitionEasing,
                                    }
                                  : undefined,
                              }))
                            }
                            className="w-full h-7 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                          >
                            {EASING_OPTIONS.map((eo) => (
                              <option key={eo.value} value={eo.value}>
                                {eo.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <span className="text-[10px] text-[#A5ADAD] pb-1.5">Word Accent</span>
                          <input
                            type="color"
                            title="Karaoke / Word-Pop Highlight Color"
                            value={selectedClip.text.highlightColor || '#b9c9d1'}
                            onChange={(e) =>
                              patchClipDirect((c) => ({
                                ...c,
                                text: c.text ? { ...c.text, highlightColor: e.target.value } : undefined,
                              }))
                            }
                            className="w-7 h-7 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <ScrubInput
                        label="Anim Duration"
                        value={selectedClip.text.animationDuration}
                        min={0.05}
                        max={3.0}
                        step={0.05}
                        unit="s"
                        precision={2}
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => ({
                            ...c,
                            text: c.text ? { ...c.text, animationDuration: val } : undefined,
                          }))
                        }
                      />

                      <button
                        type="button"
                        onClick={() => applyTextStyleToAllSubtitles(selectedClip.text!)}
                        className="w-full py-1.5 bg-[#20232A] hover:bg-[#2A2E37] border border-[#343A46] rounded text-[10px] font-medium text-[#b9c9d1] hover:text-[#FAF9F6] transition-colors"
                      >
                        Apply Style & Animation to All Subtitles
                      </button>

                      {/* Word-Level Timing Editor & Speech Audition */}
                      {(selectedClip.text.animation === 'karaoke' ||
                        selectedClip.text.animation === 'word-pop' ||
                        selectedClip.text.animation === 'word-by-word') && (
                        <div className="pt-2 border-t border-[#2A2E37] space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium text-[#dce4e4]">
                              Word-Level Timing
                            </span>
                            <div className="flex items-center gap-1">
                              {isSpeechSynthesisSupported() && (
                                <button
                                  type="button"
                                  onClick={() => speakCaptionText(selectedClip.text?.content || '')}
                                  title="Listen to cue with Web Speech Synthesis"
                                  className="px-1.5 py-0.5 rounded bg-[#20232A] hover:bg-[#2A2E37] border border-[#2A2E37] text-[9px] text-[#7DD3FC]"
                                >
                                  Speak
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const timings = generateWordTimingsForText(
                                    selectedClip.text?.content || '',
                                    selectedClip.duration
                                  );
                                  updateClip(selectedClip.id, (c) => ({
                                    ...c,
                                    text: c.text ? { ...c.text, wordTimings: timings } : undefined,
                                  }));
                                }}
                                className="px-1.5 py-0.5 rounded bg-[#20232A] hover:bg-[#2A2E37] border border-[#2A2E37] text-[9px] text-[#FAF9F6]"
                              >
                                Auto Sync
                              </button>
                            </div>
                          </div>

                          {selectedClip.text.wordTimings &&
                          selectedClip.text.wordTimings.length > 0 ? (
                            <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                              {selectedClip.text.wordTimings.map((wt, wIdx) => (
                                <div
                                  key={`${wIdx}-${wt.word}`}
                                  className="grid grid-cols-[1fr_52px_52px] gap-1 items-center text-[10px]"
                                >
                                  <span className="truncate text-[#dce4e4]">{wt.word}</span>
                                  <input
                                    type="number"
                                    step={0.05}
                                    min={0}
                                    max={selectedClip.duration}
                                    value={wt.startOffset}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      patchClipDirect((c) => {
                                        if (!c.text?.wordTimings) return c;
                                        const next = c.text.wordTimings.map((item, idx) =>
                                          idx === wIdx ? { ...item, startOffset: val } : item
                                        );
                                        return { ...c, text: { ...c.text, wordTimings: next } };
                                      });
                                    }}
                                    className="h-5 px-1 bg-[#101114] border border-[#2A2E37] rounded font-mono text-[9px] text-right text-[#FAF9F6]"
                                  />
                                  <input
                                    type="number"
                                    step={0.05}
                                    min={0}
                                    max={selectedClip.duration}
                                    value={wt.endOffset}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      patchClipDirect((c) => {
                                        if (!c.text?.wordTimings) return c;
                                        const next = c.text.wordTimings.map((item, idx) =>
                                          idx === wIdx ? { ...item, endOffset: val } : item
                                        );
                                        return { ...c, text: { ...c.text, wordTimings: next } };
                                      });
                                    }}
                                    className="h-5 px-1 bg-[#101114] border border-[#2A2E37] rounded font-mono text-[9px] text-right text-[#FAF9F6]"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-[#7B838D]">
                              Using proportional timing. Click Auto Sync to edit per-word timestamps.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </AccordionSection>
                )}

                {isSticker && selectedClip.sticker && (
                  <AccordionSection title="Overlay Graphic">
                    <div>
                      <label className="block text-[10px] text-[#A5ADAD] mb-1">Label Text</label>
                      <input
                        type="text"
                        value={selectedClip.sticker.label}
                        onFocus={pushHistoryCheckpoint}
                        onChange={(e) =>
                          patchClipDirect((c) => ({
                            ...c,
                            sticker: c.sticker ? { ...c.sticker, label: e.target.value } : undefined,
                          }))
                        }
                        className="w-full h-7 px-2 bg-[#101114] border border-[#2A2E37] rounded text-xs text-[#FAF9F6] outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#A5ADAD]">Stroke & Accent</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedClip.sticker.color}
                          onChange={(e) =>
                            patchClipDirect((c) => ({
                              ...c,
                              sticker: c.sticker ? { ...c.sticker, color: e.target.value } : undefined,
                            }))
                          }
                          className="w-7 h-7 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                        />
                        <input
                          type="color"
                          value={selectedClip.sticker.accentColor}
                          onChange={(e) =>
                            patchClipDirect((c) => ({
                              ...c,
                              sticker: c.sticker
                                ? { ...c.sticker, accentColor: e.target.value }
                                : undefined,
                            }))
                          }
                          className="w-7 h-7 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  </AccordionSection>
                )}

                {!isAudioOnly && (
                  <AccordionSection
                    title="Transform & Compositing"
                    rightSlot={
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            transform: { ...DEFAULT_TRANSFORM },
                          }))
                        }
                        className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6] flex items-center gap-1"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Reset
                      </button>
                    }
                  >
                    {!isText && (
                      <>
                        <ScrubInput
                          label="Position X"
                          value={selectedClip.transform.x}
                          min={-200}
                          max={200}
                          step={0.5}
                          unit="%"
                          precision={1}
                          onStartScrub={pushHistoryCheckpoint}
                          onChange={(val) =>
                            patchClipDirect((c) => ({ ...c, transform: { ...c.transform, x: val } }))
                          }
                        />
                        <ScrubInput
                          label="Position Y"
                          value={selectedClip.transform.y}
                          min={-200}
                          max={200}
                          step={0.5}
                          unit="%"
                          precision={1}
                          onStartScrub={pushHistoryCheckpoint}
                          onChange={(val) =>
                            patchClipDirect((c) => ({ ...c, transform: { ...c.transform, y: val } }))
                          }
                        />
                      </>
                    )}
                    <ScrubInput
                      label="Scale"
                      value={selectedClip.transform.scale}
                      min={5}
                      max={500}
                      step={1}
                      unit="%"
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, transform: { ...c.transform, scale: val } }))
                      }
                    />
                    <ScrubInput
                      label="Rotation"
                      value={selectedClip.transform.rotation}
                      min={-180}
                      max={180}
                      step={1}
                      unit="°"
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, transform: { ...c.transform, rotation: val } }))
                      }
                    />
                    <ScrubInput
                      label="Opacity"
                      value={selectedClip.transform.opacity}
                      min={0}
                      max={100}
                      step={1}
                      unit="%"
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, transform: { ...c.transform, opacity: val } }))
                      }
                    />

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            transform: { ...c.transform, flipH: !c.transform.flipH },
                          }))
                        }
                        className={`py-1 rounded border text-[10px] flex items-center justify-center gap-1 ${
                          selectedClip.transform.flipH
                            ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                            : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                        }`}
                      >
                        <FlipHorizontal className="w-3 h-3" /> Flip H
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            transform: { ...c.transform, flipV: !c.transform.flipV },
                          }))
                        }
                        className={`py-1 rounded border text-[10px] flex items-center justify-center gap-1 ${
                          selectedClip.transform.flipV
                            ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                            : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                        }`}
                      >
                        <FlipVertical className="w-3 h-3" /> Flip V
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            transform: {
                              ...c.transform,
                              rotation: ((c.transform.rotation + 90 + 180) % 360) - 180,
                            },
                          }))
                        }
                        className="py-1 bg-[#20232A] hover:bg-[#2A2E37] border border-[#2A2E37] rounded text-[10px] text-[#dce4e4] flex items-center justify-center gap-1"
                      >
                        <RotateCw className="w-3 h-3" /> +90°
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-[#A5ADAD]">Blend Mode</span>
                      <select
                        value={selectedClip.blendMode}
                        onChange={(e) =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            blendMode: e.target.value as BlendMode,
                          }))
                        }
                        className="w-32 h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                      >
                        {BLEND_MODES.map((bm) => (
                          <option key={bm.value} value={bm.value}>
                            {bm.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </AccordionSection>
                )}

                {isVisualMedia && (
                  <AccordionSection
                    title="Source Crop"
                    defaultOpen={false}
                    rightSlot={
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({ ...c, crop: { ...DEFAULT_CROP } }))
                        }
                        className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6] flex items-center gap-1"
                      >
                        <RotateCcw className="w-2.5 h-2.5" /> Reset
                      </button>
                    }
                  >
                    <ScrubInput
                      label="Crop Top"
                      value={selectedClip.crop.top}
                      min={0}
                      max={48}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, crop: { ...c.crop, top: val } }))
                      }
                    />
                    <ScrubInput
                      label="Crop Bottom"
                      value={selectedClip.crop.bottom}
                      min={0}
                      max={48}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, crop: { ...c.crop, bottom: val } }))
                      }
                    />
                    <ScrubInput
                      label="Crop Left"
                      value={selectedClip.crop.left}
                      min={0}
                      max={48}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, crop: { ...c.crop, left: val } }))
                      }
                    />
                    <ScrubInput
                      label="Crop Right"
                      value={selectedClip.crop.right}
                      min={0}
                      max={48}
                      step={0.5}
                      unit="%"
                      precision={1}
                      onStartScrub={pushHistoryCheckpoint}
                      onChange={(val) =>
                        patchClipDirect((c) => ({ ...c, crop: { ...c.crop, right: val } }))
                      }
                    />
                  </AccordionSection>
                )}

                {!isAudioOnly && (
                  <AccordionSection
                    title="Clip Transitions (26 FX)"
                    icon={<Sparkles className="w-3 h-3 text-[#b9c9d1]" />}
                  >
                    {/* In Edge Controls */}
                    <div className="p-2 bg-[#14161B] border border-[#2A2E37] rounded space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#FAF9F6]">Transition IN</span>
                        <select
                          value={selectedClip.transitionIn.type}
                          onChange={(e) =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              transitionIn: {
                                ...c.transitionIn,
                                type: e.target.value as TransitionType,
                              },
                            }))
                          }
                          className="w-36 h-6 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                        >
                          <option value="none">None</option>
                          {TRANSITION_CATALOG.map((opt) => (
                            <option key={opt.type} value={opt.type}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedClip.transitionIn.type !== 'none' && (
                        <>
                          <ScrubInput
                            label="In Duration"
                            value={selectedClip.transitionIn.duration}
                            min={0.05}
                            max={Math.max(0.5, selectedClip.duration / 2)}
                            step={0.05}
                            unit="s"
                            precision={2}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({
                                ...c,
                                transitionIn: { ...c.transitionIn, duration: v },
                              }))
                            }
                          />
                          <ScrubInput
                            label="In Intensity"
                            value={Math.round((selectedClip.transitionIn.intensity ?? 1) * 100)}
                            min={20}
                            max={200}
                            step={5}
                            unit="%"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({
                                ...c,
                                transitionIn: { ...c.transitionIn, intensity: v / 100 },
                              }))
                            }
                          />
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#A5ADAD]">In Easing</span>
                            <select
                              value={selectedClip.transitionIn.easing ?? 'ease-in-out'}
                              onChange={(e) =>
                                updateClip(selectedClip.id, (c) => ({
                                  ...c,
                                  transitionIn: {
                                    ...c.transitionIn,
                                    easing: e.target.value as TransitionEasing,
                                  },
                                }))
                              }
                              className="w-28 h-6 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                            >
                              {EASING_OPTIONS.map((eo) => (
                                <option key={eo.value} value={eo.value}>
                                  {eo.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Out Edge Controls */}
                    <div className="p-2 bg-[#14161B] border border-[#2A2E37] rounded space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-[#FAF9F6]">Transition OUT</span>
                        <select
                          value={selectedClip.transitionOut.type}
                          onChange={(e) =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              transitionOut: {
                                ...c.transitionOut,
                                type: e.target.value as TransitionType,
                              },
                            }))
                          }
                          className="w-36 h-6 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                        >
                          <option value="none">None</option>
                          {TRANSITION_CATALOG.map((opt) => (
                            <option key={opt.type} value={opt.type}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {selectedClip.transitionOut.type !== 'none' && (
                        <>
                          <ScrubInput
                            label="Out Duration"
                            value={selectedClip.transitionOut.duration}
                            min={0.05}
                            max={Math.max(0.5, selectedClip.duration / 2)}
                            step={0.05}
                            unit="s"
                            precision={2}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({
                                ...c,
                                transitionOut: { ...c.transitionOut, duration: v },
                              }))
                            }
                          />
                          <ScrubInput
                            label="Out Intensity"
                            value={Math.round((selectedClip.transitionOut.intensity ?? 1) * 100)}
                            min={20}
                            max={200}
                            step={5}
                            unit="%"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({
                                ...c,
                                transitionOut: { ...c.transitionOut, intensity: v / 100 },
                              }))
                            }
                          />
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-[#A5ADAD]">Out Easing</span>
                            <select
                              value={selectedClip.transitionOut.easing ?? 'ease-in-out'}
                              onChange={(e) =>
                                updateClip(selectedClip.id, (c) => ({
                                  ...c,
                                  transitionOut: {
                                    ...c.transitionOut,
                                    easing: e.target.value as TransitionEasing,
                                  },
                                }))
                              }
                              className="w-28 h-6 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                            >
                              {EASING_OPTIONS.map((eo) => (
                                <option key={eo.value} value={eo.value}>
                                  {eo.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </AccordionSection>
                )}
              </>
            )}

            {effectiveTab === 'motion' && (
              <>
                <AccordionSection
                  title="Speed & Speed Ramping"
                  icon={<Gauge className="w-3 h-3 text-[#b9c9d1]" />}
                >
                  {selectedClip.type === 'video' || selectedClip.type === 'audio' ? (
                    <>
                      <ScrubInput
                        label="Base Speed"
                        value={selectedClip.speed}
                        min={0.1}
                        max={8}
                        step={0.05}
                        unit="x"
                        precision={2}
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(val) =>
                          patchClipDirect((c) => {
                            const maxMediaAvail = Number.isFinite(c.mediaDuration)
                              ? c.mediaDuration - c.sourceIn
                              : c.duration * val;
                            const nextDur = Number.isFinite(c.mediaDuration)
                              ? Math.max(0.2, Math.min(c.duration, maxMediaAvail / val))
                              : c.duration;
                            return { ...c, speed: val, duration: nextDur };
                          })
                        }
                      />

                      <div>
                        <label className="block text-[10px] text-[#A5ADAD] mb-1">Speed Curve</label>
                        <select
                          value={selectedClip.speedCurve.preset}
                          onChange={(e) => {
                            const next = getSpeedPresetValues(e.target.value as SpeedCurvePreset);
                            updateClip(selectedClip.id, (c) => ({ ...c, speedCurve: next }));
                          }}
                          className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                        >
                          {SPEED_CURVES.map((sc) => (
                            <option key={sc.value} value={sc.value}>
                              {sc.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <ScrubInput
                          label="Start Multiplier"
                          value={selectedClip.speedCurve.startSpeed}
                          min={0.1}
                          max={8}
                          step={0.05}
                          unit="x"
                          precision={2}
                          onStartScrub={pushHistoryCheckpoint}
                          onChange={(v) =>
                            patchClipDirect((c) => ({
                              ...c,
                              speedCurve: { ...c.speedCurve, startSpeed: v },
                            }))
                          }
                        />
                        <ScrubInput
                          label="Mid Multiplier"
                          value={selectedClip.speedCurve.midSpeed}
                          min={0.1}
                          max={8}
                          step={0.05}
                          unit="x"
                          precision={2}
                          onStartScrub={pushHistoryCheckpoint}
                          onChange={(v) =>
                            patchClipDirect((c) => ({
                              ...c,
                              speedCurve: { ...c.speedCurve, midSpeed: v },
                            }))
                          }
                        />
                        <ScrubInput
                          label="End Multiplier"
                          value={selectedClip.speedCurve.endSpeed}
                          min={0.1}
                          max={8}
                          step={0.05}
                          unit="x"
                          precision={2}
                          onStartScrub={pushHistoryCheckpoint}
                          onChange={(v) =>
                            patchClipDirect((c) => ({
                              ...c,
                              speedCurve: { ...c.speedCurve, endSpeed: v },
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-[#A5ADAD]">
                      Speed controls apply to video and audio clips.
                    </p>
                  )}
                </AccordionSection>

                {!isAudioOnly && (
                  <AccordionSection
                    title="Interactive Keyframes"
                    icon={<Diamond className="w-3 h-3 text-[#b9c9d1]" />}
                    rightSlot={
                      <button
                        type="button"
                        onClick={handleAddKeyframe}
                        className="px-2 py-0.5 bg-[#3A4950] hover:bg-[#516168] text-[#FAF9F6] text-[10px] font-medium rounded flex items-center gap-1"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        Add
                      </button>
                    }
                  >
                    <p className="text-[10px] text-[#A5ADAD] leading-relaxed">
                      Click any keyframe below to edit its exact time, X, Y, scale, rotation, opacity, and easing curve.
                    </p>

                    {selectedClip.keyframes.length === 0 ? (
                      <div className="p-2 bg-[#101114] border border-[#2A2E37] rounded text-[10px] text-[#6C7378] text-center">
                        No keyframes on this clip
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                        {selectedClip.keyframes.map((kf) => {
                          const expanded = selectedKfId === kf.id;
                          return (
                            <div
                              key={kf.id}
                              className={`bg-[#20232A] border rounded transition-colors ${
                                expanded ? 'border-[#b9c9d1]/50' : 'border-[#2A2E37]'
                              }`}
                            >
                              <div className="p-1.5 flex items-center justify-between gap-2 text-[10px]">
                                <button
                                  type="button"
                                  onClick={() => setSelectedKfId(expanded ? null : kf.id)}
                                  className="flex-1 text-left font-mono tabular-nums text-[#FAF9F6] hover:text-[#b9c9d1] truncate"
                                >
                                  {kf.time.toFixed(2)}s · ({kf.x.toFixed(0)},{kf.y.toFixed(0)}) · {kf.scale}%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPlayhead(selectedClip.startTime + kf.time)}
                                  className="px-1 py-0.5 bg-[#16181D] border border-[#343A46] rounded text-[9px] text-[#b9c9d1] hover:text-[#FAF9F6]"
                                  title="Jump playhead to keyframe"
                                >
                                  Go
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateClip(selectedClip.id, (c) => ({
                                      ...c,
                                      keyframes: c.keyframes.filter((item) => item.id !== kf.id),
                                    }))
                                  }
                                  className="p-0.5 text-[#A5ADAD] hover:text-[#ffb4ab]"
                                  title="Delete Keyframe"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              <AnimatePresence initial={false}>
                                {expanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.14 }}
                                    className="overflow-hidden border-t border-[#2A2E37]"
                                  >
                                    <div className="p-2 bg-[#14161B] space-y-1.5">
                                      <ScrubInput
                                        label="Time"
                                        value={kf.time}
                                        min={0}
                                        max={selectedClip.duration}
                                        step={0.05}
                                        unit="s"
                                        precision={2}
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { time: v })}
                                      />
                                      <ScrubInput
                                        label="X"
                                        value={kf.x}
                                        min={-200}
                                        max={200}
                                        step={0.5}
                                        unit="%"
                                        precision={1}
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { x: v })}
                                      />
                                      <ScrubInput
                                        label="Y"
                                        value={kf.y}
                                        min={-200}
                                        max={200}
                                        step={0.5}
                                        unit="%"
                                        precision={1}
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { y: v })}
                                      />
                                      <ScrubInput
                                        label="Scale"
                                        value={kf.scale}
                                        min={5}
                                        max={500}
                                        step={1}
                                        unit="%"
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { scale: v })}
                                      />
                                      <ScrubInput
                                        label="Rotation"
                                        value={kf.rotation}
                                        min={-180}
                                        max={180}
                                        step={1}
                                        unit="°"
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { rotation: v })}
                                      />
                                      <ScrubInput
                                        label="Opacity"
                                        value={kf.opacity}
                                        min={0}
                                        max={100}
                                        step={1}
                                        unit="%"
                                        onStartScrub={pushHistoryCheckpoint}
                                        onChange={(v) => handleUpdateKeyframe(kf.id, { opacity: v })}
                                      />
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-[#A5ADAD]">Easing</span>
                                        <select
                                          value={kf.easing}
                                          onChange={(e) =>
                                            handleUpdateKeyframe(
                                              kf.id,
                                              { easing: e.target.value as Keyframe['easing'] },
                                              true
                                            )
                                          }
                                          className="w-28 h-6 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                                        >
                                          <option value="ease-in-out">Ease In-Out</option>
                                          <option value="ease-out">Ease Out</option>
                                          <option value="linear">Linear</option>
                                        </select>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </AccordionSection>
                )}

                {selectedClip.type === 'video' && (
                  <>
                    <AccordionSection
                      title="Motion Tracking"
                      icon={<Crosshair className="w-3 h-3 text-[#b9c9d1]" />}
                      defaultOpen={false}
                    >
                      <p className="text-[10px] text-[#A5ADAD] leading-relaxed">
                        Pick a target on the monitor or dial ROI coordinates manually, then track keyframes onto any Text/Sticker.
                      </p>
                      <ScrubInput
                        label="Target ROI X"
                        value={roiX}
                        min={5}
                        max={95}
                        step={0.5}
                        unit="%"
                        precision={1}
                        onChange={(x) => setLastPickedRoi({ x, y: roiY })}
                      />
                      <ScrubInput
                        label="Target ROI Y"
                        value={roiY}
                        min={5}
                        max={95}
                        step={0.5}
                        unit="%"
                        precision={1}
                        onChange={(y) => setLastPickedRoi({ x: roiX, y })}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsPickingTrackTarget(!isPickingTrackTarget)}
                          className={`py-1.5 px-2 rounded border text-[10px] font-medium ${
                            isPickingTrackTarget
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                              : 'bg-[#20232A] border-[#343A46] text-[#dce4e4]'
                          }`}
                        >
                          {isPickingTrackTarget ? 'Click Monitor...' : 'Pick on Monitor'}
                        </button>
                        <select
                          value={trackTargetClipId || overlayClipsForTracking[0]?.id || ''}
                          onChange={(e) => setTrackTargetClipId(e.target.value)}
                          className="h-7 px-1.5 bg-[#20232A] border border-[#2A2E37] rounded text-[10px] text-[#FAF9F6] outline-none"
                        >
                          {overlayClipsForTracking.length === 0 ? (
                            <option value="">No Text/Sticker</option>
                          ) : (
                            overlayClipsForTracking.map((oc) => (
                              <option key={oc.id} value={oc.id}>
                                {oc.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={trackingPct !== null || overlayClipsForTracking.length === 0}
                        onClick={() => void handleRunMotionTrack()}
                        className="w-full py-1.5 bg-[#3A4950] hover:bg-[#516168] disabled:opacity-45 text-[#FAF9F6] text-[11px] font-medium rounded"
                      >
                        {trackingPct !== null ? `Tracking Motion (${trackingPct}%)...` : 'Track Motion'}
                      </button>
                    </AccordionSection>

                    <AccordionSection
                      title="Video Stabilization"
                      defaultOpen={false}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              stabilization: {
                                ...c.stabilization,
                                enabled: !c.stabilization.enabled,
                              },
                            }))
                          }
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            selectedClip.stabilization.enabled
                              ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                              : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                          }`}
                        >
                          {selectedClip.stabilization.enabled ? 'Active' : 'Off'}
                        </button>
                      }
                    >
                      <button
                        type="button"
                        disabled={stabPct !== null}
                        onClick={() => void handleAnalyzeStabilization()}
                        className="w-full py-1.5 bg-[#20232A] hover:bg-[#2A2E37] border border-[#343A46] text-[#dce4e4] text-[11px] font-medium rounded"
                      >
                        {stabPct !== null
                          ? `Analyzing Shake (${stabPct}%)...`
                          : selectedClip.stabilization.offsets.length > 0
                          ? 'Re-Analyze Camera Shake'
                          : 'Analyze & Stabilize Shake'}
                      </button>

                      <ScrubInput
                        label="Smoothing"
                        value={selectedClip.stabilization.strength}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            stabilization: { ...c.stabilization, strength: v },
                          }))
                        }
                      />
                      <ScrubInput
                        label="Auto-Crop Scale"
                        value={selectedClip.stabilization.autoScale}
                        min={100}
                        max={140}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            stabilization: { ...c.stabilization, autoScale: v },
                          }))
                        }
                      />
                    </AccordionSection>
                  </>
                )}
              </>
            )}

            {effectiveTab === 'color' && isVisualMedia && (
              <AccordionSection
                title="Color, HSL & Tone Curves"
                icon={<Palette className="w-3 h-3 text-[#b9c9d1]" />}
                rightSlot={
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, (c) => ({
                        ...c,
                        color: { ...DEFAULT_COLOR },
                        appliedFilter: undefined,
                      }))
                    }
                    className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6] flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Reset
                  </button>
                }
              >
                {selectedClip.appliedFilter && (
                  <div className="p-2 bg-[#101114] border border-[#38BDF8]/30 rounded space-y-1.5 mb-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-medium text-[#7DD3FC]">
                        Filter: {selectedClip.appliedFilter.name}
                      </span>
                      <span className="font-mono tabular-nums text-[#FAF9F6]">
                        {Math.round(selectedClip.appliedFilter.intensity)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={selectedClip.appliedFilter.intensity}
                      onMouseDown={pushHistoryCheckpoint}
                      onChange={(e) => {
                        const pct = parseInt(e.target.value, 10);
                        const allFilters = [...FILTER_CATALOG, ...loadCustomFilterPresets()];
                        const preset = allFilters.find((f) => f.id === selectedClip.appliedFilter?.id);
                        if (!preset) return;
                        const blended = blendColorWithIntensity(preset.color, pct);
                        patchClipDirect((c) => ({
                          ...c,
                          color: blended,
                          appliedFilter: c.appliedFilter ? { ...c.appliedFilter, intensity: pct } : undefined,
                        }));
                      }}
                      className="w-full studio-slider"
                    />
                  </div>
                )}
                <div className="p-2 bg-[#101114] border border-[#2A2E37] rounded">
                  <svg viewBox="0 0 100 100" className="w-full h-24 overflow-visible">
                    <line x1="0" y1="100" x2="100" y2="0" stroke="#2A2E37" strokeWidth="1" strokeDasharray="3 3" />
                    <path
                      d={`M 0 ${Math.max(5, Math.min(98, 100 - selectedClip.color.curveShadows * 0.6))} Q 25 ${cSh}, 50 ${cMid} T 100 ${Math.max(2, Math.min(95, 0 - selectedClip.color.curveHighlights * 0.6))}`}
                      fill="none"
                      stroke="#b9c9d1"
                      strokeWidth="2"
                    />
                  </svg>
                </div>

                <ScrubInput
                  label="Shadows Curve"
                  value={selectedClip.color.curveShadows}
                  min={-50}
                  max={50}
                  step={1}
                  onStartScrub={pushHistoryCheckpoint}
                  onChange={(v) =>
                    patchClipDirect((c) => ({ ...c, color: { ...c.color, curveShadows: v } }))
                  }
                />
                <ScrubInput
                  label="Midtones Curve"
                  value={selectedClip.color.curveMidtones}
                  min={-50}
                  max={50}
                  step={1}
                  onStartScrub={pushHistoryCheckpoint}
                  onChange={(v) =>
                    patchClipDirect((c) => ({ ...c, color: { ...c.color, curveMidtones: v } }))
                  }
                />
                <ScrubInput
                  label="Highlights Curve"
                  value={selectedClip.color.curveHighlights}
                  min={-50}
                  max={50}
                  step={1}
                  onStartScrub={pushHistoryCheckpoint}
                  onChange={(v) =>
                    patchClipDirect((c) => ({ ...c, color: { ...c.color, curveHighlights: v } }))
                  }
                />

                <div className="pt-2 border-t border-[#2A2E37] space-y-2">
                  <ScrubInput
                    label="Brightness"
                    value={selectedClip.color.brightness}
                    min={20}
                    max={200}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, brightness: v } }))
                    }
                  />
                  <ScrubInput
                    label="Contrast"
                    value={selectedClip.color.contrast}
                    min={20}
                    max={200}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, contrast: v } }))
                    }
                  />
                  <ScrubInput
                    label="Saturation"
                    value={selectedClip.color.saturation}
                    min={0}
                    max={200}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, saturation: v } }))
                    }
                  />
                  <ScrubInput
                    label="HSL Hue Shift"
                    value={selectedClip.color.hueRotate}
                    min={-180}
                    max={180}
                    step={1}
                    unit="°"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, hueRotate: v } }))
                    }
                  />
                  <ScrubInput
                    label="Temperature"
                    value={selectedClip.color.temperature}
                    min={-100}
                    max={100}
                    step={1}
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, temperature: v } }))
                    }
                  />
                  <ScrubInput
                    label="Grayscale"
                    value={selectedClip.color.grayscale}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, grayscale: v } }))
                    }
                  />
                  <ScrubInput
                    label="Sepia"
                    value={selectedClip.color.sepia}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, sepia: v } }))
                    }
                  />
                  <ScrubInput
                    label="Blur"
                    value={selectedClip.color.blur}
                    min={0}
                    max={20}
                    step={0.5}
                    unit="px"
                    precision={1}
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, blur: v } }))
                    }
                  />
                  <ScrubInput
                    label="Vignette"
                    value={selectedClip.color.vignette}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(v) =>
                      patchClipDirect((c) => ({ ...c, color: { ...c.color, vignette: v } }))
                    }
                  />
                </div>
              </AccordionSection>
            )}

            {effectiveTab === 'fx' && !isAudioOnly && (
              <>
                {isVisualMedia ? (
                  <>
                    <AccordionSection
                      title="Visual Effects"
                      icon={<Wand2 className="w-3 h-3 text-[#b9c9d1]" />}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              effects: { ...DEFAULT_EFFECTS },
                            }))
                          }
                          className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6]"
                        >
                          Reset
                        </button>
                      }
                    >
                      <ScrubInput
                        label="Film Grain"
                        value={selectedClip.effects.filmGrain}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({ ...c, effects: { ...c.effects, filmGrain: v } }))
                        }
                      />
                      <ScrubInput
                        label="Chromatic Split"
                        value={selectedClip.effects.chromaticAberration}
                        min={0}
                        max={30}
                        step={1}
                        unit="px"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            effects: { ...c.effects, chromaticAberration: v },
                          }))
                        }
                      />
                      <ScrubInput
                        label="Pixelate"
                        value={selectedClip.effects.pixelate}
                        min={0}
                        max={40}
                        step={1}
                        unit="px"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({ ...c, effects: { ...c.effects, pixelate: v } }))
                        }
                      />
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-[#A5ADAD]">Invert Colors</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              effects: { ...c.effects, invert: !c.effects.invert },
                            }))
                          }
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            selectedClip.effects.invert
                              ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                              : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                          }`}
                        >
                          {selectedClip.effects.invert ? 'Enabled' : 'Off'}
                        </button>
                      </div>
                    </AccordionSection>

                    {/* Stackable Video Effects Chain */}
                    <AccordionSection
                      title={`Effects Stack (${selectedClip.effectsStack?.length ?? 0})`}
                      icon={<Sparkles className="w-3 h-3 text-[#38BDF8]" />}
                      rightSlot={
                        (selectedClip.effectsStack?.length ?? 0) > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateClip(selectedClip.id, (c) => ({ ...c, effectsStack: [] }))
                            }
                            className="text-[10px] text-[#A5ADAD] hover:text-rose-300"
                          >
                            Clear
                          </button>
                        ) : undefined
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value as VideoEffectType;
                            if (!val) return;
                            const def = VIDEO_EFFECT_CATALOG.find((d) => d.type === val);
                            if (def) {
                              const item = createEffectItemFromDef(def);
                              updateClip(selectedClip.id, (c) => ({
                                ...c,
                                effectsStack: [...(c.effectsStack ?? []), item],
                              }));
                            }
                            e.target.value = '';
                          }}
                          className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                        >
                          <option value="">+ Add Effect to Stack...</option>
                          {VIDEO_EFFECT_CATALOG.map((def) => (
                            <option key={def.type} value={def.type}>
                              {def.category} · {def.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(selectedClip.effectsStack ?? []).length === 0 ? (
                        <p className="text-[10px] text-[#7B838D]">
                          Stack multiple effects from the dropdown above or the Effects tab. Order applies top-to-bottom.
                        </p>
                      ) : (
                        <div className="space-y-2 pt-1">
                          {(selectedClip.effectsStack ?? []).map((fx, idx, arr) => (
                            <div
                              key={fx.id}
                              className={`p-2 rounded border space-y-1.5 ${
                                fx.enabled
                                  ? 'bg-[#101114] border-[#2A2E37]'
                                  : 'bg-[#101114]/50 border-[#2A2E37]/50 opacity-65'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-medium text-[#FAF9F6] truncate">
                                  {idx + 1}. {fx.name}
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      updateClip(selectedClip.id, (c) => {
                                        const list = [...(c.effectsStack ?? [])];
                                        if (idx <= 0) return c;
                                        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
                                        return { ...c, effectsStack: list };
                                      })
                                    }
                                    title="Move Effect Up"
                                    className="p-1 text-[#8E96A0] hover:text-[#FAF9F6] disabled:opacity-25"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === arr.length - 1}
                                    onClick={() =>
                                      updateClip(selectedClip.id, (c) => {
                                        const list = [...(c.effectsStack ?? [])];
                                        if (idx >= list.length - 1) return c;
                                        [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
                                        return { ...c, effectsStack: list };
                                      })
                                    }
                                    title="Move Effect Down"
                                    className="p-1 text-[#8E96A0] hover:text-[#FAF9F6] disabled:opacity-25"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateClip(selectedClip.id, (c) => ({
                                        ...c,
                                        effectsStack: (c.effectsStack ?? []).map((item) =>
                                          item.id === fx.id ? { ...item, enabled: !item.enabled } : item
                                        ),
                                      }))
                                    }
                                    title={fx.enabled ? 'Disable Effect' : 'Enable Effect'}
                                    className="p-1 text-[#8E96A0] hover:text-[#38BDF8]"
                                  >
                                    {fx.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateClip(selectedClip.id, (c) => ({
                                        ...c,
                                        effectsStack: (c.effectsStack ?? []).filter((item) => item.id !== fx.id),
                                      }))
                                    }
                                    title="Remove Effect"
                                    className="p-1 text-[#8E96A0] hover:text-rose-400"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <ScrubInput
                                label="Intensity"
                                value={fx.intensity}
                                min={0}
                                max={100}
                                step={1}
                                unit="%"
                                onStartScrub={pushHistoryCheckpoint}
                                onChange={(val) =>
                                  patchClipDirect((c) => ({
                                    ...c,
                                    effectsStack: (c.effectsStack ?? []).map((item) =>
                                      item.id === fx.id ? { ...item, intensity: val } : item
                                    ),
                                  }))
                                }
                              />
                              <ScrubInput
                                label="Scale"
                                value={fx.scale}
                                min={20}
                                max={200}
                                step={2}
                                unit="%"
                                onStartScrub={pushHistoryCheckpoint}
                                onChange={(val) =>
                                  patchClipDirect((c) => ({
                                    ...c,
                                    effectsStack: (c.effectsStack ?? []).map((item) =>
                                      item.id === fx.id ? { ...item, scale: val } : item
                                    ),
                                  }))
                                }
                              />
                              <ScrubInput
                                label="Speed"
                                value={fx.speed}
                                min={0.2}
                                max={3.0}
                                step={0.1}
                                unit="x"
                                precision={1}
                                onStartScrub={pushHistoryCheckpoint}
                                onChange={(val) =>
                                  patchClipDirect((c) => ({
                                    ...c,
                                    effectsStack: (c.effectsStack ?? []).map((item) =>
                                      item.id === fx.id ? { ...item, speed: val } : item
                                    ),
                                  }))
                                }
                              />
                              <div className="flex items-center justify-between gap-2 pt-0.5">
                                <ScrubInput
                                  label="Angle"
                                  value={fx.angle}
                                  min={-180}
                                  max={180}
                                  step={1}
                                  unit="°"
                                  onStartScrub={pushHistoryCheckpoint}
                                  onChange={(val) =>
                                    patchClipDirect((c) => ({
                                      ...c,
                                      effectsStack: (c.effectsStack ?? []).map((item) =>
                                        item.id === fx.id ? { ...item, angle: val } : item
                                      ),
                                    }))
                                  }
                                />
                                <input
                                  type="color"
                                  title="Effect Tint"
                                  value={fx.tint || '#ffffff'}
                                  onChange={(e) =>
                                    patchClipDirect((c) => ({
                                      ...c,
                                      effectsStack: (c.effectsStack ?? []).map((item) =>
                                        item.id === fx.id ? { ...item, tint: e.target.value } : item
                                      ),
                                    }))
                                  }
                                  className="w-6 h-5 shrink-0 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionSection>

                    <AccordionSection
                      title="Chroma Key"
                      icon={<Layers className="w-3 h-3 text-[#b9c9d1]" />}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              chromaKey: {
                                ...c.chromaKey,
                                enabled: !c.chromaKey.enabled,
                              },
                            }))
                          }
                          className={`px-2 py-0.5 text-[10px] rounded border ${
                            selectedClip.chromaKey.enabled
                              ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                              : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                          }`}
                        >
                          {selectedClip.chromaKey.enabled ? 'Keyed' : 'Off'}
                        </button>
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#A5ADAD]">Key Color</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateClip(selectedClip.id, (c) => ({
                                ...c,
                                chromaKey: { ...c.chromaKey, enabled: true, color: '#00ff00' },
                              }))
                            }
                            className="w-5 h-5 rounded bg-[#00ff00] border border-[#343A46]"
                            title="Green Screen"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateClip(selectedClip.id, (c) => ({
                                ...c,
                                chromaKey: { ...c.chromaKey, enabled: true, color: '#0047ff' },
                              }))
                            }
                            className="w-5 h-5 rounded bg-[#0047ff] border border-[#343A46]"
                            title="Blue Screen"
                          />
                          <input
                            type="color"
                            value={selectedClip.chromaKey.color}
                            onChange={(e) =>
                              patchClipDirect((c) => ({
                                ...c,
                                chromaKey: { ...c.chromaKey, color: e.target.value },
                              }))
                            }
                            className="w-6 h-6 bg-transparent border border-[#2A2E37] rounded cursor-pointer"
                          />
                        </div>
                      </div>

                      <ScrubInput
                        label="Similarity"
                        value={selectedClip.chromaKey.similarity}
                        min={5}
                        max={95}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, similarity: v },
                          }))
                        }
                      />
                      <ScrubInput
                        label="Edge Feather"
                        value={selectedClip.chromaKey.smoothness}
                        min={0}
                        max={50}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, smoothness: v },
                          }))
                        }
                      />
                      <ScrubInput
                        label="Spill Suppression"
                        value={selectedClip.chromaKey.spillSuppression}
                        min={0}
                        max={100}
                        step={1}
                        unit="%"
                        onStartScrub={pushHistoryCheckpoint}
                        onChange={(v) =>
                          patchClipDirect((c) => ({
                            ...c,
                            chromaKey: { ...c.chromaKey, spillSuppression: v },
                          }))
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            chromaKey: { ...DEFAULT_CHROMA_KEY },
                          }))
                        }
                        className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6]"
                      >
                        Reset Chroma Key
                      </button>
                    </AccordionSection>

                    <AccordionSection
                      title="Shape Mask"
                      rightSlot={
                        <button
                          type="button"
                          onClick={() =>
                            updateClip(selectedClip.id, (c) => ({
                              ...c,
                              mask: { ...DEFAULT_MASK },
                            }))
                          }
                          className="text-[10px] text-[#A5ADAD] hover:text-[#FAF9F6]"
                        >
                          Reset
                        </button>
                      }
                    >
                      <select
                        value={selectedClip.mask.shape}
                        onChange={(e) =>
                          updateClip(selectedClip.id, (c) => ({
                            ...c,
                            mask: { ...c.mask, shape: e.target.value as MaskShape },
                          }))
                        }
                        className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                      >
                        {MASK_SHAPES.map((ms) => (
                          <option key={ms.value} value={ms.value}>
                            {ms.label}
                          </option>
                        ))}
                      </select>

                      {selectedClip.mask.shape !== 'none' && (
                        <>
                          <ScrubInput
                            label="Center X"
                            value={selectedClip.mask.x}
                            min={0}
                            max={100}
                            step={0.5}
                            unit="%"
                            precision={1}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, x: v } }))
                            }
                          />
                          <ScrubInput
                            label="Center Y"
                            value={selectedClip.mask.y}
                            min={0}
                            max={100}
                            step={0.5}
                            unit="%"
                            precision={1}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, y: v } }))
                            }
                          />
                          <ScrubInput
                            label="Width"
                            value={selectedClip.mask.width}
                            min={5}
                            max={100}
                            step={0.5}
                            unit="%"
                            precision={1}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, width: v } }))
                            }
                          />
                          <ScrubInput
                            label="Height"
                            value={selectedClip.mask.height}
                            min={5}
                            max={100}
                            step={0.5}
                            unit="%"
                            precision={1}
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, height: v } }))
                            }
                          />
                          <ScrubInput
                            label="Rotation"
                            value={selectedClip.mask.rotation ?? 0}
                            min={-180}
                            max={180}
                            step={1}
                            unit="°"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, rotation: v } }))
                            }
                          />
                          {selectedClip.mask.shape === 'rectangle' && (
                            <ScrubInput
                              label="Corner Radius"
                              value={selectedClip.mask.cornerRadius ?? 0}
                              min={0}
                              max={100}
                              step={1}
                              unit="px"
                              onStartScrub={pushHistoryCheckpoint}
                              onChange={(v) =>
                                patchClipDirect((c) => ({
                                  ...c,
                                  mask: { ...c.mask, cornerRadius: v },
                                }))
                              }
                            />
                          )}
                          <ScrubInput
                            label="Feather"
                            value={selectedClip.mask.feather}
                            min={0}
                            max={40}
                            step={1}
                            unit="px"
                            onStartScrub={pushHistoryCheckpoint}
                            onChange={(v) =>
                              patchClipDirect((c) => ({ ...c, mask: { ...c.mask, feather: v } }))
                            }
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-[#A5ADAD]">Invert Mask</span>
                            <button
                              type="button"
                              onClick={() =>
                                updateClip(selectedClip.id, (c) => ({
                                  ...c,
                                  mask: { ...c.mask, invert: !c.mask.invert },
                                }))
                              }
                              className={`px-2 py-0.5 text-[10px] rounded border ${
                                selectedClip.mask.invert
                                  ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                                  : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                              }`}
                            >
                              {selectedClip.mask.invert ? 'Inverted' : 'Normal'}
                            </button>
                          </div>
                        </>
                      )}
                    </AccordionSection>
                  </>
                ) : (
                  <div className="p-3 text-[11px] text-[#A5ADAD]">
                    Chroma Key, Pixel Effects, and Shape Masks apply to video and image clips. Use Transform or Blend Mode on text/sticker layers.
                  </div>
                )}
              </>
            )}

            {effectiveTab === 'audio' && hasAudio && (
              <AccordionSection
                title="Clip Audio & Custom DSP"
                icon={<Volume2 className="w-3 h-3 text-[#b9c9d1]" />}
                rightSlot={
                  <button
                    type="button"
                    onClick={() =>
                      updateClip(selectedClip.id, (c) => ({
                        ...c,
                        audio: { ...c.audio, muted: !c.audio.muted },
                      }))
                    }
                    className={`px-2 py-0.5 text-[10px] rounded border flex items-center gap-1 ${
                      selectedClip.audio.muted
                        ? 'bg-[#93000a] border-[#ffb4ab]/40 text-[#ffdad6]'
                        : 'bg-[#20232A] border-[#343A46] text-[#A5ADAD]'
                    }`}
                  >
                    {selectedClip.audio.muted ? (
                      <>
                        <VolumeX className="w-3 h-3" /> Muted
                      </>
                    ) : (
                      'Active'
                    )}
                  </button>
                }
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#A5ADAD]">Gain Level</span>
                    <span className="font-mono tabular-nums text-[#dce4e4]">
                      {gainToDb(selectedClip.audio.volume)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={1}
                    value={selectedClip.audio.volume}
                    onMouseDown={pushHistoryCheckpoint}
                    onChange={(e) =>
                      patchClipDirect((c) => ({
                        ...c,
                        audio: { ...c.audio, volume: parseInt(e.target.value, 10) },
                      }))
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <ScrubInput
                  label="Fade In"
                  value={selectedClip.audio.fadeIn}
                  min={0}
                  max={Math.min(10, selectedClip.duration / 2)}
                  step={0.1}
                  unit="s"
                  precision={1}
                  onStartScrub={pushHistoryCheckpoint}
                  onChange={(val) =>
                    patchClipDirect((c) => ({ ...c, audio: { ...c.audio, fadeIn: val } }))
                  }
                />
                <ScrubInput
                  label="Fade Out"
                  value={selectedClip.audio.fadeOut}
                  min={0}
                  max={Math.min(10, selectedClip.duration / 2)}
                  step={0.1}
                  unit="s"
                  precision={1}
                  onStartScrub={pushHistoryCheckpoint}
                  onChange={(val) =>
                    patchClipDirect((c) => ({ ...c, audio: { ...c.audio, fadeOut: val } }))
                  }
                />

                <div className="pt-2 border-t border-[#2A2E37] space-y-2">
                  <div>
                    <label className="block text-[10px] text-[#A5ADAD] mb-1">
                      Voice Changer Preset
                    </label>
                    <select
                      value={selectedClip.audio.voiceChanger}
                      onChange={(e) =>
                        updateClip(selectedClip.id, (c) => ({
                          ...c,
                          audio: {
                            ...c.audio,
                            voiceChanger: e.target.value as VoiceChangerPreset,
                          },
                        }))
                      }
                      className="w-full h-7 px-2 bg-[#20232A] border border-[#2A2E37] rounded text-[11px] text-[#FAF9F6] outline-none"
                    >
                      {VOICE_PRESETS.map((vp) => (
                        <option key={vp.value} value={vp.value}>
                          {vp.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <ScrubInput
                    label="Manual Pitch"
                    value={selectedClip.audio.customPitch ?? 1}
                    min={0.5}
                    max={2.0}
                    step={0.02}
                    unit="x"
                    precision={2}
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(val) =>
                      patchClipDirect((c) => ({
                        ...c,
                        audio: { ...c.audio, customPitch: val },
                      }))
                    }
                  />

                  <ScrubInput
                    label="Echo Mix"
                    value={selectedClip.audio.echoMix ?? 0}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(val) =>
                      patchClipDirect((c) => ({
                        ...c,
                        audio: { ...c.audio, echoMix: val },
                      }))
                    }
                  />

                  <ScrubInput
                    label="Noise Reduction"
                    value={selectedClip.audio.noiseReduction}
                    min={0}
                    max={100}
                    step={1}
                    unit="%"
                    onStartScrub={pushHistoryCheckpoint}
                    onChange={(val) =>
                      patchClipDirect((c) => ({
                        ...c,
                        audio: { ...c.audio, noiseReduction: val },
                      }))
                    }
                  />
                  <p className="text-[10px] text-[#6C7378] leading-snug">
                    Applies real-time high/low-pass rumble/hiss filtering, delay echo, pitch shift, and compression in preview & export.
                  </p>
                </div>
              </AccordionSection>
            )}
          </motion.div>
        </AnimatePresence>
      </StudioScrollArea>
    </aside>
  );
};
