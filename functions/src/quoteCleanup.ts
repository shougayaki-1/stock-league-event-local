import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { COL } from "./collections";

const db = admin.firestore();
const BATCH_SIZE = 400;
const MAX_BATCHES_PER_RUN = 10;

export async function deleteExpiredTradeQuotes(now = admin.firestore.Timestamp.now()) {
  let deletedCount = 0;
  for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_RUN; batchIndex += 1) {
    const expired = await db.collection(COL.tradeQuotes)
      .where("expiresAt", "<=", now)
      .limit(BATCH_SIZE)
      .get();
    if (expired.empty) return deletedCount;

    const batch = db.batch();
    expired.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deletedCount += expired.size;
    if (expired.size < BATCH_SIZE) return deletedCount;
  }
  console.warn("[cleanupExpiredTradeQuotes] 1回の削除上限に達しました。残りは次回処理します。");
  return deletedCount;
}

export const cleanupExpiredTradeQuotes = onSchedule({
  schedule: "every 5 minutes",
  region: "asia-northeast1",
  timeoutSeconds: 60,
}, async () => {
  await deleteExpiredTradeQuotes();
});
