export interface FilmstripFrame {
  time: number;
  dataUrl: string;
}

interface CacheEntry {
  frames: FilmstripFrame[];
  status: 'pending' | 'ready' | 'failed';
}

type Listener = () => void;

class VideoFilmstripCache {
  private cache = new Map<string, CacheEntry>();
  private listeners = new Map<string, Set<Listener>>();
  private queue: { mediaId: string; objectUrl: string; duration: number }[] = [];
  private processing = false;

  getFrames(mediaId: string): FilmstripFrame[] {
    return this.cache.get(mediaId)?.frames ?? [];
  }

  ensureFrames(mediaId: string, objectUrl: string, duration: number): void {
    if (!mediaId || !objectUrl) return;
    const existing = this.cache.get(mediaId);
    if (existing) return;

    this.cache.set(mediaId, { frames: [], status: 'pending' });
    this.queue.push({ mediaId, objectUrl, duration: Math.max(0.5, duration) });
    void this.drainQueue();
  }

  subscribe(mediaId: string, fn: Listener): () => void {
    let set = this.listeners.get(mediaId);
    if (!set) {
      set = new Set();
      this.listeners.set(mediaId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) this.listeners.delete(mediaId);
    };
  }

  clearAsset(mediaId: string): void {
    this.cache.delete(mediaId);
    this.listeners.delete(mediaId);
  }

  clearAll(): void {
    this.cache.clear();
    this.listeners.clear();
    this.queue = [];
  }

  private emit(mediaId: string): void {
    const set = this.listeners.get(mediaId);
    if (!set) return;
    for (const fn of set) fn();
  }

  private async drainQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const entry = this.cache.get(job.mediaId);
      if (!entry || entry.status !== 'pending') continue;

      try {
        await this.extractFramesForJob(job.mediaId, job.objectUrl, job.duration);
      } catch {
        const curr = this.cache.get(job.mediaId);
        if (curr) curr.status = 'failed';
      }
    }

    this.processing = false;
  }

  private extractFramesForJob(mediaId: string, objectUrl: string, fallbackDur: number): Promise<void> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let settled = false;

      const finish = (status: 'ready' | 'failed') => {
        if (settled) return;
        settled = true;
        window.clearTimeout(guardTimer);
        video.pause();
        video.removeAttribute('src');
        video.load();
        const entry = this.cache.get(mediaId);
        if (entry) entry.status = status;
        this.emit(mediaId);
        resolve();
      };

      const guardTimer = window.setTimeout(() => finish('ready'), 16000);

      video.onerror = () => finish('failed');

      video.onloadeddata = async () => {
        if (!ctx) {
          finish('failed');
          return;
        }
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackDur;
        const vw = video.videoWidth || 160;
        const vh = video.videoHeight || 90;
        const thumbW = 128;
        const thumbH = Math.max(36, Math.min(96, Math.round(thumbW * (vh / Math.max(1, vw)))));
        canvas.width = thumbW;
        canvas.height = thumbH;

        const targetCount = Math.max(8, Math.min(24, Math.ceil(dur * 1.5)));
        const times: number[] = [];
        for (let i = 0; i < targetCount; i++) {
          const ratio = (i + 0.5) / targetCount;
          times.push(Math.max(0.02, Math.min(dur - 0.03, ratio * dur)));
        }

        for (let i = 0; i < times.length; i++) {
          if (settled) break;
          const t = times[i];
          const ok = await this.seekTo(video, t, 1400);
          if (!ok) continue;

          try {
            ctx.drawImage(video, 0, 0, thumbW, thumbH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
            const entry = this.cache.get(mediaId);
            if (!entry) break;
            entry.frames.push({ time: t, dataUrl });
            if (i === 0 || i % 4 === 3 || i === times.length - 1) {
              this.emit(mediaId);
            }
          } catch {
            // Skip tainted or undecodable frame
          }
        }
        finish('ready');
      };

      video.src = objectUrl;
    });
  }

  private seekTo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', onSeeked);
        resolve(false);
      }, timeoutMs);

      const onSeeked = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        resolve(true);
      };

      video.addEventListener('seeked', onSeeked);
      try {
        video.currentTime = time;
      } catch {
        window.clearTimeout(timer);
        video.removeEventListener('seeked', onSeeked);
        resolve(false);
      }
    });
  }
}

export const filmstripCache = new VideoFilmstripCache();

export function pickFilmstripFrame(
  frames: FilmstripFrame[],
  sourceTime: number,
  fallbackThumb?: string
): string | undefined {
  if (frames.length === 0) return fallbackThumb;
  let best = frames[0];
  let bestDiff = Math.abs(frames[0].time - sourceTime);
  for (let i = 1; i < frames.length; i++) {
    const diff = Math.abs(frames[i].time - sourceTime);
    if (diff < bestDiff) {
      best = frames[i];
      bestDiff = diff;
    }
  }
  return best.dataUrl;
}
