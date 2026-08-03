// functions/test/users.test.ts
//
// registerAgent / updateAgentNickname / bulkGenerateUsers / loginByShortId / deleteUsers
// を Firestore + Auth Emulator に対して実結合でテストする。
// Cloud Functions のハンドラは Functions Emulator を経由せず直接呼び出す（詳細は helpers/emulator.ts 参照）。
// 実行: npm run test:functions (ルートから)

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { adminAuth, adminDb, call, clearAllEmulatorData, fns, seedSystemSettings, seedUser } from "./helpers/emulator";

const registerAgent = (data: { targetID: string; nickname: string }, callerUid?: string, token?: Record<string, unknown>) =>
  call<typeof data, { success: boolean }>(fns.registerAgent, data, callerUid ? { uid: callerUid, token } : undefined);
const updateAgentNickname = (data: { uid: string; newNickname: string }, callerUid?: string, token?: Record<string, unknown>) =>
  call<typeof data, { success: boolean }>(fns.updateAgentNickname, data, callerUid ? { uid: callerUid, token } : undefined);
const bulkGenerateUsers = (data: { users: { shortId?: string }[] }, callerUid?: string, token?: Record<string, unknown>) =>
  call<
    typeof data,
    { success: boolean; count: number; failedCount: number; users: { uid: string; shortId: string; email: string; password: string }[] }
  >(fns.bulkGenerateUsers, data, callerUid ? { uid: callerUid, token } : undefined);
const loginByShortId = (data: { shortIdAndSuffix: string }) =>
  call<typeof data, { success: boolean; customToken: string; uid: string }>(fns.loginByShortId, data);
const deleteUsers = (data: { uids: string[] }, callerUid?: string, token?: Record<string, unknown>) =>
  call<typeof data, { success: boolean; deletedCount: number }>(fns.deleteUsers, data, callerUid ? { uid: callerUid, token } : undefined);

// 検証用の読み取りは Admin SDK（Rulesをバイパス）で行う。バックエンドの実状態のみを確認する。
async function getUserData(uid: string) {
  const snap = await adminDb().collection("users").doc(uid).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
}

async function authUserExists(uid: string) {
  try {
    await adminAuth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

describe("registerAgent", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ initialPoint: "1000" });
  });

  it("本人はエージェント登録でき、初期ポイント・TRADER・ニックネームが設定される", async () => {
    const uid = `0001-${randomUUID()}`;

    const res = await registerAgent({ targetID: uid, nickname: "たろう" }, uid);
    expect(res.data.success).toBe(true);

    const data = await getUserData(uid);
    expect(data?.points).toBe("1000");
    expect(data?.courseType).toBe("TRADER");
    expect(data?.nickname).toBe("たろう(0001)");
  });

  it("NGワードを含むニックネームはフィルタされる", async () => {
    const uid = `0002-${randomUUID()}`;

    await registerAgent({ targetID: uid, nickname: "死ね" }, uid);
    const data = await getUserData(uid);
    expect(data?.nickname).not.toContain("死ね");
    expect(data?.nickname as string).toMatch(/^エージェント\d+\(0002\)$/);
  });

  it("本人でもadminでもない場合は登録できない", async () => {
    const targetUid = `0003-${randomUUID()}`;
    const attackerUid = `attacker-${randomUUID()}`;

    await expect(
      registerAgent({ targetID: targetUid, nickname: "なりすまし" }, attackerUid)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("updateAgentNickname", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
  });

  it("本人はニックネームを変更できる（shortIdは維持される）", async () => {
    const uid = `0004-${randomUUID()}`;
    await seedUser(uid, { shortId: "0004", nickname: "旧名(0004)" });

    const res = await updateAgentNickname({ uid, newNickname: "新名" }, uid);
    expect(res.data.success).toBe(true);
    const data = await getUserData(uid);
    expect(data?.nickname).toBe("新名(0004)");
  });

  it("adminは他人のニックネームを変更できる", async () => {
    const uid = `0005-${randomUUID()}`;
    await seedUser(uid, { shortId: "0005", nickname: "旧名(0005)" });
    const adminUid = `admin-${randomUUID()}`;

    const res = await updateAgentNickname({ uid, newNickname: "管理者による変更" }, adminUid, { admin: true });
    expect(res.data.success).toBe(true);
    const data = await getUserData(uid);
    expect(data?.nickname).toBe("管理者による変更(0005)");
  });

  it("本人でもadminでもない場合は変更できない", async () => {
    const uid = `0006-${randomUUID()}`;
    await seedUser(uid, { shortId: "0006", nickname: "旧名(0006)" });
    const attackerUid = `attacker2-${randomUUID()}`;

    await expect(
      updateAgentNickname({ uid, newNickname: "乗っ取り" }, attackerUid)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("bulkGenerateUsers", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
    await seedSystemSettings({ initialPoint: "500" });
  });

  it("adminは複数ユーザーを一括生成できる（Auth + Firestore両方）", async () => {
    const adminUid = `admin-bulk-${randomUUID()}`;

    const res = await bulkGenerateUsers({ users: [{ shortId: "1001" }, { shortId: "1002" }] }, adminUid, {
      admin: true,
    });
    expect(res.data.count).toBe(2);
    expect(res.data.users).toHaveLength(2);

    for (const u of res.data.users) {
      expect(await authUserExists(u.uid)).toBe(true);
      const data = await getUserData(u.uid);
      expect(data?.points).toBe("500");
      expect(data?.courseType).toBe("TRADER");
    }
  });

  it("shortIdが4桁以外のエントリはスキップされる", async () => {
    const adminUid = `admin-bulk2-${randomUUID()}`;

    const res = await bulkGenerateUsers({ users: [{ shortId: "12" }, { shortId: "1003" }] }, adminUid, {
      admin: true,
    });
    expect(res.data.count).toBe(1);
    expect(res.data.users[0].shortId).toBe("1003");
  });

  it("非adminは一括生成できない", async () => {
    const attackerUid = `attacker-bulk-${randomUUID()}`;

    await expect(
      bulkGenerateUsers({ users: [{ shortId: "1004" }] }, attackerUid)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("loginByShortId", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
  });

  it("Authアカウント未作成でもカスタムトークンを取得できる", async () => {
    const docId = `0007-${randomUUID().slice(0, 6)}`;
    await seedUser(docId, { shortId: "0007", nickname: `テスト(0007)` });

    expect(await authUserExists(docId)).toBe(false);
    const res = await loginByShortId({ shortIdAndSuffix: docId });
    expect(res.data.success).toBe(true);
    expect(typeof res.data.customToken).toBe("string");
    expect(res.data.uid).toBe(docId);
    expect(await authUserExists(docId)).toBe(false);
  });

  it("存在しないIDはnot-foundになる", async () => {
    await expect(
      loginByShortId({ shortIdAndSuffix: `nonexistent-${randomUUID()}` })
    ).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("deleteUsers（現ブランチの新機能）", () => {
  beforeEach(async () => {
    await clearAllEmulatorData();
  });

  it("adminはFirestoreドキュメントとAuthアカウントの両方を削除できる", async () => {
    const uid = `del-${randomUUID()}`;
    await adminAuth().createUser({ uid });
    await seedUser(uid, {});
    expect(await authUserExists(uid)).toBe(true);

    const adminUid = `admin-del-${randomUUID()}`;
    const res = await deleteUsers({ uids: [uid] }, adminUid, { admin: true });
    expect(res.data.success).toBe(true);
    expect(res.data.deletedCount).toBe(1);
    expect(await getUserData(uid)).toBeUndefined();
    expect(await authUserExists(uid)).toBe(false);
  });

  it("非adminは削除できない", async () => {
    const uid = `del2-${randomUUID()}`;
    await seedUser(uid, {});
    const attackerUid = `attacker-del-${randomUUID()}`;

    await expect(deleteUsers({ uids: [uid] }, attackerUid)).rejects.toMatchObject({
      code: "permission-denied",
    });
    expect(await getUserData(uid)).toBeDefined();
  });

  it("uidsが空配列/未指定なら invalid-argument", async () => {
    const adminUid = `admin-del2-${randomUUID()}`;

    await expect(deleteUsers({ uids: [] }, adminUid, { admin: true })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });

  // 既知リスクの回帰テスト:
  // deletedCount は実際に何かが存在して削除されたかに関わらず uids の要素数ぶん加算される。
  // 存在しないuidを渡しても deletedCount は 1 になってしまい、当日の削除運用で
  // 「削除できたはずなのに実は最初から存在しなかった」ケースを検知できない。
  it("[既知リスク] 存在しないuidを指定してもdeletedCountはインクリメントされる", async () => {
    const adminUid = `admin-del3-${randomUUID()}`;

    const res = await deleteUsers({ uids: [`ghost-${randomUUID()}`] }, adminUid, { admin: true });
    expect(res.data.deletedCount).toBe(1); // 実態としては何も削除されていない
  });

  // 既知リスクの回帰テスト:
  // ユーザー削除時に users/{uid}/transactions サブコレクションは削除されず孤児化する。
  it("[既知リスク] 削除後もtransactionsサブコレクションが孤児として残る", async () => {
    const uid = `del-orphan-${randomUUID()}`;
    await adminAuth().createUser({ uid });
    await seedUser(uid, {});
    await adminDb().collection("users").doc(uid).collection("transactions").doc("tx1").set({
      type: "BUY",
      stockId: "S1",
      amount: "1",
    });

    const adminUid = `admin-del4-${randomUUID()}`;
    await deleteUsers({ uids: [uid] }, adminUid, { admin: true });

    expect(await getUserData(uid)).toBeUndefined(); // 親ドキュメントは消える
    const txSnap = await adminDb().collection("users").doc(uid).collection("transactions").doc("tx1").get();
    expect(txSnap.exists).toBe(true); // だがサブコレクションは孤児のまま残る
  });
});
