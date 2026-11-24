import type {
  ChromaKeySettings,
  Clip,
  ClipColorAdjustments,
  ClipVisualEffects,
  Keyframe,
  MaskSettings,
  StabilizationOffset,
} from '../../types/editor';
import { createId } from '../../utils/id';

// Reusable offscreen scratch canvases to avoid per-frame DOM allocations
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let maskCanvas: HTMLCanvasElement | null = null;
let maskCtx: CanvasRenderingContext2D | null = null;

export function getScratchCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (scratchCanvas.width !== w || scratchCanvas.height !== h) {
    scratchCanvas.width = Math.max(1, w);
    scratchCanvas.height = Math.max(1, h);
  }
  return { canvas: scratchCanvas, ctx: scratchCtx! };
}

function getMaskCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
  }
  if (maskCanvas.width !== w || maskCanvas.height !== h) {
    maskCanvas.width = Math.max(1, w);
    maskCanvas.height = Math.max(1, h);
  }
  return { canvas: maskCanvas, ctx: maskCtx! };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [0, 255, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function buildToneCurveLut(color: ClipColorAdjustments): Uint8Array | null {
  if (color.curveShadows === 0 && color.curveMidtones === 0 && color.curveHighlights === 0) {
    return null;
  }
  const lut = new Uint8Array(256);
  const sh = color.curveShadows / 100; // -0.5 to 0.5
  const mid = color.curveMidtones / 100;
  const hi = color.curveHighlights / 100;

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    // Weighted basis across shadows (1-x)^2, midtones 2x(1-x), highlights x^2
    const wSh = (1 - x) * (1 - x);
    const wMid = 2 * x * (1 - x);
    const wHi = x * x;
    const y = x + sh * 0.45 * wSh + mid * 0.55 * wMid + hi * 0.45 * wHi;
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  return lut;
}

/**
 * Applies pixel-level Chroma Key, Tone Curves, and Film Grain on scratchCanvas.
 */
export function applyPixelProcessors(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  chroma: ChromaKeySettings,
  color: ClipColorAdjustments,
  effects: ClipVisualEffects
): void {
  const lut = buildToneCurveLut(color);
  const needsChroma = chroma.enabled;
  const needsGrain = effects.filmGrain > 0;
  const needsInvert = effects.invert;

  if (!lut && !needsChroma && !needsGrain && !needsInvert) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const [kr, kg, kb] = needsChroma ? hexToRgb(chroma.color) : [0, 255, 0];
  const simThresh = (chroma.similarity / 100) * 240;
  const smoothSpan = Math.max(1, (chroma.smoothness / 100) * 140);
  const spillFactor = chroma.spillSuppression / 100;
  const grainAmp = (effects.filmGrain / 100) * 48;

  // Deterministic fast LCG for grain
  let seed = 1337;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    let a = data[i + 3];

    if (a === 0) continue;

    if (needsChroma) {
      const dr = r - kr;
      const dg = g - kg;
      const db = b - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < simThresh) {
        a = 0;
      } else if (dist < simThresh + smoothSpan) {
        const ratio = (dist - simThresh) / smoothSpan;
        a = Math.round(a * ratio);
        if (spillFactor > 0) {
          // Despill dominant key channel toward average of other two
          if (kg >= kr && kg >= kb) {
            const avg = (r + b) * 0.5;
            if (g > avg) g = Math.round(g - (g - avg) * spillFactor);
          } else if (kb >= kr && kb >= kg) {
            const avg = (r + g) * 0.5;
            if (b > avg) b = Math.round(b - (b - avg) * spillFactor);
          }
        }
      }
    }

    if (a > 0 && lut) {
      r = lut[r];
      g = lut[g];
      b = lut[b];
    }

    if (a > 0 && needsInvert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    if (a > 0 && needsGrain) {
      seed = (seed * 1664525 + 1013904223) | 0;
      const n = (((seed >>> 24) & 255) / 255 - 0.5) * grainAmp;
      r = Math.max(0, Math.min(255, r + n));
      g = Math.max(0, Math.min(255, g + n));
      b = Math.max(0, Math.min(255, b + n));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Applies geometric/feathered alpha Masking onto the scratch canvas prior to main compositing.
 */
export function applyMaskToCanvas(
  targetCtx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mask: MaskSettings
): void {
  if (mask.shape === 'none') return;

  const { canvas: mCanvas, ctx: mCtx } = getMaskCanvas(w, h);
  mCtx.save();
  mCtx.clearRect(0, 0, w, h);

  if (mask.feather > 0) {
    mCtx.filter = `blur(${mask.feather}px)`;
  }

  mCtx.fillStyle = '#ffffff';
  const cx = (mask.x / 100) * w;
  const cy = (mask.y / 100) * h;
  const mw = Math.max(4, (mask.width / 100) * w);
  const mh = Math.max(4, (mask.height / 100) * h);
  const rotRad = ((mask.rotation ?? 0) * Math.PI) / 180;
  const radius = Math.max(0, Math.min(Math.min(mw, mh) / 2, mask.cornerRadius ?? 0));

  mCtx.translate(cx, cy);
  if (rotRad !== 0) {
    mCtx.rotate(rotRad);
  }

  mCtx.beginPath();
  if (mask.shape === 'rectangle') {
    if (radius > 0 && typeof mCtx.roundRect === 'function') {
      mCtx.roundRect(-mw / 2, -mh / 2, mw, mh, radius);
    } else if (radius > 0) {
      const rx = -mw / 2;
      const ry = -mh / 2;
      mCtx.moveTo(rx + radius, ry);
      mCtx.lineTo(rx + mw - radius, ry);
      mCtx.quadraticCurveTo(rx + mw, ry, rx + mw, ry + radius);
      mCtx.lineTo(rx + mw, ry + mh - radius);
      mCtx.quadraticCurveTo(rx + mw, ry + mh, rx + mw - radius, ry + mh);
      mCtx.lineTo(rx + radius, ry + mh);
      mCtx.quadraticCurveTo(rx, ry + mh, rx, ry + mh - radius);
      mCtx.lineTo(rx, ry + radius);
      mCtx.quadraticCurveTo(rx, ry, rx + radius, ry);
      mCtx.closePath();
    } else {
      mCtx.rect(-mw / 2, -mh / 2, mw, mh);
    }
  } else if (mask.shape === 'circle') {
    const r = Math.min(mw, mh) / 2;
    mCtx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (mask.shape === 'ellipse') {
    mCtx.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2);
  } else if (mask.shape === 'linear-wipe') {
    mCtx.rect(-cx - w, -h, cx + w, h * 2);
  }
  mCtx.fill();
  mCtx.restore();

  targetCtx.save();
  targetCtx.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in';
  targetCtx.drawImage(mCanvas, 0, 0);
  targetCtx.restore();
}

/**
 * Real block-matching (SAD) motion tracker on an offscreen 160x90 analysis canvas.
 * Samples frames from the video and generates Keyframes that follow the selected ROI.
 */
export async function trackObjectInVideo(
  videoUrl: string,
  clip: Clip,
  roiNormX: number, // 0..100
  roiNormY: number, // 0..100
  onProgress?: (pct: number) => void
): Promise<Keyframe[]> {
  const analysisW = 160;
  const analysisH = 90;
  const canvas = document.createElement('canvas');
  canvas.width = analysisW;
  canvas.height = analysisH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Could not decode video for motion tracking.'));
  });

  const sampleStepSec = Math.max(0.15, clip.duration / 18);
  const patchHalf = 7; // 15x15 template
  const searchRadius = 16;

  let curX = Math.max(patchHalf, Math.min(analysisW - patchHalf - 1, Math.round((roiNormX / 100) * analysisW)));
  let curY = Math.max(patchHalf, Math.min(analysisH - patchHalf - 1, Math.round((roiNormY / 100) * analysisH)));
  let templateGray: Float32Array | null = null;
  const keyframes: Keyframe[] = [];

  const seekAndGrab = async (sourceTime: number): Promise<Uint8ClampedArray> => {
    video.currentTime = Math.max(0, Math.min(video.duration || sourceTime, sourceTime));
    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done, { once: true });
    });
    ctx.drawImage(video, 0, 0, analysisW, analysisH);
    return ctx.getImageData(0, 0, analysisW, analysisH).data;
  };

  const toGray = (rgba: Uint8ClampedArray): Float32Array => {
    const g = new Float32Array(analysisW * analysisH);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      g[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
    return g;
  };

  const totalSteps = Math.max(2, Math.ceil(clip.duration / sampleStepSec) + 1);
  for (let idx = 0; idx < totalSteps; idx++) {
    const localTime = Math.min(clip.duration, idx * sampleStepSec);
    const srcTime = clip.sourceIn + localTime * clip.speed;
    const rgba = await seekAndGrab(srcTime);
    const gray = toGray(rgba);

    if (!templateGray) {
      const patchSize = patchHalf * 2 + 1;
      templateGray = new Float32Array(patchSize * patchSize);
      let k = 0;
      for (let dy = -patchHalf; dy <= patchHalf; dy++) {
        for (let dx = -patchHalf; dx <= patchHalf; dx++) {
          templateGray[k++] = gray[(curY + dy) * analysisW + (curX + dx)];
        }
      }
    } else {
      // Search around previous position for minimum SAD
      let bestSad = Infinity;
      let bestX = curX;
      let bestY = curY;

      const minY = Math.max(patchHalf, curY - searchRadius);
      const maxY = Math.min(analysisH - patchHalf - 1, curY + searchRadius);
      const minX = Math.max(patchHalf, curX - searchRadius);
      const maxX = Math.min(analysisW - patchHalf - 1, curX + searchRadius);

      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          let sad = 0;
          let k = 0;
          for (let dy = -patchHalf; dy <= patchHalf; dy++) {
            const rowOffset = (cy + dy) * analysisW + cx;
            for (let dx = -patchHalf; dx <= patchHalf; dx++) {
              sad += Math.abs(gray[rowOffset + dx] - templateGray[k++]);
            }
          }
          if (sad < bestSad) {
            bestSad = sad;
            bestX = cx;
            bestY = cy;
          }
        }
      }
      curX = bestX;
      curY = bestY;
    }

    keyframes.push({
      id: createId('kf'),
      time: Number(localTime.toFixed(3)),
      x: Number(((curX / analysisW) * 100).toFixed(1)),
      y: Number(((curY / analysisH) * 100).toFixed(1)),
      scale: 100,
      rotation: 0,
      opacity: 100,
      easing: 'linear',
    });

    onProgress?.(Math.round(((idx + 1) / totalSteps) * 100));
  }

  video.removeAttribute('src');
  video.load();
  return keyframes;
}

/**
 * Computes real 2D stabilization counter-offsets by tracking high-frequency
 * frame-to-frame luminance shift and applying high-pass smoothing.
 */
export async function analyzeVideoStabilization(
  videoUrl: string,
  clip: Clip,
  onProgress?: (pct: number) => void
): Promise<StabilizationOffset[]> {
  const w = 128;
  const h = 72;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Could not decode video for stabilization.'));
  });

  const stepSec = Math.max(0.12, clip.duration / 20);
  const totalSteps = Math.max(3, Math.ceil(clip.duration / stepSec) + 1);
  const rawPositions: { time: number; cx: number; cy: number }[] = [];

  for (let i = 0; i < totalSteps; i++) {
    const localTime = Math.min(clip.duration, i * stepSec);
    const srcTime = clip.sourceIn + localTime * clip.speed;
    video.currentTime = Math.max(0, Math.min(video.duration || srcTime, srcTime));
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
    });

    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 4; y < h - 4; y++) {
      for (let x = 4; x < w - 4; x++) {
        const idx = (y * w + x) * 4;
        const luma = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
        // Edge energy weight
        const idxR = (y * w + (x + 1)) * 4;
        const lumaR = data[idxR] * 0.299 + data[idxR + 1] * 0.587 + data[idxR + 2] * 0.114;
        const edge = Math.abs(luma - lumaR);
        if (edge > 12) {
          sumW += edge;
          sumX += x * edge;
          sumY += y * edge;
        }
      }
    }

    const cx = sumW > 0 ? (sumX / sumW / w) * 100 : 50;
    const cy = sumW > 0 ? (sumY / sumW / h) * 100 : 50;
    rawPositions.push({ time: Number(localTime.toFixed(3)), cx, cy });
    onProgress?.(Math.round(((i + 1) / totalSteps) * 100));
  }

  video.removeAttribute('src');
  video.load();

  // Compute smoothed trajectory (moving average window = 5) and invert high-frequency residual
  const offsets: StabilizationOffset[] = rawPositions.map((pos, i) => {
    let avgX = 0;
    let avgY = 0;
    let count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(rawPositions.length - 1, i + 2); j++) {
      avgX += rawPositions[j].cx;
      avgY += rawPositions[j].cy;
      count++;
    }
    avgX /= count;
    avgY /= count;
    // Clamp compensation to +/- 6% so frame stays covered under auto-scale
    const dx = Math.max(-6, Math.min(6, (avgX - pos.cx) * 0.65));
    const dy = Math.max(-6, Math.min(6, (avgY - pos.cy) * 0.65));
    return {
      time: pos.time,
      dx: Number(dx.toFixed(2)),
      dy: Number(dy.toFixed(2)),
    };
  });

  return offsets;
}
