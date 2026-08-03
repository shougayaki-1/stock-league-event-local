import type { Stock, User } from "../../../types/domain";
import { Medal } from "lucide-react";
import { compareExact, formatExact, toExactBigInt } from "../../../lib/exactNumber";

const rankTone = [
  {
    label: "1",
    Icon: Medal,
    className: "border-amber-400 bg-amber-50 text-amber-600 dark:border-amber-500/70 dark:bg-amber-400/10 dark:text-amber-300",
  },
  {
    label: "2",
    Icon: Medal,
    className: "border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
  },
  {
    label: "3",
    Icon: Medal,
    className: "border-orange-300 bg-orange-50 text-orange-600 dark:border-orange-500/60 dark:bg-orange-400/10 dark:text-orange-300",
  },
];

const getHoldingBreakdown = (user: User, stocks: Stock[]) => {
  const stockNameById = new Map(stocks.map(stock => [stock.id, stock.name]));
  return Object.entries(user.inventory || {})
    .filter(([, amount]) => toExactBigInt(amount) > 0n)
    .sort((a, b) => compareExact(b[1], a[1]))
    .slice(0, 3)
    .map(([stockId, amount]) => `${stockNameById.get(stockId) || stockId} ${formatExact(amount)}株`);
};

export default function RankingBoard({ ranking, stocks }: { ranking: User[]; stocks: Stock[] }) {
  const topUsers = ranking.slice(0, 3);
  const nextUsers = ranking.slice(3, 10);

  return (
    <div className="grid h-full grid-cols-[1.06fr_0.94fr] gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-col gap-3">
        {topUsers.length === 0 && (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-3xl font-black text-slate-400 dark:border-slate-700 dark:bg-slate-900">
            ランキング集計中
          </div>
        )}

        {topUsers.map((user, index) => {
          const tone = rankTone[index];
          const Icon = tone.Icon;
          const holdings = getHoldingBreakdown(user, stocks);

          return (
            <div key={user.uid} className={`flex min-h-0 flex-1 items-center justify-between rounded-lg border-2 px-5 py-4 ${tone.className}`}>
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex size-18 shrink-0 items-center justify-center rounded-md bg-white/80 dark:bg-black/20">
                  <Icon size={42} strokeWidth={1.7} />
                </div>
                <div className="min-w-0">
                  <div className="text-5xl font-black leading-none">{tone.label}</div>
                  <div className="text-lg font-black text-slate-500 dark:text-slate-400">位</div>
                </div>
              </div>

              <div className="min-w-0 flex-1 pl-5 text-right">
                <p className="truncate text-4xl font-black leading-tight text-slate-900 dark:text-white">{user.nickname}</p>
                <p className="mt-2 font-mono text-5xl font-black leading-none text-blue-600 dark:text-blue-300">
                  {formatExact(user.totalAssets ?? user.points)}
                  <span className="ml-2 text-2xl text-slate-400">pt</span>
                </p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {holdings.length > 0 ? holdings.map((holding) => (
                    <span key={holding} className="rounded-md border border-black/10 bg-white/75 px-2 py-1 text-sm font-black text-slate-700 dark:border-white/10 dark:bg-black/20 dark:text-slate-200">
                      {holding}
                    </span>
                  )) : (
                    <span className="rounded-md border border-black/10 bg-white/75 px-2 py-1 text-sm font-black text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-300">
                      現金100%
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
          <span className="text-2xl font-black text-slate-800 dark:text-slate-100">4位以降</span>
          <span className="text-lg font-bold text-slate-400">TOP 10</span>
        </div>

        {nextUsers.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-2xl font-bold text-slate-400">参加者を待機中</div>
        ) : (
          nextUsers.map((user, index) => (
            <div key={user.uid} className="flex min-h-0 flex-1 items-center justify-between gap-3 border-b border-slate-100 px-2 last:border-b-0 dark:border-slate-800">
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-12 shrink-0 text-right font-mono text-3xl font-black text-slate-300 dark:text-slate-600">{index + 4}</span>
                <span className="truncate text-2xl font-black text-slate-800 dark:text-slate-100">{user.nickname}</span>
              </div>
              <span className="shrink-0 font-mono text-3xl font-black text-slate-600 dark:text-slate-300">
                {formatExact(user.totalAssets ?? user.points)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
