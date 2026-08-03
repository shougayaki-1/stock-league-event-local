// functions/src/worker.ts

import { onTaskDispatched } from "firebase-functions/v2/tasks";
import * as admin from "firebase-admin";
import { COL } from "./collections";
import {
  PriceEngineData,
  PriceRuntimeState,
  NewsPresetData,
  StockData,
} from "./types";
import {
  DEFAULT_PHASES,
  clampToBounds,
  createEcoRuntime,
  createPhaseRuntime,
  getActivePhase,
  interpolatePrice,
  normalizePhases,
} from "./pricing";
import { applyScenarioEvent } from "./scenarioEvents";
import { ECO_TICK_INTERVAL_MS, isEcoEnabled } from "./ecoConfig";

const db = admin.firestore();

const MINUTE_MS = 60 * 1000;
const PUBLIC_MARKET_REFRESH_MS = 30 * MINUTE_MS;

export const performStockTick = onTaskDispatched({
  retryConfig: { maxAttempts: 1 },
  region: "asia-northeast1"
}, async (request) => {
  const forceEmergencyTick = request.data?.emergency === true;
  const loopNow = admin.firestore.Timestamp.now();
  const nowMillis = loopNow.toMillis();
  const settingsRef = db.collection(COL.settings).doc("system");
  const tickLockRef = db.collection(COL.internal).doc("tick_lock");
  let lastPublicRefreshAtMillis: number | null = null;

  // 高頻度ロックは公開 settings/system から分離し、参加者画面の再読込を防ぐ。
  const lockSuccess = await db.runTransaction(async (transaction) => {
    const lockSnap = await transaction.get(tickLockRef);
    const lockData = lockSnap.data();
    const lastTickAt = lockData?.lastTickAt;
    lastPublicRefreshAtMillis = lockData?.lastPublicRefreshAt?.toMillis() ?? null;

    if (lastTickAt) {
      const lastTickMillis = lastTickAt.toMillis();
      // 前回の実行完了から「20秒未満」であれば多重送信された重複タスクとみなし、アボートする
      if (!forceEmergencyTick && nowMillis - lastTickMillis < 20000) {
        console.warn(`[performStockTick] 多重実行を検出しました。タスクをスキップします。現在: ${nowMillis}, 前回: ${lastTickMillis}`);
        return false;
      }
    }

    transaction.set(tickLockRef, { lastTickAt: loopNow }, { merge: true });
    return true;
  });

  // ロックの獲得に失敗した（多重実行だった）場合は、以降の価格更新・イベント処理を安全にアボートする
  if (!lockSuccess) return;

  // ロック獲得後の情報収集
  const liveSnap = await settingsRef.get();
  const liveSettings = liveSnap.data() || {};
  const livePhase = liveSettings.globalPhase || "STOP";
  const isStopped = livePhase === "STOP";
  const scenarioMode = liveSettings.scenarioMode === "MANUAL" ? "MANUAL" : "AUTO";
  const ecoMode = isEcoEnabled(liveSettings);

  const emg = liveSettings.emergencyState;
  let isEmergencyPricePending = false;
  let emergencyType = "DOWN";

  if (emg && emg.isActive && emg.priceExecuteAt && !emg.priceAppliedAt) {
    if (emg.priceExecuteAt.toMillis() <= nowMillis) {
      isEmergencyPricePending = true;
      emergencyType = emg.type;
    }
  }

  const marketForUsersRef = db.collection(COL.publicData).doc("market_for_users");
  const priceEngineRef = db.collection(COL.internal).doc("price_engine");

  // ランタイムごとに固有のシードを発行する。補間は決定的なので全画面・約定処理で
  // 同じ価格になりつつ、銘柄間の値動きは独立する。
  const createRuntimeSeed = () => Math.random() * 1000;

  const batch = db.batch();
  let hasWrites = false;
  const stocksSnap = await db.collection(COL.stocks).get();
  const priceEngineSnap = await priceEngineRef.get();
  const newsPresetsSnap = await db.collection(COL.newsPresets).get();
  const priorPostNewsSnap = await db.collection(COL.news).where("kind", "==", "POST").get();
  const pendingPostNewsSnap = await db.collection(COL.scheduledPostNews).where("isDelivered", "==", false).get();
  const priceEngine = (priceEngineSnap.exists ? priceEngineSnap.data() : {}) as PriceEngineData;
  const configs = { ...(priceEngine.configs || {}) };
  const runtime = { ...(priceEngine.runtime || {}) } as Record<string, PriceRuntimeState | null>;
  const baseStocks: StockData[] = [];
  const stockRefsById: Record<string, admin.firestore.DocumentReference> = {};
  const baseStockIndexById: Record<string, number> = {};
  const stockPriceById: Record<string, number> = {};
  const stockBasePriceById: Record<string, number> = {};
  const newsPresetsById: Record<string, NewsPresetData> = {};
  let priceEngineChanged = false;
  let publicMarketChanged = false;
  let priorPostNewsCleared = false;
  const deliveredPostNewsIds = new Set<string>();
  const clearPriorPostNews = () => {
    if (priorPostNewsCleared) return;
    priorPostNewsSnap.docs.forEach((newsDoc) => batch.delete(newsDoc.ref));
    pendingPostNewsSnap.docs.forEach((newsDoc) => {
      if (deliveredPostNewsIds.has(newsDoc.id)) return;
      batch.delete(newsDoc.ref);
    });
    if (!priorPostNewsSnap.empty || !pendingPostNewsSnap.empty) hasWrites = true;
    priorPostNewsCleared = true;
  };

  newsPresetsSnap.docs.forEach((presetDoc) => {
    newsPresetsById[presetDoc.id] = presetDoc.data() as NewsPresetData;
  });

  // 配信期限が来た事後ニュースは、後続イベントの表ニュース発火（clearPriorPostNews）より
  // 先に配信を確定させる。同一tick内で両方が発生した場合に取りこぼされるのを防ぐため。
  // 緊急価格変動は市場停止中でも必ず処理する。停止状態のままだと、
  // 緊急操作でキューに登録されてもここまで到達せず価格が変わらなかった。
  if (!isStopped || isEmergencyPricePending) {
    const duePostNewsSnap = await db.collection(COL.scheduledPostNews)
      .where("isDelivered", "==", false)
      .where("deliverAt", "<=", loopNow)
      .limit(50)
      .get();

    duePostNewsSnap.forEach(newsDoc => {
      const data = newsDoc.data();
      deliveredPostNewsIds.add(newsDoc.id);
      if (!data.title) return;
      batch.set(db.collection(COL.news).doc(), {
        title: data.title,
        body: data.body || "",
        timestamp: loopNow,
        stockId: data.stockId || null,
        target: "ALL",
        sourceEventId: data.sourceEventId || null,
        kind: "POST",
      });
      batch.update(newsDoc.ref, {
        isDelivered: true,
        deliveredAt: loopNow,
      });
      hasWrites = true;
    });
  }

  stocksSnap.docs.forEach(sDoc => {
    const stock = { ...(sDoc.data() as StockData), id: sDoc.id };
    const activeRuntime = runtime[sDoc.id];
    stockRefsById[sDoc.id] = sDoc.ref;
    baseStockIndexById[sDoc.id] = baseStocks.length;
    baseStocks.push({ id: sDoc.id, name: stock.name, currentPrice: stock.currentPrice });
    stockPriceById[sDoc.id] = activeRuntime ? interpolatePrice(activeRuntime, nowMillis) : stock.currentPrice;
    // 基準価格（許容レンジの中心）。未設定の既存銘柄は現在価格で初期化して永続化する。
    const basePrice = typeof stock.basePrice === "number" && stock.basePrice > 0 ? stock.basePrice : stock.currentPrice;
    stockBasePriceById[sDoc.id] = basePrice;
    if (stock.basePrice !== basePrice) {
      batch.update(sDoc.ref, { basePrice });
      hasWrites = true;
    }
    if (!configs[sDoc.id]) {
      configs[sDoc.id] = { phases: DEFAULT_PHASES };
      priceEngineChanged = true;
    } else {
      configs[sDoc.id] = { phases: normalizePhases(configs[sDoc.id].phases) };
    }
  });

  if (!isStopped && scenarioMode !== "MANUAL") {
    // 未処理イベントの取得
    const eventsSnap = await db.collection(COL.events)
      .where("isProcessed", "==", false)
      .where("time", "<=", loopNow).get();

    eventsSnap.forEach(evDoc => {
      applyScenarioEvent(evDoc.ref, evDoc.data(), {
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
        createRuntimeSeed
      });
    });
  }

  if (!isStopped) {
    baseStocks.forEach((stock) => {
      const basePrice = stockBasePriceById[stock.id] ?? stock.currentPrice;
      let activeRuntime = runtime[stock.id] || null;
      let currentPrice = activeRuntime ? interpolatePrice(activeRuntime, nowMillis) : stock.currentPrice;
      let endedRuntimeMode: PriceRuntimeState["mode"] | null = null;

      const persistCurrentPrice = (price: number) => {
        const confirmedPrice = clampToBounds(price, basePrice);
        const stockIndex = baseStockIndexById[stock.id];

        if (stock.currentPrice !== confirmedPrice) {
          batch.update(stockRefsById[stock.id], { currentPrice: confirmedPrice });
          hasWrites = true;
        }

        stock.currentPrice = confirmedPrice;
        baseStocks[stockIndex] = { ...stock, currentPrice: confirmedPrice };
        stockPriceById[stock.id] = confirmedPrice;
        publicMarketChanged = true;
      };

      if (activeRuntime && activeRuntime.endAt.toMillis() <= nowMillis) {
        endedRuntimeMode = activeRuntime.mode;
        currentPrice = activeRuntime.mode === "SCENARIO"
          ? Math.max(1, Math.round(activeRuntime.endPrice))
          : clampToBounds(activeRuntime.endPrice, basePrice);
        delete runtime[stock.id];
        activeRuntime = null;
        persistCurrentPrice(currentPrice);
        priceEngineChanged = true;
      }

      if (isEmergencyPricePending) {
        const nextPrice = emergencyType === "UP"
          ? Math.round(currentPrice * (1 + (0.05 + Math.random() * 0.10)))
          : Math.round(currentPrice * (1 - (0.05 + Math.random() * 0.10)));
        // 緊急操作は演出の後に一度で価格を反映する。従来は5分間の
        // ランタイムを作るだけだったため、発動時点では表示価格が変わらなかった。
        // 通常フェーズ等のランタイムがあっても、補間済みの現在価格から上書きする。
        delete runtime[stock.id];
        persistCurrentPrice(nextPrice);
        priceEngineChanged = true;
        return;
      }

      if (!isEmergencyPricePending && ecoMode) {
        // ecoMode: 毎分フェーズは使わず、長尺ランタイムを継ぎ足して10秒変動を維持する。
        // アクティブなランタイムが無い、または次tick間隔以内に切れる場合に、
        // 現在価格からシームレスに再生成する（フラットな空白を作らない）。
        const remainingMillis = activeRuntime ? activeRuntime.endAt.toMillis() - nowMillis : -1;
        const needsEcoRuntime = (!activeRuntime || remainingMillis <= ECO_TICK_INTERVAL_MS)
          && endedRuntimeMode !== "SCENARIO";
        if (needsEcoRuntime) {
          // 補間中の現在価格を stocks に反映してからランタイムを継ぎ足す。
          // これによりランキングの評価額（stocks.currentPrice を参照）が最新化され、
          // 継ぎ目でクライアント表示価格とも一致する。
          persistCurrentPrice(currentPrice);
          runtime[stock.id] = createEcoRuntime(stock.currentPrice, nowMillis, basePrice, createRuntimeSeed());
          priceEngineChanged = true;
        }
      } else if (!isEmergencyPricePending) {
        const stockConfig = configs[stock.id] || { phases: DEFAULT_PHASES };
        const activePhase = getActivePhase(stockConfig.phases, nowMillis);
        const phaseChanged = activeRuntime?.mode === "PHASE" && activeRuntime.phaseId !== activePhase.id;
        const shouldCreatePhaseRuntime = (!activeRuntime && endedRuntimeMode !== "SCENARIO") || phaseChanged;

        if (shouldCreatePhaseRuntime) {
          runtime[stock.id] = createPhaseRuntime(currentPrice, activePhase, nowMillis, basePrice, createRuntimeSeed());
          priceEngineChanged = true;
          publicMarketChanged = true;
        }
      }
    });
  }

  const hasActiveRuntime = Object.values(runtime).some(Boolean);
  const needsPublicRefresh = lastPublicRefreshAtMillis === null ||
    nowMillis - lastPublicRefreshAtMillis >= PUBLIC_MARKET_REFRESH_MS;

  // ecoMode では「変化が無くても毎回書き換える」hasActiveRuntime 項を外し、
  // 実際に変わった tick（ランタイム再生成・約定など）だけ書き込む。
  if (priceEngineChanged || publicMarketChanged || needsPublicRefresh || (!ecoMode && hasActiveRuntime)) {
    const publicMarket = {
      stocks: baseStocks,
      runtime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    batch.set(marketForUsersRef, publicMarket);
    batch.set(priceEngineRef, {
      configs,
      runtime,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    batch.set(tickLockRef, { lastPublicRefreshAt: loopNow }, { merge: true });
    hasWrites = true;
  }

  if (isEmergencyPricePending) {
    batch.update(settingsRef, { "emergencyState.priceAppliedAt": loopNow });
    hasWrites = true;
  }

  if (hasWrites) await batch.commit();
});
