import { AlertTriangle } from "lucide-react";

interface TerminalErrorScreenProps {
  error: string;
}

export default function TerminalErrorScreen({ error }: TerminalErrorScreenProps) {
  return (
    <div className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-500">
      <AlertTriangle size={80} className="text-red-500 mb-6 animate-pulse" />
      <h2 className="text-4xl font-black text-red-500 mb-4 tracking-widest drop-shadow-lg">SYSTEM ERROR</h2>
      <p className="text-xl font-bold text-white bg-red-900/40 p-6 rounded-2xl border-2 border-red-500/50 break-all max-w-2xl shadow-2xl backdrop-blur-sm">
        {error}
      </p>
      <p className="mt-8 text-slate-400 font-bold bg-slate-900/80 px-6 py-3 rounded-full border border-slate-800">
        ブラウザのカメラ使用許可を確認し、ページをリロードしてください。
      </p>
    </div>
  );
}
