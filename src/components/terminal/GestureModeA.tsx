import { useState, useCallback, useEffect, useRef } from "react";
import { useStocks } from "../../hooks/useFirebase";
import type { User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import TerminalGestureLayout, { type TerminalStep } from "./TerminalGestureLayout";
import { useHandCursor } from "../../hooks/useHandCursor"; 
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import VirtualButton from "./VirtualButton";

interface Props { 
  clearTimer: number; 
  onReturnPortal: () => void; 
  stream: MediaStream | null; 
  isReady: boolean; 
  handResult: HandLandmarkerResult | null; 
}

export default function GestureModeA({ clearTimer, onReturnPortal, stream, isReady, handResult }: Props) {
  const stocks = useStocks();
  const { executeTerminalTrade } = useWindowActions();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<TerminalStep>("SCAN_ID");
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [tradeError, setTradeError] = useState<string | undefined>(undefined);

  const isCursorActive = currentStep !== "SCAN_ID" && currentStep !== "PROCESSING" && currentStep !== "SUCCESS" && currentStep !== "ERROR";
  const { 
    cursorPos, hoveredButtonId, hoverProgress, setHoveredButtonId, setHoverProgress, 
    currentHoverRef, hoverDurationRef, targetDuration, triggerCooldown, resetCursor 
  } = useHandCursor(handResult, isCursorActive);

  // エラー回避のため初期値は 0 に設定
  const localLastTimeRef = useRef<number>(0);

  const resetAll = useCallback(() => { 
    setSelectedUser(null); setCurrentStep("SCAN_ID"); setTradeError(undefined);
    resetCursor();
  }, [resetCursor]);
  
  const handleAction = useCallback((buttonId: string) => {
    triggerCooldown(800);
    if (currentStep === "SELECT_STOCK") { 
      setSelectedStockId(buttonId); setCurrentStep("SELECT_AMOUNT"); 
    } else if (currentStep === "SELECT_AMOUNT") { 
      setSelectedAmount(parseInt(buttonId.split("_")[1], 10)); setCurrentStep("CONFIRM_ACTION"); 
    } else if (currentStep === "CONFIRM_ACTION" && selectedUser && selectedStockId && selectedAmount > 0) {
      const action = buttonId as "BUY" | "SELL"; setCurrentStep("PROCESSING");
      executeTerminalTrade(selectedUser.uid, selectedStockId, action, selectedAmount).then((res) => { 
        setCurrentStep(res.success ? "SUCCESS" : "ERROR"); if (!res.success) setTradeError(res.errorMsg);
        setTimeout(() => resetAll(), res.success ? 2000 : 3500); 
      }).catch(() => { 
        setCurrentStep("ERROR"); setTradeError("システムエラーが発生しました"); setTimeout(() => resetAll(), 3500); 
      });
    } else if (currentStep === "CONFIRM_ACTION") {
      setCurrentStep("ERROR");
      setTradeError("注文内容が不足しています。最初からやり直してください。");
      setTimeout(() => resetAll(), 3500);
    }
  }, [currentStep, selectedUser, selectedStockId, selectedAmount, executeTerminalTrade, resetAll, triggerCooldown]);

  const cursorPosRef = useRef(cursorPos);
  useEffect(() => {
    cursorPosRef.current = cursorPos;
  }, [cursorPos]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isCursorActive || cursorPosRef.current.x < 0) return;
      
      const now = Date.now();
      // 初回のみ現在時刻をセット
      if (localLastTimeRef.current === 0) localLastTimeRef.current = now;
      const deltaTime = Math.min(now - localLastTimeRef.current, 100);
      localLastTimeRef.current = now;

      let targetId: string | null = null;
      document.querySelectorAll("[data-btn-id]").forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (cursorPosRef.current.x > rect.left && cursorPosRef.current.x < rect.right && cursorPosRef.current.y > rect.top && cursorPosRef.current.y < rect.bottom) {
          targetId = btn.getAttribute("data-btn-id");
        }
      });

      if (targetId !== currentHoverRef.current) { 
        currentHoverRef.current = targetId; 
        setHoveredButtonId(targetId); 
        setHoverProgress(Math.min(((hoverDurationRef.current[targetId||""] || 0) / targetDuration) * 100, 100)); 
      } 

      if (targetId !== null) {
        const currentDur = (hoverDurationRef.current[targetId] || 0) + deltaTime; 
        hoverDurationRef.current[targetId] = currentDur;
        if (currentDur >= targetDuration) { 
          handleAction(targetId); 
        } else { 
          setHoverProgress((currentDur / targetDuration) * 100); 
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isCursorActive, targetDuration, handleAction, setHoveredButtonId, setHoverProgress, currentHoverRef, hoverDurationRef]);

  return (
    <TerminalGestureLayout clearTimer={clearTimer} onReturnPortal={onReturnPortal} stream={stream} isReady={isReady} handResult={handResult} currentStep={currentStep} setCurrentStep={setCurrentStep} selectedUser={selectedUser} setSelectedUser={setSelectedUser} tradeError={tradeError} setTradeError={setTradeError} onResetAll={resetAll} headerTitle="Holographic Terminal (Type A)">
      
      {currentStep === "SELECT_STOCK" && <div className="absolute inset-0 flex items-center justify-center pt-20 z-40"><div className="grid grid-cols-2 gap-8 w-3/4 max-w-5xl">{stocks.map(s => <VirtualButton onClick={handleAction} key={s.id} id={s.id} label={<><span className="text-xl text-slate-400 block mb-2">{s.currentPrice} pt</span>{s.name}</>} className="h-48" hoveredButtonId={hoveredButtonId} hoverProgress={hoverProgress} />)}</div></div>}
      {currentStep === "SELECT_AMOUNT" && <div className="absolute inset-0 flex items-center justify-center pt-20 z-40"><div className="flex gap-8 w-3/4 max-w-5xl justify-center">{[1, 5, 10, 50].map(amt => <VirtualButton onClick={handleAction} key={amt} id={`AMOUNT_${amt}`} label={`${amt} 株`} className="w-56 h-56" highlightClass="bg-emerald-500/40 border-emerald-500" hoveredButtonId={hoveredButtonId} hoverProgress={hoverProgress} />)}</div></div>}
      {currentStep === "CONFIRM_ACTION" && <div className="absolute inset-0 flex items-center justify-center pt-20 z-40"><div className="flex gap-16 w-3/4 max-w-5xl justify-center"><VirtualButton onClick={handleAction} id="BUY" label={<span className="text-red-500 text-7xl">買 (BUY)</span>} className="w-72 h-72" highlightClass="bg-red-500/40 border-red-500" hoveredButtonId={hoveredButtonId} hoverProgress={hoverProgress} /><VirtualButton onClick={handleAction} id="SELL" label={<span className="text-blue-500 text-7xl">売 (SELL)</span>} className="w-72 h-72" highlightClass="bg-blue-500/40 border-blue-500" hoveredButtonId={hoveredButtonId} hoverProgress={hoverProgress} /></div></div>}

      {isCursorActive && <div className="absolute w-12 h-12 bg-white/80 rounded-full shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-100 transition-all duration-100 ease-out" style={{ left: cursorPos.x, top: cursorPos.y, willChange: "transform" }}><div className="w-4 h-4 bg-emerald-400 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div></div>}
      
    </TerminalGestureLayout>
  );
}
