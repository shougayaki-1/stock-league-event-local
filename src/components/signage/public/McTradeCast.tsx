import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { Clock, Radio, Sparkles, TrendingUp } from "lucide-react";
import { db } from "../../../lib/firebase";
import type { Stock, User } from "../../../types/domain";
import { absExact, formatExact, type ExactNumberInput } from "../../../lib/exactNumber";

interface LogEntry {
  id: string;
  uid: string;
  type: "BUY" | "SELL";
  stockId: string;
  price: number;
  amount: ExactNumberInput;
  totalPoint: ExactNumberInput;
  timestamp?: Timestamp;
}

export default function McTradeCast({ users, stocks, sessionEndTime }: { users: User[]; stocks: Stock[]; sessionEndTime?: Timestamp | null }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionEndTime) {
      const timer = window.setTimeout(() => setRemainingSec(null), 0);
      return () => window.clearTimeout(timer);
    }
    const endMillis = sessionEndTime.toMillis();
    const update = () => setRemainingSec(Math.max(0, Math.floor((endMillis - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [sessionEndTime]);

  const remainingLabel = remainingSec === null
    ? "取引時間外"
    : `残り ${Math.floor(remainingSec / 60).toString().padStart(2, "0")}:${(remainingSec % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    const q = query(collection(db, "public_transactions"), orderBy("timestamp", "desc"), limit(40));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as LogEntry[]);
    }, (error) => {
      console.error("実況用取引ログ取得エラー", error);
      setLogs([]);
    });
    return () => unsub();
  }, []);

  const userMap = useMemo(() => new Map(users.map(user => [user.uid, user])), [users]);
  const stockMap = useMemo(() => new Map(stocks.map(stock => [stock.id, stock])), [stocks]);
  const activeLogs = logs.filter(log => userMap.get(log.uid)?.isInClass).slice(0, 12);
  const hotStocks = useMemo(() => {
    const counts = new Map<string, { stockId: string; buys: number; sells: number }>();
    activeLogs.forEach(log => {
      const current = counts.get(log.stockId) || { stockId: log.stockId, buys: 0, sells: 0 };
      if (log.type === "BUY") current.buys += 1;
      else current.sells += 1;
      counts.set(log.stockId, current);
    });
    return [...counts.values()].sort((a, b) => (b.buys + b.sells) - (a.buys + a.sells)).slice(0, 4);
  }, [activeLogs]);

  return (
    <div className="grid h-full w-full grid-cols-[1fr_25rem] gap-5 overflow-hidden bg-slate-50 p-6 text-slate-950">
      <section className="flex min-h-0 flex-col overflow-hidden">
        <header className="mb-5 flex shrink-0 items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-4">
            <Radio size={44} className="text-red-600" />
            <div>
              <h2 className="text-5xl font-black leading-none">MC実況モニター</h2>
              <p className="mt-2 text-xl font-black text-slate-500">教室内の約定だけを大きく表示</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 rounded-md px-4 py-2 text-2xl font-black ${remainingSec !== null && remainingSec <= 60 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-700"}`}>
              <Clock size={26} />
              <span className="font-mono tabular-nums">{remainingLabel}</span>
            </span>
            <span className="rounded-md bg-red-600 px-4 py-2 text-2xl font-black text-white">LIVE</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {activeLogs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-5xl font-black text-slate-300">実況対象の取引を待機中</div>
          ) : activeLogs.map((log, index) => {
            const user = userMap.get(log.uid);
            const stock = stockMap.get(log.stockId);
            const isBuy = log.type === "BUY";
            return (
              <article key={log.id} className={`grid grid-cols-[7rem_minmax(0,1fr)_12rem_17rem] items-center gap-5 rounded-lg border px-5 py-4 font-mono shadow-sm ${isBuy ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50"}`} style={{ opacity: Math.max(0.42, 1 - index * 0.05) }}>
                <span className={`rounded-md py-2 text-center text-3xl font-black text-white ${isBuy ? "bg-red-600" : "bg-blue-600"}`}>{isBuy ? "買" : "売"}</span>
                <div className="min-w-0">
                  <p className="truncate text-4xl font-black">{user?.nickname || "Unknown"} <span className="text-2xl text-slate-400">No.{user?.shortId || "----"}</span></p>
                  <p className="truncate text-2xl font-black text-slate-500">{stock?.name || log.stockId}</p>
                </div>
                <p className="text-right text-3xl font-black text-slate-600">{formatExact(log.amount)}株<br /><span className="text-xl">{isBuy ? "購入時" : "売却時"} {log.price}pt</span></p>
                <p className={`text-right text-5xl font-black leading-none ${isBuy ? "text-red-600" : "text-blue-600"}`}>
                  {isBuy ? "-" : "+"}{formatExact(absExact(log.totalPoint))}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500"><Sparkles size={20} /><p className="text-sm font-black tracking-widest">実況コメント</p></div>
          <p className="text-4xl font-black leading-tight">{activeLogs[0] ? `${userMap.get(activeLogs[0].uid)?.nickname || "参加者"}が${stockMap.get(activeLogs[0].stockId)?.name || activeLogs[0].stockId}を${activeLogs[0].type === "BUY" ? "買い" : "売り"}！` : "次の約定を待機中"}</p>
        </div>
        <div className="min-h-0 flex-1 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-slate-500"><TrendingUp size={20} /><p className="text-sm font-black tracking-widest">HOT STOCKS</p></div>
          <div className="space-y-3">
            {hotStocks.map(item => (
              <div key={item.stockId} className="rounded-md bg-slate-100 p-4">
                <p className="truncate text-2xl font-black">{stockMap.get(item.stockId)?.name || item.stockId}</p>
                <p className="mt-1 text-xl font-black text-slate-500">買 {item.buys} / 売 {item.sells}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
