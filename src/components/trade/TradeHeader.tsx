import { QrCode, History } from "lucide-react";
import CountUp from "../ui/CountUp";
import IconButton from "../ui/IconButton";
import type { User } from "../../types/domain";

interface TradeHeaderProps {
  user: User;
  totalAssets: string;
  emergencyConfig: { type: "UP" | "DOWN", message: string } | null;
  myRank: number | string;
  totalAgents: number;
  setIsQrModalOpen: (open: boolean) => void;
  setIsHistoryOpen: (open: boolean) => void;
}

export default function TradeHeader({
  user,
  totalAssets,
  emergencyConfig,
  myRank,
  totalAgents,
  setIsQrModalOpen,
  setIsHistoryOpen
}: TradeHeaderProps) {
  const isUp = emergencyConfig?.type === "UP";

  return (
    // ★ 修正: pt-[calc(1rem+env(safe-area-inset-top))] を追加してノッチを回避
    <header className={`bg-white dark:bg-slate-900 border-b p-4 pt-[calc(1rem+env(safe-area-inset-top))] sticky top-0 z-20 shadow-sm transition-colors duration-300 ${emergencyConfig ? (isUp ? "border-emerald-500" : "border-red-500") : "border-slate-200 dark:border-slate-800"}`}>
      {emergencyConfig && (
        <div className={`absolute top-0 left-0 w-full h-1 animate-pulse ${isUp ? "bg-emerald-500" : "bg-red-500"}`}></div>
      )}
      <div className="flex justify-between items-center max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <IconButton aria-label="QRコードを表示" onClick={() => setIsQrModalOpen(true)} variant="info" className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 shadow-sm">
            <QrCode size={20} />
          </IconButton>
          <IconButton aria-label="取引履歴を表示" onClick={() => setIsHistoryOpen(true)} variant="soft" className="text-slate-500 dark:text-slate-400 hover:text-purple-600">
            <History size={20} />
          </IconButton>
          <div className="ml-1">
            <p className="text-[9px] text-slate-400 font-black leading-none mb-1 uppercase tracking-widest">{user.courseType} AGENT{user.isFinished ? " · 利益確定済" : ""}</p>
            <h1 className="text-base font-black text-slate-800 dark:text-white leading-none truncate max-w-[100px] sm:max-w-none">{user.nickname}</h1>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-1.5 mb-1.5">
            {/* ★ 修正: Target の spanタグを削除しました */}
            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest flex items-center bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 px-1.5 py-0.5 rounded shadow-sm">
              Rank {myRank} / {totalAgents}
            </span>
          </div>
          <p className="mb-1 text-[8px] font-black uppercase tracking-widest text-slate-400">総資産</p>
          <p className="text-2xl md:text-3xl font-mono font-black text-blue-600 dark:text-blue-400 leading-none flex items-baseline gap-1">
            <CountUp value={totalAssets} /> <span className="text-xs text-slate-400 mb-0.5 md:mb-1">pt</span>
          </p>
        </div>
      </div>
    </header>
  );
}
