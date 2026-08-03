// functions/src/trade.ts

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { createHash, randomUUID } from "node:crypto";
import { COL } from "./collections";
import { verifyCurrentUser, verifyAdmin, getSystemSettings, CALL_OPTS, CRITICAL_CALL_OPTS } from "./utils";
import { PriceRuntimeState, StockData } from "./types";
import { requirePositiveInteger, toExactBigInt } from "./exact";
import { interpolatePrice } from "./pricing";

const db = admin.firestore();

const QUOTE_TTL_MS = 5_000;
const QUOTE_RATE_LIMIT_MS = 1_000;

const materializeMarketPrices = (
  stocksList: StockData[],
  runtime?: Record<string, PriceRuntimeState | null>,
  nowMillis = Date.now()
) => {
  const prices: Record<string, number> = {};
  stocksList.forEach((stock) => {
    const state = runtime?.[stock.id];
    prices[stock.id] = state ? interpolatePrice(state, nowMillis) : stock.currentPrice;
  });
  return prices;
};

const quoteDocumentId = (uid: string, stockId: string) =>
  createHash("sha256").update(`${uid}\0${stockId}`).digest("hex");

// クォート発行はモーダル表示中ずっと数秒おきに呼ばれるため、市場ドキュメント全体の取得を
// レート制限と同じ1秒だけキャッシュし、無駄な読み込みが積み重なるのを防ぐ。
const MARKET_CACHE_TTL_MS = QUOTE_RATE_LIMIT_MS;
let marketCache: { data: FirebaseFirestore.DocumentData; fetchedAtMillis: number } | null = null;

const getCachedMarketData = async (nowMillis: number): Promise<FirebaseFirestore.DocumentData> => {
  if (marketCache && nowMillis - marketCache.fetchedAtMillis < MARKET_CACHE_TTL_MS) {
    return marketCache.data;
  }
  const snap = await db.collection(COL.publicData).doc("market_for_users").get();
  const data = snap.exists ? snap.data()! : {};
  marketCache = { data, fetchedAtMillis: nowMillis };
  return data;
};

const quoteError = (
  reason: "QUOTE_EXPIRED" | "QUOTE_REPLACED" | "QUOTE_USED" | "QUOTE_REQUIRED",
  message: string
) => new HttpsError("failed-precondition", message, { reason });

const verifyTradeActor = async (auth: CallableRequest<unknown>["auth"], uid: string) => {
  try {
    verifyCurrentUser(auth, uid);
  } catch {
    try {
      await verifyAdmin(auth);
    } catch {
      throw new HttpsError("permission-denied", "このアカウントを操作する権限がありません。");
    }
  }
};

/** 取引ポイントは整数で管理する。壊れた市場データで BigInt 変換が落ちないよう、約定前に必ず正規化する。 */
const normalizeTradingPrice = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new HttpsError("failed-precondition", "現在の株価が不正です。運営にお問い合わせください。");
  }
  return Math.max(1, Math.round(numeric));
};

export const quoteStockPrice = onCall(CRITICAL_CALL_OPTS, async (request) => {
  const { uid, stockId } = request.data;
  if (typeof uid !== "string" || !uid || typeof stockId !== "string" || !stockId) {
    throw new HttpsError("invalid-argument", "ユーザーまたは銘柄の指定が不正です");
  }
  await verifyTradeActor(request.auth, uid);

  const nowMillis = Date.now();
  const [settings, marketData, stockSnap] = await Promise.all([
    getSystemSettings(),
    getCachedMarketData(nowMillis),
    db.collection(COL.stocks).doc(stockId).get(),
  ]);
  if (settings.globalPhase === "STOP") {
    throw new HttpsError("failed-precondition", "現在、市場は閉まっています。");
  }
  if (!stockSnap.exists) {
    throw new HttpsError("not-found", "銘柄が見つかりません");
  }

  const marketStocks = (marketData.stocks || []) as StockData[];
  const publicStock = marketStocks.find((stock) => stock.id === stockId);
  const stock = publicStock || ({ ...(stockSnap.data() as StockData), id: stockId });
  const runtime = marketData.runtime as Record<string, PriceRuntimeState | null> | undefined;
  const price = normalizeTradingPrice(materializeMarketPrices([stock], runtime, nowMillis)[stockId]);
  const quoteId = randomUUID();
  const quoteRef = db.collection(COL.tradeQuotes).doc(quoteDocumentId(uid, stockId));

  await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(quoteRef);
    const priorIssuedAt = prior.data()?.issuedAt?.toMillis?.();
    if (typeof priorIssuedAt === "number" && nowMillis - priorIssuedAt < QUOTE_RATE_LIMIT_MS) {
      throw new HttpsError("resource-exhausted", "価格の再取得が早すぎます。少し待ってからお試しください。");
    }
    transaction.set(quoteRef, {
      uid,
      stockId,
      quoteId,
      price,
      issuedAt: admin.firestore.Timestamp.fromMillis(nowMillis),
      expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis + QUOTE_TTL_MS),
    });
  });

  return {
    quoteId,
    price,
    issuedAtMillis: nowMillis,
    expiresAtMillis: nowMillis + QUOTE_TTL_MS,
  };
});

export const tradeStock = onCall(CRITICAL_CALL_OPTS, async (request) => {
  const { uid, stockId, type, amount, expectedPrice, idempotencyKey, timestamp, maxMode, quoteId } = request.data;

  // maxMode の場合は「全額（買い）／全株（売り）」をサーバー側の約定価格で確定するため、
  // ここでは数量を確定しない。約定時の最新価格と最新残高を使うことで取りこぼし（残額）を防ぐ。
  const isMaxMode = maxMode === true;
  let exactAmount = BigInt(0);
  if (!isMaxMode) {
    try {
      exactAmount = requirePositiveInteger(amount, "正しい数量を整数で指定してください");
    } catch {
      throw new HttpsError("invalid-argument", "正しい数量を整数で指定してください");
    }
  }

  if (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 128) {
    throw new HttpsError("invalid-argument", "注文IDが不正です");
  }
  if (type !== "BUY" && type !== "SELL") {
    throw new HttpsError("invalid-argument", "取引種別が不正です");
  }
  if (typeof uid !== "string" || !uid || typeof stockId !== "string" || !stockId) {
    throw new HttpsError("invalid-argument", "ユーザーまたは銘柄の指定が不正です");
  }
  if (quoteId !== undefined && (typeof quoteId !== "string" || !quoteId || quoteId.length > 128)) {
    throw new HttpsError("invalid-argument", "見積もりIDが不正です");
  }

  await verifyTradeActor(request.auth, uid);

  // expectedPrice/timestampは旧クライアント互換のため受理するが、約定条件には使用しない。
  // 注文時刻は信頼できるサーバー受信時刻を使用する。
  void expectedPrice;
  void timestamp;

  const userRef = db.collection(COL.users).doc(uid);
  const txRef = userRef.collection("transactions").doc(idempotencyKey);
  const publicTxRef = db.collection("public_transactions").doc(idempotencyKey);
  const settingsRef = db.collection(COL.settings).doc("system");
  const stockRef = db.collection(COL.stocks).doc(stockId);
  const marketRef = db.collection(COL.publicData).doc("market_for_users");
  const quoteRef = db.collection(COL.tradeQuotes).doc(quoteDocumentId(uid, stockId));

  return await db.runTransaction(async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (txSnap.exists) {
      const cachedTrade = txSnap.data()!;
      const cachedUser = await transaction.get(userRef);
      return {
        success: true,
        transactionId: txRef.id,
        cached: true,
        amount: String(cachedTrade.amount),
        price: normalizeTradingPrice(cachedTrade.price),
        totalPoint: String(cachedTrade.totalPoint),
        remainingPoints: cachedUser.exists ? String(cachedUser.data()!.points) : "0",
        warning: cachedUser.exists && cachedUser.data()!.isInClass !== true ? "入室記録がありません。" : undefined,
      };
    }

    const settingsSnap = await transaction.get(settingsRef);
    const stockSnap = await transaction.get(stockRef);
    const userSnap = await transaction.get(userRef);
    const activeQuoteSnap = typeof quoteId === "string" ? await transaction.get(quoteRef) : null;
    const marketSnap = typeof quoteId === "string" ? null : await transaction.get(marketRef);

    let currentPrice: number;
    if (typeof quoteId === "string") {
      if (!activeQuoteSnap?.exists || activeQuoteSnap.data()?.quoteId !== quoteId) {
        throw quoteError("QUOTE_REPLACED", "表示価格が更新されました。新しい価格を確認してください。");
      }
      const quote = activeQuoteSnap.data()!;
      if (quote.usedAt) {
        throw quoteError("QUOTE_USED", "この価格見積もりは使用済みです。新しい価格を取得してください。");
      }
      if (!quote.expiresAt || quote.expiresAt.toMillis() <= Date.now()) {
        throw quoteError("QUOTE_EXPIRED", "表示価格の有効期限が切れました。新しい価格を確認してください。");
      }
      if (quote.uid !== uid || quote.stockId !== stockId) {
        throw quoteError("QUOTE_REPLACED", "表示価格が更新されました。新しい価格を確認してください。");
      }
      currentPrice = normalizeTradingPrice(quote.price);
    } else {
      if (settingsSnap.data()?.tradeQuoteRequired === true) {
        throw quoteError("QUOTE_REQUIRED", "価格の確認が必要です。画面を更新してください。");
      }
      console.warn(`[tradeStock] quoteIdなしの旧形式注文を許可しました: uid=${uid}, stockId=${stockId}`);
      const stock = stockSnap.exists ? ({ ...(stockSnap.data() as StockData), id: stockId }) : null;
      if (!stock) throw new HttpsError("not-found", "銘柄が見つかりません");
      const marketData = marketSnap?.exists ? marketSnap.data()! : {};
      const publicStock = ((marketData.stocks || []) as StockData[]).find((item) => item.id === stockId);
      const runtime = marketData.runtime as Record<string, PriceRuntimeState | null> | undefined;
      currentPrice = normalizeTradingPrice(materializeMarketPrices([publicStock || stock], runtime)[stockId]);
    }

    if (settingsSnap.data()?.globalPhase === "STOP") {
      throw new HttpsError("failed-precondition", "現在、市場は閉まっています。");
    }
    if (!stockSnap.exists) {
      throw new HttpsError("not-found", "銘柄が見つかりません");
    }
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "ユーザーが見つかりません");
    }

    const userData = userSnap.data()!;
    const price = BigInt(currentPrice);
    let newPoints = toExactBigInt(userData.points);
    const inventory = { ...(userData.inventory || {}) };
    let currentStock = toExactBigInt(inventory[stockId]);

    // maxMode は約定価格・最新残高をもとにここで数量を確定する（買い: 全額 / 売り: 全株）
    if (isMaxMode) {
      exactAmount = type === "BUY" ? (price > BigInt(0) ? newPoints / price : BigInt(0)) : currentStock;
      if (exactAmount <= BigInt(0)) {
        throw new HttpsError(
          "failed-precondition",
          type === "BUY" ? "最大数で購入できるポイントが不足しています。" : "最大数で売却できる保有株がありません。"
        );
      }
    }

    const totalCost = price * exactAmount;

    if (type === "BUY") {
      if (newPoints < totalCost) throw new HttpsError("failed-precondition", "ポイント不足");
      newPoints -= totalCost;
      currentStock += exactAmount;
    } else {
      if (currentStock < exactAmount) throw new HttpsError("failed-precondition", "保有株数が足りません！");
      newPoints += totalCost;
      currentStock -= exactAmount;
    }

    inventory[stockId] = currentStock.toString();
    transaction.update(userRef, { points: newPoints.toString(), inventory: inventory });

    const tradeRecord = {
      type,
      stockId,
      price: currentPrice,
      amount: exactAmount.toString(),
      totalPoint: (type === "BUY" ? -totalCost : totalCost).toString(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isUndone: false
    };
    transaction.set(txRef, tradeRecord);
    transaction.set(publicTxRef, { ...tradeRecord, uid });
    if (typeof quoteId === "string") {
      transaction.update(quoteRef, { usedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    return {
      success: true,
      transactionId: txRef.id,
      amount: exactAmount.toString(),
      price: currentPrice,
      totalPoint: (type === "BUY" ? -totalCost : totalCost).toString(),
      remainingPoints: newPoints.toString(),
      warning: userData.isInClass !== true ? "入室記録がありません。" : undefined,
    };
  });
});

export const finalizeAccount = onCall(CALL_OPTS, async (request) => {
  const { uid } = request.data;
  if (!uid) throw new HttpsError("invalid-argument", "UIDが指定されていません");

  // プレイヤー本人、または管理者権限があるかを検証
  try {
    verifyCurrentUser(request.auth, uid);
  } catch {
    try {
      await verifyAdmin(request.auth);
    } catch {
      throw new HttpsError("permission-denied", "このアカウントを操作する権限がありません。");
    }
  }

  const userRef = db.collection(COL.users).doc(uid);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) throw new HttpsError("not-found", "ユーザーが見つかりません");

    const userData = userSnap.data()!;
    if (userData.isFinished) return;

    const prices: Record<string, number> = {};
    const marketSnap = await db.collection(COL.publicData).doc("market_for_users").get();
    if (marketSnap.exists) {
      const marketData = marketSnap.data()!;
      Object.assign(
        prices,
        materializeMarketPrices(
          (marketData.stocks || []) as StockData[],
          marketData.runtime as Record<string, PriceRuntimeState | null> | undefined
        )
      );
    } else {
      const stocksSnap = await db.collection(COL.stocks).get();
      stocksSnap.forEach(s => {
        prices[s.id] = s.data().currentPrice;
      });
    }

    let finalPoints = toExactBigInt(userData.points);
    Object.entries(userData.inventory || {}).forEach(([id, amt]) => {
      finalPoints += BigInt(prices[id] || 0) * toExactBigInt(amt);
    });

    transaction.update(userRef, {
      points: finalPoints.toString(),
      inventory: {},
      isFinished: true,
      lastFinalizeSnapshot: {
        pointsBefore: toExactBigInt(userData.points).toString(),
        inventoryBefore: { ...(userData.inventory || {}) },
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        isUndone: false
      }
    });
  });
  return { success: true };
});

export const undoFinalizeAccount = onCall(CALL_OPTS, async (request) => {
  const { uid } = request.data;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UIDが指定されていません");
  }

  await verifyAdmin(request.auth);

  const userRef = db.collection(COL.users).doc(uid);

  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "ユーザーが見つかりません");
    }

    const userData = userSnap.data()!;
    const snapshot = userData.lastFinalizeSnapshot;

    if (!userData.isFinished) {
      throw new HttpsError("failed-precondition", "このユーザーは利益確定済みではありません");
    }
    if (!snapshot || snapshot.isUndone === true) {
      throw new HttpsError("failed-precondition", "取り消せる利益確定がありません");
    }

    transaction.update(userRef, {
      points: toExactBigInt(snapshot.pointsBefore).toString(),
      inventory: { ...(snapshot.inventoryBefore || {}) },
      isFinished: false,
      "lastFinalizeSnapshot.isUndone": true,
      "lastFinalizeSnapshot.undoneAt": admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

export const markTicketUsed = onCall(CALL_OPTS, async (request) => {
  const { uid } = request.data;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "UIDが指定されていません");
  }

  try {
    verifyCurrentUser(request.auth, uid);
  } catch {
    try {
      await verifyAdmin(request.auth);
    } catch {
      throw new HttpsError("permission-denied", "このチケットを使用する権限がありません。");
    }
  }

  const userRef = db.collection(COL.users).doc(uid);
  await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "ユーザーが見つかりません");
    }
    if (userSnap.data()?.isTicketUsed === true) return;
    transaction.update(userRef, {
      isTicketUsed: true,
      ticketUsedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { success: true };
});

export const undoTransaction = onCall(CALL_OPTS, async (request) => {
  const { uid, transactionId } = request.data;
  if (!uid || !transactionId) throw new HttpsError("invalid-argument", "パラメーター不足");

  await verifyAdmin(request.auth);

  const userRef = db.collection(COL.users).doc(uid);
  const txRef = userRef.collection("transactions").doc(transactionId);
  const publicTxRef = db.collection("public_transactions").doc(transactionId);

  return await db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const txSnap = await transaction.get(txRef);

    if (!userSnap.exists || !txSnap.exists) {
      throw new HttpsError("not-found", "ユーザーまたは取引履歴が見つかりません");
    }

    const userData = userSnap.data()!;
    const txData = txSnap.data()!;

    if (txData.isUndone) {
      throw new HttpsError("failed-precondition", "既に取消済みの取引です");
    }

    let newPoints = toExactBigInt(userData.points);
    const inventory = { ...(userData.inventory || {}) };
    let currentStock = toExactBigInt(inventory[txData.stockId]);
    const txAmount = toExactBigInt(txData.amount);
    const txTotalPoint = toExactBigInt(txData.totalPoint);
    const txTotalAbs = txTotalPoint < BigInt(0) ? -txTotalPoint : txTotalPoint;

    if (txData.type === "BUY") {
      if (currentStock < txAmount) throw new HttpsError("failed-precondition", "既に株が売却されているため取消できません");
      newPoints += txTotalAbs;
      currentStock -= txAmount;
    } else {
      if (newPoints < txTotalAbs) throw new HttpsError("failed-precondition", "ポイントが不足しているため取消できません");
      newPoints -= txTotalAbs;
      currentStock += txAmount;
    }

    inventory[txData.stockId] = currentStock.toString();

    transaction.update(userRef, { points: newPoints.toString(), inventory: inventory });
    transaction.update(txRef, { isUndone: true });
    transaction.set(publicTxRef, { isUndone: true }, { merge: true });

    const cancelTxRef = userRef.collection("transactions").doc();
    const cancelRecord = {
      type: txData.type === "BUY" ? "SELL" : "BUY",
      stockId: txData.stockId,
      price: txData.price,
      amount: txAmount.toString(),
      totalPoint: (txData.type === "BUY" ? txTotalAbs : -txTotalAbs).toString(),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      isUndone: true,
      memo: "SYSTEM_UNDO"
    };
    transaction.set(cancelTxRef, cancelRecord);
    transaction.set(db.collection("public_transactions").doc(cancelTxRef.id), { ...cancelRecord, uid });

    return { success: true };
  });
});
