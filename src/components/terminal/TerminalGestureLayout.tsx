import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { User } from "../../types/domain";
import { Loader2, UserCircle2, TimerReset, XSquare, Home } from "lucide-react";
import jsQR from "jsqr";
import TransactionOverlay from "./TransactionOverlay";
import GestureScanOverlay from "./GestureScanOverlay";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { formatExact } from "../../lib/exactNumber";
import { extractShortIdFromQr } from "../../lib/utils";

export type TerminalStep = "SCAN_ID" | "SELECT_STOCK" | "SELECT_AMOUNT" | "CONFIRM_ACTION" | "SWIPE" | "PROCESSING" | "SUCCESS" | "ERROR";

interface Props {
  clearTimer: number;
  onReturnPortal: () => void;
  stream: MediaStream | null;
  isReady: boolean;
  handResult: HandLandmarkerResult | null;
  currentStep: TerminalStep;
  setCurrentStep: (step: TerminalStep) => void;
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;
  tradeError?: string;
  setTradeError?: (err: string | undefined) => void;
  onResetAll: () => void;
  children: React.ReactNode;
  headerTitle: string;
  initialNextStep?: TerminalStep;
}

export default function TerminalGestureLayout({ 
  clearTimer, onReturnPortal, stream, isReady, handResult,
  currentStep, setCurrentStep, selectedUser, setSelectedUser,
  tradeError, onResetAll, children, headerTitle, initialNextStep = "SELECT_STOCK"
}: Props) {

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const qrScanPendingRef = useRef(false);
  const [idleTimeLeft, setIdleTimeLeft] = useState(clearTimer);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [crossProgress, setCrossProgress] = useState(0);
  const crossProgressRef = useRef(0);
  const crossDurationRef = useRef(0);
  const crossFrameRef = useRef(0);
  const pendingCrossProgressRef = useRef<number | null>(null);
  const hasTriggeredCrossResetRef = useRef(false);
  const TARGET_CROSS_DURATION = 800;
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  const resetIdleTimer = useCallback(() => setIdleTimeLeft(clearTimer), [clearTimer]);
  const scheduleCrossProgress = useCallback((nextProgress: number) => {
    const normalizedProgress = Math.max(0, Math.min(nextProgress, 100));
    pendingCrossProgressRef.current = normalizedProgress;
    if (crossFrameRef.current !== 0) return;

    crossFrameRef.current = window.requestAnimationFrame(() => {
      crossFrameRef.current = 0;
      const pendingProgress = pendingCrossProgressRef.current;
      pendingCrossProgressRef.current = null;
      if (pendingProgress === null || pendingProgress === crossProgressRef.current) return;
      crossProgressRef.current = pendingProgress;
      setCrossProgress(pendingProgress);
    });
  }, []);

  useEffect(() => () => {
    if (crossFrameRef.current !== 0) window.cancelAnimationFrame(crossFrameRef.current);
  }, []);

  useEffect(() => {
    if (currentStep !== "SCAN_ID" && currentStep !== "PROCESSING" && currentStep !== "SUCCESS" && currentStep !== "ERROR") {
      idleTimerRef.current = setInterval(() => setIdleTimeLeft(p => { 
        if (p <= 1) { onResetAll(); return clearTimer; } 
        return p - 1; 
      }), 1000);
    } else {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    }
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, [currentStep, onResetAll, clearTimer]);

  useEffect(() => {
    const now = Date.now();
    if (lastTimeRef.current === 0) lastTimeRef.current = now;
    const deltaTime = Math.min(now - lastTimeRef.current, 100);
    lastTimeRef.current = now;

    if (!handResult || handResult.landmarks.length === 0 || currentStep === "SCAN_ID" || currentStep === "PROCESSING" || currentStep === "SUCCESS" || currentStep === "ERROR") {
      crossDurationRef.current = 0; 
      hasTriggeredCrossResetRef.current = false;
      scheduleCrossProgress(0);
      return;
    }

    let isCrossed = false;
    if (handResult.landmarks.length >= 2) { 
      const dist = Math.sqrt(Math.pow(handResult.landmarks[0][0].x - handResult.landmarks[1][0].x, 2) + Math.pow(handResult.landmarks[0][0].y - handResult.landmarks[1][0].y, 2));
      if (dist < 0.2) isCrossed = true; 
    }

    if (isCrossed) {
      crossDurationRef.current += deltaTime; 
      scheduleCrossProgress((crossDurationRef.current / TARGET_CROSS_DURATION) * 100);
      resetIdleTimer();
      if (crossDurationRef.current >= TARGET_CROSS_DURATION && !hasTriggeredCrossResetRef.current) {
        hasTriggeredCrossResetRef.current = true;
        onResetAll();
      }
    } else { 
      crossDurationRef.current = 0; 
      hasTriggeredCrossResetRef.current = false;
      scheduleCrossProgress(0);
    }
  }, [handResult, currentStep, onResetAll, resetIdleTimer, scheduleCrossProgress]);

  const handleScan = useCallback(async (shortId: string) => {
    if (currentStep !== "SCAN_ID") return;
    try {
      const q = query(collection(db, "users"), where("shortId", "==", shortId));
      const snap = await getDocs(q);
      if (!snap.empty) { 
        setSelectedUser(snap.docs[0].data() as User); 
        setCurrentStep(initialNextStep); 
        resetIdleTimer();
      }
    } catch (err) { console.error(err); }
  }, [currentStep, initialNextStep, resetIdleTimer, setCurrentStep, setSelectedUser]);

  const handleScanRef = useRef(handleScan); 
  useEffect(() => { handleScanRef.current = handleScan; }, [handleScan]);

  // The hand tracker already owns the camera stream. Opening Html5Qrcode here
  // would request the rear camera a second time, which leaves the preview black
  // on iPad Safari. Decode frames from the existing video element instead.
  useEffect(() => {
    if (currentStep !== "SCAN_ID") return;
    qrScanPendingRef.current = false;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const scanFrame = () => {
      const video = localVideoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) return;

      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
      const shortId = result?.data ? extractShortIdFromQr(result.data) : null;
      if (shortId && !qrScanPendingRef.current) {
        qrScanPendingRef.current = true;
        void handleScanRef.current(shortId).finally(() => {
          qrScanPendingRef.current = false;
        });
      }
    };

    const intervalId = window.setInterval(scanFrame, 200);
    return () => window.clearInterval(intervalId);
  }, [currentStep]);
  
  const scannerElement = useMemo(() => (
    <div className="flex aspect-square w-full items-center justify-center border-4 border-emerald-400/80 bg-transparent">
      <span className="rounded-full bg-black/65 px-4 py-2 text-xs font-black text-white">QRコードを枠内に合わせてください</span>
    </div>
  ), []);

  const overlayDuration = currentStep === "SUCCESS" ? 2000 : currentStep === "ERROR" ? 3500 : undefined;

  return (
    <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden text-white font-sans select-none z-10">
      
      <video ref={localVideoRef} autoPlay className="absolute inset-0 w-full h-full object-cover opacity-30 -scale-x-100" playsInline muted />
      
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-200 bg-black/80">
          <Loader2 size={64} className="animate-spin text-blue-500 mb-4" />
          <p className="text-2xl font-black tracking-widest animate-pulse">AI VISION INITIALIZING...</p>
        </div>
      )}
      
      <GestureScanOverlay isVisible={currentStep === "SCAN_ID"} scannerElement={scannerElement} />

      {crossProgress > 0 && (
        <div className="absolute inset-0 z-100 bg-slate-900/92 flex flex-col items-center justify-center animate-in fade-in duration-150">
          <XSquare size={80} className="text-rose-400 mb-6" />
          <h2 className="text-4xl font-black text-white tracking-widest uppercase mb-8">LOGGING OUT...</h2>
          <div className="w-64 h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
            <div className="h-full bg-rose-500 transition-all duration-100 ease-linear" style={{ width: `${crossProgress}%` }}></div>
          </div>
        </div>
      )}

      {currentStep === "SCAN_ID" && (
        <button onClick={onReturnPortal} className="absolute top-8 left-8 w-16 h-16 opacity-35 active:opacity-80 hover:opacity-60 transition bg-white/20 rounded-full flex items-center justify-center z-300">
          <div className="w-4 h-4 bg-white rounded-full"></div>
        </button>
      )}

      {selectedUser && currentStep !== "SCAN_ID" && currentStep !== "SWIPE" && (
        <header className="absolute top-12 left-10 right-10 flex justify-between items-start pointer-events-none z-40">
          <div>
            <h1 className="text-xl font-black text-slate-400 tracking-widest uppercase mb-2 drop-shadow-md">{headerTitle}</h1>
            {currentStep === "SELECT_STOCK" && <h2 className="text-5xl font-black text-white drop-shadow-lg">取引する銘柄を選択</h2>}
            {currentStep === "SELECT_AMOUNT" && <h2 className="text-5xl font-black text-emerald-400 drop-shadow-lg">株数を選択</h2>}
            {currentStep === "CONFIRM_ACTION" && <h2 className="text-5xl font-black text-blue-400 drop-shadow-lg">買うか売るか選択</h2>}
            
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-rose-900/50 border border-rose-500/50 rounded-full text-rose-300 font-bold text-sm">
              <XSquare size={16} /> 両手首をクロスしてキャンセル・やり直し
            </div>
          </div>
          <div className="text-right">
            <div className="bg-slate-800/95 p-5 rounded-lg border border-slate-700 mb-3 flex flex-col items-end shadow-lg">
              <div className="flex items-center gap-2 text-emerald-400 mb-1">
                <UserCircle2 size={24} /><span className="font-bold text-xl">{selectedUser.nickname}</span>
              </div>
              <p className="text-sm text-slate-400 font-bold">Asset: <span className="text-3xl text-white font-mono">{formatExact(selectedUser.points)} pt</span></p>
            </div>
            {currentStep !== "PROCESSING" && currentStep !== "SUCCESS" && currentStep !== "ERROR" && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-mono text-sm font-bold ${idleTimeLeft <= 10 ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse' : 'bg-slate-800/90 text-slate-400 border border-slate-700'}`}>
                <TimerReset size={16} /> AUTO LOGOUT: {idleTimeLeft}s
              </div>
            )}
          </div>
        </header>
      )}

      {selectedUser && currentStep === "SELECT_STOCK" && (
        <button onClick={onReturnPortal} className="absolute bottom-10 left-10 p-6 bg-slate-800/95 rounded-full border border-slate-700 hover:text-white transition shadow-lg pointer-events-auto z-50">
          <Home size={32} />
        </button>
      )}

      {children}

      <TransactionOverlay status={currentStep === "PROCESSING" || currentStep === "SUCCESS" || currentStep === "ERROR" ? currentStep : null} errorMsg={tradeError} duration={overlayDuration} />

    </div>
  );
}
