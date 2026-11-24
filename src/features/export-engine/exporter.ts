import { getProjectDuration } from '../project/projectFactory';
import { renderFrameAtTime, type MediaElementPool } from '../video-preview/compositor';
import {
  applyClipDspParameters,
  audioEngine,
  buildDspChain,
  type ElementDspNodes,
} from '../audio-engine/audioEngine';
import { evaluateSpeedAtRatio, mapTimelineToSourceTime } from '../timeline-engine/keyframes';
import type { ExportSettings, MediaAsset, Project } from '../../types/editor';

export interface ExportCapabilities {
  webmSupported: boolean;
  mp4Supported: boolean;
  bestWebmMime: string | null;
  bestMp4Mime: string | null;
}

export interface ExportProgress {
  percent: number;
  currentTime: number;
  totalDuration: number;
  elapsedMs: number;
  etaMs: number;
  stage: 'preparing' | 'rendering' | 'finalizing';
}

export function detectExportCapabilities(): ExportCapabilities {
  if (typeof MediaRecorder === 'undefined') {
    return { webmSupported: false, mp4Supported: false, bestWebmMime: null, bestMp4Mime: null };
  }
  const webmCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];

  const bestWebmMime = webmCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
  const bestMp4Mime = mp4Candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;

  return {
    webmSupported: bestWebmMime !== null,
    mp4Supported: bestMp4Mime !== null,
    bestWebmMime,
    bestMp4Mime,
  };
}

function getBitrateForQuality(settings: ExportSettings): number {
  const pixelFactor = (settings.resolution.width * settings.resolution.height) / (1920 * 1080);
  const base =
    settings.quality === 'high' ? 10_000_000 : settings.quality === 'standard' ? 5_500_000 : 2_500_000;
  return Math.round(base * Math.max(0.5, Math.min(2.4, pixelFactor)));
}

export async function exportProjectVideo(
  project: Project,
  assetsMap: Map<string, MediaAsset>,
  settings: ExportSettings,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal
): Promise<{ blob: Blob; mimeType: string; extension: string }> {
  const caps = detectExportCapabilities();
  const mimeType =
    settings.format === 'mp4'
      ? caps.bestMp4Mime ?? caps.bestWebmMime
      : caps.bestWebmMime ?? caps.bestMp4Mime;

  if (!mimeType) {
    throw new Error('This browser does not support MediaRecorder video encoding.');
  }

  const totalDuration = getProjectDuration(project);
  if (totalDuration <= 0.05) {
    throw new Error('Timeline has no clips to export.');
  }

  onProgress({
    percent: 0,
    currentTime: 0,
    totalDuration,
    elapsedMs: 0,
    etaMs: totalDuration * 1000,
    stage: 'preparing',
  });

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = settings.resolution.width;
  exportCanvas.height = settings.resolution.height;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not acquire 2D Canvas context for export.');
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const exportAudioCtx = AudioCtx ? new AudioCtx() : null;
  const audioDest = exportAudioCtx ? exportAudioCtx.createMediaStreamDestination() : null;
  const clipDspMap = new Map<string, ElementDspNodes>();
  const audioElements = new Map<string, HTMLAudioElement>();
  const pool: MediaElementPool = {
    videos: new Map(),
    images: new Map(),
  };

  const cleanup = () => {
    for (const v of pool.videos.values()) {
      v.pause();
      v.removeAttribute('src');
      v.load();
    }
    for (const a of audioElements.values()) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    for (const nodes of clipDspMap.values()) {
      if (nodes.ringOsc) {
        try {
          nodes.ringOsc.stop();
        } catch {
          // Ignore
        }
      }
    }
    pool.videos.clear();
    pool.images.clear();
    audioElements.clear();
    clipDspMap.clear();
    if (exportAudioCtx && exportAudioCtx.state !== 'closed') {
      void exportAudioCtx.close().catch(() => {});
    }
  };

  try {
    const loadPromises: Promise<void>[] = [];

    // Export ALWAYS uses full-resolution master asset.objectUrl (never proxyObjectUrl)
    for (const clip of project.clips) {
      if (!clip.mediaId) continue;
      const asset = assetsMap.get(clip.mediaId);
      if (!asset) continue;

      if (clip.type === 'image' && !pool.images.has(asset.id)) {
        loadPromises.push(
          new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              pool.images.set(asset.id, img);
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed loading image "${asset.name}" for export.`));
            img.src = asset.objectUrl;
          })
        );
      } else if (clip.type === 'video') {
        loadPromises.push(
          new Promise<void>((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.playsInline = true;
            video.crossOrigin = 'anonymous';
            video.onloadeddata = () => {
              if (exportAudioCtx && audioDest) {
                try {
                  const src = exportAudioCtx.createMediaElementSource(video);
                  const dsp = buildDspChain(exportAudioCtx, src, audioDest);
                  dsp.outputGain.gain.value = 0;
                  clipDspMap.set(clip.id, dsp);
                } catch {
                  // Ignore silent video
                }
              }
              pool.videos.set(clip.id, video);
              resolve();
            };
            video.onerror = () => reject(new Error(`Failed loading video "${asset.name}" for export.`));
            video.src = asset.objectUrl;
          })
        );
      } else if (clip.type === 'audio') {
        loadPromises.push(
          new Promise<void>((resolve, reject) => {
            const audio = document.createElement('audio');
            audio.preload = 'auto';
            audio.onloadeddata = () => {
              if (exportAudioCtx && audioDest) {
                try {
                  const src = exportAudioCtx.createMediaElementSource(audio);
                  const dsp = buildDspChain(exportAudioCtx, src, audioDest);
                  dsp.outputGain.gain.value = 0;
                  clipDspMap.set(clip.id, dsp);
                } catch {
                  // Ignore
                }
              }
              audioElements.set(clip.id, audio);
              resolve();
            };
            audio.onerror = () => reject(new Error(`Failed loading audio "${asset.name}" for export.`));
            audio.src = asset.objectUrl;
          })
        );
      }
    }

    await Promise.all(loadPromises);
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');

    if (exportAudioCtx && exportAudioCtx.state === 'suspended') {
      await exportAudioCtx.resume();
    }

    const canvasStream = exportCanvas.captureStream(settings.fps);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioDest) {
      combinedTracks.push(...audioDest.stream.getAudioTracks());
    }
    const combinedStream = new MediaStream(combinedTracks);

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: getBitrateForQuality(settings),
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stopPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const resultBlob = new Blob(chunks, { type: mimeType });
        if (resultBlob.size === 0) {
          reject(new Error('Export produced an empty file.'));
        } else {
          resolve(resultBlob);
        }
      };
      recorder.onerror = () => {
        reject(new Error('MediaRecorder encountered an encoding error during export.'));
      };
    });

    renderFrameAtTime(ctx, settings.resolution.width, settings.resolution.height, 0, project, assetsMap, pool);
    recorder.start(250);

    const startWall = performance.now();
    const frameIntervalMs = 1000 / settings.fps;

    await new Promise<void>((resolve, reject) => {
      let timerId: number | null = null;
      let rafId: number | null = null;

      const onAbort = () => {
        if (timerId !== null) window.clearTimeout(timerId);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (recorder.state === 'recording') recorder.stop();
        combinedStream.getTracks().forEach((tr) => tr.stop());
        reject(new DOMException('Export cancelled', 'AbortError'));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      const tick = () => {
        if (signal.aborted) return;
        const elapsedMs = performance.now() - startWall;
        const currentTime = elapsedMs / 1000;

        if (currentTime >= totalDuration) {
          onProgress({
            percent: 100,
            currentTime: totalDuration,
            totalDuration,
            elapsedMs,
            etaMs: 0,
            stage: 'finalizing',
          });
          signal.removeEventListener('abort', onAbort);
          if (recorder.state === 'recording') recorder.stop();
          combinedStream.getTracks().forEach((tr) => tr.stop());
          resolve();
          return;
        }

        for (const clip of project.clips) {
          const isActive = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
          const localTime = Math.max(0, currentTime - clip.startTime);
          const targetSourceTime = mapTimelineToSourceTime(clip, localTime);
          const instSpeed = evaluateSpeedAtRatio(clip, localTime / Math.max(0.01, clip.duration));
          const pitchRate = audioEngine.getVoicePitchMultiplier(
            clip.audio.voiceChanger,
            clip.audio.customPitch
          );

          if (clip.type === 'video') {
            const vid = pool.videos.get(clip.id);
            if (vid) {
              if (isActive) {
                if (clip.reversed) {
                  if (!vid.paused) vid.pause();
                  if (Math.abs(vid.currentTime - targetSourceTime) > 0.04) {
                    vid.currentTime = Math.min(targetSourceTime, Math.max(0, (vid.duration || targetSourceTime) - 0.02));
                  }
                } else {
                  vid.playbackRate = Math.max(0.25, Math.min(4, instSpeed * pitchRate));
                  if (Math.abs(vid.currentTime - targetSourceTime) > 0.22) {
                    vid.currentTime = Math.min(targetSourceTime, Math.max(0, (vid.duration || targetSourceTime) - 0.05));
                  }
                  if (vid.paused) void vid.play().catch(() => {});
                }
                const dsp = clipDspMap.get(clip.id);
                if (dsp && exportAudioCtx) {
                  const gainVal = clip.reversed
                    ? 0
                    : audioEngine.computeClipEffectiveGain(clip, project.tracks, localTime);
                  dsp.outputGain.gain.setTargetAtTime(gainVal, exportAudioCtx.currentTime, 0.015);
                  applyClipDspParameters(
                    exportAudioCtx,
                    dsp,
                    clip.audio.voiceChanger,
                    clip.audio.noiseReduction,
                    clip.audio.echoMix ?? 0
                  );
                }
              } else {
                if (!vid.paused) vid.pause();
                const dsp = clipDspMap.get(clip.id);
                if (dsp && exportAudioCtx) {
                  dsp.outputGain.gain.setTargetAtTime(0, exportAudioCtx.currentTime, 0.01);
                }
              }
            }
          } else if (clip.type === 'audio') {
            const aud = audioElements.get(clip.id);
            if (aud) {
              if (isActive) {
                aud.playbackRate = Math.max(0.25, Math.min(4, instSpeed * pitchRate));
                if (Math.abs(aud.currentTime - targetSourceTime) > 0.22) {
                  aud.currentTime = Math.min(targetSourceTime, Math.max(0, (aud.duration || targetSourceTime) - 0.05));
                }
                if (aud.paused) void aud.play().catch(() => {});
                const dsp = clipDspMap.get(clip.id);
                if (dsp && exportAudioCtx) {
                  const gainVal = audioEngine.computeClipEffectiveGain(clip, project.tracks, localTime);
                  dsp.outputGain.gain.setTargetAtTime(gainVal, exportAudioCtx.currentTime, 0.015);
                  applyClipDspParameters(
                    exportAudioCtx,
                    dsp,
                    clip.audio.voiceChanger,
                    clip.audio.noiseReduction,
                    clip.audio.echoMix ?? 0
                  );
                }
              } else {
                if (!aud.paused) aud.pause();
                const dsp = clipDspMap.get(clip.id);
                if (dsp && exportAudioCtx) {
                  dsp.outputGain.gain.setTargetAtTime(0, exportAudioCtx.currentTime, 0.01);
                }
              }
            }
          }
        }

        renderFrameAtTime(
          ctx,
          settings.resolution.width,
          settings.resolution.height,
          currentTime,
          project,
          assetsMap,
          pool
        );

        const pct = Math.min(99, (currentTime / totalDuration) * 100);
        const remainingMs = Math.max(0, totalDuration * 1000 - elapsedMs);
        onProgress({
          percent: pct,
          currentTime,
          totalDuration,
          elapsedMs,
          etaMs: remainingMs,
          stage: 'rendering',
        });

        timerId = window.setTimeout(() => {
          rafId = requestAnimationFrame(tick);
        }, Math.max(4, frameIntervalMs * 0.7));
      };

      rafId = requestAnimationFrame(tick);
    });

    const finalBlob = await stopPromise;
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    return { blob: finalBlob, mimeType, extension };
  } finally {
    cleanup();
  }
}
