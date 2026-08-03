// test/rules/firestore.test.ts
//
// Firestore security rules を Emulator 上で検証する。
// 実行: npm run test:rules (内部で `firebase emulators:exec --only firestore` を使う)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, doc, getDoc, getDocs, collection, collectionGroup, limit, orderBy, query } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

const PROJECT_ID = "demo-stock-league-event-local-test";

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("users/{uid}", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice-uid"), {
        uid: "alice-uid",
        shortId: "0001",
        nickname: "Alice",
        points: "1000",
        inventory: {},
        courseType: "TRADER",
        isFinished: false,
      });
    });
  });

  it("本人は自分のユーザードキュメントを読める", async () => {
    const alice = testEnv.authenticatedContext("alice-uid");
    await assertSucceeds(getDoc(doc(alice.firestore(), "users/alice-uid")));
  });

  it("他人のユーザードキュメントは読めない", async () => {
    const bob = testEnv.authenticatedContext("bob-uid");
    await assertFails(getDoc(doc(bob.firestore(), "users/alice-uid")));
  });

  it("未ログインではユーザードキュメントを読めない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), "users/alice-uid")));
  });

  it("本人であってもユーザードキュメントへの直接書き込みは禁止（Cloud Functions経由のみ）", async () => {
    const alice = testEnv.authenticatedContext("alice-uid");
    await assertFails(
      setDoc(doc(alice.firestore(), "users/alice-uid"), { points: "999999" }, { merge: true })
    );
  });

  it("adminはユーザードキュメントを読める", async () => {
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    await assertSucceeds(getDoc(doc(admin.firestore(), "users/alice-uid")));
  });
});

describe("users/{uid}/transactions/{txId}", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice-uid/transactions/tx1"), {
        type: "BUY",
        stockId: "S1",
        amount: "10",
      });
    });
  });

  it("本人は自分の取引履歴を読める", async () => {
    const alice = testEnv.authenticatedContext("alice-uid");
    await assertSucceeds(getDoc(doc(alice.firestore(), "users/alice-uid/transactions/tx1")));
  });

  it("他人の取引履歴は読めない", async () => {
    const bob = testEnv.authenticatedContext("bob-uid");
    await assertFails(getDoc(doc(bob.firestore(), "users/alice-uid/transactions/tx1")));
  });

  it("未ログインでは取引履歴を読めない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), "users/alice-uid/transactions/tx1")));
  });

  it("取引履歴への直接書き込みは常に禁止", async () => {
    const alice = testEnv.authenticatedContext("alice-uid");
    await assertFails(
      setDoc(doc(alice.firestore(), "users/alice-uid/transactions/tx2"), { type: "SELL" })
    );
  });

  it("未ログインでも取引履歴へ直接書き込めない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      setDoc(doc(anon.firestore(), "users/alice-uid/transactions/tx2"), { type: "SELL" })
    );
  });
});

describe("news/{newsId} — インサイダーニュースの秘匿", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "news/public1"), { title: "公開ニュース", target: "ALL" });
      await setDoc(doc(ctx.firestore(), "news/insider1"), { title: "インサイダー限定", target: "INSIDER" });
      await setDoc(doc(ctx.firestore(), "users/insider-uid"), {
        uid: "insider-uid",
        courseType: "INSIDER",
      });
      await setDoc(doc(ctx.firestore(), "users/trader-uid"), {
        uid: "trader-uid",
        courseType: "TRADER",
      });
    });
  });

  it("誰でも target=ALL のニュースを読める", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(anon.firestore(), "news/public1")));
  });

  it("TRADERはINSIDER限定ニュースを読めない", async () => {
    const trader = testEnv.authenticatedContext("trader-uid");
    await assertFails(getDoc(doc(trader.firestore(), "news/insider1")));
  });

  it("courseType=INSIDER本人はINSIDER限定ニュースを読める", async () => {
    const insider = testEnv.authenticatedContext("insider-uid");
    await assertSucceeds(getDoc(doc(insider.firestore(), "news/insider1")));
  });

  it("adminはINSIDER限定ニュースを読める", async () => {
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    await assertSucceeds(getDoc(doc(admin.firestore(), "news/insider1")));
  });
});

describe("events/{eventId} — サイネージ用公開読み取り", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "events/ev1"), { isProcessed: false });
    });
  });

  it("一般ユーザーはイベントを読める", async () => {
    const trader = testEnv.authenticatedContext("trader-uid");
    await assertSucceeds(getDoc(doc(trader.firestore(), "events/ev1")));
  });

  it("未ログインでもイベントを読める", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(anon.firestore(), "events/ev1")));
  });

  it("adminはイベントを読める", async () => {
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    await assertSucceeds(getDoc(doc(admin.firestore(), "events/ev1")));
  });

  it("一般ユーザー・未ログインはイベントへ直接書き込めない", async () => {
    const trader = testEnv.authenticatedContext("trader-uid");
    await assertFails(setDoc(doc(trader.firestore(), "events/ev2"), { isProcessed: false }));
    const anon = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(anon.firestore(), "events/ev3"), { isProcessed: false }));
  });
});

describe("admins/{email} — coreAdminのみ書き込み可", () => {
  it("一般admin(coreでない)はadminsへ書き込めない", async () => {
    const generalAdmin = testEnv.authenticatedContext("general-admin-uid", { admin: true });
    await assertFails(
      setDoc(doc(generalAdmin.firestore(), "admins/new-admin@event.local"), { role: "general" })
    );
  });

  it("coreAdminはadminsへ書き込める", async () => {
    const coreAdmin = testEnv.authenticatedContext("core-admin-uid", { coreAdmin: true });
    await assertSucceeds(
      setDoc(doc(coreAdmin.firestore(), "admins/new-admin@event.local"), { role: "general" })
    );
  });
});

describe("admins/{email} Firestoreレコードによる管理者判定（custom claimsを使わない経路）", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "admins/admin@event.local"), { role: "general" });
      await setDoc(doc(ctx.firestore(), "users/alice-uid"), { uid: "alice-uid", courseType: "TRADER" });
      await setDoc(doc(ctx.firestore(), "schedule_sessions/session1"), { name: "day1 午前" });
    });
  });

  it("admins/{email}にレコードがあるユーザーはcustom claims無しでも管理者として非公開データを読める", async () => {
    const admin = testEnv.authenticatedContext("admin-by-record-uid", { email: "admin@event.local" });
    await assertSucceeds(getDoc(doc(admin.firestore(), "schedule_sessions/session1")));
  });

  it("admins/{email}にレコードが無いメールアドレスは管理者として扱われない", async () => {
    const nonAdmin = testEnv.authenticatedContext("someone-uid", { email: "someone@event.local" });
    await assertFails(getDoc(doc(nonAdmin.firestore(), "schedule_sessions/session1")));
  });
});

describe("公開コレクション（未ログインでも read 可）", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "stocks/S1"), { name: "テスト銘柄", currentPrice: 100 });
      await setDoc(doc(ctx.firestore(), "public_data/ranking"), { users: [] });
      await setDoc(doc(ctx.firestore(), "settings/system"), { globalPhase: "STOP" });
      await setDoc(doc(ctx.firestore(), "signages/legacy1"), { name: "旧サイネージ" });
      await setDoc(doc(ctx.firestore(), "public_signages/sig1"), { name: "廊下A" });
      await setDoc(doc(ctx.firestore(), "riddle_rooms/room1"), { title: "謎解き部屋" });
      await setDoc(doc(ctx.firestore(), "ad_videos/ad1"), { fileName: "ad.mp4" });
      await setDoc(doc(ctx.firestore(), "video_library/video1"), { name: "共通動画" });
      await setDoc(doc(ctx.firestore(), "image_library/image1"), { name: "共通画像" });
      await setDoc(doc(ctx.firestore(), "news_presets/preset1"), { name: "表示用ニュース" });
      await setDoc(doc(ctx.firestore(), "schedule_sessions/session1"), { name: "day1 午前" });
    });
  });

  it.each([
    "stocks/S1",
    "public_data/ranking",
    "settings/system",
    "signages/legacy1",
    "public_signages/sig1",
    "riddle_rooms/room1",
    "ad_videos/ad1",
    "video_library/video1",
    "image_library/image1",
    "news_presets/preset1",
  ])("未ログインで %s を読める", async (path) => {
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(getDoc(doc(anon.firestore(), path)));
  });

  it("未ログインではschedule_sessionsを読めない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), "schedule_sessions/session1")));
  });

  it("adminはschedule_sessionsを読める", async () => {
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    await assertSucceeds(getDoc(doc(admin.firestore(), "schedule_sessions/session1")));
  });

  it("terminalAdminはschedule_sessionsを読める", async () => {
    const terminalAdmin = testEnv.authenticatedContext("terminal-admin-uid", { terminalAdmin: true });
    await assertSucceeds(getDoc(doc(terminalAdmin.firestore(), "schedule_sessions/session1")));
  });

  it("一般ユーザー・未ログインはstocksへ書き込めない", async () => {
    const trader = testEnv.authenticatedContext("trader-uid");
    await assertFails(setDoc(doc(trader.firestore(), "stocks/S2"), { name: "新銘柄" }));
    const anon = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(anon.firestore(), "stocks/S3"), { name: "新銘柄" }));
  });

  it("adminはstocksへ書き込める（トップレベルcatch-allの全権限がstocksの個別denyより優先して適用される）", async () => {
    // firestore.rules のコメント通り「管理者はすべてのドキュメントへのフルアクセスを持つ」。
    // /stocks/{stockId} 単体には allow write: if false があるが、Firestore rulesは
    // マッチした全ルールのOR判定のため、{document=**} 側のadmin許可が効いて書き込みが通る。
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    await assertSucceeds(setDoc(doc(admin.firestore(), "stocks/S2"), { name: "新銘柄" }));
  });

  it("一般ユーザー・未ログインはriddle_roomsへ書き込めない", async () => {
    const trader = testEnv.authenticatedContext("trader-uid");
    await assertFails(setDoc(doc(trader.firestore(), "riddle_rooms/room2"), { title: "変更" }));
    const anon = testEnv.unauthenticatedContext();
    await assertFails(setDoc(doc(anon.firestore(), "riddle_rooms/room3"), { title: "変更" }));
  });
});

describe("サイネージ向け公開一覧取得", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice-uid"), {
        uid: "alice-uid",
        shortId: "0001",
        nickname: "Alice",
      });
    });
  });

  it("未ログインではusersコレクション全体をクエリできない", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDocs(collection(anon.firestore(), "users")));
  });

  it("未ログインでは取引履歴のcollection groupをクエリできない", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice-uid/transactions/tx1"), {
        timestamp: 1,
        type: "BUY",
      });
    });
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDocs(query(
      collectionGroup(anon.firestore(), "transactions"),
      orderBy("timestamp", "desc"),
      limit(20)
    )));
  });

  it("未ログインでも匿名化された公開取引フィードを読める", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "public_transactions/tx1"), {
        uid: "alice-uid",
        timestamp: 1,
        type: "BUY",
      });
    });
    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(getDocs(query(
      collection(anon.firestore(), "public_transactions"),
      orderBy("timestamp", "desc"),
      limit(20)
    )));
  });
});

describe("trade_quotes", () => {
  it("一般ユーザーと未ログインクライアントは見積もりを直接読み書きできない", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trade_quotes/quote-1"), {
        uid: "alice-uid",
        stockId: "S1",
        quoteId: "secret-quote",
      });
    });

    const alice = testEnv.authenticatedContext("alice-uid");
    const admin = testEnv.authenticatedContext("admin-uid", { admin: true });
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(alice.firestore(), "trade_quotes/quote-1")));
    await assertFails(setDoc(doc(alice.firestore(), "trade_quotes/quote-2"), { quoteId: "forged" }));
    await assertFails(getDoc(doc(anon.firestore(), "trade_quotes/quote-1")));
    await assertFails(getDoc(doc(admin.firestore(), "trade_quotes/quote-1")));
  });
});
