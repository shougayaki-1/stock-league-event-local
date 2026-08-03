import { Activity, CheckCircle2, AlertOctagon } from "lucide-react";

interface Props {
  status: "PROCESSING" | "SUCCESS" | "ERROR" | null | string;
  errorMsg?: string;
  duration?: number;
}

export default function TransactionOverlay({ status, errorMsg, duration }: Props) {
  if (status !== "PROCESSING" && status !== "SUCCESS" && status !== "ERROR") {
    return null;
  }

  return (
    <div className="absolute inset-0 z-[200] bg-slate-900/98 flex flex-col items-center justify-center text-white animate-in zoom-in-95 duration-300 overflow-hidden">
      
      {status === "PROCESSING" && (
        <div className="flex flex-col items-center">
          <Activity size={120} className="text-emerald-500 mb-8 animate-spin" />
          <h2 className="text-5xl font-black tracking-widest uppercase animate-pulse">PROCESSING TRADE...</h2>
        </div>
      )}
      
      {status === "SUCCESS" && (
        <div className="flex flex-col items-center">
          <CheckCircle2 size={160} className="text-emerald-400 mb-6" />
          <h2 className="text-6xl font-black tracking-widest uppercase">TRANSACTION COMPLETE</h2>
        </div>
      )}
      
      {status === "ERROR" && (
        <div className="flex flex-col items-center text-center p-8 w-full">
          <AlertOctagon size={120} className="text-red-500 mb-6" />
          <h2 className="text-5xl font-black tracking-widest uppercase mb-8 text-red-500">TRANSACTION FAILED</h2>
          {errorMsg && (
            <div className="bg-red-950/50 border border-red-500 p-6 rounded-2xl max-w-3xl shadow-2xl w-full">
              <p className="text-3xl font-bold text-white leading-relaxed">{errorMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* <style> を排除し、index.css の .animate-shrink とインラインstyleの組み合わせに変更 */}
      {(status === "SUCCESS" || status === "ERROR") && duration && (
        <div className="absolute bottom-0 left-0 w-full h-4 bg-white/10">
          <div 
            className={`h-full ${status === "SUCCESS" ? "bg-emerald-500" : "bg-red-500"} shadow-[0_0_20px_currentColor] animate-shrink`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
}
