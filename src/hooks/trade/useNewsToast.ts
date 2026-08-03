import { useEffect, useRef, useState } from "react";
import type { NewsItem } from "../../types/domain";
import type { SoundType } from "../useSound";

const TOAST_DURATION_MS = 4000;

export function useNewsToast(news: NewsItem[], playSound: (sound: SoundType) => void) {
  const prevNewsCountRef = useRef(-1);
  const timerRef = useRef<number | null>(null);
  const [toastNews, setToastNews] = useState<{ title: string, isInsider: boolean } | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (news.length === 0) return;

    if (prevNewsCountRef.current === -1) {
      prevNewsCountRef.current = news.length;
      return;
    }

    if (news.length > prevNewsCountRef.current) {
      const latestNews = news[0];
      setToastNews({ title: latestNews.title, isInsider: false });
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setToastNews(null), TOAST_DURATION_MS);
      playSound("NEWS_ALERT");
    }

    prevNewsCountRef.current = news.length;
  }, [news, playSound]);

  return toastNews;
}
