import React, { useEffect, useState } from 'react';
import { filmstripCache, pickFilmstripFrame } from '../../features/media-import/filmstripCache';
import type { Clip, MediaAsset } from '../../types/editor';

interface ClipFilmstripProps {
  clip: Clip;
  asset: MediaAsset;
  widthPx: number;
  heightPx: number;
}

export const ClipFilmstrip: React.FC<ClipFilmstripProps> = React.memo(
  ({ clip, asset, widthPx, heightPx }) => {
    const [frames, setFrames] = useState(() => filmstripCache.getFrames(asset.id));

    useEffect(() => {
      if (clip.type !== 'video') return;
      const sourceUrl = asset.proxyObjectUrl || asset.objectUrl;
      filmstripCache.ensureFrames(asset.id, sourceUrl, asset.duration);
      setFrames(filmstripCache.getFrames(asset.id));
      return filmstripCache.subscribe(asset.id, () => {
        setFrames([...filmstripCache.getFrames(asset.id)]);
      });
    }, [clip.type, asset.id, asset.objectUrl, asset.proxyObjectUrl, asset.duration]);

    if (widthPx < 20) return null;

    const tileW = Math.max(44, Math.min(76, Math.round(heightPx * 1.35)));
    const tileCount = Math.max(1, Math.min(72, Math.ceil(widthPx / tileW)));
    const exactTileWidthPct = 100 / tileCount;

    if (clip.type === 'image') {
      const thumb = asset.thumbnailDataUrl || asset.objectUrl;
      if (!thumb) return null;
      return (
        <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-80">
          {Array.from({ length: tileCount }).map((_, idx) => (
            <img
              key={idx}
              src={thumb}
              alt=""
              draggable={false}
              style={{ width: `${exactTileWidthPct}%` }}
              className="h-full object-cover shrink-0 border-r border-black/20 last:border-r-0"
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/30" />
        </div>
      );
    }

    if (clip.type !== 'video') return null;

    const sourceSpan = Math.max(0.05, clip.sourceOut - clip.sourceIn);

    return (
      <div className="absolute inset-0 flex overflow-hidden pointer-events-none opacity-90">
        {Array.from({ length: tileCount }).map((_, idx) => {
          const norm = (idx + 0.5) / tileCount;
          const mappedNorm = clip.reversed ? 1 - norm : norm;
          const sampleTime = clip.sourceIn + mappedNorm * sourceSpan;
          const src = pickFilmstripFrame(frames, sampleTime, asset.thumbnailDataUrl);

          return src ? (
            <img
              key={idx}
              src={src}
              alt=""
              draggable={false}
              style={{ width: `${exactTileWidthPct}%` }}
              className="h-full object-cover shrink-0 border-r border-black/30 last:border-r-0"
            />
          ) : (
            <div
              key={idx}
              style={{ width: `${exactTileWidthPct}%` }}
              className="h-full shrink-0 bg-[#1B2B3A] border-r border-black/25 last:border-r-0"
            />
          );
        })}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/35" />
      </div>
    );
  }
);
