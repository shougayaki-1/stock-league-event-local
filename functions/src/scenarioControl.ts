import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { COL } from "./collections";
import { CALL_OPTS, verifyAdmin } from "./utils";
import { NewsPresetData, PriceEngineData, PriceRuntimeState, StockData } from "./types";
import { interpolatePrice } from "./pricing";
import { applyScenarioEvent, type ScenarioTriggerPart } from "./scenarioEvents";

const db = admin.firestore();

export const triggerScenarioEvent = onCall(CALL_OPTS, async (request) => {
  const { eventId, part: rawPart } = request.data;
  if (!eventId || typeof eventId !== "string") {
    throw new HttpsError("invalid-argument", "eventIdが指定されていません");
  }
  if (rawPart != null && rawPart !== "MAIN" && rawPart !== "POST_NEWS" && rawPart !== "ALL") {
    throw new HttpsError("invalid-argument", "partの指定が不正です");
  }
  const part: ScenarioTriggerPart = rawPart || "ALL";

  await verifyAdmin(request.auth);

  const loopNow = admin.firestore.Timestamp.now();
  const nowMillis = loopNow.toMillis();
  const eventRef = db.collection(COL.events).doc(eventId);
  const settingsRef = db.collection(COL.settings).doc("system");
  const marketForUsersRef = db.collection(COL.publicData).doc("market_for_users");
  const priceEngineRef = db.collection(COL.internal).doc("price_engine");

  const [eventSnap, stocksSnap, marketSnap, priceEngineSnap, newsPresetsSnap, priorPostNewsSnap, pendingPostNewsSnap] = await Promise.all([
    eventRef.get(),
    db.collection(COL.stocks).get(),
    marketForUsersRef.get(),
    priceEngineRef.get(),
    db.collection(COL.newsPresets).get(),
    db.collection(COL.news).where("kind", "==", "POST").get(),
    db.collection(COL.scheduledPostNews).where("isDelivered", "==", false).get()
  ]);

  if (!eventSnap.exists) {
    throw new HttpsError("not-found", "イベントが見つかりません");
  }
  if (eventSnap.data()?.isProcessed === true) {
    throw new HttpsError("failed-precondition", "このイベントは既に発火済みです");
  }

  const priceEngine = (priceEngineSnap.exists ? priceEngineSnap.data() : {}) as PriceEngineData;
  const marketData = marketSnap.exists ? marketSnap.data() : null;
  const runtime = { ...((priceEngine.runtime || marketData?.runtime || {}) as Record<string, PriceRuntimeState | null>) };
  const stockBasePriceById: Record<string, number> = {};
  const stockPriceById: Record<string, number> = {};

  stocksSnap.docs.forEach((stockDoc) => {
    const stock = stockDoc.data() as StockData;
    stockBasePriceById[stockDoc.id] = typeof stock.basePrice === "number" && stock.basePrice > 0 ? stock.basePrice : stock.currentPrice;
  });

  const baseStocks: StockData[] = marketData?.stocks?.length
    ? (marketData.stocks as StockData[])
    : stocksSnap.docs.map((snap) => ({ ...(snap.data() as StockData), id: snap.id }));

  baseStocks.forEach((stock) => {
    const activeRuntime = runtime[stock.id];
    stockPriceById[stock.id] = activeRuntime ? interpolatePrice(activeRuntime, nowMillis) : stock.currentPrice;
    if (!stockBasePriceById[stock.id]) {
      stockBasePriceById[stock.id] = stock.currentPrice;
    }
  });
  const newsPresetsById: Record<string, NewsPresetData> = {};
  newsPresetsSnap.docs.forEach((presetDoc) => {
    newsPresetsById[presetDoc.id] = presetDoc.data() as NewsPresetData;
  });

  const batch = db.batch();
  let hasWrites = false;
  let priceEngineChanged = false;
  let priorPostNewsCleared = false;
  const clearPriorPostNews = () => {
    if (priorPostNewsCleared) return;
    priorPostNewsSnap.docs.forEach((newsDoc) => batch.delete(newsDoc.ref));
    pendingPostNewsSnap.docs.forEach((newsDoc) => batch.delete(newsDoc.ref));
    if (!priorPostNewsSnap.empty || !pendingPostNewsSnap.empty) hasWrites = true;
    priorPostNewsCleared = true;
  };

  applyScenarioEvent(eventRef, eventSnap.data()!, {
    batch,
    loopNow,
    settingsRef,
    runtime,
    stockPriceById,
    stockBasePriceById,
    newsPresetsById,
    markPriceEngineChanged: () => { priceEngineChanged = true; },
    markWrite: () => { hasWrites = true; },
    clearPriorPostNews,
    createRuntimeSeed: () => Math.random() * 1000
  }, part);

  if (priceEngineChanged) {
    batch.set(marketForUsersRef, {
      stocks: baseStocks,
      runtime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    batch.set(priceEngineRef, {
      runtime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    hasWrites = true;
  }

  if (hasWrites) await batch.commit();
  return { success: true };
});
