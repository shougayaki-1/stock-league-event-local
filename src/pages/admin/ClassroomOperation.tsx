import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, ScanLine, Settings2, UsersRound } from "lucide-react";
import type { User } from "../../types/domain";
import { useClassroomActions } from "../../hooks/useClassroomActions";
import { formatExact } from "../../lib/exactNumber";
import { extractShortIdFromQr } from "../../lib/utils";
import QRScanner from "../../components/admin/QRScanner";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent } from "../../components/ui/Card";
import { useDialog } from "../../contexts/DialogContext";

const normalizeShortId = (text: string) => extractShortIdFromQr(text);
const SCAN_LOCK_MS = 1600;
const MAX_RECENT_EVENTS = 10;
const RESULT_BANNER_MS = 3000;

type ClassroomEvent = { uid: string; shortId: string; nickname: string; action: string; at: number; status: "SUCCESS" | "SKIP" | "ERROR" };

export default function ClassroomOperation() {
  const [mode, setMode] = useState<"CHECK_IN" | "CHECK_OUT">("CHECK_IN");
  const [manualId, setManualId] = useState("");
  const [lastEvents, setLastEvents] = useState<ClassroomEvent[]>([]);
  const [lastScanEvent, setLastScanEvent] = useState<ClassroomEvent | null>(null);
  const scanLockRef = useRef<Record<string, number>>({});
  const resultTimerRef = useRef<number | null>(null);
  const { alert } = useDialog();

  useEffect(() => () => {
    if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
  }, []);

  const addEvent = (user: Pick<User, "uid" | "shortId" | "nickname">, action: string, status: "SUCCESS" | "SKIP" | "ERROR") => {
    const event = { uid: user.uid, shortId: user.shortId, nickname: user.nickname, action, at: Date.now(), status };
    setLastEvents(prev => [event, ...prev].slice(0, MAX_RECENT_EVENTS));
    setLastScanEvent(event);
    if (resultTimerRef.current !== null) window.clearTimeout(resultTimerRef.current);
    resultTimerRef.current = window.setTimeout(() => setLastScanEvent(null), RESULT_BANNER_MS);
  };

  const { users, activeUsers, settings, saveSettings, findUser, checkIn, checkOut, isProcessing, setIsProcessing } = useClassroomActions({ onEvent: addEvent });

  const handleId = async (rawId: string) => {
    if (isProcessing) return;
    const shortId = normalizeShortId(rawId);
    if (!shortId) return;
    const now = Date.now();
    Object.entries(scanLockRef.current).forEach(([key, at]) => {
      if (at < now - SCAN_LOCK_MS) delete scanLockRef.current[key];
    });
    if ((scanLockRef.current[shortId] || 0) > now - SCAN_LOCK_MS) return;
    scanLockRef.current[shortId] = now;

    setIsProcessing(true);
    try {
      const user = await findUser(shortId);
      if (!user) {
        addEvent({ uid: shortId, shortId, nickname: "未検出" }, mode === "CHECK_IN" ? "入室" : "退出", "ERROR");
        return;
      }
      if (mode === "CHECK_IN") await checkIn(user);
      else await checkOut(user);
      setManualId("");
    } catch (error) {
      console.error(error);
      await alert({ title: "受付エラー", message: error instanceof Error ? error.message : "処理に失敗しました。", variant: "danger" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickCheckout = async (user: User) => {
    setIsProcessing(true);
    try {
      await checkOut(user, "CHECK_OUT");
      await alert({ title: "退出完了", message: `${user.nickname} を退出にしました。`, variant: "success" });
    } catch (error) {
      console.error(error);
      await alert({ title: "退出エラー", message: error instanceof Error ? error.message : "退出処理に失敗しました。", variant: "danger" });
    } finally {
      setIsProcessing(false);
    }
  };

  const getEventStatusClassName = (event: { action: string; status: "SUCCESS" | "SKIP" | "ERROR" }) => {
    if (event.status === "SUCCESS") {
      return event.action.includes("退出")
        ? "bg-info-container text-on-info-container"
        : "bg-success-container text-on-success-container";
    }
    if (event.status === "SKIP") return "bg-warning-container text-on-warning-container";
    return "bg-error-container text-on-error-container";
  };

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 p-4 pb-28 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-slate-800 dark:text-white"><UsersRound className="text-cyan-500" /> 教室入退室オペレーション</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">教室TVに表示する対象者を受付で管理します。</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black text-slate-400">入室中</p>
            <p className="text-3xl font-black text-cyan-600">{activeUsers.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-black text-slate-400">登録総数</p>
            <p className="text-3xl font-black text-slate-700 dark:text-slate-200">{users.length}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <Card className={`overflow-hidden ${mode === "CHECK_OUT" ? "border-warning/60" : ""}`}>
          <CardContent className="space-y-5 p-5">
            <div className={`rounded-xl px-4 py-4 text-center font-black ${mode === "CHECK_IN" ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-100" : "bg-warning-container text-on-warning-container"}`}>
              <p className="text-xs uppercase tracking-widest opacity-75">現在モード</p>
              <p className="mt-1 text-2xl">{mode === "CHECK_IN" ? "入室受付中" : "退出受付中"}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant={mode === "CHECK_IN" ? "primary" : "outline"} onClick={() => setMode("CHECK_IN")}><LogIn size={18} className="mr-2" /> 入室</Button>
              <Button variant={mode === "CHECK_OUT" ? "primary" : "outline"} onClick={() => setMode("CHECK_OUT")}><LogOut size={18} className="mr-2" /> 退出</Button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500"><ScanLine size={14} /> QR受付</div>
              <QRScanner cameraMode="rear-locked" onScan={handleId} />
            </div>

            {lastScanEvent && (
              <div className={`rounded-xl border p-4 shadow-sm ${getEventStatusClassName(lastScanEvent)}`}>
                <p className="text-xs font-black uppercase tracking-widest opacity-75">直近の受付結果</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-black">{lastScanEvent.nickname}</p>
                    <p className="font-mono text-xs font-bold opacity-80">No.{lastScanEvent.shortId}</p>
                  </div>
                  <span className="shrink-0 text-lg font-black">{lastScanEvent.action}</span>
                </div>
              </div>
            )}

            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void handleId(manualId); }}>
              <Input label="手入力ID" value={manualId} onChange={e => setManualId(e.target.value)} placeholder="例: 0001" />
              <Button className="mt-6 shrink-0" isLoading={isProcessing}>実行</Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-black text-slate-700 dark:text-slate-200"><Settings2 size={18} /> 運用設定</div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <span><span className="block text-sm font-black">退出時に利益確定</span><span className="text-xs font-bold text-slate-500">退出受付と同時に保有株を現金化します。</span></span>
                  <input type="checkbox" className="h-5 w-5 accent-cyan-500" checked={settings.finalizeOnCheckout} onChange={e => saveSettings({ finalizeOnCheckout: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <span><span className="block text-sm font-black">景品交換後に自動退出</span><span className="text-xs font-bold text-slate-500">利益確定成功後、入室中なら退出済みにします。</span></span>
                  <input type="checkbox" className="h-5 w-5 accent-cyan-500" checked={settings.autoCheckoutOnExchange} onChange={e => saveSettings({ autoCheckoutOnExchange: e.target.checked })} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <span><span className="block text-sm font-black">フェーズ終了時に全員退出</span><span className="text-xs font-bold text-slate-500">フェーズ終了ボタンで入室中全員を退出にします。</span></span>
                  <input type="checkbox" className="h-5 w-5 accent-cyan-500" checked={settings.autoCheckoutOnPhaseEnd} onChange={e => saveSettings({ autoCheckoutOnPhaseEnd: e.target.checked })} />
                </label>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">入室中一覧</p>
                <div className="space-y-2 pr-1">
                  {activeUsers.map(user => (
                    <div key={user.uid} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div className="min-w-0"><p className="truncate font-black">{user.nickname}</p><p className="font-mono text-xs font-bold text-slate-500">No.{user.shortId}</p></div>
                      <div className="flex shrink-0 items-center gap-2">
                        <p className="text-right text-sm font-black text-slate-500">{formatExact(user.points)} pt</p>
                        <Button variant="outline" size="sm" disabled={isProcessing} onClick={() => handleQuickCheckout(user)}>
                          <LogOut size={14} className="mr-1" /> 退出
                        </Button>
                      </div>
                    </div>
                  ))}
                  {activeUsers.length === 0 && <p className="py-10 text-center font-black text-slate-400">入室中の参加者はいません。</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">直近の受付</p>
                <div className="space-y-2">
                  {lastEvents.map(event => (
                    <div key={`${event.uid}-${event.at}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                      <div><p className="font-black">{event.nickname}</p><p className="font-mono text-xs font-bold text-slate-500">No.{event.shortId}</p></div>
                      <span className={`rounded-md px-3 py-1 text-xs font-black ${getEventStatusClassName(event)}`}>{event.action}</span>
                    </div>
                  ))}
                  {lastEvents.length === 0 && <p className="py-10 text-center font-black text-slate-400">まだ受付履歴がありません。</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
