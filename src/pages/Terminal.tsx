// src/pages/Terminal.tsx

import { useState, useRef } from "react";
import { ChevronDown, FileSpreadsheet, Gamepad2, Hand, Move, QrCode, Settings, WalletCards } from "lucide-react";

import QrMode from "../components/terminal/QrMode";
import OrderCardMode from "../components/terminal/OrderCardMode";
import BrokerCounterMode from "../components/terminal/BrokerCounterMode";
import PortfolioViewerMode from "../components/terminal/PortfolioViewerMode";
import GestureModeA from "../components/terminal/GestureModeA";
import GestureModeB from "../components/terminal/GestureModeB";
import GestureModeC from "../components/terminal/GestureModeC";
import TerminalSettingsModal from "../components/terminal/TerminalSettingsModal";
import TerminalErrorScreen from "../components/terminal/TerminalErrorScreen";
import { useHandTracking } from "../hooks/useHandTracking";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import { STORAGE_KEYS } from "../lib/storageKeys";

export type TerminalMode = "PORTAL" | "QR" | "GESTURE_A" | "GESTURE_B" | "GESTURE_C" | "SHEET" | "BROKER" | "PORTFOLIO";

export default function Terminal() {
  const [currentMode, setCurrentMode] = useState<TerminalMode>("PORTAL");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  const sharedVideoRef = useRef<HTMLVideoElement>(null);

  const isAiActive = currentMode === "GESTURE_A" || currentMode === "GESTURE_B" || currentMode === "GESTURE_C";
  useScreenWakeLock(currentMode !== "PORTAL");
  const { isReady, handResult, error, stream } = useHandTracking(sharedVideoRef, isAiActive, facingMode);

  const [clearTimer, setClearTimer] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VIEW_CLEAR_TIME);
    return saved ? Number(saved) : 30;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showOtherModes, setShowOtherModes] = useState(false);

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEYS.VIEW_CLEAR_TIME, clearTimer.toString());
    setIsSettingsOpen(false);
  };

  const handleReturnPortal = () => setCurrentMode("PORTAL");

  return (
    <div className={`min-h-dvh w-full bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-800 dark:text-white font-sans overflow-hidden relative transition-colors duration-300 ${currentMode === "PORTAL" ? "p-6" : "p-0"}`}>

      <video ref={sharedVideoRef} className={`absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none ${facingMode === "user" ? "-scale-x-100" : ""}`} playsInline muted />

      {error && <TerminalErrorScreen error={error} />}

      {isSettingsOpen && (
        <TerminalSettingsModal
          clearTimer={clearTimer}
          setClearTimer={setClearTimer}
          setIsSettingsOpen={setIsSettingsOpen}
          saveSettings={saveSettings}
        />
      )}

      {currentMode !== "PORTAL" ? (
        <div className="absolute inset-0 z-10 w-full h-full">
          {currentMode === "QR" && <QrMode clearTimer={clearTimer} onReturnPortal={handleReturnPortal} />}
          
          {currentMode === "SHEET" && <OrderCardMode clearTimer={clearTimer} onReturnPortal={handleReturnPortal} />}
          {currentMode === "BROKER" && <BrokerCounterMode onReturnPortal={handleReturnPortal} />}
          {currentMode === "PORTFOLIO" && <PortfolioViewerMode clearTimer={clearTimer} onReturnPortal={handleReturnPortal} />}

          {currentMode === "GESTURE_A" && (
            <GestureModeA
              clearTimer={clearTimer}
              onReturnPortal={handleReturnPortal}
              handResult={handResult}
              isReady={isReady}
              stream={stream}
            />
          )}
          {currentMode === "GESTURE_B" && (
            <GestureModeB
              clearTimer={clearTimer}
              onReturnPortal={handleReturnPortal}
              handResult={handResult}
              isReady={isReady}
              stream={stream}
            />
          )}
          {currentMode === "GESTURE_C" && (
            <GestureModeC
              clearTimer={clearTimer}
              onReturnPortal={handleReturnPortal}
              handResult={handResult}
              isReady={isReady}
              stream={stream}
            />
          )}
        </div>
      ) : (
        <div className="max-w-4xl w-full relative z-10">
          <div className="absolute -top-16 right-0 flex gap-2">
            <button onClick={() => setFacingMode(prev => prev === "user" ? "environment" : "user")} className="bg-white/90 dark:bg-slate-900/80 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-xs font-bold transition">
              📷 カメラ: {facingMode === "user" ? "インカメラ" : "背面カメラ"}
            </button>
            <button onClick={() => setIsSettingsOpen(true)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white transition p-3 bg-white/90 dark:bg-slate-900/80 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm"><Settings size={24} /></button>
          </div>
          <header className="mb-12 text-center">
            <h1 className="text-5xl font-black tracking-tighter italic flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400">
              <Gamepad2 size={40} /> AGENT TERMINAL
            </h1>
            <p className="text-slate-500 font-bold tracking-widest mt-4 uppercase">Reception Terminal</p>
          </header>
          <div className="space-y-4">
            <button onClick={() => setCurrentMode("SHEET")} className="w-full bg-white/95 dark:bg-slate-900/95 border-2 border-blue-500/70 hover:border-blue-500 rounded-lg p-8 text-left transition-all shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 min-h-44">
              <div>
                <h2 className="text-3xl font-black flex items-center gap-3"><FileSpreadsheet className="text-blue-500" size={34} /> Chromebook用 注文カード読み取り</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-3 font-bold">IDと注文カードをカメラで同時に読み取り、自動で注文を確定します。</p>
              </div>
              <span className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20">読み取り開始</span>
            </button>
            <button onClick={() => setCurrentMode("BROKER")} className="w-full bg-white/95 dark:bg-slate-900/95 border-2 border-purple-500/70 hover:border-purple-500 rounded-lg p-8 text-left transition-all shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 min-h-44">
              <div>
                <h2 className="text-3xl font-black flex items-center gap-3"><FileSpreadsheet className="text-purple-500" size={34} /> iPad用 証券窓口</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-3 font-bold">IDを認証後、売買・銘柄・数量を順に入力して注文を確定します。</p>
              </div>
              <span className="inline-flex items-center justify-center rounded-lg bg-purple-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-purple-600/20">受付を開始</span>
            </button>
            <button onClick={() => setCurrentMode("PORTFOLIO")} className="w-full bg-white/95 dark:bg-slate-900/95 border-2 border-indigo-500/70 hover:border-indigo-500 rounded-lg p-8 text-left transition-all shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 min-h-44">
              <div>
                <h2 className="text-3xl font-black flex items-center gap-3"><WalletCards className="text-indigo-500" size={34} /> ポートフォリオビューワー</h2>
                <p className="text-slate-500 dark:text-slate-400 mt-3 font-bold">QRまたはID入力で、保有株・現在価格・評価額・売買の目安を閲覧します。</p>
              </div>
              <span className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20">資産を確認</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOtherModes((prev) => !prev)}
              className="w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-black text-slate-500 shadow-sm transition hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400"
            >
              <span className="flex items-center justify-between">
                その他のモード
                <ChevronDown className={`transition-transform ${showOtherModes ? "rotate-180" : ""}`} size={18} />
              </span>
            </button>

            {showOtherModes && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
                <button onClick={() => setCurrentMode("QR")} className="bg-white/85 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-blue-500 rounded-lg p-5 text-left transition-all shadow-sm flex flex-col gap-3 min-h-32">
                  <h2 className="text-lg font-black flex items-center gap-2"><QrCode className="text-blue-500" /> 標準 (QR) モード</h2>
                  <p className="text-xs font-bold text-slate-500">QRコードを読み取って手動で決済します。</p>
                </button>
                <button onClick={() => setCurrentMode("GESTURE_A")} className="bg-white/85 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 rounded-lg p-5 text-left transition-all shadow-sm flex flex-col gap-3 min-h-32">
                  <h2 className="text-lg font-black flex items-center gap-2"><Hand className="text-emerald-500" /> ジェスチャー A</h2>
                  <p className="text-xs font-bold text-slate-500">空中タッチで操作します。</p>
                </button>
                <button onClick={() => setCurrentMode("GESTURE_B")} className="bg-white/85 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-rose-500 rounded-lg p-5 text-left transition-all shadow-sm flex flex-col gap-3 min-h-32">
                  <h2 className="text-lg font-black flex items-center gap-2"><Hand className="text-rose-500" /> ジェスチャー B</h2>
                  <p className="text-xs font-bold text-slate-500">ハンドサインで操作します。</p>
                </button>
                <button onClick={() => setCurrentMode("GESTURE_C")} className="bg-white/85 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-lg p-5 text-left transition-all shadow-sm flex flex-col gap-3 min-h-32">
                  <h2 className="text-lg font-black flex items-center gap-2"><Move className="text-amber-500" /> ジェスチャー C</h2>
                  <p className="text-xs font-bold text-slate-500">銘柄カードを掴んで注文します。</p>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
