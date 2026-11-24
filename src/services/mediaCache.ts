import type { MediaAsset, MediaAssetRecord } from '../types/editor';

class MediaCacheService {
  private urlMap = new Map<string, string>();
  private proxyUrlMap = new Map<string, string>();

  hydrateRecord(record: MediaAssetRecord): MediaAsset {
    const existing = this.urlMap.get(record.id);
    const objectUrl = existing ?? URL.createObjectURL(record.blob);
    if (!existing) {
      this.urlMap.set(record.id, objectUrl);
    }

    let proxyObjectUrl = this.proxyUrlMap.get(record.id);
    if (record.proxyBlob && !proxyObjectUrl) {
      proxyObjectUrl = URL.createObjectURL(record.proxyBlob);
      this.proxyUrlMap.set(record.id, proxyObjectUrl);
    }

    const { blob: _blob, proxyBlob: _proxyBlob, ...rest } = record;
    return {
      ...rest,
      objectUrl,
      proxyObjectUrl,
      hasProxy: Boolean(record.proxyBlob),
    };
  }

  revoke(mediaId: string): void {
    const url = this.urlMap.get(mediaId);
    if (url) {
      URL.revokeObjectURL(url);
      this.urlMap.delete(mediaId);
    }
    const pUrl = this.proxyUrlMap.get(mediaId);
    if (pUrl) {
      URL.revokeObjectURL(pUrl);
      this.proxyUrlMap.delete(mediaId);
    }
  }

  revokeAll(): void {
    for (const url of this.urlMap.values()) {
      URL.revokeObjectURL(url);
    }
    for (const pUrl of this.proxyUrlMap.values()) {
      URL.revokeObjectURL(pUrl);
    }
    this.urlMap.clear();
    this.proxyUrlMap.clear();
  }
}

export const mediaCache = new MediaCacheService();
