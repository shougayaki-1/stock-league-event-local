// src/hooks/useRiddleActions.ts

import { collection, doc, addDoc, deleteDoc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getEstimatedServerTimeMillis } from "../lib/serverTime";
import { useDialog } from "../contexts/DialogContext";
import {
  DEFAULT_SIGNAGE_THEME,
  DEFAULT_ROOM_DURATION_SECONDS,
  DEFAULT_TV_ROLES,
  TV_ROLE_PATTERN,
  type RiddleStep,
} from "../lib/riddleConstants";

export type { RiddleRoom, RiddleStep } from "../lib/riddleConstants";

export function useRiddleActions() {
  const { alert, confirm } = useDialog();

  const addRoom = async (name: string, durationInSeconds: number) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      await alert({ title: "入力エラー", message: "部屋名を入力してください。", variant: "warning" });
      return false;
    }
    if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0) {
      await alert({ title: "入力エラー", message: "制限時間は1秒以上で入力してください。", variant: "warning" });
      return false;
    }
    try {
      await addDoc(collection(db, "riddle_rooms"), {
        name: trimmedName,
        phase: "STANDBY",
        duration: durationInSeconds,
        currentStepIndex: 0,
        stepStartedAt: Timestamp.now(),
        timerEndTime: null,
        timerRemainingAtPause: null,
        timerState: "STOPPED",
        theme: DEFAULT_SIGNAGE_THEME,
        tvRoles: [...DEFAULT_TV_ROLES],
        steps: [
          {
            name: "1. 導入演出 (オープニング)",
            autoTransitionType: "VIDEO_END",
            triggerTvRole: "entrance",
            tvActions: {
              entrance: { mode: "VIDEO" },
              exit: { mode: "STANDBY" }
            }
          },
          {
            name: "2. メインタスク (謎解きカウントダウン)",
            autoTransitionType: "MANUAL_OR_TIMER",
            timerDurationSeconds: durationInSeconds, // デフォルトで部屋の制限時間をセット
            tvActions: {
              entrance: { mode: "DARK" }, // 謎解き中は入口TVを暗転に
              exit: { mode: "TIMER" }
            }
          },
          {
            name: "3. クリア演出 (エンディング)",
            autoTransitionType: "VIDEO_END",
            triggerTvRole: "exit",
            tvActions: {
              entrance: { mode: "DARK" },
              exit: { mode: "VIDEO" }
            }
          }
        ]
      });
      return true;
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "部屋の追加に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const deleteRoom = async (id: string) => {
    const isOk = await confirm({ title: "部屋の削除", message: "この部屋の設定を削除しますか？", variant: "danger" });
    if (isOk) await deleteDoc(doc(db, "riddle_rooms", id));
  };

  const proceedToNextStepSecure = async (roomId: string, expectedCurrentIndex: number) => {
    try {
      const serverNowMillis = await getEstimatedServerTimeMillis();
      await runTransaction(db, async (transaction) => {
        const roomRef = doc(db, "riddle_rooms", roomId);
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;

        const data = snap.data();
        const currentIndex = data.currentStepIndex ?? 0;
        const steps = (data.steps || []) as RiddleStep[];

        if (currentIndex !== expectedCurrentIndex) {
          return;
        }

        const nextIndex = currentIndex + 1;
        if (nextIndex < steps.length) {
          const nextStep = steps[nextIndex];
          const hasTimer = Object.values(nextStep.tvActions || {}).some(
            (act) => act.mode === "TIMER"
          );

          const timerUpdates = hasTimer ? {
            timerState: "RUNNING",
            timerEndTime: Timestamp.fromMillis(serverNowMillis + (nextStep.timerDurationSeconds || data.duration || DEFAULT_ROOM_DURATION_SECONDS) * 1000),
            timerRemainingAtPause: null
          } : {
            timerState: "STOPPED",
            timerEndTime: null,
            timerRemainingAtPause: null
          };

          transaction.update(roomRef, {
            currentStepIndex: nextIndex,
            stepStartedAt: Timestamp.fromMillis(serverNowMillis),
            ...timerUpdates
          });
        } else {
          transaction.update(roomRef, {
            phase: "STANDBY",
            currentStepIndex: 0,
            timerState: "STOPPED",
            timerEndTime: null,
            timerRemainingAtPause: null,
            stepStartedAt: Timestamp.fromMillis(serverNowMillis)
          });
        }
      });
      return true;
    } catch (e) {
      console.error("Step transition transaction failed: ", e);
      return false;
    }
  };

  return { addRoom, deleteRoom, isValidTvRole: (role: string) => TV_ROLE_PATTERN.test(role), proceedToNextStepSecure };
}
