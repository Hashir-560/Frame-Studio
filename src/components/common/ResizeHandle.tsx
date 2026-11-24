import React, { useRef, useState } from 'react';

interface ResizeHandleProps {
  direction: 'vertical' | 'horizontal';
  onDragStart?: () => void;
  onDragDelta: (deltaPx: number) => void;
  onDragEnd?: () => void;
  onDoubleClick?: () => void;
  label?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  onDragStart,
  onDragDelta,
  onDragEnd,
  onDoubleClick,
  label,
}) => {
  const [dragging, setDragging] = useState(false);
  const lastPosRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    onDragStart?.();
    lastPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';

    const onMove = (ev: PointerEvent) => {
      const current = direction === 'vertical' ? ev.clientX : ev.clientY;
      const delta = current - lastPosRef.current;
      if (delta !== 0) {
        lastPosRef.current = current;
        onDragDelta(delta);
      }
    };

    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      onDragEnd?.();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (direction === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label ?? 'Resize panel'}
        title={`${label ?? 'Drag to resize'} · Double-click to reset`}
        onPointerDown={handlePointerDown}
        onDoubleClick={onDoubleClick}
        className="group relative w-[5px] -mx-[2px] z-30 shrink-0 cursor-col-resize flex items-center justify-center select-none"
      >
        <div
          className={`w-px h-full transition-colors duration-150 ${
            dragging
              ? 'bg-[#b9c9d1] w-[2px] shadow-[0_0_8px_rgba(185,201,209,0.45)]'
              : 'bg-[#2A2E37] group-hover:bg-[#516168] group-hover:w-[2px]'
          }`}
        />
        <div
          className={`absolute w-[3px] h-8 rounded-full transition-opacity duration-150 ${
            dragging ? 'opacity-100 bg-[#FAF9F6]' : 'opacity-0 group-hover:opacity-100 bg-[#b9c9d1]'
          }`}
        />
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label ?? 'Resize timeline height'}
      title={`${label ?? 'Drag to resize'} · Double-click to reset`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onDoubleClick}
      className="group relative h-[5px] -my-[2px] z-30 shrink-0 cursor-row-resize flex items-center justify-center select-none"
    >
      <div
        className={`h-px w-full transition-colors duration-150 ${
          dragging
            ? 'bg-[#b9c9d1] h-[2px] shadow-[0_0_8px_rgba(185,201,209,0.45)]'
            : 'bg-[#2A2E37] group-hover:bg-[#516168] group-hover:h-[2px]'
        }`}
      />
      <div
        className={`absolute h-[3px] w-10 rounded-full transition-opacity duration-150 ${
          dragging ? 'opacity-100 bg-[#FAF9F6]' : 'opacity-0 group-hover:opacity-100 bg-[#b9c9d1]'
        }`}
      />
    </div>
  );
};
