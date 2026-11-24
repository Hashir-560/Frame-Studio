import {
  DEFAULT_COLOR,
  DEFAULT_EFFECTS,
  type Clip,
  type ClipColorAdjustments,
  type MediaAsset,
  type Project,
  type Track,
  type TransitionEasing,
  type TransitionType,
} from '../../types/editor';
import {
  evaluateStabilizationAtTime,
  evaluateTransformAtTime,
} from '../timeline-engine/keyframes';
import {
  applyMaskToCanvas,
  applyPixelProcessors,
  getScratchCanvas,
} from './pixelEffects';
import { applyVideoEffectsStack } from './videoEffectsEngine';

export interface MediaElementPool {
  videos: Map<string, HTMLVideoElement>;
  images: Map<string, HTMLImageElement>;
}

let pixCanvas: HTMLCanvasElement | null = null;
let pixCtx: CanvasRenderingContext2D | null = null;

function getPixelateCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!pixCanvas) {
    pixCanvas = document.createElement('canvas');
    pixCtx = pixCanvas.getContext('2d');
  }
  if (pixCanvas.width !== w) pixCanvas.width = w;
  if (pixCanvas.height !== h) pixCanvas.height = h;
  return { canvas: pixCanvas, ctx: pixCtx! };
}

export function buildCssFilterString(
  color: ClipColorAdjustments,
  extraBlurPx = 0,
  extraBrightnessPct = 0
): string {
  const parts: string[] = [];
  const totalBrightness = Math.max(0, color.brightness + extraBrightnessPct);
  if (totalBrightness !== 100) parts.push(`brightness(${totalBrightness.toFixed(1)}%)`);
  if (color.contrast !== 100) parts.push(`contrast(${color.contrast}%)`);
  if (color.saturation !== 100) parts.push(`saturate(${color.saturation}%)`);
  if (color.hueRotate !== 0) parts.push(`hue-rotate(${color.hueRotate}deg)`);
  if (color.grayscale > 0) parts.push(`grayscale(${color.grayscale}%)`);
  if (color.sepia > 0) parts.push(`sepia(${color.sepia}%)`);
  const totalBlur = Math.max(0, color.blur + extraBlurPx);
  if (totalBlur > 0) parts.push(`blur(${totalBlur.toFixed(1)}px)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

function applyEasing(t: number, easing: TransitionEasing = 'ease-in-out'): number {
  const x = Math.max(0, Math.min(1, t));
  if (easing === 'linear') return x;
  if (easing === 'ease-in') return x * x * x;
  if (easing === 'ease-out') return 1 - Math.pow(1 - x, 3);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

interface TransitionRenderState {
  alphaMultiplier: number;
  offsetXRatio: number;
  offsetYRatio: number;
  scaleXMultiplier: number;
  scaleYMultiplier: number;
  rotationDeg: number;
  blurPx: number;
  brightnessBoost: number;
  pixelatePx: number;
  glitchAmount: number;
  clipMask: { type: TransitionType; p: number; isOut: boolean } | null;
  flashOverlay: { color: string; alpha: number } | null;
}

function getTransitionState(clip: Clip, localTime: number): TransitionRenderState {
  const state: TransitionRenderState = {
    alphaMultiplier: 1,
    offsetXRatio: 0,
    offsetYRatio: 0,
    scaleXMultiplier: 1,
    scaleYMultiplier: 1,
    rotationDeg: 0,
    blurPx: 0,
    brightnessBoost: 0,
    pixelatePx: 0,
    glitchAmount: 0,
    clipMask: null,
    flashOverlay: null,
  };

  const applyEdge = (
    type: TransitionType,
    rawProgress: number, // 0 = hidden, 1 = fully visible
    isOut: boolean,
    easing: TransitionEasing,
    intensity: number
  ) => {
    const p = applyEasing(rawProgress, easing);
    const inv = 1 - p;
    const str = Math.max(0.2, Math.min(2, intensity));

    switch (type) {
      case 'crossfade':
        state.alphaMultiplier *= p;
        break;
      case 'fade-black':
        state.flashOverlay = { color: '#000000', alpha: Math.min(1, inv * str) };
        break;
      case 'fade-white':
        state.flashOverlay = { color: '#FFFFFF', alpha: Math.min(1, inv * str) };
        break;
      case 'blur-dissolve':
        state.blurPx += inv * 26 * str;
        state.alphaMultiplier *= p;
        break;
      case 'flash-burn':
        state.brightnessBoost += inv * 135 * str;
        state.alphaMultiplier *= Math.min(1, p * 1.15);
        state.flashOverlay = {
          color: '#ffb067',
          alpha: Math.min(0.85, inv * 0.42 * str),
        };
        break;
      case 'slide-left':
        state.offsetXRatio += (isOut ? -inv : inv) * str;
        break;
      case 'slide-right':
        state.offsetXRatio += (isOut ? inv : -inv) * str;
        break;
      case 'slide-up':
        state.offsetYRatio += (isOut ? -inv : inv) * str;
        break;
      case 'slide-down':
        state.offsetYRatio += (isOut ? inv : -inv) * str;
        break;
      case 'zoom-in': {
        const sc = isOut ? 1 + inv * 0.45 * str : Math.max(0.1, 1 - 0.35 * str + 0.35 * str * p);
        state.scaleXMultiplier *= sc;
        state.scaleYMultiplier *= sc;
        state.alphaMultiplier *= p;
        break;
      }
      case 'zoom-out': {
        const sc = isOut ? Math.max(0.08, 1 - inv * 0.55 * str) : 1 + inv * 0.55 * str;
        state.scaleXMultiplier *= sc;
        state.scaleYMultiplier *= sc;
        state.alphaMultiplier *= p;
        break;
      }
      case 'spin-cw': {
        state.rotationDeg += (isOut ? -1 : 1) * inv * 180 * str;
        const sc = Math.max(0.12, 0.25 + 0.75 * p);
        state.scaleXMultiplier *= sc;
        state.scaleYMultiplier *= sc;
        state.alphaMultiplier *= p;
        break;
      }
      case 'spin-ccw': {
        state.rotationDeg += (isOut ? 1 : -1) * inv * 180 * str;
        const sc = Math.max(0.12, 0.25 + 0.75 * p);
        state.scaleXMultiplier *= sc;
        state.scaleYMultiplier *= sc;
        state.alphaMultiplier *= p;
        break;
      }
      case 'flip-h':
        state.scaleXMultiplier *= Math.max(0.015, p);
        state.alphaMultiplier *= Math.min(1, p * 1.35);
        break;
      case 'flip-v':
        state.scaleYMultiplier *= Math.max(0.015, p);
        state.alphaMultiplier *= Math.min(1, p * 1.35);
        break;
      case 'wipe-left':
      case 'wipe-right':
      case 'wipe-up':
      case 'wipe-down':
      case 'iris-in':
      case 'iris-out':
      case 'curtain-split':
      case 'barn-door':
      case 'diagonal-wipe':
        state.clipMask = { type, p, isOut };
        break;
      case 'glitch-cut':
        state.glitchAmount = Math.max(state.glitchAmount, inv * str);
        state.alphaMultiplier *= Math.min(1, p * 1.5);
        break;
      case 'pixel-dissolve':
        state.pixelatePx = Math.max(state.pixelatePx, inv * 44 * str);
        state.alphaMultiplier *= Math.min(1, p * 1.25);
        break;
    }
  };

  const inDur = Math.min(clip.transitionIn.duration, clip.duration / 2);
  if (clip.transitionIn.type !== 'none' && inDur > 0 && localTime < inDur) {
    applyEdge(
      clip.transitionIn.type,
      Math.max(0, Math.min(1, localTime / inDur)),
      false,
      clip.transitionIn.easing ?? 'ease-in-out',
      clip.transitionIn.intensity ?? 1
    );
  }

  const timeFromEnd = clip.duration - localTime;
  const outDur = Math.min(clip.transitionOut.duration, clip.duration / 2);
  if (clip.transitionOut.type !== 'none' && outDur > 0 && timeFromEnd < outDur) {
    applyEdge(
      clip.transitionOut.type,
      Math.max(0, Math.min(1, timeFromEnd / outDur)),
      true,
      clip.transitionOut.easing ?? 'ease-in-out',
      clip.transitionOut.intensity ?? 1
    );
  }

  return state;
}

function applyTransitionClipMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mask: { type: TransitionType; p: number; isOut: boolean }
): void {
  const { type, p, isOut } = mask;
  const maxR = Math.hypot(width / 2, height / 2);

  ctx.beginPath();
  switch (type) {
    case 'wipe-left':
      if (!isOut) ctx.rect(0, 0, width * p, height);
      else ctx.rect(width * (1 - p), 0, width * p, height);
      ctx.clip();
      break;
    case 'wipe-right':
      if (!isOut) ctx.rect(width * (1 - p), 0, width * p, height);
      else ctx.rect(0, 0, width * p, height);
      ctx.clip();
      break;
    case 'wipe-up':
      if (!isOut) ctx.rect(0, height * (1 - p), width, height * p);
      else ctx.rect(0, 0, width, height * p);
      ctx.clip();
      break;
    case 'wipe-down':
      if (!isOut) ctx.rect(0, 0, width, height * p);
      else ctx.rect(0, height * (1 - p), width, height * p);
      ctx.clip();
      break;
    case 'iris-in':
      ctx.arc(width / 2, height / 2, Math.max(1, maxR * p), 0, Math.PI * 2);
      ctx.clip();
      break;
    case 'iris-out':
      if (!isOut) {
        // Outer corners close inward
        ctx.rect(0, 0, width, height);
        ctx.moveTo(width / 2 + maxR * (1 - p), height / 2);
        ctx.arc(width / 2, height / 2, Math.max(0, maxR * (1 - p)), 0, Math.PI * 2, true);
        ctx.clip('evenodd');
      } else {
        ctx.arc(width / 2, height / 2, Math.max(0, maxR * p), 0, Math.PI * 2);
        ctx.clip();
      }
      break;
    case 'curtain-split': {
      const cw = width * p;
      ctx.rect((width - cw) / 2, 0, cw, height);
      ctx.clip();
      break;
    }
    case 'barn-door': {
      const ch = height * p;
      ctx.rect(0, (height - ch) / 2, width, ch);
      ctx.clip();
      break;
    }
    case 'diagonal-wipe': {
      const span = (width + height) / Math.SQRT2 + 2;
      ctx.translate(width / 2, height / 2);
      ctx.rotate(Math.PI / 4);
      if (!isOut) {
        ctx.rect(-span / 2, -span, span * p, span * 2);
      } else {
        ctx.rect(-span / 2 + span * (1 - p), -span, span * p, span * 2);
      }
      ctx.rotate(-Math.PI / 4);
      ctx.translate(-width / 2, -height / 2);
      ctx.clip();
      break;
    }
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, strength: number) {
  if (strength <= 0) return;
  const alpha = Math.min(0.95, (strength / 100) * 0.85);
  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.hypot(cx, cy);
  const innerRadius = outerRadius * (0.55 - (strength / 100) * 0.2);
  const grad = ctx.createRadialGradient(cx, cy, Math.max(10, innerRadius), cx, cy, outerRadius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${alpha.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawTemperatureTint(ctx: CanvasRenderingContext2D, width: number, height: number, temperature: number) {
  if (temperature === 0) return;
  const strength = Math.min(0.32, (Math.abs(temperature) / 100) * 0.28);
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle =
    temperature > 0
      ? `rgba(255, 162, 76, ${strength.toFixed(3)})`
      : `rgba(88, 166, 255, ${strength.toFixed(3)})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(Math.min(w, h) / 2, r));
  ctx.beginPath();
  if (rad > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, rad);
  } else if (rad > 0) {
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

function drawStickerClip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
  localTime: number
) {
  if (!clip.sticker) return;
  const s = clip.sticker;
  const kfTransform = evaluateTransformAtTime(clip, localTime);
  const trans = getTransitionState(clip, localTime);
  const hasKeyframes = clip.keyframes.length > 0;

  const baseX = hasKeyframes
    ? (kfTransform.x / 100) * width
    : width / 2 + (kfTransform.x / 100) * width;
  const baseY = hasKeyframes
    ? (kfTransform.y / 100) * height
    : height / 2 + (kfTransform.y / 100) * height;

  const unit = Math.min(width, height) * 0.16;
  ctx.save();
  if (trans.clipMask) {
    applyTransitionClipMask(ctx, width, height, trans.clipMask);
  }
  ctx.globalCompositeOperation = clip.blendMode || 'source-over';
  if (trans.blurPx > 0.2) {
    ctx.filter = `blur(${trans.blurPx.toFixed(1)}px)`;
  }
  ctx.translate(baseX + trans.offsetXRatio * width, baseY + trans.offsetYRatio * height);
  ctx.rotate(((kfTransform.rotation + trans.rotationDeg) * Math.PI) / 180);
  ctx.scale(
    (kfTransform.scale / 100) * trans.scaleXMultiplier * (kfTransform.flipH ? -1 : 1),
    (kfTransform.scale / 100) * trans.scaleYMultiplier * (kfTransform.flipV ? -1 : 1)
  );
  ctx.globalAlpha = Math.max(0, Math.min(1, (kfTransform.opacity / 100) * trans.alphaMultiplier));

  const pulse = 1 + 0.04 * Math.sin(localTime * 4);
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.accentColor;
  ctx.lineWidth = Math.max(2, unit * 0.045);

  switch (s.kind) {
    case 'rec-frame': {
      const rw = unit * 2.2;
      const rh = unit * 1.4;
      const len = unit * 0.35;
      ctx.beginPath();
      ctx.moveTo(-rw / 2, -rh / 2 + len); ctx.lineTo(-rw / 2, -rh / 2); ctx.lineTo(-rw / 2 + len, -rh / 2);
      ctx.moveTo(rw / 2 - len, -rh / 2); ctx.lineTo(rw / 2, -rh / 2); ctx.lineTo(rw / 2, -rh / 2 + len);
      ctx.moveTo(-rw / 2, rh / 2 - len); ctx.lineTo(-rw / 2, rh / 2); ctx.lineTo(-rw / 2 + len, rh / 2);
      ctx.moveTo(rw / 2 - len, rh / 2); ctx.lineTo(rw / 2, rh / 2); ctx.lineTo(rw / 2, rh / 2 - len);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(-rw / 2 + unit * 0.25, -rh / 2 + unit * 0.25, unit * 0.09 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.font = `600 ${Math.round(unit * 0.18)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('REC', -rw / 2 + unit * 0.42, -rh / 2 + unit * 0.26);
      break;
    }
    case 'focus-reticle': {
      ctx.beginPath();
      ctx.arc(0, 0, unit * 0.72 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-unit, 0); ctx.lineTo(-unit * 0.4, 0);
      ctx.moveTo(unit * 0.4, 0); ctx.lineTo(unit, 0);
      ctx.moveTo(0, -unit); ctx.lineTo(0, -unit * 0.4);
      ctx.moveTo(0, unit * 0.4); ctx.lineTo(0, unit);
      ctx.stroke();
      break;
    }
    case 'arrow-right': {
      ctx.beginPath();
      ctx.moveTo(-unit * 0.85, -unit * 0.25);
      ctx.lineTo(unit * 0.15, -unit * 0.25);
      ctx.lineTo(unit * 0.15, -unit * 0.65);
      ctx.lineTo(unit * 0.95, 0);
      ctx.lineTo(unit * 0.15, unit * 0.65);
      ctx.lineTo(unit * 0.15, unit * 0.25);
      ctx.lineTo(-unit * 0.85, unit * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'lower-bar': {
      ctx.fillStyle = 'rgba(16, 17, 20, 0.84)';
      ctx.fillRect(-unit * 2.2, -unit * 0.35, unit * 4.4, unit * 0.7);
      ctx.fillStyle = s.accentColor;
      ctx.fillRect(-unit * 2.2, -unit * 0.35, unit * 0.12, unit * 0.7);
      ctx.fillStyle = s.color;
      ctx.font = `600 ${Math.round(unit * 0.24)}px "Inter", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label || 'FEATURE OVERLAY', -unit * 1.9, 0);
      break;
    }
    case 'badge-live': {
      const bw = unit * 1.3;
      const bh = unit * 0.5;
      ctx.fillStyle = '#93000a';
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = '#FAF9F6';
      ctx.font = `700 ${Math.round(unit * 0.22)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LIVE', 0, 1);
      break;
    }
    case 'star-burst': {
      ctx.beginPath();
      const spikes = 10;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? unit * 0.85 * pulse : unit * 0.42;
        const a = (i * Math.PI) / spikes;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'check-badge': {
      ctx.beginPath();
      ctx.arc(0, 0, unit * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#101114';
      ctx.lineWidth = Math.max(3, unit * 0.1);
      ctx.beginPath();
      ctx.moveTo(-unit * 0.28, 0);
      ctx.lineTo(-unit * 0.06, unit * 0.24);
      ctx.lineTo(unit * 0.32, -unit * 0.22);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function measureTrackedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacingPx: number
): number {
  if (!text) return 0;
  if (Math.abs(letterSpacingPx) < 0.05) {
    return ctx.measureText(text).width;
  }
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += ctx.measureText(text[i]).width;
    if (i < text.length - 1) total += letterSpacingPx;
  }
  return total;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacingPx: number,
  stroke: boolean,
  fill: boolean
): void {
  if (!text) return;
  if (Math.abs(letterSpacingPx) < 0.05) {
    if (stroke) ctx.strokeText(text, x, y);
    if (fill) ctx.fillText(text, x, y);
    return;
  }
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let cursor = x;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (stroke) ctx.strokeText(ch, cursor, y);
    if (fill) ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + letterSpacingPx;
  }
  ctx.textAlign = prevAlign;
}

function drawTextClip(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
  localTime: number
) {
  if (!clip.text) return;
  const t = clip.text;
  const rawLines = (t.content || '').split('\n');

  let animAlpha = 1;
  let animOffsetX = 0;
  let animOffsetY = 0;
  let animScale = 1;
  let animBlurPx = 0;
  let animTrackingExtra = 0;
  let glitchOffset = 0;
  let visibleCharFraction = 1;

  const animDur = Math.max(0.05, Math.min(t.animationDuration || 0.4, clip.duration / 2));
  const easingMode = t.animationEasing ?? 'ease-out';
  let inPhaseProgress = 1;
  let inTransitionZone = false;

  if (t.animation !== 'none') {
    let p = 1;
    if (localTime < animDur) {
      p = localTime / animDur;
      inPhaseProgress = p;
      inTransitionZone = true;
    } else if (clip.duration - localTime < animDur) {
      p = (clip.duration - localTime) / animDur;
      inTransitionZone = true;
    }
    p = Math.max(0, Math.min(1, p));
    const eased = applyEasing(p, easingMode);

    switch (t.animation) {
      case 'fade':
        animAlpha = eased;
        break;
      case 'slide-up':
        animAlpha = eased;
        animOffsetY = (1 - eased) * (height * 0.065);
        break;
      case 'slide-down':
        animAlpha = eased;
        animOffsetY = -(1 - eased) * (height * 0.065);
        break;
      case 'slide-left':
        animAlpha = eased;
        animOffsetX = (1 - eased) * (width * 0.08);
        break;
      case 'slide-right':
        animAlpha = eased;
        animOffsetX = -(1 - eased) * (width * 0.08);
        break;
      case 'scale':
        animAlpha = eased;
        animScale = 0.78 + 0.22 * eased;
        break;
      case 'zoom':
        animAlpha = eased;
        animScale = 1.32 - 0.32 * eased;
        break;
      case 'pop': {
        animAlpha = Math.min(1, p * 2.6);
        const s = 1.4;
        const u = p - 1;
        animScale = 0.65 + 0.35 * (1 + (s + 1) * Math.pow(u, 3) + s * Math.pow(u, 2));
        break;
      }
      case 'bounce': {
        animAlpha = Math.min(1, p * 2.2);
        const s = 1.70158;
        const u = p - 1;
        const back = 1 + (s + 1) * Math.pow(u, 3) + s * Math.pow(u, 2);
        animScale = 0.45 + 0.55 * back;
        break;
      }
      case 'blur-in':
        animAlpha = eased;
        animBlurPx = (1 - eased) * 14;
        break;
      case 'tracking-in':
        animAlpha = eased;
        animTrackingExtra = (1 - eased) * 26;
        break;
      case 'typewriter':
      case 'letter-by-letter':
        visibleCharFraction = localTime < animDur ? Math.max(0, Math.min(1, localTime / animDur)) : 1;
        if (clip.duration - localTime < animDur) {
          animAlpha = eased;
        }
        break;
      case 'word-by-word':
      case 'word-pop':
      case 'karaoke':
        animAlpha =
          localTime < Math.min(0.15, animDur)
            ? applyEasing(localTime / Math.min(0.15, animDur), 'ease-out')
            : 1;
        if (clip.duration - localTime < Math.min(0.15, animDur)) {
          animAlpha = applyEasing(
            (clip.duration - localTime) / Math.min(0.15, animDur),
            'ease-out'
          );
        }
        break;
      case 'glitch-text':
      case 'glitch-reveal':
        animAlpha = Math.min(1, p * (t.animation === 'glitch-reveal' ? 1.6 : 2));
        if (inTransitionZone) {
          glitchOffset = (1 - p) * (t.animation === 'glitch-reveal' ? 22 : 14) * Math.sin(localTime * 68);
        }
        break;
    }
  }

  // Apply typewriter or letter-by-letter truncation cleanly across full text lines
  let lines = rawLines;
  if (
    (t.animation === 'typewriter' || t.animation === 'letter-by-letter') &&
    visibleCharFraction < 1
  ) {
    const fullStr = rawLines.join('\n');
    const charLimit = Math.max(
      0,
      Math.round(fullStr.length * Math.max(0, Math.min(1, inPhaseProgress)))
    );
    const partial = fullStr.slice(0, charLimit);
    const showCaret = t.animation === 'typewriter' && Math.floor(localTime * 6) % 2 === 0;
    lines = (partial + (showCaret ? '|' : '')).split('\n');
  }

  const kfTransform = evaluateTransformAtTime(clip, localTime);
  const trans = getTransitionState(clip, localTime);
  const scaleFactor = width / 1920;
  const typoStyle = t.typographyStyle ?? 'clean';
  const effectiveWeight = typoStyle === 'bold' ? Math.max(800, t.fontWeight) : t.fontWeight;
  const fontSizePx = Math.max(10, t.fontSize * scaleFactor);
  const extraStyleTracking = typoStyle === 'cinematic' ? Math.max(8, t.letterSpacing ?? 0) : (t.letterSpacing ?? 0);
  const letterSpacingPx = (extraStyleTracking + animTrackingExtra) * scaleFactor;
  const lineHeightPx = fontSizePx * (t.lineHeight ?? 1.24);
  const totalTextHeight = lines.length * lineHeightPx;

  ctx.save();
  if (trans.clipMask) {
    applyTransitionClipMask(ctx, width, height, trans.clipMask);
  }
  ctx.globalCompositeOperation = clip.blendMode || 'source-over';

  const totalBlur = animBlurPx + trans.blurPx;
  if (totalBlur > 0.2) {
    ctx.filter = `blur(${totalBlur.toFixed(1)}px)`;
  }

  const hasKeyframes = clip.keyframes.length > 0;
  const baseX = hasKeyframes
    ? (kfTransform.x / 100) * width + trans.offsetXRatio * width + animOffsetX + glitchOffset * scaleFactor
    : (t.x / 100) * width + (kfTransform.x / 100) * width + trans.offsetXRatio * width + animOffsetX + glitchOffset * scaleFactor;
  const baseY = hasKeyframes
    ? (kfTransform.y / 100) * height + trans.offsetYRatio * height + animOffsetY
    : (t.y / 100) * height + (kfTransform.y / 100) * height + trans.offsetYRatio * height + animOffsetY;

  ctx.translate(baseX, baseY);
  ctx.rotate(((kfTransform.rotation + trans.rotationDeg) * Math.PI) / 180);
  const sx = (kfTransform.scale / 100) * animScale * trans.scaleXMultiplier * (kfTransform.flipH ? -1 : 1);
  const sy = (kfTransform.scale / 100) * animScale * trans.scaleYMultiplier * (kfTransform.flipV ? -1 : 1);
  ctx.scale(sx, sy);
  ctx.globalAlpha = Math.max(0, Math.min(1, (kfTransform.opacity / 100) * animAlpha * trans.alphaMultiplier));

  ctx.font = `${effectiveWeight} ${fontSizePx}px "${t.fontFamily}", sans-serif`;
  ctx.textAlign = t.align;
  ctx.textBaseline = 'middle';

  const lineWidths = lines.map((line) => measureTrackedTextWidth(ctx, line, letterSpacingPx));
  const maxW = Math.max(0, ...lineWidths);

  if (t.backgroundColor && t.backgroundColor !== 'transparent') {
    const padX = (t.paddingX ?? 28) * scaleFactor;
    const padY = (t.paddingY ?? 14) * scaleFactor;
    const rad = (t.borderRadius ?? 8) * scaleFactor;
    const boxW = maxW + padX * 2;
    const boxH = totalTextHeight + padY * 2;
    const boxX = t.align === 'center' ? -boxW / 2 : t.align === 'left' ? -padX : -boxW + padX;
    const boxY = -totalTextHeight / 2 - padY;
    ctx.fillStyle = t.backgroundColor;
    drawRoundedRectPath(ctx, boxX, boxY, boxW, boxH, rad);
    ctx.fill();
  }

  if (typoStyle === 'neon') {
    ctx.shadowBlur = Math.max(18, t.shadowBlur || 24) * scaleFactor;
    ctx.shadowColor = t.highlightColor || t.shadowColor || '#38BDF8';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else if (typoStyle === 'shadow') {
    ctx.shadowBlur = Math.max(18, t.shadowBlur || 20) * scaleFactor;
    ctx.shadowColor = t.shadowColor || 'rgba(0,0,0,0.88)';
    ctx.shadowOffsetX = (t.shadowOffsetX ?? 4) * scaleFactor;
    ctx.shadowOffsetY = (t.shadowOffsetY ?? 6) * scaleFactor;
  } else if (t.shadowBlur > 0 || (t.shadowOffsetX ?? 0) !== 0 || (t.shadowOffsetY ?? 2) !== 0) {
    ctx.shadowBlur = t.shadowBlur * scaleFactor;
    ctx.shadowColor = t.shadowColor || 'rgba(0,0,0,0.8)';
    ctx.shadowOffsetX = (t.shadowOffsetX ?? 0) * scaleFactor;
    ctx.shadowOffsetY = (t.shadowOffsetY ?? 2) * scaleFactor;
  }

  // Word-level timing calculation (supports custom editable wordTimings or even distribution)
  const isWordSynced =
    t.animation === 'karaoke' || t.animation === 'word-pop' || t.animation === 'word-by-word';
  const allWords = isWordSynced ? (t.content || '').trim().split(/\s+/).filter(Boolean) : [];
  let activeWordIndex = -1;
  let activeWordFloat = 0;

  if (isWordSynced && allWords.length > 0) {
    if (t.wordTimings && t.wordTimings.length === allWords.length) {
      for (let i = 0; i < t.wordTimings.length; i++) {
        const wt = t.wordTimings[i];
        if (localTime >= wt.startOffset && localTime <= wt.endOffset) {
          activeWordIndex = i;
          activeWordFloat = i + (localTime - wt.startOffset) / Math.max(0.05, wt.endOffset - wt.startOffset);
          break;
        }
        if (localTime > wt.endOffset) {
          activeWordIndex = i;
          activeWordFloat = i + 1;
        }
      }
    } else {
      activeWordFloat =
        Math.max(0, Math.min(0.999, localTime / Math.max(0.1, clip.duration))) * allWords.length;
      activeWordIndex = Math.floor(activeWordFloat);
    }
  }
  let runningWordIdx = 0;

  const makePrimaryFill = (yOffset: number): string | CanvasGradient => {
    if (typoStyle === 'gradient') {
      const grad = ctx.createLinearGradient(0, yOffset - fontSizePx * 0.5, 0, yOffset + fontSizePx * 0.5);
      grad.addColorStop(0, t.color || '#FAF9F6');
      grad.addColorStop(1, t.gradientColor || t.highlightColor || '#38BDF8');
      return grad;
    }
    return t.color || '#FAF9F6';
  };

  lines.forEach((line, idx) => {
    const yOffset = -totalTextHeight / 2 + lineHeightPx * (idx + 0.5);
    const lineW = lineWidths[idx] ?? 0;
    const lineStartX =
      t.align === 'center' ? -lineW / 2 : t.align === 'left' ? 0 : -lineW;

    if (
      (t.animation === 'glitch-text' || t.animation === 'glitch-reveal' || typoStyle === 'glitch') &&
      (typoStyle === 'glitch' || (inTransitionZone && Math.abs(glitchOffset) > 0.2))
    ) {
      const spread = (typoStyle === 'glitch' ? 4 : 5) * scaleFactor;
      ctx.save();
      ctx.globalAlpha *= 0.65;
      ctx.fillStyle = '#00f0ff';
      drawTrackedText(ctx, line, lineStartX - spread, yOffset, letterSpacingPx, false, true);
      ctx.fillStyle = '#ff2965';
      drawTrackedText(ctx, line, lineStartX + spread, yOffset, letterSpacingPx, false, true);
      ctx.restore();
    }

    if (isWordSynced && allWords.length > 0 && line.trim().length > 0) {
      const tokens = line.split(/(\s+)/);
      let cursorX = lineStartX;
      const spaceAdvance = ctx.measureText(' ').width + letterSpacingPx;

      for (const tok of tokens) {
        if (!tok) continue;
        if (/^\s+$/.test(tok)) {
          cursorX += tok.length * spaceAdvance;
          continue;
        }
        const wIdx = runningWordIdx++;
        const tokW = measureTrackedTextWidth(ctx, tok, letterSpacingPx);
        const isCurrent = wIdx === activeWordIndex;
        const isPastOrCurrent = wIdx <= activeWordIndex;

        if (t.animation === 'word-by-word' && !isPastOrCurrent) {
          cursorX += tokW + letterSpacingPx;
          continue;
        }

        ctx.save();
        if (t.animation === 'word-pop' && isCurrent) {
          const wordFrac = activeWordFloat - activeWordIndex;
          const popScale = 1 + 0.16 * Math.sin(Math.min(1, wordFrac * 2) * Math.PI);
          ctx.translate(cursorX + tokW / 2, yOffset);
          ctx.scale(popScale, popScale);
          ctx.translate(-(cursorX + tokW / 2), -yOffset);
        }

        const effectiveStrokeW =
          typoStyle === 'outline' ? Math.max(3, t.outlineWidth) : t.outlineWidth;
        if (effectiveStrokeW > 0) {
          ctx.lineWidth = effectiveStrokeW * scaleFactor * 2;
          ctx.strokeStyle = t.outlineColor || '#000000';
          ctx.lineJoin = 'round';
          drawTrackedText(ctx, tok, cursorX, yOffset, letterSpacingPx, true, false);
        }

        const fillCol =
          t.animation === 'karaoke'
            ? isPastOrCurrent
              ? t.highlightColor || '#b9c9d1'
              : t.color || '#FAF9F6'
            : isCurrent
            ? t.highlightColor || '#b9c9d1'
            : makePrimaryFill(yOffset);

        ctx.fillStyle = fillCol;
        drawTrackedText(ctx, tok, cursorX, yOffset, letterSpacingPx, false, true);
        ctx.restore();

        cursorX += tokW + letterSpacingPx;
      }
      return;
    }

    if (typoStyle === '3d') {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      const depthSteps = 6;
      const depthColor = t.outlineColor && t.outlineColor !== '#000000' ? t.outlineColor : '#1E293B';
      for (let d = depthSteps; d >= 1; d--) {
        ctx.fillStyle = d === depthSteps ? 'rgba(0,0,0,0.45)' : depthColor;
        drawTrackedText(
          ctx,
          line,
          lineStartX + d * 1.6 * scaleFactor,
          yOffset + d * 1.6 * scaleFactor,
          letterSpacingPx,
          false,
          true
        );
      }
      ctx.restore();
    }

    const effectiveStrokeW = typoStyle === 'outline' ? Math.max(3, t.outlineWidth) : t.outlineWidth;
    if (effectiveStrokeW > 0) {
      ctx.lineWidth = effectiveStrokeW * scaleFactor * 2;
      ctx.strokeStyle = t.outlineColor || '#000000';
      ctx.lineJoin = 'round';
      drawTrackedText(ctx, line, lineStartX, yOffset, letterSpacingPx, true, false);
    }

    ctx.fillStyle = makePrimaryFill(yOffset);
    drawTrackedText(ctx, line, lineStartX, yOffset, letterSpacingPx, false, true);

    if (typoStyle === 'neon') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha *= 0.6;
      ctx.fillStyle = t.highlightColor || '#38BDF8';
      drawTrackedText(ctx, line, lineStartX, yOffset, letterSpacingPx, false, true);
      ctx.restore();
    }
  });

  ctx.restore();
}

export interface FrameRenderOptions {
  bypassGradingAndFx?: boolean;
}

export function renderFrameAtTime(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  project: Project,
  assetsMap: Map<string, MediaAsset>,
  pool: MediaElementPool,
  options?: FrameRenderOptions
): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const bypass = Boolean(options?.bypassGradingAndFx);

  const visualTracks: Track[] = project.tracks
    .filter((tr) => tr.type !== 'audio' && !tr.hidden)
    .sort((a, b) => b.order - a.order);

  for (const track of visualTracks) {
    const activeClips = project.clips.filter(
      (c) =>
        c.trackId === track.id &&
        c.type !== 'audio' &&
        time >= c.startTime - 0.0005 &&
        time < c.startTime + c.duration
    );

    for (const clip of activeClips) {
      const localTime = Math.max(0, time - clip.startTime);

      if (clip.type === 'text') {
        drawTextClip(ctx, width, height, clip, localTime);
        continue;
      }

      if (clip.type === 'sticker') {
        drawStickerClip(ctx, width, height, clip, localTime);
        continue;
      }

      if (!clip.mediaId) continue;
      const asset = assetsMap.get(clip.mediaId);
      if (!asset) continue;

      let sourceEl: HTMLVideoElement | HTMLImageElement | undefined;
      let srcW = asset.width || width;
      let srcH = asset.height || height;

      if (clip.type === 'video') {
        const video = pool.videos.get(clip.id);
        if (!video || video.readyState < 2) continue;
        sourceEl = video;
        srcW = video.videoWidth || srcW;
        srcH = video.videoHeight || srcH;
      } else if (clip.type === 'image') {
        const img = pool.images.get(asset.id);
        if (!img || !img.complete || img.naturalWidth === 0) continue;
        sourceEl = img;
        srcW = img.naturalWidth || srcW;
        srcH = img.naturalHeight || srcH;
      }

      if (!sourceEl || srcW <= 0 || srcH <= 0) continue;

      const crop = clip.crop;
      const sx = (crop.left / 100) * srcW;
      const sy = (crop.top / 100) * srcH;
      const sw = Math.max(4, srcW * (1 - (crop.left + crop.right) / 100));
      const sh = Math.max(4, srcH * (1 - (crop.top + crop.bottom) / 100));

      const kfTransform = evaluateTransformAtTime(clip, localTime);
      const trans = getTransitionState(clip, localTime);
      const stab = clip.stabilization.enabled
        ? evaluateStabilizationAtTime(clip.stabilization.offsets, localTime, clip.stabilization.strength)
        : { dx: 0, dy: 0 };
      const stabScale = clip.stabilization.enabled ? clip.stabilization.autoScale / 100 : 1;

      const fitScale = Math.min(width / sw, height / sh);
      const drawW = sw * fitScale;
      const drawH = sh * fitScale;

      const activeColor = bypass ? DEFAULT_COLOR : clip.color;
      const activeEffects = bypass ? DEFAULT_EFFECTS : clip.effects;
      const activeStack = bypass ? [] : (clip.effectsStack ?? []).filter((fx) => fx.enabled && fx.intensity > 0);

      const effectivePixelate = Math.max(activeEffects.pixelate, trans.pixelatePx);
      const effectiveAberration =
        activeEffects.chromaticAberration + trans.glitchAmount * 18;
      const glitchJitterX =
        trans.glitchAmount > 0.02
          ? Math.sin(localTime * 95) * trans.glitchAmount * 0.035
          : 0;

      const needsScratch =
        clip.chromaKey.enabled ||
        clip.mask.shape !== 'none' ||
        activeEffects.filmGrain > 0 ||
        effectiveAberration > 0 ||
        effectivePixelate > 1 ||
        activeEffects.invert ||
        activeColor.curveShadows !== 0 ||
        activeColor.curveMidtones !== 0 ||
        activeColor.curveHighlights !== 0 ||
        activeStack.length > 0;

      if (needsScratch) {
        const procScale = Math.min(1, 720 / Math.max(width, height));
        const pw = Math.max(16, Math.round(width * procScale));
        const ph = Math.max(16, Math.round(height * procScale));
        const { canvas: sCanvas, ctx: sCtx } = getScratchCanvas(pw, ph);
        sCtx.save();
        sCtx.clearRect(0, 0, pw, ph);
        sCtx.filter = buildCssFilterString(
          activeColor,
          trans.blurPx * procScale,
          trans.brightnessBoost
        );

        const pDrawW = drawW * procScale;
        const pDrawH = drawH * procScale;

        if (effectivePixelate > 1) {
          const block = Math.max(2, Math.round(effectivePixelate * procScale));
          const lowW = Math.max(4, Math.round(pDrawW / block));
          const lowH = Math.max(4, Math.round(pDrawH / block));
          const { canvas: pCanvas, ctx: pCtx } = getPixelateCanvas(lowW, lowH);
          pCtx.clearRect(0, 0, lowW, lowH);
          pCtx.drawImage(sourceEl, sx, sy, sw, sh, 0, 0, lowW, lowH);
          sCtx.imageSmoothingEnabled = false;
          sCtx.drawImage(pCanvas, 0, 0, lowW, lowH, (pw - pDrawW) / 2, (ph - pDrawH) / 2, pDrawW, pDrawH);
          sCtx.imageSmoothingEnabled = true;
        } else {
          sCtx.drawImage(sourceEl, sx, sy, sw, sh, (pw - pDrawW) / 2, (ph - pDrawH) / 2, pDrawW, pDrawH);
        }

        if (effectiveAberration > 0) {
          const shift = Math.max(1, effectiveAberration * procScale);
          sCtx.globalAlpha = 0.42;
          sCtx.globalCompositeOperation = 'lighter';
          sCtx.drawImage(sourceEl, sx, sy, sw, sh, (pw - pDrawW) / 2 - shift, (ph - pDrawH) / 2, pDrawW, pDrawH);
          sCtx.drawImage(sourceEl, sx, sy, sw, sh, (pw - pDrawW) / 2 + shift, (ph - pDrawH) / 2, pDrawW, pDrawH);
        }
        sCtx.restore();

        applyPixelProcessors(sCtx, pw, ph, clip.chromaKey, activeColor, activeEffects);
        if (activeStack.length > 0) {
          applyVideoEffectsStack(sCtx, pw, ph, activeStack, localTime);
        }
        if (clip.mask.shape !== 'none') {
          applyMaskToCanvas(sCtx, pw, ph, clip.mask);
        }

        ctx.save();
        if (trans.clipMask) {
          applyTransitionClipMask(ctx, width, height, trans.clipMask);
        }
        ctx.globalCompositeOperation = clip.blendMode || 'source-over';
        ctx.translate(
          width / 2 + ((kfTransform.x + stab.dx) / 100) * width + (trans.offsetXRatio + glitchJitterX) * width,
          height / 2 + ((kfTransform.y + stab.dy) / 100) * height + trans.offsetYRatio * height
        );
        ctx.rotate(((kfTransform.rotation + trans.rotationDeg) * Math.PI) / 180);
        const sxScale = (kfTransform.scale / 100) * trans.scaleXMultiplier * stabScale * (kfTransform.flipH ? -1 : 1);
        const syScale = (kfTransform.scale / 100) * trans.scaleYMultiplier * stabScale * (kfTransform.flipV ? -1 : 1);
        ctx.scale(sxScale, syScale);
        ctx.globalAlpha = Math.max(0, Math.min(1, (kfTransform.opacity / 100) * trans.alphaMultiplier));
        ctx.drawImage(sCanvas, -width / 2, -height / 2, width, height);
        ctx.restore();
      } else {
        ctx.save();
        if (trans.clipMask) {
          applyTransitionClipMask(ctx, width, height, trans.clipMask);
        }
        ctx.globalCompositeOperation = clip.blendMode || 'source-over';
        ctx.translate(
          width / 2 + ((kfTransform.x + stab.dx) / 100) * width + (trans.offsetXRatio + glitchJitterX) * width,
          height / 2 + ((kfTransform.y + stab.dy) / 100) * height + trans.offsetYRatio * height
        );
        ctx.rotate(((kfTransform.rotation + trans.rotationDeg) * Math.PI) / 180);
        const sxScale = (kfTransform.scale / 100) * trans.scaleXMultiplier * stabScale * (kfTransform.flipH ? -1 : 1);
        const syScale = (kfTransform.scale / 100) * trans.scaleYMultiplier * stabScale * (kfTransform.flipV ? -1 : 1);
        ctx.scale(sxScale, syScale);
        ctx.globalAlpha = Math.max(0, Math.min(1, (kfTransform.opacity / 100) * trans.alphaMultiplier));
        ctx.filter = buildCssFilterString(activeColor, trans.blurPx, trans.brightnessBoost);

        ctx.drawImage(sourceEl, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      }

      if (activeColor.temperature !== 0) {
        drawTemperatureTint(ctx, width, height, activeColor.temperature);
      }
      if (activeColor.vignette > 0) {
        drawVignette(ctx, width, height, activeColor.vignette);
      }
      if (trans.flashOverlay && trans.flashOverlay.alpha > 0.005) {
        ctx.save();
        ctx.globalAlpha = trans.flashOverlay.alpha;
        ctx.fillStyle = trans.flashOverlay.color;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }
}
