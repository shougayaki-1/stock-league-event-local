import * as admin from "firebase-admin";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminDb,
  call,
  clearAllEmulatorData,
  fns,
  seedMarket,
  seedSystemSettings,
} from "./helpers/emulator";

interface TriggerScenarioEventReq {
  eventId: string;
  part?: "ALL" | "MAIN" | "POST_NEWS";
}

const triggerScenarioEvent = (data: TriggerScenarioEventReq) =>
  call<TriggerScenarioEventReq, { success: boolean }>(fns.triggerScenarioEvent, data, {
    uid: "admin",
    token: { admin: true },
  });

describe("triggerScenarioEvent", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ globalPhase: "RUNNING", scenarioMode: "MANUAL" });
    await seedMarket([{ id: "S1", name: "テスト銘柄", currentPrice: 100 }]);
  });

  it("MAINは後出しニュースを配信せず、POST_NEWSは後出しだけを即時配信する", async () => {
    const eventRef = await adminDb().collection("events").add({
      time: admin.firestore.Timestamp.now(),
      publicNews: { title: "表ニュース", body: "表本文" },
      postNews: { title: "後出しニュース", body: "後出し本文", delaySeconds: 180 },
      priceChanges: null,
      isProcessed: false,
    });

    await triggerScenarioEvent({ eventId: eventRef.id, part: "MAIN" });

    let newsSnap = await adminDb().collection("news").orderBy("timestamp", "asc").get();
    expect(newsSnap.docs.map(doc => doc.data().kind)).toEqual(["PUBLIC"]);
    expect(newsSnap.docs.map(doc => doc.data().title)).toEqual(["表ニュース"]);
    expect((await adminDb().collection("scheduled_post_news").get()).size).toBe(0);

    let eventSnap = await eventRef.get();
    expect(eventSnap.data()?.processedParts).toMatchObject({ main: true });
    expect(eventSnap.data()?.isProcessed).toBe(false);

    await triggerScenarioEvent({ eventId: eventRef.id, part: "POST_NEWS" });

    newsSnap = await adminDb().collection("news").orderBy("timestamp", "asc").get();
    expect(newsSnap.docs.map(doc => doc.data().kind)).toEqual(["PUBLIC", "POST"]);
    expect(newsSnap.docs.map(doc => doc.data().title)).toEqual(["表ニュース", "後出しニュース"]);

    eventSnap = await eventRef.get();
    expect(eventSnap.data()?.processedParts).toMatchObject({ main: true, postNews: true });
    expect(eventSnap.data()?.isProcessed).toBe(true);
  });

  it("新しい表ニュースを配信すると前回の続報と未配信の続報予約を削除する", async () => {
    await adminDb().collection("news").add({
      title: "前回の表ニュース",
      body: "前回の表本文",
      timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 3000),
      target: "ALL",
      kind: "PUBLIC",
    });
    await adminDb().collection("news").add({
      title: "前回の続報",
      body: "前回の続報本文",
      timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 2000),
      target: "ALL",
      kind: "POST",
    });
    await adminDb().collection("scheduled_post_news").add({
      title: "未配信の古い続報",
      body: "未配信本文",
      deliverAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60000),
      timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 1000),
      isDelivered: false,
      kind: "POST",
    });
    await adminDb().collection("scheduled_post_news").add({
      title: "配信済み予約ログ",
      body: "ログ本文",
      deliverAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60000),
      deliveredAt: admin.firestore.Timestamp.fromMillis(Date.now() - 30000),
      timestamp: admin.firestore.Timestamp.fromMillis(Date.now() - 120000),
      isDelivered: true,
      kind: "POST",
    });

    const eventRef = await adminDb().collection("events").add({
      time: admin.firestore.Timestamp.now(),
      publicNews: { title: "新しい表ニュース", body: "新しい表本文" },
      priceChanges: null,
      isProcessed: false,
    });

    await triggerScenarioEvent({ eventId: eventRef.id, part: "MAIN" });

    const newsSnap = await adminDb().collection("news").orderBy("timestamp", "asc").get();
    expect(newsSnap.docs.map(doc => doc.data().title)).toEqual(["前回の表ニュース", "新しい表ニュース"]);
    expect(newsSnap.docs.map(doc => doc.data().kind)).toEqual(["PUBLIC", "PUBLIC"]);

    const scheduledSnap = await adminDb().collection("scheduled_post_news").get();
    expect(scheduledSnap.docs.map(doc => doc.data().title)).toEqual(["配信済み予約ログ"]);
  });

  it("当選した分岐の事後ニュースだけを予約し、抽選結果をイベントに保存する", async () => {
    const eventRef = await adminDb().collection("events").add({
      time: admin.firestore.Timestamp.now(),
      publicNews: { title: "表ニュース", body: "表本文" },
      postNews: { title: "共通ニュース", body: "共通本文", delaySeconds: 180 },
      priceChanges: [{
        stockId: "S1",
        branches: [
          {
            label: "成功",
            probability: 100,
            changePercent: 20,
            deadlineMinutes: 5,
            postNews: { title: "成功ニュース", body: "成功本文", delaySeconds: 60 },
          },
          {
            label: "失敗",
            probability: 0,
            changePercent: -10,
            deadlineMinutes: 5,
            postNews: { title: "失敗ニュース", body: "失敗本文", delaySeconds: 60 },
          },
        ],
      }],
      isProcessed: false,
    });

    await triggerScenarioEvent({ eventId: eventRef.id, part: "ALL" });

    const scheduledSnap = await adminDb().collection("scheduled_post_news").get();
    expect(scheduledSnap.docs.map(doc => doc.data().title)).toEqual(["成功ニュース"]);
    expect(scheduledSnap.docs[0].data().body).toBe("成功本文");

    const eventSnap = await eventRef.get();
    expect(eventSnap.data()?.selectedBranches).toEqual([{
      stockId: "S1",
      priceChangeIndex: 0,
      branchIndex: 0,
      branchLabel: "成功",
    }]);
    expect(eventSnap.data()?.processedParts).toMatchObject({ main: true, postNews: true });
    expect(eventSnap.data()?.isProcessed).toBe(true);
  });
});
