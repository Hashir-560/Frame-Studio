import {
  DEFAULT_DASHBOARD_SETTINGS,
  type DashboardSettings,
  type MediaAssetRecord,
  type Project,
} from '../types/editor';

const DB_NAME = 'framestudio_nle_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_MEDIA = 'media';
const SETTINGS_STORAGE_KEY = 'framestudio:dashboard-settings:v1';

export interface ProjectMediaStats {
  mediaCount: number;
  totalBytes: number;
  thumbnailDataUrl?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
        mediaStore.createIndex('projectId', 'projectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const store = tx.objectStore(STORE_PROJECTS);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as Project[]) || [];
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const req = tx.objectStore(STORE_PROJECTS).get(id);
    req.onsuccess = () => resolve((req.result as Project) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProjectRecord(project: Project): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProjectRecord(projectId: string): Promise<void> {
  const db = await openDB();
  const mediaList = await getProjectMediaRecords(projectId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROJECTS, STORE_MEDIA], 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(projectId);
    const mediaStore = tx.objectStore(STORE_MEDIA);
    for (const item of mediaList) {
      mediaStore.delete(item.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveMediaRecord(record: MediaAssetRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMediaRecordById(mediaId: string): Promise<MediaAssetRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const req = tx.objectStore(STORE_MEDIA).get(mediaId);
    req.onsuccess = () => resolve((req.result as MediaAssetRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectMediaRecords(projectId: string): Promise<MediaAssetRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const index = tx.objectStore(STORE_MEDIA).index('projectId');
    const req = index.getAll(IDBKeyRange.only(projectId));
    req.onsuccess = () => {
      const items = (req.result as MediaAssetRecord[]) || [];
      items.sort((a, b) => a.createdAt - b.createdAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getProjectMediaStatsMap(): Promise<Record<string, ProjectMediaStats>> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const stats: Record<string, ProjectMediaStats> = {};
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const store = tx.objectStore(STORE_MEDIA);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(stats);
        return;
      }
      const rec = cursor.value as MediaAssetRecord;
      if (rec && rec.projectId) {
        const entry = stats[rec.projectId] ?? { mediaCount: 0, totalBytes: 0 };
        entry.mediaCount += 1;
        entry.totalBytes += (rec.size || 0) + (rec.proxyBlob?.size || 0);
        if (!entry.thumbnailDataUrl && rec.thumbnailDataUrl) {
          entry.thumbnailDataUrl = rec.thumbnailDataUrl;
        }
        stats[rec.projectId] = entry;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMediaRecord(mediaId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(mediaId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function duplicateProjectMediaRecords(
  sourceProjectId: string,
  targetProjectId: string
): Promise<Map<string, string>> {
  const records = await getProjectMediaRecords(sourceProjectId);
  const idMap = new Map<string, string>();
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    const store = tx.objectStore(STORE_MEDIA);
    for (const rec of records) {
      const newId = `media_${crypto.randomUUID().slice(0, 8)}`;
      idMap.set(rec.id, newId);
      store.put({
        ...rec,
        id: newId,
        projectId: targetProjectId,
        createdAt: Date.now(),
      });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return idMap;
}

export function loadDashboardSettings(): DashboardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_DASHBOARD_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    return {
      defaultTier: parsed.defaultTier ?? DEFAULT_DASHBOARD_SETTINGS.defaultTier,
      defaultRatio: parsed.defaultRatio ?? DEFAULT_DASHBOARD_SETTINGS.defaultRatio,
      defaultFps: parsed.defaultFps ?? DEFAULT_DASHBOARD_SETTINGS.defaultFps,
      defaultProxyMode: Boolean(parsed.defaultProxyMode),
      defaultViewMode: parsed.defaultViewMode === 'list' ? 'list' : 'grid',
    };
  } catch {
    return DEFAULT_DASHBOARD_SETTINGS;
  }
}

export function saveDashboardSettings(settings: DashboardSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
