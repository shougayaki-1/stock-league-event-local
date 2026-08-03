// functions/test/trade.test.ts
//
// tradeStock / finalizeAccount / undoFinalizeAccount / undoTransaction / markTicketUsed
// を Firestore + Auth Emulator に対して実結合でテストする。
// Cloud Functions のハンドラは Functions Emulator を経由せず直接呼び出す（詳細は helpers/emulator.ts 参照）。
// 実行: npm run test:functions (ルートから)

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import {
  adminDb,
  call,
  clearAllEmulatorData,
  fns,
  seedMarket,
  seedSystemSettings,
  seedUser,
} from "./helpers/emulator";

interface TradeReq {
  uid: string;
  stockId: string;
  type: "BUY" | "SELL";
  amount?: number;
  expectedPrice?: number;
  idempotencyKey: string;
  timestamp?: number;
  maxMode?: boolean;
  quoteId?: string;
}
interface TradeRes {
  success: boolean;
  transactionId: string;
  cached?: boolean;
  amount: string;
  price: number;
  remainingPoints: string;
  warning?: string;
}

interface QuoteRes {
  quoteId: string;
  price: number;
  issuedAtMillis: number;
  expiresAtMillis: number;
}

const tradeStock = (data: TradeReq, uid?: string, token?: Record<string, unknown>) =>
  call<TradeReq, TradeRes>(fns.tradeStock, data, uid ? { uid, token } : undefined);
const quoteStockPrice = (data: { uid: string; stockId: string }, uid?: string, token?: Record<string, unknown>) =>
  call<{ uid: string; stockId: string }, QuoteRes>(fns.quoteStockPrice, data, uid ? { uid, token } : undefined);
const finalizeAccount = (data: { uid: string }, callerUid?: string, token?: Record<string, unknown>) =>
  call<{ uid: string }, { success: boolean }>(fns.finalizeAccount, data, callerUid ? { uid: callerUid, token } : undefined);
const undoFinalizeAccount = (data: { uid: string }, callerUid?: string, token?: Record<string, unknown>) =>
  call<{ uid: string }, { success: boolean }>(fns.undoFinalizeAccount, data, callerUid ? { uid: callerUid, token } : undefined);
const undoTransaction = (
  data: { uid: string; transactionId: string },
  callerUid?: string,
  token?: Record<string, unknown>
) => call<{ uid: string; transactionId: string }, { success: boolean }>(fns.undoTransaction, data, callerUid ? { uid: callerUid, token } : undefined);
const markTicketUsed = (data: { uid: string }, callerUid?: string, token?: Record<string, unknown>) =>
  call<{ uid: string }, { success: boolean }>(fns.markTicketUsed, data, callerUid ? { uid: callerUid, token } : undefined);

// 検証用の読み取りは Admin SDK（Rulesをバイパス）で行う。バックエンドの実状態のみを確認する。
async function getUser(uid: string) {
  const snap = await adminDb().collection("users").doc(uid).get();
  return snap.data() as
    | { points: string; inventory: Record<string, string>; isFinished?: boolean; isTicketUsed?: boolean }
    | undefined;
}

async function countTransactions(uid: string) {
  const snap = await adminDb().collection("users").doc(uid).collection("transactions").get();
  return snap.size;
}

async function getPublicTransaction(transactionId: string) {
  const snap = await adminDb().collection("public_transactions").doc(transactionId).get();
  return snap.data();
}

const STOCK_ID = "S1";

describe("tradeStock", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ globalPhase: "RUNNING", slippageTolerance: 0.05 });
    await seedMarket([{ id: STOCK_ID, name: "テスト銘柄", currentPrice: 100 }]);
  });

  it("BUY: ポイントが厳密に減り保有株が増える", async () => {
    const uid = `buyer-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const res = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 3,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    expect(res.data.success).toBe(true);
    expect(res.data.amount).toBe("3");
    expect(res.data.price).toBe(100);
    expect(res.data.remainingPoints).toBe("700");
    const user = await getUser(uid);
    expect(user?.points).toBe("700"); // 1000 - 100*3
    expect(user?.inventory[STOCK_ID]).toBe("3");
    expect((await getPublicTransaction(res.data.transactionId))?.uid).toBe(uid);
  });

  it("expectedPriceとtimestampを送らなくてもサーバー時刻・最新価格で約定する", async () => {
    const uid = `server-time-${randomUUID()}`;
    await seedUser(uid, { points: "1000", isInClass: true });

    const res = await tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 1,
      idempotencyKey: randomUUID(),
    }, uid);

    expect(res.data.price).toBe(100);
    expect(res.data.remainingPoints).toBe("900");
    expect(res.data.warning).toBeUndefined();
  });

  it("SELL: ポイントが厳密に増え保有株が減る", async () => {
    const uid = `seller-${randomUUID()}`;
    await seedUser(uid, { points: "1000", inventory: { [STOCK_ID]: "10" } });

    const res = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "SELL",
        amount: 4,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    expect(res.data.success).toBe(true);
    expect(res.data.amount).toBe("4");
    expect(res.data.price).toBe(100);
    expect(res.data.remainingPoints).toBe("1400");
    const user = await getUser(uid);
    expect(user?.points).toBe("1400"); // 1000 + 100*4
    expect(user?.inventory[STOCK_ID]).toBe("6");
  });

  it("冪等性: 同一idempotencyKeyで2回叩いても残高は1回分しか変わらない", async () => {
    const uid = `idem-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });
    const idempotencyKey = randomUUID();
    const req: TradeReq = {
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 2,
      expectedPrice: 100,
      idempotencyKey,
      timestamp: Date.now(),
    };

    const first = await tradeStock(req, uid);
    const second = await tradeStock(req, uid);

    expect(first.data.cached).toBeFalsy();
    expect(second.data.cached).toBe(true);
    const user = await getUser(uid);
    expect(user?.points).toBe("800"); // 1000 - 100*2 のみ（2回目は反映されない）
    expect(await countTransactions(uid)).toBe(1);
  });

  it("表示価格との差にかかわらず、現在の約定価格で注文を受け付ける", async () => {
    const uid = `slip-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const res = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 1,
        expectedPrice: 1, // 実勢100と大きく乖離していても約定を妨げない
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    expect(res.data.success).toBe(true);
    const user = await getUser(uid);
    expect(user?.points).toBe("900"); // 常にサーバー側の現在価格100ptで約定
  });

  it("市場がSTOPのときは取引できない", async () => {
    await seedSystemSettings({ globalPhase: "STOP", slippageTolerance: 0.05 });
    const uid = `stop-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    await expect(
      tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        uid
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("見積もり価格で約定し、見積もりを同じトランザクションで消費する", async () => {
    const uid = `quoted-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });
    await seedSystemSettings({ globalPhase: "RUNNING", tradeQuoteRequired: true });

    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const result = await tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 2,
      idempotencyKey: randomUUID(),
      quoteId: quote.data.quoteId,
    }, uid);

    expect(result.data.price).toBe(quote.data.price);
    expect(result.data.remainingPoints).toBe("800");
    const quoteSnap = await adminDb().collection("trade_quotes").where("quoteId", "==", quote.data.quoteId).get();
    expect(quoteSnap.docs[0]?.data().usedAt).toBeDefined();
  });

  it("必須化後はquoteIdなしの新規注文を拒否する", async () => {
    const uid = `quote-required-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ globalPhase: "RUNNING", tradeQuoteRequired: true });

    await expect(tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 1,
      idempotencyKey: randomUUID(),
    }, uid)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "QUOTE_REQUIRED" },
    });
  });

  it("期限切れ見積もりをQUOTE_EXPIREDで拒否する", async () => {
    const uid = `quote-expired-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ globalPhase: "RUNNING", tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const quoteQuery = await adminDb().collection("trade_quotes").where("quoteId", "==", quote.data.quoteId).get();
    await quoteQuery.docs[0].ref.update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });

    await expect(tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 1,
      idempotencyKey: randomUUID(),
      quoteId: quote.data.quoteId,
    }, uid)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "QUOTE_EXPIRED" },
    });
  });

  it("同じユーザー・銘柄の見積もり再取得を1秒間制限する", async () => {
    const uid = `quote-rate-${randomUUID()}`;
    await seedUser(uid);
    await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);

    await expect(quoteStockPrice({ uid, stockId: STOCK_ID }, uid))
      .rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("新しい見積もりで置換されたIDをQUOTE_REPLACEDで拒否する", async () => {
    const uid = `quote-replaced-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ tradeQuoteRequired: true });
    const first = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const quoteQuery = await adminDb().collection("trade_quotes").where("quoteId", "==", first.data.quoteId).get();
    await quoteQuery.docs[0].ref.update({ issuedAt: admin.firestore.Timestamp.fromMillis(Date.now() - 2_000) });
    await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);

    await expect(tradeStock({
      uid, stockId: STOCK_ID, type: "BUY", amount: 1,
      idempotencyKey: randomUUID(), quoteId: first.data.quoteId,
    }, uid)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "QUOTE_REPLACED" },
    });
  });

  it("使用済み見積もりを別注文で再利用するとQUOTE_USEDで拒否する", async () => {
    const uid = `quote-used-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    await tradeStock({
      uid, stockId: STOCK_ID, type: "BUY", amount: 1,
      idempotencyKey: randomUUID(), quoteId: quote.data.quoteId,
    }, uid);

    await expect(tradeStock({
      uid, stockId: STOCK_ID, type: "BUY", amount: 1,
      idempotencyKey: randomUUID(), quoteId: quote.data.quoteId,
    }, uid)).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "QUOTE_USED" },
    });
  });

  it("MAX注文の数量をサーバーが見積もり価格と最新残高から確定する", async () => {
    const uid = `quote-max-${randomUUID()}`;
    await seedUser(uid, { points: "250" });
    await seedSystemSettings({ tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const result = await tradeStock({
      uid, stockId: STOCK_ID, type: "BUY", amount: 999,
      idempotencyKey: randomUUID(), quoteId: quote.data.quoteId, maxMode: true,
    }, uid);

    expect(result.data.amount).toBe("2");
    expect(result.data.price).toBe(quote.data.price);
    expect(result.data.remainingPoints).toBe("50");
  });

  it("同じ見積もりの同時注文は1件だけが消費できる", async () => {
    const uid = `quote-race-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const makeRequest = () => tradeStock({
      uid, stockId: STOCK_ID, type: "BUY", amount: 1,
      idempotencyKey: randomUUID(), quoteId: quote.data.quoteId,
    }, uid);

    const results = await Promise.allSettled([makeRequest(), makeRequest()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await countTransactions(uid)).toBe(1);
  });

  it("成功済み注文の再送は見積もり期限切れ・閉場・銘柄削除後もキャッシュを返す", async () => {
    const uid = `quote-idempotent-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ globalPhase: "RUNNING", tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    const idempotencyKey = randomUUID();
    const request = {
      uid,
      stockId: STOCK_ID,
      type: "BUY" as const,
      amount: 1,
      idempotencyKey,
      quoteId: quote.data.quoteId,
    };
    const first = await tradeStock(request, uid);

    await adminDb().collection("settings").doc("system").update({ globalPhase: "STOP" });
    await adminDb().collection("stocks").doc(STOCK_ID).delete();
    const quoteQuery = await adminDb().collection("trade_quotes").where("quoteId", "==", quote.data.quoteId).get();
    await quoteQuery.docs[0].ref.update({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });

    const replay = await tradeStock(request, uid);
    expect(replay.data.cached).toBe(true);
    expect(replay.data.transactionId).toBe(first.data.transactionId);
    expect(await countTransactions(uid)).toBe(1);
  });

  it("見積もり発行後に市場がSTOPになった注文は拒否し、見積もりを消費しない", async () => {
    const uid = `quote-stop-${randomUUID()}`;
    await seedUser(uid);
    await seedSystemSettings({ globalPhase: "RUNNING", tradeQuoteRequired: true });
    const quote = await quoteStockPrice({ uid, stockId: STOCK_ID }, uid);
    await adminDb().collection("settings").doc("system").update({ globalPhase: "STOP" });

    await expect(tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 1,
      idempotencyKey: randomUUID(),
      quoteId: quote.data.quoteId,
    }, uid)).rejects.toMatchObject({ code: "failed-precondition" });

    const quoteSnap = await adminDb().collection("trade_quotes").where("quoteId", "==", quote.data.quoteId).get();
    expect(quoteSnap.docs[0]?.data().usedAt).toBeUndefined();
  });

  it("未来のtimestampでもサーバー時刻を使って約定する", async () => {
    const uid = `future-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const res = await tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now() + 10_000,
        },
        uid
      );
    expect(res.data.success).toBe(true);
  });

  it("古いtimestampでもサーバー時刻を使って約定する", async () => {
    const uid = `stale-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const res = await tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now() - 70_000,
        },
        uid
      );
    expect(res.data.success).toBe(true);
  });

  it("ポイント不足のBUYは拒否される", async () => {
    const uid = `poor-${randomUUID()}`;
    await seedUser(uid, { points: "50" });

    await expect(
      tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        uid
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("保有株不足のSELLは拒否される", async () => {
    const uid = `noholding-${randomUUID()}`;
    await seedUser(uid, { points: "1000", inventory: {} });

    await expect(
      tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "SELL",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        uid
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("maxMode BUY: 全額で買える最大数量を自動算出する", async () => {
    const uid = `maxbuy-${randomUUID()}`;
    await seedUser(uid, { points: "250" }); // 100円株を2株買って50余る

    const res = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        expectedPrice: 100,
        maxMode: true,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    expect(res.data.success).toBe(true);
    expect(res.data.amount).toBe("2");
    expect(res.data.price).toBe(100);
    expect(res.data.remainingPoints).toBe("50");
    const user = await getUser(uid);
    expect(user?.inventory[STOCK_ID]).toBe("2");
    expect(user?.points).toBe("50");
  });

  it("maxMode SELL: 保有株を全株売却する", async () => {
    const uid = `maxsell-${randomUUID()}`;
    await seedUser(uid, { points: "0", inventory: { [STOCK_ID]: "7" } });

    const res = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "SELL",
        expectedPrice: 100,
        maxMode: true,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    expect(res.data.success).toBe(true);
    const user = await getUser(uid);
    expect(user?.inventory[STOCK_ID]).toBe("0");
    expect(user?.points).toBe("700");
  });

  it("maxMode BUYでポイントが株価未満なら拒否される", async () => {
    const uid = `maxbuypoor-${randomUUID()}`;
    await seedUser(uid, { points: "10" }); // 株価100未満で1株も買えない

    await expect(
      tradeStock(
        {
          uid,
          stockId: STOCK_ID,
          type: "BUY",
          expectedPrice: 100,
          maxMode: true,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        uid
      )
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("他人のuidを指定した取引は権限がなければ拒否される", async () => {
    const victimUid = `victim-${randomUUID()}`;
    await seedUser(victimUid, { points: "1000" });
    const attackerUid = `attacker-${randomUUID()}`;

    await expect(
      tradeStock(
        {
          uid: victimUid,
          stockId: STOCK_ID,
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        attackerUid
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("admin権限があれば他人のuidでも代理取引できる（窓口端末想定）", async () => {
    const targetUid = `target-${randomUUID()}`;
    await seedUser(targetUid, { points: "1000" });
    const staffUid = `staff-${randomUUID()}`;

    const res = await tradeStock(
      {
        uid: targetUid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 1,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      staffUid,
      { admin: true }
    );

    expect(res.data.success).toBe(true);
  });

  it("terminalAdmin権限があれば他人のuidでも代理取引できる（端末専用アカウント想定）", async () => {
    const targetUid = `terminal-target-${randomUUID()}`;
    await seedUser(targetUid, { points: "1000" });
    const staffUid = `terminal-staff-${randomUUID()}`;

    const res = await tradeStock(
      {
        uid: targetUid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 1,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      staffUid,
      { terminalAdmin: true }
    );

    expect(res.data.success).toBe(true);
  });

  it("未認証では取引できない", async () => {
    const uid = `noauth-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    await expect(
      tradeStock({
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 1,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      })
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("存在しない銘柄は not-found で拒否される", async () => {
    const uid = `nostock-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    await expect(
      tradeStock(
        {
          uid,
          stockId: "NO_SUCH_STOCK",
          type: "BUY",
          amount: 1,
          expectedPrice: 100,
          idempotencyKey: randomUUID(),
          timestamp: Date.now(),
        },
        uid
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("非整数の現在価格でも四捨五入して取引できる", async () => {
    await seedMarket([{ id: STOCK_ID, name: "テスト銘柄", currentPrice: 100.5 }]);
    const uid = `nonint-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const res = await tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 1,
      expectedPrice: 100.5,
      idempotencyKey: randomUUID(),
      timestamp: Date.now(),
    }, uid);

    expect(res.data.success).toBe(true);
    const user = await getUser(uid);
    expect(user?.points).toBe("899"); // 100.5pt は 101pt に丸めて約定
  });
});

describe("finalizeAccount / undoFinalizeAccount", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ globalPhase: "RUNNING" });
    await seedMarket([{ id: STOCK_ID, name: "テスト銘柄", currentPrice: 100 }]);
  });

  it("finalize: 保有株を最新価格で清算しポイントに合算する", async () => {
    const uid = `fin-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: { [STOCK_ID]: "5" } });

    const res = await finalizeAccount({ uid }, uid);
    expect(res.data.success).toBe(true);

    const user = await getUser(uid);
    expect(user?.points).toBe("600"); // 100 + 100*5
    expect(user?.inventory).toEqual({});
    expect(user?.isFinished).toBe(true);
  });

  it("finalize済みユーザーに再度finalizeしても二重清算されない", async () => {
    const uid = `fin2-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: { [STOCK_ID]: "5" } });

    await finalizeAccount({ uid }, uid);
    await finalizeAccount({ uid }, uid);

    const user = await getUser(uid);
    expect(user?.points).toBe("600");
  });

  it("finalize後も取引でき、利益確定済みの記録は保持される", async () => {
    const uid = `fin-trade-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: { [STOCK_ID]: "5" } });

    await finalizeAccount({ uid }, uid);
    const res = await tradeStock({
      uid,
      stockId: STOCK_ID,
      type: "BUY",
      amount: 2,
      expectedPrice: 100,
      idempotencyKey: randomUUID(),
      timestamp: Date.now(),
    }, uid);

    expect(res.data.success).toBe(true);
    const user = await getUser(uid);
    expect(user?.points).toBe("400");
    expect(user?.inventory[STOCK_ID]).toBe("2");
    expect(user?.isFinished).toBe(true);
  });

  it("undoFinalizeAccount: adminがスナップショットから復元できる", async () => {
    const uid = `undo-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: { [STOCK_ID]: "5" } });
    await finalizeAccount({ uid }, uid);

    const adminUid = `admin-${randomUUID()}`;
    const res = await undoFinalizeAccount({ uid }, adminUid, { admin: true });
    expect(res.data.success).toBe(true);

    const user = await getUser(uid);
    expect(user?.points).toBe("100");
    expect(user?.inventory[STOCK_ID]).toBe("5");
    expect(user?.isFinished).toBe(false);
  });

  it("undoFinalizeAccount: 非adminは拒否される", async () => {
    const uid = `undo2-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: {}, isFinished: true });
    const attackerUid = `attacker2-${randomUUID()}`;

    await expect(undoFinalizeAccount({ uid }, attackerUid)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it("undoFinalizeAccount: finalize済みでないユーザーは拒否される", async () => {
    const uid = `notfinished-${randomUUID()}`;
    await seedUser(uid, { points: "100", inventory: {}, isFinished: false });
    const adminUid = `admin3-${randomUUID()}`;

    await expect(undoFinalizeAccount({ uid }, adminUid, { admin: true })).rejects.toMatchObject({
      code: "failed-precondition",
    });
  });
});

describe("undoTransaction", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ globalPhase: "RUNNING" });
    await seedMarket([{ id: STOCK_ID, name: "テスト銘柄", currentPrice: 100 }]);
  });

  it("adminはBUY取引を取り消してポイント・保有株を戻せる", async () => {
    const uid = `undotx-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });

    const buyRes = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 3,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    const adminUid = `admin4-${randomUUID()}`;
    const res = await undoTransaction({ uid, transactionId: buyRes.data.transactionId }, adminUid, {
      admin: true,
    });
    expect(res.data.success).toBe(true);

    const user = await getUser(uid);
    expect(user?.points).toBe("1000");
    expect(user?.inventory[STOCK_ID]).toBe("0");
  });

  it("既に取消済みの取引を再度取り消すことはできない", async () => {
    const uid = `undotx2-${randomUUID()}`;
    await seedUser(uid, { points: "1000" });
    const buyRes = await tradeStock(
      {
        uid,
        stockId: STOCK_ID,
        type: "BUY",
        amount: 1,
        expectedPrice: 100,
        idempotencyKey: randomUUID(),
        timestamp: Date.now(),
      },
      uid
    );

    const adminUid = `admin5-${randomUUID()}`;
    await undoTransaction({ uid, transactionId: buyRes.data.transactionId }, adminUid, { admin: true });

    await expect(
      undoTransaction({ uid, transactionId: buyRes.data.transactionId }, adminUid, { admin: true })
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("markTicketUsed", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ globalPhase: "RUNNING" });
  });

  it("本人がチケットを使用済みにできる", async () => {
    const uid = `ticket-${randomUUID()}`;
    await seedUser(uid, {});

    const res = await markTicketUsed({ uid }, uid);
    expect(res.data.success).toBe(true);
    const user = await getUser(uid);
    expect(user?.isTicketUsed).toBe(true);
  });

  it("二重使用してもエラーにならない（冪等）", async () => {
    const uid = `ticket2-${randomUUID()}`;
    await seedUser(uid, {});

    await markTicketUsed({ uid }, uid);
    const res = await markTicketUsed({ uid }, uid);
    expect(res.data.success).toBe(true);
  });
});
