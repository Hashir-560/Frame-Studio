import React, { useEffect, useRef, useState } from 'react';

interface ScrubInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  precision?: number;
  onStartScrub?: () => void;
  onChange: (nextValue: number) => void;
  disabled?: boolean;
}

export const ScrubInput: React.FC<ScrubInputProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  precision = 0,
  onStartScrub,
  onChange,
  disabled = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [draft, setDraft] = useState(value.toFixed(precision));
  const inputRef = useRef<HTMLInputElement>(null);
  const scrubRef = useRef<{ startX: number; startVal: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value.toFixed(precision));
    }
  }, [value, precision, editing]);

  const clampAndRound = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    const factor = Math.pow(10, precision);
    return Math.round(clamped * factor) / factor;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || editing) return;
    if (e.button !== 0) return;
    e.preventDefault();
    onStartScrub?.();
    setScrubbing(true);
    scrubRef.current = { startX: e.clientX, startVal: value, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubRef.current || disabled) return;
    const dx = e.clientX - scrubRef.current.startX;
    if (Math.abs(dx) > 2) scrubRef.current.moved = true;
    const sensitivity = e.shiftKey ? step * 0.25 : step;
    const next = clampAndRound(scrubRef.current.startVal + (dx / 2.5) * sensitivity);
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubRef.current) return;
    setScrubbing(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    const wasMoved = scrubRef.current.moved;
    scrubRef.current = null;
    if (!wasMoved && !disabled) {
      setEditing(true);
      setDraft(value.toFixed(precision));
      window.setTimeout(() => inputRef.current?.select(), 0);
    }
  };

  const commitDraft = () => {
    const parsed = parseFloat(draft);
    if (Number.isFinite(parsed)) {
      onStartScrub?.();
      onChange(clampAndRound(parsed));
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-2.5 min-h-[28px]">
      <span className="text-[11px] text-[#A5ADAD] truncate select-none">{label}</span>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-[84px] h-[26px] px-2 bg-[#101114] border border-[#b9c9d1]/70 rounded text-right font-mono text-[11px] tabular-nums text-[#FAF9F6] outline-none shadow-inner"
        />
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag horizontally to scrub (hold Shift for fine control) · Click to type exact value"
          className={`w-[84px] h-[26px] px-2 flex items-center justify-end rounded font-mono text-[11px] tabular-nums select-none transition-colors border ${
            disabled
              ? 'opacity-45 cursor-not-allowed bg-[#181A1F] border-[#2A2E37]'
              : scrubbing
              ? 'bg-[#282C35] border-[#b9c9d1]/70 text-[#FAF9F6] cursor-ew-resize'
              : 'bg-[#20232A] border-[#2A2E37] hover:border-[#46505C] hover:bg-[#242830] text-[#dce4e4] cursor-ew-resize'
          }`}
        >
          <span>{value.toFixed(precision)}</span>
          {unit && <span className="text-[#6C7378] ml-0.5">{unit}</span>}
        </div>
      )}
    </div>
  );
};
