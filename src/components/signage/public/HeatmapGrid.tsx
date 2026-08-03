import type { Stock, ChartData } from "../../../types/domain";

export default function HeatmapGrid({ stocks, chartData }: { stocks: Stock[], chartData: ChartData[] }) {
  if (stocks.length === 0) {
    return <div className="flex h-full w-full animate-pulse items-center justify-center bg-slate-100 text-3xl font-black text-slate-500 dark:bg-slate-900 dark:text-white">データを取得中...</div>;
  }

  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
  const currentAvg = stocks.reduce((sum, stock) => sum + stock.currentPrice, 0) / stocks.length;
  const prevAvg = prevData ? stocks.reduce((sum, stock) => sum + (Number(prevData[stock.name]) || stock.currentPrice), 0) / stocks.length : currentAvg;
  const averageDiff = currentAvg - prevAvg;
  const showAverageCard = stocks.length === 5;

  return (
    <div className="flex flex-1 select-none flex-col gap-2 overflow-hidden bg-slate-100 p-2 font-sans transition-colors duration-300 dark:bg-slate-900">
      <div className="flex shrink-0 items-center justify-between rounded-md border border-slate-200 bg-white px-6 py-4 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black text-slate-900 dark:text-white">株価ヒートマップ</span>
          <span className="text-xl font-bold text-slate-400">赤=上昇 / 青=下落</span>
        </div>
        <div className="rounded bg-slate-900 px-6 py-2 text-xl font-black tracking-widest text-white dark:bg-white dark:text-slate-950">
          KAISEI {stocks.length}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {stocks.map((stock) => {
          const prevPrice = prevData ? Number(prevData[stock.name]) || stock.currentPrice : stock.currentPrice;
          const diff = stock.currentPrice - prevPrice;
          
          const isUp = diff >= 0; 
          const bgClass = isUp ? "bg-red-500" : "bg-blue-600";

          return (
            <div key={stock.id} className={`flex flex-col justify-between overflow-hidden rounded-md border border-black/10 p-4 text-white ${bgClass}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="truncate text-2xl font-black leading-tight drop-shadow-md md:text-3xl">{stock.name}</span>
                {diff !== 0 && (
                  <span className="shrink-0 text-2xl font-black drop-shadow-md">
                    {diff > 0 ? "▲" : "▼"}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col justify-end text-right">
                <p className="text-5xl font-black leading-none drop-shadow-md md:text-6xl">{stock.currentPrice.toFixed(1)}</p>
                <p className="mt-2 text-2xl font-black drop-shadow-md md:text-3xl">
                  {diff > 0 ? `+${diff.toFixed(1)}` : diff === 0 ? "0.0" : diff.toFixed(1)}
                </p>
              </div>
            </div>
          );
        })}
        {showAverageCard && (
          <div className={`flex flex-col justify-between overflow-hidden rounded-md border border-black/10 p-4 text-white ${averageDiff >= 0 ? "bg-red-500" : "bg-blue-600"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block truncate text-2xl font-black leading-tight drop-shadow-md md:text-3xl">平均株価</span>
                <span className="mt-1 block text-sm font-black uppercase tracking-widest text-white/70">KAISEI INDEX</span>
              </div>
              {averageDiff !== 0 && (
                <span className="shrink-0 text-2xl font-black drop-shadow-md">
                  {averageDiff > 0 ? "▲" : "▼"}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col justify-end text-right">
              <p className="text-5xl font-black leading-none drop-shadow-md md:text-6xl">{currentAvg.toFixed(1)}</p>
              <p className="mt-2 text-2xl font-black drop-shadow-md md:text-3xl">
                {averageDiff > 0 ? `+${averageDiff.toFixed(1)}` : averageDiff === 0 ? "0.0" : averageDiff.toFixed(1)}
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
