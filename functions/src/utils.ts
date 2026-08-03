// functions/src/utils.ts

import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { COL } from "./collections";
import { SystemSettingsData } from "./types";

const db = admin.firestore();

// H-3: リージョンとCORSのオプション定義を共通化してエクスポート
export const CALL_OPTS = { region: "asia-northeast1", cors: true } as const;
export const CRITICAL_CALL_OPTS = { ...CALL_OPTS, minInstances: 1 } as const;

/**
 * 呼び出しユーザーが管理者権限（メールアドレス照合またはFirestoreレコード確認）を
 * 所持しているか厳格に検査するヘルパー関数
 */
export async function verifyAdmin(auth: CallableRequest["auth"]): Promise<void> {
  if (!auth) {
    throw new HttpsError("unauthenticated", "この操作を行うにはログインが必要です。");
  }
  if (auth.token.admin === true || auth.token.coreAdmin === true || auth.token.terminalAdmin === true) return;

  const email = typeof auth.token.email === "string" ? auth.token.email.toLowerCase() : "";
  if (!email) {
    throw new HttpsError("permission-denied", "管理者としてのメール認証情報がありません。");
  }

  const docSnap = await db.collection(COL.admins).doc(email).get();
  if (!docSnap.exists) {
    throw new HttpsError("permission-denied", "アクセス権限が拒否されました。");
  }
}

/**
 * 本人確認ヘルパー
 * 送信された targetUid がセッションのUIDと完全に一致するか検証
 */
export function verifyCurrentUser(auth: CallableRequest["auth"], targetUid: string): void {
  if (!auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (auth.uid !== targetUid) {
    throw new HttpsError("permission-denied", "他人のアカウントを操作することはできません。");
  }
}

const NG_WORDS = ["バカ", "アホ", "死ね", "殺す", "うんこ", "ちんこ", "まんこ"];

export const filterNickname = (name: string): string => {
  const normalized = name.normalize("NFKC").toLowerCase();
  const isValid = !NG_WORDS.some(word => 
    normalized.includes(word.normalize("NFKC").toLowerCase())
  );
  return isValid ? name : `エージェント${Math.floor(Math.random() * 1000)}`;
};

/**
 * M-2: 重複読み込みを削減するシステム設定取得用ヘルパー
 */
export async function getSystemSettings(): Promise<SystemSettingsData> {
  const snap = await db.collection(COL.settings).doc("system").get();
  return (snap.data() as SystemSettingsData) || {};
}
