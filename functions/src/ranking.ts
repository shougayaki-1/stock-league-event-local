import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { COL } from "./collections";
import { compareExact, toExactString } from "./exact";
import { StockData, UserData } from "./types";
import { calculateTotalAssets } from "./rankingValuation";
import { ECO_RANKING_INTERVAL_MS, getSystemSettings, isEcoEnabled } from "./ecoConfig";

const db = admin.firestore();
const PUBLIC_RANKING_LIMIT = 50;

const RANKING_FIELDS = ["courseType", "isFinished", "nickname", "points", "shortId"] as const;

type RankingUser = Pick<UserData, "uid" | "shortId" | "nickname" | "points" | "inventory" | "courseType" | "isFinished"> & {
  totalAssets: string;
};

const hasRankingFieldChanged = (
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
) => {
  if (!before || !after) return true;
  return RANKING_FIELDS.some((field) => before[field] !== after[field])
    || JSON.stringify(before.inventory || {}) !== JSON.stringify(after.inventory || {});
};

const hasStockPriceChanged = (
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
) => !before || !after || before.currentPrice !== after.currentPrice;

export const aggregateRanking = async () => {
  const [usersSnap, stocksSnap] = await Promise.all([
    db.collection(COL.users).get(),
    db.collection(COL.stocks).get(),
  ]);
  const pricesByStockId = new Map<string, unknown>(
    stocksSnap.docs.map((doc) => [doc.id, (doc.data() as Partial<StockData>).currentPrice])
  );
  const usersList: RankingUser[] = usersSnap.docs.map((doc) => {
    const user = doc.data() as Partial<UserData>;
    const inventory = user.inventory || {};
    return {
      uid: typeof user.uid === "string" ? user.uid : doc.id,
      shortId: typeof user.shortId === "string" ? user.shortId : "",
      nickname: typeof user.nickname === "string" ? user.nickname : "名無し",
      points: toExactString(user.points),
      inventory,
      totalAssets: calculateTotalAssets(user.points, inventory, pricesByStockId),
      courseType: user.courseType === "INSIDER" ? "INSIDER" : "TRADER",
      isFinished: user.isFinished === true,
    };
  });

  usersList.sort((a, b) => compareExact(b.totalAssets, a.totalAssets));

  await db.collection(COL.publicData).doc("ranking").set({
    users: usersList.slice(0, PUBLIC_RANKING_LIMIT),
    totalAgents: usersList.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

const rankingThrottleRef = () => db.collection(COL.internal).doc("tick_lock");

/**
 * ecoMode の間、ランキングの全スキャン集計を「数分に1回」に間引く。
 * 全呼び出し元（ハートビート・取引トリガー）で共有のスロットル時刻
 * （internal/tick_lock.lastRankingAt）を参照し、間隔内の連続要求はスキップする。
 * 通常モードでは間引かず即時集計する。
 */
export const aggregateRankingThrottled = async (): Promise<void> => {
  const settings = await getSystemSettings();
  if (!isEcoEnabled(settings)) {
    await aggregateRanking();
    return;
  }

  const now = Date.now();
  const shouldRun = await db.runTransaction(async (transaction) => {
    const ref = rankingThrottleRef();
    const snap = await transaction.get(ref);
    const lastRankingAt = snap.data()?.lastRankingAt?.toMillis?.() ?? null;
    if (lastRankingAt !== null && now - lastRankingAt < ECO_RANKING_INTERVAL_MS) {
      return false;
    }
    transaction.set(ref, { lastRankingAt: admin.firestore.Timestamp.fromMillis(now) }, { merge: true });
    return true;
  });

  if (shouldRun) await aggregateRanking();
};

export const onUserRankingFieldsWrite = onDocumentWritten(
  {
    document: `${COL.users}/{uid}`,
    region: "asia-northeast1",
    timeoutSeconds: 60,
  },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!hasRankingFieldChanged(before, after)) return;
    await aggregateRankingThrottled();
  }
);

/** 株価変動でも保有銘柄の評価額が変わるため、ランキングを更新する。 */
export const onStockPriceRankingWrite = onDocumentWritten(
  {
    document: `${COL.stocks}/{stockId}`,
    region: "asia-northeast1",
    timeoutSeconds: 60,
  },
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : undefined;
    const after = event.data?.after.exists ? event.data.after.data() : undefined;
    if (!hasStockPriceChanged(before, after)) return;
    // ecoMode 中は「株価変動ごとの全スキャン」（銘柄数×毎分）を止め、
    // 評価額の反映は定期集計（ハートビート）に委ねる。ここが最大の削減。
    const settings = await getSystemSettings();
    if (isEcoEnabled(settings)) return;
    await aggregateRanking();
  }
);
