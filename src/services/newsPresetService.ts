import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { FIRESTORE_COLLECTIONS } from "../lib/firestorePaths";
import type { NewsPreset, NewsPresetInput } from "../types/newsPreset";

const normalizeName = (name: string) => name.trim();
const normalizeSignageDisplay = (input: NewsPresetInput["signageDisplay"]) => {
  if (!input?.mode) return null;
  return {
    mode: input.mode,
    duration: Math.max(5, Number(input.duration) || 30),
    videoAssetId: input.videoAssetId || null,
    kind: input.kind || "NORMAL",
  };
};

const buildNewsPresetWrite = (input: NewsPresetInput) => ({
  name: normalizeName(input.name),
  title: input.title.trim(),
  body: input.body.trim(),
  breakingVideoId: input.breakingVideoId || null,
  signageDisplay: normalizeSignageDisplay(input.signageDisplay),
});

export function subscribeNewsPresets(onNext: (presets: NewsPreset[]) => void): Unsubscribe {
  const q = query(collection(db, FIRESTORE_COLLECTIONS.newsPresets), orderBy("name", "asc"));
  return onSnapshot(q, (snap) => {
    onNext(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsPreset)));
  });
}

export function hasDuplicateNewsPresetName(
  presets: NewsPreset[],
  name: string,
  exceptId?: string
) {
  const normalized = normalizeName(name);
  return presets.some(preset => preset.id !== exceptId && preset.name.trim() === normalized);
}

export async function saveNewsPreset(
  input: NewsPresetInput,
  presetId?: string
) {
  const ref = presetId
    ? doc(db, FIRESTORE_COLLECTIONS.newsPresets, presetId)
    : doc(collection(db, FIRESTORE_COLLECTIONS.newsPresets));
  const now = serverTimestamp();
  await setDoc(ref, {
    ...buildNewsPresetWrite(input),
    updatedAt: now,
    ...(presetId ? {} : { createdAt: now }),
  }, { merge: true });
  return ref.id;
}

export function deleteNewsPreset(id: string) {
  return deleteDoc(doc(db, FIRESTORE_COLLECTIONS.newsPresets, id));
}

export async function deleteNewsPresets(ids: string[]) {
  const batch = writeBatch(db);
  ids.forEach(id => {
    batch.delete(doc(db, FIRESTORE_COLLECTIONS.newsPresets, id));
  });
  await batch.commit();
}

export async function importNewsPresets(inputs: NewsPresetInput[]) {
  const batch = writeBatch(db);
  inputs.forEach(input => {
    const ref = doc(collection(db, FIRESTORE_COLLECTIONS.newsPresets));
    const now = serverTimestamp();
    batch.set(ref, {
      ...buildNewsPresetWrite(input),
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
}
