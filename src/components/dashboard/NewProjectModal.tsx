import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Film, Layers, X } from 'lucide-react';
import {
  ASPECT_RATIO_OPTIONS,
  PROJECT_CATEGORIES,
  RESOLUTION_TIER_OPTIONS,
  buildResolutionPreset,
  type AspectRatioKey,
  type ProjectCategory,
  type ResolutionPreset,
  type ResolutionTier,
} from '../../types/editor';

interface NewProjectModalProps {
  open: boolean;
  initialTier?: ResolutionTier;
  initialRatio?: AspectRatioKey;
  initialFps?: 24 | 30 | 60;
  initialProxyMode?: boolean;
  onClose: () => void;
  onCreate: (
    name: string,
    resolution: ResolutionPreset,
    fps: 24 | 30 | 60,
    options: { category: ProjectCategory; proxyMode: boolean }
  ) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  open,
  initialTier = '1080p',
  initialRatio = '16:9',
  initialFps = 30,
  initialProxyMode = false,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('Untitled Sequence');
  const [category, setCategory] = useState<ProjectCategory>('General');
  const [tier, setTier] = useState<ResolutionTier>(initialTier);
  const [ratio, setRatio] = useState<AspectRatioKey>(initialRatio);
  const [fps, setFps] = useState<24 | 30 | 60>(initialFps);
  const [proxyMode, setProxyMode] = useState<boolean>(initialProxyMode);

  useEffect(() => {
    if (!open) return;
    setName('Untitled Sequence');
    setCategory('General');
    setTier(initialTier);
    setRatio(initialRatio);
    setFps(initialFps);
    setProxyMode(initialProxyMode);
  }, [open, initialTier, initialRatio, initialFps, initialProxyMode]);

  const resolvedPreset = buildResolutionPreset(tier, ratio);
  const selectedRatioMeta =
    ASPECT_RATIO_OPTIONS.find((r) => r.id === ratio) ?? ASPECT_RATIO_OPTIONS[0];

  // Compute preview box dimensions inside a 96x64 visual stage
  const maxStageW = 88;
  const maxStageH = 58;
  const aspectVal = selectedRatioMeta.wRatio / selectedRatioMeta.hRatio;
  let frameW = maxStageW;
  let frameH = frameW / aspectVal;
  if (frameH > maxStageH) {
    frameH = maxStageH;
    frameW = frameH * aspectVal;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(name.trim() || 'Untitled Sequence', resolvedPreset, fps, {
      category,
      proxyMode,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
          onClick={onClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#151820] border border-white/[0.08] rounded-2xl shadow-[0_28px_80px_rgba(0,0,0,0.75)] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#181B24]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#0284C7]/15 border border-[#38BDF8]/30 flex items-center justify-center">
                  <Film className="w-4 h-4 text-[#38BDF8]" />
                </div>
                <div>
                  <h2 className="font-display text-sm font-semibold text-[#FAF9F6] tracking-tight">
                    Create New Sequence
                  </h2>
                  <p className="text-[11px] text-[#9BA3AB]">
                    Configure resolution, aspect ratio, and frame timebase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-[#9BA3AB] hover:text-[#FAF9F6] rounded-lg hover:bg-white/[0.06] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              {/* Name & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="new-project-name"
                    className="block text-xs font-medium text-[#dce4e4] mb-1.5"
                  >
                    Project Name
                  </label>
                  <input
                    id="new-project-name"
                    type="text"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter sequence title..."
                    className="w-full h-10 px-3.5 bg-[#0E1014] border border-white/[0.08] focus:border-[#38BDF8] rounded-xl text-sm text-[#FAF9F6] placeholder-[#666E76] outline-none transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="new-project-category"
                    className="block text-xs font-medium text-[#dce4e4] mb-1.5"
                  >
                    Category
                  </label>
                  <select
                    id="new-project-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                    className="w-full h-10 px-3 bg-[#0E1014] border border-white/[0.08] focus:border-[#38BDF8] rounded-xl text-xs text-[#FAF9F6] outline-none transition-colors"
                  >
                    {PROJECT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-[#151820] text-[#FAF9F6]">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Resolution Quality Presets (720p, 1080p, 1440p, 4K) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#dce4e4]">Resolution Preset</span>
                  <span className="font-mono text-[11px] tabular-nums text-[#38BDF8]">
                    {resolvedPreset.width} × {resolvedPreset.height} px
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {RESOLUTION_TIER_OPTIONS.map((opt) => {
                    const active = tier === opt.id;
                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setTier(opt.id)}
                        className={`relative p-3 text-left rounded-xl border transition-all ${
                          active
                            ? 'bg-[#0284C7]/15 border-[#38BDF8]/70 text-[#FAF9F6] shadow-[0_0_0_1px_rgba(56,189,248,0.2)]'
                            : 'bg-[#1A1E28] border-white/[0.06] text-[#9BA3AB] hover:border-white/[0.14] hover:text-[#FAF9F6]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-[#FAF9F6] whitespace-nowrap">
                            {opt.label}
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />}
                        </div>
                        <div className="text-[11px] text-[#9BA3AB] mt-1 truncate">
                          {opt.shortDesc}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio Presets + Live Frame Geometry Preview */}
              <div>
                <span className="block text-xs font-medium text-[#dce4e4] mb-2">
                  Aspect Ratio & Delivery Format
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                  <div className="sm:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {ASPECT_RATIO_OPTIONS.map((opt) => {
                      const active = ratio === opt.id;
                      const iconScale = 18;
                      const maxDim = Math.max(opt.wRatio, opt.hRatio);
                      const iw = Math.max(8, Math.round((opt.wRatio / maxDim) * iconScale));
                      const ih = Math.max(8, Math.round((opt.hRatio / maxDim) * iconScale));

                      return (
                        <motion.button
                          key={opt.id}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setRatio(opt.id)}
                          className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 text-center transition-all ${
                            active
                              ? 'bg-[#0284C7]/15 border-[#38BDF8]/70 text-[#FAF9F6]'
                              : 'bg-[#1A1E28] border-white/[0.06] text-[#9BA3AB] hover:border-white/[0.14] hover:text-[#FAF9F6]'
                          }`}
                        >
                          <div className="h-6 flex items-center justify-center">
                            <div
                              style={{ width: iw, height: ih }}
                              className={`rounded-[3px] border ${
                                active
                                  ? 'border-[#38BDF8] bg-[#38BDF8]/20'
                                  : 'border-[#666E76] bg-white/[0.03]'
                              }`}
                            />
                          </div>
                          <div>
                            <div className="font-mono text-xs font-semibold tabular-nums text-[#FAF9F6]">
                              {opt.label}
                            </div>
                            <div className="text-[10px] text-[#9BA3AB] truncate max-w-[92px]">
                              {opt.platform.split('&')[0].trim()}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Live Geometry Preview Box */}
                  <div className="sm:col-span-4 rounded-xl bg-[#0E1014] border border-white/[0.06] p-3 flex flex-col items-center justify-center gap-2">
                    <div className="h-[62px] flex items-center justify-center">
                      <motion.div
                        layout
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        style={{ width: Math.round(frameW), height: Math.round(frameH) }}
                        className="rounded-md border border-[#38BDF8]/60 bg-gradient-to-br from-[#1C2A3A] to-[#11151E] flex items-center justify-center shadow-inner"
                      >
                        <span className="font-mono text-[10px] font-medium text-[#7DD3FC] tabular-nums">
                          {ratio}
                        </span>
                      </motion.div>
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-[#9BA3AB]">
                      {resolvedPreset.width}×{resolvedPreset.height} · {fps}p
                    </div>
                  </div>
                </div>
              </div>

              {/* Frame Rate & Proxy Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <span className="block text-xs font-medium text-[#dce4e4] mb-2">
                    Frame Rate (Timebase)
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { val: 24, sub: 'Cinema' },
                        { val: 30, sub: 'Standard' },
                        { val: 60, sub: 'High Motion' },
                      ] as const
                    ).map((opt) => {
                      const active = fps === opt.val;
                      return (
                        <motion.button
                          key={opt.val}
                          type="button"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setFps(opt.val)}
                          className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                            active
                              ? 'bg-[#0284C7]/15 border-[#38BDF8]/70 text-[#FAF9F6]'
                              : 'bg-[#1A1E28] border-white/[0.06] text-[#9BA3AB] hover:border-white/[0.14] hover:text-[#FAF9F6]'
                          }`}
                        >
                          <div className="font-mono text-xs font-semibold tabular-nums">
                            {opt.val} fps
                          </div>
                          <div className="text-[10px] text-[#9BA3AB]">{opt.sub}</div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setProxyMode((v) => !v)}
                    className={`w-full h-[54px] px-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors text-left ${
                      proxyMode
                        ? 'bg-[#0284C7]/15 border-[#38BDF8]/60 text-[#FAF9F6]'
                        : 'bg-[#1A1E28] border-white/[0.06] text-[#9BA3AB] hover:border-white/[0.14]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Layers className="w-4 h-4 text-[#38BDF8] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[#FAF9F6] truncate">
                          Proxy Playback Mode
                        </div>
                        <div className="text-[10px] text-[#9BA3AB] truncate">
                          360p timeline scrubbing; full-res export
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] font-semibold shrink-0 text-[#dce4e4]">
                      {proxyMode ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-white/[0.06] bg-[#12141B]">
              <div className="hidden sm:block text-xs text-[#9BA3AB] font-mono tabular-nums">
                {resolvedPreset.width}×{resolvedPreset.height} · {fps} fps · {category}
              </div>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#dce4e4] bg-[#1E222D] hover:bg-[#272C3A] rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.97 }}
                  className="px-5 py-2 text-xs font-semibold text-[#FAF9F6] bg-[#0284C7] hover:bg-[#0EA5E9] rounded-xl transition-colors shadow-sm whitespace-nowrap shrink-0"
                >
                  Create Project
                </motion.button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
