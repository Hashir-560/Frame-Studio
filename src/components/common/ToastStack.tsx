import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useEditorStore } from '../../stores/useEditorStore';

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useEditorStore();

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none max-w-sm">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon =
            toast.variant === 'success'
              ? CheckCircle2
              : toast.variant === 'error' || toast.variant === 'warning'
              ? AlertCircle
              : Info;
          const borderColor =
            toast.variant === 'error'
              ? 'border-[#ffb4ab]/45'
              : toast.variant === 'warning'
              ? 'border-amber-400/45'
              : toast.variant === 'success'
              ? 'border-[#b9c9d1]/45'
              : 'border-[#343A46]';

          const iconColor =
            toast.variant === 'error'
              ? 'text-[#ffb4ab]'
              : toast.variant === 'warning'
              ? 'text-amber-300'
              : 'text-[#b9c9d1]';

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex items-center gap-2.5 px-3 py-2 bg-[#1D2027]/95 backdrop-blur-sm border ${borderColor} rounded-md shadow-[0_12px_32px_rgba(0,0,0,0.5)] text-xs text-[#FAF9F6]`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="p-0.5 text-[#A5ADAD] hover:text-[#FAF9F6] rounded hover:bg-[#2A2E37] transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
