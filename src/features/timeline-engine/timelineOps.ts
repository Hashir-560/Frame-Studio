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
  type StickerKind,
  type Track,
  type TrackType,
} from '../../types/editor';
import { createId } from '../../utils/id';

export const MIN_CLIP_DURATION = 0.2;

export function normalizeTrackOrder(tracks: Track[]): Track[] {
  return [...tracks]
    .sort((a, b) => a.order - b.order)
    .map((t, idx) => ({ ...t, order: idx }));
}

export function getCompatibleTracks(clipType: Clip['type'], tracks: Track[]): Track[] {
  const sorted = normalizeTrackOrder(tracks);
  if (clipType === 'audio') {
    return sorted.filter((t) => t.type === 'audio');
  }
  if (clipType === 'text' || clipType === 'sticker') {
    return sorted.filter((t) => t.type === 'text' || t.type === 'video');
  }
  return sorted.filter((t) => t.type === 'video');
}

export function getDefaultTrackIdForClip(clipType: Clip['type'], tracks: Track[]): string {
  const sorted = normalizeTrackOrder(tracks);
  if (clipType === 'audio') {
    return sorted.find((t) => t.id === 'A1')?.id ?? sorted.find((t) => t.type === 'audio')?.id ?? 'A1';
  }
  if (clipType === 'text' || clipType === 'sticker') {
    return sorted.find((t) => t.id === 'T1')?.id ?? sorted.find((t) => t.type === 'text')?.id ?? 'T1';
  }
  // Prefer base V1 track (lowest video track in visual stack), or first video track
  const videoTracks = sorted.filter((t) => t.type === 'video');
  return (
    videoTracks.find((t) => t.id === 'V1')?.id ??
    videoTracks[videoTracks.length - 1]?.id ??
    'V1'
  );
}

export function hasClipOverlap(
  clips: Clip[],
  trackId: string,
  startTime: number,
  duration: number,
  excludeClipId?: string
): boolean {
  const end = startTime + duration;
  for (const c of clips) {
    if (c.trackId !== trackId || c.id === excludeClipId) continue;
    const cEnd = c.startTime + c.duration;
    if (startTime < cEnd - 0.005 && end > c.startTime + 0.005) {
      return true;
    }
  }
  return false;
}

export function createDynamicTrack(
  type: TrackType,
  tracks: Track[],
  customName?: string,
  insertIndex?: number
): { newTrack: Track; nextTracks: Track[] } {
  const sorted = normalizeTrackOrder(tracks);
  const prefix = type === 'video' ? 'V' : type === 'audio' ? 'A' : 'T';
  const existingIds = new Set(sorted.map((t) => t.id));

  let maxNum = 0;
  for (const t of sorted) {
    if (t.type === type) {
      const m = t.id.match(/^[VAT](\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
  }
  let num = maxNum + 1;
  while (existingIds.has(`${prefix}${num}`)) num++;

  const id = `${prefix}${num}`;
  const defaultLabel =
    type === 'video' ? `Video ${num}` : type === 'audio' ? `Audio ${num}` : `Text ${num}`;

  const newTrack: Track = {
    id,
    name: customName?.trim() || defaultLabel,
    type,
    order: 0,
    muted: false,
    solo: false,
    locked: false,
    hidden: false,
    volume: 100,
  };

  let targetIdx = insertIndex;
  if (targetIdx === undefined) {
    if (type === 'text') {
      // Text tracks sit at the top of the visual stack
      const firstTextIdx = sorted.findIndex((t) => t.type === 'text');
      targetIdx = firstTextIdx !== -1 ? firstTextIdx : 0;
    } else if (type === 'video') {
      // New video overlay track sits right above the highest existing video track (below text)
      const firstVideoIdx = sorted.findIndex((t) => t.type === 'video');
      if (firstVideoIdx !== -1) {
        targetIdx = firstVideoIdx;
      } else {
        const firstAudioIdx = sorted.findIndex((t) => t.type === 'audio');
        targetIdx = firstAudioIdx !== -1 ? firstAudioIdx : sorted.length;
      }
    } else {
      // Audio tracks append at the bottom
      targetIdx = sorted.length;
    }
  }

  const clampedIdx = Math.max(0, Math.min(sorted.length, targetIdx));
  const next = [...sorted];
  next.splice(clampedIdx, 0, newTrack);
  const normalized = next.map((t, idx) => ({ ...t, order: idx }));
  return {
    newTrack: normalized[clampedIdx],
    nextTracks: normalized,
  };
}

export function reorderTrackList(
  tracks: Track[],
  trackId: string,
  directionOrIndex: 'up' | 'down' | number
): Track[] {
  const sorted = normalizeTrackOrder(tracks);
  const fromIdx = sorted.findIndex((t) => t.id === trackId);
  if (fromIdx === -1) return sorted;

  const toIdx =
    directionOrIndex === 'up'
      ? Math.max(0, fromIdx - 1)
      : directionOrIndex === 'down'
      ? Math.min(sorted.length - 1, fromIdx + 1)
      : Math.max(0, Math.min(sorted.length - 1, directionOrIndex));

  if (toIdx === fromIdx) return sorted;
  const copy = [...sorted];
  const [moved] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, moved);
  return copy.map((t, idx) => ({ ...t, order: idx }));
}

export function findAvailableStartTime(
  clips: Clip[],
  trackId: string,
  desiredStart: number,
  duration: number
): number {
  const trackClips = clips
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.startTime - b.startTime);

  let candidate = Math.max(0, desiredStart);
  for (const existing of trackClips) {
    const existingEnd = existing.startTime + existing.duration;
    if (candidate + duration <= existing.startTime + 0.001) {
      break;
    }
    if (candidate < existingEnd - 0.001 && candidate + duration > existing.startTime + 0.001) {
      candidate = existingEnd;
    }
  }
  return Number(candidate.toFixed(3));
}

/**
 * Resolves exact placement at desiredStart without forcing users to split existing clips.
 * If the desired track already has a clip at [desiredStart, desiredStart + duration],
 * it looks for a free compatible unlocked track or automatically creates a new overlay/audio/text track.
 */
export function resolveTrackAndStartForPlacement(
  clips: Clip[],
  tracks: Track[],
  clipType: Clip['type'],
  desiredTrackId: string | undefined,
  desiredStart: number,
  duration: number
): { trackId: string; startTime: number; tracks: Track[]; createdTrack?: Track } {
  const safeStart = Math.max(0, Number(desiredStart.toFixed(3)));
  const sorted = normalizeTrackOrder(tracks);
  const compatible = getCompatibleTracks(clipType, sorted);

  const preferredTrack = desiredTrackId
    ? compatible.find((t) => t.id === desiredTrackId)
    : compatible.find((t) => t.id === getDefaultTrackIdForClip(clipType, sorted));

  if (
    preferredTrack &&
    !preferredTrack.locked &&
    !hasClipOverlap(clips, preferredTrack.id, safeStart, duration)
  ) {
    return { trackId: preferredTrack.id, startTime: safeStart, tracks: sorted };
  }

  // Try another unlocked compatible track where this time window is free
  // For video/text, search upward (lower order index) first so overlays stack naturally above
  const orderedCandidates =
    clipType === 'audio' ? compatible : [...compatible].reverse();

  for (const candidate of orderedCandidates) {
    if (candidate.locked) continue;
    if (!hasClipOverlap(clips, candidate.id, safeStart, duration)) {
      return { trackId: candidate.id, startTime: safeStart, tracks: sorted };
    }
  }

  // Otherwise auto-create a new track of the matching type so nothing needs to be split
  const newType: TrackType =
    clipType === 'audio' ? 'audio' : clipType === 'text' || clipType === 'sticker' ? 'text' : 'video';

  let insertIdx: number | undefined;
  if (preferredTrack) {
    const prefIdx = sorted.findIndex((t) => t.id === preferredTrack.id);
    if (prefIdx !== -1) {
      insertIdx = newType === 'audio' ? prefIdx + 1 : prefIdx;
    }
  }

  const { newTrack, nextTracks } = createDynamicTrack(newType, sorted, undefined, insertIdx);
  return {
    trackId: newTrack.id,
    startTime: safeStart,
    tracks: nextTracks,
    createdTrack: newTrack,
  };
}

function createBaseClipFields() {
  return {
    speed: 1,
    speedCurve: { ...DEFAULT_SPEED_CURVE },
    reversed: false,
    transform: { ...DEFAULT_TRANSFORM },
    crop: { ...DEFAULT_CROP },
    keyframes: [],
    blendMode: 'source-over' as const,
    color: { ...DEFAULT_COLOR },
    effects: { ...DEFAULT_EFFECTS },
    effectsStack: [],
    appliedFilter: undefined,
    chromaKey: { ...DEFAULT_CHROMA_KEY },
    mask: { ...DEFAULT_MASK },
    stabilization: { ...DEFAULT_STABILIZATION, offsets: [] },
    audio: { ...DEFAULT_AUDIO },
    transitionIn: { type: 'none' as const, duration: 0.5, easing: 'ease-in-out' as const, intensity: 1 },
    transitionOut: { type: 'none' as const, duration: 0.5, easing: 'ease-in-out' as const, intensity: 1 },
  };
}

export function createClipFromMedia(
  asset: MediaAsset,
  trackId: string,
  startTime: number,
  existingClips: Clip[],
  allowExactAtTime = false
): Clip {
  const defaultDur = asset.type === 'image' ? 5 : Math.max(MIN_CLIP_DURATION, asset.duration);
  const safeStart = allowExactAtTime
    ? Math.max(0, Number(startTime.toFixed(3)))
    : findAvailableStartTime(existingClips, trackId, startTime, defaultDur);
  return {
    id: createId('clip'),
    mediaId: asset.id,
    trackId,
    type: asset.type,
    name: asset.name,
    startTime: safeStart,
    duration: defaultDur,
    sourceIn: 0,
    sourceOut: defaultDur,
    mediaDuration: asset.type === 'image' ? Infinity : asset.duration,
    ...createBaseClipFields(),
  };
}

export function createTextClip(
  name: string,
  trackId: string,
  startTime: number,
  existingClips: Clip[],
  textOverrides?: Partial<ClipTextSettings>,
  duration = 4,
  allowExactAtTime = false
): Clip {
  const safeStart = allowExactAtTime
    ? Math.max(0, Number(startTime.toFixed(3)))
    : findAvailableStartTime(existingClips, trackId, startTime, duration);
  return {
    id: createId('clip'),
    mediaId: null,
    trackId,
    type: 'text',
    name,
    startTime: safeStart,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    mediaDuration: Infinity,
    ...createBaseClipFields(),
    audio: { ...DEFAULT_AUDIO, muted: true },
    transitionIn: { type: 'none', duration: 0.4, easing: 'ease-in-out', intensity: 1 },
    transitionOut: { type: 'none', duration: 0.4, easing: 'ease-in-out', intensity: 1 },
    text: {
      ...DEFAULT_TEXT,
      ...textOverrides,
    },
  };
}

export function createStickerClip(
  name: string,
  kind: StickerKind,
  trackId: string,
  startTime: number,
  existingClips: Clip[],
  overrides?: Partial<ClipStickerSettings>,
  duration = 4,
  allowExactAtTime = false
): Clip {
  const safeStart = allowExactAtTime
    ? Math.max(0, Number(startTime.toFixed(3)))
    : findAvailableStartTime(existingClips, trackId, startTime, duration);
  return {
    id: createId('clip'),
    mediaId: null,
    trackId,
    type: 'sticker',
    name,
    startTime: safeStart,
    duration,
    sourceIn: 0,
    sourceOut: duration,
    mediaDuration: Infinity,
    ...createBaseClipFields(),
    audio: { ...DEFAULT_AUDIO, muted: true },
    sticker: {
      kind,
      color: '#FAF9F6',
      accentColor: '#b9c9d1',
      label: name,
      ...overrides,
    },
  };
}

export function cloneClipDeep(source: Clip, overrides?: Partial<Clip>): Clip {
  return {
    ...source,
    ...overrides,
    speedCurve: { ...source.speedCurve },
    transform: { ...source.transform },
    crop: { ...source.crop },
    keyframes: source.keyframes.map((k) => ({ ...k })),
    color: { ...source.color },
    effects: { ...source.effects },
    effectsStack: (source.effectsStack ?? []).map((fx) => ({ ...fx })),
    appliedFilter: source.appliedFilter ? { ...source.appliedFilter } : undefined,
    chromaKey: { ...source.chromaKey },
    mask: { ...source.mask },
    stabilization: {
      ...source.stabilization,
      offsets: source.stabilization.offsets.map((o) => ({ ...o })),
    },
    audio: { ...source.audio },
    transitionIn: { ...source.transitionIn },
    transitionOut: { ...source.transitionOut },
    text: source.text
      ? {
          ...source.text,
          wordTimings: source.text.wordTimings?.map((w) => ({ ...w })),
        }
      : undefined,
    sticker: source.sticker ? { ...source.sticker } : undefined,
  };
}

export function splitClipAtTime(clips: Clip[], clipId: string, splitTime: number): Clip[] | null {
  const target = clips.find((c) => c.id === clipId);
  if (!target) return null;

  const localOffset = splitTime - target.startTime;
  if (localOffset <= MIN_CLIP_DURATION || target.duration - localOffset <= MIN_CLIP_DURATION) {
    return null;
  }

  const mediaDelta = localOffset * target.speed;
  const splitSourceTime = target.sourceIn + mediaDelta;

  const leftClip = cloneClipDeep(target, {
    duration: Number(localOffset.toFixed(4)),
    sourceOut: Number(splitSourceTime.toFixed(4)),
    transitionOut: { type: 'none', duration: 0.4, easing: 'ease-in-out', intensity: 1 },
    keyframes: target.keyframes.filter((k) => k.time <= localOffset),
  });

  const rightClip = cloneClipDeep(target, {
    id: createId('clip'),
    startTime: Number(splitTime.toFixed(4)),
    duration: Number((target.duration - localOffset).toFixed(4)),
    sourceIn: Number(splitSourceTime.toFixed(4)),
    transitionIn: { type: 'none', duration: 0.4, easing: 'ease-in-out', intensity: 1 },
    keyframes: target.keyframes
      .filter((k) => k.time >= localOffset)
      .map((k) => ({ ...k, time: Number((k.time - localOffset).toFixed(4)) })),
  });

  return clips.flatMap((c) => (c.id === clipId ? [leftClip, rightClip] : [c]));
}

export function computeSnapTargets(clips: Clip[], excludeClipId: string, playhead: number): number[] {
  const targets = new Set<number>([0, playhead]);
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    targets.add(clip.startTime);
    targets.add(clip.startTime + clip.duration);
  }
  return Array.from(targets);
}

export function snapEdge(
  value: number,
  targets: number[],
  thresholdSeconds: number
): { value: number; snappedTo: number | null } {
  let closest = value;
  let minDiff = thresholdSeconds;
  let snappedTo: number | null = null;

  for (const target of targets) {
    const diff = Math.abs(value - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = target;
      snappedTo = target;
    }
  }
  return { value: Math.max(0, closest), snappedTo };
}
