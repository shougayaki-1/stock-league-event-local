import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { Stock, User } from "../../../types/domain";
import { compareExact, formatExact, isPositiveExact, toExactBigInt, toExactString } from "../../../lib/exactNumber";
import { UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";

interface Purchase {
  uid: string;
  stockId: string;
  price: number;
  amount: string;
  isUndone?: boolean;
}

const DEFAULT_BUY_PRICE = 1000;

const calcAsset = (user: User, stocks: Stock[]) => {
  const prices = new Map(stocks.map(stock => [stock.id, BigInt(stock.currentPrice)]));
  let total = toExactBigInt(user.points);
  Object.entries(user.inventory || {}).forEach(([stockId, amount]) => {
    total += (prices.get(stockId) || 0n) * toExactBigInt(amount);
  });
  return total.toString();
};

export default function ClassroomGridBoard({ users, stocks }: { users: User[]; stocks: Stock[]; chartData: unknown[]; serverTimeOffsetMillis?: number }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  useEffect(() => {
    const transactionsQuery = query(collection(db, "public_transactions"), orderBy("timestamp", "desc"), limit(300));
    return onSnapshot(transactionsQuery, (snapshot) => {
      setPurchases(snapshot.docs.flatMap((item) => {
        const data = item.data();
        if (data.type !== "BUY" || typeof data.uid !== "string") return [];
        return [{
          uid: data.uid,
          stockId: String(data.stockId || ""),
          price: Number(data.price),
          amount: toExactString(data.amount),
          isUndone: data.isUndone === true,
        }];
      }));
    }, () => setPurchases([]));
  }, []);

  const activeUsers = useMemo(() => users
    .filter(user => user.isInClass && !user.isFinished)
    .map(user => ({ ...user, asset: calcAsset(user, stocks) }))
    .sort((a, b) => compareExact(b.asset, a.asset)), [users, stocks]);
  const stockById = useMemo(() => new Map(stocks.map(stock => [stock.id, stock])), [stocks]);
  const averageBuyPrice = useMemo(() => {
    const totals = new Map<string, { shares: bigint; points: bigint }>();
    purchases.filter(purchase => !purchase.isUndone && Number.isFinite(purchase.price) && purchase.price > 0).forEach((purchase) => {
      const key = `${purchase.uid}:${purchase.stockId}`;
      const previous = totals.get(key) || { shares: 0n, points: 0n };
      const shares = toExactBigInt(purchase.amount);
      if (shares <= 0n) return;
      totals.set(key, { shares: previous.shares + shares, points: previous.points + BigInt(Math.round(purchase.price)) * shares });
    });
    return new Map([...totals.entries()].filter(([, total]) => total.shares > 0n).map(([key, total]) => [key, Number(total.points / total.shares)]));
  }, [purchases]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(activeUsers.length / pageSize));
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setPageIndex(current => (current + 1) % pageCount), 6000);
    return () => window.clearInterval(timer);
  }, [pageCount]);
  const visibleUsers = activeUsers.slice((pageIndex % pageCount) * pageSize, (pageIndex % pageCount + 1) * pageSize);
  const columns = visibleUsers.length >= 7 ? "grid-cols-4" : visibleUsers.length > 4 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white p-5 text-black">
      <header className="mb-4 flex shrink-0 items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-4"><UsersRound size={46} className="text-sky-600" /><div><h2 className="text-4xl font-black leading-none">教室ライブポートフォリオ</h2><p className="mt-1 text-lg font-black text-slate-500">総資産・保有株・売り時の目安</p></div></div>
        <div className="text-right"><p className="text-5xl font-black leading-none text-sky-600">{activeUsers.length}</p><p className="mt-1 text-lg font-black text-slate-400">{pageCount > 1 ? `${pageIndex % pageCount + 1}/${pageCount} PAGE` : "IN CLASS"}</p></div>
      </header>
      {activeUsers.length === 0 ? <div className="flex flex-1 items-center justify-center text-5xl font-black text-slate-300">入室受付を待機中</div> : (
        <div className={`grid min-h-0 flex-1 ${columns} gap-3 overflow-hidden`}>
          {visibleUsers.map((user, index) => {
            const rank = activeUsers.findIndex(activeUser => activeUser.uid === user.uid) + 1;
            const holdings = Object.entries(user.inventory || {}).flatMap(([stockId, amount]) => {
              if (!isPositiveExact(amount)) return [];
              const stock = stockById.get(stockId);
              if (!stock) return [];
              const average = averageBuyPrice.get(`${user.uid}:${stockId}`) ?? DEFAULT_BUY_PRICE;
              const sellNow = stock.currentPrice >= average;
              return [{ stock, amount: toExactString(amount), average, sellNow }];
            });
            return <article key={user.uid} className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><p className="truncate text-2xl font-black">{user.nickname}</p><span className="rounded bg-slate-100 px-2 py-1 text-lg font-black">#{rank || index + 1}</span></div>
              <div className="mt-3 rounded-md bg-sky-50 px-3 py-2"><p className="text-xs font-black text-slate-500">総資産</p><p className="text-3xl font-black text-sky-700">{formatExact(user.asset)}<span className="ml-1 text-lg">pt</span></p></div>
              <div className="mt-3 min-h-0 flex-1 overflow-hidden"><p className="mb-2 text-xs font-black text-slate-400">保有株 / 売り時の目安</p>{holdings.length === 0 ? <p className="text-base font-black text-slate-400">保有株なし</p> : <div className="space-y-1.5">{holdings.map(({ stock, amount, sellNow }) => <div key={stock.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1.5"><span className="min-w-0 truncate text-base font-black">{stock.name} <span className="text-sm text-slate-500">{formatExact(amount)}株</span></span><span className={`shrink-0 rounded px-2 py-1 text-xs font-black ${sellNow ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>{sellNow ? "売却を検討" : "様子見"}</span></div>)}</div>}</div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
