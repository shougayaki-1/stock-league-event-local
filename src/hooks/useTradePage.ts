// =================================================================
// File: src/hooks/useTradePage.ts
// =================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useUser, useStocks, useTransactionsWithStatus, useNews, useRankingData, useSystemSettings } from "./useFirebase";
import type { Stock } from "../types/domain";
import { useSound } from "./useSound";
import { useDialog } from "../contexts/DialogContext";
import { APP_ERRORS } from "../lib/errors";
import {
  callFinalizeAccount,
  callQuoteStockPrice,
  callUpdateAgentNickname,
  type StockPriceQuoteResponse,
  type TradeStockRequest,
} from "../services/functions";
import { isPositiveIntegerInput, toExactString } from "../lib/exactNumber";
import { STORAGE_KEYS } from "../lib/storageKeys";
import { needsNicknameSetup } from "./nicknameSetup";
import { useEmergencyOverlay } from "./trade/useEmergencyOverlay";
import { useNewsToast } from "./trade/useNewsToast";
import { useStockFlash } from "./trade/useStockFlash";
import { usePlayerSession } from "./usePlayerSession";
import { callTradeWithConfirmation, isUncertainTradeError } from "../lib/tradeCall";

const STAMP_DURATION_MS = 1500;
const TOAST_DURATION_MS = 4000;
const AUTHENTICATED_USER_LOAD_TIMEOUT_MS = 5_000;
type TradeQuote = StockPriceQuoteResponse & { localExpiresAtMillis: number };

const quoteFailureReason = (error: unknown) => {
  if (!error || typeof error !== "object") return null;
  const direct = "details" in error ? (error as { details?: unknown }).details : null;
  const custom = "customData" in error ? (error as { customData?: { details?: unknown } }).customData?.details : null;
  const details = (direct || custom) as { reason?: unknown } | null;
  return typeof details?.reason === "string" ? details.reason : null;
};
const readPendingTrade = (): TradeStockRequest | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.PENDING_TRADE);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<TradeStockRequest>;
    return typeof parsed.uid === "string" && typeof parsed.stockId === "string" &&
      (parsed.type === "BUY" || parsed.type === "SELL") && typeof parsed.idempotencyKey === "string"
      ? parsed as TradeStockRequest
      : null;
  } catch {
    return null;
  }
};

export function useTradePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedUserID = searchParams.get("userID") || localStorage.getItem(STORAGE_KEYS.USER_ID);
  const playerSession = usePlayerSession(requestedUserID);
  const userID = playerSession.status === "authenticated" ? playerSession.uid : null;

  const user = useUser(userID);
  const stocks = useStocks();
  const { transactions, errorMessage: transactionErrorMessage } = useTransactionsWithStatus(userID);
  const news = useNews(user?.courseType);
  const { users: ranking, totalAgents } = useRankingData();
  const systemSettings = useSystemSettings();

  const { alert, confirm } = useDialog();
  const { playSound, initAudioContext } = useSound();

  const [activeTab, setActiveTab] = useState<"market" | "news" | "help" | "settings">(
    searchParams.get("tab") === "help" ? "help" : "market"
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingRecoveryRevision, setPendingRecoveryRevision] = useState(0);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [setupNickname, setSetupNickname] = useState("");

  const [tradeSuccessToast, setTradeSuccessToast] = useState<{ type: "BUY" | "SELL"; stockName: string; amountLabel: string } | null>(null);
  const [tradeQuote, setTradeQuote] = useState<TradeQuote | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteRevision, setQuoteRevision] = useState(0);
  const [quoteClockTick, setQuoteClockTick] = useState(() => Date.now());
  const [executedPrice, setExecutedPrice] = useState<{ stockId: string; price: number } | null>(null);

  const [tradeSuccessFlash, setTradeSuccessFlash] = useState<"BUY" | "SELL" | null>(null);
  const flashState = useStockFlash(stocks);
  const toastNews = useNewsToast(news, playSound);
  const { showEmergencyOverlay, showEmergencyResolvedOverlay, emergencyConfig } = useEmergencyOverlay(systemSettings);
  const isMarketClosed = systemSettings?.globalPhase === "STOP";

  const [tradeModal, setTradeModal] = useState<{ isOpen: boolean; stock: Stock | null; type: "BUY" | "SELL" | null; }>({ isOpen: false, stock: null, type: null });
  const [tradeAmount, setTradeAmountState] = useState<number | string>(0);
  // MAX（全額/全株）が選択されているか。約定価格で確定させるためサーバーへ maxMode として渡す。
  const [isMaxAmount, setIsMaxAmount] = useState(false);

  // 手入力・増減ボタンなどで数量が変わったら MAX 指定を解除する
  const setTradeAmount = useCallback((val: number | string) => {
    setIsMaxAmount(false);
    setTradeAmountState(val);
  }, []);

  const hasCheckedInfoRedirectRef = useRef(false);
  const tradeFlashTimerRef = useRef<number | null>(null);
  const tradeToastTimerRef = useRef<number | null>(null);
  const executedPriceTimerRef = useRef<number | null>(null);
  const hasRecoveredPendingTradeRef = useRef(false);

  // --- Effects ---

  useEffect(() => {
    const retryPendingTrade = () => {
      hasRecoveredPendingTradeRef.current = false;
      setPendingRecoveryRevision((value) => value + 1);
    };
    window.addEventListener("online", retryPendingTrade);
    window.addEventListener("pageshow", retryPendingTrade);
    return () => {
      window.removeEventListener("online", retryPendingTrade);
      window.removeEventListener("pageshow", retryPendingTrade);
    };
  }, []);

  useEffect(() => () => {
    [
      tradeFlashTimerRef,
      tradeToastTimerRef,
      executedPriceTimerRef
    ].forEach((ref) => {
      if (ref.current !== null) window.clearTimeout(ref.current);
    });
  }, []);

  useEffect(() => {
    if (!tradeModal.isOpen || !user || !tradeModal.stock || isLoading) return;
    let active = true;
    let refreshTimer: number | null = null;
    let initialTimer: number | null = null;

    const refreshQuote = async () => {
      if (!active) return;
      setIsQuoteLoading(true);
      setTradeQuote(null);
      setQuoteError(null);
      try {
        const requestedAtMillis = Date.now();
        const result = await callQuoteStockPrice({ uid: user.uid, stockId: tradeModal.stock!.id });
        if (!active) return;
        const validityMillis = Math.max(0, result.data.expiresAtMillis - result.data.issuedAtMillis);
        const nextQuote: TradeQuote = {
          ...result.data,
          // リクエスト往復時間を全て差し引き、サーバー期限より250ms以上早く失効扱いにする。
          localExpiresAtMillis: requestedAtMillis + validityMillis - 250,
        };
        setTradeQuote(nextQuote);
        const refreshDelay = Math.max(1_000, nextQuote.localExpiresAtMillis - Date.now() - 1_000);
        refreshTimer = window.setTimeout(() => void refreshQuote(), refreshDelay);
      } catch (error) {
        if (!active) return;
        setQuoteError(error instanceof Error ? error.message : "価格を取得できませんでした。");
        refreshTimer = window.setTimeout(() => void refreshQuote(), 1_500);
      } finally {
        if (active) setIsQuoteLoading(false);
      }
    };

    // StrictModeのeffect再実行時に初回Callableが二重送信されないよう、次タスクへ遅延する。
    initialTimer = window.setTimeout(() => void refreshQuote(), 0);
    return () => {
      active = false;
      if (initialTimer !== null) window.clearTimeout(initialTimer);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [isLoading, quoteRevision, tradeModal.isOpen, tradeModal.stock, user]);

  useEffect(() => {
    if (!tradeModal.isOpen) return;
    const interval = window.setInterval(() => setQuoteClockTick(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [tradeModal.isOpen]);

  useEffect(() => {
    // The public info page is shown after a participant is authenticated.
    // Redirecting an unauthenticated browser here would leave Trade without a
    // user record and mask the login screen behind its loading state.
    if (playerSession.status !== "authenticated" || !systemSettings || hasCheckedInfoRedirectRef.current) return;
    hasCheckedInfoRedirectRef.current = true;
    const showInfoPageOnLogin = systemSettings.showInfoPageOnLogin !== false;
    if (showInfoPageOnLogin) {
      setActiveTab("help");
      navigate("/?tab=help", { replace: true });
    }
  }, [systemSettings, playerSession.status, navigate]);

  useEffect(() => {
    if (searchParams.has("userID")) {
      const idInUrl = searchParams.get("userID");
      if (idInUrl) {
        localStorage.setItem(STORAGE_KEYS.USER_ID, idInUrl);
        searchParams.delete("userID");
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  // 保存IDだけで画面を表示せず、Firebase Authの復元完了後にのみ利用を許可する。
  useEffect(() => {
    if (playerSession.status === "missing") {
      navigate("/login");
      return;
    }
    if (playerSession.status === "error") {
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      navigate("/login", { replace: true });
    }
  }, [playerSession.status, navigate]);

  // A browser can retain an Auth session from a previous local dataset while
  // the new Emulator has no matching users/{uid} document. Do not leave the
  // trading screen in a permanent loading state in that case.
  useEffect(() => {
    if (playerSession.status !== "authenticated" || user) return;
    const timer = window.setTimeout(() => {
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      void auth.signOut().catch(() => undefined);
      navigate("/login", { replace: true });
    }, AUTHENTICATED_USER_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [navigate, playerSession.status, user]);

  useEffect(() => {
    if (!user || hasRecoveredPendingTradeRef.current) return;
    const pending = readPendingTrade();
    if (!pending || pending.uid !== user.uid) {
      hasRecoveredPendingTradeRef.current = true;
      return;
    }
    hasRecoveredPendingTradeRef.current = true;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void callTradeWithConfirmation(pending).then(async (result) => {
        localStorage.removeItem(STORAGE_KEYS.PENDING_TRADE);
        await alert({
          title: "取引確認完了",
          message: `前回の注文は ${result.data.amount}株・${result.data.price}pt で約定済みです。`,
          variant: "success",
        });
      }).catch(async (error) => {
        if (!isUncertainTradeError(error)) localStorage.removeItem(STORAGE_KEYS.PENDING_TRADE);
        else hasRecoveredPendingTradeRef.current = false;
        await alert({
          title: "取引結果を確認できません",
          message: error instanceof Error ? error.message : "取引履歴を確認してください。",
          variant: "warning",
        });
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alert, pendingRecoveryRevision, user]);

  // ニックネームセットアップ要否チェック
  useEffect(() => {
    // 利益確定後も、コースにかかわらずスマホから取引を続けられるようにする。
    // isFinished は利益確定済みの記録として保持し、ここでは書き換えない。
    if (user) {
      setTimeout(() => {
        if (needsNicknameSetup(user.nickname, user.shortId)) {
          setSetupNickname(user.shortId.slice(-4));
          setNeedsInitialSetup(true);
        } else {
          setNeedsInitialSetup(false);
          setNewNickname(user.nickname.split("(")[0]);
        }
      }, 0);
    }
  }, [user, navigate]);

  // --- Actions ---

  const openTradeModal = useCallback((stock: Stock, type: "BUY" | "SELL") => {
    initAudioContext();
    setTradeModal({ isOpen: true, stock, type });
    setTradeAmount(0);
    setTradeQuote(null);
    setQuoteError(null);
  }, [initAudioContext, setTradeAmount]);

  const handleMaxAmount = useCallback(() => {
    if (!user || !tradeModal.stock) return;

    // MAXは確定時の株価・残高でサーバーが数量を決める。端末側の見積もり数量を表示すると
    // 値動きで実際の約定数と食い違うため、送信に必要な有効なダミー値だけを保持する。
    setTradeAmountState("1");
    setIsMaxAmount(true);
  }, [user, tradeModal]);

  const uuidv4 = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  const executeTrade = useCallback(async () => {
    if (!user || !tradeModal.stock || !tradeModal.type) return;
    if (!isPositiveIntegerInput(tradeAmount)) {
      await alert({ title: "エラー", message: APP_ERRORS.INVALID_AMOUNT, variant: "danger" });
      return;
    }
    const amount = toExactString(tradeAmount);

    if (!tradeQuote || tradeQuote.localExpiresAtMillis <= Date.now()) {
      setQuoteRevision((value) => value + 1);
      await alert({ title: "価格を更新しています", message: "新しい約定価格を確認してから、もう一度注文してください。", variant: "warning" });
      return;
    }

    if (readPendingTrade()) {
      await alert({ title: "約定確認中", message: "前回の注文結果を確認しているため、新しい注文はまだ送信できません。再読み込み後に履歴をご確認ください。", variant: "warning" });
      return;
    }

    setIsLoading(true);
    try {
      const idempotencyKey = uuidv4();
      const request: TradeStockRequest = {
        uid: user.uid,
        stockId: tradeModal.stock.id,
        type: tradeModal.type,
        amount,
        idempotencyKey,
        quoteId: tradeQuote.quoteId,
        maxMode: isMaxAmount // MAX選択時はサーバー側で約定価格を使い全額/全株を確定する
      };
      localStorage.setItem(STORAGE_KEYS.PENDING_TRADE, JSON.stringify(request));
      const result = await callTradeWithConfirmation(request);
      localStorage.removeItem(STORAGE_KEYS.PENDING_TRADE);

      if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
      playSound(tradeModal.type === "BUY" ? "STOCK_UP" : "STOCK_DOWN");

      setTradeSuccessFlash(tradeModal.type);
      if (tradeFlashTimerRef.current !== null) window.clearTimeout(tradeFlashTimerRef.current);
      tradeFlashTimerRef.current = window.setTimeout(() => setTradeSuccessFlash(null), STAMP_DURATION_MS);
      setTradeSuccessToast({
        type: tradeModal.type,
        stockName: tradeModal.stock.name,
        amountLabel: `${result.data.amount}株を${result.data.price}ptで${tradeModal.type === "BUY" ? "購入" : "売却"}`
      });
      if (tradeToastTimerRef.current !== null) window.clearTimeout(tradeToastTimerRef.current);
      tradeToastTimerRef.current = window.setTimeout(() => setTradeSuccessToast(null), TOAST_DURATION_MS);
      setExecutedPrice({ stockId: tradeModal.stock.id, price: result.data.price });
      if (executedPriceTimerRef.current !== null) window.clearTimeout(executedPriceTimerRef.current);
      executedPriceTimerRef.current = window.setTimeout(() => setExecutedPrice(null), TOAST_DURATION_MS);

      setTradeModal({ isOpen: false, stock: null, type: null });
      setIsMaxAmount(false);
    } catch (error) {
      if (!isUncertainTradeError(error)) localStorage.removeItem(STORAGE_KEYS.PENDING_TRADE);
      else hasRecoveredPendingTradeRef.current = false;
      const reason = quoteFailureReason(error);
      if (reason?.startsWith("QUOTE_")) {
        setTradeQuote(null);
        setQuoteRevision((value) => value + 1);
        await alert({ title: "価格が更新されました", message: "新しい約定価格を確認してから、もう一度注文してください。", variant: "warning" });
      } else if (error instanceof Error) {
        await alert({ title: "取引失敗", message: error.message, variant: "danger" });
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, tradeModal, tradeAmount, tradeQuote, isMaxAmount, alert, playSound]);

  const displayedStocks = useMemo(() => executedPrice
    ? stocks.map((stock) => stock.id === executedPrice.stockId ? { ...stock, currentPrice: executedPrice.price } : stock)
    : stocks, [executedPrice, stocks]);

  const quoteRemainingMillis = tradeQuote ? Math.max(0, tradeQuote.localExpiresAtMillis - quoteClockTick) : 0;

  const handleLogout = useCallback(async () => {
    const isOk = await confirm({ title: "ログアウト", message: APP_ERRORS.CONFIRM_LOGOUT, variant: "warning" });
    if (isOk) { await auth.signOut(); localStorage.removeItem(STORAGE_KEYS.USER_ID); navigate("/login"); }
  }, [confirm, navigate]);

  const handleUpdateNickname = useCallback(async () => {
    if (!user || !newNickname.trim()) return;
    setIsLoading(true);
    try {
      await callUpdateAgentNickname({ uid: user.uid, newNickname });
      await alert({ title: "完了", message: "ニックネームを変更しました。", variant: "success" });
    } catch {
      await alert({ title: "エラー", message: APP_ERRORS.NICKNAME_UPDATE_FAILED, variant: "danger" });
    } finally { setIsLoading(false); }
  }, [user, newNickname, alert]);

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !setupNickname.trim()) return;
    setIsLoading(true);
    try {
      await callUpdateAgentNickname({ uid: user.uid, newNickname: setupNickname });
      setNeedsInitialSetup(false);
      initAudioContext();
    } catch {
      await alert({ title: "エラー", message: "登録に失敗しました。", variant: "danger" });
    } finally { setIsLoading(false); }
  };

  const handleFinalize = useCallback(async () => {
    const isOk = await confirm({ title: "💰 利益を確定しますか？", message: APP_ERRORS.CONFIRM_FINALIZE, confirmText: "利益を確定する", variant: "warning" });
    if (!isOk) return;
    setIsLoading(true);
    try {
      if (!user) throw new Error("ユーザー情報が見つかりません。");
      await callFinalizeAccount({ uid: user.uid });
    } catch (error) {
      if (error instanceof Error) await alert({ title: "エラー", message: error.message, variant: "danger" });
      setIsLoading(false);
    }
  }, [confirm, user, alert]);

  return {
    user,
    stocks: displayedStocks,
    transactions,
    transactionErrorMessage,
    news,
    ranking,
    totalAgents,
    activeTab,
    setActiveTab,
    isHistoryOpen,
    setIsHistoryOpen,
    isQrModalOpen,
    setIsQrModalOpen,
    newNickname,
    setNewNickname,
    isLoading,
    needsInitialSetup,
    setupNickname,
    setSetupNickname,
    handleInitialSetup,
    flashState,
    toastNews,
    tradeSuccessToast,
    isMarketClosed,
    showEmergencyOverlay,
    showEmergencyResolvedOverlay,
    emergencyConfig,
    tradeSuccessFlash,
    tradeModal,
    setTradeModal,
    tradeAmount,
    setTradeAmount,
    isMaxAmount,
    tradeQuote,
    isQuoteLoading,
    quoteError,
    quoteRemainingMillis,
    openTradeModal,
    handleMaxAmount,
    executeTrade,
    handleLogout,
    handleUpdateNickname,
    handleFinalize
  };
}
