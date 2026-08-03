// Dry-run: npx tsx scripts/migrateVideoLibrary.ts --dry-run
// Apply:   npx tsx scripts/migrateVideoLibrary.ts --apply
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { buildVideoLibraryEntries, type LegacyVideoSource, type VideoLibraryEntry } from "./migrateVideoLibrary.logic";

const shouldApply = process.argv.includes("--apply");
const isDryRun = process.argv.includes("--dry-run") || !shouldApply;

initializeApp();
const db = getFirestore();
const DELETE_FIELD = FieldValue.delete();

type FirestoreData = Record<string, unknown>;
type PlaylistItemData = FirestoreData & {
  videoAsset?: LegacyVideoSource["videoAsset"];
  videoAssetId?: string | null;
};
type RiddleActionData = FirestoreData & {
  videoAssetId?: string | null;
};
type RiddleStepData = FirestoreData & {
  tvActions?: Record<string, RiddleActionData>;
};

const getData = (doc: QueryDocumentSnapshot) => doc.data() as FirestoreData;
const asString = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value : fallback;

const collectLegacySources = async (): Promise<LegacyVideoSource[]> => {
  const sources: LegacyVideoSource[] = [];

  const breakingSnap = await db.collection("breaking_videos").get();
  breakingSnap.docs.forEach(doc => {
    const data = getData(doc);
    if (data.videoAsset) {
      sources.push({ collectionPath: "breaking_videos", docId: doc.id, fieldPath: "videoAsset", name: asString(data.name, doc.id), videoAsset: data.videoAsset as LegacyVideoSource["videoAsset"] });
    }
  });

  const adSnap = await db.collection("ad_videos").get();
  adSnap.docs.forEach(doc => {
    const data = getData(doc);
    if (data.videoAsset) {
      sources.push({ collectionPath: "ad_videos", docId: doc.id, fieldPath: "videoAsset", name: asString(data.name, doc.id), videoAsset: data.videoAsset as LegacyVideoSource["videoAsset"] });
    }
  });

  const riddleSnap = await db.collection("riddle_rooms").get();
  riddleSnap.docs.forEach(doc => {
    const data = getData(doc);
    const videoAssets = data.videoAssets || {};
    Object.entries(videoAssets).forEach(([role, roleAssets]) => {
      Object.entries(roleAssets as Record<string, unknown>).forEach(([videoId, videoAsset]) => {
        if (videoAsset) {
          sources.push({
            collectionPath: "riddle_rooms",
            docId: doc.id,
            fieldPath: `videoAssets.${role}.${videoId}`,
            name: `${asString(data.name, doc.id)} ${role} ${videoId}`,
            videoAsset: videoAsset as LegacyVideoSource["videoAsset"],
          });
        }
      });
    });
  });

  const signageSnap = await db.collection("public_signages").get();
  signageSnap.docs.forEach(doc => {
    const data = getData(doc);
    const playlist = Array.isArray(data.playlist) ? data.playlist : [];
    playlist.forEach((item: PlaylistItemData, index: number) => {
      if (item.videoAsset && !item.videoAssetId) {
        sources.push({
          collectionPath: "public_signages",
          docId: doc.id,
          fieldPath: `playlist.${index}.videoAsset`,
          name: `${asString(data.name, doc.id)} プレイリスト${index + 1}`,
          videoAsset: item.videoAsset,
        });
      }
    });
  });

  return sources;
};

const findEntry = (entries: VideoLibraryEntry[], collectionPath: string, docId: string, fieldPrefix?: string) =>
  entries.find(entry =>
    entry.source.collectionPath === collectionPath &&
    entry.source.docId === docId &&
    (!fieldPrefix || entry.source.fieldPath.startsWith(fieldPrefix))
  );

const writeLibraryEntries = async (entries: VideoLibraryEntry[]) => {
  for (const entry of entries) {
    const ref = db.collection("video_library").doc(entry.videoId);
    const snap = await ref.get();
    if (snap.exists) continue;
    if (isDryRun) {
      console.log(`[dry-run] create video_library/${entry.videoId} from ${entry.source.collectionPath}/${entry.source.docId} ${entry.source.fieldPath}`);
      continue;
    }
    await ref.set({
      name: entry.name,
      videoAsset: entry.videoAsset,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      legacySource: {
        collectionPath: entry.source.collectionPath,
        docId: entry.source.docId,
        fieldPath: entry.source.fieldPath,
      },
    });
  }
};

const rewriteReferences = async (entries: VideoLibraryEntry[]) => {
  const eventsSnap = await db.collection("events").get();
  for (const doc of eventsSnap.docs) {
    const data = getData(doc);
    const breakingVideoId = typeof data.breakingVideoId === "string" ? data.breakingVideoId : "";
    if (!breakingVideoId || breakingVideoId.startsWith("legacy_")) continue;
    const entry = findEntry(entries, "breaking_videos", breakingVideoId);
    if (entry) {
      if (isDryRun) console.log(`[dry-run] update events/${doc.id} breakingVideoId -> ${entry.videoId}`);
      else await doc.ref.update({ breakingVideoId: entry.videoId, breakingVideoName: DELETE_FIELD });
    }
  }

  const riddleSnap = await db.collection("riddle_rooms").get();
  for (const doc of riddleSnap.docs) {
    const data = getData(doc);
    if (!data.videoAssets) continue;
    const steps = Array.isArray(data.steps) ? data.steps.map((step: RiddleStepData) => {
      const tvActions = { ...(step.tvActions || {}) };
      Object.entries(tvActions).forEach(([role, action]) => {
        const nextAction = { ...action };
        if (nextAction.videoAssetId && !String(nextAction.videoAssetId).startsWith("legacy_")) {
          const entry = findEntry(entries, "riddle_rooms", doc.id, `videoAssets.${role}.${nextAction.videoAssetId}`);
          if (entry) nextAction.videoAssetId = entry.videoId;
        }
        tvActions[role] = nextAction;
      });
      return { ...step, tvActions };
    }) : [];
    if (isDryRun) console.log(`[dry-run] update riddle_rooms/${doc.id} steps and delete videoAssets`);
    else await doc.ref.update({ steps, videoAssets: DELETE_FIELD });
  }

  const signageSnap = await db.collection("public_signages").get();
  for (const doc of signageSnap.docs) {
    const data = getData(doc);
    const playlist = Array.isArray(data.playlist) ? data.playlist.map((item: PlaylistItemData, index: number) => {
      if (item.videoAssetId || !item.videoAsset) return item;
      const entry = findEntry(entries, "public_signages", doc.id, `playlist.${index}.videoAsset`);
      if (!entry) return item;
      const rest = { ...item };
      delete rest.videoAsset;
      return { ...rest, videoAssetId: entry.videoId };
    }) : [];
    const enabledAdIds = Array.isArray(data.enabledAdIds)
      ? data.enabledAdIds.map((adId: string) => {
        if (String(adId).startsWith("legacy_")) return adId;
        const entry = findEntry(entries, "ad_videos", adId);
        return entry?.videoId || adId;
      })
      : data.enabledAdIds;
    if (isDryRun) console.log(`[dry-run] update public_signages/${doc.id} playlist and enabledAdIds`);
    else await doc.ref.update({ playlist, enabledAdIds });
  }
};

const main = async () => {
  const sources = await collectLegacySources();
  const entries = buildVideoLibraryEntries(sources);
  console.log(`Found ${sources.length} legacy video assets. Mode: ${isDryRun ? "dry-run" : "apply"}`);
  if (!isDryRun && !process.env.GOOGLE_CLOUD_PROJECT && !process.env.GCLOUD_PROJECT && !process.env.FIREBASE_CONFIG) {
    throw new Error("Refusing to apply without Firebase project environment. Run with Firebase credentials/config or use --dry-run.");
  }
  await writeLibraryEntries(entries);
  await rewriteReferences(entries);
  console.log("Video library migration finished.");
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
