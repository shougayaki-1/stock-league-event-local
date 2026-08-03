import { PlayCircle } from "lucide-react";

export default function ScreenMockup({ mode }: { mode: string }) {
  const base = "w-full aspect-video bg-slate-100 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 p-1 flex gap-1 shadow-inner overflow-hidden";
  switch (mode) {
    case "RANKING_BOARD": return (<div className={base}><div className="w-1/2 bg-amber-200 dark:bg-amber-600/50 rounded-sm"></div><div className="w-1/2 bg-white dark:bg-slate-700 rounded-sm"></div></div>);
    case "NEWS_DASHBOARD": return (<div className={base}><div className="w-1/3 bg-blue-100 dark:bg-blue-600/50 rounded-sm"></div><div className="w-2/3 bg-white dark:bg-slate-700 rounded-sm"></div></div>);
    case "DUAL_NEWS_BOARD": return (<div className={base}><div className="w-1/2 border-l-4 border-emerald-500 bg-white dark:bg-slate-800 rounded-sm"></div><div className="w-1/2 border-l-4 border-rose-500 bg-white dark:bg-slate-800 rounded-sm"></div></div>);
    case "STOCK_GRID": return (<div className={`${base} grid grid-cols-3 gap-1`}><div className="bg-white dark:bg-slate-800 rounded-sm"></div><div className="bg-white dark:bg-slate-800 rounded-sm"></div><div className="bg-white dark:bg-slate-800 rounded-sm"></div></div>);
    case "SPLIT_NEWS_STOCK": return (<div className={base}><div className="w-1/2 bg-white dark:bg-slate-800 rounded-sm"></div><div className="flex w-1/2 flex-col gap-1"><div className="h-[55%] rounded-sm bg-blue-100 dark:bg-blue-600/50"></div><div className="flex-1 rounded-sm bg-amber-100 dark:bg-amber-600/50"></div></div></div>);
    case "MARKET_CHART": return (<div className={`${base} items-end justify-center`}><div className="w-full h-1/2 border-t border-blue-500"></div></div>);
    case "TRANSACTION_MONITOR": return (<div className={`${base} bg-black flex-col gap-0.5`}><div className="h-1 bg-green-500/50 w-full"></div><div className="h-1 bg-green-500/50 w-3/4"></div></div>);
    case "CLASSROOM_GRID": return (<div className={`${base} grid grid-cols-4 gap-0.5 bg-slate-950`}><div className="bg-cyan-400/60"></div><div className="bg-white/20"></div><div className="bg-white/20"></div><div className="bg-emerald-400/60"></div></div>);
    case "MC_TRADE_CAST": return (<div className={`${base} bg-zinc-950`}><div className="w-2/3 bg-red-500/50 rounded-sm"></div><div className="w-1/3 bg-white/15 rounded-sm"></div></div>);
    case "AVERAGE_BOARD": return (<div className={`${base} bg-blue-600 items-center justify-center`}><div className="bg-white w-2/3 h-1/3"></div></div>);
    case "HEATMAP_GRID": return (<div className={`${base} grid grid-cols-4 gap-0.5`}><div className="bg-red-500"></div><div className="bg-blue-500"></div><div className="bg-red-500"></div><div className="bg-blue-500"></div></div>);
    case "FULL_MOVIE": return (<div className={`${base} items-center justify-center bg-slate-800! dark:bg-black!`}><PlayCircle size={14} className="text-white/50" /></div>);
    default: return <div className={base}></div>;
  }
}
