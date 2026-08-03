import { ScanFace } from "lucide-react";
import type { ReactNode } from "react"; 

interface Props {
  isVisible: boolean;
  scannerElement: ReactNode;
}

export default function GestureScanOverlay({ isVisible, scannerElement }: Props) {
  return (
    <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 z-50 ${isVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
      <div className="bg-slate-800/95 border-4 border-emerald-500/50 p-8 rounded-[40px] flex flex-col items-center shadow-xl">
        <ScanFace size={80} className="text-emerald-400 mb-6 animate-pulse" />
        <h2 className="text-5xl font-black tracking-widest mb-4 text-white">AGENT LOGIN</h2>
        <p className="text-xl text-slate-300 font-bold mb-8">カメラに IDカード をかざしてください</p>
        <div className="w-80 rounded-2xl overflow-hidden shadow-inner bg-transparent border border-slate-600">
          {scannerElement}
        </div>
      </div>
    </div>
  );
}
