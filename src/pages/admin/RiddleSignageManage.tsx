// src/pages/admin/RiddleSignageManage.tsx

import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getEstimatedServerTimeMillis, useServerClock } from "../../lib/serverTime";
import { useRiddleActions, type RiddleRoom, type RiddleStep } from "../../hooks/useRiddleActions";
import { Key, Plus, Trash2, Play, ExternalLink, RotateCcw, ChevronRight, Monitor, ListTodo, Timer, Loader2, Pause, Clapperboard, ScreenShare, Sun, Moon } from "lucide-react";
import UnsavedBar from "../../components/admin/UnsavedBar";
import RiddleTvUrlModal from "../../components/admin/riddle/RiddleTvUrlModal";

import Button from "../../components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Badge from "../../components/ui/Badge";
import SegmentedControl from "../../components/ui/SegmentedControl";
import { useDialog } from "../../contexts/DialogContext";
import { DEFAULT_ROOM_DURATION_SECONDS, DEFAULT_SIGNAGE_THEME, DEFAULT_TV_ROLES, RIDDLE_ACTION_LOCK_MS, TV_ROLE_PATTERN, parseSignageTheme, type SignageTheme } from "../../lib/riddleConstants";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { formatRiddleDuration, RIDDLE_TRANSITION_LABELS } from "../../lib/riddlePresentation";

type PendingRoomAction = "start" | "next" | "reset" | "timer";

export default function RiddleSignageManage() {
  const [rooms, setRooms] = useState<RiddleRoom[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMin, setNewMin] = useState(10);
  const [newSec, setNewSec] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // 選択された部屋ID
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState("");

  // TV用アクセスURLリンク表示ポップアップ
  const [urlModalRoom, setUrlModalRoom] = useState<RiddleRoom | null>(null);

  // 編集用のローカルステート
  const [editingSteps, setEditingSteps] = useState<RiddleStep[]>([]);
  const [editingTvRoles, setEditingTvRoles] = useState<string[]>([]);
  const [isSavingSteps, setIsSavingSteps] = useState(false);
  const [pendingRoomActions, setPendingRoomActions] = useState<Record<string, PendingRoomAction>>({});
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [, setClockTick] = useState(0);
  const editingStepsRef = useRef(editingSteps);
  const editingTvRolesRef = useRef(editingTvRoles);
  const selectedRoomIdRef = useRef(selectedRoomId);

  const { addRoom, deleteRoom, isValidTvRole, proceedToNextStepSecure } = useRiddleActions();
  const { alert, confirm } = useDialog();
  const { getServerNowMillis } = useServerClock();

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockTick(tick => tick + 1), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => { editingStepsRef.current = editingSteps; }, [editingSteps]);
  useEffect(() => { editingTvRolesRef.current = editingTvRoles; }, [editingTvRoles]);

  const runRoomAction = async (roomId: string, action: PendingRoomAction, task: () => Promise<void>) => {
    if (pendingRoomActions[roomId]) return;
    setPendingRoomActions(prev => ({ ...prev, [roomId]: action }));
    try {
      await task();
    } finally {
      window.setTimeout(() => {
        setPendingRoomActions(prev => {
          const next = { ...prev };
          delete next[roomId];
          return next;
        });
      }, RIDDLE_ACTION_LOCK_MS);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "riddle_rooms"), (snap) => {
      setRooms(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "",
          phase: data.phase || "STANDBY",
          duration: data.duration || DEFAULT_ROOM_DURATION_SECONDS,
          currentStepIndex: data.currentStepIndex || 0,
          timerEndTime: data.timerEndTime || null,
          timerRemainingAtPause: data.timerRemainingAtPause ?? null,
          timerState: data.timerState || "STOPPED",
          theme: parseSignageTheme(data.theme),
          tvRoles: data.tvRoles || [...DEFAULT_TV_ROLES],
          steps: data.steps || []
        } as RiddleRoom;
      }));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_LIBRARY_COLLECTION), (snap) => {
      setVideoLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoLibraryItem)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const switchedRoom = selectedRoomIdRef.current !== selectedRoomId;
    selectedRoomIdRef.current = selectedRoomId;

    if (selectedRoomId) {
      const target = rooms.find(r => r.id === selectedRoomId);
      if (target) {
        const stepsCopy = JSON.parse(JSON.stringify(target.steps || []));
        const rolesCopy = [...(target.tvRoles || [])];
        const hasLocalChanges =
          JSON.stringify(editingStepsRef.current) !== JSON.stringify(target.steps || []) ||
          JSON.stringify(editingTvRolesRef.current) !== JSON.stringify(target.tvRoles || []);

        if (switchedRoom || !hasLocalChanges) {
          timer = window.setTimeout(() => {
            setEditingSteps(stepsCopy);
            setEditingTvRoles(rolesCopy);
          }, 0);
        }
      }
    } else {
      timer = window.setTimeout(() => {
        setEditingSteps([]);
        setEditingTvRoles([]);
      }, 0);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [selectedRoomId, rooms]);

  const copyUrl = async (url: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleReset = () => {
    if (selectedRoomId) {
      const target = rooms.find(r => r.id === selectedRoomId);
      if (target) {
        setEditingSteps(JSON.parse(JSON.stringify(target.steps || [])));
        setEditingTvRoles([...(target.tvRoles || [])]);
      }
    }
  };

  const handleSaveSteps = async () => {
    if (!selectedRoomId) return;
    const selectedRoom = rooms.find(r => r.id === selectedRoomId);
    const validationErrors: string[] = [];
    if (editingTvRoles.length === 0) validationErrors.push("TV役割を1つ以上登録してください。");
    editingTvRoles.forEach(role => {
      if (!isValidTvRole(role)) validationErrors.push(`TV役割「${role}」は半角英数字・ハイフン・アンダースコアのみ使用できます。`);
    });
    editingSteps.forEach((step, index) => {
      const label = `STEP ${index + 1}`;
      if (!step.name.trim()) validationErrors.push(`${label}: ステップ名を入力してください。`);
      if (step.autoTransitionType === "TIME_ELAPSED" && (!Number.isFinite(step.durationSeconds) || (step.durationSeconds ?? 0) <= 0)) {
        validationErrors.push(`${label}: 遅延時間は1秒以上で入力してください。`);
      }
      if (step.autoTransitionType === "VIDEO_END" && !step.triggerTvRole) {
        validationErrors.push(`${label}: 動画終了を検知するTVを選択してください。`);
      }
      Object.entries(step.tvActions || {}).forEach(([roleName, action]) => {
        if (action.mode === "VIDEO" && !action.videoAssetId) {
          validationErrors.push(`${label}: ${roleName} の動画が未選択です。`);
        }
      });
      const audibleVideoRoles = Object.entries(step.tvActions || {})
        .filter(([, action]) => action.mode === "VIDEO" && action.audioEnabled !== false)
        .map(([roleName]) => roleName);
      if (audibleVideoRoles.length > 1) {
        validationErrors.push(`${label}: 音声を出すTVは1台だけ選択してください（現在: ${audibleVideoRoles.join("、")}）。`);
      }
    });
    if (validationErrors.length > 0) {
      await alert({ title: "保存できません", message: validationErrors.join("\n"), variant: "warning" });
      return;
    }
    if (selectedRoom?.phase === "RUNNING") {
      const ok = await confirm({ title: "進行中の構成変更", message: "この部屋は進行中です。ステップ構成を保存すると現在の進行位置と表示内容が変わる可能性があります。保存しますか？", variant: "warning" });
      if (!ok) return;
    }
    setIsSavingSteps(true);
    try {
      await updateDoc(doc(db, "riddle_rooms", selectedRoomId), {
        steps: editingSteps,
        tvRoles: editingTvRoles
      });
      await alert({ title: "保存完了", message: "ステップ構成を更新しました。", variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
    } finally {
      setIsSavingSteps(false);
    }
  };

  const handleAddTvRole = async () => {
    const cleaned = newRoleName.trim().toLowerCase();
    if (!cleaned) return;
    if (!TV_ROLE_PATTERN.test(cleaned)) {
      await alert({ title: "入力エラー", message: "役割名は半角英数字・ハイフン・アンダースコアのみ使用できます。", variant: "warning" });
      return;
    }
    if (editingTvRoles.includes(cleaned)) {
      await alert({ title: "警告", message: "既に存在する役割名です。", variant: "warning" });
      return;
    }
    const updatedRoles = [...editingTvRoles, cleaned];
    const updatedSteps = editingSteps.map(step => ({
      ...step,
      tvActions: {
        ...(step.tvActions || {}),
        [cleaned]: { mode: "STANDBY" as const }
      }
    }));
    setEditingTvRoles(updatedRoles);
    setEditingSteps(updatedSteps);
    setNewRoleName("");
  };

  const handleDeleteTvRole = async (roleName: string) => {
    const isOk = await confirm(`役割「${roleName}」をこのブースから削除しますか？\n（保存ボタンを押すまで反映されません）`);
    if (!isOk) return;

    const updatedRoles = editingTvRoles.filter(r => r !== roleName);
    const updatedSteps = editingSteps.map(step => {
      const nextActions = { ...(step.tvActions || {}) };
      delete nextActions[roleName];
      return { ...step, tvActions: nextActions };
    });
    setEditingTvRoles(updatedRoles);
    setEditingSteps(updatedSteps);
  };

  const handleStartSequence = async (room: RiddleRoom) => {
    await runRoomAction(room.id, "start", async () => {
      const serverNowMillis = await getEstimatedServerTimeMillis();
      const firstStep = room.steps?.[0];
      const hasTimer = firstStep ? Object.values(firstStep.tvActions || {}).some(
        (act) => (act as { mode?: string })?.mode === "TIMER"
      ) : false;
      const seconds = firstStep?.timerDurationSeconds || room.duration || DEFAULT_ROOM_DURATION_SECONDS;

      await updateDoc(doc(db, "riddle_rooms", room.id), {
        phase: "RUNNING",
        currentStepIndex: 0,
        stepStartedAt: Timestamp.fromMillis(serverNowMillis),
        timerState: hasTimer ? "RUNNING" : "STOPPED",
        timerEndTime: hasTimer ? Timestamp.fromMillis(serverNowMillis + seconds * 1000) : null,
        timerRemainingAtPause: null
      });
    }).catch(async () => {
      await alert({ title: "エラー", message: "スタートに失敗しました。", variant: "danger" });
    });
  };

  const handleForceNext = async (room: RiddleRoom) => {
    await runRoomAction(room.id, "next", async () => {
      const ok = await proceedToNextStepSecure(room.id, room.currentStepIndex);
      if (!ok) throw new Error("Step transition failed");
    }).catch(async () => {
      await alert({ title: "エラー", message: "次のステップへの移行に失敗しました。", variant: "danger" });
    });
  };

  const handleResetSequence = async (room: RiddleRoom) => {
    if (room.phase === "RUNNING") {
      const ok = await confirm({ title: "進行中のリセット", message: `${room.name} は進行中です。全TV表示とタイマーを待機状態へ戻しますか？`, variant: "danger" });
      if (!ok) return;
    }
    await runRoomAction(room.id, "reset", async () => {
      const serverNowMillis = await getEstimatedServerTimeMillis();
      await updateDoc(doc(db, "riddle_rooms", room.id), {
        phase: "STANDBY",
        currentStepIndex: 0,
        timerState: "STOPPED",
        timerEndTime: null,
        timerRemainingAtPause: null,
        stepStartedAt: Timestamp.fromMillis(serverNowMillis)
      });
    }).catch(async () => {
      await alert({ title: "エラー", message: "リセットに失敗しました。", variant: "danger" });
    });
  };

  const handleDeleteRoom = async (room: RiddleRoom) => {
    if (room.phase === "RUNNING") {
      const ok = await confirm({ title: "進行中の部屋を削除", message: `${room.name} は進行中です。削除するとTV表示が停止します。続行しますか？`, variant: "danger" });
      if (!ok) return;
    }
    await deleteRoom(room.id);
  };

  const handleToggleTimer = async (room: RiddleRoom) => {
    await runRoomAction(room.id, "timer", async () => {
      const roomRef = doc(db, "riddle_rooms", room.id);
      const serverNowMillis = await getEstimatedServerTimeMillis();
      if (room.timerState === "RUNNING" && room.timerEndTime) {
        const remaining = Math.max(0, Math.floor((room.timerEndTime.toMillis() - serverNowMillis) / 1000));
        await updateDoc(roomRef, {
          timerState: "PAUSED",
          timerRemainingAtPause: remaining
        });
      } else if (room.timerState === "PAUSED" && room.timerRemainingAtPause != null) {
        await updateDoc(roomRef, {
          timerState: "RUNNING",
          timerEndTime: Timestamp.fromMillis(serverNowMillis + room.timerRemainingAtPause * 1000),
          timerRemainingAtPause: null
        });
      }
    }).catch(async () => {
      await alert({ title: "エラー", message: "タイマー操作に失敗しました。", variant: "danger" });
    });
  };

  const handleThemeChange = async (roomId: string, theme: SignageTheme) => {
    try {
      await updateDoc(doc(db, "riddle_rooms", roomId), { theme });
    } catch {
      await alert({ title: "エラー", message: "表示テーマの変更に失敗しました。", variant: "danger" });
    }
  };

  const selectedRoom = rooms.find(r => r.id === selectedRoomId);
  const getTimerRemainingSeconds = (room: RiddleRoom) => {
    if (room.timerState === "PAUSED") return room.timerRemainingAtPause ?? null;
    if (room.timerState !== "RUNNING" || !room.timerEndTime) return null;
    return Math.max(0, Math.floor((room.timerEndTime.toMillis() - getServerNowMillis()) / 1000));
  };
  const hasSelectedRoomChanges = selectedRoom
    ? JSON.stringify(editingSteps) !== JSON.stringify(selectedRoom.steps || []) ||
      JSON.stringify(editingTvRoles) !== JSON.stringify(selectedRoom.tvRoles || [])
    : false;

  return (
    <div className="p-4 md:p-8 max-w-[1700px] mx-auto w-full pb-32">
      <UnsavedBar
        hasChanges={hasSelectedRoomChanges}
        onSave={handleSaveSteps}
        onReset={handleReset}
        isSaving={isSavingSteps}
        message="謎解きエリアの演出構成に保存していない変更があります。"
        saveLabel="構成を保存・適用"
        variant="info"
      />

      {/* ヘッダータイトル ＆ ルーム追加トリガーボタン */}
      <div className="flex justify-between items-end mb-8 border-b border-slate-200 dark:border-slate-855 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Key className="text-purple-500" /> 謎解きエリア管理
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            各ブースのタイマー制限時間や進行ステップの制御を行います。
          </p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={18} className="mr-2" /> 新規ブース追加
        </Button>
      </div>

      {/* 🖥️ TV用アクセスURLリンク表示モーダル */}
      {urlModalRoom && (
        <RiddleTvUrlModal
          room={urlModalRoom}
          copiedUrl={copiedUrl}
          onClose={() => setUrlModalRoom(null)}
          onCopyUrl={copyUrl}
        />
      )}

      {/* 部屋の追加モーダル */}
      {showAddForm && (
        <Card className="mb-8 animate-in slide-in-from-top-4">
          <CardContent className="pt-6 flex flex-wrap md:flex-nowrap gap-4 items-end">
            <Input label="タイマーに表示する部屋名（日本語可）" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: 1年A組 謎解きブース" />
            <Input label="タイマー初期制限時間 (分)" type="number" min="0" value={newMin} onChange={e => setNewMin(Number(e.target.value))} className="w-40 text-center" />
            <Input label="秒" type="number" min="0" max="59" value={newSec} onChange={e => setNewSec(Number(e.target.value))} className="w-20 text-center" />
            <Button className="shrink-0 h-[46px]" onClick={async () => { if (await addRoom(newName, newMin * 60 + newSec)) { setNewName(""); setShowAddForm(false); } }}>追加</Button>
          </CardContent>
        </Card>
      )}

      {/* ブース一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {rooms.map(room => {
          const isRunning = room.phase === "RUNNING";
          const activeStep = room.steps?.[room.currentStepIndex];
          const timerRemainingSeconds = getTimerRemainingSeconds(room);
          const pendingAction = pendingRoomActions[room.id];
          const isRoomPending = !!pendingAction;
          const progressPercent = room.steps?.length
            ? ((room.currentStepIndex + (isRunning ? 1 : 0)) / room.steps.length) * 100
            : 0;
          const pendingText = pendingAction === "start"
            ? "スタートを送信中..."
            : pendingAction === "next"
              ? "次へスキップを送信中..."
              : pendingAction === "reset"
                ? "リセットを送信中..."
                : pendingAction === "timer"
                  ? "タイマー操作を送信中..."
                  : "";
          return (
            <Card key={room.id} className={`flex flex-col border-2 transition-all ${isRunning ? "border-purple-500 shadow-lg" : "border-slate-200 dark:border-slate-800"}`}>
              <CardHeader className="flex flex-row justify-between items-center py-4 bg-slate-50 dark:bg-slate-900/40">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Key size={16} className="text-slate-400" /> {room.name}</CardTitle>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">登録TV: {room.tvRoles?.join(", ")}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-red-500" onClick={() => handleDeleteRoom(room)}><Trash2 size={16} /></Button>
              </CardHeader>
              <CardContent className="p-6 space-y-6 flex-1 flex flex-col justify-between">

                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">進行状況</span>
                    <Badge variant={isRunning ? "success" : "default"}>{isRunning ? "進行中" : "待機中"}</Badge>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                      <span>STEP {Math.min(room.currentStepIndex + 1, room.steps?.length || 1)}</span>
                      <span>{room.steps?.length ? `${room.currentStepIndex + 1} / ${room.steps.length}` : "未設定"}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${Math.min(100, progressPercent)}%` }} />
                    </div>
                    <div className="mt-3 grid gap-1.5">
                      {(room.steps || []).map((step, idx) => (
                        <div key={`${step.name}-${idx}`} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] font-bold ${idx === room.currentStepIndex && isRunning ? "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" : idx < room.currentStepIndex ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                          <span className={`h-2 w-2 rounded-full ${idx === room.currentStepIndex && isRunning ? "bg-purple-500 animate-pulse" : idx < room.currentStepIndex ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`} />
                          <span className="truncate">{idx + 1}. {step.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {isRunning && activeStep ? (
                    <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                      <p className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-1">
                        <ChevronRight size={20} className="text-purple-500" /> {activeStep.name}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
                        <p className="text-[10px] text-slate-400 font-bold">
                          移行条件: <span className="text-purple-600 dark:text-purple-400 font-black">{RIDDLE_TRANSITION_LABELS[activeStep.autoTransitionType]}</span>
                        </p>
                        {activeStep.autoTransitionType === "VIDEO_END" && (
                          <p className="text-[10px] text-slate-400 font-bold">対象TV: <span className="text-slate-700 dark:text-slate-200">{activeStep.triggerTvRole || "未設定"}</span></p>
                        )}
                        {activeStep.autoTransitionType === "TIME_ELAPSED" && (
                          <p className="text-[10px] text-slate-400 font-bold">待ち時間: <span className="text-slate-700 dark:text-slate-200">{formatRiddleDuration(activeStep.durationSeconds)}</span></p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-slate-400 py-2">待機中 (スタートボタンで開始)</p>
                  )}
                  {isRoomPending && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      <Loader2 size={14} className="animate-spin" />
                      {pendingText}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
                  <div>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Mission Timer</p>
                    <div className="flex items-baseline gap-2">
                      <p className="font-mono text-xl font-bold tabular-nums">
                        {timerRemainingSeconds === null
                          ? "--:--"
                          : `${Math.floor(timerRemainingSeconds / 60).toString().padStart(2, "0")}:${(timerRemainingSeconds % 60).toString().padStart(2, "0")}`}
                      </p>
                      <span className="text-[10px] font-bold text-slate-400">
                        {room.timerState === "RUNNING" ? "作動中" : room.timerState === "PAUSED" ? "一時停止" : "停止中"}
                      </span>
                    </div>
                  </div>
                  {room.timerState !== "STOPPED" && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" isLoading={pendingAction === "timer"} disabled={isRoomPending} onClick={() => handleToggleTimer(room)} className="text-xs bg-slate-800 hover:bg-slate-700 text-white">
                        {room.timerState === "RUNNING" ? <><Pause size={14} className="mr-1" />一時停止</> : <><Play size={14} className="mr-1" />再開</>}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">表示テーマ</p>
                  <SegmentedControl<SignageTheme>
                    value={room.theme || DEFAULT_SIGNAGE_THEME}
                    onChange={(theme) => handleThemeChange(room.id, theme)}
                    className="rounded-lg bg-slate-100 p-1 dark:bg-slate-900"
                    buttonClassName="rounded-md py-2 text-xs"
                    items={[
                      {
                        value: "light",
                        label: "ライト",
                        icon: <Sun size={14} />,
                        activeClassName: "bg-white text-amber-600 shadow-sm",
                      },
                      {
                        value: "dark",
                        label: "ダーク",
                        icon: <Moon size={14} />,
                        activeClassName: "bg-slate-900 text-blue-300 shadow-sm dark:bg-slate-800",
                      },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button variant="secondary" className="py-2.5 flex-col gap-1" isLoading={pendingAction === "reset"} disabled={isRoomPending} onClick={() => handleResetSequence(room)}>
                    <RotateCcw size={16} /> <span className="text-[9px]">リセット</span>
                  </Button>

                  {!isRunning ? (
                    <Button variant="primary" className="py-2.5 flex-col gap-1 col-span-2 bg-purple-600 hover:bg-purple-500" isLoading={pendingAction === "start"} disabled={isRoomPending || !room.steps?.length} onClick={() => handleStartSequence(room)}>
                      <Play size={16} /> <span className="text-[9px]">スタート</span>
                    </Button>
                  ) : (
                    <Button variant="outline" className="py-2.5 flex-col gap-1 col-span-2 border-purple-200 text-purple-600 dark:text-purple-400" isLoading={pendingAction === "next"} disabled={isRoomPending} onClick={() => handleForceNext(room)}>
                      <Plus size={16} /> <span className="text-[9px]">次へスキップ (Skip)</span>
                    </Button>
                  )}
                </div>

                <div className="pt-4 flex gap-2">
                  <Button variant="outline" className="w-1/2 text-xs" onClick={() => setSelectedRoomId(selectedRoomId === room.id ? null : room.id)}>
                    <ListTodo size={14} className="mr-1" /> 演出設定を開く
                  </Button>
                  <Button variant="ghost" className="w-1/2 text-xs" onClick={() => setUrlModalRoom(room)}>
                    <ExternalLink size={14} className="mr-1" /> TV用URL一覧
                  </Button>
                </div>

              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 🚀 演出タイムライン・ステップ構成編集エリア (詳細画面) */}
      {selectedRoom && (
        <Card className="animate-in slide-in-from-bottom-6 duration-300">
          <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b flex flex-row justify-between items-center">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><ListTodo /> {selectedRoom.name} - 演出ステップ構成</CardTitle>
              <p className="text-xs text-slate-500 mt-1">TV台数の増減や、ステップごとの動作を詳細にカスタマイズできます。</p>
            </div>
            <button onClick={() => setSelectedRoomId(null)} className="text-slate-400 hover:text-slate-600 font-bold">閉じる</button>
          </CardHeader>
          <CardContent className="p-6 space-y-8">

            {/* 🖥️ TV役割の管理 */}
            <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Monitor size={16} /> TV端末の役割</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                この部屋で使用するテレビの役割名（president、exit、office1など）をアルファベットで登録します。
              </p>

              <div className="flex flex-wrap gap-2 mb-4">
                {editingTvRoles.map(role => (
                  <span key={role} className="inline-flex items-center gap-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-bold px-3 py-1 rounded-lg border text-xs shadow-sm">
                    {role}
                    <button type="button" onClick={() => handleDeleteTvRole(role)} className="text-slate-300 hover:text-red-500 text-[10px] font-bold ml-2">×</button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2 max-w-md">
                <Input placeholder="例: president" value={newRoleName} onChange={e => setNewRoleName(e.target.value.toLowerCase())} className="h-10 text-xs" />
                <Button onClick={handleAddTvRole} className="h-10 text-xs shrink-0">役割を追加</Button>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Monitor size={16} /> 共通動画ライブラリ</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                演出ステップの動画は、管理画面の「動画ライブラリ」に登録された共通動画から選択します。現在 {videoLibrary.length} 件の動画が利用できます。
              </p>
            </div>

            {/* 📋 ステップ動作プランの管理 */}
            <div className="space-y-5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Clapperboard size={16} /> 演出ステップ</h3>
                <Button variant="outline" size="sm" onClick={() => {
                  const newSteps = [...editingSteps, {
                    name: `新規ステップ ${editingSteps.length + 1}`,
                    autoTransitionType: "MANUAL_OR_TIMER" as const,
                    tvActions: editingTvRoles.reduce((acc, role) => ({ ...acc, [role]: { mode: "STANDBY" as const } }), {})
                  }];
                  setEditingSteps(newSteps);
                }} className="text-xs"><Plus size={14} className="mr-1" />ステップを追加</Button>
              </div>

              <div className="space-y-4">
                {editingSteps.map((step, sIdx) => (
                  <div key={sIdx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-4 relative">
                    <button
                      onClick={() => {
                        const newSteps = editingSteps.filter((_, idx) => idx !== sIdx);
                        setEditingSteps(newSteps);
                      }}
                      className="absolute top-4 right-4 text-slate-300 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>

                    <div className="flex items-center gap-2 pr-8">
                      <Badge variant="info">STEP {sIdx + 1}</Badge>
                      <p className="text-xs font-bold text-slate-400">{RIDDLE_TRANSITION_LABELS[step.autoTransitionType]}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                      <div>
                        <Input
                          label="ステップ名"
                          value={step.name}
                          onChange={e => {
                            const newSteps = editingSteps.map((s, idx) =>
                              idx === sIdx ? { ...s, name: e.target.value } : s
                            );
                            setEditingSteps(newSteps);
                          }}
                          className="font-bold text-sm"
                        />
                      </div>

                      {/* 自動進行の移行設定 */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">次のステップへの移行条件</label>
                        <select
                          value={step.autoTransitionType}
                          onChange={e => {
                            const newSteps = editingSteps.map((s, idx) =>
                              idx === sIdx ? { ...s, autoTransitionType: e.target.value as "VIDEO_END" | "TIME_ELAPSED" | "MANUAL_OR_TIMER" } : s
                            );
                            setEditingSteps(newSteps);
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                        >
                          <option value="VIDEO_END">特定のTVの動画再生終了時</option>
                          <option value="TIME_ELAPSED">指定秒数が経過した時</option>
                          <option value="MANUAL_OR_TIMER">手動スキップ or タイマー完了</option>
                        </select>
                      </div>

                      {step.autoTransitionType === "VIDEO_END" && (
                        <div className="animate-in slide-in-from-top-2">
                          <label className="block text-xs font-bold text-slate-500 mb-1">対象TV</label>
                          <select
                            value={step.triggerTvRole || ""}
                            onChange={e => {
                              const newSteps = editingSteps.map((s, idx) =>
                                idx === sIdx ? { ...s, triggerTvRole: e.target.value } : s
                              );
                              setEditingSteps(newSteps);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-bold"
                          >
                            <option value="">-- TVを選択 --</option>
                            {editingTvRoles.map(role => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </div>
                      )}

                      {step.autoTransitionType === "TIME_ELAPSED" && (
                        <div className="animate-in slide-in-from-top-2">
                          <label className="block text-xs font-bold text-slate-500 mb-1">遅延時間（秒）</label>
                          <Input
                            type="number"
                            value={step.durationSeconds ?? ""}
                            onChange={e => {
                              const value = e.target.value === "" ? undefined : Number(e.target.value);
                              const newSteps = editingSteps.map((s, idx) =>
                                idx === sIdx ? { ...s, durationSeconds: value } : s
                              );
                              setEditingSteps(newSteps);
                            }}
                            min="1"
                            placeholder="例: 10"
                            className="font-bold text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {/* 各タイマーの個別設定UIの表示 */}
                    {Object.values(step.tvActions || {}).some(
                      (act) => (act as { mode?: string })?.mode === "TIMER"
                    ) && (
                      <div className="p-4 bg-purple-50/50 dark:bg-purple-950/10 border border-purple-200 dark:border-purple-900/50 rounded-xl max-w-sm animate-in zoom-in-95 flex items-center gap-3 mt-3">
                        <Timer className="text-purple-500 shrink-0" size={20} />
                        <div className="flex-1">
                          <label className="block text-[10px] text-purple-700 dark:text-purple-400 font-black uppercase mb-1">このステップのタイマー制限時間</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={Math.floor((step.timerDurationSeconds || DEFAULT_ROOM_DURATION_SECONDS) / 60)}
                              onChange={e => {
                                const newSteps = editingSteps.map((s, idx) => {
                                  if (idx !== sIdx) return s;
                                  const currentSeconds = s.timerDurationSeconds || DEFAULT_ROOM_DURATION_SECONDS;
                                  const currentSecs = currentSeconds % 60;
                                  const nextSeconds = (Number(e.target.value) * 60) + currentSecs;
                                  return { ...s, timerDurationSeconds: nextSeconds };
                                });
                                setEditingSteps(newSteps);
                              }}
                              className="w-12 bg-white dark:bg-slate-900 border text-center text-xs font-bold rounded p-1"
                              min="0"
                            />
                            <span className="text-xs font-bold text-slate-500">分</span>
                            <input
                              type="number"
                              value={(step.timerDurationSeconds || DEFAULT_ROOM_DURATION_SECONDS) % 60}
                              onChange={e => {
                                const newSteps = editingSteps.map((s, idx) => {
                                  if (idx !== sIdx) return s;
                                  const currentSeconds = s.timerDurationSeconds || DEFAULT_ROOM_DURATION_SECONDS;
                                  const currentMins = Math.floor(currentSeconds / 60);
                                  const nextSeconds = (currentMins * 60) + Number(e.target.value);
                                  return { ...s, timerDurationSeconds: nextSeconds };
                                });
                                setEditingSteps(newSteps);
                              }}
                              className="w-12 bg-white dark:bg-slate-900 border text-center text-xs font-bold rounded p-1"
                              min="0"
                              max="59"
                            />
                            <span className="text-xs font-bold text-slate-500">秒</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 各TVへのアクション割り当て */}
                    <div className="pt-4 border-t border-dashed border-slate-200 dark:border-slate-800">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><ScreenShare size={13} /> 各TVへの表示内容</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {editingTvRoles.map(role => {
                          const act = step.tvActions?.[role] || { mode: "STANDBY" };
                          return (
                            <div key={role} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border flex flex-col justify-between gap-3">
                              <Badge variant="info" className="self-start text-[8px]">{role}</Badge>

                              <div className="space-y-2">
                                <label className="block text-[10px] text-slate-400 font-bold">動作モード</label>
                                <select
                                  value={act.mode}
                                  onChange={e => {
                                    const newSteps = editingSteps.map((s, idx) => {
                                      if (idx !== sIdx) return s;
                                      const nextActions = { ...(s.tvActions || {}) };
                                      nextActions[role] = {
                                        ...(nextActions[role] || { mode: "STANDBY" }),
                                        mode: e.target.value as "STANDBY" | "DARK" | "VIDEO" | "TIMER" | "NEXT_ROOM"
                                      };
                                      return { ...s, tvActions: nextActions };
                                    });
                                    setEditingSteps(newSteps);
                                  }}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-1 text-xs font-bold"
                                >
                                  <option value="STANDBY">待機 (待機文を表示)</option>
                                  <option value="DARK">暗転 (画面真っ暗)</option>
                                  <option value="VIDEO">動画 (VIDEO)</option>
                                  <option value="TIMER">タイマー (TIMER)</option>
                                  <option value="NEXT_ROOM">次の部屋へ案内</option>
                                </select>
                              </div>

                              {act.mode === "VIDEO" && (
                                <div className="space-y-3 animate-in zoom-in-95">
                                  <label className="block text-[10px] text-slate-400 font-bold">動画</label>
                                  <select
                                    value={act.videoAssetId || ""}
                                    onChange={e => {
                                      const newSteps = editingSteps.map((s, idx) => {
                                        if (idx !== sIdx) return s;
                                        const nextActions = { ...(s.tvActions || {}) };
                                        nextActions[role] = {
                                          ...(nextActions[role] || { mode: "VIDEO" }),
                                          videoAssetId: e.target.value
                                        };
                                        return { ...s, tvActions: nextActions };
                                      });
                                      setEditingSteps(newSteps);
                                    }}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-1 text-xs font-mono font-bold text-purple-600"
                                  >
                                    <option value="">動画を選択</option>
                                    {videoLibrary.map(video => (
                                      <option key={video.id} value={video.id}>{video.name}</option>
                                    ))}
                                  </select>
                                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={act.audioEnabled !== false}
                                      onChange={e => {
                                        const shouldEnableAudio = e.target.checked;
                                        const newSteps = editingSteps.map((s, idx) => {
                                          if (idx !== sIdx) return s;
                                          const nextActions = Object.fromEntries(
                                            Object.entries(s.tvActions || {}).map(([actionRole, action]) => [
                                              actionRole,
                                              action.mode === "VIDEO"
                                                ? { ...action, audioEnabled: actionRole === role ? shouldEnableAudio : false }
                                                : action
                                            ])
                                          );
                                          return { ...s, tvActions: nextActions };
                                        });
                                        setEditingSteps(newSteps);
                                      }}
                                      className="h-4 w-4 accent-purple-600"
                                    />
                                    このTVから音声を出す
                                  </label>
                                  <p className="text-[9px] font-bold leading-relaxed text-slate-400">
                                    オンにすると、このステップ内のほかの動画TVは自動でミュートされます。
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>
      )}

    </div>
  );
}
