import { getMediaRecordById, saveMediaRecord } from '../../services/db';
import { mediaCache } from '../../services/mediaCache';
import type { MediaAsset, MediaAssetRecord } from '../../types/editor';
import { createId } from '../../utils/id';

const MAX_WAVEFORM_DECODE_BYTES = 80 * 1024 * 1024; // Avoid decoding massive multi-hundred-MB files into JS AudioBuffer heap

let persistRequested = false;
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistRequested) return true;
  persistRequested = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // Ignore unsupported storage environments
  }
  return false;
}

export function detectMediaCategory(file: File): 'video' | 'image' | 'audio' | null {
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (
    mime.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'mkv', 'm4v', 'ogv', 'avi', 'wmv', 'flv', '3gp', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg'].includes(ext)
  ) {
    return 'video';
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'opus', 'wma', 'aiff'].includes(ext)) {
    return 'audio';
  }
  return null;
}

async function extractWaveformPeaks(blob: Blob, bins = 120): Promise<number[] | undefined> {
  if (blob.size > MAX_WAVEFORM_DECODE_BYTES) {
    return undefined;
  }
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return undefined;

  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioCtx();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / bins));
    const peaks: number[] = [];
    let globalMax = 0;

    for (let i = 0; i < bins; i++) {
      const start = i * step;
      const end = Math.min(channelData.length, start + step);
      let peak = 0;
      const sampleStride = Math.max(1, Math.floor((end - start) / 64));
      for (let j = start; j < end; j += sampleStride) {
        const abs = Math.abs(channelData[j]);
        if (abs > peak) peak = abs;
      }
      if (peak > globalMax) globalMax = peak;
      peaks.push(peak);
    }

    if (globalMax > 0) {
      return peaks.map((p) => Number((p / globalMax).toFixed(3)));
    }
    return peaks;
  } catch {
    return undefined;
  } finally {
    if (ctx && ctx.state !== 'closed') {
      await ctx.close().catch(() => {});
    }
  }
}

function createThumbnailFromImage(img: HTMLImageElement, maxWidth = 320): string {
  const ratio = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 9 / 16;
  const width = Math.min(maxWidth, img.naturalWidth || maxWidth);
  const height = Math.max(1, Math.round(width * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0, width, height);
  }
  return canvas.toDataURL('image/jpeg', 0.8);
}

function analyzeImageBlob(blob: Blob): Promise<{ width: number; height: number; thumbnailDataUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const thumb = createThumbnailFromImage(img);
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || 1920,
        height: img.naturalHeight || 1080,
        thumbnailDataUrl: thumb,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image file.'));
    };
    img.src = url;
  });
}

function captureVideoFrameThumbnail(video: HTMLVideoElement, vw: number, vh: number): string {
  const thumbW = 320;
  const thumbH = Math.max(1, Math.round(thumbW * (vh / Math.max(1, vw))));
  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    try {
      ctx.drawImage(video, 0, 0, thumbW, thumbH);
    } catch {
      ctx.fillStyle = '#181A1F';
      ctx.fillRect(0, 0, thumbW, thumbH);
    }
  }
  return canvas.toDataURL('image/jpeg', 0.8);
}

function analyzeVideoBlob(blob: Blob): Promise<{ duration: number; width: number; height: number; thumbnailDataUrl?: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let settled = false;
    let seekTimer: number | null = null;
    let knownDuration = 10;
    let knownWidth = 1920;
    let knownHeight = 1080;
    let gotMetadata = false;

    const cleanup = () => {
      if (seekTimer !== null) window.clearTimeout(seekTimer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };

    const finish = (thumb?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(overallTimeout);
      cleanup();
      resolve({
        duration: knownDuration,
        width: knownWidth,
        height: knownHeight,
        thumbnailDataUrl: thumb,
      });
    };

    const overallTimeout = window.setTimeout(() => {
      // Never block large video imports if browser metadata/seek takes too long
      if (gotMetadata) {
        finish(captureVideoFrameThumbnail(video, knownWidth, knownHeight));
      } else {
        finish(undefined);
      }
    }, 15000);

    video.onloadedmetadata = () => {
      gotMetadata = true;
      knownDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
      knownWidth = video.videoWidth || 1280;
      knownHeight = video.videoHeight || 720;

      // Fallback if seeking stalls on very large containers
      seekTimer = window.setTimeout(() => {
        finish(captureVideoFrameThumbnail(video, knownWidth, knownHeight));
      }, 3500);

      const seekTarget = Math.min(knownDuration * 0.12, 0.8);
      try {
        video.currentTime = seekTarget;
      } catch {
        finish(captureVideoFrameThumbnail(video, knownWidth, knownHeight));
      }
    };

    video.onseeked = () => {
      const thumb = captureVideoFrameThumbnail(video, knownWidth, knownHeight);
      finish(thumb);
    };

    video.onerror = () => {
      if (settled) return;
      if (gotMetadata) {
        finish(undefined);
        return;
      }
      settled = true;
      window.clearTimeout(overallTimeout);
      cleanup();
      reject(new Error('Browser could not decode this video format or codec.'));
    };

    video.src = url;
  });
}

function analyzeAudioBlob(blob: Blob): Promise<{ duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    let settled = false;
    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };

    audio.onloadedmetadata = () => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 5;
      cleanup();
      resolve({ duration });
    };

    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Browser could not decode this audio format.'));
    };

    audio.src = url;
  });
}

export async function analyzeAndStoreMediaFile(file: File, projectId: string): Promise<MediaAsset> {
  void requestPersistentStorage();
  const category = detectMediaCategory(file);
  if (!category) {
    throw new Error(`Unsupported file type: "${file.name}".`);
  }

  let duration = 5;
  let width = 1920;
  let height = 1080;
  let thumbnailDataUrl: string | undefined;
  let waveformPeaks: number[] | undefined;

  if (category === 'image') {
    const meta = await analyzeImageBlob(file);
    width = meta.width;
    height = meta.height;
    thumbnailDataUrl = meta.thumbnailDataUrl;
    duration = 5; // Default image clip length on timeline
  } else if (category === 'video') {
    const meta = await analyzeVideoBlob(file);
    duration = meta.duration;
    width = meta.width;
    height = meta.height;
    thumbnailDataUrl = meta.thumbnailDataUrl;
    waveformPeaks = await extractWaveformPeaks(file);
  } else {
    const meta = await analyzeAudioBlob(file);
    duration = meta.duration;
    width = 0;
    height = 0;
    waveformPeaks = await extractWaveformPeaks(file);
  }

  const record: MediaAssetRecord = {
    id: createId('media'),
    projectId,
    name: file.name,
    type: category,
    mimeType: file.type || `${category}/unknown`,
    size: file.size,
    duration,
    width,
    height,
    blob: file,
    thumbnailDataUrl,
    waveformPeaks,
    createdAt: Date.now(),
  };

  await saveMediaRecord(record);
  return mediaCache.hydrateRecord(record);
}

/**
 * Generates real local test media (WebM video via Canvas captureStream, PNG slate, or WAV audio chime)
 * so users can test timeline editing immediately without external mock URLs.
 */
export async function generateTestMediaAsset(
  kind: 'video' | 'image' | 'audio',
  projectId: string
): Promise<MediaAsset> {
  if (kind === 'image') {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
    grad.addColorStop(0, '#10161d');
    grad.addColorStop(0.5, '#1e2c36');
    grad.addColorStop(1, '#0d1515');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1920, 1080);

    // Technical SMPTE-inspired calibration grid
    ctx.strokeStyle = 'rgba(185, 201, 209, 0.14)';
    ctx.lineWidth = 2;
    for (let x = 160; x < 1920; x += 160) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1080);
      ctx.stroke();
    }
    for (let y = 135; y < 1080; y += 135) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1920, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(250, 249, 246, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(120, 80, 1680, 920);

    ctx.fillStyle = '#FAF9F6';
    ctx.font = '600 54px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CALIBRATION SLATE · 1920×1080', 960, 520);
    ctx.fillStyle = '#A5ADAD';
    ctx.font = '500 28px JetBrains Mono, monospace';
    ctx.fillText('REC.709 · 16:9 SAFE FRAME', 960, 580);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const file = new File([blob], `Test_Slate_1080p.png`, { type: 'image/png' });
    return analyzeAndStoreMediaFile(file, projectId);
  }

  if (kind === 'audio') {
    const sampleRate = 44100;
    const durationSec = 6;
    const numSamples = sampleRate * durationSec;
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Synthesize a clean ambient harmonic pad + pulse markers
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t * 4) * Math.min(1, (durationSec - t) * 2);
      const pulse = 0.6 + 0.4 * Math.sin(2 * Math.PI * 1.5 * t);
      const sample =
        (0.32 * Math.sin(2 * Math.PI * 220 * t) +
          0.22 * Math.sin(2 * Math.PI * 330 * t) +
          0.14 * Math.sin(2 * Math.PI * 440 * t)) *
        env *
        pulse;
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    const file = new File([blob], 'Ambient_Pulse_6s.wav', { type: 'audio/wav' });
    return analyzeAndStoreMediaFile(file, projectId);
  }

  // Generate a real 4-second 1280x720 WebM countdown/motion clip
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const blobPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const durationMs = 3600;
  const start = performance.now();
  recorder.start(100);

  await new Promise<void>((resolve) => {
    const draw = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / durationMs);

      const hue = 195 + t * 40;
      const grad = ctx.createRadialGradient(640, 360, 40, 640, 360, 720);
      grad.addColorStop(0, `hsl(${hue}, 32%, 28%)`);
      grad.addColorStop(1, '#0d1515');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Animated sweep arc & moving horizon bar
      const barX = 140 + t * 1000;
      ctx.strokeStyle = 'rgba(185, 201, 209, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barX, 80);
      ctx.lineTo(barX, 640);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(640, 360, 160, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      ctx.strokeStyle = '#b9c9d1';
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.fillStyle = '#FAF9F6';
      ctx.font = '600 48px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`TEST REEL · ${(elapsed / 1000).toFixed(2)}s`, 640, 375);

      if (elapsed < durationMs) {
        requestAnimationFrame(draw);
      } else {
        recorder.stop();
        resolve();
      }
    };
    draw();
  });

  const blob = await blobPromise;
  stream.getTracks().forEach((tr) => tr.stop());

  const file = new File([blob], 'Generated_Test_Reel.webm', { type: 'video/webm' });
  return analyzeAndStoreMediaFile(file, projectId);
}

/**
 * Generates a real 640px-wide low-bitrate WebM proxy copy stored in IndexedDB alongside the master Blob.
 */
export async function generateProxyForAsset(
  mediaId: string,
  onProgress?: (pct: number) => void
): Promise<MediaAsset> {
  const record = await getMediaRecordById(mediaId);
  if (!record || record.type !== 'video') {
    throw new Error('Proxy generation is supported for video assets only.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is unavailable for proxy transcoding.');
  }

  const masterUrl = URL.createObjectURL(record.blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = masterUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode master video for proxy.'));
    });

    const proxyW = Math.min(640, video.videoWidth || 640);
    const proxyH = Math.max(
      2,
      Math.round((proxyW / Math.max(1, video.videoWidth || 16)) * (video.videoHeight || 9))
    );
    const canvas = document.createElement('canvas');
    canvas.width = proxyW;
    canvas.height = proxyH;
    const ctx = canvas.getContext('2d')!;

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    recorder.start(200);
    video.currentTime = 0;
    await video.play();

    await new Promise<void>((resolve) => {
      const draw = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          resolve();
          return;
        }
        ctx.drawImage(video, 0, 0, proxyW, proxyH);
        const pct = video.duration > 0 ? Math.min(99, (video.currentTime / video.duration) * 100) : 50;
        onProgress?.(Math.round(pct));
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);
    });

    const proxyBlob = await stopPromise;
    stream.getTracks().forEach((t) => t.stop());

    const updatedRecord: MediaAssetRecord = {
      ...record,
      proxyBlob,
    };
    await saveMediaRecord(updatedRecord);
    mediaCache.revoke(record.id);
    onProgress?.(100);
    return mediaCache.hydrateRecord(updatedRecord);
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(masterUrl);
  }
}

/**
 * Captures the exact rendered frame of a canvas as a real PNG image asset in IndexedDB.
 */
export async function createFreezeFrameAsset(
  sourceCanvas: HTMLCanvasElement,
  name: string,
  projectId: string
): Promise<MediaAsset> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    sourceCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to capture frame buffer.'))),
      'image/png'
    );
  });
  const file = new File([blob], `${name}_Freeze.png`, { type: 'image/png' });
  return analyzeAndStoreMediaFile(file, projectId);
}

