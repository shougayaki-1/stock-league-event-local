import { doc, writeBatch, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { User, Stock, PrizeGrade } from "../types/domain";
import { useDialog } from "../contexts/DialogContext";
import { chunkArray } from "../lib/arrays";
import { addExact, mulExact, toExactString, type ExactNumberInput } from "../lib/exactNumber";

export function useSystemActions() {
  const { alert } = useDialog();

  const forceFinalizeAll = async (allUsers: User[], stocks: Stock[]) => {
    try {
      const prices: Record<string, number> = {};
      stocks.forEach(s => prices[s.id] = s.currentPrice);

      const targetUsers = allUsers.filter(u => !u.isFinished);
      if (targetUsers.length === 0) {
        await alert({ title: "お知らせ", message: "確定待ちのユーザーはいません。", variant: "info" });
        return;
      }

      // 400件ずつに分割してバッチ処理（500件制限の回避）
      const userChunks = chunkArray(targetUsers, 400);
      
      for (const chunk of userChunks) {
        const batch = writeBatch(db);
        chunk.forEach(u => {
          let finalPoints = toExactString(u.points);
          Object.entries(u.inventory || {}).forEach(([id, amt]) => {
            finalPoints = addExact(finalPoints, mulExact(prices[id] || 0, amt));
          });
          batch.update(doc(db, "users", u.uid), { points: finalPoints, inventory: {}, isFinished: true });
        });
        await batch.commit();
      }

      await alert({ title: "完了", message: `${targetUsers.length}名の利益確定処理が完了しました！`, variant: "success" });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "処理に失敗しました。", variant: "danger" });
    }
  };

  const resetAllUsersForNextDay = async (allUsers: User[], initialPoint: ExactNumberInput) => {
    try {
      if (allUsers.length === 0) return;

      // 400件ずつに分割してバッチ処理
      const userChunks = chunkArray(allUsers, 400);

      for (const chunk of userChunks) {
        const batch = writeBatch(db);
        chunk.forEach(u => {
          batch.update(doc(db, "users", u.uid), {
            points: toExactString(initialPoint),
            inventory: {},
            courseType: "TRADER", 
            isFinished: false
          });
        });
        await batch.commit();
      }

      await alert({ title: "リセット完了", message: `${allUsers.length}名の初期化が完了しました。`, variant: "success" });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "初期化に失敗しました。", variant: "danger" });
    }
  };

  const saveSettings = async (editingPrizes: PrizeGrade[]) => {
    try {
      await setDoc(doc(db, "settings", "prizes"), { grades: editingPrizes }, { merge: true });
      await alert({ title: "保存完了", message: "景品設定を保存しました。全画面に即時反映されます。", variant: "success" });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
    }
  };

  return { forceFinalizeAll, resetAllUsersForNextDay, saveSettings };
}
