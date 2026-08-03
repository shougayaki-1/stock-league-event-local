import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { callFinalizeAccount } from "../services/functions";
import { useDialog } from "../contexts/DialogContext";
import { useClassroomUsers } from "./useFirebase";
import type { User } from "../types/domain";

export interface ClassroomSettings {
  finalizeOnCheckout: boolean;
  autoCheckoutOnPhaseEnd: boolean;
  autoCheckoutOnExchange: boolean;
}

export type ClassroomAction = "CHECK_OUT" | "PHASE_CHECK_OUT";

export const DEFAULT_CLASSROOM_SETTINGS: ClassroomSettings = {
  finalizeOnCheckout: false,
  autoCheckoutOnPhaseEnd: true,
  autoCheckoutOnExchange: true
};

interface UseClassroomActionsOptions {
  onEvent?: (user: Pick<User, "uid" | "shortId" | "nickname">, action: string, status: "SUCCESS" | "SKIP" | "ERROR") => void;
}

export function useClassroomActions(options: UseClassroomActionsOptions = {}) {
  const users = useClassroomUsers();
  const activeUsers = useMemo(() => users.filter(user => user.isInClass && !user.isFinished), [users]);
  const [settings, setSettings] = useState<ClassroomSettings>(DEFAULT_CLASSROOM_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const { alert, confirm } = useDialog();

  useEffect(() => {
    const ref = doc(db, "settings", "classroom_operation");
    const unsub = onSnapshot(ref, (snap) => {
      setSettings({ ...DEFAULT_CLASSROOM_SETTINGS, ...(snap.data() || {}) });
    });
    return () => unsub();
  }, []);

  const addEvent = options.onEvent;

  const saveSettings = async (patch: Partial<ClassroomSettings>) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await setDoc(doc(db, "settings", "classroom_operation"), next, { merge: true });
    } catch (error) {
      setSettings(previous);
      await alert({
        title: "設定保存エラー",
        message: error instanceof Error ? error.message : "設定の保存に失敗しました。",
        variant: "danger"
      });
    }
  };

  const findUser = async (shortId: string) => {
    const local = users.find(user => user.shortId === shortId);
    if (local) return local;
    const q = query(collection(db, "users"), where("shortId", "==", shortId));
    const snap = await getDocs(q);
    return snap.empty ? null : ({ uid: snap.docs[0].id, ...snap.docs[0].data() } as User);
  };

  const checkIn = async (user: User) => {
    if (user.isInClass) {
      addEvent?.(user, "入室済み", "SKIP");
      return;
    }
    await updateDoc(doc(db, "users", user.uid), {
      isInClass: true,
      checkedInAt: serverTimestamp(),
      checkedOutAt: null,
      lastAttendanceAction: "CHECK_IN"
    });
    addEvent?.(user, "入室", "SUCCESS");
  };

  const checkOut = async (user: User, action: ClassroomAction = "CHECK_OUT") => {
    if (!user.isInClass) {
      addEvent?.(user, "退出済み", "SKIP");
      return;
    }
    if (settings.finalizeOnCheckout && !user.isFinished) {
      await callFinalizeAccount({ uid: user.uid });
    }
    try {
      await updateDoc(doc(db, "users", user.uid), {
        isInClass: false,
        checkedOutAt: serverTimestamp(),
        lastAttendanceAction: action
      });
    } catch (error) {
      if (settings.finalizeOnCheckout && !user.isFinished) {
        throw new Error(`利益確定は完了しましたが退出記録に失敗しました。${error instanceof Error ? error.message : ""}`, { cause: error });
      }
      throw error;
    }
    addEvent?.(user, action === "PHASE_CHECK_OUT" ? "フェーズ退出" : "退出", "SUCCESS");
  };

  const checkOutAfterExchange = async (user: User) => {
    if (!settings.autoCheckoutOnExchange || !user.isInClass) return false;
    await updateDoc(doc(db, "users", user.uid), {
      isInClass: false,
      checkedOutAt: serverTimestamp(),
      lastAttendanceAction: "EXCHANGE_CHECK_OUT"
    });
    addEvent?.(user, "景品交換退出", "SUCCESS");
    return true;
  };

  const handlePhaseEnd = async () => {
    const isOk = await confirm({
      title: "フェーズ終了処理",
      message: `入室中 ${activeUsers.length} 名を全員退出にします。${settings.finalizeOnCheckout ? "\n退出と同時に利益確定も実行します。" : ""}`,
      confirmText: "全員退出する",
      variant: "warning"
    });
    if (!isOk) return false;

    setIsProcessing(true);
    let processedCount = 0;
    try {
      for (const user of activeUsers) {
        await checkOut(user, "PHASE_CHECK_OUT");
        processedCount++;
      }
      await setDoc(doc(db, "settings", "classroom_operation"), {
        lastPhaseCheckoutAt: serverTimestamp()
      }, { merge: true });
      await alert({ title: "完了", message: "フェーズ終了の退出処理が完了しました。", variant: "success" });
      return true;
    } catch (error) {
      const failedUser = activeUsers[processedCount];
      await alert({
        title: "フェーズ終了エラー",
        message: `${processedCount}/${activeUsers.length} 名処理済み、${failedUser?.nickname || "対象者"} で失敗しました。\n${error instanceof Error ? error.message : "処理に失敗しました。"}`,
        variant: "danger"
      });
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    users,
    activeUsers,
    settings,
    saveSettings,
    findUser,
    checkIn,
    checkOut,
    checkOutAfterExchange,
    handlePhaseEnd,
    isProcessing,
    setIsProcessing
  };
}
