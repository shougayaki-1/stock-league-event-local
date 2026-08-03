// src/components/signage/riddle/SignageStandby.tsx

import { MonitorPlay } from "lucide-react";

export default function SignageStandby() {
  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 animate-in fade-in">
      <MonitorPlay size={100} className="text-purple-500/30 mb-10" strokeWidth={1} />
      <p className="text-4xl md:text-5xl font-black text-purple-600 dark:text-purple-400 tracking-[0.2em] text-center uppercase">株価にドキリ！謎解き</p>
      <p className="text-2xl font-bold text-slate-400 dark:text-slate-500/50 tracking-widest mt-12 text-center">指示があるまでお待ちください</p>
    </div>
  );
}