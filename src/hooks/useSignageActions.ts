import { collection, doc, addDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDialog } from "../contexts/DialogContext";
import type { PlaylistItem } from "../lib/signagePresets";

export function useSignageActions() {
  const { alert, confirm } = useDialog();

  const addMonitor = async (name: string, location: string) => {
    try {
      await addDoc(collection(db, "public_signages"), {
        name, location,
        playlist: [{ mode: "STOCK_GRID", duration: 30 }]
      });
      await alert({ title: "登録完了", message: "新しいモニターを登録しました。", variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "登録に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const deleteMonitor = async (id: string) => {
    const isOk = await confirm({
      title: "モニターの削除",
      message: "このモニター設定を削除しますか？\n（物理的なモニターには影響しません）",
      variant: "danger"
    });
    if (isOk) await deleteDoc(doc(db, "public_signages", id));
  };

  const saveAllPlaylists = async (editingPlaylists: Record<string, PlaylistItem[]>) => {
    try {
      const batch = writeBatch(db);
      Object.entries(editingPlaylists).forEach(([id, playlist]) => {
        batch.update(doc(db, "public_signages", id), { playlist });
      });
      await batch.commit();
      await alert({ title: "保存完了", message: "全てのモニターへ設定を反映しました。", variant: "success" });
      return true;
    } catch {
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
      return false;
    }
  };

  return { addMonitor, deleteMonitor, saveAllPlaylists };
}
