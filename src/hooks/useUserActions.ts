import { doc, writeBatch, Timestamp, setDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useDialog } from "../contexts/DialogContext";
import { chunkArray } from "../lib/arrays";
import { isPositiveIntegerInput, toExactString, type ExactNumberInput } from "../lib/exactNumber";

// 英小文字のみのランダムな文字列を生成するヘルパー
const generateRandomLetters = (length: number): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const MIN_GENERATE_COUNT = 1;
const MAX_GENERATE_COUNT = 200;

export function useUserActions() {
  const { alert, confirm } = useDialog();

  const bulkGenerateUsers = async (
    count: number,
    initialPoint: ExactNumberInput,
    initialHoldings: Record<string, string>
  ) => {
    if (!Number.isInteger(count) || count < MIN_GENERATE_COUNT || count > MAX_GENERATE_COUNT) {
      await alert({ title: "入力エラー", message: `発行枚数は${MIN_GENERATE_COUNT}〜${MAX_GENERATE_COUNT}枚の整数で指定してください。`, variant: "danger" });
      return null;
    }
    if (!isPositiveIntegerInput(initialPoint)) {
      await alert({ title: "入力エラー", message: "初期ポイントは1以上の整数で指定してください。", variant: "danger" });
      return null;
    }
    const exactInitialPoint = toExactString(initialPoint);
    const isOk = await confirm({
      title: "ID一括発行",
      message: `${count} 枚のQRコードを自動採番で発行します。よろしいですか？`,
      confirmText: "発行する"
    });
    if (!isOk) return null;

    try {
      const q = query(collection(db, "users"), orderBy("shortId", "desc"), limit(1));
      const snap = await getDocs(q);

      let nextNo = 1;
      if (!snap.empty) {
        const highestShortId = snap.docs[0].data().shortId;
        const parsed = parseInt(highestShortId, 10);
        nextNo = Number.isFinite(parsed) ? parsed + 1 : 1;
      }

      const ids: string[] = [];
      let cur = nextNo;

      // 生成予定のデータを配列に準備
      const newUsers = Array.from({ length: count }).map(() => {
        const sid = cur.toString().padStart(4, "0");
        // 後半部分を英小文字のみの6文字に設定
        const full = `${sid}-${generateRandomLetters(6)}`;
        ids.push(full);
        cur++;
        return { sid, full };
      });

      // 400件ずつバッチ書き込み
      const chunks = chunkArray(newUsers, 400);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(u => {
          batch.set(doc(db, "users", u.full), {
            uid: u.full,
            shortId: u.sid,
            nickname: u.sid.slice(-4),
            points: exactInitialPoint,
            inventory: initialHoldings,
            courseType: "TRADER",
            isFinished: false,
            createdAt: Timestamp.now()
          });
        });
        await batch.commit();
      }

      return ids;
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "IDの発行に失敗しました。", variant: "danger" });
      return null;
    }
  };

  const bulkUpdateStatus = async (uids: string[], field: "courseType" | "isFinished", value: string | boolean) => {
    const valueLabel = field === "courseType"
      ? String(value)
      : value ? "確定済" : "行動中";
    const isOk = await confirm({
      title: "一括更新",
      message: `選択した ${uids.length} 名を「${valueLabel}」に変更します。`,
      confirmText: "更新実行"
    });
    if (!isOk) return false;

    try {
      // 400件ずつバッチ更新
      const chunks = chunkArray(uids, 400);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(uid => {
          batch.update(doc(db, "users", uid), { [field]: value });
        });
        await batch.commit();
      }

      await alert({ title: "完了", message: "更新が成功しました。", variant: "success" });
      return true;
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "更新に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const deleteUsers = async (uids: string[]) => {
    if (uids.length === 0) return false;
    const isOk = await confirm({
      title: "ユーザーの削除",
      message: `選択した ${uids.length} 名のユーザーを完全に削除します。取引履歴以外のすべてのデータが失われ、元に戻せません。よろしいですか？`,
      variant: "danger",
      confirmText: "削除する"
    });
    if (!isOk) return false;

    try {
      const fn = httpsCallable(functions, "deleteUsers");
      await fn({ uids });
      await alert({ title: "削除完了", message: "削除が完了しました。", variant: "success" });
      return true;
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "削除に失敗しました。", variant: "danger" });
      return false;
    }
  };

  const saveInitialSettings = async (
    initialPoint: ExactNumberInput,
    holdings: Array<{ stockId: string; amount: string }>
  ) => {
    if (!isPositiveIntegerInput(initialPoint)) {
      await alert({ title: "入力エラー", message: "初期ポイントは1以上の整数で指定してください。", variant: "danger" });
      return false;
    }

    const filledRows = holdings.filter(row => row.stockId);
    const stockIds = filledRows.map(row => row.stockId);
    if (new Set(stockIds).size !== stockIds.length) {
      await alert({ title: "入力エラー", message: "同じ銘柄が複数行選択されています。銘柄は重複しないようにしてください。", variant: "danger" });
      return false;
    }
    // "0" (or "00", "0.0" 等の明示的なゼロ入力) のみを許容し、それ以外の不正な入力はエラーとする。
    const ZERO_RE = /^0+(\.0+)?$/;
    const isZeroAmount = (amount: string) => ZERO_RE.test(amount.trim().replace(/,/g, ""));

    for (const row of filledRows) {
      if (row.amount && !isZeroAmount(row.amount) && !isPositiveIntegerInput(row.amount)) {
        await alert({ title: "入力エラー", message: "初期保有株の株数は1以上の整数で指定してください。", variant: "danger" });
        return false;
      }
    }

    const initialHoldings: Record<string, string> = {};
    for (const row of filledRows) {
      if (row.amount && isPositiveIntegerInput(row.amount)) {
        initialHoldings[row.stockId] = toExactString(row.amount);
      }
    }

    try {
      await setDoc(doc(db, "settings", "system"), {
        initialPoint: toExactString(initialPoint),
        initialHoldings,
      }, { merge: true });
      await alert({ title: "保存完了", message: "初期ポイント・初期保有株の設定を保存しました。", variant: "success" });
      return true;
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
      return false;
    }
  };

  return { bulkGenerateUsers, bulkUpdateStatus, saveInitialSettings, deleteUsers };
}
