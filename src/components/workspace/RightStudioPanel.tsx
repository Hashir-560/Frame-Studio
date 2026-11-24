import React from 'react';
import { motion } from 'motion/react';
import { FolderOpen, PanelRightClose, SlidersHorizontal } from 'lucide-react';
import { useEditorStore } from '../../stores/useEditorStore';
import { StudioTooltip } from '../common/StudioTooltip';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { MediaLibraryPanel } from '../media/MediaLibraryPanel';

interface RightStudioPanelProps {
  onCollapse?: () => void;
}

export const RightStudioPanel: React.FC<RightStudioPanelProps> = ({ onCollapse }) => {
  const { rightPanelTab, setRightPanelTab, selectedClip } = useEditorStore();

  return (
    <aside className="w-full h-full bg-[#14161B] border-l border-white/[0.06] flex flex-col overflow-hidden select-none">
      {/* Top Studio Panel Switcher: Resources (Media/Audio/Text/FX) vs Inspector */}
      <div className="h-10 shrink-0 px-2.5 bg-[#121419] border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex-1 grid grid-cols-2 bg-[#1B1E26] p-0.5 rounded-lg ring-1 ring-white/[0.06] max-w-[280px]">
          <button
            type="button"
            onClick={() => setRightPanelTab('resources')}
            className={`relative py-1 px-2.5 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              rightPanelTab === 'resources'
                ? 'text-[#FAF9F6]'
                : 'text-[#8E96A0] hover:text-[#dce4e4]'
            }`}
          >
            {rightPanelTab === 'resources' && (
              <motion.span
                layoutId="rightStudioTopTab"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className="absolute inset-0 bg-[#2A303C] ring-1 ring-white/[0.1] rounded-md shadow-xs"
              />
            )}
            <FolderOpen
              className={`relative z-10 w-3.5 h-3.5 ${
                rightPanelTab === 'resources' ? 'text-[#38BDF8]' : 'opacity-80'
              }`}
            />
            <span className="relative z-10">Resources</span>
          </button>

          <button
            type="button"
            onClick={() => setRightPanelTab('inspector')}
            className={`relative py-1 px-2.5 rounded-md text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              rightPanelTab === 'inspector'
                ? 'text-[#FAF9F6]'
                : 'text-[#8E96A0] hover:text-[#dce4e4]'
            }`}
          >
            {rightPanelTab === 'inspector' && (
              <motion.span
                layoutId="rightStudioTopTab"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className="absolute inset-0 bg-[#2A303C] ring-1 ring-white/[0.1] rounded-md shadow-xs"
              />
            )}
            <SlidersHorizontal
              className={`relative z-10 w-3.5 h-3.5 ${
                rightPanelTab === 'inspector' ? 'text-[#38BDF8]' : 'opacity-80'
              }`}
            />
            <span className="relative z-10">Inspector</span>
            {selectedClip && (
              <span
                className="relative z-10 w-1.5 h-1.5 rounded-full bg-[#38BDF8] shrink-0"
                title={`Active selection: ${selectedClip.name}`}
              />
            )}
          </button>
        </div>

        {onCollapse && (
          <StudioTooltip label="Collapse Studio Panel" side="bottom">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse Studio Panel"
              className="p-1.5 rounded-full text-[#7B838D] hover:text-[#FAF9F6] hover:bg-white/[0.06] transition-colors shrink-0"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </StudioTooltip>
        )}
      </div>

      {/* Keep both panels mounted via CSS to preserve search filters, scroll state, and clip selections */}
      <div
        className={
          rightPanelTab === 'resources'
            ? 'flex-1 flex flex-col min-h-0 overflow-hidden'
            : 'hidden'
        }
      >
        <MediaLibraryPanel />
      </div>

      <div
        className={
          rightPanelTab === 'inspector'
            ? 'flex-1 flex flex-col min-h-0 overflow-hidden'
            : 'hidden'
        }
      >
        <InspectorPanel />
      </div>
    </aside>
  );
};
