import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { AlertTriangle, CheckCircle, Home, Loader2, RefreshCw, ScanLine, TrendingDown, TrendingUp, UserRound } from "lucide-react";
import jsQR from "jsqr";
import { db } from "../../lib/firebase";
import { useStocks, useTransactions } from "../../hooks/useFirebase";
import type { Stock, Transaction, User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import Button from "../ui/Button";
import { addExact, divFloorExact, formatExact, isPositiveExact, mulExact, toExactString } from "../../lib/exactNumber";
import { extractShortIdFromQr } from "../../lib/utils";
import { formatOrderAmount, lookupUserByShortId, parseOrderAmount, type OrderAmount } from "../../lib/terminalUtils";

type OrderType = "BUY" | "SELL";
type TradeStatus = "IDLE" | "BUILDING" | "PENDING" | "PROCESSING" | "SUCCESS" | "ERROR";

const QR_DEDUPE_MS = 1200;
const QR_DEDUPE_RETENTION_MS = 60000;
const DETECTION_INTERVAL_MS = 220;
const CONFIRM_COUNTDOWN_SECONDS = 3;
const SUCCESS_RESET_MS = 2000;
const ERROR_RESET_MS = 8000;

const isOrderQrPayload = (text: string) =>
  text === "CANCEL" ||
  text.startsWith("TRADE:") ||
  text.startsWith("ORDER:") ||
  text.startsWith("STOCK:") ||
  text.startsWith("AMOUNT:") ||
  text.startsWith("ACTION:");

interface Props {
  clearTimer: number;
  onReturnPortal: () => void;
}

interface DetectedQr {
  rawValue: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{
    rawValue?: string;
    boundingBox?: DOMRectReadOnly;
  }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export default function OrderCardMode({ clearTimer, onReturnPortal }: Props) {
  const stocks = useStocks();
  const { executeTerminalTrade, isLoading: isTrading } = useWindowActions();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastProcessedRef = useRef<Record<string, number>>({});
  const pendingOrderScans = useRef<string[]>([]);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const transactions = useTransactions(selectedUser?.uid ?? null);
  const [manualShortId, setManualShortId] = useState("");
  const [logoutCountdown, setLogoutCountdown] = useState(clearTimer);
  const [orderStockId, setOrderStockId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState<OrderAmount | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>("IDLE");
  const [tradeCountdown, setTradeCountdown] = useState(3);
  const [tradeError, setTradeError] = useState<string | undefined>(undefined);
  const [tradeWarning, setTradeWarning] = useState<string | undefined>(undefined);
  const [detectedQrs, setDetectedQrs] = useState<DetectedQr[]>([]);
  const [videoSize, setVideoSize] = useState({ width: 1, height: 1 });
  const [lastScanText, setLastScanText] = useState<string>("カメラ起動中...");
  const orderStockIdRef = useRef<string | null>(null);
  const orderAmountRef = useRef<OrderAmount | null>(null);
  const orderTypeRef = useRef<OrderType | null>(null);
  const selectedUserRef = useRef<User | null>(null);
  const tradeStatusRef = useRef<TradeStatus>("IDLE");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => { orderStockIdRef.current = orderStockId; }, [orderStockId]);
  useEffect(() => { orderAmountRef.current = orderAmount; }, [orderAmount]);
  useEffect(() => { orderTypeRef.current = orderType; }, [orderType]);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { tradeStatusRef.current = tradeStatus; }, [tradeStatus]);

  const resetOrder = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setOrderStockId(null);
    setOrderAmount(null);
    setOrderType(null);
    orderStockIdRef.current = null;
    orderAmountRef.current = null;
    orderTypeRef.current = null;
    setTradeError(undefined);
    setTradeWarning(undefined);
    setTradeStatus("IDLE");
    tradeStatusRef.current = "IDLE";
    setTradeCountdown(CONFIRM_COUNTDOWN_SECONDS);
    setLogoutCountdown(clearTimer);
  }, [clearTimer]);

  const resetAll = useCallback(() => {
    setSelectedUser(null);
    selectedUserRef.current = null;
    resetOrder();
  }, [resetOrder]);

  const applyOrderPayload = useCallback((text: string) => {
    if (text === "CANCEL") {
      resetOrder();
      setLastScanText("注文をリセットしました");
      return;
    }

    let nextStockId = orderStockIdRef.current;
    let nextAmount = orderAmountRef.current;
    let nextType = orderTypeRef.current;
    let changed = false;

    if (text.startsWith("TRADE:")) {
      const [, stockId, type, amountText] = text.split(":");
      const amount = parseOrderAmount(amountText ?? "");
      if (stocks.some((stock) => stock.id === stockId)) { nextStockId = stockId; changed = true; }
      if (type === "BUY" || type === "SELL") { nextType = type; changed = true; }
      if (amount !== null) { nextAmount = amount; changed = true; }
    } else {
      const commands = text.replace(/^ORDER:/, "").split(",");
      commands.forEach((command) => {
        const [rawKey, rawValue] = command.split(":");
        const key = rawKey?.trim();
        const value = rawValue?.trim();
        if (!key || !value) return;

        if (key === "STOCK" && stocks.some((stock) => stock.id === value)) {
          nextStockId = value;
          changed = true;
        }
        if (key === "ACTION" && (value === "BUY" || value === "SELL")) {
          nextType = value;
          changed = true;
        }
        if (key === "AMOUNT") {
          const amount = parseOrderAmount(value);
          if (amount !== null) {
            nextAmount = amount;
            changed = true;
          }
        }
      });
    }

    if (!changed) return;

    setOrderStockId(nextStockId);
    setOrderAmount(nextAmount);
    setOrderType(nextType);
    orderStockIdRef.current = nextStockId;
    orderAmountRef.current = nextAmount;
    orderTypeRef.current = nextType;
    setLogoutCountdown(clearTimer);
    setLastScanText(text);

    if (nextStockId && nextAmount !== null && nextType) {
      setTradeStatus("PENDING");
      tradeStatusRef.current = "PENDING";
      setTradeCountdown(CONFIRM_COUNTDOWN_SECONDS);
    } else {
      setTradeStatus("BUILDING");
      tradeStatusRef.current = "BUILDING";
    }
  }, [clearTimer, resetOrder, stocks]);

  const lookupUser = useCallback(async (shortId: string) => {
    try {
      const user = await lookupUserByShortId(shortId);
      if (user) {
        setSelectedUser(user);
        selectedUserRef.current = user;
        setLogoutCountdown(clearTimer);
        setLastScanText(`ID ${shortId} を認証しました`);
        const queued = pendingOrderScans.current.splice(0);
        window.setTimeout(() => {
          queued.forEach((text) => applyOrderPayload(text));
        }, 0);
      } else {
        setLastScanText(`ID ${shortId} は見つかりません`);
      }
    } catch {
      setLastScanText("ユーザー照会に失敗しました");
    }
  }, [applyOrderPayload, clearTimer]);

  const processQrText = useCallback((text: string) => {
    const now = Date.now();
    Object.entries(lastProcessedRef.current).forEach(([key, at]) => {
      if (at < now - QR_DEDUPE_RETENTION_MS) delete lastProcessedRef.current[key];
    });
    if ((lastProcessedRef.current[text] ?? 0) > now - QR_DEDUPE_MS) return;
    lastProcessedRef.current[text] = now;

    if (text === "CANCEL") {
      resetOrder();
      setLastScanText("注文をキャンセルしました");
      return;
    }

    if (!selectedUserRef.current) {
      if (isOrderQrPayload(text)) {
        if (!pendingOrderScans.current.includes(text)) pendingOrderScans.current.push(text);
        setLastScanText("注文QRを先読みしました。IDカードを読み取ってください");
        return;
      }
      const shortId = extractShortIdFromQr(text);
      if (shortId) void lookupUser(shortId);
      return;
    }

    if (tradeStatusRef.current === "PENDING" || tradeStatusRef.current === "PROCESSING" || tradeStatusRef.current === "SUCCESS" || tradeStatusRef.current === "ERROR" || isTrading) return;
    applyOrderPayload(text);
  }, [applyOrderPayload, isTrading, lookupUser, resetOrder]);

  const resolveExecutableAmount = useCallback(async (): Promise<string> => {
    if (!selectedUser || !orderStockId || !orderType || orderAmount === null) {
      throw new Error("注文内容が不足しています。");
    }
    if (orderAmount !== "MAX") return orderAmount;

    const stock = stocks.find((s) => s.id === orderStockId);
    if (!stock) throw new Error("指定された銘柄が存在しません。");

    let userForCalculation = selectedUser;
    try {
      const userSnap = await getDoc(doc(db, "users", selectedUser.uid));
      if (userSnap.exists()) {
        userForCalculation = { ...selectedUser, ...(userSnap.data() as User), uid: selectedUser.uid };
        setSelectedUser(userForCalculation);
      }
    } catch {
      // 画面上のユーザー情報でフォールバックする。
    }

    const amount = orderType === "BUY"
      ? divFloorExact(userForCalculation.points || 0, stock.currentPrice)
      : toExactString(userForCalculation.inventory?.[orderStockId] || 0);

    if (!isPositiveExact(amount)) {
      throw new Error(orderType === "BUY" ? "最大数で購入できるポイントが不足しています。" : "最大数で売却できる保有株がありません。");
    }
    return amount;
  }, [orderAmount, orderStockId, orderType, selectedUser, stocks]);

  const executeOrder = useCallback(async () => {
    if (!selectedUser || !orderStockId || !orderType || orderAmount === null) return;
    setTradeStatus("PROCESSING");
    tradeStatusRef.current = "PROCESSING";

    let executableAmount: string;
    try {
      executableAmount = await resolveExecutableAmount();
    } catch (error) {
      setTradeStatus("ERROR");
      tradeStatusRef.current = "ERROR";
      setTradeError(error instanceof Error ? error.message : "注文数量を確定できませんでした。");
      resetTimerRef.current = window.setTimeout(resetOrder, ERROR_RESET_MS);
      return;
    }

    const { success, errorMsg, warningMsg } = await executeTerminalTrade(selectedUser.uid, orderStockId, orderType, executableAmount, orderAmount === "MAX");
    setTradeStatus(success ? "SUCCESS" : "ERROR");
    tradeStatusRef.current = success ? "SUCCESS" : "ERROR";
    if (!success) setTradeError(errorMsg);
    setTradeWarning(success ? warningMsg : undefined);
    resetTimerRef.current = window.setTimeout(resetOrder, success ? SUCCESS_RESET_MS : ERROR_RESET_MS);
  }, [executeTerminalTrade, orderAmount, orderStockId, orderType, resetOrder, resolveExecutableAmount, selectedUser]);

  const refreshSelectedUser = useCallback(async () => {
    if (!selectedUserRef.current) return;
    const snapshot = await getDoc(doc(db, "users", selectedUserRef.current.uid));
    if (!snapshot.exists()) return;
    const refreshed = { ...selectedUserRef.current, ...(snapshot.data() as User), uid: selectedUserRef.current.uid };
    selectedUserRef.current = refreshed;
    setSelectedUser(refreshed);
  }, []);

  const executeQuickTrade = useCallback(async (stockId: string, type: OrderType, maxMode: boolean) => {
    if (!selectedUser || isTrading) return;
    const stock = stocks.find((item) => item.id === stockId);
    if (!stock) return;
    const amount = type === "BUY"
      ? divFloorExact(selectedUser.points || 0, stock.currentPrice)
      : toExactString(selectedUser.inventory?.[stockId] || 0);
    if (!isPositiveExact(amount)) {
      setTradeStatus("ERROR");
      tradeStatusRef.current = "ERROR";
      setTradeError(type === "BUY" ? "購入できるポイントが不足しています。" : "売却できる保有株がありません。");
      resetTimerRef.current = window.setTimeout(resetOrder, ERROR_RESET_MS);
      return;
    }
    setTradeStatus("PROCESSING");
    tradeStatusRef.current = "PROCESSING";
    const result = await executeTerminalTrade(selectedUser.uid, stockId, type, amount, maxMode);
    setTradeStatus(result.success ? "SUCCESS" : "ERROR");
    tradeStatusRef.current = result.success ? "SUCCESS" : "ERROR";
    setTradeError(result.success ? undefined : result.errorMsg);
    setTradeWarning(result.success ? result.warningMsg : undefined);
    if (result.success) await refreshSelectedUser();
    resetTimerRef.current = window.setTimeout(resetOrder, result.success ? SUCCESS_RESET_MS : ERROR_RESET_MS);
  }, [executeTerminalTrade, isTrading, refreshSelectedUser, resetOrder, selectedUser, stocks]);

  useEffect(() => {
    if (window.BarcodeDetector) {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
    }

    let active = true;
    const video = videoRef.current;
    const openCamera = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" }
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } }
        });
      }
    };

    openCamera().then((stream) => {
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => setCameraError("カメラ映像の再生に失敗しました。"));
      }
      setLastScanText("IDカードをカメラに向けてください");
    }).catch((error) => {
      setCameraError("カメラへの接続に失敗しました: " + error.message);
    });

    return () => {
      active = false;
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const detectQrWithJsQr = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): DetectedQr | null => {
    const imageData = ctx.getImageData(x, y, width, height);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (!result?.data) return null;
    const xs = [
      result.location.topLeftCorner.x + x,
      result.location.topRightCorner.x + x,
      result.location.bottomRightCorner.x + x,
      result.location.bottomLeftCorner.x + x,
    ];
    const ys = [
      result.location.topLeftCorner.y + y,
      result.location.topRightCorner.y + y,
      result.location.bottomRightCorner.y + y,
      result.location.bottomLeftCorner.y + y,
    ];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      rawValue: result.data,
      bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    };
  }, []);

  const detectQrCodes = useCallback(async (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Promise<DetectedQr[]> => {
    const detections = new Map<string, DetectedQr>();
    const detector = detectorRef.current;
    if (detector) {
      const results = await detector.detect(canvas);
      results
        .filter((result) => Boolean(result.rawValue))
        .forEach((result) => {
          const rawValue = result.rawValue || "";
          detections.set(rawValue, {
            rawValue,
            bounds: result.boundingBox ? {
              x: result.boundingBox.x,
              y: result.boundingBox.y,
              width: result.boundingBox.width,
              height: result.boundingBox.height,
            } : null,
          });
        });
    }

    if (!detector || detections.size <= 1) {
      const regions = [
        { x: 0, y: 0, width: canvas.width, height: canvas.height },
        ...Array.from({ length: 3 }).flatMap((_, row) =>
          Array.from({ length: 3 }).map((__, col) => ({
            x: Math.floor((canvas.width * col) / 3),
            y: Math.floor((canvas.height * row) / 3),
            width: Math.ceil(canvas.width / 3),
            height: Math.ceil(canvas.height / 3),
          }))
        ),
      ];
      regions.forEach((region) => {
        const qr = detectQrWithJsQr(ctx, region.x, region.y, Math.min(region.width, canvas.width - region.x), Math.min(region.height, canvas.height - region.y));
        if (qr && !detections.has(qr.rawValue)) detections.set(qr.rawValue, qr);
      });
    }

    return Array.from(detections.values());
  }, [detectQrWithJsQr]);

  useEffect(() => {
    let active = true;
    let lastDetectAt = 0;

    const loop = async (timestamp: number) => {
      if (!active) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && timestamp - lastDetectAt > DETECTION_INTERVAL_MS) {
        lastDetectAt = timestamp;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        setVideoSize({ width: canvas.width, height: canvas.height });
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const nextDetections = await detectQrCodes(canvas, ctx);
            setDetectedQrs(nextDetections);
            nextDetections.forEach((qr) => processQrText(qr.rawValue));
          } catch {
            setDetectedQrs([]);
          }
        }
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
    return () => { active = false; };
  }, [detectQrCodes, processQrText]);

  const submitManualShortId = useCallback((event: FormEvent) => {
    event.preventDefault();
    const shortId = manualShortId.trim();
    if (!shortId) return;
    void lookupUser(shortId);
    setManualShortId("");
  }, [lookupUser, manualShortId]);

  useEffect(() => {
    if (tradeStatus !== "PENDING") return;
    const timer = setInterval(() => {
      setTradeCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void executeOrder();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [executeOrder, tradeStatus]);

  useEffect(() => {
    if (!selectedUser || (tradeStatus !== "IDLE" && tradeStatus !== "BUILDING")) return;
    const timer = setInterval(() => {
      setLogoutCountdown((prev) => {
        if (prev <= 1) {
          resetAll();
          return clearTimer;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [clearTimer, resetAll, selectedUser, tradeStatus]);

  const stockName = stocks.find((stock) => stock.id === orderStockId)?.name ?? "-";
  const videoWidth = videoSize.width;
  const videoHeight = videoSize.height;
  const selectedUserHoldings = selectedUser?.inventory ?? {};
  const holdingsBreakdown = stocks
    .map((stock) => {
      const amount = toExactString(selectedUserHoldings[stock.id] || 0);
      const value = mulExact(amount, stock.currentPrice);
      return { stock, amount, value, hasHolding: isPositiveExact(amount) };
    })
    .filter((item) => item.hasHolding);
  const stockValueTotal = holdingsBreakdown.reduce((total, item) => addExact(total, item.value), "0");
  const totalAssets = addExact(selectedUser?.points || 0, stockValueTotal);
  const purchaseInsights = buildPurchaseInsights(transactions, stocks, selectedUser);

  if (cameraError) {
    return (
      <div className="h-full bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-8">
        <AlertTriangle className="text-red-400" size={48} />
        <p className="font-bold text-center max-w-md">{cameraError}</p>
        <Button variant="secondary" onClick={onReturnPortal}><Home size={16} /> 戻る</Button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 text-slate-950 dark:bg-black dark:text-white">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,rgba(15,23,42,0.18)_45%,rgba(15,23,42,0.5)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.45)_100%)] pointer-events-none" />

      {detectedQrs.map((qr) => qr.bounds && (
        <div
          key={`${qr.rawValue}-${qr.bounds.x}-${qr.bounds.y}`}
          className="absolute border-4 border-emerald-400 rounded-lg shadow-[0_0_24px_rgba(16,185,129,0.75)] pointer-events-none"
          style={{
            left: `${(qr.bounds.x / videoWidth) * 100}%`,
            top: `${(qr.bounds.y / videoHeight) * 100}%`,
            width: `${(qr.bounds.width / videoWidth) * 100}%`,
            height: `${(qr.bounds.height / videoHeight) * 100}%`,
          }}
        />
      ))}

      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
        <button onClick={onReturnPortal} className="bg-white/90 text-slate-700 p-3 rounded-full border border-slate-200 hover:bg-white dark:bg-black/60 dark:text-white dark:border-white/20 dark:hover:bg-black/80 shadow-lg">
          <Home size={22} />
        </button>
        <div className="bg-white/95 text-slate-900 border border-slate-200 rounded-full px-5 py-2 flex items-center gap-2 shadow-lg dark:bg-black/80 dark:text-white dark:border-white/15">
          <ScanLine className="text-purple-400 animate-pulse" size={20} />
          <span className="font-black tracking-widest text-sm">ORDER CARD SCANNER</span>
        </div>
        <div className="w-12" />
      </div>

      <div className="absolute left-6 top-24 z-20 w-96 max-w-[calc(100vw-3rem)] rounded-2xl bg-white/96 text-slate-900 border border-slate-200 p-5 shadow-xl dark:bg-black/80 dark:text-white dark:border-white/15">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4 mb-4 dark:border-white/10">
          <UserRound className={selectedUser ? "text-emerald-400" : "text-slate-400"} size={22} />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agent</p>
            <p className="font-black truncate">{selectedUser ? selectedUser.nickname : "ID待機中"}</p>
          </div>
        </div>
        <p className="text-xs font-bold text-slate-600 leading-relaxed dark:text-slate-300">{lastScanText}</p>
        {!selectedUser && (
          <form onSubmit={submitManualShortId} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="manual-short-id">
              ID Direct Input
            </label>
            <div className="flex gap-2">
              <input
                id="manual-short-id"
                value={manualShortId}
                onChange={(event) => setManualShortId(event.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 16))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="例: 0001"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-lg font-black outline-none focus:border-purple-500 dark:border-white/15 dark:bg-black/50 dark:text-white"
              />
              <Button type="submit" variant="primary" className="px-4">
                認証
              </Button>
            </div>
          </form>
        )}
        {selectedUser && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Assets</p>
                  <p className="mt-1 text-2xl font-mono font-black text-emerald-600 dark:text-emerald-300">{formatExact(totalAssets)} pt</p>
                </div>
                <div className="text-right text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <p>現金 {formatExact(selectedUser.points)} pt</p>
                  <p>株式 {formatExact(stockValueTotal)} pt</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {holdingsBreakdown.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">保有株はありません。</p>
                ) : holdingsBreakdown.map(({ stock, amount, value }) => (
                  <div key={stock.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs">
                    <span className="truncate font-black text-slate-700 dark:text-slate-200">{stock.name}</span>
                    <span className="font-mono font-bold text-slate-500">{formatExact(amount)}株</span>
                    <span className="font-mono font-black text-slate-800 dark:text-white">{formatExact(value)}pt</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">購入時価格・売り時の目安</p>
              {purchaseInsights.length === 0 ? <p className="text-xs font-bold text-slate-400">購入履歴を読み込み中、または保有株はありません。</p> : purchaseInsights.map((insight) => (
                <div key={insight.stock.id} className="border-t border-slate-100 py-2 first:border-t-0 first:pt-0 dark:border-white/10">
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate font-black">{insight.stock.name}</span><span className={insight.diff >= 0 ? "font-black text-rose-500" : "font-black text-blue-500"}>{insight.diff >= 0 ? <TrendingUp size={13} className="mr-1 inline" /> : <TrendingDown size={13} className="mr-1 inline" />}{insight.recommendation}</span></div>
                  <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">購入時 平均 {insight.averagePrice}pt / 現在 {insight.stock.currentPrice}pt</p>
                  <div className="mt-2 flex gap-2"><button type="button" disabled={isTrading} onClick={() => void executeQuickTrade(insight.stock.id, "BUY", true)} className="rounded bg-rose-100 px-2 py-1 text-[11px] font-black text-rose-700 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-200">全額買い</button><button type="button" disabled={isTrading} onClick={() => void executeQuickTrade(insight.stock.id, "SELL", true)} className="rounded bg-blue-600 px-2 py-1 text-[11px] font-black text-white disabled:opacity-50">全株売り</button></div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest">
              <span>Clear</span><span>{logoutCountdown}s</span>
            </div>
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden dark:bg-white/10">
              <div className="bg-purple-400 h-full transition-all duration-1000 ease-linear" style={{ width: `${(logoutCountdown / clearTimer) * 100}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="absolute left-6 right-6 bottom-6 z-20 rounded-3xl bg-white/96 text-slate-900 border border-slate-200 p-5 shadow-xl dark:bg-slate-950/96 dark:text-white dark:border-white/15">
        <div className="grid grid-cols-3 gap-4">
          <div className={`min-h-28 rounded-2xl border-2 p-4 flex flex-col justify-between ${orderType ? "border-emerald-400 bg-emerald-400/10" : "border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5"}`}>
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">Action</span>
            <span className={`text-5xl font-black ${orderType === "BUY" ? "text-red-400" : orderType === "SELL" ? "text-blue-400" : "text-slate-500"}`}>{orderType ? (orderType === "BUY" ? "買" : "売") : "-"}</span>
          </div>
          <div className={`min-h-28 rounded-2xl border-2 p-4 flex flex-col justify-between ${orderStockId ? "border-emerald-400 bg-emerald-400/10" : "border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5"}`}>
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">Stock</span>
            <span className="text-3xl font-black truncate">{stockName}</span>
          </div>
          <div className={`min-h-28 rounded-2xl border-2 p-4 flex flex-col justify-between ${orderAmount ? "border-emerald-400 bg-emerald-400/10" : "border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5"}`}>
            <span className="text-[10px] font-black tracking-widest uppercase text-slate-400">Amount</span>
            <span className="text-5xl font-mono font-black text-emerald-600 dark:text-emerald-300">{formatOrderAmount(orderAmount)}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {detectedQrs.length > 0 ? `${detectedQrs.length} QR detected` : "IDカード、注文台紙、または注文カードをカメラに向けてください"}
          </div>
          <Button variant={tradeStatus === "BUILDING" ? "danger" : "outline"} onClick={resetOrder} className={tradeStatus === "BUILDING" ? "px-6 py-3 text-base" : "border-slate-300 text-slate-700 hover:border-slate-500 dark:border-white/20 dark:text-white dark:hover:border-white/40"}>
            <RefreshCw size={14} className="mr-2" /> 注文リセット
          </Button>
        </div>
      </div>

      {(tradeStatus === "PENDING" || tradeStatus === "PROCESSING" || tradeStatus === "SUCCESS" || tradeStatus === "ERROR") && (
        <div className="absolute inset-0 z-30 bg-black/86 flex items-center justify-center p-8">
          <div className="w-full max-w-3xl rounded-3xl border border-white/15 bg-slate-950/95 p-10 text-center shadow-2xl">
            {tradeStatus === "PENDING" && (
              <>
                <h2 className="text-3xl font-black text-emerald-300 tracking-widest mb-8">ORDER COMPLETE</h2>
                <div className="flex items-center justify-center gap-6 text-white mb-8">
                  <span className={`text-6xl font-black ${orderType === "BUY" ? "text-red-400" : "text-blue-400"}`}>{orderType === "BUY" ? "買" : "売"}</span>
                  <span className="text-4xl font-black">{stockName}</span>
                  <span className="text-6xl font-mono font-black text-emerald-300">{formatOrderAmount(orderAmount)}<span className="text-2xl text-slate-500 ml-2">株</span></span>
                </div>
                <p className="text-slate-400 font-bold">あと <span className="text-white text-3xl font-mono mx-1">{tradeCountdown}</span> 秒で確定します</p>
                <Button variant="danger" size="lg" onClick={resetOrder} className="mt-8 px-10">
                  キャンセル
                </Button>
              </>
            )}
            {tradeStatus === "PROCESSING" && <div className="flex flex-col items-center gap-4"><Loader2 className="animate-spin text-emerald-300" size={48} /><p className="font-black text-xl">処理中...</p></div>}
            {tradeStatus === "SUCCESS" && (
              <div className="flex flex-col items-center gap-4">
                <CheckCircle className="text-emerald-300" size={58} />
                <p className="font-black text-2xl">取引完了</p>
                {tradeWarning && <p className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-sm font-black text-amber-200">{tradeWarning}</p>}
              </div>
            )}
            {tradeStatus === "ERROR" && <div className="flex flex-col items-center gap-4"><AlertTriangle className="text-red-400" size={58} /><p className="font-bold text-red-300">{tradeError}</p><Button variant="secondary" onClick={resetOrder}>閉じる</Button></div>}
          </div>
        </div>
      )}
    </div>
  );
}

function buildPurchaseInsights(transactions: Transaction[], stocks: Stock[], user: User | null) {
  if (!user) return [];
  return stocks.flatMap((stock) => {
    if (!isPositiveExact(user.inventory?.[stock.id] || 0)) return [];
    const purchases = transactions.filter((tx) => tx.stockId === stock.id && tx.type === "BUY" && !tx.isUndone);
    if (purchases.length === 0) return [];
    const totals = purchases.reduce((sum, tx) => ({
      amount: sum.amount + BigInt(toExactString(tx.amount)),
      points: sum.points + BigInt(Math.round(tx.price)) * BigInt(toExactString(tx.amount)),
    }), { amount: 0n, points: 0n });
    if (totals.amount <= 0n) return [];
    const averagePrice = Number(totals.points / totals.amount);
    const diff = stock.currentPrice - averagePrice;
    return [{
      stock,
      averagePrice,
      diff,
      recommendation: diff >= 0 ? "売却を検討" : "様子見を検討",
    }];
  });
}
