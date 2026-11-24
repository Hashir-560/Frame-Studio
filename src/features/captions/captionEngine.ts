import type { Clip } from '../../types/editor';

export interface CaptionSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Analyzes a real audio/video Blob via Web Audio RMS energy thresholding
 * to detect speech/vocal activity intervals for automatic caption timing.
 */
export async function detectSpeechSegmentsFromBlob(
  blob: Blob,
  clipStartTime: number,
  clipDuration: number
): Promise<CaptionSegment[]> {
  if (blob.size > 80 * 1024 * 1024) {
    throw new Error('File exceeds 80 MB browser audio analysis limit.');
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is unavailable in this browser.');
  }

  const ctx = new AudioCtx();
  try {
    const arr = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arr);
    const channel = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;

    const windowSec = 0.08;
    const windowSamples = Math.max(1, Math.floor(sr * windowSec));
    const rmsValues: number[] = [];

    for (let i = 0; i < channel.length; i += windowSamples) {
      let sumSq = 0;
      const end = Math.min(channel.length, i + windowSamples);
      for (let j = i; j < end; j++) {
        sumSq += channel[j] * channel[j];
      }
      rmsValues.push(Math.sqrt(sumSq / (end - i)));
    }

    const meanRms = rmsValues.reduce((a, b) => a + b, 0) / Math.max(1, rmsValues.length);
    const threshold = Math.max(0.015, meanRms * 0.75);

    const segments: CaptionSegment[] = [];
    let segStart: number | null = null;

    for (let idx = 0; idx < rmsValues.length; idx++) {
      const t = idx * windowSec;
      if (t > clipDuration) break;
      const active = rmsValues[idx] >= threshold;
      if (active && segStart === null) {
        segStart = t;
      } else if (!active && segStart !== null) {
        if (t - segStart >= 0.35) {
          segments.push({
            startTime: Number((clipStartTime + segStart).toFixed(2)),
            endTime: Number((clipStartTime + t).toFixed(2)),
            text: `Caption ${segments.length + 1}`,
          });
        }
        segStart = null;
      }
    }

    if (segStart !== null) {
      const end = Math.min(clipDuration, rmsValues.length * windowSec);
      if (end - segStart >= 0.35) {
        segments.push({
          startTime: Number((clipStartTime + segStart).toFixed(2)),
          endTime: Number((clipStartTime + end).toFixed(2)),
          text: `Caption ${segments.length + 1}`,
        });
      }
    }

    return segments;
  } finally {
    if (ctx.state !== 'closed') {
      await ctx.close().catch(() => {});
    }
  }
}

function parseSrtTimestamp(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length !== 3) return 0;
  const h = parseFloat(parts[0]) || 0;
  const m = parseFloat(parts[1]) || 0;
  const s = parseFloat(parts[2]) || 0;
  return h * 3600 + m * 60 + s;
}

export function parseSrtContent(srtText: string): CaptionSegment[] {
  const blocks = srtText.trim().split(/\r?\n\r?\n+/);
  const segments: CaptionSegment[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    const startTime = parseSrtTimestamp(startRaw);
    const endTime = parseSrtTimestamp(endRaw);
    const text = lines.slice(timeLineIdx + 1).join('\n');
    if (endTime > startTime && text) {
      segments.push({ startTime, endTime, text });
    }
  }
  return segments;
}

function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function exportTextClipsToSrt(clips: Clip[]): string {
  const textClips = clips
    .filter((c) => c.type === 'text' && c.text)
    .sort((a, b) => a.startTime - b.startTime);

  return textClips
    .map((clip, i) => {
      const start = formatSrtTimestamp(clip.startTime);
      const end = formatSrtTimestamp(clip.startTime + clip.duration);
      return `${i + 1}\n${start} --> ${end}\n${clip.text?.content || ''}`;
    })
    .join('\n\n');
}

export function generateWordTimingsForText(
  content: string,
  clipDuration: number
): { word: string; startOffset: number; endOffset: number }[] {
  const words = (content || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const safeDur = Math.max(0.2, clipDuration);
  const weights = words.map((w) => Math.max(1, w.replace(/[^\w]/g, '').length) + (/[,.!?]$/.test(w) ? 1.5 : 0));
  const totalW = weights.reduce((a, b) => a + b, 0);

  let cursor = 0;
  return words.map((word, idx) => {
    const slice = (weights[idx] / totalW) * safeDur;
    const startOffset = Number(cursor.toFixed(2));
    cursor += slice;
    const endOffset = idx === words.length - 1 ? Number(safeDur.toFixed(2)) : Number(cursor.toFixed(2));
    return { word, startOffset, endOffset };
  });
}

export function splitTranscriptIntoCaptions(
  transcript: string,
  startTime: number,
  totalDuration: number,
  maxWordsPerCue = 6
): CaptionSegment[] {
  const clean = transcript.trim();
  if (!clean) return [];

  const rawSentences = clean
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sent of rawSentences) {
    const words = sent.split(/\s+/).filter(Boolean);
    if (words.length <= maxWordsPerCue) {
      chunks.push(words.join(' '));
    } else {
      for (let i = 0; i < words.length; i += maxWordsPerCue) {
        chunks.push(words.slice(i, i + maxWordsPerCue).join(' '));
      }
    }
  }

  if (chunks.length === 0) return [];
  const wordCounts = chunks.map((c) => Math.max(1, c.split(/\s+/).length));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0);
  const safeTotalDur = Math.max(chunks.length * 0.8, totalDuration);

  let t = startTime;
  return chunks.map((text, idx) => {
    const dur = Math.max(0.6, (wordCounts[idx] / totalWords) * safeTotalDur);
    const seg: CaptionSegment = {
      startTime: Number(t.toFixed(2)),
      endTime: Number((t + dur).toFixed(2)),
      text,
    };
    t += dur;
    return seg;
  });
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speakCaptionText(text: string, rate = 1): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = Math.max(0.5, Math.min(2, rate));
  window.speechSynthesis.speak(utter);
}

export function stopSpeakingCaption(): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel();
}

