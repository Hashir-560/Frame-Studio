import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Captions,
  Check,
  Download,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Grid2x2,
  Image as ImageIcon,
  Layers,
  List,
  ListPlus,
  Mic,
  Music,
  Palette,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  Square,
  Star,
  Sticker,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import { StudioScrollArea } from '../common/StudioScrollArea';
import { StudioTooltip } from '../common/StudioTooltip';
import {
  analyzeAndStoreMediaFile,
  generateProxyForAsset,
  generateTestMediaAsset,
} from '../../features/media-import/mediaAnalyzer';
import { audioEngine } from '../../features/audio-engine/audioEngine';
import {
  generateBuiltInAudioAsset,
  type SoundEffectKind,
} from '../../features/audio-engine/sfxGenerator';
import {
  detectSpeechSegmentsFromBlob,
  exportTextClipsToSrt,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  parseSrtContent,
  speakCaptionText,
  splitTranscriptIntoCaptions,
} from '../../features/captions/captionEngine';
import {
  FILTER_CATALOG,
  FILTER_COLLECTIONS,
  TEXT_AND_SUBTITLE_PRESETS,
  TYPOGRAPHY_STYLE_OPTIONS,
  VIDEO_EFFECT_CATALOG,
  VIDEO_EFFECT_CATEGORIES,
  blendColorWithIntensity,
  createEffectItemFromDef,
  loadCustomFilterPresets,
  loadFavoriteFilterIds,
  saveCustomFilterPresets,
  saveFavoriteFilterIds,
  type FilterLookDefinition,
  type VideoEffectDefinition,
} from '../../features/creative-library/creativeCatalog';
import { getMediaRecordById } from '../../services/db';
import { useEditorStore } from '../../stores/useEditorStore';
import {
  DEFAULT_COLOR,
  DEFAULT_EFFECTS,
  TEXT_ANIMATION_CATALOG,
  TRANSITION_CATALOG,
  type Clip,
  type ClipColorAdjustments,
  type ClipVisualEffects,
  type FilterCollection,
  type MediaAsset,
  type StickerKind,
  type TextAnimation,
  type TextTypographyStyle,
  type TransitionCategory,
  type TransitionEasing,
  type TransitionType,
  type VideoEffectCategory,
  type WorkspaceMode,
} from '../../types/editor';
import { createId } from '../../utils/id';
import { formatFileSize, formatShortDuration, gainToDb } from '../../utils/timecode';

type SortOrder = 'newest' | 'name' | 'duration' | 'size';
type EffectsSectionFilter = 'All' | VideoEffectCategory | 'Overlays';

const SIDEBAR_TABS: {
  id: Exclude<WorkspaceMode, 'edit'>;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { id: 'media', label: 'Media', icon: FolderOpen },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'color', label: 'Filters', icon: Palette },
  { id: 'transitions', label: 'Transitions', icon: Sparkles },
];

const STICKER_PRESETS: { name: string; kind: StickerKind; desc: string }[] = [
  { name: 'REC Frame', kind: 'rec-frame', desc: 'Viewfinder corners' },
  { name: 'Focus Reticle', kind: 'focus-reticle', desc: 'Tracking target' },
  { name: 'Arrow Callout', kind: 'arrow-right', desc: 'Direction pointer' },
  { name: 'Lower Plate', kind: 'lower-bar', desc: 'Studio banner' },
  { name: 'LIVE Badge', kind: 'badge-live', desc: 'Broadcast tag' },
  { name: 'Starburst', kind: 'star-burst', desc: 'Accent burst' },
  { name: 'Verified Mark', kind: 'check-badge', desc: 'Check badge' },
];

const QUICK_PIXEL_FX_PRESETS: {
  name: string;
  desc: string;
  previewTint: string;
  effects?: Partial<ClipVisualEffects>;
  color?: Partial<ClipColorAdjustments>;
}[] = [
  {
    name: 'Chromatic Split',
    desc: 'RGB prism edge shift',
    previewTint: 'from-rose-500/35 via-transparent to-cyan-400/35',
    effects: { chromaticAberration: 8 },
  },
  {
    name: '35mm Film Grain',
    desc: 'Organic analog texture',
    previewTint: 'from-amber-400/25 via-stone-500/20 to-zinc-800/40',
    effects: { filmGrain: 36 },
  },
  {
    name: 'Mosaic Pixelate',
    desc: '8-bit retro block FX',
    previewTint: 'from-emerald-400/25 via-sky-500/20 to-slate-800/40',
    effects: { pixelate: 10 },
  },
  {
    name: 'Negative Invert',
    desc: 'Film negative reversal',
    previewTint: 'from-fuchsia-400/30 via-indigo-500/20 to-amber-300/25',
    effects: { invert: true },
  },
];

const SFX_LIST: { kind: SoundEffectKind; label: string; desc: string; dur: string }[] = [
  { kind: 'whoosh', label: 'Whoosh Sweep', desc: 'Transition swoosh', dur: '1.4s' },
  { kind: 'sub-impact', label: 'Sub-Bass Impact', desc: 'Cinematic boom', dur: '1.8s' },
  { kind: 'ui-click', label: 'Precision Click', desc: 'Transient click', dur: '0.5s' },
  { kind: 'ambient-bed', label: 'Ambient Pad Bed', desc: 'Warm chord loop', dur: '8.0s' },
  { kind: 'lofi-pulse', label: 'Lo-Fi Pulse Beat', desc: 'Rhythmic music bed', dur: '8.0s' },
];

const TRANSITION_CATEGORIES: ('All' | TransitionCategory)[] = [
  'All',
  'Dissolve',
  'Slide',
  'Wipe',
  'Iris & Split',
  '3D & Spin',
  'Stylized',
];

const StickerPreviewSvg: React.FC<{ kind: StickerKind }> = ({ kind }) => {
  switch (kind) {
    case 'rec-frame':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8 text-rose-400">
          <path d="M8 14V8h8M48 8h8v6M8 26v6h8M48 32h8v-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="17" cy="15" r="2.5" fill="currentColor" />
          <text x="23" y="17.5" fontSize="7" fontFamily="monospace" fill="#FAF9F6">REC</text>
        </svg>
      );
    case 'focus-reticle':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8 text-[#38BDF8]">
          <circle cx="32" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2" />
          <path d="M32 6v6M32 28v6M18 20h6M40 20h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8 text-amber-300">
          <path d="M14 20h32M36 11l10 9-10 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'lower-bar':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8">
          <rect x="8" y="22" width="48" height="10" rx="3" fill="#0284C7" fillOpacity="0.85" />
          <rect x="13" y="25.5" width="22" height="3" rx="1.5" fill="#FAF9F6" />
        </svg>
      );
    case 'badge-live':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8">
          <rect x="15" y="12" width="34" height="16" rx="8" fill="#E11D48" />
          <text x="32" y="23" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFFFFF">LIVE</text>
        </svg>
      );
    case 'star-burst':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8 text-amber-300">
          <path d="M32 6l4 10 10-3-5 9 9 5-10 3 2 10-10-6-10 6 2-10-10-3 9-5-5-9 10 3z" fill="currentColor" fillOpacity="0.88" />
        </svg>
      );
    case 'check-badge':
      return (
        <svg viewBox="0 0 64 40" className="w-12 h-8 text-emerald-400">
          <circle cx="32" cy="20" r="11" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M26 20l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
};

const TransitionPreviewSvg: React.FC<{ type: TransitionType; category: TransitionCategory }> = ({
  type,
  category,
}) => {
  if (type === 'iris-in' || type === 'iris-out') {
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <circle
          cx="32"
          cy="18"
          r={type === 'iris-in' ? 11 : 7}
          fill="#0284C7"
          fillOpacity="0.35"
          stroke="#38BDF8"
          strokeWidth="1.6"
        />
        <circle cx="32" cy="18" r="3" fill="#FAF9F6" />
      </svg>
    );
  }
  if (type === 'curtain-split' || type === 'barn-door') {
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <rect x="4" y="4" width="24" height="28" rx="2" fill="#1E293B" />
        <rect x="36" y="4" width="24" height="28" rx="2" fill="#1E293B" />
        <path d="M26 18h-7M38 18h7" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'diagonal-wipe') {
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <polygon points="0,0 44,0 20,36 0,36" fill="#0284C7" fillOpacity="0.45" />
        <line x1="44" y1="0" x2="20" y2="36" stroke="#38BDF8" strokeWidth="1.6" />
      </svg>
    );
  }
  if (category === '3D & Spin') {
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <rect x="18" y="7" width="28" height="22" rx="3" fill="#0284C7" fillOpacity="0.28" stroke="#38BDF8" strokeWidth="1.4" transform="rotate(-10 32 18)" />
        <path d="M22 10a13 13 0 0 1 20 0" fill="none" stroke="#FAF9F6" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (category === 'Stylized') {
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <rect x="8" y="8" width="32" height="4" rx="2" fill="#38BDF8" fillOpacity="0.7" />
        <rect x="20" y="16" width="36" height="4" rx="2" fill="#F43F5E" fillOpacity="0.7" />
        <rect x="12" y="24" width="28" height="4" rx="2" fill="#FAF9F6" fillOpacity="0.55" />
      </svg>
    );
  }
  if (category === 'Slide' || category === 'Wipe') {
    const dir = type.includes('right')
      ? 'M22 18h20M36 12l6 6-6 6'
      : type.includes('up')
      ? 'M32 26V10M26 16l6-6 6 6'
      : type.includes('down')
      ? 'M32 10v16M26 20l6 6 6-6'
      : 'M42 18H22M28 12l-6 6 6 6';
    return (
      <svg viewBox="0 0 64 36" className="w-full h-full">
        <rect width="64" height="36" rx="4" fill="#131720" />
        <rect x="4" y="4" width="28" height="28" rx="2" fill="#0284C7" fillOpacity="0.28" />
        <path d={dir} fill="none" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 36" className="w-full h-full">
      <rect width="64" height="36" rx="4" fill="#131720" />
      <rect x="8" y="6" width="28" height="24" rx="3" fill="#0284C7" fillOpacity="0.35" />
      <rect x="28" y="6" width="28" height="24" rx="3" fill="#38BDF8" fillOpacity="0.28" stroke="#38BDF8" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
};

interface MediaLibraryPanelProps {
  onCollapse?: () => void;
}

export const MediaLibraryPanel: React.FC<MediaLibraryPanelProps> = ({ onCollapse }) => {
  const {
    project,
    assets,
    assetsMap,
    workspaceMode,
    setWorkspaceMode,
    setRightPanelTab,
    registerAsset,
    updateAsset,
    removeAsset,
    addMediaToTimeline,
    addMultipleMediaToTimeline,
    applyTextStyleToAllSubtitles,
    addTextClipToTimeline,
    addStickerClipToTimeline,
    selectedClip,
    selectClip,
    playhead,
    setPlayhead,
    updateClip,
    updateTrack,
    splitAtPlayhead,
    deleteSelectedClip,
    notify,
  } = useEditorStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [importProgress, setImportProgress] = useState<{
    total: number;
    done: number;
    currentName: string;
  } | null>(null);

  const [generatingSample, setGeneratingSample] = useState(false);
  const [proxyProgressMap, setProxyProgressMap] = useState<Record<string, number>>({});

  // Filters & Effects categories
  const [filterCategory, setFilterCategory] = useState<FilterCollection>('All');
  const [filterQuery, setFilterQuery] = useState('');
  const [filterIntensity, setFilterIntensity] = useState(100);
  const [favoriteFilterIds, setFavoriteFilterIds] = useState<string[]>(() => loadFavoriteFilterIds());
  const [customFilters, setCustomFilters] = useState<FilterLookDefinition[]>(() => loadCustomFilterPresets());
  const [savingCustomPreset, setSavingCustomPreset] = useState(false);
  const [customPresetName, setCustomPresetName] = useState('');

  const [effectsFilter, setEffectsFilter] = useState<EffectsSectionFilter>('All');
  const [effectQuery, setEffectQuery] = useState('');

  // Text & Captions tab state
  const [textPresetCat, setTextPresetCat] = useState<'All' | 'Titles' | 'Subtitles' | 'Typography'>('All');
  const [transcriptInput, setTranscriptInput] = useState('');
  const [showTranscriptBox, setShowTranscriptBox] = useState(false);

  // Transitions browser self-adjustments
  const [transitionQuery, setTransitionQuery] = useState('');
  const [transitionCategory, setTransitionCategory] = useState<'All' | TransitionCategory>('All');
  const [transitionDuration, setTransitionDuration] = useState(0.6);
  const [transitionEasing, setTransitionEasing] = useState<TransitionEasing>('ease-in-out');
  const [transitionIntensity, setTransitionIntensity] = useState(1);

  // Subtitle animation state
  const [captionAnim, setCaptionAnim] = useState<TextAnimation>('word-pop');
  const [captionAnimDur, setCaptionAnimDur] = useState(0.35);

  const [meterLevel, setMeterLevel] = useState(0);

  // Voiceover recording state
  const [recordingVo, setRecordingVo] = useState(false);
  const voRecorderRef = useRef<MediaRecorder | null>(null);
  const voStreamRef = useRef<MediaStream | null>(null);

  // Live speech captioning state
  const [dictating, setDictating] = useState(false);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const [detectingSpeech, setDetectingSpeech] = useState(false);

  useEffect(() => {
    if (workspaceMode !== 'audio') return;
    let rafId = 0;
    const sample = () => {
      setMeterLevel(audioEngine.getPeakLevel());
      rafId = requestAnimationFrame(sample);
    };
    rafId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(rafId);
  }, [workspaceMode]);

  useEffect(() => {
    return () => {
      voRecorderRef.current?.stop();
      voStreamRef.current?.getTracks().forEach((t) => t.stop());
      speechRecRef.current?.stop();
    };
  }, []);

  // Unlimited batch concurrent import queue
  const handleFiles = async (files: FileList | File[]) => {
    if (!project) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setImportProgress({ total: list.length, done: 0, currentName: list[0].name });
    let imported = 0;
    let cursor = 0;
    const concurrency = Math.min(3, list.length);

    const worker = async () => {
      while (cursor < list.length) {
        const idx = cursor++;
        const file = list[idx];
        setImportProgress((prev) =>
          prev ? { ...prev, currentName: file.name } : { total: list.length, done: idx, currentName: file.name }
        );
        try {
          const asset = await analyzeAndStoreMediaFile(file, project.id);
          registerAsset(asset);
          imported++;
        } catch (err) {
          notify(err instanceof Error ? err.message : `Failed to import "${file.name}".`, 'error');
        } finally {
          setImportProgress((prev) =>
            prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : null
          );
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    setImportProgress(null);

    if (imported > 0) {
      notify(`Imported ${imported} media ${imported === 1 ? 'file' : 'files'} to pool.`, 'success');
    }
  };

  const handleGenerateSample = async (kind: 'video' | 'image' | 'audio') => {
    if (!project || generatingSample) return;
    setGeneratingSample(true);
    try {
      const asset = await generateTestMediaAsset(kind, project.id);
      registerAsset(asset);
      notify(`Created "${asset.name}" in Media Pool.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create sample clip.', 'error');
    } finally {
      setGeneratingSample(false);
    }
  };

  const handleGenerateProxy = async (asset: MediaAsset) => {
    if (proxyProgressMap[asset.id] !== undefined) return;
    setProxyProgressMap((p) => ({ ...p, [asset.id]: 1 }));
    try {
      const updated = await generateProxyForAsset(asset.id, (pct) => {
        setProxyProgressMap((p) => ({ ...p, [asset.id]: pct }));
      });
      updateAsset(updated);
      notify(`Generated 360p proxy for "${asset.name}".`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Proxy generation failed.', 'error');
    } finally {
      setProxyProgressMap((p) => {
        const next = { ...p };
        delete next[asset.id];
        return next;
      });
    }
  };

  const handleToggleVoiceover = async () => {
    if (!project) return;
    if (recordingVo && voRecorderRef.current) {
      voRecorderRef.current.stop();
      setRecordingVo(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Microphone recording is unavailable in this browser context.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        voStreamRef.current = null;
        voRecorderRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > 0) {
          const file = new File(
            [blob],
            `Voiceover_${new Date().toLocaleTimeString().replace(/:/g, '-')}.webm`,
            { type: mimeType }
          );
          const asset = await analyzeAndStoreMediaFile(file, project.id);
          registerAsset(asset);
          addMediaToTimeline(asset, undefined, playhead);
          notify('Voiceover recorded and added to audio timeline.', 'success');
        }
      };
      voRecorderRef.current = recorder;
      recorder.start(200);
      setRecordingVo(true);
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Microphone permission denied or unavailable.',
        'error'
      );
    }
  };

  const handleGenerateSfx = async (kind: SoundEffectKind) => {
    if (!project) return;
    try {
      const asset = await generateBuiltInAudioAsset(kind, project.id);
      registerAsset(asset);
      addMediaToTimeline(asset, undefined, playhead);
      notify(`Added "${asset.name}" to audio track.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to generate audio asset.', 'error');
    }
  };

  const handleToggleLiveCaptions = () => {
    if (dictating && speechRecRef.current) {
      speechRecRef.current.stop();
      setDictating(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (ev: {
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: (ev: {
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
      };
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) {
      notify('Web Speech API is not supported in this browser. Try Speech-Activity detection or SRT import.', 'warning');
      return;
    }

    const rec = new Rec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || 'en-US';
    let cursor = playhead;

    rec.onresult = (ev) => {
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) {
          const text = res[0]?.transcript?.trim();
          if (text) {
            const dur = Math.max(1.5, Math.min(5, text.split(' ').length * 0.45));
            addTextClipToTimeline(
              text.slice(0, 22),
              {
                content: text,
                fontSize: 40,
                y: 86,
                outlineWidth: 3,
                outlineColor: '#000000',
                animation: captionAnim,
                animationDuration: captionAnimDur,
              },
              cursor,
              dur
            );
            cursor += dur;
          }
        }
      }
    };
    rec.onerror = () => {
      setDictating(false);
      notify('Speech recognition stopped (check microphone permissions).', 'warning');
    };
    rec.onend = () => {
      setDictating(false);
    };

    speechRecRef.current = rec;
    rec.start();
    setDictating(true);
    notify('Listening for speech to generate timed captions on T1...', 'info');
  };

  const handleAutoDetectClipCaptions = async () => {
    if (!selectedClip || !selectedClip.mediaId) {
      notify('Select an audio or video clip on the timeline first.', 'info');
      return;
    }
    const asset = assetsMap.get(selectedClip.mediaId);
    if (!asset || (asset.type !== 'audio' && asset.type !== 'video')) {
      notify('Select a video or audio clip to analyze vocal segments.', 'warning');
      return;
    }
    setDetectingSpeech(true);
    try {
      const record = await getMediaRecordById(asset.id);
      if (!record) throw new Error('Media record missing.');
      const segments = await detectSpeechSegmentsFromBlob(
        record.blob,
        selectedClip.startTime,
        selectedClip.duration
      );
      if (segments.length === 0) {
        notify('No clear speech activity intervals detected in this clip.', 'info');
        return;
      }
      for (const seg of segments) {
        addTextClipToTimeline(
          seg.text,
          {
            content: seg.text,
            fontSize: 40,
            y: 86,
            outlineWidth: 3,
            outlineColor: '#000000',
            animation: captionAnim,
            animationDuration: captionAnimDur,
          },
          seg.startTime,
          Math.max(0.4, seg.endTime - seg.startTime)
        );
      }
      notify(`Created ${segments.length} animated caption segments on timeline.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Speech analysis failed.', 'error');
    } finally {
      setDetectingSpeech(false);
    }
  };

  const handleImportSrt = async (file: File) => {
    const text = await file.text();
    const segments = parseSrtContent(text);
    if (segments.length === 0) {
      notify('No valid SRT subtitle cues found in file.', 'warning');
      return;
    }
    for (const seg of segments) {
      addTextClipToTimeline(
        seg.text.slice(0, 20),
        {
          content: seg.text,
          fontSize: 40,
          y: 86,
          outlineWidth: 3,
          outlineColor: '#000000',
          animation: captionAnim,
          animationDuration: captionAnimDur,
        },
        seg.startTime,
        Math.max(0.4, seg.endTime - seg.startTime)
      );
    }
    notify(`Imported ${segments.length} animated subtitles from SRT.`, 'success');
  };

  const handleExportSrt = () => {
    if (!project) return;
    const srt = exportTextClipsToSrt(project.clips);
    if (!srt.trim()) {
      notify('Add text or caption clips before exporting SRT.', 'info');
      return;
    }
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9_\-]/gi, '_')}.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Exported SRT subtitle file.', 'success');
  };

  const categoryCounts = useMemo(() => {
    let video = 0;
    let image = 0;
    let audio = 0;
    for (const a of assets) {
      if (a.type === 'video') video++;
      else if (a.type === 'image') image++;
      else if (a.type === 'audio') audio++;
    }
    return { all: assets.length, video, image, audio };
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = assets.filter((a) => {
      if (category !== 'all' && a.type !== category) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sortOrder === 'name') return a.name.localeCompare(b.name);
      if (sortOrder === 'duration') return b.duration - a.duration;
      if (sortOrder === 'size') return b.size - a.size;
      return b.createdAt - a.createdAt;
    });
  }, [assets, category, search, sortOrder]);

  const allFilters = useMemo(() => [...FILTER_CATALOG, ...customFilters], [customFilters]);

  const filteredFilters = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return allFilters.filter((f) => {
      if (filterCategory === 'Favorites' && !favoriteFilterIds.includes(f.id)) return false;
      else if (filterCategory === 'Custom' && !f.isCustom) return false;
      else if (
        filterCategory !== 'All' &&
        filterCategory !== 'Favorites' &&
        filterCategory !== 'Custom' &&
        f.category !== filterCategory
      ) {
        return false;
      }
      if (q && !f.name.toLowerCase().includes(q) && !f.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allFilters, filterCategory, filterQuery, favoriteFilterIds]);

  const filteredVideoEffects = useMemo(() => {
    const q = effectQuery.trim().toLowerCase();
    return VIDEO_EFFECT_CATALOG.filter((fx) => {
      if (effectsFilter !== 'All' && effectsFilter !== 'Overlays' && fx.category !== effectsFilter) {
        return false;
      }
      if (q && !fx.name.toLowerCase().includes(q) && !fx.desc.toLowerCase().includes(q) && !fx.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [effectsFilter, effectQuery]);

  const filteredTextPresets = useMemo(() => {
    if (textPresetCat === 'All') return TEXT_AND_SUBTITLE_PRESETS;
    return TEXT_AND_SUBTITLE_PRESETS.filter((p) => p.category === textPresetCat);
  }, [textPresetCat]);

  const timelineCaptionClips = useMemo(() => {
    if (!project) return [];
    return project.clips
      .filter((c) => c.type === 'text' && c.text)
      .sort((a, b) => a.startTime - b.startTime);
  }, [project]);

  const filteredTransitions = useMemo(() => {
    const q = transitionQuery.trim().toLowerCase();
    return TRANSITION_CATALOG.filter((tr) => {
      if (transitionCategory !== 'All' && tr.category !== transitionCategory) return false;
      if (q && !tr.label.toLowerCase().includes(q) && !tr.desc.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [transitionCategory, transitionQuery]);

  useEffect(() => {
    if (selectedClip?.appliedFilter) {
      setFilterIntensity(selectedClip.appliedFilter.intensity);
    }
  }, [selectedClip?.id, selectedClip?.appliedFilter]);

  const handleAssetDragStart = (e: React.DragEvent, asset: MediaAsset) => {
    e.dataTransfer.setData('application/x-framestudio-media', asset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleEffectDragStart = (e: React.DragEvent, def: VideoEffectDefinition) => {
    e.dataTransfer.setData('application/x-framestudio-effect', def.type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleFilterDragStart = (e: React.DragEvent, preset: FilterLookDefinition) => {
    e.dataTransfer.setData('application/x-framestudio-filter', preset.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const applyTransition = (edge: 'in' | 'out' | 'both', type: TransitionType) => {
    if (!selectedClip) {
      notify('Select a visual clip on the timeline first.', 'info');
      return;
    }
    if (selectedClip.type === 'audio') {
      notify('Video transitions apply to video, image, sticker, or text clips.', 'warning');
      return;
    }
    const patch = {
      type,
      duration: transitionDuration,
      easing: transitionEasing,
      intensity: transitionIntensity,
    };
    updateClip(selectedClip.id, (c) => ({
      ...c,
      ...(edge === 'in' || edge === 'both' ? { transitionIn: { ...patch } } : {}),
      ...(edge === 'out' || edge === 'both' ? { transitionOut: { ...patch } } : {}),
    }));
    notify(
      `Applied "${type}" (${transitionDuration.toFixed(2)}s) to ${
        edge === 'both' ? 'In & Out' : edge.toUpperCase()
      }.`,
      'success'
    );
  };

  const applySubtitleAnimToSelected = (anim: TextAnimation) => {
    setCaptionAnim(anim);
    if (selectedClip?.type === 'text' && selectedClip.text) {
      updateClip(selectedClip.id, (c) => ({
        ...c,
        text: c.text
          ? { ...c.text, animation: anim, animationDuration: captionAnimDur }
          : undefined,
      }));
      notify(`Set subtitle animation to "${anim}".`, 'success');
    }
  };

  const applyTypographyStyleToSelected = (style: TextTypographyStyle) => {
    if (!selectedClip || selectedClip.type !== 'text' || !selectedClip.text) {
      notify('Select a text or caption clip on the timeline to apply typography styling.', 'info');
      return;
    }
    updateClip(selectedClip.id, (c) => ({
      ...c,
      text: c.text ? { ...c.text, typographyStyle: style } : undefined,
    }));
    notify(`Applied "${style}" typography style.`, 'success');
  };

  const handleGenerateCaptionsFromTranscript = () => {
    const clean = transcriptInput.trim();
    if (!clean) {
      notify('Paste transcript lines first.', 'info');
      return;
    }
    const startAt = selectedClip ? selectedClip.startTime : playhead;
    const span = selectedClip ? Math.max(2, selectedClip.duration) : Math.max(4, clean.split(/\s+/).length * 0.42);
    const segments = splitTranscriptIntoCaptions(clean, startAt, span, 6);
    for (const seg of segments) {
      addTextClipToTimeline(
        seg.text.slice(0, 22),
        {
          content: seg.text,
          fontSize: 40,
          y: 86,
          outlineWidth: 3,
          outlineColor: '#000000',
          animation: captionAnim,
          animationDuration: captionAnimDur,
        },
        seg.startTime,
        Math.max(0.4, seg.endTime - seg.startTime)
      );
    }
    setTranscriptInput('');
    setShowTranscriptBox(false);
    notify(`Generated ${segments.length} timed subtitle cues from transcript.`, 'success');
  };

  const toggleFavoriteFilter = (filterId: string) => {
    setFavoriteFilterIds((prev) => {
      const next = prev.includes(filterId) ? prev.filter((id) => id !== filterId) : [...prev, filterId];
      saveFavoriteFilterIds(next);
      return next;
    });
  };

  const handleSaveCustomFilter = () => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      notify('Select a graded video or image clip to save its look.', 'info');
      return;
    }
    const label = customPresetName.trim() || `Custom Look ${customFilters.length + 1}`;
    const c = selectedClip.color;
    const newPreset: FilterLookDefinition = {
      id: createId('flt'),
      name: label,
      category: 'Cinematic',
      desc: 'Saved custom preset',
      previewFilter: `brightness(${c.brightness}%) contrast(${c.contrast}%) saturate(${c.saturation}%) grayscale(${c.grayscale}%) sepia(${c.sepia}%) hue-rotate(${c.hueRotate}deg)`,
      swatchGradient: 'from-sky-400/45 via-slate-700/40 to-amber-400/45',
      color: { ...selectedClip.color },
      effects: { ...selectedClip.effects },
      isCustom: true,
    };
    const next = [newPreset, ...customFilters];
    setCustomFilters(next);
    saveCustomFilterPresets(next);
    setCustomPresetName('');
    setSavingCustomPreset(false);
    notify(`Saved custom filter "${label}".`, 'success');
  };

  const handleDeleteCustomFilter = (filterId: string) => {
    const next = customFilters.filter((f) => f.id !== filterId);
    setCustomFilters(next);
    saveCustomFilterPresets(next);
    notify('Deleted custom filter preset.', 'info');
  };

  const applyFilterPreset = (preset: FilterLookDefinition, intensityPct = filterIntensity) => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      notify('Select a video or image clip on the timeline first.', 'info');
      return;
    }
    const blended = blendColorWithIntensity(preset.color, preset.id === 'original' ? 100 : intensityPct);
    updateClip(selectedClip.id, (c) => ({
      ...c,
      color: blended,
      effects: preset.effects ? { ...c.effects, ...preset.effects } : c.effects,
      appliedFilter:
        preset.id === 'original'
          ? undefined
          : { id: preset.id, name: preset.name, intensity: intensityPct },
    }));
    notify(`Applied "${preset.name}" look.`, 'success');
  };

  const resetSelectedClipFilter = () => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      notify('Select a video or image clip on the timeline first.', 'info');
      return;
    }
    updateClip(selectedClip.id, (c) => ({
      ...c,
      color: { ...DEFAULT_COLOR },
      effects: { ...DEFAULT_EFFECTS },
      appliedFilter: undefined,
    }));
    setFilterIntensity(100);
    notify('Reset clip color grading & filter.', 'info');
  };

  const addEffectToSelectedClip = (def: VideoEffectDefinition) => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      notify('Select a video or image clip on the timeline (or drag an effect onto a clip).', 'info');
      return;
    }
    const item = createEffectItemFromDef(def);
    updateClip(selectedClip.id, (c) => ({
      ...c,
      effectsStack: [...(c.effectsStack ?? []), item],
    }));
    notify(`Stacked "${def.name}" effect onto "${selectedClip.name}".`, 'success');
  };

  const applyVisualFxPreset = (
    effectsPatch: Partial<ClipVisualEffects> | undefined,
    colorPatch: Partial<ClipColorAdjustments> | undefined,
    label: string
  ) => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      notify('Select a video or image clip on the timeline first.', 'info');
      return;
    }
    updateClip(selectedClip.id, (c) => ({
      ...c,
      effects: effectsPatch ? { ...c.effects, ...effectsPatch } : c.effects,
      color: colorPatch ? { ...c.color, ...colorPatch } : c.color,
    }));
    notify(`Applied "${label}".`, 'success');
  };

  const isFilterActive = (preset: FilterLookDefinition): boolean => {
    if (!selectedClip || (selectedClip.type !== 'video' && selectedClip.type !== 'image')) {
      return false;
    }
    if (selectedClip.appliedFilter?.id) {
      return selectedClip.appliedFilter.id === preset.id;
    }
    return (
      selectedClip.color.contrast === (preset.color.contrast ?? DEFAULT_COLOR.contrast) &&
      selectedClip.color.saturation === (preset.color.saturation ?? DEFAULT_COLOR.saturation) &&
      selectedClip.color.grayscale === (preset.color.grayscale ?? DEFAULT_COLOR.grayscale) &&
      selectedClip.color.temperature === (preset.color.temperature ?? DEFAULT_COLOR.temperature)
    );
  };

  const showMediaPool = workspaceMode === 'edit' || workspaceMode === 'media';
  const activeTabKey = showMediaPool ? 'media' : workspaceMode;

  return (
    <aside className="w-full h-full bg-[#14161B] flex flex-col overflow-hidden select-none">
      {/* Sleek Rounded Pill Navigation Bar */}
      <div className="px-2.5 py-2 border-b border-white/[0.06] bg-[#14161B] flex items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = (tab.id === 'media' && showMediaPool) || workspaceMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspaceMode(tab.id)}
                className={`relative px-2.5 py-1.5 text-[11px] font-medium rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active ? 'text-[#FAF9F6]' : 'text-[#8E96A0] hover:text-[#dce4e4]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mediaDockTabPill"
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 bg-[#252A34] ring-1 ring-white/[0.1] rounded-full shadow-xs"
                  />
                )}
                <Icon
                  className={`relative z-10 w-3 h-3 ${
                    active ? 'text-[#38BDF8]' : 'opacity-80'
                  }`}
                />
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {onCollapse && (
          <StudioTooltip label="Collapse Sidebar" side="bottom">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse Sidebar"
              className="p-1.5 rounded-full text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTabKey}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          {/* ======================== CAPCUT-STYLE MEDIA PANEL ======================== */}
          {showMediaPool && (
            <div
              className="flex-1 flex flex-col overflow-hidden relative min-h-0"
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDraggingOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                if (e.dataTransfer.files?.length) {
                  void handleFiles(e.dataTransfer.files);
                }
              }}
            >
              <StudioScrollArea
                className="flex-1 min-h-0"
                resetKey={activeTabKey}
                ariaLabel="Media library assets"
              >
                <div className="p-3 space-y-2.5 border-b border-white/[0.06]">
                {/* Prominent CapCut-Style Primary Import Media CTA */}
                <div className="flex items-center gap-1.5">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 h-9 px-3.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6] text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-[0_4px_14px_rgba(2,132,199,0.28)]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import Media
                  </motion.button>

                  {filteredAssets.length > 1 && (
                    <StudioTooltip label="Append all visible media onto timeline" side="bottom">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addMultipleMediaToTimeline(filteredAssets)}
                        className="h-9 px-2.5 bg-[#1D2129] hover:bg-[#252A34] ring-1 ring-white/[0.08] text-[#dce4e4] hover:text-[#FAF9F6] rounded-xl flex items-center justify-center transition-colors"
                        aria-label="Append All to Timeline"
                      >
                        <ListPlus className="w-4 h-4" />
                      </motion.button>
                    </StudioTooltip>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="video/*,image/*,audio/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        void handleFiles(e.target.files);
                        e.target.value = '';
                      }
                    }}
                  />
                </div>

                {/* Search + Sort + Grid/List Controls */}
                <div className="flex items-center gap-1.5">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 text-[#68707A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search clips..."
                      className="w-full h-7 pl-8 pr-6 bg-[#101216] border border-white/[0.07] focus:border-[#38BDF8]/60 rounded-lg text-[11px] text-[#FAF9F6] placeholder-[#68707A] outline-none transition-colors"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E96A0] hover:text-[#FAF9F6]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="relative flex items-center shrink-0">
                    <ArrowUpDown className="w-3 h-3 text-[#7B838D] absolute left-2 pointer-events-none" />
                    <select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                      aria-label="Sort media"
                      className="h-7 pl-6 pr-2 bg-[#101216] border border-white/[0.07] hover:border-white/[0.15] rounded-lg text-[10px] text-[#dce4e4] outline-none cursor-pointer"
                    >
                      <option value="newest">Newest</option>
                      <option value="name">Name A–Z</option>
                      <option value="duration">Duration</option>
                      <option value="size">File Size</option>
                    </select>
                  </div>

                  <div className="flex items-center bg-[#101216] border border-white/[0.07] rounded-lg p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      title="Thumbnail grid view"
                      className={`p-1 rounded-md transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-[#252A34] text-[#FAF9F6]'
                          : 'text-[#7B838D] hover:text-[#dce4e4]'
                      }`}
                    >
                      <Grid2x2 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      title="Compact list view"
                      className={`p-1 rounded-md transition-colors ${
                        viewMode === 'list'
                          ? 'bg-[#252A34] text-[#FAF9F6]'
                          : 'text-[#7B838D] hover:text-[#dce4e4]'
                      }`}
                    >
                      <List className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Pill Category Filters */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { key: 'all', label: 'All', count: categoryCounts.all },
                      { key: 'video', label: 'Videos', count: categoryCounts.video },
                      { key: 'image', label: 'Images', count: categoryCounts.image },
                      { key: 'audio', label: 'Audio', count: categoryCounts.audio },
                    ] as const
                  ).map((cat) => {
                    const active = category === cat.key;
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => setCategory(cat.key)}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-full transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 ${
                          active
                            ? 'bg-[#38BDF8]/15 text-[#7DD3FC] ring-1 ring-[#38BDF8]/40'
                            : 'bg-white/[0.04] text-[#8E96A0] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                        }`}
                      >
                        <span>{cat.label}</span>
                        {cat.count > 0 && (
                          <span className="font-mono text-[9px] tabular-nums opacity-75">
                            {cat.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Media Drop Zone & Thumbnail Grid */}
              <div className="p-3 space-y-2.5">
                {importProgress && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-2.5 bg-[#1B1F27] ring-1 ring-[#38BDF8]/30 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#FAF9F6]">
                      <span className="truncate pr-2">Importing {importProgress.currentName}</span>
                      <span className="font-mono text-[10px] tabular-nums text-[#7DD3FC] shrink-0">
                        {importProgress.done}/{importProgress.total}
                      </span>
                    </div>
                    <div className="h-1.5 bg-[#0E1014] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#38BDF8] rounded-full transition-[width] duration-150"
                        style={{
                          width: `${Math.max(
                            8,
                            Math.round((importProgress.done / Math.max(1, importProgress.total)) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </motion.div>
                )}

                {filteredAssets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] p-5 text-center space-y-3.5 mt-1">
                    <div className="w-10 h-10 mx-auto rounded-full bg-[#0284C7]/15 text-[#38BDF8] flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-[#FAF9F6]">
                        {assets.length === 0 ? 'Drop media files here' : 'No matching clips'}
                      </div>
                      <p className="text-[11px] text-[#8E96A0] leading-relaxed">
                        {assets.length === 0
                          ? 'Drag & drop multiple videos, images, or audio tracks, or click Import Media.'
                          : 'Try clearing your search query or switching media categories.'}
                      </p>
                    </div>

                    {assets.length === 0 && (
                      <div className="pt-3 border-t border-white/[0.06] space-y-2">
                        <div className="text-[10px] text-[#6E7782]">
                          Or generate quick local test footage:
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={generatingSample}
                            onClick={() => void handleGenerateSample('video')}
                            className="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.1] rounded-full text-[10px] text-[#dce4e4] disabled:opacity-50 transition-colors"
                          >
                            + Test Video
                          </button>
                          <button
                            type="button"
                            disabled={generatingSample}
                            onClick={() => void handleGenerateSample('image')}
                            className="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.1] rounded-full text-[10px] text-[#dce4e4] disabled:opacity-50 transition-colors"
                          >
                            + Test Slate
                          </button>
                          <button
                            type="button"
                            disabled={generatingSample}
                            onClick={() => void handleGenerateSample('audio')}
                            className="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.1] rounded-full text-[10px] text-[#dce4e4] disabled:opacity-50 transition-colors"
                          >
                            + Test Audio
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : viewMode === 'grid' ? (
                  <>
                    <div className="flex items-center justify-between px-0.5 text-[10px] text-[#7B838D]">
                      <span>
                        {filteredAssets.length} {filteredAssets.length === 1 ? 'clip' : 'clips'}
                      </span>
                      <span>Drag to timeline</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {filteredAssets.map((asset, index) => {
                        const TypeIcon =
                          asset.type === 'video' ? Film : asset.type === 'image' ? ImageIcon : Music;
                        const proxyPct = proxyProgressMap[asset.id];
                        return (
                          <motion.div
                            key={asset.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.16, delay: Math.min(0.16, index * 0.02) }}
                            whileHover={{ y: -2 }}
                            draggable
                            onDragStart={(e) =>
                              handleAssetDragStart(e as unknown as React.DragEvent, asset)
                            }
                            className="group bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/50 cursor-grab active:cursor-grabbing transition-[background-color,box-shadow]"
                          >
                            <div className="aspect-video bg-[#0E1014] relative overflow-hidden flex items-center justify-center">
                              {asset.thumbnailDataUrl ? (
                                <img
                                  src={asset.thumbnailDataUrl}
                                  alt={asset.name}
                                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                  draggable={false}
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#161E29] to-[#0E1014] flex flex-col items-center justify-center gap-1">
                                  <TypeIcon className="w-5 h-5 text-[#7DD3FC]/80" />
                                </div>
                              )}

                              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />

                              {/* Top-right hover delete & proxy */}
                              <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {asset.type === 'video' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleGenerateProxy(asset);
                                    }}
                                    disabled={proxyPct !== undefined}
                                    title={
                                      asset.hasProxy
                                        ? '360p Proxy ready'
                                        : 'Generate 360p Proxy copy'
                                    }
                                    className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono backdrop-blur-xs transition-colors ${
                                      asset.hasProxy
                                        ? 'bg-emerald-500/80 text-white'
                                        : 'bg-black/70 text-[#dce4e4] hover:bg-black/90'
                                    }`}
                                  >
                                    {proxyPct !== undefined
                                      ? `${proxyPct}%`
                                      : asset.hasProxy
                                      ? 'PXY'
                                      : 'Proxy'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void removeAsset(asset.id);
                                  }}
                                  title="Remove from pool"
                                  className="w-5 h-5 rounded-full bg-black/70 hover:bg-rose-600/90 text-[#dce4e4] hover:text-white flex items-center justify-center transition-colors"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>

                              {/* Bottom-left duration & bottom-right quick + Add */}
                              <span className="absolute bottom-1.5 left-2 font-mono text-[10px] tabular-nums text-[#FAF9F6] drop-shadow">
                                {formatShortDuration(asset.duration)}
                              </span>

                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addMediaToTimeline(asset);
                                }}
                                title="Add to timeline at playhead"
                                className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-[#0284C7] hover:bg-[#0EA5E9] text-white flex items-center justify-center shadow-md opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </motion.button>
                            </div>

                            <div className="px-2 py-1.5 space-y-0.5">
                              <div
                                className="text-[11px] font-medium text-[#FAF9F6] truncate"
                                title={asset.name}
                              >
                                {asset.name}
                              </div>
                              <div className="text-[9px] text-[#7B838D] font-mono tabular-nums truncate">
                                {asset.width > 0 ? `${asset.height}p · ` : ''}
                                {formatFileSize(asset.size)}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    {filteredAssets.map((asset) => {
                      const TypeIcon =
                        asset.type === 'video' ? Film : asset.type === 'image' ? ImageIcon : Music;
                      const proxyPct = proxyProgressMap[asset.id];
                      return (
                        <div
                          key={asset.id}
                          draggable
                          onDragStart={(e) => handleAssetDragStart(e, asset)}
                          className="group flex items-center gap-2.5 p-1.5 rounded-xl bg-[#1A1D24] hover:bg-[#20242D] ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/45 cursor-grab active:cursor-grabbing transition-colors"
                        >
                          <div className="w-16 h-10 shrink-0 bg-[#0E1014] rounded-lg overflow-hidden relative flex items-center justify-center">
                            {asset.thumbnailDataUrl ? (
                              <img
                                src={asset.thumbnailDataUrl}
                                alt={asset.name}
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <TypeIcon className="w-4 h-4 text-[#7DD3FC]" />
                            )}
                            <span className="absolute bottom-0.5 right-1 font-mono text-[8px] tabular-nums text-white drop-shadow">
                              {formatShortDuration(asset.duration)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                              {asset.name}
                            </div>
                            <div className="text-[9px] text-[#7B838D] font-mono tabular-nums truncate">
                              {asset.width > 0 ? `${asset.width}×${asset.height} · ` : ''}
                              {formatFileSize(asset.size)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {asset.type === 'video' && (
                              <button
                                type="button"
                                onClick={() => void handleGenerateProxy(asset)}
                                disabled={proxyPct !== undefined}
                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono transition-colors ${
                                  asset.hasProxy
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-white/[0.06] text-[#8E96A0] hover:text-white'
                                }`}
                              >
                                {proxyPct !== undefined ? `${proxyPct}%` : asset.hasProxy ? 'PXY' : 'Proxy'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => addMediaToTimeline(asset)}
                              title="Add to timeline"
                              className="w-6 h-6 rounded-full bg-[#0284C7] hover:bg-[#0EA5E9] text-white flex items-center justify-center transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeAsset(asset.id)}
                              title="Remove"
                              className="p-1 text-[#68707A] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              </StudioScrollArea>

              {/* Drag-and-drop OS file overlay */}
              <AnimatePresence>
                {isDraggingOver && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-2 rounded-2xl bg-[#0E1014]/90 border-2 border-dashed border-[#38BDF8] flex flex-col items-center justify-center gap-2 z-30 pointer-events-none backdrop-blur-xs"
                  >
                    <Upload className="w-7 h-7 text-[#38BDF8]" />
                    <div className="text-xs font-semibold text-[#FAF9F6]">
                      Drop to Import Media
                    </div>
                    <div className="text-[10px] text-[#9BA3AB]">
                      Videos, Images & Audio supported
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ======================== TEXT & SUBTITLES ======================== */}
          {workspaceMode === 'text' && (
            <StudioScrollArea
              className="flex-1 min-h-0"
              contentClassName="p-3 space-y-4"
              resetKey={activeTabKey}
              ariaLabel="Text, typography, and captions"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Text &amp; Motion Styles</h3>
                  </div>
                  <span className="font-mono text-[10px] text-[#7B838D]">
                    {filteredTextPresets.length} presets
                  </span>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {(['All', 'Titles', 'Subtitles', 'Typography'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTextPresetCat(cat)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        textPresetCat === cat
                          ? 'bg-[#38BDF8]/15 text-[#7DD3FC] ring-1 ring-[#38BDF8]/40'
                          : 'bg-white/[0.04] text-[#8E96A0] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {filteredTextPresets.map((preset) => (
                    <motion.button
                      key={preset.name}
                      type="button"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => addTextClipToTimeline(preset.name, preset.settings)}
                      className="group text-left bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/50 transition-all"
                    >
                      <div className="h-14 bg-gradient-to-br from-[#12151C] to-[#0D0F14] flex items-center justify-center px-2 relative overflow-hidden">
                        <span className={`${preset.previewClass} truncate`}>{preset.previewText}</span>
                        <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-[#0284C7] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                          <Plus className="w-3 h-3" />
                        </span>
                      </div>
                      <div className="px-2.5 py-2">
                        <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                          {preset.name}
                        </div>
                        <div className="text-[9px] text-[#7B838D] truncate">{preset.desc}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Typography Looks */}
              <div className="space-y-2 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#FAF9F6]">Typography Looks</span>
                  <span className="text-[9px] text-[#7B838D]">Apply to selected text</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TYPOGRAPHY_STYLE_OPTIONS.map((opt) => {
                    const active = selectedClip?.type === 'text' && (selectedClip.text?.typographyStyle ?? 'clean') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => applyTypographyStyleToSelected(opt.value)}
                        title={opt.desc}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                          active
                            ? 'bg-[#0284C7] text-[#FAF9F6] ring-1 ring-[#38BDF8]/60'
                            : 'bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] text-[#dce4e4]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subtitle & Caption Animation Pills */}
              <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Text &amp; Subtitle Animations</h3>
                  </div>
                  <span className="font-mono text-[10px] text-[#7B838D]">
                    {TEXT_ANIMATION_CATALOG.length} styles
                  </span>
                </div>

                <div className="p-2.5 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#9BA3AB]">Animation Duration</span>
                    <span className="font-mono tabular-nums text-[#FAF9F6]">
                      {captionAnimDur.toFixed(2)}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    value={captionAnimDur}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCaptionAnimDur(val);
                      if (selectedClip?.type === 'text' && selectedClip.text) {
                        updateClip(
                          selectedClip.id,
                          (c) => ({
                            ...c,
                            text: c.text ? { ...c.text, animationDuration: val } : undefined,
                          }),
                          false
                        );
                      }
                    }}
                    className="w-full studio-slider"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {TEXT_ANIMATION_CATALOG.map((anim) => {
                    const isSelectedClipMatch =
                      selectedClip?.type === 'text' && selectedClip.text?.animation === anim.value;
                    const active = isSelectedClipMatch || (!selectedClip && captionAnim === anim.value);
                    return (
                      <motion.button
                        key={anim.value}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={() => applySubtitleAnimToSelected(anim.value)}
                        title={anim.desc}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                          active
                            ? 'bg-[#0284C7] text-[#FAF9F6] shadow-xs ring-1 ring-[#38BDF8]/60'
                            : 'bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] text-[#dce4e4]'
                        }`}
                      >
                        {anim.label}
                      </motion.button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    applyTextStyleToAllSubtitles({
                      animation: captionAnim,
                      animationDuration: captionAnimDur,
                    })
                  }
                  className="w-full py-2 px-3 bg-[#1D2129] hover:bg-[#252A34] ring-1 ring-white/[0.08] rounded-xl text-[11px] font-medium text-[#dce4e4] hover:text-[#FAF9F6] transition-colors"
                >
                  Apply &ldquo;{captionAnim}&rdquo; to All Subtitles
                </button>
              </div>

              {/* Advanced Auto Captions, Script Segmentation & Editable Cue List */}
              <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Captions className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Caption Studio &amp; .SRT</h3>
                  </div>
                  <span className="font-mono text-[10px] text-[#7B838D]">
                    {timelineCaptionClips.length} cues
                  </span>
                </div>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={handleToggleLiveCaptions}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                      dictating
                        ? 'bg-rose-700 text-white'
                        : isSpeechRecognitionSupported()
                        ? 'bg-[#0284C7] hover:bg-[#0EA5E9] text-white'
                        : 'bg-[#1A1D24] ring-1 ring-white/[0.07] text-[#9BA3AB]'
                    }`}
                  >
                    {dictating ? <Square className="w-3 h-3" /> : <Mic className="w-3.5 h-3.5" />}
                    {dictating ? 'Stop Live Dictation' : 'Live Speech-to-Text Captions'}
                  </button>

                  <button
                    type="button"
                    disabled={detectingSpeech}
                    onClick={() => void handleAutoDetectClipCaptions()}
                    className="w-full py-2 px-3 bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] rounded-xl text-xs font-medium text-[#dce4e4] disabled:opacity-50 transition-colors"
                  >
                    {detectingSpeech
                      ? 'Analyzing Vocal Segments...'
                      : 'Auto-Time Cues from Selected Clip'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowTranscriptBox((v) => !v)}
                    className="w-full py-1.5 px-3 bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] rounded-xl text-[11px] font-medium text-[#7DD3FC] transition-colors"
                  >
                    {showTranscriptBox ? 'Hide Script-to-Captions' : 'Batch Generate from Transcript'}
                  </button>

                  {showTranscriptBox && (
                    <div className="p-2.5 bg-[#101216] ring-1 ring-white/[0.08] rounded-xl space-y-2">
                      <textarea
                        rows={3}
                        value={transcriptInput}
                        onChange={(e) => setTranscriptInput(e.target.value)}
                        placeholder="Paste spoken script or dialogue to split into timed subtitle cues..."
                        className="w-full p-2 bg-[#1A1D24] border border-white/[0.08] rounded-lg text-[11px] text-[#FAF9F6] placeholder-[#68707A] outline-none resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateCaptionsFromTranscript}
                        className="w-full py-1.5 bg-[#0284C7] hover:bg-[#0EA5E9] text-white rounded-lg text-[11px] font-semibold transition-colors"
                      >
                        Create Timed Cues on Timeline
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => srtInputRef.current?.click()}
                      className="py-1.5 px-2 bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] rounded-xl text-[11px] text-[#dce4e4] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      Import .SRT
                    </button>
                    <button
                      type="button"
                      onClick={handleExportSrt}
                      className="py-1.5 px-2 bg-[#1A1D24] hover:bg-[#232732] ring-1 ring-white/[0.07] rounded-xl text-[11px] text-[#dce4e4] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export .SRT
                    </button>
                    <input
                      ref={srtInputRef}
                      type="file"
                      accept=".srt,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImportSrt(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                {/* Editable Subtitle Cue Timeline Editor */}
                {timelineCaptionClips.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[10px] font-medium text-[#9BA3AB]">
                      Editable Cue Segments
                    </div>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                      {timelineCaptionClips.map((cue: Clip, idx: number) => {
                        const isSel = selectedClip?.id === cue.id;
                        return (
                          <div
                            key={cue.id}
                            onClick={() => {
                              selectClip(cue.id);
                              setPlayhead(cue.startTime + 0.05);
                            }}
                            className={`p-2 rounded-xl space-y-1.5 cursor-pointer transition-colors ${
                              isSel
                                ? 'bg-[#202632] ring-1 ring-[#38BDF8]/60'
                                : 'bg-[#1A1D24] hover:bg-[#1E222B] ring-1 ring-white/[0.06]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 text-[9px] font-mono text-[#7B838D]">
                              <span>#{idx + 1}</span>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0}
                                  value={Number(cue.startTime.toFixed(2))}
                                  onChange={(e) => {
                                    const nextStart = Math.max(0, parseFloat(e.target.value) || 0);
                                    updateClip(cue.id, (c) => ({ ...c, startTime: nextStart }));
                                  }}
                                  className="w-12 h-5 px-1 bg-[#101216] border border-white/[0.08] rounded text-right text-[#dce4e4]"
                                  title="Start time (seconds)"
                                />
                                <span>→</span>
                                <input
                                  type="number"
                                  step={0.1}
                                  min={0.2}
                                  value={Number((cue.startTime + cue.duration).toFixed(2))}
                                  onChange={(e) => {
                                    const nextEnd = Math.max(cue.startTime + 0.25, parseFloat(e.target.value) || 0.5);
                                    updateClip(cue.id, (c) => ({
                                      ...c,
                                      duration: Number((nextEnd - c.startTime).toFixed(2)),
                                    }));
                                  }}
                                  className="w-12 h-5 px-1 bg-[#101216] border border-white/[0.08] rounded text-right text-[#dce4e4]"
                                  title="End time (seconds)"
                                />
                                {isSpeechSynthesisSupported() && (
                                  <button
                                    type="button"
                                    onClick={() => speakCaptionText(cue.text?.content || '')}
                                    title="Audition cue speech (TTS)"
                                    className="p-1 text-[#7DD3FC] hover:text-white"
                                  >
                                    <Volume2 className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectClip(cue.id);
                                    const mid = cue.startTime + cue.duration / 2;
                                    setPlayhead(mid);
                                    splitAtPlayhead(cue.id);
                                  }}
                                  title="Split cue in half"
                                  className="p-1 text-[#8E96A0] hover:text-white"
                                >
                                  <Scissors className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    selectClip(cue.id);
                                    setTimeout(() => deleteSelectedClip(), 0);
                                  }}
                                  title="Delete cue"
                                  className="p-1 text-[#8E96A0] hover:text-rose-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <input
                              type="text"
                              value={cue.text?.content || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateClip(
                                  cue.id,
                                  (c) => ({
                                    ...c,
                                    name: val.slice(0, 20) || c.name,
                                    text: c.text ? { ...c.text, content: val } : undefined,
                                  }),
                                  false
                                );
                              }}
                              className="w-full h-6 px-2 bg-[#101216] border border-white/[0.07] focus:border-[#38BDF8]/60 rounded text-[11px] text-[#FAF9F6] outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </StudioScrollArea>
          )}

          {/* ======================== EFFECTS & OVERLAYS (31 STACKABLE VFX) ======================== */}
          {workspaceMode === 'effects' && (
            <StudioScrollArea
              className="flex-1 min-h-0"
              resetKey={activeTabKey}
              ariaLabel="Video effects and overlays"
            >
              <div className="p-3 border-b border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Video Effects Library</h3>
                  </div>
                  <span className="font-mono text-[10px] text-[#7B838D]">
                    {VIDEO_EFFECT_CATALOG.length} FX
                  </span>
                </div>

                {/* Active Clip Stack Summary */}
                {selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'image') && (
                  <div className="p-2 bg-[#1A1D24] ring-1 ring-white/[0.07] rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-medium text-[#dce4e4] truncate">
                        Stack on &ldquo;{selectedClip.name}&rdquo; ({selectedClip.effectsStack?.length ?? 0})
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setRightPanelTab('inspector')}
                          className="text-[10px] text-[#38BDF8] hover:underline"
                        >
                          Edit Params
                        </button>
                        {(selectedClip.effectsStack?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateClip(selectedClip.id, (c) => ({ ...c, effectsStack: [] }))
                            }
                            className="text-[10px] text-rose-400 hover:underline"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    {(selectedClip.effectsStack ?? []).length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                        {(selectedClip.effectsStack ?? []).map((fx, idx, arr) => (
                          <div
                            key={fx.id}
                            className="flex items-center justify-between gap-1 px-2 py-1 bg-[#101216] rounded-lg text-[10px]"
                          >
                            <span className={`truncate ${fx.enabled ? 'text-[#FAF9F6]' : 'text-[#68707A] line-through'}`}>
                              {idx + 1}. {fx.name} ({Math.round(fx.intensity)}%)
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
                                className="p-0.5 text-[#8E96A0] hover:text-white disabled:opacity-25"
                              >
                                <ArrowUp className="w-2.5 h-2.5" />
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
                                className="p-0.5 text-[#8E96A0] hover:text-white disabled:opacity-25"
                              >
                                <ArrowDown className="w-2.5 h-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateClip(selectedClip.id, (c) => ({
                                    ...c,
                                    effectsStack: (c.effectsStack ?? []).map((i) =>
                                      i.id === fx.id ? { ...i, enabled: !i.enabled } : i
                                    ),
                                  }))
                                }
                                className="p-0.5 text-[#8E96A0] hover:text-[#38BDF8]"
                              >
                                {fx.enabled ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateClip(selectedClip.id, (c) => ({
                                    ...c,
                                    effectsStack: (c.effectsStack ?? []).filter((i) => i.id !== fx.id),
                                  }))
                                }
                                className="p-0.5 text-[#8E96A0] hover:text-rose-400"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#68707A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={effectQuery}
                    onChange={(e) => setEffectQuery(e.target.value)}
                    placeholder="Search glow, glitch, blur, snow, 8mm..."
                    className="w-full h-7 pl-8 pr-6 bg-[#101216] border border-white/[0.07] focus:border-[#38BDF8]/60 rounded-lg text-[11px] text-[#FAF9F6] placeholder-[#68707A] outline-none"
                  />
                  {effectQuery && (
                    <button
                      type="button"
                      onClick={() => setEffectQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E96A0] hover:text-[#FAF9F6]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {[...VIDEO_EFFECT_CATEGORIES, 'Overlays' as const].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setEffectsFilter(sec)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        effectsFilter === sec
                          ? 'bg-[#38BDF8]/15 text-[#7DD3FC] ring-1 ring-[#38BDF8]/40'
                          : 'bg-white/[0.04] text-[#8E96A0] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 space-y-4">
                {effectsFilter !== 'Overlays' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#FAF9F6]">
                        {effectsFilter === 'All' ? 'All Stackable Effects' : effectsFilter}
                      </span>
                      <span className="text-[9px] text-[#7B838D]">Click or drag onto clip</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {filteredVideoEffects.map((fx) => {
                        const stackedCount =
                          selectedClip?.effectsStack?.filter((item) => item.type === fx.type && item.enabled)
                            .length ?? 0;
                        return (
                          <div
                            key={fx.type}
                            draggable
                            onDragStart={(e) => handleEffectDragStart(e, fx)}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <motion.button
                              type="button"
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => addEffectToSelectedClip(fx)}
                              className={`w-full group text-left bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden transition-all ${
                                stackedCount > 0
                                  ? 'ring-1.5 ring-[#38BDF8]'
                                  : 'ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/50'
                              }`}
                            >
                              <div className="h-12 relative overflow-hidden bg-[#0E1014] flex items-center justify-center">
                                <div className={`absolute inset-0 bg-gradient-to-br ${fx.previewTint}`} />
                                <Sparkles className="relative z-10 w-4 h-4 text-[#FAF9F6]/85 group-hover:scale-110 transition-transform" />
                                {stackedCount > 0 && (
                                  <span className="absolute top-1 right-1.5 px-1.5 py-0.5 rounded-full bg-[#38BDF8] text-[#09131A] font-mono text-[8px] font-bold">
                                    ×{stackedCount}
                                  </span>
                                )}
                              </div>
                              <div className="px-2.5 py-2">
                                <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                                  {fx.name}
                                </div>
                                <div className="text-[9px] text-[#7B838D] truncate">{fx.desc}</div>
                              </div>
                            </motion.button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {effectsFilter === 'All' && !effectQuery && (
                  <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#FAF9F6]">Quick Pixel FX</span>
                      <button
                        type="button"
                        onClick={() =>
                          applyVisualFxPreset({ ...DEFAULT_EFFECTS }, { blur: 0, vignette: 0 }, 'Clear All FX')
                        }
                        className="text-[10px] text-[#8E96A0] hover:text-white"
                      >
                        Reset Pixel FX
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_PIXEL_FX_PRESETS.map((fx) => (
                        <button
                          key={fx.name}
                          type="button"
                          onClick={() => applyVisualFxPreset(fx.effects, fx.color, fx.name)}
                          className="text-left bg-[#1A1D24] hover:bg-[#20242D] rounded-xl px-2.5 py-2 ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/45 transition-colors"
                        >
                          <div className="text-[11px] font-medium text-[#FAF9F6] truncate">{fx.name}</div>
                          <div className="text-[9px] text-[#7B838D] truncate">{fx.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(effectsFilter === 'All' || effectsFilter === 'Overlays') && (
                  <div className="space-y-2.5 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sticker className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <h3 className="text-xs font-semibold text-[#FAF9F6]">Stickers &amp; Overlays</h3>
                      </div>
                      <span className="text-[10px] text-[#7B838D]">Add to timeline</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {STICKER_PRESETS.map((st) => (
                        <motion.button
                          key={st.kind}
                          type="button"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => addStickerClipToTimeline(st.name, st.kind)}
                          className="group text-left bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/50 transition-all"
                        >
                          <div className="h-14 bg-gradient-to-br from-[#12151C] to-[#0D0F14] flex items-center justify-center relative">
                            <StickerPreviewSvg kind={st.kind} />
                            <span className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-[#0284C7] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                              <Plus className="w-3 h-3" />
                            </span>
                          </div>
                          <div className="px-2.5 py-2">
                            <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                              {st.name}
                            </div>
                            <div className="text-[9px] text-[#7B838D] truncate">{st.desc}</div>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StudioScrollArea>
          )}

          {/* ======================== FILTERS & COLOR LOOKS (30+ PRESETS + INTENSITY + FAVORITES + CUSTOM) ======================== */}
          {workspaceMode === 'color' && (
            <StudioScrollArea
              className="flex-1 min-h-0"
              resetKey={activeTabKey}
              ariaLabel="Filters and color looks"
            >
              <div className="p-3 border-b border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Filters &amp; Looks</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSavingCustomPreset((v) => !v)}
                      title="Save current clip grade as Custom Preset"
                      className="px-2 py-0.5 rounded-full bg-[#1A1D24] hover:bg-[#252A34] ring-1 ring-white/[0.08] text-[10px] text-[#7DD3FC]"
                    >
                      + Save Look
                    </button>
                    <button
                      type="button"
                      onClick={resetSelectedClipFilter}
                      title="Reset filter & color grading"
                      className="p-1 rounded-full text-[#8E96A0] hover:text-white hover:bg-white/[0.06]"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {savingCustomPreset && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customPresetName}
                      onChange={(e) => setCustomPresetName(e.target.value)}
                      placeholder="Custom preset name..."
                      className="flex-1 h-7 px-2.5 bg-[#101216] border border-white/[0.08] rounded-lg text-[11px] text-[#FAF9F6] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomFilter}
                      className="h-7 px-2.5 rounded-lg bg-[#0284C7] hover:bg-[#0EA5E9] text-[11px] font-medium text-white"
                    >
                      Save
                    </button>
                  </div>
                )}

                {/* Intensity Slider */}
                <div className="p-2 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[#9BA3AB]">
                      {selectedClip?.appliedFilter ? `Intensity (${selectedClip.appliedFilter.name})` : 'Filter Intensity'}
                    </span>
                    <span className="font-mono tabular-nums text-[#FAF9F6]">{filterIntensity}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={filterIntensity}
                    onChange={(e) => {
                      const pct = parseInt(e.target.value, 10);
                      setFilterIntensity(pct);
                      if (selectedClip?.appliedFilter) {
                        const activePreset = allFilters.find((f) => f.id === selectedClip.appliedFilter?.id);
                        if (activePreset) {
                          const blended = blendColorWithIntensity(activePreset.color, pct);
                          updateClip(
                            selectedClip.id,
                            (c) => ({
                              ...c,
                              color: blended,
                              appliedFilter: c.appliedFilter
                                ? { ...c.appliedFilter, intensity: pct }
                                : undefined,
                            }),
                            false
                          );
                        }
                      }
                    }}
                    className="w-full studio-slider"
                  />
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#68707A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder={`Search ${allFilters.length} filters & LUT looks...`}
                    className="w-full h-7 pl-8 pr-6 bg-[#101216] border border-white/[0.07] focus:border-[#38BDF8]/60 rounded-lg text-[11px] text-[#FAF9F6] placeholder-[#68707A] outline-none"
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E96A0] hover:text-[#FAF9F6]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {FILTER_COLLECTIONS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFilterCategory(cat)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                        filterCategory === cat
                          ? 'bg-[#38BDF8]/15 text-[#7DD3FC] ring-1 ring-[#38BDF8]/40'
                          : 'bg-white/[0.04] text-[#8E96A0] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 space-y-2.5">
                {filteredFilters.length === 0 ? (
                  <div className="py-10 text-center text-[11px] text-[#7B838D]">
                    {filterCategory === 'Favorites'
                      ? 'No favorite filters yet. Click the star on any look.'
                      : filterCategory === 'Custom'
                      ? 'No custom presets yet. Adjust a clip grade and click + Save Look.'
                      : 'No filters matched your search.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    {filteredFilters.map((preset) => {
                      const active = isFilterActive(preset);
                      const isFav = favoriteFilterIds.includes(preset.id);
                      const gradId = `sky-${preset.id.replace(/[^a-zA-Z0-9]/g, '')}`;
                      return (
                        <div
                          key={preset.id}
                          draggable
                          onDragStart={(e) => handleFilterDragStart(e, preset)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <motion.div
                            whileHover={{ y: -2 }}
                            onClick={() => applyFilterPreset(preset)}
                            className={`group cursor-pointer text-left bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden transition-all relative ${
                              active
                                ? 'ring-2 ring-[#38BDF8] shadow-[0_0_0_3px_rgba(56,189,248,0.14)]'
                                : 'ring-1 ring-white/[0.07] hover:ring-[#38BDF8]/45'
                            }`}
                          >
                            <div className="aspect-[16/10] relative overflow-hidden bg-[#0E1014]">
                              <div
                                style={{ filter: preset.previewFilter }}
                                className={`w-full h-full bg-gradient-to-br ${preset.swatchGradient} relative flex items-end justify-center transition-transform duration-200 group-hover:scale-105`}
                              >
                                <svg
                                  viewBox="0 0 120 75"
                                  className="w-full h-full"
                                  preserveAspectRatio="xMidYMid slice"
                                >
                                  <defs>
                                    <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                                      <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.65" />
                                      <stop offset="55%" stopColor="#F97316" stopOpacity="0.55" />
                                      <stop offset="100%" stopColor="#1E1B4B" stopOpacity="0.85" />
                                    </linearGradient>
                                  </defs>
                                  <rect width="120" height="75" fill={`url(#${gradId})`} />
                                  <circle cx="88" cy="24" r="10" fill="#FDE68A" fillOpacity="0.85" />
                                  <path
                                    d="M0 54 L28 34 L54 48 L84 29 L120 52 L120 75 L0 75 Z"
                                    fill="#0F172A"
                                    fillOpacity="0.72"
                                  />
                                  <path
                                    d="M0 62 L38 45 L70 58 L98 44 L120 58 L120 75 L0 75 Z"
                                    fill="#090D16"
                                    fillOpacity="0.88"
                                  />
                                </svg>
                              </div>

                              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                                {preset.isCustom && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCustomFilter(preset.id);
                                    }}
                                    title="Delete custom look"
                                    className="w-5 h-5 rounded-full bg-black/70 text-[#dce4e4] hover:text-rose-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavoriteFilter(preset.id);
                                  }}
                                  title={isFav ? 'Remove from favorites' : 'Favorite filter'}
                                  className={`w-5 h-5 rounded-full bg-black/70 flex items-center justify-center transition-opacity ${
                                    isFav
                                      ? 'text-amber-300 opacity-100'
                                      : 'text-[#dce4e4] opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  <Star className={`w-2.5 h-2.5 ${isFav ? 'fill-amber-300' : ''}`} />
                                </button>
                                {active && (
                                  <span className="w-5 h-5 rounded-full bg-[#38BDF8] text-[#09131A] flex items-center justify-center shadow">
                                    <Check className="w-3 h-3 stroke-[2.5]" />
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="px-2.5 py-2">
                              <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                                {preset.name}
                              </div>
                              <div className="text-[9px] text-[#7B838D] truncate">{preset.desc}</div>
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </StudioScrollArea>
          )}

          {/* ======================== TRANSITIONS ======================== */}
          {workspaceMode === 'transitions' && (
            <StudioScrollArea
              className="flex-1 min-h-0"
              resetKey={activeTabKey}
              ariaLabel="Transitions library"
            >
              <div className="p-3 border-b border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <h3 className="text-xs font-semibold text-[#FAF9F6]">Transitions</h3>
                  </div>
                  <span className="font-mono text-[10px] text-[#7B838D]">
                    {TRANSITION_CATALOG.length} FX
                  </span>
                </div>

                {/* Self-Adjustment Bar */}
                <div className="p-2.5 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#9BA3AB]">Duration</span>
                      <span className="font-mono tabular-nums text-[#FAF9F6]">
                        {transitionDuration.toFixed(2)}s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={4.0}
                      step={0.05}
                      value={transitionDuration}
                      onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
                      className="w-full studio-slider"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] text-[#7B838D] mb-0.5">Easing</label>
                      <select
                        value={transitionEasing}
                        onChange={(e) => setTransitionEasing(e.target.value as TransitionEasing)}
                        className="w-full h-6 px-2 bg-[#101216] border border-white/[0.08] rounded-lg text-[10px] text-[#FAF9F6] outline-none"
                      >
                        <option value="ease-in-out">Ease In-Out</option>
                        <option value="ease-out">Ease Out</option>
                        <option value="ease-in">Ease In</option>
                        <option value="linear">Linear</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#7B838D] mb-0.5">
                        Intensity ({Math.round(transitionIntensity * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={0.25}
                        max={2.0}
                        step={0.05}
                        value={transitionIntensity}
                        onChange={(e) => setTransitionIntensity(parseFloat(e.target.value))}
                        className="w-full studio-slider mt-1.5"
                      />
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#68707A] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={transitionQuery}
                    onChange={(e) => setTransitionQuery(e.target.value)}
                    placeholder="Search 26 transitions..."
                    className="w-full h-7 pl-8 pr-6 bg-[#101216] border border-white/[0.07] focus:border-[#38BDF8]/60 rounded-lg text-[11px] text-[#FAF9F6] placeholder-[#68707A] outline-none"
                  />
                  {transitionQuery && (
                    <button
                      type="button"
                      onClick={() => setTransitionQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8E96A0] hover:text-[#FAF9F6]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {TRANSITION_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTransitionCategory(cat)}
                      className={`px-2.5 py-1 text-[10px] font-medium rounded-full whitespace-nowrap shrink-0 transition-colors ${
                        transitionCategory === cat
                          ? 'bg-[#38BDF8]/15 text-[#7DD3FC] ring-1 ring-[#38BDF8]/40'
                          : 'bg-white/[0.04] text-[#8E96A0] hover:text-[#FAF9F6] hover:bg-white/[0.08]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3">
                <div className="grid grid-cols-2 gap-2">
                  {filteredTransitions.map((tr) => {
                    const isIn = selectedClip?.transitionIn.type === tr.type;
                    const isOut = selectedClip?.transitionOut.type === tr.type;
                    const active = isIn || isOut;
                    return (
                      <motion.div
                        key={tr.type}
                        whileHover={{ y: -2 }}
                        className={`bg-[#1A1D24] hover:bg-[#20242D] rounded-xl overflow-hidden transition-all ${
                          active
                            ? 'ring-1.5 ring-[#38BDF8]'
                            : 'ring-1 ring-white/[0.07] hover:ring-[#38BDF8]/45'
                        }`}
                      >
                        <div className="h-12 px-2 pt-2">
                          <TransitionPreviewSvg type={tr.type} category={tr.category} />
                        </div>
                        <div className="px-2.5 pt-1.5 pb-2 space-y-2">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                              {tr.label}
                            </div>
                            <div className="text-[9px] text-[#7B838D] truncate">{tr.desc}</div>
                          </div>

                          <div className="grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => applyTransition('in', tr.type)}
                              className={`py-1 rounded-full text-[9px] font-semibold transition-colors ${
                                isIn
                                  ? 'bg-[#0284C7] text-white'
                                  : 'bg-white/[0.05] hover:bg-white/[0.12] text-[#dce4e4]'
                              }`}
                            >
                              {isIn ? 'In ✓' : 'In'}
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTransition('out', tr.type)}
                              className={`py-1 rounded-full text-[9px] font-semibold transition-colors ${
                                isOut
                                  ? 'bg-[#0284C7] text-white'
                                  : 'bg-white/[0.05] hover:bg-white/[0.12] text-[#dce4e4]'
                              }`}
                            >
                              {isOut ? 'Out ✓' : 'Out'}
                            </button>
                            <button
                              type="button"
                              onClick={() => applyTransition('both', tr.type)}
                              className="py-1 rounded-full bg-white/[0.05] hover:bg-[#0284C7] text-[9px] font-semibold text-[#7DD3FC] hover:text-white transition-colors"
                            >
                              Both
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </StudioScrollArea>
          )}

          {/* ======================== AUDIO STUDIO & MIXER ======================== */}
          {workspaceMode === 'audio' && project && (
            <StudioScrollArea
              className="flex-1 min-h-0"
              contentClassName="p-3 space-y-3.5"
              resetKey={activeTabKey}
              ariaLabel="Audio studio and mixer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <h3 className="text-xs font-semibold text-[#FAF9F6]">Audio Studio</h3>
                </div>
                <span className="font-mono text-[10px] tabular-nums text-[#7B838D]">Web Audio</span>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => void handleToggleVoiceover()}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  recordingVo
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-[#0284C7] hover:bg-[#0EA5E9] text-white shadow-[0_4px_14px_rgba(2,132,199,0.25)]'
                }`}
              >
                {recordingVo ? <Square className="w-3 h-3" /> : <Mic className="w-3.5 h-3.5" />}
                {recordingVo ? 'Stop & Save Voiceover to A1' : 'Record Voiceover'}
              </motion.button>

              <div className="p-2.5 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-[#9BA3AB]">
                  <span>Master Output Peak</span>
                  <span className="font-mono tabular-nums text-[#FAF9F6]">
                    {Math.round(meterLevel * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-[#0E1014] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-emerald-400 rounded-full transition-[width] duration-75"
                    style={{ width: `${Math.min(100, Math.round(meterLevel * 100))}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#FAF9F6]">
                  Sound Effects & Synth Beds
                </div>
                <div className="space-y-1.5">
                  {SFX_LIST.map((sfx) => (
                    <motion.button
                      key={sfx.kind}
                      type="button"
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => void handleGenerateSfx(sfx.kind)}
                      className="group w-full px-3 py-2 text-left bg-[#1A1D24] hover:bg-[#20242D] ring-1 ring-white/[0.06] hover:ring-[#38BDF8]/45 rounded-xl flex items-center justify-between gap-2.5 transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-[#38BDF8]/12 text-[#38BDF8] flex items-center justify-center shrink-0">
                          <Music className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-[#FAF9F6] truncate">
                            {sfx.label}
                          </div>
                          <div className="text-[9px] text-[#7B838D] truncate">
                            {sfx.desc} · {sfx.dur}
                          </div>
                        </div>
                      </div>
                      <span className="w-6 h-6 rounded-full bg-white/[0.06] group-hover:bg-[#0284C7] text-[#dce4e4] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <div className="text-[11px] font-semibold text-[#FAF9F6]">Track Faders</div>
                {project.tracks
                  .filter((t) => t.type !== 'text')
                  .map((track) => (
                    <div
                      key={track.id}
                      className="p-2.5 bg-[#1A1D24] ring-1 ring-white/[0.06] rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-semibold text-[#7DD3FC]">
                            {track.id}
                          </span>
                          <span className="text-[11px] text-[#dce4e4]">{track.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateTrack(track.id, (t) => ({ ...t, muted: !t.muted }))}
                            className={`w-6 h-5 text-[10px] font-mono rounded-full flex items-center justify-center transition-colors ${
                              track.muted
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-white/[0.06] text-[#9BA3AB] hover:text-white'
                            }`}
                            title="Mute Track"
                          >
                            {track.muted ? <VolumeX className="w-3 h-3" /> : 'M'}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateTrack(track.id, (t) => ({ ...t, solo: !t.solo }))}
                            className={`w-6 h-5 text-[10px] font-mono rounded-full flex items-center justify-center transition-colors ${
                              track.solo
                                ? 'bg-[#0284C7] text-white'
                                : 'bg-white/[0.06] text-[#9BA3AB] hover:text-white'
                            }`}
                            title="Solo Track"
                          >
                            S
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={200}
                          step={1}
                          value={track.volume}
                          onChange={(e) =>
                            updateTrack(track.id, (t) => ({
                              ...t,
                              volume: parseInt(e.target.value, 10),
                            }))
                          }
                          className="flex-1 studio-slider"
                        />
                        <span className="w-14 text-right font-mono text-[10px] tabular-nums text-[#dce4e4]">
                          {gainToDb(track.volume)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </StudioScrollArea>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
};
