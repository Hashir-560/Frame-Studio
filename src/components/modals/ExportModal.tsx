import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Download, Film, X } from 'lucide-react';
import {
  detectExportCapabilities,
  exportProjectVideo,
  type ExportProgress,
} from '../../features/export-engine/exporter';
import { useEditorStore } from '../../stores/useEditorStore';
import { RESOLUTION_PRESETS, type ExportSettings } from '../../types/editor';
import { formatFileSize, formatSMPTE } from '../../utils/timecode';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ open, onClose }) => {
  const { project, assetsMap, projectDuration, setIsPlaying, notify } = useEditorStore();
  const caps = useMemo(() => detectExportCapabilities(), []);

  const [resolutionIdx, setResolutionIdx] = useState(1);
  const [fps, setFps] = useState<24 | 30 | 60>(project?.fps ?? 30);
  const [format, setFormat] = useState<'webm' | 'mp4'>('webm');
  const [quality, setQuality] = useState<ExportSettings['quality']>('standard');

  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultFile, setResultFile] = useState<{
    url: string;
    filename: string;
    size: number;
    mimeType: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (project) {
      const idx = RESOLUTION_PRESETS.findIndex((r) => r.width === project.resolution.width);
      if (idx !== -1) setResolutionIdx(idx);
      setFps(project.fps);
    }
  }, [project]);

  useEffect(() => {
    return () => {
      if (resultFile?.url) URL.revokeObjectURL(resultFile.url);
      abortRef.current?.abort();
    };
  }, [resultFile]);

  const handleClose = () => {
    if (exporting) return;
    if (resultFile?.url) {
      URL.revokeObjectURL(resultFile.url);
      setResultFile(null);
    }
    setErrorMsg(null);
    setProgress(null);
    onClose();
  };

  const handleStartExport = async () => {
    if (!project || projectDuration <= 0.05) {
      setErrorMsg('Add at least one clip to the timeline before exporting.');
      return;
    }

    setIsPlaying(false);
    setErrorMsg(null);
    if (resultFile?.url) {
      URL.revokeObjectURL(resultFile.url);
      setResultFile(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);

    const settings: ExportSettings = {
      resolution: RESOLUTION_PRESETS[resolutionIdx],
      fps,
      format,
      quality,
    };

    try {
      const { blob, mimeType, extension } = await exportProjectVideo(
        project,
        assetsMap,
        settings,
        (prog) => setProgress(prog),
        controller.signal
      );

      const url = URL.createObjectURL(blob);
      const safeName = project.name.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'sequence';
      const filename = `${safeName}_${settings.resolution.width}x${settings.resolution.height}.${extension}`;
      setResultFile({ url, filename, size: blob.size, mimeType });
      notify(`Export ready: ${filename} (${formatFileSize(blob.size)})`, 'success');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('Export was cancelled.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Export failed in this browser.');
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    abortRef.current?.abort();
  };

  const triggerDownload = () => {
    if (!resultFile) return;
    const a = document.createElement('a');
    a.href = resultFile.url;
    a.download = resultFile.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!project) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#181A1F] border border-[#343A46] rounded-md shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2E37] bg-[#1E2128]">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[#b9c9d1]" />
                <h2 className="text-sm font-semibold text-[#FAF9F6]">Export Sequence</h2>
              </div>
              <button
                type="button"
                disabled={exporting}
                onClick={handleClose}
                className="p-1 text-[#A5ADAD] hover:text-[#FAF9F6] disabled:opacity-40 rounded hover:bg-[#2A2E37]"
                aria-label="Close export modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Sequence Summary */}
              <div className="p-3 bg-[#101114] border border-[#2A2E37] rounded flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[#FAF9F6]">{project.name}</div>
                  <div className="text-[11px] text-[#A5ADAD] mt-0.5">
                    Browser Canvas + Web Audio MediaRecorder
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-[#FAF9F6]">{formatSMPTE(projectDuration, fps)}</div>
                  <div className="text-[10px] text-[#6C7378]">{project.clips.length} clips</div>
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label className="block text-[11px] font-medium text-[#A5ADAD] mb-1.5">
                  Output Resolution
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                  {RESOLUTION_PRESETS.map((preset, idx) => (
                    <button
                      key={preset.label}
                      type="button"
                      disabled={exporting}
                      onClick={() => setResolutionIdx(idx)}
                      className={`py-1.5 px-2 text-left rounded border transition-colors ${
                        resolutionIdx === idx
                          ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                          : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD] hover:text-[#dce4e4]'
                      }`}
                    >
                      <div className="text-[10px] font-medium truncate">{preset.label}</div>
                      <div className="font-mono text-[9px] tabular-nums opacity-75">
                        {preset.width}×{preset.height}
                      </div>
                    </button>
                  ))}
                </div>
                {RESOLUTION_PRESETS[resolutionIdx].width >= 2560 && (
                  <p className="text-[10px] text-amber-300/90 mt-1.5">
                    Note: Real-time 1440p/4K Canvas encoding depends on your device CPU/GPU throughput and may drop frames on slower hardware.
                  </p>
                )}
              </div>

              {/* Frame Rate & Quality */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#A5ADAD] mb-1.5">
                    Frame Rate
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {([24, 30, 60] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        disabled={exporting}
                        onClick={() => setFps(rate)}
                        className={`py-1.5 rounded border font-mono text-[11px] tabular-nums ${
                          fps === rate
                            ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                            : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                        }`}
                      >
                        {rate}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-[#A5ADAD] mb-1.5">
                    Bitrate Quality
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['draft', 'standard', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        type="button"
                        disabled={exporting}
                        onClick={() => setQuality(q)}
                        className={`py-1.5 rounded border text-[11px] capitalize ${
                          quality === q
                            ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                            : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Format & Codec Honesty */}
              <div>
                <label className="block text-[11px] font-medium text-[#A5ADAD] mb-1.5">
                  Container Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={exporting || !caps.webmSupported}
                    onClick={() => setFormat('webm')}
                    className={`p-2 text-left rounded border transition-colors ${
                      format === 'webm'
                        ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                        : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                    } disabled:opacity-40`}
                  >
                    <div className="text-xs font-medium">WebM (VP9 / VP8 + Opus)</div>
                    <div className="font-mono text-[10px] opacity-80 truncate">
                      {caps.bestWebmMime ?? 'Unsupported'}
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={exporting || !caps.mp4Supported}
                    onClick={() => setFormat('mp4')}
                    className={`p-2 text-left rounded border transition-colors ${
                      format === 'mp4'
                        ? 'bg-[#3A4950] border-[#b9c9d1]/50 text-[#FAF9F6]'
                        : 'bg-[#20232A] border-[#2A2E37] text-[#A5ADAD]'
                    } disabled:opacity-45 disabled:cursor-not-allowed`}
                  >
                    <div className="text-xs font-medium">MP4 (H.264 / AAC)</div>
                    <div className="font-mono text-[10px] opacity-80 truncate">
                      {caps.bestMp4Mime ?? 'Not supported by this browser'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Progress / Error / Result */}
              {exporting && progress && (
                <div className="p-3 bg-[#101114] border border-[#343A46] rounded space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#FAF9F6] capitalize">{progress.stage} video...</span>
                    <span className="font-mono tabular-nums text-[#b9c9d1]">
                      {Math.round(progress.percent)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#20232A] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-[#b9c9d1] transition-[width] duration-150"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-[#A5ADAD]">
                    <span>
                      {progress.currentTime.toFixed(1)}s / {progress.totalDuration.toFixed(1)}s
                    </span>
                    <span>ETA ~{Math.ceil(progress.etaMs / 1000)}s</span>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 bg-[#93000a]/25 border border-[#ffb4ab]/30 rounded flex items-start gap-2 text-xs text-[#ffdad6]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {resultFile && (
                <div className="p-3 bg-[#20232A] border border-[#b9c9d1]/40 rounded flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-[#b9c9d1] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#FAF9F6] truncate">
                        {resultFile.filename}
                      </div>
                      <div className="font-mono text-[10px] tabular-nums text-[#A5ADAD]">
                        {formatFileSize(resultFile.size)} · {resultFile.mimeType}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={triggerDownload}
                    className="px-3 py-1.5 bg-[#3A4950] hover:bg-[#516168] text-[#FAF9F6] text-xs font-medium rounded flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#2A2E37] bg-[#15171C]">
              {exporting ? (
                <button
                  type="button"
                  onClick={handleCancelExport}
                  className="px-4 py-1.5 bg-[#93000a] hover:bg-[#b3000d] text-[#ffdad6] text-xs font-medium rounded transition-colors"
                >
                  Cancel Export
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3 py-1.5 bg-[#20232A] hover:bg-[#2A2E37] border border-[#343A46] text-xs font-medium text-[#dce4e4] rounded transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={projectDuration <= 0.05 || (!caps.webmSupported && !caps.mp4Supported)}
                    onClick={() => void handleStartExport()}
                    className="px-4 py-1.5 bg-[#3A4950] hover:bg-[#516168] disabled:opacity-40 text-[#FAF9F6] text-xs font-semibold rounded flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Start Export
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
