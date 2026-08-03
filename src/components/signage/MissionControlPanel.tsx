import { PlayCircle } from "lucide-react";

type RiddleStep = "STANDBY" | "TIMER" | "OP" | "ED";

interface MissionControlPanelProps {
  riddleStep: string;
  setRiddleStep: (step: RiddleStep) => void;
  opFileUrl: string | null;
  edFileUrl: string | null;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>, type: "OP" | "ED") => void;
  startLocalTimer: (minutes: number) => void;
}

export default function MissionControlPanel({
  setRiddleStep,
  opFileUrl,
  edFileUrl,
  handleFileSelect,
  startLocalTimer
}: MissionControlPanelProps) {
  return (
    <div className="absolute top-0 left-0 w-full p-4 bg-black/95 flex flex-wrap items-center justify-between opacity-75 group-hover:opacity-100 active:opacity-100 transition-opacity duration-300 z-50 border-b border-gray-800 shadow-xl">
      <div className="flex flex-wrap gap-4 items-center">
        <span className="text-purple-500 font-black mr-2 tracking-widest text-sm flex items-center gap-2">
          <PlayCircle size={16} className="animate-pulse" />
          MISSION CONTROL
        </span>
        
        {/* OP Video Controls */}
        <div className="flex items-center gap-3 bg-gray-900 p-2 pl-3 rounded-xl border border-gray-800 shadow-inner">
          <span className="text-xs font-bold text-indigo-400">OP:</span>
          <input 
            type="file" 
            accept="video/*" 
            onChange={(e) => handleFileSelect(e, "OP")} 
            className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:font-bold file:bg-indigo-900 file:text-indigo-200 hover:file:bg-indigo-800 cursor-pointer w-48 sm:w-64 transition-colors" 
          />
          <button 
            onClick={() => setRiddleStep("OP")} 
            disabled={!opFileUrl} 
            className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            再生
          </button>
        </div>

        {/* Timer Controls */}
        <div className="flex items-center gap-2 bg-gray-900 p-2 rounded-xl border border-gray-800 shadow-inner">
          <span className="text-xs font-bold text-gray-400 px-2">TIMER:</span>
          <button onClick={() => startLocalTimer(10)} className="bg-slate-700 hover:bg-slate-600 px-5 py-2 rounded-lg text-sm font-bold transition">10分</button>
          <button onClick={() => startLocalTimer(6)} className="bg-slate-700 hover:bg-slate-600 px-5 py-2 rounded-lg text-sm font-bold transition">6分</button>
        </div>

        {/* ED Video Controls */}
        <div className="flex items-center gap-3 bg-gray-900 p-2 pl-3 rounded-xl border border-gray-800 shadow-inner">
          <span className="text-xs font-bold text-pink-400">ED:</span>
          <input 
            type="file" 
            accept="video/*" 
            onChange={(e) => handleFileSelect(e, "ED")} 
            className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:font-bold file:bg-pink-900 file:text-pink-200 hover:file:bg-pink-800 cursor-pointer w-48 sm:w-64 transition-colors" 
          />
          <button 
            onClick={() => setRiddleStep("ED")} 
            disabled={!edFileUrl} 
            className="bg-pink-600 hover:bg-pink-500 px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            再生
          </button>
        </div>
      </div>
      
      <button onClick={() => setRiddleStep("STANDBY")} className="text-gray-500 hover:text-white underline text-sm px-4 py-2 transition-colors">
        画面をクリア
      </button>
    </div>
  );
}
