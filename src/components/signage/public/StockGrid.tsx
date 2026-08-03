import type { Stock, ChartData } from "../../../types/domain";
import { LayoutGrid } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

const COLORS = ["#dc2626", "#2563eb", "#059669", "#ca8a04", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];

export default function StockGrid({ stocks, chartData, flashState }: { stocks: Stock[], chartData: ChartData[], flashState: Record<string, "UP" | "DOWN"> }) {
  if (stocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-3xl font-black text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        銘柄データを取得中
      </div>
    );
  }

  const currentAvg = stocks.reduce((sum, stock) => sum + stock.currentPrice, 0) / stocks.length;
  const previousPoint = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
  const previousAvg = previousPoint
    ? stocks.reduce((sum, stock) => sum + (Number(previousPoint[stock.name]) || stock.currentPrice), 0) / stocks.length
    : currentAvg;
  const averageDiff = currentAvg - previousAvg;
  const showAverageCard = stocks.length === 5;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mb-5 flex shrink-0 items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <LayoutGrid size={34} className="text-blue-600 dark:text-blue-300" />
          <h2 className="text-4xl font-black text-slate-900 dark:text-white">全銘柄ボード</h2>
        </div>
        <span className="rounded-md bg-slate-200 px-4 py-2 text-2xl font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{stocks.length}銘柄</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 md:grid-cols-3">
        {stocks.map((stock, i) => {
          const flash = flashState[stock.id];
          const previousPoint = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
          const previousPrice = previousPoint ? Number(previousPoint[stock.name]) || stock.currentPrice : stock.currentPrice;
          const diff = stock.currentPrice - previousPrice;
          const bgClass = flash === "UP" ? "bg-red-50 dark:bg-red-950/40 border-red-400 dark:border-red-500" :
                          flash === "DOWN" ? "bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-500" :
                          "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800";
          const textClass = flash === "UP" ? "text-red-500" : flash === "DOWN" ? "text-blue-500" : "text-slate-950 dark:text-white";
          const diffClass = diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-slate-400";

          return (
            <div key={stock.id} className={`relative flex min-h-0 flex-col justify-between overflow-hidden rounded-lg border p-6 transition-colors duration-300 ${bgClass}`}>
              <div className="relative z-10 min-w-0">
                <p className="break-words text-4xl font-black leading-tight text-slate-900 dark:text-white">{stock.name}</p>
              </div>

              <div className="relative z-10 flex items-end justify-between gap-4">
                <p className={`font-mono text-8xl font-black leading-none transition-colors duration-300 ${textClass}`}>{stock.currentPrice}</p>
                <p className={`mb-2 font-mono text-4xl font-black leading-none ${diffClass}`}>
                  {diff > 0 ? `+${diff}` : diff}
                </p>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-30">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <YAxis domain={['auto', 'auto']} hide />
                    <Line type="monotone" dataKey={stock.name} stroke={COLORS[i % COLORS.length]} strokeWidth={7} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
        {showAverageCard && (
          <div className="relative flex min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
            <div className="relative z-10 min-w-0">
              <p className="text-2xl font-black leading-tight text-slate-400">KAISEI INDEX</p>
              <p className="mt-2 break-words text-4xl font-black leading-tight text-slate-900 dark:text-white">平均株価</p>
            </div>

            <div className="relative z-10 flex items-end justify-between gap-4">
              <p className="font-mono text-8xl font-black leading-none text-slate-950 dark:text-white">{currentAvg.toFixed(1)}</p>
              <p className={`mb-2 font-mono text-4xl font-black leading-none ${averageDiff > 0 ? "text-red-500" : averageDiff < 0 ? "text-blue-500" : "text-slate-400"}`}>
                {averageDiff > 0 ? `+${averageDiff.toFixed(1)}` : averageDiff.toFixed(1)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
