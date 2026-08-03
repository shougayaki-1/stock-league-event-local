// functions/src/marketControl.ts

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { COL } from "./collections";
import { PriceEngineData, PriceRuntimeState, StockData, SystemSettingsData } from "./types";
import { clampToBounds, interpolatePrice } from "./pricing";

const db = admin.firestore();

// runtime を現在の補間価格で凍結し、market_for_users / price_engine に即時反映する
const freezeMarket = async () => {
  const nowMillis = Date.now();
  const stocksSnap = await db.collection(COL.stocks).get();
  const priceEngineRef = db.collection(COL.internal).doc("price_engine");
  const marketForUsersRef = db.collection(COL.publicData).doc("market_for_users");
  const priceEngineSnap = await priceEngineRef.get();
  const priceEngine = (priceEngineSnap.exists ? priceEngineSnap.data() : {}) as PriceEngineData;
  const configs = priceEngine.configs || {};
  const runtime = { ...(priceEngine.runtime || {}) } as Record<string, PriceRuntimeState | null>;

  const batch = db.batch();
  const baseStocks: StockData[] = [];

  stocksSnap.docs.forEach((sDoc) => {
    const stock = { ...(sDoc.data() as StockData), id: sDoc.id };
    const activeRuntime = runtime[sDoc.id];

    if (activeRuntime) {
      const basePrice = typeof stock.basePrice === "number" && stock.basePrice > 0 ? stock.basePrice : stock.currentPrice;
      const frozenPrice = clampToBounds(interpolatePrice(activeRuntime, nowMillis), basePrice);
      if (stock.currentPrice !== frozenPrice) {
        batch.update(sDoc.ref, { currentPrice: frozenPrice });
      }
      stock.currentPrice = frozenPrice;
      runtime[sDoc.id] = null;
    }

    baseStocks.push({ id: sDoc.id, name: stock.name, currentPrice: stock.currentPrice });
  });

  batch.set(marketForUsersRef, {
    stocks: baseStocks,
    runtime,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(priceEngineRef, {
    configs,
    runtime,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();
};

export const onMarketPhaseChange = onDocumentWritten({
  document: "settings/system",
  region: "asia-northeast1",
}, async (event) => {
  const before = event.data?.before.data() as SystemSettingsData | undefined;
  const after = event.data?.after.data() as SystemSettingsData | undefined;
  if (!after) return;

  if (before?.globalPhase !== after.globalPhase) {
    if (after.globalPhase === "STOP") {
      await freezeMarket();
    }
  }

  // The local runner polls performStockTick, including emergency changes.
});
