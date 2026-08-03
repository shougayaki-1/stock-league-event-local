// functions/src/ecoConfig.ts
//
// 家庭用の省Firestoreモード（ecoMode）に関する共有定数とヘルパー。
// ecoMode の間は「10秒ごとの値動き（クライアント側補間）」だけを維持し、
// サーバー側のランキング集計・株価 tick を大幅に間引くことで Firestore の
// 読み取り／書き込み課金を抑える。

import * as admin from "firebase-admin";
import { COL } from "./collections";
import type { SystemSettingsData } from "./types";

const MINUTE_MS = 60 * 1000;

// ランキング集計の最短間隔（この間隔より短い連続要求はスキップする）。
// 更新のたびに接続中の全クライアントへ読み取り課金が発生する（listenerのfan-out）ため、
// tick/ランキングの間隔は「間引いた分だけ確実に課金が減る」よう長めに設定している。
export const ECO_RANKING_INTERVAL_MS = 120 * MINUTE_MS;
// ecoMode 時に performStockTick を実行する間隔。
export const ECO_TICK_INTERVAL_MS = 15 * MINUTE_MS;
// ecoMode 用ランタイムの長さ。tick 間隔より長くして値動きの連続性を保証する。
export const ECO_RUNTIME_MS = 30 * MINUTE_MS;

const db = admin.firestore();

/** settings/system を読み込む。取得できない場合は空オブジェクトを返す。 */
export const getSystemSettings = async (): Promise<SystemSettingsData> => {
  const snap = await db.collection(COL.settings).doc("system").get();
  return (snap.data() as SystemSettingsData | undefined) || {};
};

/** ecoMode が有効かどうか。 */
export const isEcoEnabled = (settings: SystemSettingsData | undefined | null): boolean =>
  settings?.ecoMode === true;
