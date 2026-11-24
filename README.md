# FRAMESTUDIO

FRAMESTUDIO is a browser-based non-linear video editor (NLE) built with React, TypeScript, Vite, Tailwind CSS, HTML5 Canvas2D, Web Audio API, and IndexedDB. All media importing, timeline editing, compositing, audio mixing, captioning, and video rendering run locally in the browser with zero external AI dependencies.

## Features

- **Project Dashboard**: Manage local projects stored in IndexedDB with presets (720p / 1080p / 1440p / 4K, 16:9 / 9:16 / 1:1 / 4:5, 24 / 30 / 60 fps), templates, search, sorting, grid/list views, favorites, duplication, and JSON project backup/import.
- **Dynamic Multi-Track Timeline**: Unlimited dynamic video, audio, and text tracks with drag-and-drop asset placement, clip trimming, razor splitting, snapping, track reordering/locking/muting/solo/visibility, and undo/redo history.
- **Program Monitor & Compositor**: Real-time Canvas2D preview with zoom presets (50%–150%, Fit, Fullscreen), SMPTE timecode scrubbing, safe-area / ROI picker, and interactive Before/After split-wipe comparison.
- **Creative Library**:
  - **Video Effects (31 Stackable VFX)**: Cinematic, Glitch & Distortion, Light, Blur, Particles & Atmosphere, and Vintage effects that can be stacked, reordered, toggled, and tuned per clip.
  - **Filters & Color Studio**: 31 color looks across 12 collections with intensity blending, favorites, custom saved presets, 3-point tonal curves, and reset.
  - **Transitions (26 FX)**: Dissolves, wipes, zooms, whip-pan blurs, glitches, and flips with custom duration, easing, and intensity.
  - **Text, Motion Graphics & Captions**: 10 typography styles (including Neon, 3D, Gradient, Outline, Glitch, Cinematic), 19 text/subtitle animations, per-word timing editor, batch script-to-captions generator, Web Speech API dictation/TTS audition, and `.srt` import/export.
- **Audio Studio & Local Export**: Web Audio multi-track mixer with volume/fade/EQ/voice-changer processing, synthesized SFX generator, voiceover recording, 360p proxy generation, and local WebM/MP4 export.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion (`motion`), Lucide Icons
- **Media & Storage**: HTML5 Canvas2D, Web Audio API, Web Speech API, IndexedDB

## Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.1+

### Installation

```bash
bun install
# or
npm install
```

### Development

```bash
bun run dev
# or
npm run dev
```

The development server runs on `http://localhost:3000`.

### Production Build & Type Check

```bash
bun run lint
bun run build
# or
npm run lint
npm run build
```
