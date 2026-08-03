import { useState, useEffect, useMemo } from "react";
import { collectionGroup, onSnapshot, query, orderBy, limit, collection, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Stock, User } from "../../types/domain";
import { ScrollText, Search, Download } from "lucide-react";
import Papa from "papaparse";

import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { absExact, formatExact, type ExactNumberInput } from "../../lib/exactNumber";

interface LogEntry { id: string; uid: string; type: string; stockId: string; price: number; amount: ExactNumberInput; totalPoint: ExactNumberInput; timestamp?: Timestamp; }

const LOG_LIMIT = 500;

const formatLogTime = (timestamp?: Timestamp) => timestamp
  ? timestamp.toDate().toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
  : "処理中...";

const formatCsvDate = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
};

export default function TransactionLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, User>>({});
  const [filterId, setFilterId] = useState("");
  const [filterStock, setFilterStock] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubStocks = onSnapshot(collection(db, "stocks"), (snap) => setStocks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Stock))));
    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      const map: Record<string, User> = {};
      snap.docs.forEach(d => { const u = { uid: d.id, ...d.data() } as User; map[d.id] = u; });
      setUsersMap(map);
    });
    const q = query(collectionGroup(db, "transactions"), orderBy("timestamp", "desc"), limit(LOG_LIMIT));
    const unsubL = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, uid: d.ref.parent.parent?.id || "unknown", ...d.data() })) as LogEntry[]);
      setIsLoading(false);
    });
    return () => { unsubStocks(); unsubUsers(); unsubL(); };
  }, []);

  const stocksMap = useMemo(() => Object.fromEntries(stocks.map(stock => [stock.id, stock])), [stocks]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const user = usersMap[log.uid];
      const needle = filterId.trim().toLowerCase();
      const matchId = needle ? ((user?.shortId || "").toLowerCase().includes(needle) || (user?.nickname || "").toLowerCase().includes(needle)) : true;
      const matchStock = filterStock ? log.stockId === filterStock : true;
      return matchId && matchStock;
    });
  }, [logs, usersMap, filterId, filterStock]);

  const downloadCSV = () => {
    const csvData = filteredLogs.map(log => ({
      時刻: log.timestamp?.toDate().toLocaleString(),
      ID: usersMap[log.uid]?.shortId || log.uid,
      名前: usersMap[log.uid]?.nickname || "不明",
      種類: log.type,
      銘柄: stocksMap[log.stockId]?.name || log.stockId,
      単価: log.price, 数量: log.amount, ポイント: log.totalPoint
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `transaction_logs_${formatCsvDate()}.csv`;
    link.click();
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full h-full flex flex-col">
      <div className="mb-8 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2"><ScrollText className="text-slate-400" /> 取引ログ (監視)</h2>
          <p className="text-slate-500 text-sm mt-1">リアルタイムで発生する売買を検索・監視できます。</p>
        </div>
        <Button variant="secondary" onClick={downloadCSV} className="w-full sm:w-auto"><Download size={18} className="mr-2"/> CSV出力 ({filteredLogs.length}件)</Button>
      </div>

      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="名前またはIDで検索..." value={filterId} onChange={e => setFilterId(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-sm font-bold text-slate-800 dark:text-white" />
          </div>
          <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm font-bold outline-none text-slate-800 dark:text-white">
            <option value="">全ての銘柄</option>
            {stocks.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <CardContent className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-transparent p-4">
          {logs.length >= LOG_LIMIT && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              直近{LOG_LIMIT}件のみ表示中です。
            </div>
          )}
          <p className="mb-3 text-xs font-bold text-slate-400">{filteredLogs.length}件 / {logs.length}件</p>
          <div className="space-y-2">
            {isLoading && <p className="py-10 text-center text-sm font-black text-slate-400">取引ログを読み込み中です...</p>}
            {filteredLogs.map(log => (
              <div key={log.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-mono text-[10px] text-slate-400 w-24 shrink-0">{formatLogTime(log.timestamp)}</span>
                  <Badge variant={log.type === "BUY" ? "danger" : log.type === "SELL" ? "info" : "default"} className="w-10 justify-center">{log.type === "BUY" ? "買" : log.type === "SELL" ? "売" : log.type}</Badge>
                  <div className="min-w-0">
                    <p className="font-black text-slate-800 dark:text-slate-100 text-sm truncate">{usersMap[log.uid]?.nickname || "不明"}</p>
                    <p className="text-[10px] text-slate-400 font-mono">ID: {usersMap[log.uid]?.shortId || "---"}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{stocksMap[log.stockId]?.name || log.stockId}</p>
                  <p className={`font-mono font-black text-lg ${log.type === "BUY" ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400"}`}>
                    {log.type === "BUY" ? "-" : "+"}{formatExact(absExact(log.totalPoint))}
                  </p>
                </div>
              </div>
            ))}
            {!isLoading && filteredLogs.length === 0 && <p className="py-10 text-center text-sm font-black text-slate-400">該当する取引がありません。</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
