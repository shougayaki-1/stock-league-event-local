import { useState } from "react";
import type { User, Stock } from "../../../types/domain";
import { useWindowActions } from "../../../hooks/useWindowActions";
import Button from "../../ui/Button";
import Input from "../../ui/Input";
import { TrendingUp, TrendingDown } from "lucide-react";
import { compareExact, formatExact, mulExact, type ExactNumberInput } from "../../../lib/exactNumber";

interface Props {
  user: User;
  stocks: Stock[];
  onSuccess: () => void;
}

export default function ActionTrade({ user, stocks, onSuccess }: Props) {
  const { executeTrade, isLoading } = useWindowActions();
  // 各銘柄ごとの入力株数を管理するState
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const getAmount = (id: string) => amounts[id] || "1";
  const setAmount = (id: string, val: ExactNumberInput) => setAmounts(prev => ({ ...prev, [id]: String(val || "1") }));

  const handleTrade = async (stockId: string, type: "BUY" | "SELL") => {
    const { success, warningMsg } = await executeTrade(user.uid, stockId, type, getAmount(stockId));
    setNotice(success && warningMsg ? warningMsg : null);
    if (success) {
      setAmounts(prev => ({ ...prev, [stockId]: "1" })); // 入力リセット
      onSuccess();
    }
  };

  return (
    <div className="space-y-3">
      {user.isFinished && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          利益確定済みです。確定時の記録は保持したまま、引き続き取引できます。
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          {notice}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {stocks.map(stock => {
        const owned = user.inventory?.[stock.id] || 0;
        const amount = getAmount(stock.id);
        const totalCost = mulExact(stock.currentPrice, amount);
        
        return (
          <div key={stock.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-black text-lg text-slate-800 dark:text-slate-100">{stock.name}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">
                  現在値: <span className="font-mono text-sm text-slate-800 dark:text-white ml-1">{stock.currentPrice}</span> pt
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">保有数</p>
                <p className={`font-mono font-black text-xl leading-none ${compareExact(owned, 0) > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-slate-600"}`}>{formatExact(owned)}</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex gap-2 mb-2">
                <Input 
                  type="number" 
                  value={amount} 
                  onChange={(e) => setAmount(stock.id, e.target.value)}
                  className="text-center font-mono py-2"
                  min={1}
                />
                <Button 
                  variant="outline" 
                  onClick={() => handleTrade(stock.id, "BUY")} 
                  isLoading={isLoading}
                  disabled={compareExact(user.points, totalCost) < 0}
                  className="w-full bg-red-50 text-red-600 border-red-200 hover:bg-red-100 hover:border-red-300 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <TrendingUp size={16} className="mr-1"/> 買う
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleTrade(stock.id, "SELL")} 
                  isLoading={isLoading}
                  disabled={compareExact(owned, amount) < 0}
                  className="w-full bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-900/50"
                >
                  <TrendingDown size={16} className="mr-1"/> 売る
                </Button>
              </div>
              <div className="flex justify-between text-[10px] font-bold px-1">
                <span className="text-slate-400">予想代金</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">{formatExact(totalCost)} pt</span>
              </div>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
