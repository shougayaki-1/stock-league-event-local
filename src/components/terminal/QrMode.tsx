import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useStocks, useChartHistory, useNews, useTransactions } from "../../hooks/useFirebase";
import type { Stock, Transaction, User } from "../../types/domain";
import { useWindowActions } from "../../hooks/useWindowActions";
import { ScanFace, Activity, Store, Loader2, QrCode, Home, Settings, TrendingDown, TrendingUp } from "lucide-react";
import QRScanner from "../admin/QRScanner";
import StockLineChart from "../ui/StockLineChart";
import { divFloorExact, formatExact, isPositiveExact, toExactString } from "../../lib/exactNumber";
import { extractShortIdFromQr } from "../../lib/utils";
import { formatOrderAmount, lookupUserByShortId, parseOrderAmount, type OrderAmount } from "../../lib/terminalUtils";
import { STORAGE_KEYS } from "../../lib/storageKeys";

import TransactionOverlay from "./TransactionOverlay";
import TerminalSettingsModal from "./TerminalSettingsModal";

const QR_DEDUPE_MS = 1500;
const SUCCESS_RESET_MS = 2000;
const ERROR_RESET_MS = 3500;

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
  variant?: "standard" | "orderCards";
}

export default function QrMode({ clearTimer, onReturnPortal, variant = "standard" }: Props) {
  const stocks = useStocks();
  const chartData = useChartHistory();
  const news = useNews();
  const { executeTerminalTrade, isLoading: isTrading } = useWindowActions();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const transactions = useTransactions(selectedUser?.uid ?? null);
  const [logoutCountdown, setLogoutCountdown] = useState(clearTimer);

  const [orderStockId, setOrderStockId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState<OrderAmount | null>(null);
  const [orderType, setOrderType] = useState<"BUY"|"SELL" | null>(null);

  const [tradeStatus, setTradeStatus] = useState<"IDLE" | "BUILDING" | "PENDING" | "SUCCESS" | "ERROR">("IDLE");
  const [tradeError, setTradeError] = useState<string | undefined>(undefined);
  const [tradeWarning, setTradeWarning] = useState<string | undefined>(undefined);
  const [buildCountdown, setBuildCountdown] = useState(10); 
  const [tradeCountdown, setTradeCountdown] = useState(3);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [localClearTimer, setLocalClearTimer] = useState(clearTimer);

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEYS.VIEW_CLEAR_TIME, localClearTimer.toString());
    setIsSettingsOpen(false);
    window.location.reload(); 
  };
  
  const lastProcessedRawScan = useRef<Record<string, number>>({});
  const pendingOrderScans = useRef<string[]>([]);
  const selectedUserRef = useRef<User | null>(null);
  const tradeStatusRef = useRef(tradeStatus);
  const isTradingRef = useRef(isTrading);
  const orderStockIdRef = useRef<string | null>(null);
  const orderAmountRef = useRef<OrderAmount | null>(null);
  const orderTypeRef = useRef<"BUY" | "SELL" | null>(null);
  const pendingExecutionStartedRef = useRef(false);

  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  useEffect(() => { tradeStatusRef.current = tradeStatus; }, [tradeStatus]);
  useEffect(() => { isTradingRef.current = isTrading; }, [isTrading]);
  useEffect(() => { orderStockIdRef.current = orderStockId; }, [orderStockId]);
  useEffect(() => { orderAmountRef.current = orderAmount; }, [orderAmount]);
  useEffect(() => { orderTypeRef.current = orderType; }, [orderType]);

  const resetOrderState = useCallback(() => {
    setTradeStatus("IDLE");
    setOrderStockId(null);
    setOrderAmount(null);
    setOrderType(null);
    orderStockIdRef.current = null;
    orderAmountRef.current = null;
    orderTypeRef.current = null;
    setTradeError(undefined);
    setTradeWarning(undefined);
    setLogoutCountdown(localClearTimer);
  }, [localClearTimer]);

  const clearSelectedUser = useCallback(() => {
    selectedUserRef.current = null;
    setSelectedUser(null);
  }, []);

  const handleScan = useCallback(async (shortId: string) => {
    if (tradeStatusRef.current === "PENDING" || isTradingRef.current) return;
    try {
      const user = await lookupUserByShortId(shortId);
      if (user) {
        setSelectedUser(user);
        selectedUserRef.current = user;
        setLogoutCountdown(localClearTimer); 
        const queued = pendingOrderScans.current.splice(0);
        window.setTimeout(() => {
          queued.forEach((text) => handleRawScanRef.current(text));
        }, 0);
      }
    } catch (e) { console.error(e); }
  }, [localClearTimer]);

  const applyOrderPayload = useCallback((text: string) => {
    let newStockId = orderStockIdRef.current; let newAmount = orderAmountRef.current; let newType = orderTypeRef.current;
    let isUpdated = false;

    if (text.startsWith("TRADE:")) {
      const parts = text.split(":");
      if (parts.length === 4) {
        if (stocks.find(s => s.id === parts[1])) { newStockId = parts[1]; isUpdated = true; }
        if (parts[2] === "BUY" || parts[2] === "SELL") { newType = parts[2]; isUpdated = true; }
        const amount = parseOrderAmount(parts[3]);
        if (amount !== null) {
          newAmount = amount;
          isUpdated = true;
        }
      }
    } else {
      const cleanText = text.replace(/^ORDER:/, "");
      const commands = cleanText.split(",");
      commands.forEach(cmd => {
        const parts = cmd.split(":");
        if (parts.length === 2) {
          const key = parts[0].trim(); const val = parts[1].trim();
          if (key === "STOCK" && stocks.find(s => s.id === val)) { newStockId = val; isUpdated = true; }
          if (key === "AMOUNT") { const amount = parseOrderAmount(val); if (amount !== null) { newAmount = amount; isUpdated = true; } }
          if (key === "ACTION" && (val === "BUY" || val === "SELL")) { newType = val; isUpdated = true; }
        }
      });
    }

    if (isUpdated) {
      setOrderStockId(newStockId); setOrderAmount(newAmount); setOrderType(newType);
      orderStockIdRef.current = newStockId;
      orderAmountRef.current = newAmount;
      orderTypeRef.current = newType;
      if (newStockId !== null && newAmount !== null && newType !== null) { setTradeStatus("PENDING"); setTradeCountdown(3); }
      else { setTradeStatus("BUILDING"); setBuildCountdown(10); }
      setLogoutCountdown(localClearTimer);
    }
  }, [stocks, localClearTimer]);

  const handleRawScan = useCallback((text: string) => {
    const now = Date.now();
    Object.entries(lastProcessedRawScan.current).forEach(([key, at]) => {
      if (at < now - QR_DEDUPE_MS) delete lastProcessedRawScan.current[key];
    });
    const currentStatus = tradeStatusRef.current;
    const currentUser = selectedUserRef.current;
    if (!currentUser && isOrderQrPayload(text) && text !== "CANCEL") {
      if (!pendingOrderScans.current.includes(text)) pendingOrderScans.current.push(text);
      return;
    }
    if ((lastProcessedRawScan.current[text] ?? 0) > now - QR_DEDUPE_MS) return;
    lastProcessedRawScan.current[text] = now;

    if (text === "CANCEL") {
      resetOrderState();
      return;
    }

    if (currentStatus === "PENDING" || currentStatus === "SUCCESS" || currentStatus === "ERROR" || isTradingRef.current || !currentUser) return;
    applyOrderPayload(text);
  }, [applyOrderPayload, resetOrderState]);

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
  }, [selectedUser, orderStockId, orderType, orderAmount, stocks]);

  const handleExecuteTrade = useCallback(async () => {
    if (!selectedUser || !orderStockId || !orderType || !orderAmount) return;

    let executableAmount: string;
    try {
      executableAmount = await resolveExecutableAmount();
    } catch (error) {
      setTradeStatus("ERROR");
      setTradeError(error instanceof Error ? error.message : "注文数量を確定できませんでした。");
      setTimeout(resetOrderState, ERROR_RESET_MS);
      return;
    }
    
    const { success, errorMsg, warningMsg } = await executeTerminalTrade(selectedUser.uid, orderStockId, orderType, executableAmount, orderAmount === "MAX");
    setTradeStatus(success ? "SUCCESS" : "ERROR");
    if (!success) setTradeError(errorMsg);
    setTradeWarning(success ? warningMsg : undefined);

    setTimeout(() => {
      resetOrderState();
      if (success) clearSelectedUser();
    }, success ? SUCCESS_RESET_MS : ERROR_RESET_MS);

  }, [selectedUser, orderStockId, orderType, orderAmount, executeTerminalTrade, resolveExecutableAmount, resetOrderState, clearSelectedUser]);

  const refreshSelectedUser = useCallback(async () => {
    if (!selectedUserRef.current) return;
    const snapshot = await getDoc(doc(db, "users", selectedUserRef.current.uid));
    if (!snapshot.exists()) return;
    const refreshed = { ...selectedUserRef.current, ...(snapshot.data() as User), uid: selectedUserRef.current.uid };
    selectedUserRef.current = refreshed;
    setSelectedUser(refreshed);
  }, []);

  const handleQuickTrade = useCallback(async (stockId: string, type: "BUY" | "SELL", maxMode = false) => {
    if (!selectedUser || isTrading) return;
    const stock = stocks.find((item) => item.id === stockId);
    if (!stock) return;
    const amount = maxMode
      ? (type === "BUY" ? divFloorExact(selectedUser.points || 0, stock.currentPrice) : toExactString(selectedUser.inventory?.[stockId] || 0))
      : "1";
    if (!isPositiveExact(amount)) {
      setTradeStatus("ERROR");
      setTradeError(type === "BUY" ? "購入できるポイントが不足しています。" : "売却できる保有株がありません。");
      window.setTimeout(resetOrderState, ERROR_RESET_MS);
      return;
    }
    const result = await executeTerminalTrade(selectedUser.uid, stockId, type, amount, maxMode);
    setTradeStatus(result.success ? "SUCCESS" : "ERROR");
    setTradeError(result.success ? undefined : result.errorMsg);
    setTradeWarning(result.success ? result.warningMsg : undefined);
    if (result.success) await refreshSelectedUser();
    window.setTimeout(() => {
      resetOrderState();
      if (result.success) clearSelectedUser();
    }, result.success ? SUCCESS_RESET_MS : ERROR_RESET_MS);
  }, [clearSelectedUser, executeTerminalTrade, isTrading, refreshSelectedUser, resetOrderState, selectedUser, stocks]);

  const purchaseInsights = useMemo(() => buildPurchaseInsights(transactions, stocks, selectedUser), [selectedUser, stocks, transactions]);

  const handleScanRef = useRef(handleScan); const handleRawScanRef = useRef(handleRawScan);
  useEffect(() => { handleScanRef.current = handleScan; handleRawScanRef.current = handleRawScan; }, [handleScan, handleRawScan]);
  
  const scannerElement = useMemo(() => (
    <QRScanner
      onScan={(fullId) => {
        const shortId = extractShortIdFromQr(fullId);
        if (shortId) handleScanRef.current(shortId);
      }}
      onRawScan={(text) => handleRawScanRef.current(text)}
    />
  ), []);

  useEffect(() => {
    if (tradeStatus !== "PENDING") {
      pendingExecutionStartedRef.current = false;
    }

    const shouldRunTimer = tradeStatus === "BUILDING" || tradeStatus === "PENDING" || Boolean(selectedUser && tradeStatus === "IDLE");
    if (!shouldRunTimer) return;

    const timer = window.setInterval(() => {
      if (tradeStatus === "BUILDING") {
        setBuildCountdown(p => {
          if (p <= 1) {
            resetOrderState();
            return 0;
          }
          return p - 1;
        });
      }

      if (tradeStatus === "PENDING") {
        setTradeCountdown(p => {
          if (p <= 1) {
            if (!pendingExecutionStartedRef.current) {
              pendingExecutionStartedRef.current = true;
              void handleExecuteTrade();
            }
            return 0;
          }
          return p - 1;
        });
      }

      if (selectedUser && (tradeStatus === "IDLE" || tradeStatus === "BUILDING")) {
        setLogoutCountdown(p => {
          if (p <= 1) {
            selectedUserRef.current = null;
            setSelectedUser(null);
            return localClearTimer;
          }
          return p - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [selectedUser, tradeStatus, localClearTimer, resetOrderState, handleExecuteTrade]);

  const overlayDuration = tradeStatus === "SUCCESS" ? 2000 : tradeStatus === "ERROR" ? 3500 : undefined;

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-sans flex flex-col p-4 sm:p-6 relative overflow-hidden transition-colors duration-300">
      
      <TerminalSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} clearTimer={localClearTimer} setClearTimer={setLocalClearTimer} onSave={saveSettings} />

      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setIsSettingsOpen(true)} className="bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white p-3 rounded-full shadow-md border border-slate-200 dark:border-slate-700 transition"><Settings size={24} /></button>
        <button onClick={onReturnPortal} className="bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 p-3 rounded-full shadow-md border border-slate-200 dark:border-slate-700 transition"><Home size={24} /></button>
      </div>
      
      <header className="mb-4 text-center mt-2">
        <h1 className="text-2xl font-black tracking-widest flex items-center justify-center gap-2 italic"><ScanFace className="text-blue-600 dark:text-blue-500" size={28} /> {variant === "orderCards" ? "ORDER CARD TERMINAL" : "AGENT TERMINAL"}</h1>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto flex flex-col lg:flex-row gap-6 items-stretch min-h-0 relative mt-2">
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 relative z-50">
          <div className="bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 flex flex-col items-center p-4 shadow-xl relative overflow-hidden">
            <div className="w-full">{scannerElement}</div>
            <div className="mt-4 text-center">
              {!selectedUser ? <p className="text-blue-600 dark:text-blue-400 font-black animate-pulse text-sm tracking-widest uppercase flex items-center gap-2"><ScanFace size={16} /> Scanning ID...</p> : <p className="text-emerald-600 font-black animate-pulse text-sm tracking-widest uppercase flex items-center gap-2"><Activity size={16} /> Ready for Orders</p>}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center font-black uppercase tracking-widest">{!selectedUser ? "Show your ID Card to start" : "Show an Order Card to trade"}</p>
        </div>

        <div className="flex-1 flex flex-col gap-6 min-w-0 relative">
          <div className="flex-3 min-h-[300px] bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 p-5 shadow-xl relative overflow-hidden">
            <div className="h-full flex flex-col gap-4 animate-in fade-in">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2"><Activity className="text-blue-600 dark:text-blue-400" size={20} /><h2 className="text-lg font-black tracking-widest uppercase">Market Dashboard</h2></div>
              <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {stocks.map((stock) => <div key={stock.id} className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col shadow-sm"><span className="font-bold text-slate-500 dark:text-slate-400 text-[10px] mb-1 truncate">{stock.name}</span><span className="font-mono font-black text-xl">{stock.currentPrice}</span></div>)}
                  </div>
                  <div className="flex-1 min-h-[150px] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 shadow-sm">
                    <StockLineChart chartData={chartData} stocks={stocks} showAxis showGrid />
                  </div>
                </div>
                <div className="w-full md:w-1/3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 p-3 overflow-y-auto shadow-sm">
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 mb-3 tracking-widest border-b border-slate-200 dark:border-slate-800 pb-1 uppercase">Latest News</p>
                  <div className="space-y-3 pr-1">{news.slice(0, 8).map(n => <div key={n.id} className="border-l-4 border-blue-500 pl-3"><span className="text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold block mb-0.5">{n.timestamp?.toDate().toLocaleTimeString()}</span><span className="font-bold text-xs leading-tight block">{n.title}</span></div>)}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-2 min-h-[250px] bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 shadow-xl relative overflow-hidden">
            {!selectedUser ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30"><Store size={80} className="mb-4" /><h2 className="text-2xl font-black tracking-widest uppercase">WAITING FOR AGENT</h2></div>
            ) : (
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-end mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div><h3 className="text-3xl font-black">{selectedUser.nickname}</h3></div>
                  <div className="text-right"><p className="text-[10px] text-slate-400 font-black uppercase mb-1">Total Asset</p><p className="text-4xl font-mono font-black text-blue-600 dark:text-blue-400 leading-none">{formatExact(selectedUser.points)} <span className="text-lg opacity-50">pt</span></p></div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <p className="text-xs text-slate-400 font-bold uppercase mb-3 tracking-widest">購入時価格・売買の目安</p>
                  {purchaseInsights.length === 0 ? <p className="mb-4 text-sm font-bold text-slate-400">購入履歴を読み込み中、または保有銘柄がありません。</p> : (
                    <div className="mb-4 space-y-2">
                      {purchaseInsights.map((insight) => (
                        <div key={insight.stock.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                          <div className="flex items-center justify-between gap-3">
                            <div><p className="font-black text-sm">{insight.stock.name}</p><p className="text-xs font-bold text-slate-500">購入時 平均 {insight.averagePrice}pt → 現在 {insight.stock.currentPrice}pt</p></div>
                            <div className={`text-right text-sm font-black ${insight.diff >= 0 ? "text-rose-600" : "text-blue-600"}`}>{insight.diff >= 0 ? <TrendingUp size={16} className="inline mr-1" /> : <TrendingDown size={16} className="inline mr-1" />}{insight.diff >= 0 ? "+" : ""}{insight.diff}pt<br /><span className="text-xs">{insight.recommendation}</span></div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={isTrading} onClick={() => void handleQuickTrade(insight.stock.id, "BUY")} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">1株買う</button><button type="button" disabled={isTrading} onClick={() => void handleQuickTrade(insight.stock.id, "BUY", true)} className="rounded-md bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-700 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-200">全額買う</button><button type="button" disabled={isTrading || !insight.heldAmount} onClick={() => void handleQuickTrade(insight.stock.id, "SELL", true)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">全株売る</button></div>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 font-bold uppercase mb-3 tracking-widest">Portfolio</p>
                  {Object.keys(selectedUser.inventory || {}).length === 0 ? <div className="bg-slate-50 dark:bg-slate-950 py-4 rounded-xl text-center text-slate-400 font-bold text-sm border border-slate-200 dark:border-slate-800">保有銘柄はありません</div> : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(selectedUser.inventory).map(([stockId, amount]) => {
                        const stock = stocks.find(s => s.id === stockId);
                        return stock && isPositiveExact(amount) ? <div key={stockId} className="flex flex-col bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"><span className="font-bold text-xs text-slate-500 mb-1 truncate">{stock.name}</span><span className="font-mono text-xl font-black">{formatExact(amount)} <span className="text-[10px] text-slate-400">株</span></span></div> : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  {tradeWarning && (
                    <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      {tradeWarning}
                    </p>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-widest"><span>Security Lock Engaged</span><span>{logoutCountdown} Seconds to clear</span></div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden"><div className="bg-blue-500 h-full transition-all duration-1000 ease-linear" style={{ width: `${(logoutCountdown / localClearTimer) * 100}%` }} /></div>
                </div>
              </div>
            )}
          </div>

          <TransactionOverlay 
            status={isTrading ? "PROCESSING" : tradeStatus !== "BUILDING" && tradeStatus !== "PENDING" && tradeStatus !== "IDLE" ? tradeStatus : null} 
            errorMsg={tradeError}
            duration={overlayDuration}
          />

          {tradeStatus !== "IDLE" && !isTrading && (tradeStatus === "BUILDING" || tradeStatus === "PENDING") && (
            <div className="absolute inset-0 z-40 bg-slate-900/98 rounded-[24px] flex flex-col items-center justify-center text-white p-8 animate-in fade-in zoom-in-95 duration-300 shadow-xl border border-slate-700">
              {tradeStatus === "BUILDING" && (
                <div className="text-center w-full">
                  <h2 className="text-3xl font-black mb-6 text-slate-400 tracking-widest uppercase flex items-center justify-center gap-3"><QrCode size={32}/> ORDER INPUT</h2>
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className={`p-6 rounded-3xl border-2 flex flex-col items-center justify-center min-h-[160px] ${orderStockId ? "bg-slate-800/80 border-emerald-500" : "bg-slate-900/50 border-slate-700 border-dashed"}`}><span className="text-[10px] text-slate-400 mb-3">Stock</span>{orderStockId ? <span className="text-3xl font-bold text-white">{stocks.find(s=>s.id === orderStockId)?.name}</span> : <Loader2 className="animate-spin text-slate-600"/>}</div>
                    <div className={`p-6 rounded-3xl border-2 flex flex-col items-center justify-center min-h-[160px] ${orderAmount ? "bg-slate-800/80 border-emerald-500" : "bg-slate-900/50 border-slate-700 border-dashed"}`}><span className="text-[10px] text-slate-400 mb-3">Amount</span>{orderAmount ? <span className="text-5xl font-mono text-emerald-400">{formatOrderAmount(orderAmount)}</span> : <Loader2 className="animate-spin text-slate-600"/>}</div>
                    <div className={`p-6 rounded-3xl border-2 flex flex-col items-center justify-center min-h-[160px] ${orderType ? "bg-slate-800/80 border-emerald-500" : "bg-slate-900/50 border-slate-700 border-dashed"}`}><span className="text-[10px] text-slate-400 mb-3">Action</span>{orderType ? <span className={`text-5xl font-black ${orderType==="BUY"?"text-red-500":"text-blue-500"}`}>{orderType==="BUY"?"買":"売"}</span> : <Loader2 className="animate-spin text-slate-600"/>}</div>
                  </div>
                  <p className="text-slate-400 font-bold">あと <span className="text-white text-xl font-mono mx-1">{buildCountdown}</span> 秒</p>
                </div>
              )}
              {tradeStatus === "PENDING" && orderStockId && (
                <div className="text-center w-full animate-in zoom-in-95 duration-300">
                  <h2 className="text-3xl font-black mb-8 text-emerald-400 tracking-widest uppercase">ORDER COMPLETE</h2>
                  <div className="bg-slate-800/80 border border-emerald-500/30 p-10 rounded-3xl mb-8"><div className="flex justify-center items-center gap-6"><span className={`text-5xl font-black ${orderType==="BUY"?"text-red-500":"text-blue-500"}`}>{orderType==="BUY"?"買":"売"}</span><span className="text-4xl font-bold">{stocks.find(s=>s.id === orderStockId)?.name}</span><span className="text-6xl font-mono font-black text-emerald-400">{formatOrderAmount(orderAmount)}<span className="text-2xl ml-2 text-slate-500">株</span></span></div></div>
                  <p className="text-slate-400 font-bold">あと <span className="text-white text-2xl font-mono mx-1">{tradeCountdown}</span> 秒で確定します</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function buildPurchaseInsights(transactions: Transaction[], stocks: Stock[], user: User | null) {
  if (!user) return [];
  return stocks.map((stock) => {
    const purchases = transactions.filter((tx) => tx.stockId === stock.id && tx.type === "BUY" && !tx.isUndone);
    if (purchases.length === 0) return null;
    const totals = purchases.reduce((sum, tx) => ({
      amount: sum.amount + BigInt(toExactString(tx.amount)),
      points: sum.points + BigInt(Math.round(tx.price)) * BigInt(toExactString(tx.amount)),
    }), { amount: 0n, points: 0n });
    if (totals.amount <= 0n) return null;
    const averagePrice = Number(totals.points / totals.amount);
    const diff = stock.currentPrice - averagePrice;
    return {
      stock,
      averagePrice,
      diff,
      heldAmount: isPositiveExact(user.inventory?.[stock.id] || 0),
      recommendation: diff >= 0 ? "利益が出ています。売却を検討" : "購入時より低値。様子見を検討",
    };
  }).filter((value): value is NonNullable<typeof value> => value !== null);
}
