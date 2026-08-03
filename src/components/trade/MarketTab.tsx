import React from "react";
import { Newspaper } from "lucide-react";
import StockCard from "../ui/StockCard";
import type { User, Stock, NewsItem, ChartData, Transaction } from "../../types/domain";
import StockLineChart from "../ui/StockLineChart";
import { formatExact, isPositiveExact, toExactString } from "../../lib/exactNumber";

interface Props {
  user: User;
  stocks: Stock[];
  news: NewsItem[];
  chartData: ChartData[];
  transactions: Transaction[];
  flashState: Record<string, "UP" | "DOWN">;
  openTradeModal: (stock: Stock, type: "BUY" | "SELL") => void;
  isLoading: boolean;
  isMarketClosed: boolean;
}

function MarketTab({ user, stocks, news, chartData, transactions, flashState, openTradeModal, isLoading, isMarketClosed }: Props) {
  return (
    <div className="animate-in fade-in duration-300 space-y-8">
      {news.length > 0 && (
        <div className="border p-3 rounded-xl flex items-center gap-3 shadow-sm bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50">
          <Newspaper size={18} className="shrink-0 text-emerald-600 dark:text-emerald-500" />
          <p className="text-sm font-bold truncate text-emerald-800 dark:text-emerald-300">
            {news[0].title}
          </p>
        </div>
      )}

      <section>
        <div className="flex justify-between items-end mb-4"><h2 className="text-xs text-slate-400 font-black uppercase tracking-widest">Your Portfolio</h2></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
            <span className="font-bold text-slate-600 dark:text-slate-300 text-xs mb-1">現金</span>
            <span className="font-mono font-black text-slate-800 dark:text-white text-xl">{formatExact(user.points)} <span className="text-[10px] text-slate-400">pt</span></span>
          </div>
          {Object.entries(user.inventory || {}).map(([stockId, amount]) => {
              const stock = stocks.find(s => s.id === stockId);
              const stockName = stock?.name || stockId;
              const purchases = transactions.filter(tx => tx.stockId === stockId && tx.type === "BUY" && !tx.isUndone);
              const totals = purchases.reduce((sum, tx) => ({ amount: sum.amount + BigInt(toExactString(tx.amount)), points: sum.points + BigInt(Math.round(tx.price)) * BigInt(toExactString(tx.amount)) }), { amount: 0n, points: 0n });
              const averageBuyPrice = totals.amount > 0n ? Number(totals.points / totals.amount) : null;
              const priceDiff = averageBuyPrice !== null && stock ? stock.currentPrice - averageBuyPrice : null;
              return isPositiveExact(amount) ? (
                <div key={stockId} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
                  <span className="font-bold text-slate-600 dark:text-slate-300 text-xs mb-1">{stockName}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-black text-slate-800 dark:text-white text-xl">{formatExact(amount)} <span className="text-[10px] text-slate-400">株</span></span>
                    {priceDiff !== null && (
                      <span className={`rounded px-2 py-1 text-[10px] font-black ${priceDiff >= 0 ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" : "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"}`}>
                        {priceDiff >= 0 ? "売却を検討" : "様子見"}
                      </span>
                    )}
                  </div>
                  {averageBuyPrice !== null && stock && (
                    <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-bold dark:border-slate-800">
                      <p className="text-slate-500">購入時 平均 {averageBuyPrice}pt → 現在 {stock.currentPrice}pt</p>
                    </div>
                  )}
                </div>
              ) : null;
          })}
        </div>
        {!Object.values(user.inventory || {}).some(isPositiveExact) && <p className="mt-3 text-center text-sm font-bold text-slate-400">保有銘柄はありません</p>}
      </section>

      <section>
        <h2 className="text-xs text-slate-400 font-black mb-4 uppercase tracking-widest">Market Board</h2>
        {stocks.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl text-center border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 font-bold">現在、市場に上場している銘柄はありません。</p>
            <p className="text-xs text-slate-400 mt-2">管理画面から銘柄を追加するか、システムが稼働するのをお待ちください。</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="h-56 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
              <StockLineChart chartData={chartData} stocks={stocks} showAxis showGrid showLegend margin={{ top: 8, right: 8, bottom: 0, left: -10 }} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stocks.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  chartData={chartData}
                  flashState={flashState[stock.id]}
                  onBuy={() => openTradeModal(stock, "BUY")}
                  onSell={() => openTradeModal(stock, "SELL")}
                  isMarketClosed={isMarketClosed}
                  isLoading={isLoading}
                  inventoryAmount={user.inventory?.[stock.id] || 0}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default React.memo(MarketTab);
