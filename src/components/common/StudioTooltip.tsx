import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';

interface StudioTooltipProps {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}

export const StudioTooltip: React.FC<StudioTooltipProps> = ({
  label,
  shortcut,
  side = 'bottom',
  children,
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);

  const show = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left + rect.width / 2;
      if (side === 'top') {
        top = rect.top - 6;
      } else if (side === 'left') {
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
      } else if (side === 'right') {
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
      }
      setCoords({ top, left });
      setOpen(true);
    }, 340);
  };

  const hide = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const transformClass =
    side === 'top'
      ? '-translate-x-1/2 -translate-y-full'
      : side === 'left'
      ? '-translate-x-full -translate-y-1/2'
      : side === 'right'
      ? '-translate-y-1/2'
      : '-translate-x-1/2';

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onPointerDown={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex items-center"
      >
        {children}
      </span>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                style={{ top: coords.top, left: coords.left }}
                className={`fixed z-[80] pointer-events-none px-2 py-1 rounded bg-[#20232A] border border-[#343A46] shadow-xl flex items-center gap-2 whitespace-nowrap ${transformClass}`}
              >
                <span className="text-[11px] font-medium text-[#FAF9F6]">{label}</span>
                {shortcut && (
                  <kbd className="px-1 py-0.2 bg-[#101114] border border-[#343A46] rounded font-mono text-[9px] text-[#b9c9d1]">
                    {shortcut}
                  </kbd>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
};
