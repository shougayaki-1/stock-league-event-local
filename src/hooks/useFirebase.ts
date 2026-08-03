import { useMemo, useState, useEffect } from "react";
import { doc, collection, onSnapshot, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { compareExact } from "../lib/exactNumber";
import { createHistoryPoint, createMarketHistory, materializeStocks, type PublicMarketData } from "../lib/marketPricing";
import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCS, userTransactionsPath } from "../lib/firestorePaths";
import type { ChartData, NewsItem, PrizeGrade, SignageState, SystemStatus, Transaction, User } from "../types/domain";
import { useServerClock } from "../lib/serverTime";

// market_for_users は ecoMode 下でもサーバー側で書き込み頻度が間引かれているため、
// onSnapshot(実際に書き換わった時だけ課金される)がポーリングより常に安上がり。
// タブ内で複数コンポーネントが useMarketData を呼んでも購読は1本に共有する。
let sharedMarketData: PublicMarketData | null = null;
let sharedMarketUnsub: (() => void) | null = null;
const sharedMarketSubscribers = new Set<(market: PublicMarketData | null) => void>();

const subscribeMarketData = (listener: (market: PublicMarketData | null) => void) => {
  sharedMarketSubscribers.add(listener);
  listener(sharedMarketData);

  if (!sharedMarketUnsub) {
    sharedMarketUnsub = onSnapshot(doc(db, ...FIRESTORE_DOCS.marketForUsers), (snap) => {
      sharedMarketData = snap.exists() ? snap.data() as PublicMarketData : null;
      sharedMarketSubscribers.forEach((subscriber) => subscriber(sharedMarketData));
    }, (e) => {
      console.error("市場データ取得エラー", e);
      sharedMarketData = null;
      sharedMarketSubscribers.forEach((subscriber) => subscriber(sharedMarketData));
    });
  }

  return () => {
    sharedMarketSubscribers.delete(listener);
    if (sharedMarketSubscribers.size === 0 && sharedMarketUnsub) {
      sharedMarketUnsub();
      sharedMarketUnsub = null;
    }
  };
};

export const useMarketData = () => {
  const [marketData, setMarketData] = useState<PublicMarketData | null>(sharedMarketData);

  useEffect(() => subscribeMarketData(setMarketData), []);

  return marketData;
};

export const useUser = (uid: string | null) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(doc(db, FIRESTORE_COLLECTIONS.users, uid), (docSnap) => {
      if (docSnap.exists()) {
        setUser(docSnap.data() as User);
      }
    });
    return () => unsub();
  }, [uid]);

  return user;
};

// 全銘柄が同時に、10秒に1回程度のペースで動いて見えるよう、表示用の現在時刻を
// 10秒単位に丸める（実際の再計算はこの間隔でのみ値が変わる）。
const PRICE_DISPLAY_TICK_MS = 10000;
const quantizeToDisplayTick = (millis: number) => Math.floor(millis / PRICE_DISPLAY_TICK_MS) * PRICE_DISPLAY_TICK_MS;

export const useStocks = () => {
  const marketData = useMarketData();
  const { serverTimeOffsetMillis } = useServerClock();
  const [nowMillis, setNowMillis] = useState(() => quantizeToDisplayTick(Date.now()));

  useEffect(() => {
    let timeoutId: number | null = null;
    const scheduleNextTick = () => {
      const now = Date.now() + serverTimeOffsetMillis;
      setNowMillis(quantizeToDisplayTick(now));
      const nextDelay = Math.max(250, PRICE_DISPLAY_TICK_MS - (now % PRICE_DISPLAY_TICK_MS));
      timeoutId = window.setTimeout(scheduleNextTick, nextDelay);
    };
    scheduleNextTick();
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [serverTimeOffsetMillis]);

  const stocks = useMemo(() => materializeStocks(marketData, nowMillis), [marketData, nowMillis]);

  return stocks;
};


export const useChartHistory = () => {
  const [history, setHistory] = useState<ChartData[]>([]);
  const marketData = useMarketData();
  const { serverTimeOffsetMillis } = useServerClock();

  useEffect(() => {
    let timeoutId: number | null = null;
    if (!marketData?.stocks?.length) {
      timeoutId = window.setTimeout(() => setHistory([]), 0);
      return () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      };
    }

    timeoutId = window.setTimeout(() => {
      setHistory((prev) => prev.length > 0 ? prev : createMarketHistory(marketData, 30, 10000, Date.now() + serverTimeOffsetMillis));
    }, 0);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [marketData, serverTimeOffsetMillis]);

  useEffect(() => {
    if (!marketData?.stocks?.length) return;
    const intervalId = setInterval(() => {
      const serverNow = Date.now() + serverTimeOffsetMillis;
      const currentStocks = materializeStocks(marketData, serverNow);
      setHistory((prev) => [...prev, createHistoryPoint(currentStocks, new Date(serverNow))].slice(-30));
    }, 10000);
    return () => clearInterval(intervalId);
  }, [marketData, serverTimeOffsetMillis]);

  return history;
};

export const useAllUsersRanking = () => {
  const { users } = useRankingData();
  return users;
};

export const useRankingData = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);

  useEffect(() => {
    const unsubRanking = onSnapshot(doc(db, ...FIRESTORE_DOCS.ranking), (snap) => {
      const data = snap.data() as { users?: User[]; totalAgents?: number } | undefined;
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setTotalAgents(typeof data?.totalAgents === "number" ? data.totalAgents : 0);
    }, (e) => {
      console.error("ランキング取得エラー", e);
      setUsers([]);
      setTotalAgents(0);
    });

    return () => unsubRanking();
  }, []);

  return { users, totalAgents };
};

export const useAllUsersRankingLegacy = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const snap = await getDocs(collection(db, FIRESTORE_COLLECTIONS.users));
        const userList = snap.docs.map(d => d.data() as User);
        userList.sort((a, b) => compareExact(b.points, a.points));
        setUsers(userList);
      } catch (e) {
        console.error("ランキング取得エラー", e);
      }
    };
    fetchRanking();
    const intervalId = setInterval(fetchRanking, 60000);
    return () => clearInterval(intervalId);
  }, []);

  return users;
};

export const useClassroomUsers = () => {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const q = query(collection(db, FIRESTORE_COLLECTIONS.users), orderBy("shortId", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as User)));
    }, (e) => {
      console.error("教室ユーザー取得エラー", e);
      setUsers([]);
    });
    return () => unsub();
  }, []);

  return users;
};

export const useTransactionsWithStatus = (uid: string | null) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, ...userTransactionsPath(uid)),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => d.data() as Transaction));
      setErrorMessage(null);
    }, (error) => {
      console.error("取引履歴取得エラー", error);
      setTransactions([]);
      setErrorMessage("取引履歴を取得できませんでした。通信状況を確認して、もう一度お試しください。");
    });
    return () => unsub();
  }, [uid]);

  return { transactions, errorMessage };
};

export const useTransactions = (uid: string | null) => useTransactionsWithStatus(uid).transactions;

export const useNewsWithStatus = (courseType?: string) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setHasLoaded(false);
    const publicQuery = query(
      collection(db, FIRESTORE_COLLECTIONS.news),
      where("target", "==", "ALL"),
      orderBy("timestamp", "desc"),
      limit(20)
    );
    const unsubPublic = onSnapshot(publicQuery, (snap) => {
      setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
      setHasLoaded(true);
    }, (e) => {
      console.error("公開ニュース取得エラー", e);
      setNews([]);
      setHasLoaded(true);
    });

    return () => unsubPublic();
  }, [courseType]);

  return { news, hasLoaded };
};

export const useNews = (courseType?: string) => useNewsWithStatus(courseType).news;

export const usePrizes = () => {
  const [prizes, setPrizes] = useState<PrizeGrade[]>([]);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...FIRESTORE_DOCS.prizeSettings), (snap) => {
      const grades = snap.data()?.grades;
      if (snap.exists() && Array.isArray(grades)) {
        setPrizes(grades);
        setIsFallback(false);
      } else {
        console.warn("景品設定が未登録のためデフォルト値を使用中です。");
        setPrizes([
          { id: "S", threshold: 10000, desc: "うまい棒10本 + 優先券" },
          { id: "A", threshold: 5000, desc: "うまい棒5本" },
          { id: "B", threshold: 1000, desc: "うまい棒2本" },
          { id: "C", threshold: 0, desc: "参加賞（飴1個）" }
        ]);
        setIsFallback(true);
      }
    }, (error) => {
      console.error("景品設定の取得に失敗しました。", error);
      setIsFallback(true);
    });
    return () => unsub();
  }, []);

  return { grades: prizes, isFallback };
};

// settings/system は useSystemSettings と useSystemSignal の双方から購読されるため、
// 別々に onSnapshot すると同一ドキュメントに2重でリスナーが立ってしまう。1本に共有する。
let sharedSystemSettings: SystemStatus | null = null;
let sharedSystemSettingsUnsub: (() => void) | null = null;
const sharedSystemSettingsSubscribers = new Set<(settings: SystemStatus | null) => void>();

const subscribeSystemSettings = (listener: (settings: SystemStatus | null) => void) => {
  sharedSystemSettingsSubscribers.add(listener);
  listener(sharedSystemSettings);

  if (!sharedSystemSettingsUnsub) {
    sharedSystemSettingsUnsub = onSnapshot(doc(db, ...FIRESTORE_DOCS.systemSettings), (snap) => {
      sharedSystemSettings = snap.exists() ? snap.data() as SystemStatus : null;
      sharedSystemSettingsSubscribers.forEach((subscriber) => subscriber(sharedSystemSettings));
    }, (e) => {
      console.error("システム設定取得エラー", e);
    });
  }

  return () => {
    sharedSystemSettingsSubscribers.delete(listener);
    if (sharedSystemSettingsSubscribers.size === 0 && sharedSystemSettingsUnsub) {
      sharedSystemSettingsUnsub();
      sharedSystemSettingsUnsub = null;
    }
  };
};

export const useSystemSignal = () => {
  const [signal, setSignal] = useState<SystemStatus["activeBreakingNews"]>(null);

  useEffect(() => subscribeSystemSettings((settings) => {
    setSignal(settings?.activeBreakingNews || null);
  }), []);

  return signal;
};

export const useSystemSettings = () => {
  const [settings, setSettings] = useState<SystemStatus | null>(null);

  useEffect(() => subscribeSystemSettings(setSettings), []);

  return settings;
};

export const useSignageState = (signageId: string | null) => {
  const [state, setState] = useState<SignageState | null>(null);

  useEffect(() => {
    if (!signageId) return;
    const unsub = onSnapshot(doc(db, "signages", signageId), (docSnap) => {
      if (docSnap.exists()) {
        setState({ id: docSnap.id, ...docSnap.data() } as SignageState);
      }
    });
    return () => unsub();
  }, [signageId]);

  return state;
};
