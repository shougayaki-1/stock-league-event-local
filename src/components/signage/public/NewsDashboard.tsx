import type { Stock, NewsItem, ChartData } from "../../../types/domain";
import { Clock, Newspaper, Target, TrendingUp } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { getLatestNewsByKind } from "../../../lib/news";

export default function NewsDashboard({ stocks, news, chartData, flashState }: { stocks: Stock[], news: NewsItem[], chartData: ChartData[], flashState: Record<string, "UP" | "DOWN"> }) {
  const focusStock = stocks[0];
  const publicNews = getLatestNewsByKind(news, "PUBLIC");
  const postNews = getLatestNewsByKind(news, "POST");
  const average = Math.round(stocks.reduce((acc, s) => acc + s.currentPrice, 0) / (stocks.length || 1));
  
  // FOCUS銘柄の変動計算
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
  const prevPrice = focusStock && prevData ? Number(prevData[focusStock.name]) || focusStock.currentPrice : focusStock?.currentPrice || 0;
  const diff = focusStock ? focusStock.currentPrice - prevPrice : 0;
  
  const focusFlash = focusStock ? flashState[focusStock.id] : null;
  const focusBg = focusFlash === "UP" ? "border-red-400 bg-red-50 dark:border-red-500/70 dark:bg-red-950/40" :
                  focusFlash === "DOWN" ? "border-blue-400 bg-blue-50 dark:border-blue-500/70 dark:bg-blue-950/40" :
                  "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const changeClass = diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-slate-400";

  return (
    <div className="grid h-full grid-cols-[1.48fr_0.72fr] gap-4 overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex shrink-0 items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
            <Newspaper size={32} />
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">最新ニュース</h2>
          </div>
          <span className="text-2xl font-black text-slate-400">{[publicNews, postNews].filter(Boolean).length}件</span>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
          {[{ label: "速報", item: publicNews }, { label: "追加ニュース", item: postNews }].map(({ label, item }) => (
            <article key={label} className="min-h-0 overflow-hidden rounded-md bg-slate-50 px-5 py-4 dark:bg-slate-950">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xl font-black text-slate-500 dark:text-slate-400">{label}</p>
                <div className="flex items-center gap-2 font-mono text-base font-black text-slate-400">
                  <Clock size={16} />
                  <span>{item?.timestamp?.toDate().toLocaleTimeString("ja-JP") ?? "--:--:--"}</span>
                </div>
              </div>
              {item ? (
                <>
                  <h3 className="text-4xl font-black leading-tight text-slate-900 dark:text-white">{item.title}</h3>
                  <p className="mt-3 whitespace-pre-wrap text-2xl font-bold leading-snug text-slate-600 dark:text-slate-300">{item.body}</p>
                </>
              ) : (
                <p className="flex h-full items-center justify-center text-3xl font-black text-slate-400">ニュースを待機中</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <aside className="grid min-h-0 grid-rows-[0.7fr_1.3fr] gap-4">
        <div className="flex min-h-0 flex-col justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex items-center gap-2 text-blue-600 dark:text-blue-300">
            <TrendingUp size={24} />
            <p className="text-xl font-black text-slate-500 dark:text-slate-400">イベント平均株価</p>
          </div>
          <p className="font-mono text-6xl font-black leading-none text-slate-900 dark:text-white">{average}</p>
        </div>

        <div className={`relative min-h-0 overflow-hidden rounded-lg border p-4 transition-colors duration-300 ${focusBg}`}>
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <Target size={24} />
                <p className="text-xl font-black">注目銘柄</p>
              </div>
              {focusStock ? (
                <>
                  <p className="line-clamp-2 text-4xl font-black leading-tight text-slate-900 dark:text-white">{focusStock.name}</p>
                  <p className="mt-4 font-mono text-6xl font-black leading-none text-slate-900 dark:text-white">{focusStock.currentPrice}</p>
                </>
              ) : (
                <p className="text-2xl font-black text-slate-400">銘柄を待機中</p>
              )}
            </div>

            {focusStock && (
              <p className={`font-mono text-4xl font-black leading-none ${changeClass}`}>
                {diff > 0 ? `+${diff}` : diff}
              </p>
            )}
          </div>

          {focusStock && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-[0.15]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <YAxis domain={['auto', 'auto']} hide />
                  <Line type="monotone" dataKey={focusStock.name} stroke={diff >= 0 ? "#ef4444" : "#3b82f6"} strokeWidth={8} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
