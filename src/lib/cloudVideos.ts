import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import type { UploadMetadata } from "firebase/storage";
import { storage } from "./firebase";

export interface CloudVideoAsset {
  storagePath: string;
  downloadUrl: string;
  version: string;
  updatedAt: number;
  contentType: string;
  size: number;
  fileName: string;
  optimizedAsset?: OptimizedCloudVideoAsset;
}

export type OptimizedVideoStatus = "processing" | "ready" | "failed";

export interface OptimizedCloudVideoAsset {
  storagePath?: string;
  downloadUrl?: string;
  version?: string;
  updatedAt?: number;
  contentType?: string;
  size?: number;
  fileName?: string;
  status: OptimizedVideoStatus;
  errorMessage?: string;
}

export interface NamedCloudVideoAsset {
  name: string;
  videoAsset: CloudVideoAsset;
}

interface CachedCloudVideo {
  asset: CloudVideoAsset | OptimizedCloudVideoAsset;
  blob: Blob;
  lastAccessed: number;
}

export interface CloudVideoCacheResult {
  url: string;
  source: "cache" | "network" | "stale-cache" | "direct-url";
  asset: CloudVideoAsset | OptimizedCloudVideoAsset;
  isOptimized: boolean;
}

export type CloudVideoDownloadStage = "checking-cache" | "cache-hit" | "downloading" | "saving-cache" | "complete" | "failed" | "repairing-cache";

export interface CloudVideoDownloadProgress {
  stage: CloudVideoDownloadStage;
  progress: number;
  message: string;
  bytesTransferred?: number;
  totalBytes?: number;
  fileIndex?: number;
  fileCount?: number;
}

export const formatCloudVideoDownloadError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const errorCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = rawMessage.toLowerCase();
  const code = errorCode.toLowerCase();

  if (message.includes("http 403") || message.includes("storage/unauthorized") || code.includes("storage/unauthorized")) {
    return "取得失敗: Storageの読み取り権限を確認してください";
  }
  if (message.includes("http 404") || message.includes("storage/object-not-found") || code.includes("storage/object-not-found")) {
    return "取得失敗: Storage上の動画ファイルが見つかりません";
  }
  if (message.includes("cors") || message.includes("network") || message.includes("failed to fetch") || rawMessage.includes("ネットワーク")) {
    return "取得失敗: Storage CORS設定またはネットワークを確認してください";
  }
  if (message.includes("abort") || rawMessage.includes("中断")) {
    return "取得失敗: 動画の取得が中断されました";
  }
  if (rawMessage) return `取得失敗: ${rawMessage}`;
  return "取得失敗: 原因不明のエラーです";
};

// 端末のストレージ圧迫を防ぐためのキャッシュ総容量の上限（超過分は最終アクセスが古い順に削除）
const MAX_CACHE_BYTES = 3 * 1024 * 1024 * 1024;

// storage.rules 側のアップロード上限と合わせる
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const deleteDatabase = (dbName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
};

const openDatabase = (dbName: string, storeName: string, version?: number): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    req.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
};

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

const isMissingStoreError = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

const withStoreRepair = async <T>(dbName: string, operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isMissingStoreError(error)) throw error;
    await deleteDatabase(dbName);
    return operation();
  }
};

const getCachedVideo = async (dbName: string, storeName: string, key: string): Promise<CachedCloudVideo | undefined> => {
  return withStoreRepair(dbName, async () => {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result as CachedCloudVideo | undefined);
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
  });
};

const saveCachedVideo = async (dbName: string, storeName: string, key: string, value: CachedCloudVideo): Promise<void> => {
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

const touchCachedVideo = async (dbName: string, storeName: string, key: string): Promise<void> => {
  return withStoreRepair(dbName, async () => {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const value = req.result as CachedCloudVideo | undefined;
        if (value) store.put({ ...value, lastAccessed: Date.now() }, key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
};

const getAllCachedEntries = async (dbName: string, storeName: string): Promise<Array<{ key: string; value: CachedCloudVideo }>> => {
  const db = await initDB(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const entries: Array<{ key: string; value: CachedCloudVideo }> = [];
    const req = store.openCursor();
    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        entries.push({ key: cursor.key as string, value: cursor.value as CachedCloudVideo });
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    req.onerror = () => reject(req.error);
  });
};

const deleteCachedVideos = async (dbName: string, storeName: string, keys: string[]): Promise<void> => {
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

/**
 * 使われなくなったキャッシュ（activeKeysに含まれないキー）を削除し、
 * それでも総容量がMAX_CACHE_BYTESを超える場合は最終アクセスが古い順に削除する。
 */
export const pruneCloudVideoCache = async (dbName: string, storeName: string, activeKeys: string[]): Promise<void> => {
  const activeKeySet = new Set(activeKeys);
  const entries = await getAllCachedEntries(dbName, storeName);

  const staleKeys = entries.filter(e => !activeKeySet.has(e.key)).map(e => e.key);
  const liveEntries = entries.filter(e => activeKeySet.has(e.key));

  let totalBytes = liveEntries.reduce((sum, e) => sum + (e.value.blob?.size || 0), 0);
  const sortedByOldest = [...liveEntries].sort((a, b) => (a.value.lastAccessed || 0) - (b.value.lastAccessed || 0));
  const evictKeys: string[] = [];
  for (const entry of sortedByOldest) {
    if (totalBytes <= MAX_CACHE_BYTES) break;
    evictKeys.push(entry.key);
    totalBytes -= entry.value.blob?.size || 0;
  }

  await deleteCachedVideos(dbName, storeName, [...staleKeys, ...evictKeys]);
};

export const safeStorageFileName = (fileName: string) => {
  const fallback = "video.mp4";
  const cleaned = fileName
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
};

export const createCloudVideoVersion = () => Date.now().toString();

export const createVideoAssetId = () => crypto.randomUUID();

export const getPreferredVideoAsset = (asset?: CloudVideoAsset | null): CloudVideoAsset | OptimizedCloudVideoAsset | null => {
  if (!asset) return null;
  const optimized = asset.optimizedAsset;
  if (optimized?.status === "ready" && optimized.storagePath && optimized.version) return optimized;
  return asset;
};

export const getOptimizedStatusLabel = (asset?: CloudVideoAsset | null): string => {
  const optimized = asset?.optimizedAsset;
  if (!asset) return "動画未設定";
  if (!optimized) return "元動画のみ";
  if (optimized.status === "processing") return "軽量版を作成中";
  if (optimized.status === "ready") return "軽量版あり";
  return "軽量化に失敗";
};

export const formatVideoBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
};

const formatProgressMessage = (bytesTransferred?: number, totalBytes?: number) => {
  if (!bytesTransferred && !totalBytes) return "クラウドから取得中";
  if (totalBytes && totalBytes > 0) return `${formatVideoBytes(bytesTransferred)} / ${formatVideoBytes(totalBytes)}`;
  return `${formatVideoBytes(bytesTransferred)} 取得済み`;
};

const encodeContentDispositionFilename = (fileName: string) => encodeURIComponent(fileName)
  .replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const toAsciiDispositionFallback = (fileName: string) => {
  const fallback = safeStorageFileName(fileName).replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return fallback || "video.mp4";
};

const getFileExtension = (fileName?: string | null) => {
  const match = fileName?.match(/\.([A-Za-z0-9]{1,8})$/);
  return match ? `.${match[1]}` : "";
};

const getContentTypeExtension = (contentType?: string | null) => {
  if (!contentType) return "";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("quicktime")) return ".mov";
  if (contentType.includes("x-matroska")) return ".mkv";
  return "";
};

export const buildCloudVideoDownloadFileName = (
  title: string,
  asset?: CloudVideoAsset | OptimizedCloudVideoAsset | null,
  fallbackAsset?: CloudVideoAsset | OptimizedCloudVideoAsset | null
) => {
  const baseName = title.trim().replace(/[/:*?"<>|\\\x00-\x1F]/g, "_").replace(/\s+/g, " ") || "video";
  if (getFileExtension(baseName)) return baseName;

  const extension =
    getFileExtension(asset?.fileName) ||
    getFileExtension(fallbackAsset?.fileName) ||
    getContentTypeExtension(asset?.contentType) ||
    getContentTypeExtension(fallbackAsset?.contentType) ||
    ".mp4";
  return `${baseName}${extension}`;
};

export const buildCloudVideoAttachmentUrl = (downloadUrl: string, fileName: string): string => {
  try {
    const url = new URL(downloadUrl);
    const fallback = toAsciiDispositionFallback(fileName);
    const encoded = encodeContentDispositionFilename(fileName || fallback);
    url.searchParams.set("response-content-disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`);
    return url.toString();
  } catch {
    return downloadUrl;
  }
};

export const downloadCloudVideoBlobWithProgress = async (
  storagePath: string,
  onProgress?: (progress: CloudVideoDownloadProgress) => void
): Promise<Blob> => {
  const downloadUrl = await getDownloadURL(ref(storage, storagePath));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", downloadUrl);
    xhr.responseType = "blob";
    xhr.onprogress = (event) => {
      const totalBytes = event.lengthComputable ? event.total : undefined;
      const progress = totalBytes ? Math.round((event.loaded / totalBytes) * 100) : 35;
      onProgress?.({
        stage: "downloading",
        progress,
        message: formatProgressMessage(event.loaded, totalBytes),
        bytesTransferred: event.loaded,
        totalBytes,
      });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        resolve(xhr.response);
        return;
      }
      reject(new Error(`動画の取得に失敗しました。HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("動画の取得中にネットワークエラーが発生しました。"));
    xhr.onabort = () => reject(new Error("動画の取得が中断されました。"));
    xhr.send();
  });
};

const getDirectCloudVideoUrl = async (asset: CloudVideoAsset | OptimizedCloudVideoAsset): Promise<string | null> => {
  if (!asset.storagePath) return asset.downloadUrl || null;
  try {
    return await getDownloadURL(ref(storage, asset.storagePath));
  } catch (error) {
    console.warn("動画の直接再生URL取得に失敗しました", error);
    return asset.downloadUrl || null;
  }
};

export const getCloudVideoBrowserDownloadUrl = async (
  asset: CloudVideoAsset | OptimizedCloudVideoAsset,
  fileName?: string
): Promise<string | null> => {
  const directUrl = await getDirectCloudVideoUrl(asset);
  if (!directUrl) return null;
  return buildCloudVideoAttachmentUrl(directUrl, fileName || asset.fileName || "video.mp4");
};

export const uploadCloudVideo = (
  file: File,
  storagePath: string,
  version: string,
  onProgress?: (progress: number) => void
): Promise<CloudVideoAsset> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(new Error(`ファイルサイズが上限（${MAX_UPLOAD_BYTES / (1024 * 1024)}MB）を超えています。`));
      return;
    }
    const storageRef = ref(storage, storagePath);
    const metadata: UploadMetadata = { contentType: file.type || "video/mp4" };
    const task = uploadBytesResumable(storageRef, file, metadata);

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
            version,
            updatedAt: Date.now(),
            contentType: file.type || "video/mp4",
            size: file.size,
            fileName: file.name,
            optimizedAsset: {
              status: "processing",
              updatedAt: Date.now(),
            },
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};

export const getCloudVideoObjectUrl = async (
  dbName: string,
  storeName: string,
  key: string,
  asset?: CloudVideoAsset | null,
  onProgress?: (progress: CloudVideoDownloadProgress) => void
): Promise<CloudVideoCacheResult | null> => {
  if (!asset?.storagePath || !asset.version) return null;

  const preferredAsset = getPreferredVideoAsset(asset);
  if (!preferredAsset?.storagePath || !preferredAsset.version) return null;
  const isOptimized = preferredAsset !== asset;

  onProgress?.({ stage: "checking-cache", progress: 5, message: "端末キャッシュを確認中" });
  const cached = await getCachedVideo(dbName, storeName, key);
  if (cached?.asset?.version === preferredAsset.version && cached.blob) {
    await touchCachedVideo(dbName, storeName, key);
    onProgress?.({ stage: "cache-hit", progress: 100, message: "端末キャッシュから再生できます" });
    return { url: URL.createObjectURL(cached.blob), source: "cache", asset: preferredAsset, isOptimized };
  }

  try {
    onProgress?.({ stage: "downloading", progress: 1, message: "クラウドから取得中", totalBytes: preferredAsset.size });
    const blob = await downloadCloudVideoBlobWithProgress(preferredAsset.storagePath, onProgress);
    onProgress?.({ stage: "saving-cache", progress: 80, message: "端末へ保存中" });
    await saveCachedVideo(dbName, storeName, key, { asset: preferredAsset, blob, lastAccessed: Date.now() });
    onProgress?.({ stage: "complete", progress: 100, message: "取得完了" });
    return { url: URL.createObjectURL(blob), source: "network", asset: preferredAsset, isOptimized };
  } catch (error) {
    console.error("動画キャッシュ同期エラー", error);
    let failureMessage = formatCloudVideoDownloadError(error);
    if (isOptimized) {
      try {
        onProgress?.({ stage: "downloading", progress: 1, message: "元動画を取得中", totalBytes: asset.size });
        const fallbackBlob = await downloadCloudVideoBlobWithProgress(asset.storagePath, onProgress);
        await saveCachedVideo(dbName, storeName, key, { asset, blob: fallbackBlob, lastAccessed: Date.now() });
        onProgress?.({ stage: "complete", progress: 100, message: "元動画を取得完了" });
        return { url: URL.createObjectURL(fallbackBlob), source: "network", asset, isOptimized: false };
      } catch (fallbackError) {
        console.error("元動画フォールバック取得エラー", fallbackError);
        failureMessage = formatCloudVideoDownloadError(fallbackError);
      }
    }
    if (cached?.blob) {
      await touchCachedVideo(dbName, storeName, key);
      onProgress?.({ stage: "complete", progress: 100, message: "古い端末キャッシュを使用" });
      return { url: URL.createObjectURL(cached.blob), source: "stale-cache", asset: cached.asset, isOptimized: cached.asset.storagePath === asset.optimizedAsset?.storagePath };
    }
    const directUrl = await getDirectCloudVideoUrl(preferredAsset);
    if (directUrl) {
      onProgress?.({ stage: "complete", progress: 100, message: `${failureMessage} / クラウド直接再生` });
      return { url: directUrl, source: "direct-url", asset: preferredAsset, isOptimized };
    }
    onProgress?.({ stage: "failed", progress: 0, message: failureMessage });
    return null;
  }
};
