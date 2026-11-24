import type { VideoEffectItem } from '../../types/editor';

let auxCanvasA: HTMLCanvasElement | null = null;
let auxCtxA: CanvasRenderingContext2D | null = null;
let auxCanvasB: HTMLCanvasElement | null = null;
let auxCtxB: CanvasRenderingContext2D | null = null;

function getAuxA(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!auxCanvasA) {
    auxCanvasA = document.createElement('canvas');
    auxCtxA = auxCanvasA.getContext('2d');
  }
  if (auxCanvasA.width !== w || auxCanvasA.height !== h) {
    auxCanvasA.width = Math.max(1, w);
    auxCanvasA.height = Math.max(1, h);
  }
  return { canvas: auxCanvasA, ctx: auxCtxA! };
}

function getAuxB(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!auxCanvasB) {
    auxCanvasB = document.createElement('canvas');
    auxCtxB = auxCanvasB.getContext('2d');
  }
  if (auxCanvasB.width !== w || auxCanvasB.height !== h) {
    auxCanvasB.width = Math.max(1, w);
    auxCanvasB.height = Math.max(1, h);
  }
  return { canvas: auxCanvasB, ctx: auxCtxB! };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#ffffff').replace('#', '');
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, 'f');
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

// Deterministic pseudo-random helper [0..1)
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function copyCanvas(
  src: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  w: number,
  h: number
) {
  dstCtx.save();
  dstCtx.setTransform(1, 0, 0, 1, 0, 0);
  dstCtx.globalAlpha = 1;
  dstCtx.globalCompositeOperation = 'source-over';
  dstCtx.filter = 'none';
  dstCtx.clearRect(0, 0, w, h);
  dstCtx.drawImage(src, 0, 0, w, h);
  dstCtx.restore();
}

function applySingleEffect(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fx: VideoEffectItem,
  localTime: number
): void {
  const inten = Math.max(0, Math.min(1, fx.intensity / 100));
  if (inten <= 0.005) return;

  const spd = Math.max(0.1, fx.speed || 1);
  const scl = Math.max(0.1, (fx.scale || 100) / 100);
  const angRad = ((fx.angle || 0) * Math.PI) / 180;
  const t = localTime * spd;
  const tint = fx.tint || '#ffffff';
  const minDim = Math.min(w, h);

  switch (fx.type) {
    case 'cinematic-glow':
    case 'bloom':
    case 'soft-glow':
    case 'neon-glow': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const blurPx =
        fx.type === 'bloom'
          ? (14 + inten * 26) * scl
          : fx.type === 'neon-glow'
          ? (10 + inten * 22) * scl
          : (8 + inten * 16) * scl;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha =
        fx.type === 'soft-glow'
          ? inten * 0.6
          : fx.type === 'bloom'
          ? Math.min(0.95, inten * 0.85)
          : inten * 0.72;
      ctx.filter =
        fx.type === 'bloom'
          ? `blur(${blurPx.toFixed(1)}px) brightness(${1.2 + inten * 0.5}) contrast(1.25)`
          : fx.type === 'neon-glow'
          ? `blur(${blurPx.toFixed(1)}px) saturate(${1.6 + inten * 1.1}) brightness(1.15)`
          : `blur(${blurPx.toFixed(1)}px) brightness(1.08)`;
      ctx.drawImage(tmp, 0, 0, w, h);
      ctx.filter = 'none';

      if (fx.type === 'neon-glow' || fx.type === 'cinematic-glow') {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = fx.type === 'neon-glow' ? inten * 0.34 : inten * 0.22;
        const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
        grad.addColorStop(0, hexToRgba(tint, 0.7));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      break;
    }

    case 'gaussian-blur': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const blurPx = Math.max(0.5, inten * 24 * scl);
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      ctx.drawImage(tmp, 0, 0, w, h);
      ctx.restore();
      break;
    }

    case 'motion-blur': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const taps = 6;
      const dist = inten * 28 * scl;
      const dx = Math.cos(angRad) * dist;
      const dy = Math.sin(angRad) * dist;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < taps; i++) {
        const frac = i / (taps - 1) - 0.5;
        ctx.globalAlpha = i === 0 ? 1 : 1 / (taps - i + 1);
        ctx.drawImage(tmp, dx * frac, dy * frac, w, h);
      }
      ctx.restore();
      break;
    }

    case 'zoom-blur': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const taps = 6;
      const maxZoom = 1 + inten * 0.16 * scl;
      ctx.save();
      for (let i = 1; i <= taps; i++) {
        const f = i / taps;
        const sc = 1 + (maxZoom - 1) * f;
        ctx.globalAlpha = (1 - f * 0.65) * 0.34;
        const dw = w * sc;
        const dh = h * sc;
        ctx.drawImage(tmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      ctx.restore();
      break;
    }

    case 'radial-blur': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const taps = 6;
      const maxRot = inten * 0.085 * scl;
      ctx.save();
      for (let i = -taps / 2; i <= taps / 2; i++) {
        if (i === 0) continue;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate((i / (taps / 2)) * maxRot);
        ctx.globalAlpha = 0.22;
        ctx.drawImage(tmp, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.restore();
      break;
    }

    case 'rgb-split':
    case 'chromatic-aberration': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const shift = Math.max(1, inten * 20 * scl);
      const dx = Math.cos(angRad) * shift;
      const dy = Math.sin(angRad) * shift;

      // Build red/cyan tint buffers using auxB
      const { canvas: tintBuf, ctx: bCtx } = getAuxB(w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45 * inten;

      // Red shift left
      bCtx.clearRect(0, 0, w, h);
      bCtx.globalCompositeOperation = 'source-over';
      bCtx.drawImage(tmp, 0, 0, w, h);
      bCtx.globalCompositeOperation = 'multiply';
      bCtx.fillStyle = '#ff2a55';
      bCtx.fillRect(0, 0, w, h);
      bCtx.globalCompositeOperation = 'destination-in';
      bCtx.drawImage(tmp, 0, 0, w, h);
      ctx.drawImage(tintBuf, -dx, -dy, w, h);

      // Cyan shift right
      bCtx.clearRect(0, 0, w, h);
      bCtx.globalCompositeOperation = 'source-over';
      bCtx.drawImage(tmp, 0, 0, w, h);
      bCtx.globalCompositeOperation = 'multiply';
      bCtx.fillStyle = '#00e5ff';
      bCtx.fillRect(0, 0, w, h);
      bCtx.globalCompositeOperation = 'destination-in';
      bCtx.drawImage(tmp, 0, 0, w, h);
      ctx.drawImage(tintBuf, dx, dy, w, h);
      ctx.restore();
      break;
    }

    case 'digital-glitch': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const tick = Math.floor(t * 14);
      const slices = Math.max(4, Math.round(6 + inten * 12));
      ctx.save();
      for (let i = 0; i < slices; i++) {
        const s = tick * 31 + i * 17;
        if (hash01(s) < 0.42) continue;
        const sy = Math.floor(hash01(s + 1) * h);
        const sh = Math.max(3, Math.floor(hash01(s + 2) * h * 0.14 * scl));
        const offset = (hash01(s + 3) - 0.5) * w * 0.14 * inten;
        ctx.drawImage(tmp, 0, sy, w, Math.min(sh, h - sy), offset, sy, w, Math.min(sh, h - sy));
      }
      // Chromatic accent bar
      if (hash01(tick * 7) > 0.35) {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.25 * inten;
        const gy = hash01(tick * 11) * h;
        ctx.fillStyle = hash01(tick * 13) > 0.5 ? '#00f0ff' : '#ff2965';
        ctx.fillRect(0, gy, w, Math.max(2, h * 0.025));
      }
      ctx.restore();
      break;
    }

    case 'vhs-distortion': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const bandY = ((t * 0.28) % 1.2 - 0.1) * h;
      const bandH = h * 0.14 * scl;
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      const stripH = Math.max(3, Math.round(h / 45));
      for (let y = 0; y < h; y += stripH) {
        const distToBand = Math.abs(y - bandY);
        const bandFactor = distToBand < bandH ? 1 - distToBand / bandH : 0;
        const wobble =
          (Math.sin(y * 0.09 + t * 14) * 2.5 + bandFactor * 18 * Math.sin(t * 45 + y)) * inten;
        ctx.drawImage(tmp, 0, y, w, stripH, wobble, y, w, stripH);
      }
      // Faint VHS tracking noise band
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 * inten;
      ctx.fillStyle = '#e2e8f0';
      for (let i = 0; i < 24; i++) {
        const ry = bandY + (hash01(i + Math.floor(t * 24) * 3) - 0.5) * bandH;
        const rx = hash01(i * 5 + Math.floor(t * 18)) * w * 0.8;
        ctx.fillRect(rx, ry, w * (0.08 + hash01(i * 9) * 0.18), 1.5);
      }
      ctx.restore();
      break;
    }

    case 'wave-distortion': {
      const { canvas: tmp, ctx: tCtx } = getAuxA(w, h);
      copyCanvas(ctx.canvas, tCtx, w, h);
      const stripH = Math.max(2, Math.round(h / 70));
      const amp = inten * 18 * scl;
      const freq = (0.025 / Math.max(0.3, scl)) * (1920 / Math.max(320, w));
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < h; y += stripH) {
        const dx = Math.sin(y * freq * 2.5 + t * 5.2) * amp;
        ctx.drawImage(tmp, 0, y, w, stripH, dx, y, w, stripH);
      }
      ctx.restore();
      break;
    }

    case 'scanlines': {
      const step = Math.max(3, Math.round(4 * scl));
      const scrollY = (t * 18) % step;
      ctx.save();
      ctx.fillStyle = tint === '#000000' ? '#000000' : tint;
      ctx.globalAlpha = Math.min(0.68, inten * 0.55);
      for (let y = scrollY; y < h; y += step) {
        ctx.fillRect(0, y, w, Math.max(1, step * 0.45));
      }
      ctx.restore();
      break;
    }

    case 'light-leaks':
    case 'film-burn': {
      const isBurn = fx.type === 'film-burn';
      const shiftX = (Math.sin(t * 1.15) * 0.22 + 0.15) * w;
      const shiftY = (Math.cos(t * 0.85) * 0.18 + 0.25) * h;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.95, inten * (isBurn ? 0.88 : 0.72));

      const g1 = ctx.createRadialGradient(
        shiftX,
        shiftY,
        0,
        shiftX,
        shiftY,
        Math.max(w, h) * 0.62 * scl
      );
      g1.addColorStop(0, hexToRgba(isBurn ? '#fff3c4' : tint, 0.92));
      g1.addColorStop(0.35, hexToRgba(isBurn ? '#ff551a' : tint, 0.55));
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);

      const g2 = ctx.createRadialGradient(
        w - shiftX * 0.5,
        h - shiftY * 0.4,
        0,
        w - shiftX * 0.5,
        h - shiftY * 0.4,
        Math.max(w, h) * 0.52 * scl
      );
      g2.addColorStop(0, hexToRgba(isBurn ? '#dc2626' : '#f43f5e', 0.45));
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case 'lens-flare': {
      const cx = w * (0.28 + 0.44 * (0.5 + 0.5 * Math.sin(t * 0.65)));
      const cy = h * (0.25 + 0.3 * (0.5 + 0.5 * Math.cos(t * 0.5)));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(0.95, inten * 0.85);

      // Primary sun orb
      const orbR = minDim * 0.36 * scl;
      const orb = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR);
      orb.addColorStop(0, 'rgba(255,255,255,0.95)');
      orb.addColorStop(0.2, hexToRgba(tint, 0.65));
      orb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = orb;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.fill();

      // Anamorphic horizontal streak
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angRad);
      const streakW = w * 0.9 * scl;
      const streakH = Math.max(4, minDim * 0.045 * scl);
      const stGrad = ctx.createLinearGradient(-streakW / 2, 0, streakW / 2, 0);
      stGrad.addColorStop(0, 'rgba(0,0,0,0)');
      stGrad.addColorStop(0.5, hexToRgba(tint, 0.85));
      stGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = stGrad;
      ctx.fillRect(-streakW / 2, -streakH / 2, streakW, streakH);
      ctx.restore();

      // Secondary lens iris ghosts along diagonal through center
      const ghosts = [0.35, 0.65, 1.25, 1.55];
      ghosts.forEach((mul, idx) => {
        const gx = cx + (w * 0.5 - cx) * mul;
        const gy = cy + (h * 0.5 - cy) * mul;
        const gr = minDim * (0.04 + idx * 0.018) * scl;
        ctx.fillStyle = idx % 2 === 0 ? hexToRgba('#38BDF8', 0.25) : hexToRgba(tint, 0.22);
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      break;
    }

    case 'light-rays': {
      const originX = w * (0.5 + Math.sin(angRad) * 0.45);
      const originY = -h * 0.1;
      const rays = 9;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < rays; i++) {
        const phase = t * 0.45 + i * 0.7;
        const baseA = Math.PI * 0.22 + (i / (rays - 1)) * Math.PI * 0.56 + Math.sin(phase) * 0.03;
        const spread = (0.045 + 0.025 * Math.cos(phase * 1.3)) * scl;
        const len = Math.max(w, h) * 1.5;
        const grad = ctx.createRadialGradient(originX, originY, 0, originX, originY, len);
        grad.addColorStop(0, hexToRgba(tint, inten * 0.34));
        grad.addColorStop(0.65, hexToRgba(tint, inten * 0.1));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(originX + Math.cos(baseA - spread) * len, originY + Math.sin(baseA - spread) * len);
        ctx.lineTo(originX + Math.cos(baseA + spread) * len, originY + Math.sin(baseA + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'flash': {
      // Rhythmic decay strobe pulse every 1.2s / speed
      const cycle = (t * 0.85) % 1;
      const pulse = Math.pow(Math.max(0, 1 - cycle * 3.2), 2);
      if (pulse > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = pulse * inten * 0.85;
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      break;
    }

    case 'exposure-flicker': {
      const wave =
        0.5 * Math.sin(t * 22) + 0.35 * Math.sin(t * 37.3) + 0.15 * Math.cos(t * 53);
      const alpha = Math.abs(wave) * inten * 0.24;
      ctx.save();
      ctx.globalCompositeOperation = wave >= 0 ? 'screen' : 'multiply';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = wave >= 0 ? tint : '#000000';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case 'fx-vignette': {
      ctx.save();
      const outer = Math.max(w, h) * (0.72 / Math.max(0.45, Math.min(1.6, scl)));
      const inner = Math.min(w, h) * 0.22;
      const grad = ctx.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, outer);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, hexToRgba(tint === '#000000' ? '#000000' : tint, Math.min(0.95, inten * 0.9)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case 'film-grain':
    case 'analog-noise': {
      const isAnalog = fx.type === 'analog-noise';
      const count = Math.round((isAnalog ? 950 : 700) * inten);
      const tick = Math.floor(t * 24);
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      for (let i = 0; i < count; i++) {
        const x = hash01(tick * 131 + i * 3) * w;
        const y = hash01(tick * 197 + i * 5) * h;
        const bright = hash01(tick * 73 + i * 7) > 0.5;
        ctx.fillStyle = bright
          ? `rgba(255,255,255,${0.25 * inten})`
          : `rgba(0,0,0,${0.28 * inten})`;
        const sz = Math.max(1, (isAnalog ? 2.2 : 1.6) * scl);
        ctx.fillRect(x, y, isAnalog ? sz * 2.4 : sz, sz);
      }
      ctx.restore();
      break;
    }

    case 'film-8mm':
    case 'film-16mm':
    case 'film-35mm': {
      const is8 = fx.type === 'film-8mm';
      const is16 = fx.type === 'film-16mm';
      const tick = Math.floor(t * (is8 ? 18 : 24));
      ctx.save();
      // Subtle vintage warmth
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = inten * (is8 ? 0.55 : is16 ? 0.42 : 0.3);
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);

      // Gate flicker
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = inten * (is8 ? 0.12 : 0.06) * (0.5 + 0.5 * Math.sin(t * 29));
      ctx.fillStyle = '#0f0c08';
      ctx.fillRect(0, 0, w, h);

      // Vertical emulsion scratches for 8mm/16mm
      if (is8 || is16) {
        ctx.globalCompositeOperation = 'screen';
        const scratches = is8 ? 3 : 2;
        for (let i = 0; i < scratches; i++) {
          if (hash01(tick * 17 + i) < 0.35) continue;
          const sx = hash01(tick * 29 + i * 11) * w;
          ctx.strokeStyle = `rgba(255,245,220,${0.28 * inten})`;
          ctx.lineWidth = Math.max(1, minDim * 0.002);
          ctx.beginPath();
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx + (hash01(tick + i) - 0.5) * 8, h);
          ctx.stroke();
        }
      }

      // Film grain + soft gate vignette
      ctx.globalCompositeOperation = 'overlay';
      const grains = Math.round((is8 ? 600 : is16 ? 450 : 320) * inten);
      for (let i = 0; i < grains; i++) {
        const gx = hash01(tick * 97 + i * 3) * w;
        const gy = hash01(tick * 149 + i * 5) * h;
        ctx.fillStyle =
          hash01(tick * 41 + i) > 0.5
            ? `rgba(255,250,235,${0.22 * inten})`
            : `rgba(15,10,5,${0.25 * inten})`;
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }

      const vig = ctx.createRadialGradient(w / 2, h / 2, minDim * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(0,0,0,${inten * (is8 ? 0.65 : is16 ? 0.45 : 0.32)})`);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }

    case 'rain': {
      const drops = Math.round(55 + inten * 110);
      const angleX = Math.sin(angRad) * 28;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = hexToRgba(tint, Math.min(0.8, inten * 0.65));
      ctx.lineWidth = Math.max(1, minDim * 0.0022 * scl);
      ctx.lineCap = 'round';
      for (let i = 0; i < drops; i++) {
        const rx = hash01(i * 13 + 1);
        const speedMul = 0.75 + hash01(i * 17 + 2) * 0.7;
        const ry = (hash01(i * 19 + 3) + t * 1.45 * speedMul) % 1.15;
        const x = ((rx * w + ry * angleX * 2) % (w + 40)) - 20;
        const y = ry * h - 20;
        const len = (14 + hash01(i * 23) * 24) * (minDim / 500) * scl;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + angleX * 0.45, y + len);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'snow': {
      const flakes = Math.round(45 + inten * 95);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < flakes; i++) {
        const bx = hash01(i * 11 + 2);
        const speedMul = 0.4 + hash01(i * 29 + 5) * 0.65;
        const y = ((hash01(i * 17 + 7) + t * 0.22 * speedMul) % 1.08) * h - 10;
        const sway = Math.sin(t * 2.1 + i) * 18 * scl;
        const x = ((bx * w + sway + t * Math.sin(angRad) * 40) % w + w) % w;
        const r = (1.5 + hash01(i * 31) * 3.8) * (minDim / 600) * scl;
        ctx.fillStyle = hexToRgba(tint, Math.min(0.85, (0.35 + hash01(i * 7) * 0.5) * inten));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'dust': {
      const motes = Math.round(35 + inten * 70);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < motes; i++) {
        const bx = hash01(i * 41 + 1);
        const by = hash01(i * 53 + 3);
        const x = ((bx + Math.sin(t * 0.45 + i * 1.3) * 0.06) * w + w) % w;
        const y = ((by + Math.cos(t * 0.35 + i * 0.9) * 0.06 - t * 0.03) * h + h) % h;
        const r = (1 + hash01(i * 19) * 2.8) * (minDim / 600) * scl;
        const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + i));
        ctx.fillStyle = hexToRgba(tint, pulse * inten * 0.7);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'sparkles': {
      const stars = Math.round(18 + inten * 42);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < stars; i++) {
        const twinkle = Math.pow(Math.max(0, Math.sin(t * 2.8 + i * 1.7)), 3);
        if (twinkle < 0.05) continue;
        const x = hash01(i * 61 + 2) * w;
        const y = hash01(i * 71 + 4) * h;
        const r = (5 + hash01(i * 37) * 11) * (minDim / 600) * scl * twinkle;
        ctx.fillStyle = hexToRgba(tint, twinkle * inten * 0.9);
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.quadraticCurveTo(x, y, x, y + r);
        ctx.quadraticCurveTo(x, y, x - r, y);
        ctx.quadraticCurveTo(x, y, x, y - r);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    case 'smoke': {
      const puffs = 10;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < puffs; i++) {
        const driftX = ((hash01(i * 13 + 7) + t * (0.04 + i * 0.004)) % 1.3 - 0.15) * w;
        const driftY = h * (0.45 + hash01(i * 23) * 0.5 + Math.sin(t * 0.6 + i) * 0.06);
        const rad = minDim * (0.28 + hash01(i * 31) * 0.24) * scl;
        const g = ctx.createRadialGradient(driftX, driftY, 0, driftX, driftY, rad);
        g.addColorStop(0, hexToRgba(tint, inten * 0.16));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(driftX, driftY, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
  }
}

export function applyVideoEffectsStack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stack: VideoEffectItem[] | undefined,
  localTime: number
): void {
  if (!stack || stack.length === 0) return;
  for (const fx of stack) {
    if (!fx.enabled || fx.intensity <= 0) continue;
    applySingleEffect(ctx, w, h, fx, localTime);
  }
}
