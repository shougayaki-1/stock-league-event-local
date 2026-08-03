import { useEffect, useState } from "react";
import { collectionGroup, limit, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ExactNumberInput } from "../lib/exactNumber";

export interface RecentTransaction {
  id: string;
  uid: string;
  type: "BUY" | "SELL";
  stockId: string;
  price: number;
  amount: ExactNumberInput;
  totalPoint: ExactNumberInput;
  timestamp?: Timestamp;
}

export const useRecentTransactions = (maxCount = 30) => {
  const [transactions, setTransactions] = useState<RecentTransaction[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collectionGroup(db, "transactions"), orderBy("timestamp", "desc"), limit(maxCount));
    const unsub = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({
        id: d.id,
        uid: d.ref.parent.parent?.id || "unknown",
        ...d.data()
      })) as RecentTransaction[]);
      setErrorMessage(null);
    }, (error) => {
      console.error("取引ログ取得エラー", error);
      setTransactions([]);
      setErrorMessage(error.code === "failed-precondition"
        ? "取引ログを取得できません。Firestore の collection group インデックスが未作成の可能性があります。"
        : "取引ログを取得できません。通信状態または権限を確認してください。");
    });
    return () => unsub();
  }, [maxCount]);

  return { transactions, errorMessage };
};
