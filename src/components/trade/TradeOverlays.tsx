import { TrendingUp, TrendingDown, Lock, Bell, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

interface TradeOverlaysProps {
  showEmergencyOverlay: boolean;
  showEmergencyResolvedOverlay: boolean;
  emergencyConfig: { type: "UP" | "DOWN"; message: string } | null;
  isMarketClosed: boolean;
  toastNews: { title: string; isInsider: boolean } | null;
  tradeSuccessToast: { type: "BUY" | "SELL"; stockName: string; amountLabel: string } | null;
  tradeSuccessFlash: "BUY" | "SELL" | null;
  isTradeProcessing: boolean;
}

export default function TradeOverlays({
  showEmergencyOverlay,
  showEmergencyResolvedOverlay,
  emergencyConfig,
  isMarketClosed,
  toastNews,
  tradeSuccessToast,
  tradeSuccessFlash,
  isTradeProcessing
}: TradeOverlaysProps) {
  const isUp = emergencyConfig?.type === "UP";

  return (
    <>
      {/* Emergency Overlay */}
      {showEmergencyOverlay && (
        <div className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center text-white p-8 animate-in fade-in duration-300 pointer-events-none text-center ${isUp ? "bg-emerald-600" : "bg-red-600"}`}>
          {isUp ? <TrendingUp size={120} className="mb-8 animate-bounce" /> : <TrendingDown size={120} className="mb-8 animate-bounce" />}
          <h1 className="text-5xl md:text-6xl font-black tracking-widest animate-pulse mb-6 uppercase drop-shadow-xl">
            {isUp ? "株価急騰中！" : "株価暴落中！"}
          </h1>
          <p className="text-xl md:text-2xl font-bold leading-relaxed max-w-lg drop-shadow-md">
            {emergencyConfig?.message || "市場に異常なボラティリティを検知しました"}
          </p>
        </div>
      )}

      {showEmergencyResolvedOverlay && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-emerald-700 text-white p-8 animate-in fade-in duration-300 pointer-events-none text-center">
          <ShieldCheck size={116} className="mb-8 animate-bounce" />
          <h1 className="text-5xl md:text-6xl font-black tracking-widest mb-6 uppercase drop-shadow-xl">
            事態収束
          </h1>
          <p className="text-xl md:text-2xl font-bold leading-relaxed max-w-lg drop-shadow-md">
            緊急事態が解除されました。市場は平常モードへ戻ります。
          </p>
        </div>
      )}

      {/* Market Closed Indicator */}
      {isMarketClosed && (
        <div className="fixed top-20 left-0 w-full z-40 bg-slate-800/95 text-white py-2 flex items-center justify-center gap-2 animate-in slide-in-from-top-4 shadow-lg border-y border-slate-700">
          <Lock size={16} className="text-amber-400" />
          <p className="text-xs font-black tracking-widest uppercase">MARKET IS CURRENTLY CLOSED</p>
        </div>
      )}

      {/* Toast News Notification */}
      {toastNews && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[120] w-[90%] max-w-md animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`p-4 rounded-2xl shadow-xl border-l-4 flex items-center gap-4 ${toastNews.isInsider ? "bg-rose-50 dark:bg-rose-950 text-rose-800 dark:text-rose-100 border-l-rose-500" : "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-100 border-l-emerald-500"}`}>
            <Bell size={24} className="shrink-0 animate-bounce" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">公開ニュースを受信</p>
              <p className="font-bold text-sm leading-tight mt-0.5">{toastNews.title}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Success Toast */}
      {tradeSuccessToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[130] w-[90%] max-w-md animate-in slide-in-from-top-10 fade-in duration-300">
          <div className={`p-4 rounded-2xl shadow-xl border-l-4 flex items-center gap-4 ${
            tradeSuccessToast.type === "BUY"
              ? "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-100 border-l-red-500"
              : "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-100 border-l-blue-500"
          }`}>
            <CheckCircle2 size={24} className="shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{tradeSuccessToast.type === "BUY" ? "買い注文完了" : "売り注文完了"}</p>
              <p className="font-bold text-sm leading-tight mt-0.5">{tradeSuccessToast.stockName} / {tradeSuccessToast.amountLabel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Trade Processing Blocker */}
      {isTradeProcessing && (
        <div className="fixed inset-0 z-[1100] flex flex-col items-center justify-center bg-slate-950/65 text-white animate-in fade-in duration-150">
          <Loader2 size={44} className="mb-4 animate-spin" />
          <p className="text-sm font-black tracking-widest">注文処理中...</p>
        </div>
      )}

      {/* Trade Success Stamp */}
      {tradeSuccessFlash && (
        <div className="fixed inset-0 z-[1200] pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-black/20 animate-in fade-in fade-out duration-1000"></div>
          <div className={`relative z-10 text-5xl md:text-7xl font-black border-8 rounded-3xl p-6 md:p-8 transform shadow-2xl animate-stamp ${
            tradeSuccessFlash === "BUY" ? "text-red-500 border-red-500 bg-red-50/90 dark:bg-red-950/90" : "text-blue-500 border-blue-500 bg-blue-50/90 dark:bg-blue-950/90"
          }`}>
            約定完了
          </div>
        </div>
      )}
    </>
  );
}
