// =================================================================
// File: functions/src/users.ts
// =================================================================

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { COL } from "./collections";
import { verifyCurrentUser, verifyAdmin, filterNickname, getSystemSettings, CALL_OPTS, CRITICAL_CALL_OPTS } from "./utils";
import { toExactString } from "./exact";

const db = admin.firestore();

interface BulkUserInput {
  shortId?: string;
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
};

export const registerAgent = onCall(CALL_OPTS, async (request) => {
  const { targetID, nickname } = request.data;
  if (!targetID || !nickname) throw new HttpsError("invalid-argument", "パラメーター不足");

  // 本人、または管理者（verifyAdmin）であればエージェント登録を許可する
  try {
    verifyCurrentUser(request.auth, targetID);
  } catch {
    try {
      await verifyAdmin(request.auth);
    } catch {
      throw new HttpsError("permission-denied", "このエージェントを登録する権限がありません。");
    }
  }

  const shortId = targetID.split("-")[0];
  const safeName = filterNickname(nickname);

  const sysSettings = await getSystemSettings();
  const initialPoint = toExactString(sysSettings.initialPoint ?? 1000);

  await db.collection(COL.users).doc(targetID).set({
    uid: targetID,
    shortId: shortId,
    nickname: `${safeName}(${shortId})`,
    points: initialPoint,
    inventory: {},
    courseType: "TRADER",
    isFinished: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { success: true };
});

export const updateAgentNickname = onCall(CALL_OPTS, async (request) => {
  const { uid, newNickname } = request.data;
  if (!uid || !newNickname) throw new HttpsError("invalid-argument", "パラメーター不足");

  // 本人、または管理者（verifyAdmin）であればニックネーム変更を許可する
  try {
    verifyCurrentUser(request.auth, uid);
  } catch {
    try {
      await verifyAdmin(request.auth);
    } catch {
      throw new HttpsError("permission-denied", "このエージェントのニックネームを変更する権限がありません。");
    }
  }

  const userRef = db.collection(COL.users).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "ユーザーが見つかりません");

  const shortId = userSnap.data()!.shortId;
  const safeName = filterNickname(newNickname);

  await userRef.update({ nickname: `${safeName}(${shortId})` });
  return { success: true };
});

export const bulkGenerateUsers = onCall(CALL_OPTS, async (request) => {
  await verifyAdmin(request.auth);

  const { users } = request.data as { users?: BulkUserInput[] };
  if (!users || !Array.isArray(users)) {
    throw new HttpsError("invalid-argument", "ユーザー情報が不正です");
  }

  const sysSettings = await getSystemSettings();
  const initialPoint = toExactString(sysSettings.initialPoint ?? 1000);
  const results = [];

  for (const u of users) {
    const shortId = u.shortId;
    if (!shortId || shortId.length !== 4) continue;

    const random6 = Math.random().toString(36).substring(2, 8).padEnd(6, "x");
    const email = `${shortId}-${random6}@stock-league.local`;
    const password = randomUUID();

    try {
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: `エージェント(${shortId})`,
      });

      const uid = userRecord.uid;

      await db.collection(COL.users).doc(uid).set({
        uid: uid,
        shortId: shortId,
        email: email,
        nickname: `エージェント(${shortId})`,
        points: initialPoint,
        inventory: {},
        courseType: "TRADER",
        isFinished: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      results.push({ uid, shortId, email, password });
    } catch (e: unknown) {
      console.error(`Failed to create user ${shortId}:`, e);
    }
  }

  return { success: true, count: results.length, failedCount: 0, users: results };
});

export const loginByShortId = onCall(CRITICAL_CALL_OPTS, async (request) => {
  const { shortIdAndSuffix } = request.data;
  if (!shortIdAndSuffix) throw new HttpsError("invalid-argument", "パラメーター不足");

  // 1. クエリではなく、ドキュメントID（IDそのもの）でFirestoreからプレイヤーデータを厳格に検索
  const userRef = db.collection(COL.users).doc(shortIdAndSuffix);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new HttpsError("not-found", "指定されたIDのユーザーが見つかりません。");
  }

  const uid = userSnap.id; // '0001-abcdef'などのUID

  // createCustomTokenはAuthユーザーの事前作成を必要としない。クライアントがこのトークンで
  // 初回サインインした時点でAuthユーザーが作成されるため、毎回のAdmin Auth往復を省く。
  try {
    const customToken = await admin.auth().createCustomToken(uid);
    return { success: true, customToken, uid };
  } catch (e: unknown) {
    throw new HttpsError("internal", `カスタムトークンの生成に失敗しました: ${getErrorMessage(e)}`);
  }
});

export const deleteUsers = onCall(CALL_OPTS, async (request) => {
  await verifyAdmin(request.auth);

  const { uids } = request.data as { uids?: string[] };
  if (!uids || !Array.isArray(uids) || uids.length === 0) {
    throw new HttpsError("invalid-argument", "削除対象が指定されていません");
  }

  let deletedCount = 0;
  for (const uid of uids) {
    try {
      await db.collection(COL.users).doc(uid).delete();
    } catch (e: unknown) {
      console.error(`Firestore削除失敗 uid=${uid}:`, getErrorMessage(e));
    }
    try {
      await admin.auth().deleteUser(uid);
    } catch (e: unknown) {
      if (getErrorCode(e) !== "auth/user-not-found") {
        console.error(`Auth削除失敗 uid=${uid}:`, getErrorMessage(e));
      }
    }
    deletedCount++;
  }

  return { success: true, deletedCount };
});
