import {
  DEFAULT_TRACKS,
  RESOLUTION_PRESETS,
  buildResolutionPreset,
  type AspectRatioKey,
  type Project,
  type ProjectCategory,
  type ResolutionPreset,
  type ResolutionTier,
} from '../../types/editor';
import { createTextClip } from '../timeline-engine/timelineOps';
import { createId } from '../../utils/id';

export interface CreateProjectOptions {
  category?: ProjectCategory;
  proxyMode?: boolean;
  favorite?: boolean;
}

export function createNewProject(
  name: string,
  resolution: ResolutionPreset = RESOLUTION_PRESETS[1],
  fps: 24 | 30 | 60 = 30,
  options: CreateProjectOptions = {}
): Project {
  const now = Date.now();
  return {
    id: createId('proj'),
    name: name.trim() || 'Untitled Sequence',
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    favorite: Boolean(options.favorite),
    category: options.category ?? 'General',
    resolution,
    fps,
    proxyMode: Boolean(options.proxyMode),
    tracks: DEFAULT_TRACKS.map((t) => ({ ...t })),
    clips: [],
  };
}

export interface ProjectTemplateSpec {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  tier: ResolutionTier;
  ratio: AspectRatioKey;
  fps: 24 | 30 | 60;
  starterTitle?: {
    label: string;
    content: string;
    fontSize: number;
    y: number;
    duration: number;
    animation: 'fade' | 'slide-up' | 'tracking-in' | 'word-pop';
  };
}

export const DASHBOARD_TEMPLATES: ProjectTemplateSpec[] = [
  {
    id: 'tpl-cinema-4k',
    name: 'Cinema 4K Featurette',
    description: '24 fps 4K UHD widescreen timeline with minimalist title sequence on T1.',
    category: 'Film & Cinema',
    tier: '4k',
    ratio: '16:9',
    fps: 24,
    starterTitle: {
      label: 'Opening Title',
      content: 'OPENING SEQUENCE',
      fontSize: 72,
      y: 50,
      duration: 4.5,
      animation: 'tracking-in',
    },
  },
  {
    id: 'tpl-social-reel',
    name: 'Vertical Social Reel',
    description: '9:16 1080×1920 60 fps canvas calibrated for Shorts, Reels, and TikTok.',
    category: 'Social & Reels',
    tier: '1080p',
    ratio: '9:16',
    fps: 60,
    starterTitle: {
      label: 'Hook Caption',
      content: 'HOOK HEADLINE HERE',
      fontSize: 54,
      y: 78,
      duration: 3.5,
      animation: 'word-pop',
    },
  },
  {
    id: 'tpl-youtube-1080',
    name: 'YouTube Creator Edit',
    description: '1080p 30 fps sequence with lower-third speaker callout ready for B-roll overlays.',
    category: 'YouTube & Vlog',
    tier: '1080p',
    ratio: '16:9',
    fps: 30,
    starterTitle: {
      label: 'Lower Third',
      content: 'Chapter 01 — Introduction',
      fontSize: 42,
      y: 84,
      duration: 4,
      animation: 'slide-up',
    },
  },
  {
    id: 'tpl-square-promo',
    name: 'Square Product Spot',
    description: '1:1 square feed master for crisp product launches and social carousels.',
    category: 'Commercial',
    tier: '1080p',
    ratio: '1:1',
    fps: 30,
    starterTitle: {
      label: 'Product Callout',
      content: 'NEW COLLECTION',
      fontSize: 56,
      y: 50,
      duration: 3,
      animation: 'fade',
    },
  },
  {
    id: 'tpl-portrait-4x5',
    name: 'Portrait Lookbook (4:5)',
    description: '1080×1350 tall feed layout optimized for editorial photography and fashion cuts.',
    category: 'Commercial',
    tier: '1080p',
    ratio: '4:5',
    fps: 24,
    starterTitle: {
      label: 'Editorial Title',
      content: 'AUTUMN / WINTER',
      fontSize: 52,
      y: 82,
      duration: 4,
      animation: 'tracking-in',
    },
  },
  {
    id: 'tpl-podcast-qhd',
    name: 'Podcast & Studio Cut',
    description: '1440p QHD widescreen multi-track layout ready for voiceover and auto-captions.',
    category: 'Podcast & Audio',
    tier: '1440p',
    ratio: '16:9',
    fps: 30,
    starterTitle: {
      label: 'Episode Title',
      content: 'EPISODE 01 · STUDIO SESSION',
      fontSize: 44,
      y: 85,
      duration: 5,
      animation: 'slide-up',
    },
  },
];

export function createProjectFromTemplate(
  template: ProjectTemplateSpec,
  customName?: string,
  proxyMode = false
): Project {
  const resolution = buildResolutionPreset(template.tier, template.ratio);
  const project = createNewProject(
    customName?.trim() || template.name,
    resolution,
    template.fps,
    {
      category: template.category,
      proxyMode,
    }
  );

  if (template.starterTitle) {
    const titleClip = createTextClip(
      template.starterTitle.label,
      'T1',
      0,
      [],
      {
        content: template.starterTitle.content,
        fontSize: template.starterTitle.fontSize,
        y: template.starterTitle.y,
        animation: template.starterTitle.animation,
      },
      template.starterTitle.duration,
      true
    );
    project.clips = [titleClip];
  }

  return project;
}

export function getProjectDuration(project: Project): number {
  if (project.clips.length === 0) return 0;
  let maxEnd = 0;
  for (const clip of project.clips) {
    const end = clip.startTime + clip.duration;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}
