// =================================================================
// File: src/hooks/useWindowActions.ts
// =================================================================

import { useCallback, useState } from "react";
import { doc, updateDoc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDialog } from "../contexts/DialogContext";
import { APP_ERRORS } from "../lib/errors";
import { callFinalizeAccount, callQuoteStockPrice, callUndoFinalizeAccount, callUndoTransaction } from "../services/functions";
import { toExactString, type ExactNumberInput } from "../lib/exactNumber";
import { STORAGE_KEYS } from "../lib/storageKeys";
import { FIRESTORE_COLLECTIONS } from "../lib/firestorePaths";
import { callTradeWithConfirmation } from "../lib/tradeCall";
import { firebaseErrorCode } from "../lib/clientDiagnostics";

const getImmediateTradeQuote = async (uid: string, stockId: string) => {
  try {
    return await callQuoteStockPrice({ uid, stockId });
  } catch (error) {
    if (firebaseErrorCode(error) !== "functions/resource-exhausted") throw error;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1_050));
    return callQuoteStockPrice({ uid, stockId });
  }
};

export interface OfflineQueueItem {
  id: string;
  type: "TRADE" | "EXCHANGE" | "RECEPTION";
  uid: string;
  nickname: string;
  shortId: string;
  payload: {
    stockId?: string;
    type?: "BUY" | "SELL";
    amount?: ExactNumberInput;
  };
  timestamp: number;
  status: "PENDING" | "SUCCESS" | "FAILED";
  error?: string;
}

export interface QuickUpgradeToInsiderResult {
  success: boolean;
  previousCourse?: string;
  alreadyInsider?: boolean;
  errorMessage?: string;
}

const getOfflineQueue = (): OfflineQueueItem[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter(isOfflineQueueItem) : [];
  } catch {
    localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return [];
  }
};

const saveOfflineQueue = (queue: OfflineQueueItem[]) => {
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
};

const isOfflineQueueItem = (value: unknown): value is OfflineQueueItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OfflineQueueItem>;
  return typeof item.id === "string" &&
    (item.type === "TRADE" || item.type === "EXCHANGE" || item.type === "RECEPTION") &&
    typeof item.uid === "string" &&
    typeof item.nickname === "string" &&
    typeof item.shortId === "string" &&
    typeof item.timestamp === "number" &&
    (item.status === "PENDING" || item.status === "SUCCESS" || item.status === "FAILED") &&
    typeof item.payload === "object" &&
    item.payload !== null;
};

export function useWindowActions() {
  const { confirm, alert } = useDialog();
  const [isLoading, setIsLoading] = useState(false);

  const getOfflineUserText = useCallback(async (uid: string) => {
    try {
      const userSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        return { nickname: data.nickname || "Unknown", shortId: data.shortId || "????" };
      }
    } catch { /* ignore */ }
    return { nickname: "Unknown", shortId: "????" };
  }, []);

  // 1. 窓口における代理売買処理
  const executeTrade = useCallback(async (uid: string, stockId: string, type: "BUY" | "SELL", amount: ExactNumberInput) => {
    const exactAmount = toExactString(amount);
    const isOffline = localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true";
    if (isOffline) {
      const { nickname, shortId } = await getOfflineUserText(uid);
      const queueItem: OfflineQueueItem = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        type: "TRADE",
        uid,
        nickname,
        shortId,
        payload: { stockId, type, amount: exactAmount },
        timestamp: Date.now(),
        status: "PENDING"
      };
      const queue = getOfflineQueue();
      queue.push(queueItem);
      saveOfflineQueue(queue);

      return { success: true, transactionId: queueItem.id, warningMsg: undefined };
    }

    // 窓口での多重クリックを防止するロックガード
    if (isLoading) {
      return { success: false, transactionId: null, warningMsg: undefined };
    }

    setIsLoading(true);
    try {
      const idempotencyKey = "win_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const quote = await getImmediateTradeQuote(uid, stockId);
      const result = await callTradeWithConfirmation({
        uid,
        stockId,
        type,
        amount: exactAmount,
        idempotencyKey,
        quoteId: quote.data.quoteId,
      });
      return { ...result.data, success: true, warningMsg: result.data.warning };
    } catch (error) {
      if (error instanceof Error) {
        await alert({ title: "取引失敗", message: error.message, variant: "danger" });
      }
      return { success: false, transactionId: null, warningMsg: undefined };
    } finally {
      setIsLoading(false);
    }
  }, [alert, getOfflineUserText, isLoading]);

  // 2. 取引端末（Terminal）における売買処理
  const executeTerminalTrade = useCallback(async (uid: string, stockId: string, type: "BUY" | "SELL", amount: ExactNumberInput, maxMode = false) => {
    if (localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true") {
      return { success: false, errorMsg: "端末はオフラインモードでは使えません。窓口をご利用ください。", warningMsg: undefined };
    }

    // 多重送信・連続決定（ジェスチャー誤検知）によるトランザクション衝突を防ぐガード
    if (isLoading) {
      return { success: false, errorMsg: "現在、前の取引を処理中です。少しお待ちください。", warningMsg: undefined };
    }

    setIsLoading(true);
    try {
      const idempotencyKey = "term_" + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const quote = await getImmediateTradeQuote(uid, stockId);
      const result = await callTradeWithConfirmation({
        uid,
        stockId,
        type,
        amount: toExactString(amount),
        idempotencyKey,
        quoteId: quote.data.quoteId,
        maxMode // MAX注文はサーバー側で約定価格を使い全額/全株を確定する
      });
      return { ...result.data, success: true, warningMsg: result.data.warning, errorMsg: undefined };
    } catch (error) {
      let msg: string = APP_ERRORS.TRADE_FAILED;
      if (error instanceof Error) {
        msg = error.message;
      }
      return { success: false, errorMsg: msg, warningMsg: undefined };
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const undoTrade = useCallback(async (uid: string, transactionId: string) => {
    const isOffline = localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true";
    if (isOffline) {
      const queue = getOfflineQueue();
      const filtered = queue.filter(item => item.id !== transactionId);
      if (filtered.length < queue.length) {
        saveOfflineQueue(filtered);
        return true;
      }
      await alert({ title: "取消失敗", message: "オフラインキューに該当の取引が見つかりません。", variant: "warning" });
      return false;
    }

    setIsLoading(true);
    try {
      await callUndoTransaction({ uid, transactionId });
      return true;
    } catch (error) {
      if (error instanceof Error) {
        await alert({ title: "取消失敗", message: error.message, variant: "danger" });
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [alert]);

  const executeFinalize = useCallback(async (uid: string) => {
    const isOffline = localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true";

    const isOk = await confirm({
      title: isOffline ? "利益を確定しますか？（オフライン）" : "利益を確定しますか？",
      message: isOffline
        ? "オフラインモードです。取引をキューに登録し、利益確定とみなします。景品をお渡しください。"
        : APP_ERRORS.CONFIRM_FINALIZE,
      confirmText: "利益確定する",
      variant: "warning"
    });
    if (!isOk) return false;

    if (isOffline) {
      const { nickname, shortId } = await getOfflineUserText(uid);
      const queueItem: OfflineQueueItem = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        type: "EXCHANGE",
        uid,
        nickname,
        shortId,
        payload: {},
        timestamp: Date.now(),
        status: "PENDING"
      };
      const queue = getOfflineQueue();
      queue.push(queueItem);
      saveOfflineQueue(queue);

      await alert({ title: "完了（オフライン）", message: "オフラインキューに利益確定を登録しました。\n景品をお渡しください。", variant: "success" });
      return true;
    }

    setIsLoading(true);
    try {
      await callFinalizeAccount({ uid });
      await alert({ title: "完了", message: "利益確定処理が完了しました。\n景品をお渡しください。", variant: "success" });
      return true;
    } catch (error) {
      if (error instanceof Error) await alert({ title: "エラー", message: error.message, variant: "danger" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [alert, confirm, getOfflineUserText]);

  const undoFinalize = useCallback(async (uid: string) => {
    const isOk = await confirm({
      title: "利益確定を元に戻しますか？",
      message: "直前の利益確定前のポイントと保有株に戻します。景品をまだ渡していない場合のみ実行してください。",
      confirmText: "元に戻す",
      variant: "warning"
    });
    if (!isOk) return false;

    setIsLoading(true);
    try {
      await callUndoFinalizeAccount({ uid });
      await alert({ title: "取消完了", message: "利益確定を元に戻しました。", variant: "success" });
      return true;
    } catch (error) {
      if (error instanceof Error) {
        await alert({ title: "取消失敗", message: error.message, variant: "danger" });
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [alert, confirm]);

  const upgradeToInsider = useCallback(async (uid: string) => {
    const isOffline = localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true";

    const isOk = await confirm({
      title: isOffline ? "コース変更の確認（オフライン）" : "コース変更の確認",
      message: isOffline
        ? "オフラインモードです。コース変更をキューに登録します。"
        : "このエージェントをインサイダー(謎解き)コースへ昇格させますか？",
      confirmText: "昇格させる"
    });
    if (!isOk) return false;

    if (isOffline) {
      const { nickname, shortId } = await getOfflineUserText(uid);
      const queueItem: OfflineQueueItem = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        type: "RECEPTION",
        uid,
        nickname,
        shortId,
        payload: {},
        timestamp: Date.now(),
        status: "PENDING"
      };
      const queue = getOfflineQueue();
      queue.push(queueItem);
      saveOfflineQueue(queue);

      await alert({ title: "完了（オフライン）", message: "オフラインキューにコース変更を登録しました。", variant: "success" });
      return true;
    }

    setIsLoading(true);
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid), { courseType: "INSIDER" });
      await alert({ title: "完了", message: "インサイダーへの昇格が完了しました！", variant: "success" });
      return true;
    } catch (error) {
      console.error(error);
      await alert({ title: "エラー", message: APP_ERRORS.SYSTEM_ERROR, variant: "danger" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [alert, confirm, getOfflineUserText]);

  const syncOfflineQueue = useCallback(async (onProgress?: (progressStr: string) => void) => {
    const queue = getOfflineQueue().filter(item => item.status === "PENDING" || item.status === "FAILED");
    if (queue.length === 0) {
      await alert({ title: "同期", message: "同期が必要なキューはありません。", variant: "info" });
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const displayName = `${item.nickname} (${item.shortId})`;
      const actionName = item.type === "TRADE" ? "取引" : item.type === "EXCHANGE" ? "利益確定" : "コース変更";

      if (onProgress) {
        onProgress(`同期中 (${i + 1}/${queue.length}): ${displayName} の ${actionName}...`);
      }

      try {
        if (item.type === "TRADE") {
          const { stockId, type, amount } = item.payload;
          if (!stockId || !type || !amount) throw new Error("Invalid trade payload");

          // オフライン登録時のIDをそのまま冪等キーにし、同期再試行で二重約定させない。
          const idempotencyKey = `sync_${item.id}`;
          const quote = await getImmediateTradeQuote(item.uid, stockId);

          await callTradeWithConfirmation({
            uid: item.uid,
            stockId,
            type,
            amount: toExactString(amount),
            idempotencyKey,
            quoteId: quote.data.quoteId,
          });
        } else if (item.type === "EXCHANGE") {
          await callFinalizeAccount({ uid: item.uid });
        } else if (item.type === "RECEPTION") {
          await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, item.uid), { courseType: "INSIDER" });
        }

        const updated = getOfflineQueue();
        const targetIdx = updated.findIndex(q => q.id === item.id);
        if (targetIdx !== -1) {
          updated[targetIdx].status = "SUCCESS";
          saveOfflineQueue(updated);
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error);
        const errMsg = error instanceof Error ? error.message : "不明なエラー";

        const updated = getOfflineQueue();
        const targetIdx = updated.findIndex(q => q.id === item.id);
        if (targetIdx !== -1) {
          updated[targetIdx].status = "FAILED";
          updated[targetIdx].error = errMsg;
          saveOfflineQueue(updated);
        }
        failCount++;
      }
    }

    const remaining = getOfflineQueue().filter(q => q.status !== "SUCCESS");
    saveOfflineQueue(remaining);

    await alert({
      title: "同期完了",
      message: `同期結果: 成功 ${successCount}件, 失敗 ${failCount}件\n${failCount > 0 ? "失敗した取引がキューに残っています。詳細を確認してください。" : "すべてのキューが正常に同期されました！"}`,
      variant: failCount > 0 ? "warning" : "success"
    });
  }, [alert]);

  const quickUpgradeToInsider = useCallback(async (uid: string): Promise<QuickUpgradeToInsiderResult> => {
    if (isLoading) {
      return { success: false, previousCourse: undefined as string | undefined, errorMessage: "現在、前の受付を処理中です。" };
    }
    setIsLoading(true);
    try {
      const userRef = doc(db, FIRESTORE_COLLECTIONS.users, uid);
      return await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error(APP_ERRORS.USER_NOT_FOUND);
        const previousCourse = String(userSnap.data().courseType || "TRADER");
        if (previousCourse === "INSIDER") {
          return { success: true, previousCourse, alreadyInsider: true };
        }
        transaction.update(userRef, {
          courseType: "INSIDER",
          receptionUpgradedAt: serverTimestamp()
        });
        return { success: true, previousCourse, alreadyInsider: false };
      });
    } catch (error) {
      console.error(error);
      return {
        success: false,
        previousCourse: undefined,
        errorMessage: error instanceof Error ? error.message : APP_ERRORS.SYSTEM_ERROR
      };
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const undoReceptionUpgrade = useCallback(async (uid: string, previousCourse: string) => {
    setIsLoading(true);
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid), { courseType: previousCourse || "TRADER" });
      return true;
    } catch (error) {
      console.error(error);
      await alert({ title: "Undo失敗", message: APP_ERRORS.SYSTEM_ERROR, variant: "danger" });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [alert]);

  return { executeTrade, executeTerminalTrade, undoTrade, executeFinalize, undoFinalize, upgradeToInsider, quickUpgradeToInsider, undoReceptionUpgrade, syncOfflineQueue, isLoading };
}
