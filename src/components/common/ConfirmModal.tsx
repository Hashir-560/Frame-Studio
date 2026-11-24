import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-[2px] p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#151820] border border-white/[0.08] rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.75)] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#181B24]">
              <div className="flex items-center gap-2">
                {danger && <AlertTriangle className="w-4 h-4 text-[#ffb4ab]" />}
                <h3 className="font-display text-sm font-semibold text-[#FAF9F6]">{title}</h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 text-[#9BA3AB] hover:text-[#FAF9F6] rounded-lg hover:bg-white/[0.06] transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 py-4 text-xs text-[#9BA3AB] leading-relaxed">{description}</p>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06] bg-[#12141B]">
              <button
                type="button"
                onClick={onCancel}
                className="px-3.5 py-1.5 text-xs font-medium text-[#dce4e4] bg-[#1E222D] hover:bg-[#272C3A] rounded-xl transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap ${
                  danger
                    ? 'bg-[#93000a] hover:bg-[#b3000d] text-[#ffdad6] border border-[#ffb4ab]/30'
                    : 'bg-[#0284C7] hover:bg-[#0EA5E9] text-[#FAF9F6]'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
