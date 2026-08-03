import { TrendingUp, TrendingDown } from "lucide-react";
import Button from "./Button";
import Badge from "./Badge";
import PriceDisplay from "./PriceDisplay";
import StockLineChart from "./StockLineChart";
import type { ChartData, Stock } from "../../types/domain";
import { compareExact, type ExactNumberInput } from "../../lib/exactNumber";

interface Props {
  stock: Stock;
  flashState: "UP" | "DOWN" | undefined;
  onBuy: (stock: Stock) => void;
  onSell: (stock: Stock) => void;
  isMarketClosed: boolean;
  isLoading: boolean;
  inventoryAmount: ExactNumberInput;
  chartData: ChartData[];
}

export default function StockCard({ stock, flashState, onBuy, onSell, isMarketClosed, isLoading, inventoryAmount, chartData }: Props) {
  const flashBg = flashState === "UP" ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 shadow-md shadow-red-500/20"
    : flashState === "DOWN" ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900 shadow-md shadow-blue-500/20"
      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800";

  return (
    <div className={`p-6 rounded-2xl border shadow-sm flex flex-col gap-4 transition-all duration-300 ${flashBg}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{stock.name}</h3>
          <Badge variant="default" className="mt-1.5 font-mono bg-slate-100 dark:bg-slate-800">{stock.id}</Badge>
        </div>
        <div className="text-right">
          {/* PriceDisplay を使用 */}
          <PriceDisplay price={stock.currentPrice} flashState={flashState} className="text-4xl" />
        </div>
      </div>

      <div className="h-16 w-full my-2 bg-slate-50 dark:bg-slate-950 rounded-lg p-1 border border-slate-100 dark:border-slate-800/50 flex items-center justify-center">
        <StockLineChart chartData={chartData} stocks={[stock]} hideTooltip strokeWidth={4} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 text-red-600 border-red-200 dark:text-red-400 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/30 py-3 bg-white/50 dark:bg-transparent"
          onClick={() => onBuy(stock)}
          disabled={isLoading || isMarketClosed}
        >
          <TrendingUp size={16} className="mr-1" /> 買う
        </Button>
        <Button
          variant="outline"
          className="flex-1 text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-900/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 py-3 bg-white/50 dark:bg-transparent"
          onClick={() => onSell(stock)}
          disabled={isLoading || isMarketClosed || compareExact(inventoryAmount, 0) <= 0}
        >
          <TrendingDown size={16} className="mr-1" /> 売る
        </Button>
      </div>
    </div>
  );
}
