import type {
  Clip,
  ClipTransform,
  Keyframe,
  SpeedCurvePreset,
  SpeedCurveSettings,
  StabilizationOffset,
} from '../../types/editor';

export function applyEasing(t: number, easing: Keyframe['easing']): number {
  const clamped = Math.max(0, Math.min(1, t));
  if (easing === 'ease-out') {
    return 1 - Math.pow(1 - clamped, 3);
  }
  if (easing === 'ease-in-out') {
    return clamped < 0.5
      ? 4 * clamped * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
  }
  return clamped;
}

/**
 * Evaluates interpolated transform (x, y, scale, rotation, opacity) at localTime,
 * preserving flipH/flipV from base transform.
 */
export function evaluateTransformAtTime(clip: Clip, localTime: number): ClipTransform {
  const kfs = clip.keyframes;
  if (!kfs || kfs.length === 0) {
    return clip.transform;
  }

  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (localTime <= sorted[0].time) {
    return {
      ...clip.transform,
      x: sorted[0].x,
      y: sorted[0].y,
      scale: sorted[0].scale,
      rotation: sorted[0].rotation,
      opacity: sorted[0].opacity,
    };
  }
  const last = sorted[sorted.length - 1];
  if (localTime >= last.time) {
    return {
      ...clip.transform,
      x: last.x,
      y: last.y,
      scale: last.scale,
      rotation: last.rotation,
      opacity: last.opacity,
    };
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const span = Math.max(0.0001, b.time - a.time);
      const rawT = (localTime - a.time) / span;
      const t = applyEasing(rawT, b.easing);
      return {
        ...clip.transform,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        scale: a.scale + (b.scale - a.scale) * t,
        rotation: a.rotation + (b.rotation - a.rotation) * t,
        opacity: a.opacity + (b.opacity - a.opacity) * t,
      };
    }
  }
  return clip.transform;
}

export function getSpeedPresetValues(preset: SpeedCurvePreset): SpeedCurveSettings {
  switch (preset) {
    case 'ramp-up':
      return { preset, startSpeed: 0.4, midSpeed: 1.0, endSpeed: 2.2 };
    case 'ramp-down':
      return { preset, startSpeed: 2.2, midSpeed: 1.0, endSpeed: 0.4 };
    case 'hero-dip':
      return { preset, startSpeed: 2.0, midSpeed: 0.35, endSpeed: 2.0 };
    case 'pulse':
      return { preset, startSpeed: 0.6, midSpeed: 2.2, endSpeed: 0.6 };
    default:
      return { preset: 'constant', startSpeed: 1, midSpeed: 1, endSpeed: 1 };
  }
}

export function evaluateSpeedAtRatio(clip: Clip, normRatio: number): number {
  const base = clip.speed || 1;
  const curve = clip.speedCurve;
  if (!curve || curve.preset === 'constant') {
    return base;
  }
  const u = Math.max(0, Math.min(1, normRatio));
  // Smooth quadratic Bezier across startSpeed -> midSpeed -> endSpeed
  const oneMinusU = 1 - u;
  const curveFactor =
    oneMinusU * oneMinusU * curve.startSpeed +
    2 * oneMinusU * u * curve.midSpeed +
    u * u * curve.endSpeed;
  return Math.max(0.15, Math.min(6, base * curveFactor));
}

/**
 * Integrates speed curve over [0..localTime] to compute source media timestamp,
 * supporting both forward and reversed playback cleanly.
 */
export function mapTimelineToSourceTime(clip: Clip, localTime: number): number {
  const dur = Math.max(0.01, clip.duration);
  const clampedLocal = Math.max(0, Math.min(dur, localTime));

  let mediaElapsed = 0;
  if (!clip.speedCurve || clip.speedCurve.preset === 'constant') {
    mediaElapsed = clampedLocal * clip.speed;
  } else {
    // 48-step Simpson/midpoint numerical integration of speed curve
    const steps = 48;
    const dt = clampedLocal / steps;
    let accum = 0;
    for (let i = 0; i < steps; i++) {
      const midT = (i + 0.5) * dt;
      accum += evaluateSpeedAtRatio(clip, midT / dur) * dt;
    }
    mediaElapsed = accum;
  }

  const maxBound = Number.isFinite(clip.mediaDuration) ? clip.mediaDuration : clip.sourceOut;
  if (clip.reversed) {
    const startFrom = Math.min(maxBound, clip.sourceOut);
    return Math.max(clip.sourceIn, Math.min(maxBound, startFrom - mediaElapsed));
  }
  return Math.max(0, Math.min(maxBound, clip.sourceIn + mediaElapsed));
}

export function evaluateStabilizationAtTime(
  offsets: StabilizationOffset[],
  localTime: number,
  strengthPct: number
): { dx: number; dy: number } {
  if (!offsets || offsets.length === 0 || strengthPct <= 0) {
    return { dx: 0, dy: 0 };
  }
  const gain = strengthPct / 100;
  if (localTime <= offsets[0].time) {
    return { dx: offsets[0].dx * gain, dy: offsets[0].dy * gain };
  }
  const last = offsets[offsets.length - 1];
  if (localTime >= last.time) {
    return { dx: last.dx * gain, dy: last.dy * gain };
  }
  for (let i = 0; i < offsets.length - 1; i++) {
    const a = offsets[i];
    const b = offsets[i + 1];
    if (localTime >= a.time && localTime <= b.time) {
      const t = (localTime - a.time) / Math.max(0.0001, b.time - a.time);
      return {
        dx: (a.dx + (b.dx - a.dx) * t) * gain,
        dy: (a.dy + (b.dy - a.dy) * t) * gain,
      };
    }
  }
  return { dx: 0, dy: 0 };
}
