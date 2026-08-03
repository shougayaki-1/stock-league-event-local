import { TrendingDown, TrendingUp } from "lucide-react";
import { useStocks } from "../../../hooks/useFirebase";
import Badge from "../../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";

const getChangePercent = (currentPrice: number, basePrice?: number) => {
  if (!basePrice) return 0;
  return ((currentPrice - basePrice) / basePrice) * 100;
};

export default function StockTickerPanel() {
  const stocks = useStocks();

  return (
    <Card className="min-h-0">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-base"><TrendingUp size={18} /> 株価ライブ</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto p-4">
        <div className="space-y-2">
          {stocks.map(stock => {
            const change = getChangePercent(stock.currentPrice, stock.basePrice);
            const isUp = change > 0;
            const isFlat = change === 0;
            return (
              <div key={stock.id} className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-on-surface">{stock.name}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant">{stock.id}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-black text-on-surface">{Math.round(stock.currentPrice).toLocaleString()} pt</p>
                  <Badge variant={isFlat ? "default" : isUp ? "danger" : "info"} className="mt-1">
                    {!isFlat && (isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
                    {isUp ? "+" : ""}{change.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            );
          })}
          {stocks.length === 0 && <p className="py-8 text-center text-sm font-black text-on-surface-variant">銘柄データがありません。</p>}
        </div>
      </CardContent>
    </Card>
  );
}
