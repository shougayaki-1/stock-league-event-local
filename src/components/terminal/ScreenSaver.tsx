import { Hand, QrCode } from "lucide-react";

export default function ScreenSaver() {
  return (
    <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950 z-[500] flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-700 transition-colors">
      
      {/* 画面のグリッド背景 (ライトモード用) */}
      <div className="absolute inset-0 opacity-20 dark:hidden pointer-events-none">
        <div className="h-full w-full bg-[linear-gradient(rgba(148,163,184,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.3)_1px,transparent_1px)] bg-[length:40px_40px]"></div>
      </div>

      {/* 画面のグリッド背景 (ダークモード用) */}
      <div className="absolute inset-0 opacity-10 hidden dark:block pointer-events-none">
        <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:40px_40px]"></div>
      </div>

      <div className="w-full max-w-4xl px-8 relative z-10 flex flex-col items-center">
        
        {/* メインロゴエリア */}
        <div className="relative mb-12 w-full text-center">
          <div className="absolute inset-0 bg-blue-500 blur-[100px] opacity-10 dark:opacity-20 animate-pulse"></div>
          <h1 className="text-slate-800 dark:text-white text-6xl md:text-[8rem] font-black tracking-[0.1em] italic border-b-8 border-blue-600 pb-8 relative leading-none">
            株価にドキリ！
          </h1>
        </div>

        {/* 引きのある日本語メッセージ */}
        <div className="flex flex-col items-center gap-8 text-center w-full">
          
          <div className="space-y-4">
            <h2 className="text-3xl md:text-5xl font-black text-blue-600 dark:text-blue-400 tracking-widest drop-shadow-sm">
              無人 証券取引端末
            </h2>
            <p className="text-lg md:text-2xl font-bold text-slate-600 dark:text-slate-300">
              情報と直感で、あなたの資産を最大化せよ。
            </p>
          </div>

          {/* 参加方法のアナウンス */}
          <div className="mt-4 bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-800 rounded-[32px] p-8 md:p-10 shadow-lg w-full max-w-2xl">
            <p className="text-2xl font-black text-slate-800 dark:text-white mb-8 animate-pulse">
              🔽 取引を開始するには...
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 text-slate-500 dark:text-slate-400">
               
               <div className="flex flex-col items-center gap-4">
                 <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                   <QrCode size={48} strokeWidth={2} />
                 </div>
                 <span className="font-black text-lg text-slate-700 dark:text-slate-200 leading-tight">
                   QRカードを<br/>かざす
                 </span>
               </div>
               
               <span className="text-xl font-black text-slate-300 dark:text-slate-700 italic">OR</span>
               
               <div className="flex flex-col items-center gap-4">
                 <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400">
                   <Hand size={48} strokeWidth={2} />
                 </div>
                 <span className="font-black text-lg text-slate-700 dark:text-slate-200 leading-tight">
                   カメラの前に<br/>立つ
                 </span>
               </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
