import type { Clip, Track, VoiceChangerPreset } from '../../types/editor';

export interface ElementDspNodes {
  source: MediaElementAudioSourceNode;
  noiseHighpass: BiquadFilterNode;
  noiseLowpass: BiquadFilterNode;
  voiceFilter: BiquadFilterNode;
  shaper: WaveShaperNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  ringGain: GainNode;
  ringOsc: OscillatorNode | null;
  compressor: DynamicsCompressorNode;
  outputGain: GainNode;
  lastVoicePreset: VoiceChangerPreset;
  lastNoiseReduction: number;
  lastEchoMix: number;
}

function makeDistortionCurve(amount = 24): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export function buildDspChain(
  ctx: AudioContext,
  source: MediaElementAudioSourceNode,
  destination: AudioNode
): ElementDspNodes {
  const noiseHighpass = ctx.createBiquadFilter();
  noiseHighpass.type = 'highpass';
  noiseHighpass.frequency.value = 20;

  const noiseLowpass = ctx.createBiquadFilter();
  noiseLowpass.type = 'lowpass';
  noiseLowpass.frequency.value = 20000;

  const voiceFilter = ctx.createBiquadFilter();
  voiceFilter.type = 'peaking';
  voiceFilter.frequency.value = 1000;
  voiceFilter.gain.value = 0;

  const shaper = ctx.createWaveShaper();
  shaper.curve = null;
  shaper.oversample = '2x';

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.22;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;

  const ringGain = ctx.createGain();
  ringGain.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.ratio.value = 2;

  const outputGain = ctx.createGain();
  outputGain.gain.value = 1;

  // Wire chain: source -> noiseHighpass -> noiseLowpass -> voiceFilter -> shaper -> [dry + delay wet] -> ringGain -> compressor -> outputGain
  source.connect(noiseHighpass);
  noiseHighpass.connect(noiseLowpass);
  noiseLowpass.connect(voiceFilter);
  voiceFilter.connect(shaper);

  shaper.connect(dryGain);
  dryGain.connect(ringGain);

  shaper.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(wetGain);
  wetGain.connect(ringGain);

  ringGain.connect(compressor);
  compressor.connect(outputGain);
  outputGain.connect(destination);

  return {
    source,
    noiseHighpass,
    noiseLowpass,
    voiceFilter,
    shaper,
    delay,
    delayFeedback,
    dryGain,
    wetGain,
    ringGain,
    ringOsc: null,
    compressor,
    outputGain,
    lastVoicePreset: 'none',
    lastNoiseReduction: 0,
    lastEchoMix: 0,
  };
}

export function applyClipDspParameters(
  ctx: AudioContext,
  nodes: ElementDspNodes,
  preset: VoiceChangerPreset,
  noiseReduction: number,
  echoMix = 0
): void {
  const now = ctx.currentTime;

  if (nodes.lastNoiseReduction !== noiseReduction) {
    nodes.lastNoiseReduction = noiseReduction;
    const nr = Math.max(0, Math.min(100, noiseReduction)) / 100;
    nodes.noiseHighpass.frequency.setTargetAtTime(20 + nr * 140, now, 0.02);
    nodes.noiseLowpass.frequency.setTargetAtTime(20000 - nr * 13500, now, 0.02);
    nodes.compressor.threshold.setTargetAtTime(-16 - nr * 18, now, 0.02);
    nodes.compressor.ratio.setTargetAtTime(2 + nr * 5, now, 0.02);
  }

  const presetChanged = nodes.lastVoicePreset !== preset;
  const echoChanged = nodes.lastEchoMix !== echoMix;

  if (presetChanged) {
    nodes.lastVoicePreset = preset;

    if (nodes.ringOsc) {
      try {
        nodes.ringOsc.stop();
        nodes.ringOsc.disconnect();
      } catch {
        // Ignore
      }
      nodes.ringOsc = null;
    }

    nodes.voiceFilter.type = 'peaking';
    nodes.voiceFilter.frequency.setTargetAtTime(1000, now, 0.02);
    nodes.voiceFilter.Q.setTargetAtTime(1, now, 0.02);
    nodes.voiceFilter.gain.setTargetAtTime(0, now, 0.02);
    nodes.shaper.curve = null;
    nodes.dryGain.gain.setTargetAtTime(1, now, 0.02);
    nodes.ringGain.gain.setTargetAtTime(1, now, 0.02);

    if (preset === 'deep') {
      nodes.voiceFilter.type = 'lowshelf';
      nodes.voiceFilter.frequency.setTargetAtTime(260, now, 0.02);
      nodes.voiceFilter.gain.setTargetAtTime(12, now, 0.02);
    } else if (preset === 'high') {
      nodes.voiceFilter.type = 'highshelf';
      nodes.voiceFilter.frequency.setTargetAtTime(1400, now, 0.02);
      nodes.voiceFilter.gain.setTargetAtTime(11, now, 0.02);
    } else if (preset === 'radio') {
      nodes.voiceFilter.type = 'bandpass';
      nodes.voiceFilter.frequency.setTargetAtTime(1350, now, 0.02);
      nodes.voiceFilter.Q.setTargetAtTime(2.6, now, 0.02);
      nodes.shaper.curve = makeDistortionCurve(32);
    } else if (preset === 'robot') {
      nodes.voiceFilter.type = 'bandpass';
      nodes.voiceFilter.frequency.setTargetAtTime(950, now, 0.02);
      nodes.voiceFilter.Q.setTargetAtTime(1.4, now, 0.02);
      nodes.ringGain.gain.setValueAtTime(0.45, now);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 48;
      const modDepth = ctx.createGain();
      modDepth.gain.value = 0.45;
      osc.connect(modDepth);
      modDepth.connect(nodes.ringGain.gain);
      osc.start();
      nodes.ringOsc = osc;
    }
  }

  if (presetChanged || echoChanged) {
    nodes.lastEchoMix = echoMix;
    const manualMix = Math.max(0, Math.min(100, echoMix)) / 100;
    const effectiveWet = preset === 'echo' ? Math.max(0.55, manualMix) : manualMix;
    const effectiveFeedback =
      preset === 'echo' ? Math.max(0.42, manualMix * 0.58) : manualMix * 0.58;
    nodes.delay.delayTime.setTargetAtTime(0.24, now, 0.02);
    nodes.delayFeedback.gain.setTargetAtTime(effectiveFeedback, now, 0.02);
    nodes.wetGain.gain.setTargetAtTime(effectiveWet, now, 0.02);
  }
}

class AudioMixerEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private elementDsp = new WeakMap<HTMLMediaElement, ElementDspNodes>();
  private masterMuted = false;
  private masterVolume = 1;
  private freqBuffer: Uint8Array<ArrayBuffer> | null = null;

  ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.72;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freqBuffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
      this.applyMasterGain();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  attachMediaElement(el: HTMLMediaElement): ElementDspNodes | null {
    const existing = this.elementDsp.get(el);
    if (existing) return existing;

    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return null;

    try {
      const source = ctx.createMediaElementSource(el);
      const chain = buildDspChain(ctx, source, this.masterGain);
      this.elementDsp.set(el, chain);
      return chain;
    } catch {
      return null;
    }
  }

  setMasterVolume(vol: number, muted: boolean): void {
    this.masterVolume = Math.max(0, Math.min(2, vol));
    this.masterMuted = muted;
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    if (!this.masterGain || !this.ctx) return;
    const val = this.masterMuted ? 0 : this.masterVolume;
    this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.015);
  }

  computeClipEffectiveGain(clip: Clip, tracks: Track[], localTime: number): number {
    const track = tracks.find((t) => t.id === clip.trackId);
    const anySolo = tracks.some((t) => t.solo);

    if (clip.audio.muted || track?.muted) return 0;
    if (anySolo && !track?.solo) return 0;

    const trackVol = (track?.volume ?? 100) / 100;
    const clipVol = (clip.audio.volume ?? 100) / 100;
    let envelope = 1;

    if (clip.audio.fadeIn > 0 && localTime < clip.audio.fadeIn) {
      envelope *= Math.max(0, Math.min(1, localTime / clip.audio.fadeIn));
    }
    const timeRemaining = clip.duration - localTime;
    if (clip.audio.fadeOut > 0 && timeRemaining < clip.audio.fadeOut) {
      envelope *= Math.max(0, Math.min(1, timeRemaining / clip.audio.fadeOut));
    }

    return Math.max(0, Math.min(2, trackVol * clipVol * envelope));
  }

  /**
   * Computes playback rate multiplier when voice changer requires subtle pitch shift.
   */
  getVoicePitchMultiplier(preset: VoiceChangerPreset, customPitch = 1): number {
    const presetMult = preset === 'deep' ? 0.82 : preset === 'high' ? 1.24 : 1;
    const manual = Number.isFinite(customPitch) && customPitch > 0 ? customPitch : 1;
    return Math.max(0.25, Math.min(4, presetMult * manual));
  }

  updateElementAudio(
    el: HTMLMediaElement,
    gainValue: number,
    preset: VoiceChangerPreset = 'none',
    noiseReduction = 0,
    echoMix = 0
  ): void {
    const nodes = this.elementDsp.get(el);
    if (nodes && this.ctx) {
      nodes.outputGain.gain.setTargetAtTime(gainValue, this.ctx.currentTime, 0.015);
      applyClipDspParameters(this.ctx, nodes, preset, noiseReduction, echoMix);
    } else {
      el.volume = Math.max(0, Math.min(1, gainValue));
    }
  }

  getPeakLevel(): number {
    if (!this.analyser || !this.freqBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.freqBuffer);
    let peak = 0;
    for (let i = 0; i < this.freqBuffer.length; i++) {
      const norm = Math.abs((this.freqBuffer[i] - 128) / 128);
      if (norm > peak) peak = norm;
    }
    return Math.min(1, peak * 1.35);
  }
}

export const audioEngine = new AudioMixerEngine();
