import { useEffect, useMemo, useState } from "react";
import type { Stock, NewsItem, ChartData, User } from "../../../types/domain";
import { BarChart2, Medal, Newspaper, Trophy } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { getLatestNewsByKind } from "../../../lib/news";
import { formatExact } from "../../../lib/exactNumber";

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#f97316", "#06b6d4"];

const RANKING_PAGE_SIZE = 5;
const RANKING_PAGE_DURATION_MS = 6000;

export default function SplitNewsStock({ stocks, news, ranking, chartData, flashState }: { stocks: Stock[], news: NewsItem[], ranking: User[], chartData: ChartData[], flashState: Record<string, "UP" | "DOWN"> }) {
  const publicNews = getLatestNewsByKind(news, "PUBLIC");
  const postNews = getLatestNewsByKind(news, "POST");
  const [rankingPage, setRankingPage] = useState(0);
  const rankingPageCount = Math.max(1, Math.ceil(ranking.length / RANKING_PAGE_SIZE));

  useEffect(() => {
    setRankingPage(current => current % rankingPageCount);
  }, [rankingPageCount]);

  useEffect(() => {
    if (rankingPageCount <= 1) return;
    const intervalId = window.setInterval(() => {
      setRankingPage(current => (current + 1) % rankingPageCount);
    }, RANKING_PAGE_DURATION_MS);
    return () => window.clearInterval(intervalId);
  }, [rankingPageCount]);

  const rankingPageUsers = useMemo(() => {
    const start = rankingPage * RANKING_PAGE_SIZE;
    return ranking.slice(start, start + RANKING_PAGE_SIZE);
  }, [ranking, rankingPage]);

  return (
    <div className="grid h-full grid-cols-2 gap-5 overflow-hidden">
      <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <Newspaper size={34} className="text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-4xl font-black text-slate-900 dark:text-white">ニュース</h2>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
          {[{ label: "速報", item: publicNews }, { label: "追加ニュース", item: postNews }].map(({ label, item }) => (
            <article key={label} className="min-h-0 rounded-md bg-slate-50 px-5 py-4 dark:bg-slate-950">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xl font-black text-slate-500 dark:text-slate-400">{label}</p>
                <p className="font-mono text-lg font-black text-slate-400">{item?.timestamp?.toDate().toLocaleTimeString("ja-JP") ?? "--:--:--"}</p>
              </div>
              {item ? (
                <>
                  <p className="text-4xl font-black leading-tight text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-3 whitespace-pre-wrap text-2xl font-bold leading-snug text-slate-600 dark:text-slate-300">{item.body}</p>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-3xl font-black text-slate-400">ニュースを待機中</div>
              )}
            </article>
          ))}
        </div>
      </section>

      <div className="grid min-h-0 grid-rows-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-5">
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex shrink-0 items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
            <BarChart2 size={30} className="text-blue-600 dark:text-blue-300" />
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">株価</h2>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
            {stocks.length === 0 && (
              <div className="flex h-full items-center justify-center text-2xl font-black text-slate-400">銘柄データを取得中</div>
            )}
            {stocks.map((s, i) => {
            const flash = flashState[s.id];
            const previousPoint = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
            const previousPrice = previousPoint ? Number(previousPoint[s.name]) || s.currentPrice : s.currentPrice;
            const diff = s.currentPrice - previousPrice;
            const bgClass = flash === "UP" ? "border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950/30" : flash === "DOWN" ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30" : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950";
            const priceClass = flash === "UP" ? "text-red-500" : flash === "DOWN" ? "text-blue-500" : "text-slate-950 dark:text-white";
            const diffClass = diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-slate-400";

            return (
              <div key={s.id} className={`relative flex min-h-0 items-center justify-between overflow-hidden rounded-md border px-4 py-2 transition-colors duration-300 ${bgClass}`}>
                <span className="relative z-10 min-w-0 truncate pr-4 text-2xl font-black text-slate-900 dark:text-white">{s.name}</span>
                <div className="relative z-10 flex shrink-0 items-baseline gap-3">
                  <span className={`font-mono text-4xl font-black leading-none ${priceClass}`}>{s.currentPrice}</span>
                  <span className={`font-mono text-xl font-black ${diffClass}`}>{diff > 0 ? `+${diff}` : diff}</span>
                </div>
                <div className="pointer-events-none absolute right-32 top-0 h-full w-1/3 opacity-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}><YAxis domain={['auto', 'auto']} hide /><Line type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={4} dot={false} isAnimationActive={false}/></LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
            })}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-2 flex shrink-0 items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Trophy size={30} className="text-amber-500" />
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">ランキング</h2>
            </div>
            <span className="font-mono text-lg font-black text-slate-400">
              {ranking.length === 0 ? "--" : `${rankingPage * RANKING_PAGE_SIZE + 1}-${Math.min((rankingPage + 1) * RANKING_PAGE_SIZE, ranking.length)} / ${ranking.length}`}
            </span>
          </div>

          {ranking.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-2xl font-black text-slate-400">ランキング集計中</div>
          ) : (
            <div key={rankingPage} className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-2 duration-500">
              {rankingPageUsers.map((user, index) => {
                const position = rankingPage * RANKING_PAGE_SIZE + index + 1;
                return (
                  <div key={user.uid} className="flex min-h-0 flex-1 items-center justify-between gap-4 border-b border-slate-100 px-2 last:border-b-0 dark:border-slate-800">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-xl font-black ${position <= 3 ? "bg-amber-100 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
                        {position <= 3 ? <Medal size={22} /> : position}
                      </span>
                      <span className="truncate text-2xl font-black text-slate-900 dark:text-white">{user.nickname}</span>
                    </div>
                    <span className="shrink-0 font-mono text-2xl font-black text-blue-600 dark:text-blue-300">{formatExact(user.totalAssets ?? user.points)}<span className="ml-1 text-base text-slate-400">pt</span></span>
                  </div>
                );
              })}
            </div>
          )}

          {rankingPageCount > 1 && (
            <div className="mt-2 flex shrink-0 justify-center gap-1.5" aria-label={`ランキング ${rankingPage + 1} ページ目`}>
              {Array.from({ length: rankingPageCount }, (_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === rankingPage ? "w-6 bg-blue-500" : "w-1.5 bg-slate-300 dark:bg-slate-700"}`} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
