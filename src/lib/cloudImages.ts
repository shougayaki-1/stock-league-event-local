import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import type { UploadMetadata } from "firebase/storage";
import { storage } from "./firebase";
import { formatVideoBytes } from "./cloudVideos";

export interface CloudImageAsset {
  storagePath: string;
  downloadUrl: string;
  updatedAt: number;
  width: number;
  height: number;
  contentType: string;
  size: number;
  fileName: string;
}

interface CachedCloudImage {
  asset: CloudImageAsset;
  blob: Blob;
  lastAccessed: number;
}

export interface CloudImageCacheResult {
  url: string;
  source: "cache" | "network" | "stale-cache" | "direct-url";
  asset: CloudImageAsset;
}

export type CloudImageDownloadStage = "checking-cache" | "cache-hit" | "downloading" | "saving-cache" | "complete" | "failed";

export interface CloudImageDownloadProgress {
  stage: CloudImageDownloadStage;
  progress: number;
  message: string;
  bytesTransferred?: number;
  totalBytes?: number;
}

const MAX_IMAGE_CACHE_BYTES = 512 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1920;

export const safeImageStorageFileName = (fileName: string) => {
  const cleaned = fileName
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "image.png";
};

export const createImageAssetId = () => crypto.randomUUID();

export const formatImageBytes = formatVideoBytes;

const loadImage = (file: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした。"));
    };
    image.src = url;
  });
};

const canvasToBlob = (canvas: HTMLCanvasElement, contentType: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("画像の変換に失敗しました。")), contentType, 0.92);
  });
};

export const resizeImageIfNeeded = async (file: File | Blob, fileName: string, contentType?: string) => {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const outputType = contentType || (file instanceof File ? file.type : "") || "image/png";

  if (scale >= 1 && file instanceof File) {
    return { blob: file, width, height, contentType: file.type || outputType, fileName };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像変換用のCanvasを作成できませんでした。");
  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, outputType);
  return { blob, width, height, contentType: outputType, fileName };
};

export const uploadCloudImage = async (
  file: File | Blob,
  storagePath: string,
  fileName: string,
  onProgress?: (progress: number) => void
): Promise<CloudImageAsset> => {
  const prepared = await resizeImageIfNeeded(file, fileName, file instanceof File ? file.type : file.type || "image/png");
  if (prepared.blob.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error(`画像サイズが上限（${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)}MB）を超えています。`);
  }

  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, storagePath);
    const metadata: UploadMetadata = { contentType: prepared.contentType || "image/png" };
    const task = uploadBytesResumable(storageRef, prepared.blob, metadata);
    task.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            storagePath,
            downloadUrl,
            updatedAt: Date.now(),
            width: prepared.width,
            height: prepared.height,
            contentType: prepared.contentType || "image/png",
            size: prepared.blob.size,
            fileName,
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};

const deleteDatabase = (dbName: string): Promise<void> => new Promise((resolve, reject) => {
  const req = indexedDB.deleteDatabase(dbName);
  req.onsuccess = () => resolve();
  req.onerror = () => reject(req.error);
  req.onblocked = () => resolve();
});

const openDatabase = (dbName: string, storeName: string, version?: number): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const req = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName);
  req.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
  };
  req.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
  req.onerror = () => reject(req.error);
});

const initDB = async (dbName: string, storeName: string, retry = true): Promise<IDBDatabase> => {
  const db = await openDatabase(dbName, storeName);
  if (db.objectStoreNames.contains(storeName)) return db;
  const nextVersion = db.version + 1;
  db.close();
  try {
    return await openDatabase(dbName, storeName, nextVersion);
  } catch (error) {
    if (!retry) throw error;
    await deleteDatabase(dbName);
    return initDB(dbName, storeName, false);
  }
};

const withStoreRepair = async <T>(dbName: string, operation: () => Promise<T>) => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
    await deleteDatabase(dbName);
    return operation();
  }
};

const getCachedImage = async (dbName: string, storeName: string, key: string): Promise<CachedCloudImage | undefined> => {
  return withStoreRepair(dbName, async () => {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as CachedCloudImage | undefined);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  });
};

const saveCachedImage = async (dbName: string, storeName: string, key: string, value: CachedCloudImage): Promise<void> => {
  return withStoreRepair(dbName, async () => {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
};

const touchCachedImage = async (dbName: string, storeName: string, key: string): Promise<void> => {
  return withStoreRepair(dbName, async () => {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const value = req.result as CachedCloudImage | undefined;
        if (value) store.put({ ...value, lastAccessed: Date.now() }, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
};

const getAllCachedImages = async (dbName: string, storeName: string): Promise<Array<{ key: string; value: CachedCloudImage }>> => {
  const db = await initDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const entries: Array<{ key: string; value: CachedCloudImage }> = [];
    const req = tx.objectStore(storeName).openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) {
        resolve(entries);
        return;
      }
      entries.push({ key: cursor.key as string, value: cursor.value as CachedCloudImage });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
};

const deleteCachedImages = async (dbName: string, storeName: string, keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  const db = await initDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    keys.forEach(key => store.delete(key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const pruneCloudImageCache = async (dbName: string, storeName: string, activeKeys: string[]): Promise<void> => {
  const activeKeySet = new Set(activeKeys);
  const entries = await getAllCachedImages(dbName, storeName);
  const staleKeys = entries.filter(entry => !activeKeySet.has(entry.key)).map(entry => entry.key);
  const liveEntries = entries.filter(entry => activeKeySet.has(entry.key));
  let totalBytes = liveEntries.reduce((sum, entry) => sum + (entry.value.blob?.size || 0), 0);
  const evictKeys: string[] = [];
  for (const entry of [...liveEntries].sort((a, b) => (a.value.lastAccessed || 0) - (b.value.lastAccessed || 0))) {
    if (totalBytes <= MAX_IMAGE_CACHE_BYTES) break;
    evictKeys.push(entry.key);
    totalBytes -= entry.value.blob?.size || 0;
  }
  await deleteCachedImages(dbName, storeName, [...staleKeys, ...evictKeys]);
};

const downloadImageBlob = async (asset: CloudImageAsset): Promise<Blob> => {
  const downloadUrl = asset.storagePath ? await getDownloadURL(ref(storage, asset.storagePath)) : asset.downloadUrl;
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`画像の取得に失敗しました。HTTP ${response.status}`);
  return response.blob();
};

export const getCloudImageObjectUrl = async (
  dbName: string,
  storeName: string,
  key: string,
  asset?: CloudImageAsset | null,
  onProgress?: (progress: CloudImageDownloadProgress) => void
): Promise<CloudImageCacheResult | null> => {
  if (!asset?.storagePath) return null;
  onProgress?.({ stage: "checking-cache", progress: 5, message: "端末キャッシュを確認中" });
  const cached = await getCachedImage(dbName, storeName, key);
  if (cached?.asset.updatedAt === asset.updatedAt && cached.blob) {
    await touchCachedImage(dbName, storeName, key);
    onProgress?.({ stage: "cache-hit", progress: 100, message: "端末キャッシュから表示できます", bytesTransferred: cached.blob.size, totalBytes: cached.blob.size });
    return { url: URL.createObjectURL(cached.blob), source: "cache", asset };
  }

  try {
    onProgress?.({ stage: "downloading", progress: 20, message: "クラウドから取得中", totalBytes: asset.size });
    const blob = await downloadImageBlob(asset);
    onProgress?.({ stage: "saving-cache", progress: 80, message: "端末へ保存中", bytesTransferred: blob.size, totalBytes: blob.size });
    await saveCachedImage(dbName, storeName, key, { asset, blob, lastAccessed: Date.now() });
    onProgress?.({ stage: "complete", progress: 100, message: "取得完了", bytesTransferred: blob.size, totalBytes: blob.size });
    return { url: URL.createObjectURL(blob), source: "network", asset };
  } catch (error) {
    console.error("画像キャッシュ同期エラー", error);
    if (cached?.blob) {
      await touchCachedImage(dbName, storeName, key);
      onProgress?.({ stage: "complete", progress: 100, message: "古い端末キャッシュを使用", bytesTransferred: cached.blob.size, totalBytes: cached.blob.size });
      return { url: URL.createObjectURL(cached.blob), source: "stale-cache", asset: cached.asset };
    }
    const fallbackUrl = asset.downloadUrl || (asset.storagePath ? await getDownloadURL(ref(storage, asset.storagePath)).catch(() => "") : "");
    if (fallbackUrl) {
      onProgress?.({ stage: "complete", progress: 100, message: "クラウド直接表示" });
      return { url: fallbackUrl, source: "direct-url", asset };
    }
    onProgress?.({ stage: "failed", progress: 0, message: error instanceof Error ? error.message : "画像を取得できませんでした。" });
    return null;
  }
};
