import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks: number[];
  width: number;
  height: number;
  sourceInRatio: number;
  sourceOutRatio: number;
  color?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = React.memo(
  ({ peaks, width, height, sourceInRatio, sourceOutRatio, color = 'rgba(185, 201, 209, 0.55)' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || width <= 2 || height <= 2 || peaks.length === 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const drawW = Math.min(4096, Math.max(4, Math.floor(width)));
      canvas.width = drawW * dpr;
      canvas.height = height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, drawW, height);
      ctx.fillStyle = color;

      const startIdx = Math.max(0, Math.floor(sourceInRatio * peaks.length));
      const endIdx = Math.min(peaks.length, Math.max(startIdx + 1, Math.ceil(sourceOutRatio * peaks.length)));
      const sliceLen = endIdx - startIdx;

      const barStep = 3;
      const barWidth = 1.5;
      const midY = height / 2;

      for (let x = 0; x < drawW; x += barStep) {
        const normPos = x / drawW;
        const idx = Math.min(peaks.length - 1, startIdx + Math.floor(normPos * sliceLen));
        const amp = Math.max(0.08, peaks[idx] ?? 0.1);
        const barH = amp * (height * 0.78);
        ctx.fillRect(x, midY - barH / 2, barWidth, barH);
      }
    }, [peaks, width, height, sourceInRatio, sourceOutRatio, color]);

    return (
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{ width, height }}
      />
    );
  }
);
