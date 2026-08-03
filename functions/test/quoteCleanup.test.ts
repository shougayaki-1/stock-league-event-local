import { randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { beforeEach, describe, expect, it } from "vitest";
import { adminDb, clearAllEmulatorData } from "./helpers/emulator";
import { deleteExpiredTradeQuotes } from "../lib/quoteCleanup.js";

describe("deleteExpiredTradeQuotes", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
  });

  it("期限切れ見積もりだけを削除する", async () => {
    const nowMillis = Date.now();
    const expiredRef = adminDb().collection("trade_quotes").doc(`expired-${randomUUID()}`);
    const activeRef = adminDb().collection("trade_quotes").doc(`active-${randomUUID()}`);
    await Promise.all([
      expiredRef.set({ expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis - 1) }),
      activeRef.set({ expiresAt: admin.firestore.Timestamp.fromMillis(nowMillis + 10_000) }),
    ]);

    const deletedCount = await deleteExpiredTradeQuotes(admin.firestore.Timestamp.fromMillis(nowMillis));

    expect(deletedCount).toBe(1);
    expect((await expiredRef.get()).exists).toBe(false);
    expect((await activeRef.get()).exists).toBe(true);
  });
});
