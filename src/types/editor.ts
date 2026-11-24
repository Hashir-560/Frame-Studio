export type WorkspaceMode =
  | 'edit'
  | 'media'
  | 'color'
  | 'text'
  | 'effects'
  | 'transitions'
  | 'audio';

export type RightPanelTab = 'resources' | 'inspector';

export type TrackType = 'video' | 'audio' | 'text';

export type ClipType = 'video' | 'image' | 'audio' | 'text' | 'sticker';

export type TransitionType =
  | 'none'
  | 'crossfade'
  | 'fade-black'
  | 'fade-white'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'slide-up'
  | 'slide-down'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'iris-in'
  | 'iris-out'
  | 'blur-dissolve'
  | 'flash-burn'
  | 'spin-cw'
  | 'spin-ccw'
  | 'flip-h'
  | 'flip-v'
  | 'curtain-split'
  | 'barn-door'
  | 'diagonal-wipe'
  | 'glitch-cut'
  | 'pixel-dissolve';

export type TransitionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type TransitionCategory =
  | 'Dissolve'
  | 'Slide'
  | 'Wipe'
  | 'Iris & Split'
  | '3D & Spin'
  | 'Stylized';

export interface TransitionDefinition {
  type: TransitionType;
  label: string;
  desc: string;
  category: TransitionCategory;
}

export const TRANSITION_CATALOG: TransitionDefinition[] = [
  { type: 'crossfade', label: 'Crossfade Dissolve', desc: 'Smooth opacity blend', category: 'Dissolve' },
  { type: 'fade-black', label: 'Fade Through Black', desc: 'Dip to #000000 matte', category: 'Dissolve' },
  { type: 'fade-white', label: 'Fade Through White', desc: 'Dip to optical white', category: 'Dissolve' },
  { type: 'blur-dissolve', label: 'Gaussian Blur Dissolve', desc: 'Soft optical defocus blend', category: 'Dissolve' },
  { type: 'flash-burn', label: 'Optical Film Burn', desc: 'Warm exposure flare flash', category: 'Dissolve' },

  { type: 'slide-left', label: 'Slide Left', desc: 'Horizontal push left', category: 'Slide' },
  { type: 'slide-right', label: 'Slide Right', desc: 'Horizontal push right', category: 'Slide' },
  { type: 'slide-up', label: 'Slide Up', desc: 'Vertical push upward', category: 'Slide' },
  { type: 'slide-down', label: 'Slide Down', desc: 'Vertical push downward', category: 'Slide' },

  { type: 'wipe-left', label: 'Wipe Left', desc: 'Crisp left-to-right edge reveal', category: 'Wipe' },
  { type: 'wipe-right', label: 'Wipe Right', desc: 'Crisp right-to-left edge reveal', category: 'Wipe' },
  { type: 'wipe-up', label: 'Wipe Up', desc: 'Bottom-to-top edge reveal', category: 'Wipe' },
  { type: 'wipe-down', label: 'Wipe Down', desc: 'Top-to-bottom edge reveal', category: 'Wipe' },
  { type: 'diagonal-wipe', label: 'Diagonal Slash Wipe', desc: '45° angled cinematic wipe', category: 'Wipe' },

  { type: 'iris-in', label: 'Circle Iris Expand', desc: 'Radial aperture reveal', category: 'Iris & Split' },
  { type: 'iris-out', label: 'Circle Iris Shrink', desc: 'Radial aperture close', category: 'Iris & Split' },
  { type: 'curtain-split', label: 'Curtain Split', desc: 'Center vertical curtain reveal', category: 'Iris & Split' },
  { type: 'barn-door', label: 'Barn Door', desc: 'Horizontal shutter split', category: 'Iris & Split' },

  { type: 'zoom-in', label: 'Zoom In', desc: 'Forward punch scale blend', category: '3D & Spin' },
  { type: 'zoom-out', label: 'Zoom Out', desc: 'Pull-back scale blend', category: '3D & Spin' },
  { type: 'spin-cw', label: 'Spin Clockwise', desc: 'Dynamic clockwise whirl', category: '3D & Spin' },
  { type: 'spin-ccw', label: 'Spin Counter-CW', desc: 'Dynamic counter-clockwise whirl', category: '3D & Spin' },
  { type: 'flip-h', label: '3D Horizontal Flip', desc: 'X-axis card flip reveal', category: '3D & Spin' },
  { type: 'flip-v', label: '3D Vertical Flip', desc: 'Y-axis card flip reveal', category: '3D & Spin' },

  { type: 'glitch-cut', label: 'RGB Glitch Cut', desc: 'Digital slice & jitter', category: 'Stylized' },
  { type: 'pixel-dissolve', label: 'Pixel Mosaic Dissolve', desc: 'Block resolution step reveal', category: 'Stylized' },
];

export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'scale'
  | 'zoom'
  | 'pop'
  | 'bounce'
  | 'blur-in'
  | 'tracking-in'
  | 'typewriter'
  | 'letter-by-letter'
  | 'word-by-word'
  | 'word-pop'
  | 'karaoke'
  | 'glitch-text'
  | 'glitch-reveal';

export type TextTypographyStyle =
  | 'clean'
  | 'bold'
  | 'neon'
  | '3d'
  | 'gradient'
  | 'outline'
  | 'shadow'
  | 'glitch'
  | 'cinematic'
  | 'minimal';

export interface WordTiming {
  word: string;
  startOffset: number; // local clip seconds
  endOffset: number;   // local clip seconds
}

export const TEXT_ANIMATION_CATALOG: { value: TextAnimation; label: string; desc: string }[] = [
  { value: 'none', label: 'None (Static)', desc: 'No entry or exit motion' },
  { value: 'fade', label: 'Smooth Fade', desc: 'Opacity ease in and out' },
  { value: 'slide-up', label: 'Slide Up', desc: 'Rise smoothly into frame' },
  { value: 'slide-down', label: 'Slide Down', desc: 'Drop smoothly into frame' },
  { value: 'slide-left', label: 'Slide Left', desc: 'Glide in horizontally' },
  { value: 'slide-right', label: 'Slide Right', desc: 'Sweep in from left' },
  { value: 'scale', label: 'Scale Reveal', desc: 'Crisp scale ease into frame' },
  { value: 'zoom', label: 'Cinema Zoom', desc: 'Smooth pull-back zoom settle' },
  { value: 'pop', label: 'Punch Pop', desc: 'Snappy social pop arrival' },
  { value: 'bounce', label: 'Spring Bounce', desc: 'Elastic overshoot pop' },
  { value: 'blur-in', label: 'Optical Blur Reveal', desc: 'Focus pull sharpen in' },
  { value: 'tracking-in', label: 'Letter Tracking', desc: 'Cinematic kerning settle' },
  { value: 'typewriter', label: 'Typewriter Reveal', desc: 'Character typing with cursor' },
  { value: 'letter-by-letter', label: 'Letter by Letter', desc: 'Sequential glyph fade reveal' },
  { value: 'word-by-word', label: 'Word by Word', desc: 'Progressive spoken word reveal' },
  { value: 'word-pop', label: 'Subtitle Word Pop', desc: 'Dynamic active-word scale accent' },
  { value: 'karaoke', label: 'Karaoke Highlight', desc: 'Active spoken word color sweep' },
  { value: 'glitch-text', label: 'RGB Glitch Text', desc: 'Chromatic digital flicker' },
  { value: 'glitch-reveal', label: 'Glitch Scan Reveal', desc: 'Stepped horizontal slice reveal' },
];

export type VideoEffectCategory =
  | 'Cinematic'
  | 'Glitch & Distortion'
  | 'Light'
  | 'Blur'
  | 'Particles & Atmosphere'
  | 'Vintage';

export type VideoEffectType =
  | 'cinematic-glow'
  | 'film-grain'
  | 'light-leaks'
  | 'lens-flare'
  | 'bloom'
  | 'fx-vignette'
  | 'rgb-split'
  | 'digital-glitch'
  | 'vhs-distortion'
  | 'scanlines'
  | 'chromatic-aberration'
  | 'wave-distortion'
  | 'neon-glow'
  | 'soft-glow'
  | 'light-rays'
  | 'flash'
  | 'exposure-flicker'
  | 'gaussian-blur'
  | 'motion-blur'
  | 'zoom-blur'
  | 'radial-blur'
  | 'rain'
  | 'snow'
  | 'dust'
  | 'sparkles'
  | 'smoke'
  | 'film-8mm'
  | 'film-16mm'
  | 'film-35mm'
  | 'film-burn'
  | 'analog-noise';

export interface VideoEffectItem {
  id: string;
  type: VideoEffectType;
  name: string;
  category: VideoEffectCategory;
  enabled: boolean;
  intensity: number; // 0 to 100
  speed: number; // 0.2 to 3.0
  scale: number; // 10 to 200
  angle: number; // -180 to 180
  tint: string; // hex color
}

export type FilterCollection =
  | 'All'
  | 'Favorites'
  | 'Custom'
  | 'Cinematic'
  | 'Vintage'
  | 'Retro'
  | 'Portrait'
  | 'Nature'
  | 'Night'
  | 'Aesthetic'
  | 'Monochrome'
  | 'Vibrant';

export interface AppliedFilterState {
  id: string;
  name: string;
  intensity: number; // 0 to 100
}

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'difference';

export type MaskShape = 'none' | 'rectangle' | 'circle' | 'ellipse' | 'linear-wipe';

export type SpeedCurvePreset = 'constant' | 'ramp-up' | 'ramp-down' | 'hero-dip' | 'pulse';

export type VoiceChangerPreset = 'none' | 'deep' | 'high' | 'radio' | 'robot' | 'echo';

export type StickerKind =
  | 'rec-frame'
  | 'focus-reticle'
  | 'arrow-right'
  | 'lower-bar'
  | 'badge-live'
  | 'star-burst'
  | 'check-badge';

export interface ResolutionPreset {
  label: string;
  platform?: string;
  width: number;
  height: number;
}

export type ResolutionTier = '720p' | '1080p' | '1440p' | '4k';
export type AspectRatioKey = '16:9' | '9:16' | '1:1' | '4:5';

export const RESOLUTION_TIER_OPTIONS: {
  id: ResolutionTier;
  label: string;
  shortDesc: string;
  longEdge: number;
  shortEdge: number;
}[] = [
  { id: '720p', label: '720p HD', shortDesc: 'Fast draft & web', longEdge: 1280, shortEdge: 720 },
  { id: '1080p', label: '1080p Full HD', shortDesc: 'Standard production', longEdge: 1920, shortEdge: 1080 },
  { id: '1440p', label: '1440p QHD', shortDesc: 'Crisp high-bitrate', longEdge: 2560, shortEdge: 1440 },
  { id: '4k', label: '4K UHD', shortDesc: 'Cinema master', longEdge: 3840, shortEdge: 2160 },
];

export const ASPECT_RATIO_OPTIONS: {
  id: AspectRatioKey;
  label: string;
  platform: string;
  wRatio: number;
  hRatio: number;
}[] = [
  { id: '16:9', label: '16:9', platform: 'YouTube & Cinema', wRatio: 16, hRatio: 9 },
  { id: '9:16', label: '9:16', platform: 'Reels, Shorts & TikTok', wRatio: 9, hRatio: 16 },
  { id: '1:1', label: '1:1', platform: 'Square Feed', wRatio: 1, hRatio: 1 },
  { id: '4:5', label: '4:5', platform: 'Portrait Social', wRatio: 4, hRatio: 5 },
];

export function buildResolutionPreset(tier: ResolutionTier, ratio: AspectRatioKey): ResolutionPreset {
  const tierMeta = RESOLUTION_TIER_OPTIONS.find((t) => t.id === tier) ?? RESOLUTION_TIER_OPTIONS[1];
  const ratioMeta = ASPECT_RATIO_OPTIONS.find((r) => r.id === ratio) ?? ASPECT_RATIO_OPTIONS[0];
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

  let width: number;
  let height: number;
  if (ratio === '16:9') {
    width = tierMeta.longEdge;
    height = tierMeta.shortEdge;
  } else if (ratio === '9:16') {
    width = tierMeta.shortEdge;
    height = tierMeta.longEdge;
  } else if (ratio === '1:1') {
    width = tierMeta.shortEdge;
    height = tierMeta.shortEdge;
  } else {
    // 4:5 portrait — anchor width to shortEdge (e.g. 1080x1350 for 1080p)
    width = tierMeta.shortEdge;
    height = even((tierMeta.shortEdge * 5) / 4);
  }

  return {
    label: `${tierMeta.label} (${ratio})`,
    platform: ratioMeta.platform,
    width,
    height,
  };
}

export function getAspectRatioLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw === 16 && rh === 9) return '16:9';
  if (rw === 9 && rh === 16) return '9:16';
  if (rw === 1 && rh === 1) return '1:1';
  if (rw === 4 && rh === 5) return '4:5';
  if (rw === 21 && rh === 9) return '21:9';
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.03) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.03) return '9:16';
  if (Math.abs(ratio - 4 / 5) < 0.03) return '4:5';
  if (Math.abs(ratio - 1) < 0.03) return '1:1';
  return `${rw}:${rh}`;
}

export type ProjectCategory =
  | 'General'
  | 'Film & Cinema'
  | 'YouTube & Vlog'
  | 'Social & Reels'
  | 'Commercial'
  | 'Podcast & Audio';

export const PROJECT_CATEGORIES: ProjectCategory[] = [
  'General',
  'Film & Cinema',
  'YouTube & Vlog',
  'Social & Reels',
  'Commercial',
  'Podcast & Audio',
];

export interface DashboardSettings {
  defaultTier: ResolutionTier;
  defaultRatio: AspectRatioKey;
  defaultFps: 24 | 30 | 60;
  defaultProxyMode: boolean;
  defaultViewMode: 'grid' | 'list';
}

export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  defaultTier: '1080p',
  defaultRatio: '16:9',
  defaultFps: 30,
  defaultProxyMode: false,
  defaultViewMode: 'grid',
};

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: '720p HD (16:9)', platform: 'Web / Draft', width: 1280, height: 720 },
  { label: '1080p YouTube (16:9)', platform: 'YouTube', width: 1920, height: 1080 },
  { label: 'TikTok / Reels (9:16)', platform: 'TikTok / Shorts', width: 1080, height: 1920 },
  { label: 'Instagram Square (1:1)', platform: 'Instagram', width: 1080, height: 1080 },
  { label: 'Instagram Portrait (4:5)', platform: 'Instagram', width: 1080, height: 1350 },
  { label: '1440p QHD (16:9)', platform: 'YouTube QHD', width: 2560, height: 1440 },
  { label: '4K UHD (16:9)', platform: 'Cinema / 4K', width: 3840, height: 2160 },
];

export interface ClipTransform {
  x: number; // percentage offset from center (-100 to 100)
  y: number; // percentage offset from center (-100 to 100)
  scale: number; // percentage (10 to 400)
  rotation: number; // degrees (-180 to 180)
  opacity: number; // 0 to 100
  flipH: boolean;
  flipV: boolean;
}

export interface ClipCrop {
  top: number; // 0 to 45 (%)
  right: number;
  bottom: number;
  left: number;
}

export interface Keyframe {
  id: string;
  time: number; // local clip seconds (0 .. duration)
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  easing: 'linear' | 'ease-in-out' | 'ease-out';
}

export interface SpeedCurveSettings {
  preset: SpeedCurvePreset;
  startSpeed: number; // 0.1 to 8
  midSpeed: number; // 0.1 to 8
  endSpeed: number; // 0.1 to 8
}

export interface ClipColorAdjustments {
  brightness: number; // 0 to 200 (100 default)
  contrast: number; // 0 to 200 (100 default)
  saturation: number; // 0 to 200 (100 default)
  hueRotate: number; // -180 to 180 deg
  temperature: number; // -100 to 100
  grayscale: number; // 0 to 100
  sepia: number; // 0 to 100
  blur: number; // 0 to 20 px
  vignette: number; // 0 to 100
  // 3-point tonal curve (-50 to +50)
  curveShadows: number;
  curveMidtones: number;
  curveHighlights: number;
}

export interface ClipVisualEffects {
  filmGrain: number; // 0 to 100
  chromaticAberration: number; // 0 to 30 px
  pixelate: number; // 0 to 40 px block size
  invert: boolean;
}

export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // hex e.g. #00ff00
  similarity: number; // 5 to 100
  smoothness: number; // 0 to 50
  spillSuppression: number; // 0 to 100
}

export interface MaskSettings {
  shape: MaskShape;
  x: number; // 0 to 100 (%)
  y: number; // 0 to 100 (%)
  width: number; // 5 to 100 (%)
  height: number; // 5 to 100 (%)
  feather: number; // 0 to 40 px
  rotation?: number; // -180 to 180 deg
  cornerRadius?: number; // 0 to 100 px
  invert: boolean;
}

export interface StabilizationOffset {
  time: number;
  dx: number; // % compensation
  dy: number; // % compensation
}

export interface StabilizationSettings {
  enabled: boolean;
  strength: number; // 0 to 100
  autoScale: number; // e.g. 108 (%)
  offsets: StabilizationOffset[];
}

export interface ClipAudioSettings {
  volume: number; // 0 to 200 (100 default)
  muted: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds
  voiceChanger: VoiceChangerPreset;
  noiseReduction: number; // 0 to 100
  customPitch?: number; // 0.5 to 2.0 (1.0 default)
  echoMix?: number; // 0 to 100 (%)
}

export interface ClipTransition {
  type: TransitionType;
  duration: number; // seconds
  easing?: TransitionEasing;
  intensity?: number; // 0.2 to 2.0
}

export interface ClipTextSettings {
  content: string;
  fontFamily: string;
  fontSize: number; // px relative to 1080p canvas
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  x: number; // 0 to 100 (% of canvas width)
  y: number; // 0 to 100 (% of canvas height)
  letterSpacing?: number; // px (-4 to 24)
  lineHeight?: number; // multiplier (0.8 to 2.5)
  paddingX?: number; // px relative to 1080p
  paddingY?: number; // px relative to 1080p
  borderRadius?: number; // px
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  outlineWidth: number;
  outlineColor: string;
  backgroundColor: string;
  highlightColor?: string;
  typographyStyle?: TextTypographyStyle;
  gradientColor?: string;
  wordTimings?: WordTiming[];
  animation: TextAnimation;
  animationDuration: number;
  animationEasing?: TransitionEasing;
}

export interface ClipStickerSettings {
  kind: StickerKind;
  color: string;
  accentColor: string;
  label: string;
}

export interface Clip {
  id: string;
  mediaId: string | null;
  trackId: string;
  type: ClipType;
  name: string;
  startTime: number; // timeline seconds
  duration: number; // timeline seconds
  sourceIn: number; // source media seconds
  sourceOut: number; // source media seconds
  mediaDuration: number; // max source duration (Infinity for image/text/sticker)
  speed: number; // base playback rate (0.25 to 4)
  speedCurve: SpeedCurveSettings;
  reversed: boolean;
  transform: ClipTransform;
  crop: ClipCrop;
  keyframes: Keyframe[];
  blendMode: BlendMode;
  color: ClipColorAdjustments;
  effects: ClipVisualEffects;
  effectsStack?: VideoEffectItem[];
  appliedFilter?: AppliedFilterState;
  chromaKey: ChromaKeySettings;
  mask: MaskSettings;
  stabilization: StabilizationSettings;
  audio: ClipAudioSettings;
  transitionIn: ClipTransition;
  transitionOut: ClipTransition;
  text?: ClipTextSettings;
  sticker?: ClipStickerSettings;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  order: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  hidden: boolean;
  volume: number; // 0 to 200
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  favorite?: boolean;
  category?: ProjectCategory;
  resolution: ResolutionPreset;
  fps: 24 | 30 | 60;
  proxyMode: boolean;
  tracks: Track[];
  clips: Clip[];
  thumbnailDataUrl?: string;
}

export interface MediaAssetRecord {
  id: string;
  projectId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  mimeType: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  blob: Blob;
  proxyBlob?: Blob;
  thumbnailDataUrl?: string;
  waveformPeaks?: number[];
  createdAt: number;
}

export interface MediaAsset extends Omit<MediaAssetRecord, 'blob' | 'proxyBlob'> {
  objectUrl: string;
  proxyObjectUrl?: string;
  hasProxy: boolean;
}

export type TimelineTool = 'select' | 'razor';

export interface ExportSettings {
  resolution: ResolutionPreset;
  fps: 24 | 30 | 60;
  format: 'webm' | 'mp4';
  quality: 'draft' | 'standard' | 'high';
}

export interface ToastNotification {
  id: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

export const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 100,
  rotation: 0,
  opacity: 100,
  flipH: false,
  flipV: false,
};

export const DEFAULT_CROP: ClipCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const DEFAULT_SPEED_CURVE: SpeedCurveSettings = {
  preset: 'constant',
  startSpeed: 1,
  midSpeed: 1,
  endSpeed: 1,
};

export const DEFAULT_COLOR: ClipColorAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hueRotate: 0,
  temperature: 0,
  grayscale: 0,
  sepia: 0,
  blur: 0,
  vignette: 0,
  curveShadows: 0,
  curveMidtones: 0,
  curveHighlights: 0,
};

export const DEFAULT_EFFECTS: ClipVisualEffects = {
  filmGrain: 0,
  chromaticAberration: 0,
  pixelate: 0,
  invert: false,
};

export const DEFAULT_CHROMA_KEY: ChromaKeySettings = {
  enabled: false,
  color: '#00ff00',
  similarity: 35,
  smoothness: 12,
  spillSuppression: 40,
};

export const DEFAULT_MASK: MaskSettings = {
  shape: 'none',
  x: 50,
  y: 50,
  width: 60,
  height: 60,
  feather: 0,
  rotation: 0,
  cornerRadius: 0,
  invert: false,
};

export const DEFAULT_STABILIZATION: StabilizationSettings = {
  enabled: false,
  strength: 65,
  autoScale: 108,
  offsets: [],
};

export const DEFAULT_AUDIO: ClipAudioSettings = {
  volume: 100,
  muted: false,
  fadeIn: 0,
  fadeOut: 0,
  voiceChanger: 'none',
  noiseReduction: 0,
  customPitch: 1,
  echoMix: 0,
};

export const DEFAULT_TEXT: ClipTextSettings = {
  content: 'Title Text',
  fontFamily: 'Inter',
  fontSize: 64,
  fontWeight: 600,
  color: '#FAF9F6',
  align: 'center',
  x: 50,
  y: 50,
  letterSpacing: 0,
  lineHeight: 1.24,
  paddingX: 28,
  paddingY: 14,
  borderRadius: 8,
  shadowBlur: 12,
  shadowColor: 'rgba(0,0,0,0.75)',
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  outlineWidth: 0,
  outlineColor: '#000000',
  backgroundColor: 'transparent',
  highlightColor: '#b9c9d1',
  typographyStyle: 'clean',
  gradientColor: '#38BDF8',
  animation: 'fade',
  animationDuration: 0.4,
  animationEasing: 'ease-out',
};

export const DEFAULT_TRACKS: Track[] = [
  { id: 'T1', name: 'Text / Graphics', type: 'text', order: 0, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'V3', name: 'Video 3', type: 'video', order: 1, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'V2', name: 'Video 2', type: 'video', order: 2, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'V1', name: 'Video 1', type: 'video', order: 3, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'A1', name: 'Audio 1', type: 'audio', order: 4, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'A2', name: 'Audio 2', type: 'audio', order: 5, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
  { id: 'A3', name: 'Audio 3', type: 'audio', order: 6, muted: false, solo: false, locked: false, hidden: false, volume: 100 },
];
