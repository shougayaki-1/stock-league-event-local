import { Loader2 } from "lucide-react";

export default function InitializingScreen() {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-800 dark:text-white font-sans transition-colors">
      <div className="text-center space-y-6 animate-in fade-in duration-700">
        <div className="relative">
           <div className="absolute inset-0 bg-blue-500 blur-3xl opacity-10 dark:opacity-20 animate-pulse"></div>
           <h1 className="text-5xl font-black italic tracking-tighter text-blue-600 dark:text-red-600 relative z-10">株価にドキリ！</h1>
        </div>
        <div className="flex items-center justify-center gap-3 text-slate-500 dark:text-slate-400 font-bold tracking-widest text-xs uppercase">
          <Loader2 className="animate-spin" size={16} /> Establishing Secure Connection...
        </div>
      </div>
    </div>
  );
}
