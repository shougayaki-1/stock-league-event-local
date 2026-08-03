import { X, Calculator } from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import IconButton from "../ui/IconButton";
import type { User, Stock } from "../../types/domain";
import { addExact, compareExact, formatExact, isPositiveIntegerInput, mulExact, subExact, toExactBigInt, toExactString } from "../../lib/exactNumber";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useTradeQuantityPresets } from "../../hooks/useTradeQuantityPresets";

interface Props {
  user: User;
  isOpen: boolean;
  stock: Stock | null;
  type: "BUY" | "SELL" | null;
  onClose: () => void;
  tradeAmount: number | string;
  setTradeAmount: (val: number | string) => void;
  handleMaxAmount: () => void;
  executeTrade: () => void;
  isLoading: boolean;
  isMarketClosed: boolean;
  isMaxAmount: boolean;
  quotePrice: number | null;
  quoteRemainingMillis: number;
  isQuoteLoading: boolean;
  quoteError: string | null;
}

export default function TradeActionModal({
  user, isOpen, stock, type, onClose, tradeAmount, setTradeAmount, handleMaxAmount, executeTrade, isLoading, isMarketClosed, isMaxAmount,
  quotePrice, quoteRemainingMillis, isQuoteLoading, quoteError
}: Props) {
  useBodyScrollLock(isOpen && Boolean(stock));
  const quantityPresets = useTradeQuantityPresets();

  if (!isOpen || !stock) return null;

  const hasValidQuote = quotePrice !== null && quoteRemainingMillis > 0;
  const displayedPrice = quotePrice ?? stock.currentPrice;
  const isValidAmount = isPositiveIntegerInput(tradeAmount);
  const modalAmount = isValidAmount ? toExactString(tradeAmount) : "0";
  const modalTotalCost = isValidAmount ? mulExact(displayedPrice, modalAmount) : "0";
  const modalResultPoint = type === "BUY" ? subExact(user.points, modalTotalCost) : addExact(user.points, modalTotalCost);
  
  const isOverBuy = type === "BUY" && compareExact(user.points, modalTotalCost) < 0;
  const isOverSell = type === "SELL" && compareExact(user.inventory?.[stock.id] || 0, modalAmount) < 0;
  // MAXはサーバーが確定時の価格・残高で妥当性を判定する。画面側の見積もりで止めない。
  const isTradeDisabled = isMarketClosed || !hasValidQuote || isQuoteLoading || (!isMaxAmount && (!isValidAmount || isOverBuy || isOverSell));
  const adjustAmount = (delta: bigint) => {
    const current = isValidAmount ? toExactBigInt(tradeAmount) : 0n;
    const next = current + delta;
    setTradeAmount((next > 0n ? next : 0n).toString());
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 w-full sm:max-w-md flex flex-col pt-6 px-6 pb-12 sm:pb-8 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-in slide-in-from-bottom-10 sm:zoom-in-95 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <Badge variant={type === "BUY" ? "danger" : "info"} className="mb-1">{type === "BUY" ? "BUY (買い)" : "SELL (売り)"}</Badge>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">{stock.name}</h2>
          </div>
          <IconButton aria-label="取引モーダルを閉じる" onClick={onClose} variant="soft" size="md" className="text-slate-400 hover:text-slate-600"><X size={24}/></IconButton>
        </div>
        <div className="space-y-6 mb-8">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Guaranteed Price</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">
                {hasValidQuote ? `あと ${(quoteRemainingMillis / 1000).toFixed(1)}秒有効` : isQuoteLoading ? "価格を取得中…" : "価格を更新しています"}
              </p>
            </div>
            <p className="text-3xl font-mono font-black text-slate-800 dark:text-white leading-none">{displayedPrice} <span className="text-sm">pt</span></p>
          </div>
          {quoteError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">{quoteError}</p>}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><Calculator size={14}/> 数量を指定</label>
              <Button onClick={handleMaxAmount} variant={isMaxAmount ? "primary" : "soft"} size="xs" className="rounded-md">{type === "BUY" ? "MAX (全額)" : "MAX (全株)"}</Button>
            </div>
            <div className="flex gap-2 items-center w-full">
              <Button onClick={() => adjustAmount(-1n)} variant="soft" className="w-16 h-16 shrink-0 rounded-2xl text-2xl p-0">-</Button>
              {isMaxAmount ? (
                <div className="flex-1 min-w-0 w-full h-16 rounded-2xl border border-blue-200 bg-blue-50 text-center font-black text-2xl leading-[4rem] text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-200">{type === "BUY" ? "全額購入" : "全株売却"}</div>
              ) : (
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={tradeAmount} onChange={(e) => setTradeAmount(e.target.value)} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 w-full h-16 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center font-mono text-4xl font-black outline-none focus:border-blue-500 dark:focus:border-blue-400" disabled={isMarketClosed} />
              )}
              <Button onClick={() => adjustAmount(1n)} variant="soft" className="w-16 h-16 shrink-0 rounded-2xl text-2xl p-0">+</Button>
            </div>
            {isMaxAmount && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-center text-xs font-black text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">{type === "BUY" ? "確定時の株価で、買える最大数を購入します" : "確定時の保有数をすべて売却します"}</p>}
            <div className="grid grid-cols-4 gap-2 mt-3">
              {quantityPresets.map((amount) => (
                <Button key={amount} onClick={() => adjustAmount(BigInt(amount))} variant="soft" className="py-3" disabled={isMarketClosed}>
                  +{amount}株
                </Button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs font-bold text-slate-500">数量ボタンは押すたびに加算されます</p>
          </div>
 
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2 relative">
            {isMaxAmount ? (
              <p className="text-center text-sm font-bold text-slate-600 dark:text-slate-300">約定する株数・代金は、確定後に表示されます。</p>
            ) : <>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">予想代金</span>
              <span className="font-mono text-xl font-black text-slate-500">- {formatExact(modalTotalCost)} pt</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-2">
              <span className="text-xs font-bold text-slate-500">取引後の残高</span>
              <span className={`font-mono text-2xl font-black ${compareExact(modalResultPoint, 0) < 0 ? "text-red-500" : "text-blue-600 dark:text-blue-400"}`}>➡ {formatExact(modalResultPoint)} pt</span>
            </div>
            
            {isOverBuy && <p className="text-red-500 text-xs font-bold mt-2 pt-2 border-t border-red-200 dark:border-red-900/50 text-center">※保有ポイントが不足しています</p>}
            {isOverSell && <p className="text-red-500 text-xs font-bold mt-2 pt-2 border-t border-red-200 dark:border-red-900/50 text-center">※保有株数が不足しています</p>}
            </>}
            {isMarketClosed && <p className="text-amber-500 text-xs font-bold mt-2 pt-2 border-t border-amber-200 dark:border-amber-900/50 text-center">※現在市場は閉まっています</p>}
          </div>
        </div>
        <Button variant={type === "BUY" ? "danger" : "primary"} size="lg" className="w-full py-4 text-xl mb-4" disabled={isTradeDisabled || isLoading} onClick={executeTrade} isLoading={isLoading}>
          {type === "BUY" ? "この内容で買う" : "この内容で売る"}
        </Button>
      </div>
    </div>
  );
}
