import { Activity } from "lucide-react";
import { useMemo } from "react";
import { absExact, formatExact } from "../../../lib/exactNumber";
import { formatRelativeTime } from "../../../lib/time";
import { useRecentTransactions } from "../../../hooks/useRecentTransactions";
import { useStocks } from "../../../hooks/useFirebase";
import Badge from "../../ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/Card";

export default function TradeFeedPanel() {
  const { transactions, errorMessage } = useRecentTransactions(20);
  const stocks = useStocks();
  const stockMap = useMemo(() => new Map(stocks.map(stock => [stock.id, stock])), [stocks]);

  return (
    <Card className="min-h-0">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-base"><Activity size={18} /> 直近取引</CardTitle>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto p-4">
        {errorMessage ? (
          <p className="rounded-lg border border-error/30 bg-error-container p-3 text-xs font-bold text-error">{errorMessage}</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const isBuy = tx.type === "BUY";
              const stockName = stockMap.get(tx.stockId)?.name || tx.stockId;
              return (
                <div key={tx.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                  <Badge variant={isBuy ? "danger" : "info"} className="justify-center">{isBuy ? "買" : "売"}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-on-surface">{stockName}</p>
                    <p className="text-[10px] font-bold text-on-surface-variant">{tx.timestamp ? formatRelativeTime(tx.timestamp.toDate()) : "処理中"} / {formatExact(tx.amount)}株</p>
                  </div>
                  <p className={`shrink-0 text-right font-mono text-sm font-black ${isBuy ? "text-error" : "text-primary"}`}>
                    {isBuy ? "-" : "+"}{formatExact(absExact(tx.totalPoint))}
                  </p>
                </div>
              );
            })}
            {transactions.length === 0 && <p className="py-8 text-center text-sm font-black text-on-surface-variant">取引を待機中です。</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
