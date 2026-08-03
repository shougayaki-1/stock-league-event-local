import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useStocks } from "../../hooks/useFirebase";
import type { User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import { UserCircle2, ThumbsUp, ThumbsDown, Hand, Hash } from "lucide-react";
import TerminalGestureLayout, { type TerminalStep } from "./TerminalGestureLayout";
import { useHandCursor } from "../../hooks/useHandCursor"; 
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision"; 
import VirtualButton from "./VirtualButton";
import { formatExact } from "../../lib/exactNumber";

interface Props { 
  clearTimer: number; 
  onReturnPortal: () => void; 
  stream: MediaStream | null; 
  isReady: boolean; 
  handResult: HandLandmarkerResult | null; 
}

export default function GestureModeB({ clearTimer, onReturnPortal, stream, isReady, handResult }: Props) {
  const stocks = useStocks();
  const { executeTerminalTrade } = useWindowActions();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<TerminalStep>("SCAN_ID");
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [tradeError, setTradeError] = useState<string | undefined>(undefined);

  const [displayGesture, setDisplayGesture] = useState<string>("NONE");

  const lastGestureRef = useRef<string>("NONE");
  const gestureDurationRef = useRef<Record<string, number>>({});

  const isCursorActive = currentStep !== "SCAN_ID" && currentStep !== "PROCESSING" && currentStep !== "SUCCESS" && currentStep !== "ERROR";
  const { 
    cursorPos, hoveredButtonId, hoverProgress, setHoveredButtonId, setHoverProgress, 
    currentHoverRef, hoverDurationRef, targetDuration, triggerCooldown, resetCursor
  } = useHandCursor(handResult, isCursorActive);

  // エラー回避のため初期値は 0 に設定
  const localLastTimeRef = useRef<number>(0);

  const resetAll = useCallback(() => {
    setSelectedUser(null); setCurrentStep("SCAN_ID");
    resetCursor(); gestureDurationRef.current = {};
    lastGestureRef.current = "NONE"; setDisplayGesture("NONE");
    setTradeError(undefined);
  }, [resetCursor]);

  const handleAction = useCallback((actionId: string) => {
    triggerCooldown(800);
    if (actionId === "CANCEL") { resetAll(); return; }
    if (currentStep === "SELECT_STOCK" && stocks.find(s => s.id === actionId)) {
      setSelectedStockId(actionId); 
      gestureDurationRef.current = {}; lastGestureRef.current = "NONE"; setDisplayGesture("NONE");
      setCurrentStep("SELECT_AMOUNT");
    } else if (currentStep === "SELECT_AMOUNT" && actionId.startsWith("AMOUNT_")) {
      setSelectedAmount(parseInt(actionId.split("_")[1], 10)); 
      gestureDurationRef.current = {}; lastGestureRef.current = "NONE"; setDisplayGesture("NONE");
      setCurrentStep("CONFIRM_ACTION");
    } else if (currentStep === "CONFIRM_ACTION" && selectedUser && selectedStockId && selectedAmount > 0 && (actionId === "BUY" || actionId === "SELL")) {
      const action = actionId as "BUY" | "SELL";
      gestureDurationRef.current = {}; lastGestureRef.current = "NONE"; setDisplayGesture("NONE");
      setCurrentStep("PROCESSING");
      executeTerminalTrade(selectedUser.uid, selectedStockId, action, selectedAmount).then((res) => { 
        setCurrentStep(res.success ? "SUCCESS" : "ERROR"); if (!res.success) setTradeError(res.errorMsg);
        setTimeout(() => resetAll(), res.success ? 2000 : 3500); 
      }).catch(() => { 
        setCurrentStep("ERROR"); setTradeError("システムエラーが発生しました"); setTimeout(() => resetAll(), 3500); 
      });
    } else if (currentStep === "CONFIRM_ACTION" && (actionId === "BUY" || actionId === "SELL")) {
      setCurrentStep("ERROR");
      setTradeError("注文内容が不足しています。最初からやり直してください。");
      setTimeout(() => resetAll(), 3500);
    }
  },[currentStep, stocks, selectedUser, selectedStockId, selectedAmount, executeTerminalTrade, resetAll, triggerCooldown]);

  const cursorPosRef = useRef(cursorPos);
  useEffect(() => {
    cursorPosRef.current = cursorPos;
  }, [cursorPos]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCursorActive || !handResult || handResult.landmarks.length === 0) return;
      
      const now = Date.now();
      // 初回のみ現在時刻をセット
      if (localLastTimeRef.current === 0) localLastTimeRef.current = now;
      const deltaTime = Math.min(now - localLastTimeRef.current, 100);
      localLastTimeRef.current = now;

      // STEP1: ポインターで銘柄選択
      if (currentStep === "SELECT_STOCK") {
        let targetId: string | null = null;
        document.querySelectorAll("[data-btn-id]").forEach((btn) => {
          const rect = btn.getBoundingClientRect();
          if (cursorPosRef.current.x > rect.left && cursorPosRef.current.x < rect.right && cursorPosRef.current.y > rect.top && cursorPosRef.current.y < rect.bottom) targetId = btn.getAttribute("data-btn-id");
        });
        if (targetId !== currentHoverRef.current) { 
          currentHoverRef.current = targetId; setHoveredButtonId(targetId); 
          setHoverProgress(Math.min(((hoverDurationRef.current[targetId||""] || 0) / targetDuration) * 100, 100)); 
        } 
        if (targetId !== null) {
          const currentDur = (hoverDurationRef.current[targetId] || 0) + deltaTime; 
          hoverDurationRef.current[targetId] = currentDur;
          if (currentDur >= targetDuration) { handleAction(targetId); } else { setHoverProgress((currentDur / targetDuration) * 100); }
        }
        return; 
      }

      // STEP2以降: ハンドジェスチャー判定
      const lm = handResult.landmarks[0];
      const palmSize = Math.sqrt(Math.pow(lm[9].x - lm[0].x, 2) + Math.pow(lm[9].y - lm[0].y, 2));
      const t = palmSize * 0.2; 
      const iOp = (lm[5].y - lm[8].y) > t; const mOp = (lm[9].y - lm[12].y) > t; const rOp = (lm[13].y - lm[16].y) > t; const pOp = (lm[17].y - lm[20].y) > t;
      const thUp = lm[4].y < lm[5].y && lm[4].y < lm[17].y; const thDn = lm[4].y > lm[5].y && lm[4].y > lm[17].y;
      const allOp = iOp && mOp && rOp && pOp; const allCl = !iOp && !mOp && !rOp && !pOp;

      let detected = "NONE";
      if (allOp) detected = "CANCEL";
      else if (currentStep === "CONFIRM_ACTION" && thUp && allCl) detected = "BUY";
      else if (currentStep === "CONFIRM_ACTION" && thDn && allCl) detected = "SELL";
      else if (currentStep === "SELECT_AMOUNT") { let c = 0; if (iOp) c++; if (mOp) c++; if (rOp) c++; if (pOp) c++; if (c > 0 && c < 5) detected = `AMOUNT_${c}`; }

      if (detected === "NONE") { 
        if (lastGestureRef.current !== "NONE") { lastGestureRef.current = "NONE"; setDisplayGesture("NONE"); setHoverProgress(0); } 
        return; 
      }

      if (detected !== lastGestureRef.current) { lastGestureRef.current = detected; setDisplayGesture(detected); }
      const currentDur = (gestureDurationRef.current[detected] || 0) + deltaTime; 
      gestureDurationRef.current[detected] = currentDur;
      
      if (currentDur >= targetDuration) { handleAction(detected); } else { setHoverProgress((currentDur / targetDuration) * 100); }
    }, 100);
    return () => clearInterval(interval);
  }, [isCursorActive, handResult, currentStep, handleAction, setHoveredButtonId, setHoverProgress, currentHoverRef, hoverDurationRef, targetDuration]);

  const gestureIcon = useMemo(() => {
    switch (displayGesture) {
      case "BUY": return <div className="text-center text-red-500"><ThumbsUp size={160} className="mx-auto mb-6"/> <h2 className="text-6xl font-black">BUY</h2></div>;
      case "SELL": return <div className="text-center text-blue-500"><ThumbsDown size={160} className="mx-auto mb-6"/> <h2 className="text-6xl font-black">SELL</h2></div>;
      case "CANCEL": return <div className="text-center text-slate-300"><Hand size={160} className="mx-auto mb-6"/> <h2 className="text-6xl font-black">CANCEL</h2></div>;
      case "NONE": return <div className="text-center text-slate-600"><Hand size={120} className="mx-auto mb-6 opacity-30"/> <h2 className="text-3xl font-black tracking-widest">NO SIGNAL</h2></div>;
      default: if (displayGesture.startsWith("AMOUNT_")) return <div className="text-center text-emerald-400"><Hash size={160} className="mx-auto mb-6"/> <h2 className="text-7xl font-black font-mono">{displayGesture.split("_")[1]} <span className="text-3xl">株</span></h2></div>;
    }
  }, [displayGesture]);

  return (
    <TerminalGestureLayout clearTimer={clearTimer} onReturnPortal={onReturnPortal} stream={stream} isReady={isReady} handResult={handResult} currentStep={currentStep} setCurrentStep={setCurrentStep} selectedUser={selectedUser} setSelectedUser={setSelectedUser} tradeError={tradeError} setTradeError={setTradeError} onResetAll={resetAll} headerTitle="GESTURE TERMINAL (TYPE B)">
      
      {currentStep === "SELECT_STOCK" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-10 z-40">
          <h2 className="text-4xl font-black text-white mb-12 bg-black/80 px-10 py-4 rounded-full shadow-lg border border-white/10">STEP 1. 取引する銘柄に指を合わせてください</h2>
          <div className="grid grid-cols-2 gap-10 w-3/4 max-w-5xl">
            {stocks.map(s => <VirtualButton key={s.id} id={s.id} label={<><span className="text-xl text-slate-400 block mb-2">{s.currentPrice} pt</span>{s.name}</>} className="h-48 bg-slate-900/90" hoveredButtonId={hoveredButtonId} hoverProgress={hoverProgress} />)}
          </div>
        </div>
      )}

      {isCursorActive && currentStep === "SELECT_STOCK" && <div className="absolute w-12 h-12 bg-white/80 rounded-full shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-100 transition-all duration-100 ease-out" style={{ left: cursorPos.x, top: cursorPos.y, willChange: "transform" }}><div className="w-4 h-4 bg-emerald-400 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div></div>}

      {(currentStep === "SELECT_AMOUNT" || currentStep === "CONFIRM_ACTION") && (
        <div className="absolute right-0 top-0 w-1/2 h-full bg-slate-950/98 p-10 flex flex-col border-l border-slate-800 z-40 pointer-events-none">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-2xl font-black text-slate-500 tracking-widest mb-2">GESTURE TERMINAL (TYPE B)</h1>
              {selectedUser && <div className="flex items-center gap-3 text-emerald-400 mt-2 bg-slate-900 p-3 rounded-xl border border-slate-800"><UserCircle2 size={24} /> <span className="font-bold text-xl">{selectedUser.nickname}</span><span className="text-white ml-2 font-mono text-xl">({formatExact(selectedUser.points)} pt)</span></div>}
            </div>
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-900 rounded-[40px] border border-slate-800 relative overflow-hidden shadow-inner">
            {currentStep === "SELECT_AMOUNT" && <div className="text-center w-full mt-8"><h2 className="text-4xl font-black mb-3 text-white">STEP 2. 株数を指定</h2><p className="text-slate-400 font-bold text-lg mb-6">カメラに向かって指を立ててください（1〜4本）</p></div>}
            {currentStep === "CONFIRM_ACTION" && <div className="text-center w-full mt-8"><h2 className="text-4xl font-black mb-3 text-white">STEP 3. 売買の確定</h2><p className="text-emerald-400 font-bold text-xl mb-6">{stocks.find(s=>s.id === selectedStockId)?.name} を <span className="font-mono text-3xl font-black">{selectedAmount}</span> 株...</p></div>}
            
            <div className={`flex-1 flex items-center justify-center transition-all duration-300 transform w-full ${displayGesture !== "NONE" ? "scale-110" : "scale-100 opacity-50"}`}>{gestureIcon}</div>
            
            <div className="mb-10 text-center">
              {currentStep === "CONFIRM_ACTION" && <p className="text-slate-500 font-bold text-lg bg-black/50 px-6 py-3 rounded-full border border-slate-800">👍 買う / 👎 売る / 🖐️ キャンセル</p>}
              {currentStep === "SELECT_AMOUNT" && <p className="text-slate-500 font-bold text-lg bg-black/50 px-6 py-3 rounded-full border border-slate-800">🖐️ キャンセル</p>}
            </div>

            {displayGesture !== "NONE" && <div className="absolute bottom-0 left-0 w-full h-6 bg-slate-800"><div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${hoverProgress}%` }}></div></div>}
          </div>
        </div>
      )}

      {handResult && (currentStep === "SELECT_AMOUNT" || currentStep === "CONFIRM_ACTION") && handResult.landmarks.map((landmarks: {x:number, y:number}[], index: number) => (
        <svg key={index} className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100 z-10" viewBox="0 0 1 1">
          {landmarks[8] && <circle cx={landmarks[8].x} cy={landmarks[8].y} r="0.01" fill="#3b82f6" opacity="0.8" />}
        </svg>
      ))}

    </TerminalGestureLayout>
  );
}
