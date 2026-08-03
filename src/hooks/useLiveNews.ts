import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { NewsItem } from "../types/domain";

export const useLiveNews = (maxCount = 50) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "news"), orderBy("timestamp", "desc"), limit(maxCount));
    const unsub = onSnapshot(q, (snap) => {
      setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
      setErrorMessage(null);
    }, (error) => {
      console.error("配信済みニュース取得エラー", error);
      setNews([]);
      setErrorMessage("配信済みニュースを取得できません。通信状態または権限を確認してください。");
    });
    return () => unsub();
  }, [maxCount]);

  return { news, errorMessage };
};
