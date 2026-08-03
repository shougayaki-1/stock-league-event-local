import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import type { Stock } from "../../../types/domain";
import { Activity, AlertTriangle } from "lucide-react";
import { absExact, formatExact, type ExactNumberInput } from "../../../lib/exactNumber";
import { formatRelativeTime } from "../../../lib/time";

interface LogEntry { id: string; uid: string; type: string; stockId: string; price: number; amount: ExactNumberInput; totalPoint: ExactNumberInput; timestamp: Timestamp; }

export default function TransactionMonitor({ stocks, limitCount = 30, compact = false }: { stocks: Stock[]; limitCount?: number; compact?: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 相対時刻（○分前）を1分ごとに再計算するための tick
  const [, setNowTick] = useState(0);

  useEffect(() => {
    try {
      const q = query(collection(db, "public_transactions"), orderBy("timestamp", "desc"), limit(limitCount));
      const unsub = onSnapshot(q, (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })) as LogEntry[]);
        setErrorMsg(null);
      }, (error) => {
        console.error("トランザクション取得エラー:", error);
        // インデックス不足の場合はわかりやすく表示する
        if (error.message.includes("indexes") || error.message.includes("index")) {
          setErrorMsg("データベースの「インデックス」が必要です。ブラウザの開発者ツール(F12)のConsoleを開き、表示されているURLをクリックしてインデックスを作成してください。");
        } else {
          setErrorMsg(error.message);
        }
      });
      return () => unsub();
    } catch (e) {
      console.error(e);
    }
  }, [limitCount]);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Activity size={compact ? 28 : 36} className="shrink-0 text-blue-600 dark:text-blue-300" />
          <h2 className={`${compact ? "text-2xl" : "text-4xl"} font-black leading-tight text-slate-900 dark:text-white`}>リアルタイム取引ログ</h2>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-start overflow-hidden">
        {errorMsg ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-red-500">
            <AlertTriangle size={64} className="mb-4" />
            <p className="text-2xl font-bold">{errorMsg}</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-full animate-pulse items-center justify-center text-3xl font-black text-slate-400">
            取引データを待機中...
          </div>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, limitCount).map((log, index) => {
              const stockName = stocks.find(s => s.id === log.stockId)?.name || log.stockId;
              const isBuy = log.type === "BUY";
              
              const bgClass = isBuy ? "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/25" : "border-blue-200 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-950/25";
              const textHighlight = isBuy ? "text-red-600 dark:text-red-300" : "text-blue-600 dark:text-blue-300";
              const textBadge = isBuy ? "bg-red-500 text-white" : "bg-blue-500 text-white";
              const opacity = Math.max(0.18, 1 - index * 0.045);

              const timeString = log.timestamp ? formatRelativeTime(log.timestamp.toDate()) : "処理中...";

              return compact ? (
                <div key={log.id} className={`grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-md border px-4 py-3 font-mono animate-in fade-in slide-in-from-top-4 ${bgClass}`} style={{ opacity }}>
                  <span className={`row-span-2 self-center rounded px-2 py-2 text-center text-2xl font-black ${textBadge}`}>{isBuy ? "買" : "売"}</span>
                  <div className="min-w-0">
                    <p className="break-words text-2xl font-black leading-tight text-slate-900 dark:text-white">{stockName}</p>
                    <p className="mt-1 text-lg font-black text-slate-500 dark:text-slate-400">{timeString} / {isBuy ? "購入時" : "売却時"} {formatExact(log.amount)}株 @ {log.price}pt</p>
                  </div>
                  <div className={`text-right text-3xl font-black leading-none ${textHighlight}`}>
                    {isBuy ? "-" : "+"}{formatExact(absExact(log.totalPoint))}
                    <span className="ml-1 text-xl">pt</span>
                  </div>
                </div>
              ) : (
                <div key={log.id} className={`grid grid-cols-[9rem_5rem_minmax(0,1fr)_13rem_16rem] items-center gap-4 rounded-md border px-5 py-3 font-mono animate-in fade-in slide-in-from-top-4 ${bgClass}`} style={{ opacity }}>
                  <span className="text-center text-2xl font-black text-slate-500 dark:text-slate-400">{timeString}</span>
                  <span className={`rounded px-3 py-1 text-center text-2xl font-black ${textBadge}`}>{isBuy ? "買" : "売"}</span>
                  <span className="truncate text-3xl font-black tracking-wide text-slate-900 dark:text-white">{stockName}</span>
                  <span className="text-right text-2xl font-black text-slate-500 dark:text-slate-400">
                    {formatExact(log.amount)}株 / {isBuy ? "購入時" : "売却時"} {log.price}pt
                  </span>
                  <div className={`text-right text-4xl font-black leading-none ${textHighlight}`}>
                    {isBuy ? "-" : "+"}{formatExact(absExact(log.totalPoint))}
                    <span className="ml-2 text-2xl">pt</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 h-24 w-full bg-gradient-to-t from-white to-transparent dark:from-slate-900"></div>
    </div>
  );
}
