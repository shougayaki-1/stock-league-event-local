import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where, writeBatch, type Unsubscribe } from "firebase/firestore";
import { db } from "../lib/firebase";
import { materializeStocks, type PriceRuntimeState, type PublicMarketData, type StockPricePhase } from "../lib/marketPricing";
import { DEFAULT_STOCK_PHASES } from "../lib/stockPhaseCsv";
import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCS } from "../lib/firestorePaths";
import type { PriceChangeTarget } from "../types/domain";
import type { NewsPreset } from "../types/newsPreset";

export interface SystemMarketSnapshot {
  globalPhase: string;
  isEmergencyActive: boolean;
  activeEmergencyType: "UP" | "DOWN";
}

export interface PriceEngineSnapshot {
  configs: Record<string, { phases: StockPricePhase[] }>;
  runtime: Record<string, PriceRuntimeState | null>;
}

export function subscribeMarketSystem(onNext: (snapshot: SystemMarketSnapshot) => void): Unsubscribe {
  return onSnapshot(doc(db, ...FIRESTORE_DOCS.systemSettings), (snap) => {
    if (!snap.exists()) {
      onNext({ globalPhase: "STOP", isEmergencyActive: false, activeEmergencyType: "DOWN" });
      return;
    }
    const data = snap.data();
    onNext({
      globalPhase: data.globalPhase || "STOP",
      isEmergencyActive: Boolean(data.emergencyState?.isActive),
      activeEmergencyType: data.emergencyState?.type || "DOWN"
    });
  });
}

export function subscribePriceEngine(onNext: (snapshot: PriceEngineSnapshot) => void): Unsubscribe {
  return onSnapshot(doc(db, ...FIRESTORE_DOCS.priceEngine), (snap) => {
    const data = snap.exists() ? snap.data() : {};
    onNext({
      configs: (data.configs || {}) as Record<string, { phases: StockPricePhase[] }>,
      runtime: (data.runtime || {}) as Record<string, PriceRuntimeState | null>
    });
  });
}

const publishPublicStocks = async (
  mutate: (stocks: Array<{ id: string; name: string; currentPrice: number }>) => Array<{ id: string; name: string; currentPrice: number }>
) => {
  const marketRef = doc(db, ...FIRESTORE_DOCS.marketForUsers);
  const marketSnap = await getDoc(marketRef);
  const current = marketSnap.exists() ? marketSnap.data() as PublicMarketData : {};
  const stocks = mutate(current.stocks || []);
  await setDoc(marketRef, {
    stocks,
    runtime: current.runtime || {},
    updatedAt: Timestamp.now()
  }, { merge: true });
};

export const setMarketSystemPhase = (phase: string) =>
  setDoc(doc(db, ...FIRESTORE_DOCS.systemSettings), { globalPhase: phase }, { merge: true });

export const triggerMarketEmergency = (type: "UP" | "DOWN", message: string, overlayDelay: number, priceDelay: number) => {
  const now = Date.now();
  const overlayTime = new Date(now + overlayDelay * 1000);
  const priceTime = new Date(now + (overlayDelay + priceDelay) * 1000);
  return setDoc(doc(db, ...FIRESTORE_DOCS.systemSettings), {
    emergencyState: {
      isActive: true,
      type,
      message,
      overlayExecuteAt: Timestamp.fromDate(overlayTime),
      priceExecuteAt: Timestamp.fromDate(priceTime)
    }
  }, { merge: true });
};

export const stopMarketEmergency = () =>
  setDoc(doc(db, ...FIRESTORE_DOCS.systemSettings), { emergencyState: { isActive: false } }, { merge: true });

export async function updateMarketTargetPrice(stockId: string, newPrice: number, delaySeconds = 0) {
  const executeTime = new Date(Date.now() + delaySeconds * 1000);
  const marketSnap = await getDoc(doc(db, ...FIRESTORE_DOCS.marketForUsers));
  const stocks = marketSnap.exists() ? materializeStocks(marketSnap.data() as PublicMarketData) : [];
  const currentPrice = stocks.find(stock => stock.id === stockId)?.currentPrice ?? newPrice;
  const priceRuntime = {
    mode: "SCENARIO",
    phaseId: null,
    startPrice: currentPrice,
    endPrice: newPrice,
    startAt: Timestamp.fromDate(executeTime),
    endAt: Timestamp.fromDate(new Date(executeTime.getTime() + 5 * 60 * 1000)),
    seed: Math.random() * 1000
  };
  const batch = writeBatch(db);
  batch.set(doc(db, ...FIRESTORE_DOCS.priceEngine), { runtime: { [stockId]: priceRuntime } }, { merge: true });
  batch.set(doc(db, ...FIRESTORE_DOCS.marketForUsers), {
    runtime: { [stockId]: priceRuntime },
    updatedAt: Timestamp.now()
  }, { merge: true });
  await batch.commit();
}

export async function addMarketStock(stockId: string, name: string, initialPrice: number) {
  const stockRef = doc(db, FIRESTORE_COLLECTIONS.stocks, stockId);
  const existing = await getDoc(stockRef);
  if (existing.exists()) {
    throw new Error("DUPLICATE_STOCK");
  }
  await setDoc(stockRef, {
    name,
    currentPrice: initialPrice,
    basePrice: initialPrice
  });
  await setDoc(doc(db, ...FIRESTORE_DOCS.priceEngine), {
    configs: { [stockId]: { phases: DEFAULT_STOCK_PHASES } }
  }, { merge: true });
  await publishPublicStocks((stocks) => [
    ...stocks.filter((stock) => stock.id !== stockId),
    { id: stockId, name, currentPrice: initialPrice }
  ]);
}

export async function editMarketStock(stockId: string, newName: string) {
  await updateDoc(doc(db, FIRESTORE_COLLECTIONS.stocks, stockId), { name: newName });
  await publishPublicStocks((stocks) => stocks.map((stock) => stock.id === stockId ? { ...stock, name: newName } : stock));
}

export const saveMarketStockPhases = (stockId: string, phases: StockPricePhase[]) =>
  setDoc(doc(db, ...FIRESTORE_DOCS.priceEngine), {
    configs: { [stockId]: { phases: phases.length > 0 ? phases : DEFAULT_STOCK_PHASES } }
  }, { merge: true });

export async function deleteMarketStock(stockId: string) {
  await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.stocks, stockId));
  await publishPublicStocks((stocks) => stocks.filter((stock) => stock.id !== stockId));
  try {
    await updateDoc(doc(db, ...FIRESTORE_DOCS.priceEngine), {
      [`configs.${stockId}`]: deleteField(),
      [`runtime.${stockId}`]: deleteField()
    });
  } catch {
    // Internal price engine settings may not exist in older environments.
  }
}

export async function scheduleMarketEvent(
  date: string,
  time: string,
  priceChanges: PriceChangeTarget[],
  publicNews: { title: string, body: string, delaySeconds: number },
  postNews: { title: string, body: string, delaySeconds: number },
  breakingVideoId: string | null
) {
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) throw new Error("日時の形式が正しくありません。");

  const batch = writeBatch(db);
  if (publicNews.title) {
    const pDate = new Date(d.getTime() + publicNews.delaySeconds * 1000);
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.events)), { time: Timestamp.fromDate(pDate), publicNews: { title: publicNews.title, body: publicNews.body }, isProcessed: false });
  }
  if (postNews.title) {
    const iDate = new Date(d.getTime() + postNews.delaySeconds * 1000);
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.events)), { time: Timestamp.fromDate(iDate), postNews: { title: postNews.title, body: postNews.body, delaySeconds: 0 }, isProcessed: false });
  }
  if (priceChanges.length > 0 || breakingVideoId) {
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.events)), {
      time: Timestamp.fromDate(d),
      priceChanges: priceChanges.length > 0 ? priceChanges : null,
      breakingVideoId,
      isProcessed: false
    });
  }
  await batch.commit();
}

export async function updateScheduledMarketEvent(
  eventId: string,
  date: string,
  time: string,
  priceChanges: PriceChangeTarget[],
  publicNews: { title: string, body: string, delaySeconds: number },
  postNews: { title: string, body: string, delaySeconds: number },
  breakingVideoId: string | null
) {
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) throw new Error("日時の形式が正しくありません。");

  const updateData: Record<string, unknown> = { isProcessed: false };
  if (publicNews.title) {
    const pDate = new Date(d.getTime() + publicNews.delaySeconds * 1000);
    Object.assign(updateData, {
      time: Timestamp.fromDate(pDate),
      publicNews: { title: publicNews.title, body: publicNews.body },
      postNews: null,
      insiderNews: null,
      priceChanges: null,
      breakingVideoId: null
    });
  } else if (postNews.title) {
    const iDate = new Date(d.getTime() + postNews.delaySeconds * 1000);
    Object.assign(updateData, {
      time: Timestamp.fromDate(iDate),
      postNews: { title: postNews.title, body: postNews.body, delaySeconds: 0 },
      insiderNews: null,
      publicNews: null,
      priceChanges: null,
      breakingVideoId: null
    });
  } else {
    Object.assign(updateData, {
      time: Timestamp.fromDate(d),
      priceChanges: priceChanges.length > 0 ? priceChanges : null,
      breakingVideoId,
      publicNews: null,
      postNews: null,
      insiderNews: null
    });
  }

  await updateDoc(doc(db, FIRESTORE_COLLECTIONS.events, eventId), updateData);
}

export const getIsMarketStopped = async () => {
  const sysSnap = await getDoc(doc(db, ...FIRESTORE_DOCS.systemSettings));
  return sysSnap.data()?.globalPhase === "STOP";
};

export async function publishMarketNewsNow(
  priceChanges: PriceChangeTarget[],
  publicNewsPresetId: string | null,
  postNewsPresetId: string | null,
  postNewsDelaySeconds: number | null,
  insiderNewsPresetId: string | null,
  signageTargetId: string | null = null
) {
  const batch = writeBatch(db);
  const now = Timestamp.now();
  const resolvePreset = async (presetId: string | null) => {
    if (!presetId) return null;
    const snap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.newsPresets, presetId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as NewsPreset;
  };
  const [publicNews, postNews, insiderNews] = await Promise.all([
    resolvePreset(publicNewsPresetId),
    resolvePreset(postNewsPresetId),
    resolvePreset(insiderNewsPresetId),
  ]);
  const postLikeNews = postNews || insiderNews;

  if (publicNews?.title) {
    const [priorPostNewsSnap, pendingPostNewsSnap] = await Promise.all([
      getDocs(query(collection(db, FIRESTORE_COLLECTIONS.news), where("kind", "==", "POST"))),
      getDocs(query(collection(db, FIRESTORE_COLLECTIONS.scheduledPostNews), where("isDelivered", "==", false))),
    ]);
    priorPostNewsSnap.docs.forEach((newsDoc) => batch.delete(newsDoc.ref));
    pendingPostNewsSnap.docs.forEach((newsDoc) => batch.delete(newsDoc.ref));
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.news)), { title: publicNews.title, body: publicNews.body || "", target: "ALL", timestamp: now, kind: "PUBLIC" });
  }
  if (postLikeNews?.title) {
    const delaySeconds = Math.max(0, postNews ? (postNewsDelaySeconds || 0) : 0);
    if (delaySeconds > 0) {
      batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.scheduledPostNews)), {
        title: postLikeNews.title,
        body: postLikeNews.body || "",
        target: "ALL",
        deliverAt: Timestamp.fromDate(new Date(now.toMillis() + delaySeconds * 1000)),
        timestamp: now,
        isDelivered: false,
        sourceEventId: "manual",
        kind: "POST"
      });
    } else {
      batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.news)), { title: postLikeNews.title, body: postLikeNews.body || "", target: "ALL", timestamp: now, kind: "POST" });
    }
  }

  if (publicNews?.breakingVideoId) {
    batch.set(doc(db, ...FIRESTORE_DOCS.systemSettings), { activeBreakingNews: { videoId: publicNews.breakingVideoId, timestamp: Date.now() } }, { merge: true });
  }

  const signageDisplay = publicNews?.signageDisplay;
  if (signageTargetId && signageDisplay?.mode) {
    batch.set(doc(db, FIRESTORE_COLLECTIONS.publicSignages, signageTargetId), {
      scenarioOverride: {
        eventId: `manual-${Date.now()}`,
        mode: signageDisplay.mode,
        duration: Math.max(5, signageDisplay.duration || 30),
        videoAssetId: signageDisplay.videoAssetId || null,
        kind: signageDisplay.kind || "NORMAL",
        startedAt: now
      }
    }, { merge: true });
  }

  if (priceChanges.length > 0) {
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.events)), { time: now, priceChanges, publicNewsPresetId, postNewsPresetId, postNewsDelaySeconds, insiderNewsPresetId, signageTargetId, processedParts: null, selectedBranches: null, isProcessed: false });
  } else if (signageTargetId && signageDisplay?.mode) {
    batch.set(doc(collection(db, FIRESTORE_COLLECTIONS.events)), { time: now, publicNewsPresetId, signageTargetId, isProcessed: true });
  }

  await batch.commit();
}

export const deleteMarketEvent = (id: string) => deleteDoc(doc(db, FIRESTORE_COLLECTIONS.events, id));

export const updateMarketEvent = (eventId: string, payload: Record<string, unknown>) =>
  updateDoc(doc(db, FIRESTORE_COLLECTIONS.events, eventId), payload);

export async function updateMarketEvents(payloads: Map<string, Record<string, unknown>>) {
  const batch = writeBatch(db);
  payloads.forEach((payload, eventId) => {
    batch.update(doc(db, FIRESTORE_COLLECTIONS.events, eventId), payload);
  });
  await batch.commit();
}
