import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  deleteMediaRecord,
  getProjectById,
  getProjectMediaRecords,
  saveProjectRecord,
} from '../services/db';
import { mediaCache } from '../services/mediaCache';
import { filmstripCache } from '../features/media-import/filmstripCache';
import {
  cloneClipDeep,
  createClipFromMedia,
  createDynamicTrack,
  createStickerClip,
  createTextClip,
  getDefaultTrackIdForClip,
  normalizeTrackOrder,
  reorderTrackList,
  resolveTrackAndStartForPlacement,
  splitClipAtTime,
} from '../features/timeline-engine/timelineOps';
import { getProjectDuration } from '../features/project/projectFactory';
import { createFreezeFrameAsset } from '../features/media-import/mediaAnalyzer';
import {
  DEFAULT_AUDIO,
  DEFAULT_CHROMA_KEY,
  DEFAULT_COLOR,
  DEFAULT_CROP,
  DEFAULT_EFFECTS,
  DEFAULT_MASK,
  DEFAULT_SPEED_CURVE,
  DEFAULT_STABILIZATION,
  DEFAULT_TEXT,
  DEFAULT_TRANSFORM,
  type Clip,
  type ClipStickerSettings,
  type ClipTextSettings,
  type MediaAsset,
  type Project,
  type ResolutionPreset,
  type RightPanelTab,
  type StickerKind,
  type TimelineTool,
  type ToastNotification,
  type Track,
  type TrackType,
  type WorkspaceMode,
} from '../types/editor';
import { createId } from '../utils/id';

const MAX_HISTORY = 50;

function migrateProject(raw: Project): Project {
  return {
    ...raw,
    proxyMode: Boolean(raw.proxyMode),
    tracks: normalizeTrackOrder(raw.tracks || []),
    clips: (raw.clips || []).map((c) => ({
      ...c,
      speedCurve: c.speedCurve ?? { ...DEFAULT_SPEED_CURVE },
      reversed: Boolean(c.reversed),
      transform: { ...DEFAULT_TRANSFORM, ...(c.transform || {}) },
      crop: { ...DEFAULT_CROP, ...(c.crop || {}) },
      keyframes: Array.isArray(c.keyframes) ? c.keyframes : [],
      blendMode: c.blendMode ?? 'source-over',
      color: { ...DEFAULT_COLOR, ...(c.color || {}) },
      effects: { ...DEFAULT_EFFECTS, ...(c.effects || {}) },
      effectsStack: Array.isArray(c.effectsStack)
        ? c.effectsStack.map((fx) => ({ ...fx }))
        : [],
      appliedFilter: c.appliedFilter ? { ...c.appliedFilter } : undefined,
      chromaKey: { ...DEFAULT_CHROMA_KEY, ...(c.chromaKey || {}) },
      mask: { ...DEFAULT_MASK, ...(c.mask || {}) },
      stabilization: {
        ...DEFAULT_STABILIZATION,
        ...(c.stabilization || {}),
        offsets: Array.isArray(c.stabilization?.offsets) ? c.stabilization.offsets : [],
      },
      audio: { ...DEFAULT_AUDIO, ...(c.audio || {}) },
      transitionIn: {
        easing: 'ease-in-out',
        intensity: 1,
        ...(c.transitionIn || { type: 'none', duration: 0.5 }),
      },
      transitionOut: {
        easing: 'ease-in-out',
        intensity: 1,
        ...(c.transitionOut || { type: 'none', duration: 0.5 }),
      },
      text: c.text ? { ...DEFAULT_TEXT, ...c.text } : undefined,
    })),
  };
}

interface EditorContextValue {
  project: Project | null;
  loading: boolean;
  loadError: string | null;
  assets: MediaAsset[];
  assetsMap: Map<string, MediaAsset>;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: Clip | null;
  playhead: number;
  isPlaying: boolean;
  loopPlayback: boolean;
  zoomPps: number;
  snapEnabled: boolean;
  activeTool: TimelineTool;
  workspaceMode: WorkspaceMode;
  rightPanelTab: RightPanelTab;
  masterVolume: number;
  masterMuted: boolean;
  isDirty: boolean;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  toasts: ToastNotification[];
  projectDuration: number;
  isPickingTrackTarget: boolean;
  lastPickedRoi: { x: number; y: number } | null;

  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setActiveTool: (tool: TimelineTool) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setZoomPps: (pps: number | ((prev: number) => number)) => void;
  setPlayhead: (time: number | ((prev: number) => number)) => void;
  setIsPlaying: (playing: boolean | ((prev: boolean) => boolean)) => void;
  setLoopPlayback: (loop: boolean | ((prev: boolean) => boolean)) => void;
  setMasterVolume: (vol: number) => void;
  setMasterMuted: (muted: boolean) => void;
  selectClip: (clipId: string | null) => void;
  selectTrack: (trackId: string | null) => void;
  setIsPickingTrackTarget: (picking: boolean) => void;
  setLastPickedRoi: (roi: { x: number; y: number } | null) => void;
  registerMonitorCanvas: (canvas: HTMLCanvasElement | null) => void;

  commitProjectEdit: (updater: (prev: Project) => Project, recordHistory?: boolean) => void;
  pushHistoryCheckpoint: () => void;
  updateClip: (clipId: string, updater: (clip: Clip) => Clip, recordHistory?: boolean) => void;
  updateTrack: (trackId: string, updater: (track: Track) => Track) => void;
  addTrack: (type: TrackType, customName?: string, insertIndex?: number) => Track | null;
  deleteTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  reorderTrack: (trackId: string, directionOrIndex: 'up' | 'down' | number) => void;
  addMediaToTimeline: (asset: MediaAsset, trackId?: string, startTime?: number) => void;
  addMediaToNewTrack: (asset: MediaAsset, startTime: number, trackType?: TrackType) => void;
  addMultipleMediaToTimeline: (assets: MediaAsset[]) => void;
  applyTextStyleToAllSubtitles: (sourceText: Partial<ClipTextSettings>) => void;
  addTextClipToTimeline: (
    name: string,
    textOverrides?: Partial<ClipTextSettings>,
    startTime?: number,
    duration?: number
  ) => void;
  addStickerClipToTimeline: (
    name: string,
    kind: StickerKind,
    overrides?: Partial<ClipStickerSettings>,
    startTime?: number
  ) => void;
  freezeFrameAtPlayhead: () => Promise<void>;
  splitAtPlayhead: (targetClipId?: string) => void;
  deleteSelectedClip: () => void;
  duplicateSelectedClip: () => void;
  renameProject: (name: string) => void;
  setProjectResolution: (resolution: ResolutionPreset) => void;
  toggleProxyMode: () => void;

  registerAsset: (asset: MediaAsset) => void;
  updateAsset: (asset: MediaAsset) => void;
  removeAsset: (mediaId: string) => Promise<void>;

  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  notify: (message: string, variant?: ToastNotification['variant']) => void;
  dismissToast: (id: string) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export const EditorProvider: React.FC<{ projectId: string; children: React.ReactNode }> = ({
  projectId,
  children,
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>('V1');
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [zoomPps, setZoomPps] = useState(64);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [activeTool, setActiveTool] = useState<TimelineTool>('select');
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>('media');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('resources');
  const [masterVolume, setMasterVolume] = useState(1);
  const [masterMuted, setMasterMuted] = useState(false);

  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspaceModeState(mode);
    if (mode !== 'edit') {
      setRightPanelTab('resources');
    }
  }, []);
  const [isPickingTrackTarget, setIsPickingTrackTarget] = useState(false);
  const [lastPickedRoi, setLastPickedRoi] = useState<{ x: number; y: number } | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const [past, setPast] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);
  const projectRef = useRef<Project | null>(null);
  projectRef.current = project;

  const monitorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const registerMonitorCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    monitorCanvasRef.current = canvas;
  }, []);

  const notify = useCallback((message: string, variant: ToastNotification['variant'] = 'info') => {
    const id = createId('toast');
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setPast([]);
    setFuture([]);
    setSelectedClipId(null);
    setPlayhead(0);
    setIsPlaying(false);

    (async () => {
      try {
        const [proj, mediaRecords] = await Promise.all([
          getProjectById(projectId),
          getProjectMediaRecords(projectId),
        ]);
        if (!active) return;
        if (!proj) {
          setLoadError('Project not found in local IndexedDB storage.');
          setLoading(false);
          return;
        }
        const hydrated = mediaRecords.map((rec) => mediaCache.hydrateRecord(rec));
        setProject(migrateProject(proj));
        setAssets(hydrated);
        setLastSavedAt(proj.updatedAt);
        setIsDirty(false);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load project.');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      mediaCache.revokeAll();
      filmstripCache.clearAll();
    };
  }, [projectId]);

  const saveNow = useCallback(async () => {
    const current = projectRef.current;
    if (!current) return;

    let capturedThumbnail = current.thumbnailDataUrl;
    const hasVisualClip = current.clips.some((c) => c.type !== 'audio');
    const canvas = monitorCanvasRef.current;
    if (hasVisualClip && canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const thumbW = 320;
        const thumbH = Math.max(120, Math.round((canvas.height / canvas.width) * thumbW));
        const off = document.createElement('canvas');
        off.width = thumbW;
        off.height = thumbH;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, 0, thumbW, thumbH);
          capturedThumbnail = off.toDataURL('image/jpeg', 0.72);
        }
      } catch {
        // Keep existing thumbnail if canvas capture fails
      }
    } else if (!hasVisualClip) {
      capturedThumbnail = undefined;
    }

    const updated: Project = {
      ...current,
      thumbnailDataUrl: capturedThumbnail,
      updatedAt: Date.now(),
    };
    await saveProjectRecord(updated);
    setProject(updated);
    setLastSavedAt(updated.updatedAt);
    setIsDirty(false);
  }, []);

  useEffect(() => {
    if (!isDirty || !project) return;
    const timer = window.setTimeout(() => {
      void saveNow().catch(() => {
        notify('Autosave failed — check browser storage quota.', 'error');
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isDirty, project, saveNow, notify]);

  const pushHistoryCheckpoint = useCallback(() => {
    setProject((curr) => {
      if (!curr) return curr;
      setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), curr]);
      setFuture([]);
      return curr;
    });
  }, []);

  const commitProjectEdit = useCallback(
    (updater: (prev: Project) => Project, recordHistory = true) => {
      setProject((curr) => {
        if (!curr) return curr;
        if (recordHistory) {
          setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), curr]);
          setFuture([]);
        }
        const next = updater(curr);
        setIsDirty(true);
        return {
          ...next,
          updatedAt: Date.now(),
        };
      });
    },
    []
  );

  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0 || !projectRef.current) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      setFuture((f) => [projectRef.current!, ...f.slice(0, MAX_HISTORY - 1)]);
      setProject(previous);
      setIsDirty(true);
      if (selectedClipId && !previous.clips.some((c) => c.id === selectedClipId)) {
        setSelectedClipId(null);
      }
      return prevPast.slice(0, -1);
    });
  }, [selectedClipId]);

  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0 || !projectRef.current) return prevFuture;
      const next = prevFuture[0];
      setPast((p) => [...p.slice(-(MAX_HISTORY - 1)), projectRef.current!]);
      setProject(next);
      setIsDirty(true);
      return prevFuture.slice(1);
    });
  }, []);

  const updateClip = useCallback(
    (clipId: string, updater: (clip: Clip) => Clip, recordHistory = true) => {
      commitProjectEdit(
        (prev) => ({
          ...prev,
          clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
        }),
        recordHistory
      );
    },
    [commitProjectEdit]
  );

  const updateTrack = useCallback(
    (trackId: string, updater: (track: Track) => Track) => {
      commitProjectEdit((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === trackId ? updater(t) : t)),
      }));
    },
    [commitProjectEdit]
  );

  const addTrack = useCallback(
    (type: TrackType, customName?: string, insertIndex?: number): Track | null => {
      if (!projectRef.current) return null;
      let created: Track | null = null;
      commitProjectEdit((prev) => {
        const res = createDynamicTrack(type, prev.tracks, customName, insertIndex);
        created = res.newTrack;
        return {
          ...prev,
          tracks: res.nextTracks,
        };
      });
      if (created) {
        setSelectedTrackId((created as Track).id);
        notify(`Created track "${(created as Track).name}".`, 'success');
      }
      return created;
    },
    [commitProjectEdit, notify]
  );

  const deleteTrack = useCallback(
    (trackId: string) => {
      const curr = projectRef.current;
      if (!curr) return;
      if (curr.tracks.length <= 1) {
        notify('At least one track must remain on the timeline.', 'warning');
        return;
      }
      const target = curr.tracks.find((t) => t.id === trackId);
      if (!target) return;
      const removedClipIds = new Set(
        curr.clips.filter((c) => c.trackId === trackId).map((c) => c.id)
      );
      commitProjectEdit((prev) => ({
        ...prev,
        tracks: normalizeTrackOrder(prev.tracks.filter((t) => t.id !== trackId)),
        clips: prev.clips.filter((c) => c.trackId !== trackId),
      }));
      if (selectedClipId && removedClipIds.has(selectedClipId)) {
        setSelectedClipId(null);
      }
      if (selectedTrackId === trackId) {
        setSelectedTrackId(curr.tracks.find((t) => t.id !== trackId)?.id ?? null);
      }
      notify(`Deleted track "${target.name}".`, 'info');
    },
    [commitProjectEdit, notify, selectedClipId, selectedTrackId]
  );

  const renameTrack = useCallback(
    (trackId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      commitProjectEdit((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, name: trimmed } : t)),
      }));
    },
    [commitProjectEdit]
  );

  const reorderTrack = useCallback(
    (trackId: string, directionOrIndex: 'up' | 'down' | number) => {
      commitProjectEdit((prev) => ({
        ...prev,
        tracks: reorderTrackList(prev.tracks, trackId, directionOrIndex),
      }));
    },
    [commitProjectEdit]
  );

  const addMediaToTimeline = useCallback(
    (asset: MediaAsset, trackId?: string, startTime?: number) => {
      if (!projectRef.current) return;
      if (trackId) {
        const explicitTrack = projectRef.current.tracks.find((t) => t.id === trackId);
        if (explicitTrack?.locked) {
          notify(`Track ${explicitTrack.id} is locked. Unlock it before adding clips.`, 'warning');
          return;
        }
      }
      const targetStart = startTime ?? playhead;
      const estDuration = asset.type === 'image' ? 5 : Math.max(0.2, asset.duration);
      let createdId = '';
      let placedTrackId = trackId ?? '';
      let spawnedTrackName: string | undefined;

      commitProjectEdit((prev) => {
        const placement = resolveTrackAndStartForPlacement(
          prev.clips,
          prev.tracks,
          asset.type,
          trackId,
          targetStart,
          estDuration
        );
        placedTrackId = placement.trackId;
        spawnedTrackName = placement.createdTrack?.name;
        const clip = createClipFromMedia(
          asset,
          placement.trackId,
          placement.startTime,
          prev.clips,
          true
        );
        createdId = clip.id;
        return {
          ...prev,
          tracks: placement.tracks,
          clips: [...prev.clips, clip],
        };
      });
      if (createdId) {
        setSelectedClipId(createdId);
        setSelectedTrackId(placedTrackId);
        if (spawnedTrackName) {
          notify(`Auto-created overlay track "${spawnedTrackName}".`, 'info');
        }
      }
    },
    [commitProjectEdit, notify, playhead]
  );

  const addMediaToNewTrack = useCallback(
    (asset: MediaAsset, startTime: number, trackType?: TrackType) => {
      if (!projectRef.current) return;
      const targetType: TrackType =
        trackType ?? (asset.type === 'audio' ? 'audio' : 'video');
      let createdClipId = '';
      let createdTrackId = '';
      let createdTrackName = '';

      commitProjectEdit((prev) => {
        const { newTrack, nextTracks } = createDynamicTrack(targetType, prev.tracks);
        createdTrackId = newTrack.id;
        createdTrackName = newTrack.name;
        const clip = createClipFromMedia(asset, newTrack.id, Math.max(0, startTime), prev.clips, true);
        createdClipId = clip.id;
        return {
          ...prev,
          tracks: nextTracks,
          clips: [...prev.clips, clip],
        };
      });
      if (createdClipId) {
        setSelectedClipId(createdClipId);
        setSelectedTrackId(createdTrackId);
        notify(`Placed clip on new track "${createdTrackName}".`, 'success');
      }
    },
    [commitProjectEdit, notify]
  );

  const addMultipleMediaToTimeline = useCallback(
    (items: MediaAsset[]) => {
      if (!projectRef.current || items.length === 0) return;
      let addedCount = 0;
      let lastId = '';
      commitProjectEdit((prev) => {
        let nextClips = [...prev.clips];
        let nextTracks = [...prev.tracks];
        for (const asset of items) {
          const desiredType: TrackType = asset.type === 'audio' ? 'audio' : 'video';
          let targetTrackId = getDefaultTrackIdForClip(asset.type, nextTracks);
          let track = nextTracks.find((t) => t.id === targetTrackId);
          if (!track || track.locked) {
            const unlocked = nextTracks.find((t) => t.type === desiredType && !t.locked);
            if (unlocked) {
              targetTrackId = unlocked.id;
              track = unlocked;
            } else {
              const created = createDynamicTrack(desiredType, nextTracks);
              nextTracks = created.nextTracks;
              targetTrackId = created.newTrack.id;
              track = created.newTrack;
            }
          }
          const trackClips = nextClips.filter((c) => c.trackId === targetTrackId);
          const trackEnd = trackClips.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0);
          const clip = createClipFromMedia(asset, targetTrackId, trackEnd, nextClips, true);
          nextClips = [...nextClips, clip];
          lastId = clip.id;
          addedCount++;
        }
        return { ...prev, tracks: nextTracks, clips: nextClips };
      });
      if (addedCount > 0) {
        if (lastId) setSelectedClipId(lastId);
        notify(`Appended ${addedCount} ${addedCount === 1 ? 'clip' : 'clips'} sequentially to timeline.`, 'success');
      } else {
        notify('Target tracks are locked. Unlock track to add clips.', 'warning');
      }
    },
    [commitProjectEdit, notify]
  );

  const applyTextStyleToAllSubtitles = useCallback(
    (stylePatch: Partial<ClipTextSettings>) => {
      if (!projectRef.current) return;
      const textCount = projectRef.current.clips.filter((c) => c.type === 'text' && c.text).length;
      if (textCount === 0) {
        notify('No text or subtitle clips on timeline yet.', 'info');
        return;
      }
      commitProjectEdit((prev) => ({
        ...prev,
        clips: prev.clips.map((c) => {
          if (c.type !== 'text' || !c.text) return c;
          const { content: _ignoreContent, ...styleOnly } = stylePatch;
          return {
            ...c,
            text: {
              ...c.text,
              ...styleOnly,
            },
          };
        }),
      }));
      notify(`Applied custom subtitle style & animation to all ${textCount} text clips.`, 'success');
    },
    [commitProjectEdit, notify]
  );

  const addTextClipToTimeline = useCallback(
    (
      name: string,
      textOverrides?: Partial<ClipTextSettings>,
      startTime?: number,
      duration = 4
    ) => {
      if (!projectRef.current) return;
      let createdId = '';
      let targetTrackId = '';
      commitProjectEdit((prev) => {
        const placement = resolveTrackAndStartForPlacement(
          prev.clips,
          prev.tracks,
          'text',
          undefined,
          startTime ?? playhead,
          duration
        );
        targetTrackId = placement.trackId;
        const clip = createTextClip(
          name,
          placement.trackId,
          placement.startTime,
          prev.clips,
          textOverrides,
          duration,
          true
        );
        createdId = clip.id;
        return {
          ...prev,
          tracks: placement.tracks,
          clips: [...prev.clips, clip],
        };
      });
      if (createdId) {
        setSelectedClipId(createdId);
        setSelectedTrackId(targetTrackId);
      }
    },
    [commitProjectEdit, playhead]
  );

  const addStickerClipToTimeline = useCallback(
    (
      name: string,
      kind: StickerKind,
      overrides?: Partial<ClipStickerSettings>,
      startTime?: number
    ) => {
      if (!projectRef.current) return;
      let createdId = '';
      let targetTrackId = '';
      commitProjectEdit((prev) => {
        const placement = resolveTrackAndStartForPlacement(
          prev.clips,
          prev.tracks,
          'sticker',
          undefined,
          startTime ?? playhead,
          4
        );
        targetTrackId = placement.trackId;
        const clip = createStickerClip(
          name,
          kind,
          placement.trackId,
          placement.startTime,
          prev.clips,
          overrides,
          4,
          true
        );
        createdId = clip.id;
        return {
          ...prev,
          tracks: placement.tracks,
          clips: [...prev.clips, clip],
        };
      });
      if (createdId) {
        setSelectedClipId(createdId);
        setSelectedTrackId(targetTrackId);
      }
    },
    [commitProjectEdit, playhead]
  );

  const freezeFrameAtPlayhead = useCallback(async () => {
    const current = projectRef.current;
    const canvas = monitorCanvasRef.current;
    if (!current || !canvas) {
      notify('Open a sequence with visible footage to capture a freeze frame.', 'warning');
      return;
    }
    setIsPlaying(false);
    try {
      const asset = await createFreezeFrameAsset(canvas, `Frame_${Math.round(playhead * current.fps)}`, current.id);
      setAssets((prev) => [...prev, asset]);
      let newClipId = '';
      commitProjectEdit((prev) => {
        const placement = resolveTrackAndStartForPlacement(
          prev.clips,
          prev.tracks,
          'image',
          undefined,
          playhead,
          3
        );
        const freezeClip = createClipFromMedia(asset, placement.trackId, placement.startTime, prev.clips, true);
        freezeClip.duration = 3;
        freezeClip.sourceOut = 3;
        newClipId = freezeClip.id;
        return {
          ...prev,
          tracks: placement.tracks,
          clips: [...prev.clips, freezeClip],
        };
      });
      if (newClipId) setSelectedClipId(newClipId);
      notify('Captured 3s freeze frame into Media Pool & Timeline.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to capture freeze frame.', 'error');
    }
  }, [commitProjectEdit, notify, playhead]);

  const splitAtPlayhead = useCallback(
    (targetClipId?: string) => {
      const current = projectRef.current;
      if (!current) return;

      let candidate: Clip | undefined;
      if (targetClipId) {
        candidate = current.clips.find((c) => c.id === targetClipId);
      } else if (selectedClipId) {
        const sel = current.clips.find((c) => c.id === selectedClipId);
        if (sel && playhead > sel.startTime && playhead < sel.startTime + sel.duration) {
          candidate = sel;
        }
      }
      if (!candidate) {
        candidate = current.clips.find(
          (c) => playhead > c.startTime + 0.05 && playhead < c.startTime + c.duration - 0.05
        );
      }
      if (!candidate) {
        notify('Move the playhead inside a clip to split it.', 'info');
        return;
      }

      const track = current.tracks.find((t) => t.id === candidate!.trackId);
      if (track?.locked) {
        notify(`Track ${track.id} is locked.`, 'warning');
        return;
      }

      const nextClips = splitClipAtTime(current.clips, candidate.id, playhead);
      if (!nextClips) {
        notify('Clip segment is too short to split here.', 'warning');
        return;
      }

      commitProjectEdit((prev) => ({
        ...prev,
        clips: nextClips,
      }));
    },
    [commitProjectEdit, notify, playhead, selectedClipId]
  );

  const deleteSelectedClip = useCallback(() => {
    if (!selectedClipId || !projectRef.current) return;
    const target = projectRef.current.clips.find((c) => c.id === selectedClipId);
    if (!target) return;
    const track = projectRef.current.tracks.find((t) => t.id === target.trackId);
    if (track?.locked) {
      notify(`Track ${track.id} is locked.`, 'warning');
      return;
    }
    commitProjectEdit((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.id !== selectedClipId),
    }));
    setSelectedClipId(null);
  }, [commitProjectEdit, notify, selectedClipId]);

  const duplicateSelectedClip = useCallback(() => {
    if (!selectedClipId || !projectRef.current) return;
    const target = projectRef.current.clips.find((c) => c.id === selectedClipId);
    if (!target) return;
    let newId = '';
    commitProjectEdit((prev) => {
      const cloned = cloneClipDeep(target, {
        id: createId('clip'),
        startTime: Number((target.startTime + target.duration).toFixed(3)),
      });
      newId = cloned.id;
      return {
        ...prev,
        clips: [...prev.clips, cloned],
      };
    });
    if (newId) setSelectedClipId(newId);
  }, [commitProjectEdit, selectedClipId]);

  const renameProject = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      commitProjectEdit((prev) => ({
        ...prev,
        name: trimmed,
      }));
    },
    [commitProjectEdit]
  );

  const setProjectResolution = useCallback(
    (resolution: ResolutionPreset) => {
      commitProjectEdit((prev) => ({
        ...prev,
        resolution,
      }));
      notify(`Sequence format updated to ${resolution.label}.`, 'success');
    },
    [commitProjectEdit, notify]
  );

  const toggleProxyMode = useCallback(() => {
    commitProjectEdit((prev) => ({
      ...prev,
      proxyMode: !prev.proxyMode,
    }), false);
  }, [commitProjectEdit]);

  const registerAsset = useCallback((asset: MediaAsset) => {
    setAssets((prev) => [...prev, asset]);
  }, []);

  const updateAsset = useCallback((updated: MediaAsset) => {
    setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  const removeAsset = useCallback(
    async (mediaId: string) => {
      await deleteMediaRecord(mediaId);
      mediaCache.revoke(mediaId);
      setAssets((prev) => prev.filter((a) => a.id !== mediaId));
      commitProjectEdit((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.mediaId !== mediaId),
      }));
      if (selectedClipId && projectRef.current?.clips.find((c) => c.id === selectedClipId)?.mediaId === mediaId) {
        setSelectedClipId(null);
      }
      notify('Media asset removed from library and timeline.', 'info');
    },
    [commitProjectEdit, notify, selectedClipId]
  );

  const assetsMap = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const a of assets) map.set(a.id, a);
    return map;
  }, [assets]);

  const selectedClip = useMemo(() => {
    if (!project || !selectedClipId) return null;
    return project.clips.find((c) => c.id === selectedClipId) ?? null;
  }, [project, selectedClipId]);

  const projectDuration = useMemo(() => {
    return project ? getProjectDuration(project) : 0;
  }, [project]);

  const selectClip = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
    if (clipId && projectRef.current) {
      const found = projectRef.current.clips.find((c) => c.id === clipId);
      if (found) setSelectedTrackId(found.trackId);
    }
  }, []);

  const value: EditorContextValue = {
    project,
    loading,
    loadError,
    assets,
    assetsMap,
    selectedClipId,
    selectedTrackId,
    selectedClip,
    playhead,
    isPlaying,
    loopPlayback,
    zoomPps,
    snapEnabled,
    activeTool,
    workspaceMode,
    rightPanelTab,
    masterVolume,
    masterMuted,
    isDirty,
    lastSavedAt,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    toasts,
    projectDuration,
    isPickingTrackTarget,
    lastPickedRoi,
    setWorkspaceMode,
    setRightPanelTab,
    setActiveTool,
    setSnapEnabled,
    setZoomPps,
    setPlayhead,
    setIsPlaying,
    setLoopPlayback,
    setMasterVolume,
    setMasterMuted,
    selectClip,
    selectTrack: setSelectedTrackId,
    setIsPickingTrackTarget,
    setLastPickedRoi,
    registerMonitorCanvas,
    commitProjectEdit,
    pushHistoryCheckpoint,
    updateClip,
    updateTrack,
    addTrack,
    deleteTrack,
    renameTrack,
    reorderTrack,
    addMediaToTimeline,
    addMediaToNewTrack,
    addMultipleMediaToTimeline,
    applyTextStyleToAllSubtitles,
    addTextClipToTimeline,
    addStickerClipToTimeline,
    freezeFrameAtPlayhead,
    splitAtPlayhead,
    deleteSelectedClip,
    duplicateSelectedClip,
    renameProject,
    setProjectResolution,
    toggleProxyMode,
    registerAsset,
    updateAsset,
    removeAsset,
    undo,
    redo,
    saveNow,
    notify,
    dismissToast,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorStore(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditorStore must be used inside EditorProvider');
  return ctx;
}
