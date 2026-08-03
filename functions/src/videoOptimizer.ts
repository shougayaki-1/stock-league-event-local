import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

type OptimizedVideoStatus = "processing" | "ready" | "failed";

interface OptimizedCloudVideoAsset {
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

interface CloudVideoAsset {
  storagePath: string;
  downloadUrl: string;
  version: string;
  updatedAt: number;
  contentType: string;
  size: number;
  fileName: string;
  optimizedAsset?: OptimizedCloudVideoAsset;
}

interface TargetRef {
  collection: "public_signages" | "ad_videos" | "breaking_videos" | "riddle_rooms" | "video_library";
  docId: string;
  playlistIndex?: number;
  role?: string;
  videoId?: string;
}

const db = admin.firestore();

// Browsers resolve optimized assets from storagePath through the Storage
// emulator. Never publish a production Firebase Storage URL from this build.
const buildMediaUrl = (_bucket: string, _path: string) => "";

const parseTargetRef = (storagePath: string): TargetRef | null => {
  const publicMatch = storagePath.match(/^signage\/public\/([^/]+)\/playlist\/(\d+)-/);
  if (publicMatch) {
    return { collection: "public_signages", docId: publicMatch[1], playlistIndex: Number(publicMatch[2]) };
  }

  const adMatch = storagePath.match(/^signage\/ads\/([^-]+)-/);
  if (adMatch) return { collection: "ad_videos", docId: adMatch[1] };

  const breakingMatch = storagePath.match(/^signage\/breaking-shared\/([^-]+)-/);
  if (breakingMatch) return { collection: "breaking_videos", docId: breakingMatch[1] };

  const riddleMatch = storagePath.match(/^signage\/riddle\/([^/]+)\/([^/]+)\/([^-]+)-/);
  if (riddleMatch) {
    return { collection: "riddle_rooms", docId: riddleMatch[1], role: riddleMatch[2], videoId: riddleMatch[3] };
  }

  const libraryMatch = storagePath.match(/^signage\/video-library\/([^-]+)-/);
  if (libraryMatch) return { collection: "video_library", docId: libraryMatch[1] };

  return null;
};

const getOptimizedPath = (sourcePath: string) => {
  const sourceDir = dirname(sourcePath);
  const sourceBase = basename(sourcePath).replace(/\.[^.]+$/, "");
  return `${sourceDir}/optimized/${sourceBase}-optimized.mp4`;
};

const runFfmpeg = (inputPath: string, outputPath: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary is not available."));
      return;
    }

    const args = [
      "-y",
      "-i", inputPath,
      "-vf", "scale='min(1920,iw)':-2",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", "2500k",
      "-maxrate", "2500k",
      "-bufsize", "5000k",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      outputPath,
    ];

    const child = spawn(ffmpegPath, args);
    let stderr = "";
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-1000) || `ffmpeg exited with code ${code}`));
    });
  });
};

const patchMatchingAsset = (asset: unknown, sourcePath: string, optimizedAsset: OptimizedCloudVideoAsset) => {
  const current = asset as CloudVideoAsset | undefined;
  if (!current || current.storagePath !== sourcePath) return current;
  return { ...current, optimizedAsset };
};

const updateAssetStatus = async (target: TargetRef, sourcePath: string, optimizedAsset: OptimizedCloudVideoAsset) => {
  await db.runTransaction(async tx => {
    const docRef = db.collection(target.collection).doc(target.docId);
    const snap = await tx.get(docRef);
    if (!snap.exists) return;
    const data = snap.data() || {};

    if (target.collection === "public_signages" && target.playlistIndex != null) {
      const playlist = Array.isArray(data.playlist) ? [...data.playlist] : [];
      const item = playlist[target.playlistIndex];
      if (!item) return;
      const nextAsset = patchMatchingAsset(item.videoAsset, sourcePath, optimizedAsset);
      if (nextAsset === item.videoAsset) return;
      playlist[target.playlistIndex] = { ...item, videoAsset: nextAsset };
      tx.update(docRef, { playlist });
      return;
    }

    if (target.collection === "riddle_rooms" && target.role && target.videoId) {
      const videoAssets = { ...(data.videoAssets || {}) };
      const roleAssets = { ...(videoAssets[target.role] || {}) };
      const nextAsset = patchMatchingAsset(roleAssets[target.videoId], sourcePath, optimizedAsset);
      if (nextAsset === roleAssets[target.videoId]) return;
      roleAssets[target.videoId] = nextAsset;
      videoAssets[target.role] = roleAssets;
      tx.update(docRef, { videoAssets });
      return;
    }

    const nextAsset = patchMatchingAsset(data.videoAsset, sourcePath, optimizedAsset);
    if (nextAsset === data.videoAsset) return;
    tx.update(docRef, { videoAsset: nextAsset });
  });
};

export const optimizeSignageVideo = onObjectFinalized(
  {
    region: "us-east1",
    memory: "2GiB",
    timeoutSeconds: 540,
    maxInstances: 1,
    retry: false,
  },
  async event => {
    const object = event.data;
    const sourcePath = object.name;
    if (!sourcePath || !object.bucket) return;
    if (!sourcePath.startsWith("signage/") || sourcePath.includes("/optimized/")) return;
    if (!object.contentType?.startsWith("video/")) return;

    const target = parseTargetRef(sourcePath);
    if (!target) {
      logger.info("Skipping video optimization for untracked signage path.", { sourcePath });
      return;
    }

    const bucket = admin.storage().bucket(object.bucket);
    const optimizedPath = getOptimizedPath(sourcePath);
    const version = Date.now().toString();
    await updateAssetStatus(target, sourcePath, { status: "processing", updatedAt: Date.now() });

    const workDir = await mkdtemp(join(tmpdir(), "signage-video-"));
    const inputPath = join(workDir, "input");
    const outputPath = join(workDir, "optimized.mp4");

    try {
      await bucket.file(sourcePath).download({ destination: inputPath });
      await runFfmpeg(inputPath, outputPath);
      await bucket.upload(outputPath, {
        destination: optimizedPath,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            optimizedFrom: sourcePath,
          },
        },
      });
      const [metadata] = await bucket.file(optimizedPath).getMetadata();
      await updateAssetStatus(target, sourcePath, {
        status: "ready",
        storagePath: optimizedPath,
        downloadUrl: buildMediaUrl(object.bucket, optimizedPath),
        version,
        updatedAt: Date.now(),
        contentType: "video/mp4",
        size: Number(metadata.size || 0),
        fileName: basename(optimizedPath),
      });
      logger.info("Optimized signage video.", { sourcePath, optimizedPath });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown video optimization error.";
      logger.error("Failed to optimize signage video.", { sourcePath, errorMessage });
      await updateAssetStatus(target, sourcePath, {
        status: "failed",
        updatedAt: Date.now(),
        errorMessage: errorMessage.slice(0, 500),
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
);
