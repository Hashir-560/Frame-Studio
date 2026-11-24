import React, { useCallback, useEffect, useRef, useState } from 'react';

interface StudioScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  resetKey?: string | number;
  ariaLabel?: string;
}

interface ScrollMetrics {
  canScroll: boolean;
  thumbHeight: number;
  thumbTop: number;
  maxScroll: number;
  maxThumbTop: number;
  scrollTop: number;
}

const MIN_THUMB_HEIGHT = 28;
const TRACK_PADDING_Y = 4;

export const StudioScrollArea: React.FC<StudioScrollAreaProps> = ({
  children,
  className = '',
  contentClassName = '',
  resetKey,
  ariaLabel = 'Scrollable panel content',
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollHideTimerRef = useRef<number | null>(null);

  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [metrics, setMetrics] = useState<ScrollMetrics>({
    canScroll: false,
    thumbHeight: 0,
    thumbTop: 0,
    maxScroll: 0,
    maxThumbTop: 0,
    scrollTop: 0,
  });

  const dragStateRef = useRef<{
    startY: number;
    startScrollTop: number;
    maxScroll: number;
    maxThumbTop: number;
  } | null>(null);

  const measure = useCallback(() => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp) return;

    const clientHeight = vp.clientHeight;
    const scrollHeight = vp.scrollHeight;
    const scrollTop = Math.round(vp.scrollTop);
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const canScroll = clientHeight > 0 && maxScroll > 1;

    if (!canScroll) {
      setMetrics((prev) =>
        prev.canScroll
          ? {
              canScroll: false,
              thumbHeight: 0,
              thumbTop: 0,
              maxScroll: 0,
              maxThumbTop: 0,
              scrollTop: 0,
            }
          : prev
      );
      return;
    }

    const rawTrackH = track ? track.clientHeight : clientHeight;
    const trackH = Math.max(24, rawTrackH - TRACK_PADDING_Y * 2);
    const thumbHeight = Math.min(
      trackH,
      Math.max(MIN_THUMB_HEIGHT, Math.round((clientHeight / scrollHeight) * trackH))
    );
    const maxThumbTop = Math.max(0, trackH - thumbHeight);
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, vp.scrollTop / maxScroll)) : 0;
    const thumbTop = Math.round(ratio * maxThumbTop);

    setMetrics((prev) => {
      if (
        prev.canScroll === canScroll &&
        prev.thumbHeight === thumbHeight &&
        prev.thumbTop === thumbTop &&
        prev.maxScroll === maxScroll &&
        prev.maxThumbTop === maxThumbTop &&
        prev.scrollTop === scrollTop
      ) {
        return prev;
      }
      return { canScroll, thumbHeight, thumbTop, maxScroll, maxThumbTop, scrollTop };
    });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (vp && resetKey !== undefined) {
      vp.scrollTop = 0;
    }
    const raf = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(raf);
  }, [resetKey, measure]);

  useEffect(() => {
    const vp = viewportRef.current;
    const content = contentRef.current;
    if (!vp) return;

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(vp);
    if (content) ro.observe(content);

    return () => {
      ro.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(scrollHideTimerRef.current);
      }
    };
  }, []);

  const bumpScrollingState = useCallback(() => {
    setIsScrolling(true);
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current);
    }
    scrollHideTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false);
    }, 900);
  }, []);

  const handleViewportScroll = useCallback(() => {
    measure();
    bumpScrollingState();
  }, [measure, bumpScrollingState]);

  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp || !metrics.canScroll) return;
    e.preventDefault();
    e.stopPropagation();

    dragStateRef.current = {
      startY: e.clientY,
      startScrollTop: vp.scrollTop,
      maxScroll: metrics.maxScroll,
      maxThumbTop: metrics.maxThumbTop,
    };
    setIsDragging(true);
    setIsScrolling(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const ds = dragStateRef.current;
      const viewport = viewportRef.current;
      if (!ds || !viewport) return;
      const deltaY = moveEvent.clientY - ds.startY;
      const scrollDelta = ds.maxThumbTop > 0 ? (deltaY / ds.maxThumbTop) * ds.maxScroll : 0;
      viewport.scrollTop = Math.max(0, Math.min(ds.maxScroll, ds.startScrollTop + scrollDelta));
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
      setIsDragging(false);
      bumpScrollingState();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track || !metrics.canScroll) return;
    if (e.target !== track) return;
    e.preventDefault();

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top - TRACK_PADDING_Y;
    const targetThumbTop = Math.max(
      0,
      Math.min(metrics.maxThumbTop, clickY - metrics.thumbHeight / 2)
    );
    const nextScrollTop =
      metrics.maxThumbTop > 0 ? (targetThumbTop / metrics.maxThumbTop) * metrics.maxScroll : 0;
    vp.scrollTo({ top: nextScrollTop, behavior: 'smooth' });
    bumpScrollingState();
  };

  const handleTrackWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp || !metrics.canScroll) return;
    vp.scrollTop += e.deltaY;
    bumpScrollingState();
  };

  const thumbVisible = metrics.canScroll;
  const thumbActive = isHovered || isScrolling || isDragging;

  return (
    <div
      className={`flex-1 min-h-0 flex relative overflow-hidden ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={viewportRef}
        onScroll={handleViewportScroll}
        aria-label={ariaLabel}
        className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden no-scrollbar"
      >
        <div ref={contentRef} className={contentClassName}>
          {children}
        </div>
      </div>

      {/* Dedicated slim right-edge scrollbar track (never overlaps controls) */}
      <div
        ref={trackRef}
        role="scrollbar"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.round(metrics.maxScroll)}
        aria-valuenow={metrics.scrollTop}
        onPointerDown={handleTrackPointerDown}
        onWheel={handleTrackWheel}
        className={`w-[10px] shrink-0 h-full relative select-none transition-colors duration-150 ${
          metrics.canScroll
            ? 'bg-[#101217]/80 border-l border-white/[0.04] cursor-pointer'
            : 'bg-transparent'
        }`}
      >
        {thumbVisible && (
          <div
            onPointerDown={handleThumbPointerDown}
            style={{
              height: `${metrics.thumbHeight}px`,
              transform: `translateY(${TRACK_PADDING_Y + metrics.thumbTop}px)`,
            }}
            className={`mx-auto rounded-full transition-[width,background-color,opacity] duration-150 ${
              isDragging
                ? 'w-[6px] bg-[#38BDF8] opacity-100 shadow-[0_0_8px_rgba(56,189,248,0.45)] cursor-grabbing'
                : thumbActive
                ? 'w-[6px] bg-white/[0.38] hover:bg-[#38BDF8]/80 opacity-100 cursor-grab'
                : 'w-[4px] bg-white/[0.20] opacity-65 cursor-grab'
            }`}
          />
        )}
      </div>
    </div>
  );
};
