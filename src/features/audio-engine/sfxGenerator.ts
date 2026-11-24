import { analyzeAndStoreMediaFile } from '../media-import/mediaAnalyzer';
import type { MediaAsset } from '../../types/editor';

export type SoundEffectKind =
  | 'whoosh'
  | 'sub-impact'
  | 'ui-click'
  | 'ambient-bed'
  | 'lofi-pulse';

function encodeWavFromFloat32(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
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
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s * 32767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function generateBuiltInAudioAsset(
  kind: SoundEffectKind,
  projectId: string
): Promise<MediaAsset> {
  const sampleRate = 44100;
  let duration = 2;
  let filename = 'SFX.wav';

  if (kind === 'whoosh') {
    duration = 1.4;
    filename = 'SFX_Transition_Whoosh.wav';
  } else if (kind === 'sub-impact') {
    duration = 1.8;
    filename = 'SFX_Sub_Impact.wav';
  } else if (kind === 'ui-click') {
    duration = 0.45;
    filename = 'SFX_UI_Click.wav';
  } else if (kind === 'ambient-bed') {
    duration = 8.0;
    filename = 'Music_Ambient_Pad_8s.wav';
  } else {
    duration = 8.0;
    filename = 'Music_LoFi_Pulse_8s.wav';
  }

  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  if (kind === 'whoosh') {
    let lp = 0;
    for (let i = 0; i < totalSamples; i++) {
      const t = i / totalSamples;
      const env = Math.sin(Math.PI * t);
      const noise = Math.random() * 2 - 1;
      const cutoff = 0.03 + env * 0.25;
      lp = lp + cutoff * (noise - lp);
      samples[i] = lp * env * 0.7;
    }
  } else if (kind === 'sub-impact') {
    for (let i = 0; i < totalSamples; i++) {
      const sec = i / sampleRate;
      const freq = 135 * Math.exp(-sec * 4.2) + 36;
      const env = Math.exp(-sec * 2.4);
      const thump = Math.sin(2 * Math.PI * freq * sec) * env;
      samples[i] = Math.tanh(thump * 1.4) * 0.85;
    }
  } else if (kind === 'ui-click') {
    for (let i = 0; i < totalSamples; i++) {
      const sec = i / sampleRate;
      const env = Math.exp(-sec * 42);
      samples[i] =
        (Math.sin(2 * Math.PI * 1450 * sec) + 0.5 * Math.sin(2 * Math.PI * 2900 * sec)) *
        env *
        0.55;
    }
  } else if (kind === 'ambient-bed') {
    const freqs = [196.0, 246.94, 293.66, 392.0];
    for (let i = 0; i < totalSamples; i++) {
      const sec = i / sampleRate;
      const env = Math.min(1, sec / 1.2) * Math.min(1, (duration - sec) / 1.2);
      let val = 0;
      for (let f = 0; f < freqs.length; f++) {
        val += Math.sin(2 * Math.PI * freqs[f] * sec + Math.sin(sec * (0.4 + f * 0.1))) * 0.18;
      }
      samples[i] = val * env;
    }
  } else {
    // Lo-Fi Pulse chord progression + subtle kick
    const chords = [
      [220, 261.63, 329.63],
      [174.61, 220, 261.63],
      [196, 246.94, 293.66],
      [164.81, 196, 246.94],
    ];
    for (let i = 0; i < totalSamples; i++) {
      const sec = i / sampleRate;
      const bar = Math.floor(sec / 2) % chords.length;
      const beatSec = sec % 0.5;
      const kick = Math.sin(2 * Math.PI * (90 * Math.exp(-beatSec * 18) + 42) * beatSec) * Math.exp(-beatSec * 14) * 0.35;
      let pad = 0;
      for (const freq of chords[bar]) {
        pad += Math.sin(2 * Math.PI * freq * sec) * 0.14;
      }
      const env = Math.min(1, sec * 4) * Math.min(1, (duration - sec) * 2);
      samples[i] = (pad + kick) * env;
    }
  }

  const blob = encodeWavFromFloat32(samples, sampleRate);
  const file = new File([blob], filename, { type: 'audio/wav' });
  return analyzeAndStoreMediaFile(file, projectId);
}
