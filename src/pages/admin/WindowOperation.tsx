import { useState, useCallback, useRef, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useStocks, usePrizes } from "../../hooks/useFirebase";
import type { User } from "../../types/domain";
import { useWindowActions, type OfflineQueueItem } from "../../hooks/useWindowActions";
import { Store, Gift, UserPlus, RotateCcw, WifiOff, CheckCircle2, Undo2, Zap, AlertTriangle } from "lucide-react";

import ActionTrade from "../../components/admin/window/ActionTrade";
import ActionExchange from "../../components/admin/window/ActionExchange";
import ActionReception from "../../components/admin/window/ActionReception";
import SearchBar from "../../components/admin/window/SearchBar";
import SearchResultList from "../../components/admin/window/SearchResultList";
import UserDetailCard from "../../components/admin/window/UserDetailCard";
import QRScanner from "../../components/admin/QRScanner"; // インポートを追加

import { Card, CardContent } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useDialog } from "../../contexts/DialogContext";
import { APP_ERRORS } from "../../lib/errors";
import { extractShortIdFromQr } from "../../lib/utils";
import { STORAGE_KEYS } from "../../lib/storageKeys";

interface Props {
  mode: "trade" | "exchange" | "reception";
}

const RECEPTION_SCAN_DEBOUNCE_MS = 1800;
const MAX_RECEPTION_HISTORY = 8;

const readOfflineQueue = (): OfflineQueueItem[] => {
  const saved = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed as OfflineQueueItem[] : [];
  } catch {
    return [];
  }
};

const playReceptionFeedback = (status: "SUCCESS" | "DUPLICATE" | "ERROR") => {
  if (typeof window === "undefined") return;
  if ("vibrate" in navigator) navigator.vibrate(status === "ERROR" ? 180 : 100);
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = status === "SUCCESS" ? 880 : status === "DUPLICATE" ? 520 : 220;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
  oscillator.addEventListener("ended", () => void context.close());
};

export default function WindowOperation({ mode }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [suggestText, setSuggestText] = useState("");

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(mode === "reception");

  const stocks = useStocks();
  const prizes = usePrizes();
  const { alert, confirm } = useDialog();
  const { executeTrade, undoTrade, syncOfflineQueue, quickUpgradeToInsider, undoReceptionUpgrade } = useWindowActions();

  const inputRef = useRef<HTMLInputElement>(null);
  const [showMemo, setShowMemo] = useState(false);

  const [lastTrade, setLastTrade] = useState<{ uid: string, txId: string, desc: string } | null>(null);
  const [receptionHistory, setReceptionHistory] = useState<Array<{
    uid: string;
    shortId: string;
    nickname: string;
    previousCourse: string;
    status: "SUCCESS" | "DUPLICATE" | "UNDONE" | "ERROR";
    at: number;
  }>>([]);
  const lastReceptionScanRef = useRef<Record<string, number>>({});

  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEYS.OFFLINE_MODE) === "true";
  });

  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(() => readOfflineQueue());
  const [syncProgress, setSyncProgress] = useState<string>("");

  const loadOfflineQueue = useCallback(() => {
    setOfflineQueue(readOfflineQueue());
  }, []);

  useEffect(() => {
    const interval = setInterval(loadOfflineQueue, 1000);
    return () => clearInterval(interval);
  }, [loadOfflineQueue]);

  const toggleOfflineMode = async () => {
    const nextVal = !isOffline;
    const ok = await confirm({
      title: nextVal ? "オフラインモードに切り替えますか？" : "オンラインモードに戻しますか？",
      message: nextVal
        ? "取引や交換を端末内のキューに保存します。通信復帰後は一括同期が必要です。"
        : "通常のクラウド通信に戻します。未同期キューがある場合は一括同期してください。",
      confirmText: nextVal ? "オフラインにする" : "オンラインに戻す",
      variant: nextVal ? "warning" : "info"
    });
    if (!ok) return;
    setIsOffline(nextVal);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_MODE, nextVal ? "true" : "false");
    alert({
      title: nextVal ? "オフラインモード有効" : "オンラインモード復帰",
      message: nextVal
        ? "ネットワーク接続が切断されても、取引や交換を受付してキューに保存できるようになりました。"
        : "標準の通信モードに戻りました。キューが残っている場合は一括同期を実行してください。",
      variant: nextVal ? "warning" : "success"
    });
  };

  const handleSync = async () => {
    setLoading(true);
    setSyncProgress("同期を開始します...");
    try {
      await syncOfflineQueue((progressStr) => {
        setSyncProgress(progressStr);
      });
      loadOfflineQueue();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncProgress("");
      setLoading(false);
    }
  };

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const refreshAllUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "users"));
      setAllUsers(snap.docs.map(d => ({ ...(d.data() as User), uid: d.id })));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAllUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAllUsers]);

  const [offlineMemo, setOfflineMemo] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.OFFLINE_MEMO);
    return saved ? JSON.parse(saved) : [];
  });

  const addOfflineMemo = (id: string) => {
    if (!id) return;
    const newMemo = [id, ...offlineMemo];
    setOfflineMemo(newMemo);
    localStorage.setItem(STORAGE_KEYS.OFFLINE_MEMO, JSON.stringify(newMemo));
    setSearchInput("");
    setSuggestText("");
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);

    if (mode !== "trade" || !val.trim()) {
      setSuggestText("");
      return;
    }

    const parts = val.split(" ");
    const currentWord = parts[parts.length - 1];
    if (!currentWord) {
      setSuggestText("");
      return;
    }

    let match = "";
    if (parts.length === 1) {
      const u = allUsers.find(u => u.shortId.startsWith(currentWord));
      if (u) match = u.shortId;
    } else if (parts.length === 2) {
      const s = stocks.find(s => s.name.startsWith(currentWord) || s.id.startsWith(currentWord));
      if (s) match = s.id;
    } else if (parts.length === 3) {
      if ("BUY".startsWith(currentWord.toUpperCase())) match = "BUY";
      else if ("SELL".startsWith(currentWord.toUpperCase())) match = "SELL";
    }

    if (match && match !== currentWord) {
      const suggestion = val + match.slice(currentWord.length);
      setSuggestText(suggestion);
    } else {
      setSuggestText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && suggestText) {
      e.preventDefault();
      setSearchInput(suggestText + " ");
      setSuggestText("");
    }
  };

  const executeSearch = useCallback(async (rawId: string) => {
    setLoading(true); setSelectedUser(null); setSearchResults([]);
    const id = extractShortIdFromQr(rawId);
    if (!id) {
      setLoading(false);
      await alert({ title: "エラー", message: APP_ERRORS.USER_NOT_FOUND_ID, variant: "warning" });
      return;
    }

    try {
      if (isOffline) {
        const matchUsers = allUsers.filter(u => u.shortId === id);
        if (matchUsers.length > 0) {
          if (matchUsers.length === 1) {
            setSelectedUser(matchUsers[0]);
            setSearchInput("");
            setSuggestText("");
            inputRef.current?.focus();
          } else {
            setSearchResults(matchUsers);
          }
        } else {
          await alert({ title: "エラー", message: "（オフライン）ユーザーが見つかりません。", variant: "warning" });
          setSearchInput("");
          setSuggestText("");
          inputRef.current?.focus();
        }
        return;
      }

      const q = query(collection(db, "users"), where("shortId", "==", id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        if (snap.docs.length === 1) {
          setSelectedUser({ ...(snap.docs[0].data() as User), uid: snap.docs[0].id });
          setSearchInput("");
          setSuggestText("");
          inputRef.current?.focus();
        } else {
          setSearchResults(snap.docs.map(d => ({ ...(d.data() as User), uid: d.id })));
        }
      } else {
        await alert({ title: "エラー", message: APP_ERRORS.USER_NOT_FOUND_ID, variant: "warning" });
        setSearchInput("");
        setSuggestText("");
        inputRef.current?.focus();
      }
    } catch {
      await alert({ title: "通信エラー", message: APP_ERRORS.NETWORK_OFFLINE, variant: "danger" });
    } finally {
      setLoading(false);
    }
  }, [alert, isOffline, allUsers]);

  const handleFastReceptionScan = useCallback(async (fullId: string) => {
    const id = extractShortIdFromQr(fullId);
    if (!id) return;
    const now = Date.now();
    Object.entries(lastReceptionScanRef.current).forEach(([key, at]) => {
      if (at < now - RECEPTION_SCAN_DEBOUNCE_MS * 5) delete lastReceptionScanRef.current[key];
    });
    if ((lastReceptionScanRef.current[id] ?? 0) > now - RECEPTION_SCAN_DEBOUNCE_MS) {
      playReceptionFeedback("DUPLICATE");
      return;
    }
    lastReceptionScanRef.current[id] = now;

    setLoading(true);
    try {
      let user: User | undefined = allUsers.find(u => u.shortId === id);
      if (!user && !isOffline) {
        const q = query(collection(db, "users"), where("shortId", "==", id));
        const snap = await getDocs(q);
        if (!snap.empty) user = { ...(snap.docs[0].data() as User), uid: snap.docs[0].id };
      }

      if (!user) {
        setReceptionHistory(prev => [{ uid: id, shortId: id, nickname: "未検出", previousCourse: "TRADER", status: "ERROR" as const, at: now }, ...prev].slice(0, MAX_RECEPTION_HISTORY));
        await alert({ title: "受付エラー", message: APP_ERRORS.RECEPTION_USER_NOT_FOUND, variant: "warning" });
        return;
      }

      if (user.courseType === "INSIDER") {
        setReceptionHistory(prev => [{ uid: user.uid, shortId: user.shortId, nickname: user.nickname, previousCourse: "INSIDER", status: "DUPLICATE" as const, at: now }, ...prev].slice(0, MAX_RECEPTION_HISTORY));
        playReceptionFeedback("DUPLICATE");
        await alert({ title: "受付済み", message: `${user.nickname} は既にINSIDERです。`, variant: "info" });
        setSearchInput("");
        inputRef.current?.focus();
        return;
      }

      const result = await quickUpgradeToInsider(user.uid);
      await refreshAllUsers();
      if (!result.success) {
        playReceptionFeedback("ERROR");
        await alert({ title: "受付失敗", message: result.errorMessage || APP_ERRORS.RECEPTION_UPGRADE_FAILED, variant: "danger" });
      } else {
        playReceptionFeedback(result.alreadyInsider ? "DUPLICATE" : "SUCCESS");
      }
      setReceptionHistory(prev => [{
        uid: user!.uid,
        shortId: user!.shortId,
        nickname: user!.nickname,
        previousCourse: result.previousCourse || user!.courseType || "TRADER",
        status: result.success ? (result.alreadyInsider ? "DUPLICATE" as const : "SUCCESS" as const) : "ERROR" as const,
        at: now
      }, ...prev].slice(0, MAX_RECEPTION_HISTORY));
      setSearchInput("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }, [alert, allUsers, isOffline, quickUpgradeToInsider, refreshAllUsers]);

  const handleReceptionUndo = async (item: { uid: string; nickname?: string; previousCourse: string }) => {
    const okToUndo = await confirm({
      title: "受付を元に戻しますか？",
      message: `${item.nickname || "対象ユーザー"} さんを ${item.previousCourse || "TRADER"} に戻します。`,
      confirmText: "元に戻す",
      variant: "warning"
    });
    if (!okToUndo) return;
    const ok = await undoReceptionUpgrade(item.uid, item.previousCourse);
    if (ok) {
      setReceptionHistory(prev => prev.map(entry => entry.uid === item.uid && entry.status === "SUCCESS" ? { ...entry, status: "UNDONE" } : entry));
    }
  };

  const executeCommandOrSearch = async (input: string) => {
    const parts = input.trim().split(/\s+/);

    if (parts.length === 4 && mode === "trade") {
      setLoading(true);
      try {
        const [rawShortId, stockQuery, actionStr, amountStr] = parts;
        const amount = parseInt(amountStr, 10);
        const shortId = extractShortIdFromQr(rawShortId);
        if (!shortId) {
          await alert({ title: "エラー", message: APP_ERRORS.USER_NOT_FOUND, variant: "warning" });
          return;
        }

        let user: User | undefined = undefined;
        if (isOffline) {
          user = allUsers.find(u => u.shortId === shortId);
        } else {
          const q = query(collection(db, "users"), where("shortId", "==", shortId));
          const snap = await getDocs(q);
          if (!snap.empty) {
            user = snap.docs[0].data() as User;
          }
        }

        if (!user) {
          await alert({ title: "エラー", message: APP_ERRORS.USER_NOT_FOUND, variant: "warning" });
          return;
        }

        const stock = stocks.find(s => s.id === stockQuery || s.name === stockQuery);
        if (!stock) {
          await alert({ title: "エラー", message: APP_ERRORS.STOCK_NOT_FOUND, variant: "warning" });
          return;
        }

        let type: "BUY" | "SELL" | null = null;
        if (["BUY", "buy", "買", "買い"].includes(actionStr)) type = "BUY";
        if (["SELL", "sell", "売", "売り"].includes(actionStr)) type = "SELL";

        if (!type || isNaN(amount) || amount <= 0) {
          await alert({ title: "エラー", message: APP_ERRORS.INVALID_ACTION, variant: "warning" });
          return;
        }

        const { success, transactionId, warningMsg } = await executeTrade(user.uid, stock.id, type, amount);

        if (success && transactionId) {
          const actionText = type === "BUY" ? "購入" : "売却";
          const desc = `${user.nickname} が ${stock.name} を ${amount}株 ${actionText}`;

          setLastTrade({ uid: user.uid, txId: transactionId, desc });
          setSearchInput("");
          setSuggestText("");
          inputRef.current?.focus();

          await alert({
            title: isOffline ? "オフライン登録完了" : "約定完了",
            message: `${isOffline ? `[オフライン保存] ${desc} をキューに登録しました！` : `${desc} しました！`}${warningMsg ? `\n※ ${warningMsg}` : ""}`,
            variant: "success"
          });
        }
      } catch (error) {
        if (error instanceof Error) {
          await alert({ title: "取引失敗", message: error.message, variant: "danger" });
        }
      } finally {
        setLoading(false);
      }
    } else {
      executeSearch(input);
    }
  };

  const handleUndo = async () => {
    if (!lastTrade) return;
    const isOk = await confirm({
      title: "操作の取消 (Undo)",
      message: `${APP_ERRORS.CONFIRM_UNDO}\n\n「${lastTrade.desc}」`,
      variant: "warning"
    });
    if (!isOk) return;

    const success = await undoTrade(lastTrade.uid, lastTrade.txId);
    if (success) {
      await alert({ title: "取消完了", message: APP_ERRORS.UNDO_SUCCESS, variant: "success" });
      setLastTrade(null);
      if (selectedUser && selectedUser.uid === lastTrade.uid) {
        executeSearch(selectedUser.shortId);
      }
    }
  };

  const selectUserFromResult = (user: User) => {
    setSelectedUser(user);
    setSearchResults([]);
    setSearchInput("");
    inputRef.current?.focus();
  };

  const cancelSelection = () => {
    setSearchResults([]);
    setSearchInput("");
    inputRef.current?.focus();
  };

  const clearSelectedCustomer = () => {
    setSelectedUser(null);
    setSearchResults([]);
    setSearchInput("");
    setSuggestText("");
    inputRef.current?.focus();
  };

  const handleActionSuccess = () => {
    if (selectedUser) executeSearch(selectedUser.shortId);
  };

  const clearMemo = async () => {
    const isOk = await confirm("メモを本当にクリアしますか？");
    if (isOk) {
      setOfflineMemo([]);
      localStorage.removeItem(STORAGE_KEYS.OFFLINE_MEMO);
    }
  };

  const theme = {
    trade: { title: "証券窓口 (代理売買)", icon: <Store />, colorClass: "text-blue-600 dark:text-blue-400" },
    exchange: { title: "景品交換窓口 (利益確定)", icon: <Gift />, colorClass: "text-amber-500" },
    reception: { title: "謎解き受付 (コース変更)", icon: <UserPlus />, colorClass: "text-pink-600 dark:text-pink-400" }
  }[mode];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto w-full">
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-100 dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800">
        <div>
          <h2 className={`text-xl md:text-2xl font-black flex items-center gap-2 ${theme.colorClass}`}>
            {theme.icon} {theme.title}
          </h2>
          <p className="text-slate-500 text-xs md:text-sm mt-1">ID手入力 または QRスキャンでエージェントを検索してください。</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={isOffline ? "outline" : "secondary"}
            size="sm"
            onClick={toggleOfflineMode}
            className={`font-black flex items-center gap-2 transition-all ${isOffline ? "animate-pulse border-amber-500 text-amber-500 hover:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : ""}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${isOffline ? "bg-amber-500" : "bg-emerald-500"}`}></div>
            {isOffline ? "オフラインモード稼働中" : "オンラインモード"}
          </Button>
          {lastTrade && (
            <Button variant="danger" size="sm" onClick={handleUndo} className="animate-in slide-in-from-top-4">
              <RotateCcw size={14} className="mr-1" /> 取消(Undo)
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <SearchBar
            mode={mode}
            searchInput={searchInput}
            suggestText={suggestText}
            loading={loading}
            isScanning={isScanning}
            showMemo={showMemo}
            setIsScanning={setIsScanning}
            setShowMemo={setShowMemo}
            handleInputChange={handleInputChange}
            handleKeyDown={handleKeyDown}
            executeCommandOrSearch={executeCommandOrSearch}
            addOfflineMemo={addOfflineMemo}
            inputRef={inputRef}
          />

          {/* ★並列化リファクタリング: QRScannerとMemoUIをSearchBar内部から外出しし、親側で配置制御 */}
          {isScanning && (
            <div className="mt-6 p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50 animate-in fade-in duration-200">
              <QRScanner
                cameraMode={mode === "trade" || mode === "reception" ? "rear-locked" : "selectable"}
                onScan={(fullId) => {
                  if (mode === "reception") {
                    handleFastReceptionScan(fullId);
                  } else {
                    executeCommandOrSearch(fullId);
                    setIsScanning(false);
                  }
                }}
              />
            </div>
          )}

          {mode === "reception" && (
            <div className="mt-6 rounded-2xl border border-pink-200 dark:border-pink-900/50 bg-pink-50/60 dark:bg-pink-950/20 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="font-black text-pink-700 dark:text-pink-300 flex items-center gap-2"><Zap size={16} /> 高速受付ログ</h3>
                <span className="text-[10px] font-black text-pink-500">QRを読むと即INSIDER化</span>
              </div>
              <div className="space-y-2">
                {receptionHistory.length === 0 && <p className="text-xs font-bold text-pink-400">まだ受付履歴はありません。</p>}
                {receptionHistory.map((item) => (
                  <div key={`${item.uid}-${item.at}`} className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-900 border border-pink-100 dark:border-pink-900/40 px-3 py-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <CheckCircle2 size={16} className={item.status === "ERROR" ? "text-red-500" : item.status === "UNDONE" ? "text-slate-400" : "text-emerald-500"} />
                      <div className="min-w-0">
                        <p className="font-black text-sm text-slate-700 dark:text-slate-200 truncate">{item.nickname || item.shortId}</p>
                        <p className="text-xs font-mono text-slate-400">{item.shortId} / {item.status === "SUCCESS" ? APP_ERRORS.RECEPTION_STATUS_SUCCESS : item.status === "DUPLICATE" ? APP_ERRORS.RECEPTION_STATUS_DUPLICATE : item.status === "UNDONE" ? APP_ERRORS.RECEPTION_STATUS_UNDONE : APP_ERRORS.RECEPTION_STATUS_ERROR}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" disabled={item.status !== "SUCCESS"} onClick={() => handleReceptionUndo(item)} className="shrink-0">
                      <Undo2 size={13} className="mr-1" /> Undo
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showMemo && (
            <div className="mt-6 bg-slate-800 dark:bg-slate-950 text-white p-4 rounded-xl animate-in fade-in duration-200">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold flex items-center gap-2"><WifiOff size={16} /> ネット切断時 受付メモ</h3>
                <button onClick={clearMemo} className="text-xs text-red-400 hover:text-red-300 transition">クリア</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {offlineMemo.map((id, i) => <span key={i} className="bg-slate-700 px-3 py-1 rounded font-mono text-sm">{id}</span>)}
                {offlineMemo.length === 0 && <span className="text-slate-500 text-sm">メモはありません</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SearchResultList searchResults={searchResults} cancelSelection={cancelSelection} selectUserFromResult={selectUserFromResult} />

      {mode === "exchange" && prizes.isFallback && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm font-black">景品設定が未登録のためデフォルト値を使用中です。</p>
          </div>
        </div>
      )}

      {selectedUser && (
        <UserDetailCard user={selectedUser} themeColorClass={theme.colorClass}>
          {mode === "trade" && <ActionTrade user={selectedUser} stocks={stocks} onSuccess={handleActionSuccess} />}
          {mode === "exchange" && <ActionExchange user={selectedUser} prizes={prizes.grades} onSuccess={handleActionSuccess} onNextCustomer={clearSelectedCustomer} />}
          {mode === "reception" && <ActionReception user={selectedUser} onSuccess={handleActionSuccess} />}
        </UserDetailCard>
      )}

      {offlineQueue.length > 0 && (
        <Card className="mt-8 border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-amber-500 flex items-center gap-2">
                ⚠️ 未同期のオフラインキュー ({offlineQueue.length}件)
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={loading}
                className="border-amber-500 text-amber-500 hover:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.4)]"
              >
                {loading ? "同期中..." : "クラウドへ一括同期"}
              </Button>
            </div>
            {syncProgress && (
              <p className="text-xs font-bold text-amber-400 animate-pulse mb-3">{syncProgress}</p>
            )}
            <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-900/40">
              {offlineQueue.map((item) => (
                <div key={item.id} className="flex justify-between items-center text-xs p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      [{item.shortId}] {item.nickname}
                    </span>
                    <span className="mx-2 text-slate-400">|</span>
                    <span className="text-slate-500">
                      {item.type === "TRADE"
                        ? `${item.payload.type === "BUY" ? "購入" : "売却"}: ${item.payload.stockId} x ${item.payload.amount}株`
                        : item.type === "EXCHANGE" ? "利益確定" : "コース変更"}
                    </span>
                    {item.status === "FAILED" && item.error && (
                      <p className="text-red-400 mt-1 font-mono">エラー: {item.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${item.status === "FAILED" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {item.status === "FAILED" ? "失敗 (再試行待ち)" : "待機中"}
                    </span>
                    <button
                      onClick={() => {
                        const nextQueue = offlineQueue.filter(q => q.id !== item.id);
                        localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(nextQueue));
                        loadOfflineQueue();
                      }}
                      className="text-red-400 hover:text-red-300 font-bold ml-2"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
