import { X, History } from "lucide-react";
import Badge from "../ui/Badge";
import IconButton from "../ui/IconButton";
import type { Stock, Transaction } from "../../types/domain";
import { absExact, formatExact } from "../../lib/exactNumber";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  stocks: Stock[];
  errorMessage: string | null;
}

export default function HistoryModal({ isOpen, onClose, transactions, stocks, errorMessage }: Props) {
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[85vh] flex flex-col p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
          <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2"><History size={20} className="text-purple-500"/> 取引履歴</h2>
          <IconButton aria-label="取引履歴を閉じる" onClick={onClose} variant="soft" size="sm" className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {errorMessage ? (
            <p className="text-red-500 dark:text-red-400 text-sm text-center py-8 font-bold">{errorMessage}</p>
          ) : transactions.length === 0 ? <p className="text-slate-400 text-sm text-center py-8 font-bold font-mono">NO HISTORY...</p> : (
            transactions.map((tx, idx) => {
              const stockName = stocks.find(s => s.id === tx.stockId)?.name || tx.stockId;
              const isBuy = tx.type === "BUY";
              return (
                <div key={idx} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={isBuy ? "danger" : "info"}>{isBuy ? "BUY" : "SELL"}</Badge>
                      <span className="font-bold text-sm text-slate-800 dark:text-white">{stockName}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono font-bold">{tx.amount} shares @ {tx.price} pt</p>
                  </div>
                  <span className={`text-xl font-mono font-black ${isBuy ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400"}`}>
                    {isBuy ? "-" : "+"}{formatExact(absExact(tx.totalPoint))}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
