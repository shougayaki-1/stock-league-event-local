import { useState, useCallback, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useStocks } from "../../hooks/useFirebase";
import type { User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import { ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ShoppingCart, Hand } from "lucide-react";
import TerminalGestureLayout, { type TerminalStep } from "./TerminalGestureLayout";
import { useHandCursor } from "../../hooks/useHandCursor"; 
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

interface Props { 
  clearTimer: number; 
  onReturnPortal: () => void; 
  stream: MediaStream | null; 
  isReady: boolean; 
  handResult: HandLandmarkerResult | null; 
}

const SWIPE_THRESHOLD_PX = 200;
const SWIPE_RESET_PX = 50;
const GESTURE_SAMPLE_MS = 100;
const RELEASE_GRACE_MS = 150;

export default function GestureModeC({ clearTimer, onReturnPortal, stream, isReady, handResult }: Props) {
  const stocks = useStocks();
  const { executeTerminalTrade } = useWindowActions();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentStep, setCurrentStep] = useState<TerminalStep>("SCAN_ID");

  const [currentStockIndex, setCurrentStockIndex] = useState(0);
  const [cart, setCart] = useState<{ stockId: string; stockName: string; amount: number; type: "BUY" | "SELL" }[]>([]);
  const [tradeError, setTradeError] = useState<string | undefined>(undefined);

  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [swipeLock, setSwipeLock] = useState<boolean>(false);

  const isCursorActive = currentStep === "SWIPE";
  const { isGrabbing, grabStartRef, triggerCooldown } = useHandCursor(handResult, isCursorActive);

  const resetAll = useCallback(() => {
    setSelectedUser(null); setCurrentStep("SCAN_ID"); setCart([]); setCurrentStockIndex(0);
    setCardOffset({ x: 0, y: 0 }); setSwipeLock(false);
    setTradeError(undefined);
  },[]);

  const addToCart = useCallback((type: "BUY" | "SELL") => {
    if (stocks.length === 0) return;
    setCart(prev => {
      const stock = stocks[currentStockIndex];
      const existingIndex = prev.findIndex(c => c.stockId === stock.id && c.type === type);
      if (existingIndex >= 0) {
        const newCart = [...prev];
        newCart[existingIndex] = { ...newCart[existingIndex], amount: newCart[existingIndex].amount + 1 };
        return newCart;
      } else {
        return[...prev, { stockId: stock.id, stockName: stock.name, type, amount: 1 }];
      }
    });
    setCurrentStockIndex(prev => (prev + 1) % stocks.length);
  },[currentStockIndex, stocks]);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0 || !selectedUser) return;
    setCurrentStep("PROCESSING"); 
    try {
      let successCount = 0;
      let failedItem: typeof cart[number] | null = null;
      let lastError = "";
      for (const item of cart) {
        const res = await executeTerminalTrade(selectedUser.uid, item.stockId, item.type, item.amount); 
        if (!res.success) {
          failedItem = item;
          lastError = res.errorMsg || "";
          break;
        }
        successCount++;
      }
      const allSuccess = successCount === cart.length;
      setCurrentStep(allSuccess ? "SUCCESS" : "ERROR");
      if (!allSuccess) {
        const failedName = failedItem?.stockName || "不明な銘柄";
        setTradeError(`${successCount}/${cart.length}件成功。${failedName} で失敗しました。${lastError}`);
      }
      setTimeout(() => { setCart([]); resetAll(); }, allSuccess ? 2000 : 3500);
    } catch (err) { 
      console.error(err); setCurrentStep("ERROR"); setTradeError("システムエラーが発生しました"); setTimeout(() => { setCart([]); resetAll(); }, 3500); 
    } 
  },[cart, selectedUser, executeTerminalTrade, resetAll]);

  const swipeLockRef = useRef(swipeLock);
  useEffect(() => {
    swipeLockRef.current = swipeLock;
  }, [swipeLock]);

  const cardOffsetRef = useRef(cardOffset);
  useEffect(() => {
    cardOffsetRef.current = cardOffset;
  }, [cardOffset]);

  const isGrabbingRef = useRef(isGrabbing);
  useEffect(() => {
    isGrabbingRef.current = isGrabbing;
  }, [isGrabbing]);

  const grabReleaseTimerRef = useRef(0);
  const handResultRef = useRef(handResult);
  useEffect(() => {
    handResultRef.current = handResult;
  }, [handResult]);

  useEffect(() => {
    if (!isCursorActive) return;

    let animationFrameId = 0;
    let lastSampleAt = 0;

    const sampleGesture = (now: number) => {
      if (now - lastSampleAt < GESTURE_SAMPLE_MS) {
        animationFrameId = window.requestAnimationFrame(sampleGesture);
        return;
      }

      const elapsedMs = lastSampleAt === 0 ? GESTURE_SAMPLE_MS : now - lastSampleAt;
      lastSampleAt = now;
      const updateCardOffset = (nextOffset: { x: number; y: number }) => {
        cardOffsetRef.current = nextOffset;
        setCardOffset(nextOffset);
      };

      if (!handResultRef.current || handResultRef.current.landmarks.length === 0) {
        animationFrameId = window.requestAnimationFrame(sampleGesture);
        return;
      }

      const lm = handResultRef.current.landmarks[0]; 
      
      if (swipeLockRef.current) {
        if (!isGrabbingRef.current && Math.abs(cardOffsetRef.current.x) < SWIPE_RESET_PX && Math.abs(cardOffsetRef.current.y) < SWIPE_RESET_PX) { 
          setSwipeLock(false); 
        } else { 
          updateCardOffset({ x: 0, y: 0 }); 
          animationFrameId = window.requestAnimationFrame(sampleGesture);
          return; 
        }
      }

      if (isGrabbingRef.current) {
        grabReleaseTimerRef.current = 0; // 掴んでいる間はタイマーをリセット
        const dx = grabStartRef.current.x - lm[9].x; 
        const dy = grabStartRef.current.y - lm[9].y; 
        updateCardOffset({ x: dx * 1000, y: dy * 1000 }); 
      } else if (cardOffsetRef.current.x !== 0 || cardOffsetRef.current.y !== 0) {
        // 手ブレやChromebookでの誤認識による「一瞬の指開き」を吸収するため、150msの猶予を与える
        grabReleaseTimerRef.current += elapsedMs;
        
        if (grabReleaseTimerRef.current > RELEASE_GRACE_MS) {
          const dx = cardOffsetRef.current.x;
          const dy = cardOffsetRef.current.y;
          if (dx > SWIPE_THRESHOLD_PX && Math.abs(dy) < 250) { addToCart("BUY"); setSwipeLock(true); triggerCooldown(); } 
          else if (dx < -SWIPE_THRESHOLD_PX && Math.abs(dy) < 250) { addToCart("SELL"); setSwipeLock(true); triggerCooldown(); } 
          else if (dy > SWIPE_THRESHOLD_PX && Math.abs(dx) < 250 && stocks.length > 0) { setCurrentStockIndex(p => (p + 1) % stocks.length); setSwipeLock(true); triggerCooldown(); }
          else if (dy < -SWIPE_THRESHOLD_PX && Math.abs(dx) < 250) { handleCheckout(); setSwipeLock(true); triggerCooldown(); }
          updateCardOffset({ x: 0, y: 0 });
        }
      }
      animationFrameId = window.requestAnimationFrame(sampleGesture);
    };

    animationFrameId = window.requestAnimationFrame(sampleGesture);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isCursorActive, addToCart, grabStartRef, handleCheckout, setCurrentStockIndex, triggerCooldown, stocks.length]);

  const cardTransformStyle = {
    "--card-x": `${cardOffset.x}px`,
    "--card-y": `${-cardOffset.y}px`,
    "--card-rotate": `${cardOffset.x * 0.05}deg`,
    transform: "translate(var(--card-x), var(--card-y)) rotate(var(--card-rotate))",
    willChange: "transform",
  } as CSSProperties;

  return (
    <TerminalGestureLayout clearTimer={clearTimer} onReturnPortal={onReturnPortal} stream={stream} isReady={isReady} handResult={handResult} currentStep={currentStep} setCurrentStep={setCurrentStep} selectedUser={selectedUser} setSelectedUser={setSelectedUser} tradeError={tradeError} setTradeError={setTradeError} onResetAll={resetAll} headerTitle="GESTURE TERMINAL (TYPE C)" initialNextStep="SWIPE">
      
      {handResult && currentStep === "SWIPE" && handResult.landmarks.map((landmarks: {x:number, y:number}[], index: number) => (
        <svg key={index} className="absolute inset-0 w-full h-full pointer-events-none -scale-x-100 z-10" viewBox="0 0 1 1">
          {landmarks[8] && <circle cx={landmarks[8].x} cy={landmarks[8].y} r="0.02" fill={isGrabbing ? "#10b981" : "#ef4444"} opacity="0.8" />}
        </svg>
      ))}

      {currentStep === "SWIPE" && (
        <div className="absolute inset-0 flex z-40 pointer-events-none">
          <div className="flex-1 relative flex flex-col items-center justify-center border-r border-slate-800/50">
            
            <div className={`absolute top-24 flex flex-col items-center transition-all duration-300 ${isGrabbing && cardOffset.y > 100 ? 'opacity-100 scale-110' : 'opacity-40'}`}>
              <div className={`p-5 rounded-full shadow-lg ${isGrabbing && cardOffset.y > 100 ? 'bg-slate-700' : 'bg-slate-800/80 border border-slate-700'}`}><ArrowUp size={48} className={`${isGrabbing && cardOffset.y > 100 ? 'text-white' : 'text-slate-400'}`}/></div>
              <span className={`font-black text-2xl mt-3 ${isGrabbing && cardOffset.y > 100 ? 'text-white' : 'text-slate-400'}`}>SKIP</span>
            </div>
            <div className={`absolute bottom-24 flex flex-col items-center transition-all duration-300 ${isGrabbing && cardOffset.y < -100 ? 'opacity-100 scale-110' : 'opacity-40'}`}>
              <div className={`p-5 rounded-full shadow-lg ${isGrabbing && cardOffset.y < -100 ? 'bg-emerald-900' : 'bg-slate-800/80 border border-slate-700'}`}><ArrowDown size={48} className={`${isGrabbing && cardOffset.y < -100 ? 'text-white' : 'text-emerald-500'}`}/></div>
              <span className={`font-black text-2xl mt-3 ${isGrabbing && cardOffset.y < -100 ? 'text-white' : 'text-emerald-500'}`}>CHECKOUT</span>
            </div>
            <div className={`absolute left-20 flex flex-col items-center transition-all duration-300 ${isGrabbing && cardOffset.x < -100 ? 'opacity-100 scale-110' : 'opacity-40'}`}>
              <div className={`p-5 rounded-full shadow-lg ${isGrabbing && cardOffset.x < -100 ? 'bg-blue-900' : 'bg-slate-800/80 border border-slate-700'}`}><ArrowLeft size={64} className={`${isGrabbing && cardOffset.x < -100 ? 'text-white' : 'text-blue-500'}`}/></div>
              <span className={`font-black text-3xl mt-3 ${isGrabbing && cardOffset.x < -100 ? 'text-white' : 'text-blue-500'}`}>SELL</span>
            </div>
            <div className={`absolute right-20 flex flex-col items-center transition-all duration-300 ${isGrabbing && cardOffset.x > 100 ? 'opacity-100 scale-110' : 'opacity-40'}`}>
              <div className={`p-5 rounded-full shadow-lg ${isGrabbing && cardOffset.x > 100 ? 'bg-red-900' : 'bg-slate-800/80 border border-slate-700'}`}><ArrowRight size={64} className={`${isGrabbing && cardOffset.x > 100 ? 'text-white' : 'text-red-500'}`}/></div>
              <span className={`font-black text-3xl mt-3 ${isGrabbing && cardOffset.x > 100 ? 'text-white' : 'text-red-500'}`}>BUY</span>
            </div>

            <div className={`border-4 w-[400px] h-[550px] rounded-[40px] flex flex-col items-center justify-center transition-transform ease-out relative z-10 ${isGrabbing ? 'bg-slate-800/95 border-emerald-500 shadow-xl scale-105 duration-75' : 'bg-slate-900/95 border-slate-700 shadow-xl duration-300'}`} style={cardTransformStyle}>
              {isGrabbing && cardOffset.y > 100 && Math.abs(cardOffset.x) < 100 && <div className="absolute -top-6 text-6xl font-black text-slate-200 border-8 border-slate-300 rounded-2xl px-6 py-2 -rotate-12 bg-slate-900/90 z-20 shadow-lg">SKIP</div>}
              {isGrabbing && cardOffset.y < -100 && Math.abs(cardOffset.x) < 100 && <div className="absolute -bottom-6 text-6xl font-black text-emerald-400 border-8 border-emerald-500 rounded-2xl px-6 py-2 rotate-12 bg-slate-900/90 z-20 shadow-lg">CHECKOUT</div>}
              {isGrabbing && cardOffset.x < -150 && Math.abs(cardOffset.y) < 150 && <div className="absolute -right-8 top-10 text-6xl font-black text-blue-400 border-8 border-blue-500 rounded-2xl px-6 py-2 rotate-12 bg-slate-900/90 z-20 shadow-lg">SELL</div>}
              {isGrabbing && cardOffset.x > 150 && Math.abs(cardOffset.y) < 150 && <div className="absolute -left-8 top-10 text-6xl font-black text-red-400 border-8 border-red-500 rounded-2xl px-6 py-2 -rotate-12 bg-slate-900/90 z-20 shadow-lg">BUY</div>}

              <p className="text-slate-400 font-bold tracking-widest mb-8 drop-shadow-md text-xl">CURRENT STOCK</p>
              <h2 className="text-7xl font-black text-white drop-shadow-lg text-center leading-tight">{stocks[currentStockIndex]?.name || "LOADING..."}<br/><span className="text-4xl text-slate-300">{stocks[currentStockIndex]?.currentPrice} pt</span></h2>
              
              {!isGrabbing && <div className="mt-16 flex flex-col items-center text-slate-300 animate-pulse"><Hand size={64} className="mb-4" /><span className="text-2xl font-bold drop-shadow-md">手を握って掴む</span></div>}
              {isGrabbing && <div className="absolute bottom-12 flex flex-col items-center text-emerald-400"><span className="text-2xl font-bold drop-shadow-md">上下左右に動かして離す</span></div>}
            </div>
          </div>

          <div className="w-[450px] bg-slate-950/95 border-l border-slate-800 flex flex-col shadow-xl z-20">
            <div className="flex justify-between items-end p-8 border-b border-slate-700/50">
              <h3 className="text-xl font-bold text-slate-300 flex items-center gap-2"><ShoppingCart size={24}/> カート</h3>
              <span className="text-sm font-mono text-emerald-400 bg-emerald-900/30 px-3 py-1 rounded-full">{cart.length} items</span>
            </div>
            <div className="flex-1 p-8 overflow-y-auto space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600">
                  <ShoppingCart size={64} className="mb-4 opacity-30" />
                  <p className="font-mono font-bold text-lg">Empty...</p>
                </div>
              ) : (
                cart.map((c, i) => (
                  <div key={i} className={`px-5 py-4 rounded-2xl font-bold flex items-center justify-between shadow-md ${c.type === "BUY" ? "bg-red-900/30 text-red-300 border border-red-500/30" : "bg-blue-900/30 text-blue-300 border border-blue-500/30"}`}>
                    <div className="flex items-center gap-4">
                      <span className="text-sm px-3 py-1 bg-black/40 rounded-lg">{c.type === "BUY" ? "買" : "売"}</span>
                      <span className="text-white text-xl truncate max-w-[180px]">{c.stockName}</span>
                    </div>
                    <span className="font-mono text-xl bg-black/40 px-3 py-1 rounded-lg">{c.amount}株</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </TerminalGestureLayout>
  );
}
