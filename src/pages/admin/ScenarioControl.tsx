// File: src/pages/admin/ScenarioControl.tsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useStocks, useSystemSettings } from "../../hooks/useFirebase";
import { useMarketActions } from "../../hooks/useMarketActions";
import type { PriceChangeTarget } from "../../types/domain";
import { useLiveNews } from "../../hooks/useLiveNews";
import { useScenarioOperations } from "../../hooks/useScenarioOperations";
import {
  subscribeUpcomingEvents,
  createEvent,
  updateEvent,
  updateEventOffset,
  moveEventsToSessionInChunks,
  newEventRef,
  buildCopiedEventPayload,
  type EventWritePayload,
} from "../../services/eventService";
import {
  createScheduleSession,
  deleteScheduleSession,
  disableAutoPilot,
  enableAutoPilotFromEvents,
  makeUnscheduledSession,
  scheduleScenarioStart,
  setMarketPhase,
  subscribeLoopSettings,
  subscribePublicSignages,
  subscribeScenarioVideoLibrary,
  subscribeScheduleSessions,
  updateLoopIntervalMinutes,
  updateLoopRepeatDelayMinutes,
  updateScheduleSession,
  type PublicSignageSummary,
} from "../../services/scenarioService";
import { AlertTriangle, Download, Edit2, Play, Pause, Trash2, Megaphone, CalendarClock, ListTodo, Sparkles, Settings, RotateCcw, RefreshCw, X, Plus, Rows3, FileUp, Wrench, Inbox } from "lucide-react";
import { useDialog } from "../../contexts/DialogContext";
import { type ScenarioEvent } from "../../types/scenario";
import Papa from "papaparse";

import Badge from "../../components/ui/Badge";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import TimelineView from "../../components/admin/scenario/TimelineView";
import ScheduleAgendaView from "../../components/admin/scenario/ScheduleAgendaView";
import CsvImporter from "../../components/admin/scenario/CsvImporter";
import AutoPilotSettings from "../../components/admin/scenario/AutoPilotSettings";
import SystemOperations from "../../components/admin/scenario/SystemOperations";
import EventForm from "../../components/admin/scenario/EventForm"; // EventFormのインポート
import SessionTabs from "../../components/admin/schedule/SessionTabs";
import ScheduleTimeline from "../../components/admin/schedule/ScheduleTimeline";
import type { ScheduleSession } from "../../types/schedule";
import type { VideoLibraryItem } from "../../types/videoLibrary";
import { UNSCHEDULED_SESSION_ID } from "../../lib/appConstants";
import { buildScenarioCsvRows, SCENARIO_CSV_COLUMNS } from "../../lib/scenarioCsvExport";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import AdminPageShell from "../../components/admin/AdminPageShell";
import { subscribeNewsPresets } from "../../services/newsPresetService";
import type { NewsPreset } from "../../types/newsPreset";

const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
export default function ScenarioControl() {
  const stocks = useStocks();
  const systemSettings = useSystemSettings();
  const { deleteEvent, publishNewsNow } = useMarketActions();
  const { startGameNow, resetAllToPending, deleteLiveNews, deleteEventsInChunks, setEventsInChunks, deleteNewsInChunks } = useScenarioOperations();
  const { alert, confirm } = useDialog();

  const [upcomingEvents, setUpcomingEvents] = useState<ScenarioEvent[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [newsPresets, setNewsPresets] = useState<NewsPreset[]>([]);
  const [publicSignages, setPublicSignages] = useState<PublicSignageSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(UNSCHEDULED_SESSION_ID);
  const { news: liveNews } = useLiveNews(50);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopInterval, setLoopInterval] = useState(5);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [startPinEventId, setStartPinEventId] = useState("");
  const [selectedEventForEdit, setSelectedEventForEdit] = useState<ScenarioEvent | null>(null);

  const [loopRepeatDelayMinutes, setLoopRepeatDelayMinutes] = useState(3);
  const [selectedNewsIds, setSelectedNewsIds] = useState<string[]>([]);

  const [scheduledStartDate, setScheduledStartDate] = useState(formatDate(new Date()));
  const [scheduledStartTime, setScheduledStartTime] = useState(formatTime(new Date()));
  const [activeEditorTab, setActiveEditorTab] = useState<"csv" | "editor" | "news">("editor");
  const [scheduleViewMode, setScheduleViewMode] = useState<"edit" | "agenda">("edit");
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [showToolsPopover, setShowToolsPopover] = useState(false);
  const [isMobileEditorOpen, setIsMobileEditorOpen] = useState(false);
  const [draftEventSessionId, setDraftEventSessionId] = useState(UNSCHEDULED_SESSION_ID);
  const [newEventFormVersion, setNewEventFormVersion] = useState(0);
  const timelineWorkspaceRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(isMobileEditorOpen);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = subscribeUpcomingEvents(setUpcomingEvents);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeScenarioVideoLibrary(setVideoLibrary);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeNewsPresets(setNewsPresets);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribePublicSignages(setPublicSignages);
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeScheduleSessions((next) => {
      setSessions(next);
      setSelectedSessionId(prev => {
        const now = Date.now();
        const active = next.find(session => session.startAt.toMillis() <= now && session.endAt.toMillis() >= now);
        const prevExists = prev === UNSCHEDULED_SESSION_ID || next.some(session => session.id === prev);
        if (!prevExists) return active?.id || UNSCHEDULED_SESSION_ID;
        return prev === UNSCHEDULED_SESSION_ID && active ? active.id : prev;
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribeLoopSettings((settings) => {
      setLoopEnabled(settings.loopEnabled);
      setLoopInterval(settings.loopInterval);
      setLoopRepeatDelayMinutes(settings.loopRepeatDelayMinutes);
    });
    return () => unsub();
  }, []);

  const globalPhase = systemSettings?.globalPhase || "STOP";
  const unscheduledSession = useMemo<ScheduleSession>(() => makeUnscheduledSession(UNSCHEDULED_SESSION_ID), []);
  const displaySessions = useMemo(() => [unscheduledSession, ...sessions], [sessions, unscheduledSession]);
  const selectedSession = displaySessions.find(session => session.id === selectedSessionId) || displaySessions[0];
  const videoNameById = useMemo(() => Object.fromEntries(videoLibrary.map(video => [video.id, video.name])), [videoLibrary]);
  const newsPresetById = useMemo(() => new Map(newsPresets.map(preset => [preset.id, preset])), [newsPresets]);
  const newsPresetNameById = useMemo(() => Object.fromEntries(newsPresets.map(preset => [preset.id, preset.name])), [newsPresets]);
  const signageNameById = useMemo(() => Object.fromEntries(publicSignages.map(signage => [signage.id, signage.name || signage.id])), [publicSignages]);
  const sessionEvents = useMemo(() => {
    if (selectedSessionId === UNSCHEDULED_SESSION_ID) return upcomingEvents.filter(event => !event.sessionId);
    return upcomingEvents.filter(event => event.sessionId === selectedSessionId);
  }, [selectedSessionId, upcomingEvents]);
  const eventCountBySessionId = useMemo(() => {
    const counts: Record<string, number> = { [UNSCHEDULED_SESSION_ID]: 0 };
    for (const event of upcomingEvents) {
      const key = event.sessionId || UNSCHEDULED_SESSION_ID;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [upcomingEvents]);
  const normalizeSessionId = (sessionId: string) => sessionId === UNSCHEDULED_SESSION_ID ? null : sessionId;
  const isEditingSelectedEvent = Boolean(selectedEventForEdit?.id);

  const handleToggleAutoPilot = async () => {
    try {
      if (!loopEnabled) {
        const manualEvents = sessionEvents.filter(ev => ev.isAutoGenerated !== true);

        if (manualEvents.length === 0) {
          await alert({ title: "開始不可", message: "タイムスケジュール上にイベントがありません。先にイベントを作成してからループを有効にしてください。", variant: "warning" });
          return;
        }

        await enableAutoPilotFromEvents(manualEvents, loopInterval, loopRepeatDelayMinutes);
        await alert({ title: "オートパイロット開始", message: "自律ループ運用をONにしました。作成したイベントのみをループ再生します。", variant: "success" });
      } else {
        await disableAutoPilot();
        await alert({ title: "オートパイロット停止", message: "自動ループ運用をOFFにしました。", variant: "info" });
      }
    } catch {
      await alert({ title: "エラー", message: "設定に失敗しました", variant: "danger" });
    }
  };

  const handleUpdateInterval = async (val: number) => {
    const safeValue = Math.min(60, Math.max(1, val));
    const previousValue = loopInterval;
    setLoopInterval(safeValue);
    if (loopEnabled) {
      try {
        await updateLoopIntervalMinutes(safeValue);
      } catch {
        setLoopInterval(previousValue);
        await alert({ title: "保存失敗", message: "ループ間隔を保存できませんでした。表示を変更前の値に戻しました。", variant: "danger" });
      }
    }
  };

  const handleUpdateRepeatDelay = async (val: number) => {
    const safeValue = Math.max(1, val);
    const previousValue = loopRepeatDelayMinutes;
    setLoopRepeatDelayMinutes(safeValue);
    if (loopEnabled) {
      try {
        await updateLoopRepeatDelayMinutes(safeValue);
      } catch {
        setLoopRepeatDelayMinutes(previousValue);
        await alert({ title: "保存失敗", message: "繰り返し待機時間を保存できませんでした。表示を変更前の値に戻しました。", variant: "danger" });
      }
    }
  };

  const handleCsvImportComplete = async (importedEvents: Array<{
    offsetSeconds: number;
    priceChanges: PriceChangeTarget[];
    publicNewsPresetId: string | null;
    postNewsPresetId: string | null;
    postNewsDelaySeconds: number | null;
    insiderNewsPresetId: string | null;
    signageTargetId: string | null;
  }>) => {
    try {
      await setEventsInChunks(importedEvents.map(item => ({
        ref: newEventRef(),
        data: {
          time: null,
          offsetSeconds: item.offsetSeconds,
          priceChanges: item.priceChanges.length > 0 ? item.priceChanges : null,
          publicNewsPresetId: item.publicNewsPresetId,
          postNewsPresetId: item.postNewsPresetId,
          postNewsDelaySeconds: item.postNewsDelaySeconds,
          insiderNewsPresetId: item.insiderNewsPresetId,
          signageTargetId: item.signageTargetId,
          sessionId: selectedSessionId === UNSCHEDULED_SESSION_ID ? null : selectedSessionId,
          processedParts: null,
          selectedBranches: null,
          isProcessed: false
        }
      })));
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "CSVデータの一括保存に失敗しました。", variant: "danger" });
    }
  };

  const handleExportScenarioCsv = () => {
    const rows = buildScenarioCsvRows(sessionEvents, videoNameById, newsPresetNameById);
    const csv = Papa.unparse(rows, {
      columns: [...SCENARIO_CSV_COLUMNS]
    });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "scenario_timeline_export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleSaveEvent = async (
    offsetSeconds: number,
    priceChanges: PriceChangeTarget[],
    publicNewsPresetId: string | null,
    postNewsPresetId: string | null,
    postNewsDelaySeconds: number | null,
    insiderNewsPresetId: string | null,
    signageTargetId: string | null,
    eventSessionId: string
  ) => {
    const payloadSessionId = normalizeSessionId(eventSessionId);
    try {
      if (selectedEventForEdit && selectedEventForEdit.id) {
        const payload: EventWritePayload = {
          time: null,
          isProcessed: false,
          offsetSeconds,
          priceChanges: priceChanges.length > 0 ? priceChanges : null,
          publicNewsPresetId,
          postNewsPresetId,
          postNewsDelaySeconds,
          insiderNewsPresetId,
          signageTargetId,
          sessionId: payloadSessionId,
          processedParts: null,
          selectedBranches: null
        };
        await updateEvent(selectedEventForEdit.id, payload);
        await alert({ title: "編集完了", message: "修正を保存し、「未処理（予約待ち）」にリセットしました。", variant: "success" });
      } else {
        const payload: EventWritePayload = {
          time: null,
          offsetSeconds,
          priceChanges: priceChanges.length > 0 ? priceChanges : null,
          publicNewsPresetId,
          postNewsPresetId,
          postNewsDelaySeconds,
          insiderNewsPresetId,
          signageTargetId,
          sessionId: payloadSessionId,
          processedParts: null,
          selectedBranches: null,
          isProcessed: false
        };
        await createEvent(payload);
      }
      setSelectedSessionId(eventSessionId);
    } catch {
      await alert({ title: "エラー", message: "保存に失敗しました。", variant: "danger" });
    } finally {
      setSelectedEventForEdit(null);
      setIsMobileEditorOpen(false);
    }
  };

  const handleOpenNewEventPanel = () => {
    setSelectedEventForEdit(null);
    setDraftEventSessionId(selectedSessionId);
    setNewEventFormVersion(version => version + 1);
    setActiveEditorTab("editor");
    setIsMobileEditorOpen(true);
  };

  const handleStartGame = async () => {
    await startGameNow(sessionEvents, startPinEventId);
  };

  const handleStartGameScheduled = async () => {
    const unstartedEvents = sessionEvents.filter(ev => !ev.isProcessed);
    if (unstartedEvents.length === 0) {
      await alert({ title: "お知らせ", message: "開戦待ちの未処理イベントがありません。", variant: "info" });
      return;
    }

    const startDateTime = new Date(`${scheduledStartDate}T${scheduledStartTime}:00`);
    if (isNaN(startDateTime.getTime())) {
      await alert({ title: "設定エラー", message: "日時のフォーマットが不正です。", variant: "danger" });
      return;
    }

    const isOk = await confirm({
      title: "指定時間で開戦予約",
      message: `${startDateTime.toLocaleString()} からタイムスケジュールのマッピングを開始します。よろしいですか？`,
      confirmText: "開戦予約する"
    });

    if (!isOk) return;

    try {
      await scheduleScenarioStart(sessionEvents, startDateTime, startPinEventId);
      await alert({ title: "予約完了", message: `${startDateTime.toLocaleString()} 開始として予約マッピングしました！`, variant: "success" });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "予約処理に失敗しました。", variant: "danger" });
    }
  };

  const handleResetAllToPending = async () => {
    const completed = await resetAllToPending(upcomingEvents);
    if (completed) {
      setStartPinEventId("");
    }
  };

  const handleClearAllEvents = async () => {
    try {
      await deleteEventsInChunks(sessionEvents.map(ev => ev.id));
      setStartPinEventId("");
      await alert({ title: "成功", message: "すべてのイベント予約を消去しました。", variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "全消去に失敗しました。", variant: "danger" });
    }
  };

  const handleDeleteSelectedEvents = async (eventsToDelete: ScenarioEvent[]) => {
    if (eventsToDelete.length === 0) return;

    const isOk = await confirm({
      title: "選択したシナリオを削除",
      message: `${eventsToDelete.length} 件のシナリオイベントを削除します。よろしいですか？`,
      confirmText: "削除する",
      variant: "danger"
    });

    if (!isOk) return;

    try {
      const deleteIds = eventsToDelete.map(event => event.id);
      await deleteEventsInChunks(deleteIds);
      if (deleteIds.includes(startPinEventId)) setStartPinEventId("");
      if (selectedEventForEdit && deleteIds.includes(selectedEventForEdit.id)) {
        setSelectedEventForEdit(null);
      }
      await alert({ title: "削除完了", message: `${eventsToDelete.length} 件のシナリオイベントを削除しました。`, variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "選択したシナリオイベントの削除に失敗しました。", variant: "danger" });
    }
  };

  const handleToggleMarketActive = async () => {
    const isRunning = globalPhase === "RUNNING";
    const actionText = isRunning ? "一時停止" : "再開";
    const nextPhase = isRunning ? "STOP" : "RUNNING";

    const isOk = await confirm({
      title: `市場の${actionText}`,
      message: `現在の取引進行を${actionText}します。よろしいですか？`,
      confirmText: `${actionText}する`
    });

    if (!isOk) return;

    try {
      await setMarketPhase(nextPhase);
      await alert({ title: `${actionText}完了`, message: `市場を${actionText}しました。`, variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "制御に失敗しました。", variant: "danger" });
    }
  };

  const handleOpenEditModal = (event: ScenarioEvent) => {
    setSelectedEventForEdit(event);
    setDraftEventSessionId(event.sessionId || UNSCHEDULED_SESSION_ID);
    setActiveEditorTab("editor");
    setIsMobileEditorOpen(true);
  };

  const handleUpdateEventOffset = async (event: ScenarioEvent, nextOffsetSeconds: number) => {
    try {
      await updateEventOffset(event.id, nextOffsetSeconds);
    } catch {
      await alert({ title: "エラー", message: "予約時間の変更に失敗しました。", variant: "danger" });
    }
  };

  const handleCopyEvents = async (eventsToCopy: ScenarioEvent[], targetSessionId: string) => {
    if (eventsToCopy.length === 0) return;

    try {
      const payloadSessionId = normalizeSessionId(targetSessionId);
      await setEventsInChunks(eventsToCopy.map(event => ({
        ref: newEventRef(),
        data: buildCopiedEventPayload(event, payloadSessionId)
      })));
      setSelectedSessionId(targetSessionId);
      await alert({
        title: "コピー完了",
        message: `${eventsToCopy.length} 件のイベントをコピーしました。`,
        variant: "success"
      });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "イベントのコピーに失敗しました。", variant: "danger" });
    }
  };

  const handleMoveEvents = async (eventsToMove: ScenarioEvent[], targetSessionId: string) => {
    if (eventsToMove.length === 0) return;

    try {
      await moveEventsToSessionInChunks(eventsToMove.map(event => event.id), normalizeSessionId(targetSessionId));
      setSelectedSessionId(targetSessionId);
      await alert({
        title: "移動完了",
        message: `${eventsToMove.length} 件のイベントを移動しました。`,
        variant: "success"
      });
    } catch (e) {
      console.error(e);
      await alert({ title: "エラー", message: "イベントの移動に失敗しました。", variant: "danger" });
    }
  };

  const handleCreateSession = async (input: { name: string; startAt: Date; endAt: Date }) => {
    const ref = await createScheduleSession(input, sessions.length);
    setSelectedSessionId(ref.id);
  };

  const handleUpdateSession = async (id: string, input: { name: string; startAt: Date; endAt: Date }) => {
    if (id === UNSCHEDULED_SESSION_ID) return;
    await updateScheduleSession(id, input);
  };

  const handleDeleteSession = async (id: string) => {
    if (id === UNSCHEDULED_SESSION_ID) return;
    const ok = await confirm({ title: "セッション削除", message: "このセッションを削除します。イベントは未分類に戻します。", variant: "danger" });
    if (!ok) return;
    await deleteScheduleSession(id, upcomingEvents);
    setSelectedSessionId(UNSCHEDULED_SESSION_ID);
  };

  const handleDeleteLiveNews = async (newsId: string, title: string) => {
    const completed = await deleteLiveNews(newsId, title);
    if (completed) {
      setSelectedNewsIds(prev => prev.filter(id => id !== newsId));
    }
  };

  const handleBulkDeleteNews = async () => {
    if (selectedNewsIds.length === 0) return;

    const isOk = await confirm({
      title: "ニュース一括削除",
      message: `${selectedNewsIds.length} 件のニュースを一括消去しますか？`,
      variant: "danger"
    });

    if (!isOk) return;

    try {
      await deleteNewsInChunks(selectedNewsIds);
      setSelectedNewsIds([]);
      await alert({ title: "一括削除完了", message: "一斉消去しました。", variant: "success" });
    } catch {
      await alert({ title: "エラー", message: "消去に失敗しました。", variant: "danger" });
    }
  };

  const openMobileTool = (tab: typeof activeEditorTab) => {
    setActiveEditorTab(tab);
    setIsMobileEditorOpen(true);
  };

  const openToolPanel = (tab: typeof activeEditorTab) => {
    setActiveEditorTab(tab);
    setShowToolsPopover(false);
    setIsMobileEditorOpen(true);
  };

  const handleJumpToOffset = (offsetSeconds: number) => {
    const container = timelineWorkspaceRef.current;
    if (!container) return;
    const targetOffset = Math.max(0, offsetSeconds);
    const buckets = Array.from(container.querySelectorAll<HTMLElement>("[data-offset-bucket]"))
      .map(element => ({ element, bucket: Number(element.dataset.offsetBucket) }))
      .filter(item => Number.isFinite(item.bucket))
      .sort((a, b) => a.bucket - b.bucket);
    const target = buckets.find(item => item.bucket >= targetOffset)?.element ?? buckets[buckets.length - 1]?.element;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AdminPageShell maxWidthClassName="max-w-[1900px]" className="relative gap-0 overflow-y-auto bg-surface-variant/40 font-sans xl:min-h-[calc(100dvh-4rem)]">

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface p-3 shadow-xs md:mb-6 md:flex-row md:items-center md:justify-between md:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-on-surface">シナリオ執筆</h2>
            <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-black text-on-primary-container">
              {selectedSession.name}
            </span>
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-[10px] font-black text-on-surface-variant">
              {sessionEvents.length}件
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-on-surface-variant">
            仮置きから各セッションへ整理し、時間軸で執筆内容を確認します。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedSessionId(UNSCHEDULED_SESSION_ID)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <Inbox size={15} />
            未分類を仕分け
          </button>
          <button
            type="button"
            onClick={handleOpenNewEventPanel}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-purple-500"
          >
            <Plus size={15} />
            追加
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowToolsPopover(prev => !prev)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-outline-variant bg-surface-container px-3 text-xs font-black text-on-surface-variant transition hover:bg-on-surface/8"
            >
              <Wrench size={15} />
              ツール
            </button>
            {showToolsPopover && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowToolsPopover(false)} />
                <div className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-outline-variant bg-surface p-2 shadow-2xl">
                  {[
                    { label: "CSV一括登録", icon: <FileUp size={15} />, tab: "csv" as const },
                    { label: "CSVエクスポート", icon: <Download size={15} />, onClick: handleExportScenarioCsv },
                    { label: "ニュース消去", icon: <Megaphone size={15} />, tab: "news" as const },
                  ].map(item => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => item.onClick ? (item.onClick(), setShowToolsPopover(false)) : openToolPanel(item.tab)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black text-on-surface-variant hover:bg-on-surface/8"
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSettingsPopover(!showSettingsPopover)}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black transition cursor-pointer ${
                showSettingsPopover
                  ? "bg-slate-900 border-slate-700 text-white"
                  : "bg-slate-900 hover:bg-slate-800 border-slate-800 text-white"
              }`}
              title="運用・テスト"
            >
              <Settings size={15} />
              運用・テスト
            </button>

            {/* 設定ポップオーバーの吹き出しパネル */}
            {showSettingsPopover && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPopover(false)} />
                
                <div className="absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-[30rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] p-5 shadow-2xl z-50 text-slate-800 dark:text-slate-200 space-y-4 animate-in fade-in-50 zoom-in-95 duration-100">
                  <div className="pb-2 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h4 className="font-black text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Settings size={14} /> 運用・テスト
                    </h4>
                    <button
                      type="button"
                      onClick={() => setShowSettingsPopover(false)}
                      className="text-xs font-bold text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
                    >
                      閉じる
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${
                          loopEnabled
                            ? "bg-emerald-500"
                            : globalPhase === "RUNNING"
                              ? "bg-sky-500"
                              : "bg-rose-500"
                        }`} />
                        <span className="text-[10px] font-black">
                          {loopEnabled ? "オートパイロット周回中" : globalPhase === "RUNNING" ? "スケジュール自動進行中" : "取引一時停止中"}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-[7px] font-black text-slate-400">SERVER TIME</p>
                        <p className="font-mono text-xs font-black">{currentTime.toLocaleTimeString()}</p>
                      </div>
                    </div>
                    {globalPhase === "STOP" && (
                      <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input type="date" value={scheduledStartDate} onChange={e => setScheduledStartDate(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold dark:border-slate-800 dark:bg-slate-900" />
                        <input type="time" value={scheduledStartTime} onChange={e => setScheduledStartTime(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold dark:border-slate-800 dark:bg-slate-900" />
                        <button type="button" onClick={handleStartGameScheduled} className="h-9 rounded-lg bg-purple-600 px-3 text-[10px] font-black text-white hover:bg-purple-500">
                          開始予約
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={handleResetAllToPending} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-slate-700 px-3 text-xs font-black text-white hover:bg-slate-600">
                        <RotateCcw size={13} /> 最初に戻す
                      </button>
                      {globalPhase === "STOP" ? (
                        <button type="button" onClick={handleStartGame} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 text-xs font-black text-white hover:bg-red-500">
                          <Play size={13} fill="currentColor" /> 開戦
                        </button>
                      ) : (
                        <button type="button" onClick={handleToggleMarketActive} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-black text-white hover:bg-amber-400">
                          {globalPhase === "RUNNING" ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                          {globalPhase === "RUNNING" ? "一時停止" : "再開"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* オートパイロット設定 */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <RefreshCw size={11} /> オートパイロット設定 (自動ループ)
                    </p>
                    <AutoPilotSettings
                      loopEnabled={loopEnabled}
                      loopInterval={loopInterval}
                      loopRepeatDelayMinutes={loopRepeatDelayMinutes}
                      onToggle={handleToggleAutoPilot}
                      onUpdateInterval={handleUpdateInterval}
                      onUpdateRepeatDelay={handleUpdateRepeatDelay}
                    />
                  </div>

                  {/* 危険な管理者アクション */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <AlertTriangle size={11} /> 管理者メンテナンス操作
                    </p>
                    <SystemOperations
                      onResetAllPending={handleResetAllToPending}
                      onClearAllEvents={handleClearAllEvents}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* メイン：一覧主役のレスポンシブワークスペース */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(420px,34vw)] 2xl:grid-cols-[minmax(0,1fr)_560px] gap-4 md:gap-6 items-start min-h-0 min-w-0">
        
        {/* 左カラム：タイムライン (Timeline Workspace) */}
        <div className="min-h-[560px] flex flex-col min-w-0 max-w-full">
          <div className="mb-4 space-y-3 shrink-0">
            <SessionTabs
              sessions={displaySessions}
              selectedSessionId={selectedSessionId}
              onSelect={setSelectedSessionId}
              onCreate={handleCreateSession}
              onUpdate={handleUpdateSession}
              onDelete={handleDeleteSession}
              eventCountBySessionId={eventCountBySessionId}
            />
            <ScheduleTimeline
              session={selectedSession}
              events={sessionEvents}
              now={currentTime}
              selectedEventId={selectedEventForEdit?.id || null}
              videoNameById={videoNameById}
              signageNameById={signageNameById}
              newsPresetById={newsPresetById}
              onSelectEvent={handleOpenEditModal}
              onJumpToOffset={handleJumpToOffset}
            />
            <Tabs className="rounded-2xl border border-slate-200 bg-white px-3 pt-1 dark:border-slate-800 dark:bg-slate-900">
              <TabButton value="edit" activeValue={scheduleViewMode} onSelect={setScheduleViewMode} tone="purple" icon={<Edit2 size={14} />}>
                編集
              </TabButton>
              <TabButton value="agenda" activeValue={scheduleViewMode} onSelect={setScheduleViewMode} tone="purple" icon={<Rows3 size={14} />}>
                見やすい表示
              </TabButton>
            </Tabs>
            {scheduleViewMode === "edit" && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-purple-100 bg-white p-3 shadow-xs dark:border-purple-900/40 dark:bg-slate-900">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-purple-500">手動追加</p>
                  <p className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{selectedSession.name} にイベントを追加</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewEventPanel}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-purple-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-purple-500 active:scale-95"
                >
                  <Plus size={16} />
                  追加
                </button>
              </div>
            )}
          </div>
          {scheduleViewMode === "agenda" ? (
            <ScheduleAgendaView
              session={selectedSession}
              events={sessionEvents}
              now={currentTime}
              videoNameById={videoNameById}
              signageNameById={signageNameById}
              newsPresetById={newsPresetById}
              onOpenEdit={handleOpenEditModal}
            />
          ) : (
            <div ref={timelineWorkspaceRef}>
              <TimelineView
                events={sessionEvents}
                stocks={stocks}
                videoNameById={videoNameById}
                signageNameById={signageNameById}
                newsPresetById={newsPresetById}
                sessions={displaySessions}
                selectedSessionId={selectedSessionId}
                startPinEventId={startPinEventId}
                onSetStartPin={setStartPinEventId}
                onDelete={deleteEvent}
                onDeleteEvents={handleDeleteSelectedEvents}
                onUpdateOffset={handleUpdateEventOffset}
                onOpenEdit={handleOpenEditModal}
                onCopyEvents={handleCopyEvents}
                onMoveEvents={handleMoveEvents}
                session={selectedSession}
              />
            </div>
          )}
        </div>

        {/* 右カラム：エディタ＆ツールボックス (Unified Editor & Toolbox) */}
        <div className={`fixed inset-x-0 bottom-0 z-[80] max-h-[88dvh] w-full overflow-hidden rounded-t-2xl border border-outline-variant bg-surface p-3 shadow-2xl transition-transform duration-300 sm:p-5 xl:sticky xl:top-6 xl:z-auto xl:max-h-none xl:min-h-[640px] xl:translate-y-0 xl:overflow-visible xl:rounded-[28px] xl:shadow-2xl ${isMobileEditorOpen ? "translate-y-0" : "translate-y-full xl:translate-y-0"}`}>
          
          {/* 右カラム内タブナビゲーション */}
          <div className="mb-3 flex items-center justify-between gap-3 xl:hidden">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-on-surface">
                {activeEditorTab === "editor" && (isEditingSelectedEvent ? "イベント編集" : "イベント追加")}
                {activeEditorTab === "csv" && "CSV一括登録"}
                {activeEditorTab === "news" && "ニュース消去"}
              </p>
              <p className="truncate text-xs font-bold text-on-surface-variant">{selectedSession.name}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileEditorOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface-variant"
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>

          <Tabs className="mb-4 shrink-0 xl:hidden">
            <TabButton value="editor" activeValue={activeEditorTab} onSelect={setActiveEditorTab} tone="purple" icon={<ListTodo size={14} />}>
              {isEditingSelectedEvent ? "手動編集" : "手動追加"}
            </TabButton>
            <TabButton value="csv" activeValue={activeEditorTab} onSelect={setActiveEditorTab} tone="purple" icon={<CalendarClock size={14} />}>
              一括登録 (CSV)
            </TabButton>
            <TabButton value="news" activeValue={activeEditorTab} onSelect={setActiveEditorTab} tone="purple" icon={<Megaphone size={14} />}>
              臨時消去
            </TabButton>
          </Tabs>

          {/* 右カラム内タブコンテンツ */}
          <div className="touch-scroll max-h-[calc(88dvh-7.5rem)] min-h-0 overflow-y-auto pr-1 xl:max-h-none xl:overflow-visible">
            
            {/* CSVインポートタブ */}
            {activeEditorTab === "csv" && (
              <div className="space-y-4 py-2">
                <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                  <h4 className="text-xs font-black text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <CalendarClock size={16} /> タイムスケジュールの一括登録
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                    エクセルやGoogleスプレッドシートで作成したタイムスケジュールデータ（CSV）から、一括で複数のシナリオイベントをタイムスケジュールへ流し込みます。
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center gap-3 p-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/20 dark:bg-slate-950/20">
                  <CsvImporter stocks={stocks} newsPresets={newsPresets} onImportComplete={handleCsvImportComplete} />
                  <button
                    type="button"
                    onClick={handleExportScenarioCsv}
                    className="text-xs bg-white hover:bg-slate-100 text-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 px-4 py-2.5 rounded-xl font-black transition border border-slate-200 dark:border-slate-800 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs w-full sm:w-auto"
                  >
                    <Download size={16} /> CSVエクスポート
                  </button>
                </div>
              </div>
            )}

            {/* 手動追加・編集タブ */}
            {activeEditorTab === "editor" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-1 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span className="inline-flex items-center gap-1.5">
                      {selectedEventForEdit ? <Edit2 size={12} /> : <Sparkles size={12} />}
                      {isEditingSelectedEvent ? "選択中イベントの編集" : "新規イベントの作成"}
                    </span>
                  </span>
                  {selectedEventForEdit && (
                    <button
                      onClick={() => setSelectedEventForEdit(null)}
                      className="text-xs text-slate-400 hover:text-red-500 font-bold border-none bg-transparent cursor-pointer"
                    >
                      キャンセル (クリア)
                    </button>
                  )}
                </div>
                <EventForm
                  key={selectedEventForEdit?.id ? `panel-edit-${selectedEventForEdit.id}` : `panel-new-${newEventFormVersion}`}
                  stocks={stocks}
                  publicSignages={publicSignages}
                  newsPresets={newsPresets}
                  newsPresetById={newsPresetById}
                  sessions={displaySessions}
                  selectedSessionId={draftEventSessionId}
                  onSessionChange={setDraftEventSessionId}
                  editingEvent={selectedEventForEdit}
                  onScheduleRelative={handleSaveEvent}
                  onPublishNow={publishNewsNow}
                  onCancelEdit={() => {
                    setSelectedEventForEdit(null);
                    setDraftEventSessionId(selectedSessionId);
                  }}
                />
              </div>
            )}

            {/* ニュース消去タブ */}
            {activeEditorTab === "news" && (
              <div className="space-y-4 py-2 flex flex-col">
                <div className="bg-slate-50 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
                  <h4 className="text-xs font-black text-rose-500 flex items-center gap-1.5">
                    <Megaphone size={16} className="text-rose-500" /> 配信済みニュースの強制引き戻し
                  </h4>
                  <p className="text-[11px] font-bold text-slate-500 leading-relaxed">
                    すでに市場に配信されているニュースを、強制的に取り消して非表示にします。ここには最新50件を表示しています。
                  </p>
                </div>

                {liveNews.length > 0 && (
                  <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-950 rounded-xl shrink-0 text-[10px] font-black border border-slate-200 dark:border-slate-800">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-500">
                      <input
                        type="checkbox"
                        checked={selectedNewsIds.length === liveNews.length && liveNews.length > 0}
                        onChange={() => {
                          if (selectedNewsIds.length === liveNews.length) setSelectedNewsIds([]);
                          else setSelectedNewsIds(liveNews.map(n => n.id));
                        }}
                        className="rounded w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                      />
                      全選択
                    </label>
                    {selectedNewsIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleBulkDeleteNews}
                        className="text-rose-600 hover:text-rose-500 flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 px-2 py-1 rounded border-none cursor-pointer font-bold"
                      >
                        一括消去 ({selectedNewsIds.length}件)
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-2 pr-1 pb-6">
                  {liveNews.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400 opacity-50 text-center gap-1">
                      <ListTodo size={32} />
                      <p className="font-bold text-[10px]">現在配信中のニュースはありません</p>
                    </div>
                  ) : (
                    liveNews.map((newsItem) => {
                      const isChecked = selectedNewsIds.includes(newsItem.id);
                      return (
                        <div key={newsItem.id} className={`p-3 border rounded-xl flex items-center justify-between gap-3 shadow-xs transition-colors ${isChecked ? "bg-rose-50/30 border-rose-200 dark:bg-rose-950/10 dark:border-rose-900" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedNewsIds(prev => prev.includes(newsItem.id) ? prev.filter(item => item !== newsItem.id) : [...prev, newsItem.id]);
                              }}
                              className="rounded w-3.5 h-3.5 accent-rose-500 cursor-pointer mt-1"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="font-mono text-[8px] text-slate-400">{newsItem.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <Badge variant="success" className="text-[8px] px-1 py-0 scale-90 origin-left">ニュース</Badge>
                              </div>
                              <p className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{newsItem.title}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteLiveNews(newsItem.id, newsItem.title)}
                            className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition shrink-0"
                            title="非表示にして消去"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {isMobileEditorOpen && (
        <button
          type="button"
          aria-label="ツールパネルを閉じる"
          onClick={() => setIsMobileEditorOpen(false)}
          className="fixed inset-0 z-[70] bg-black/45 xl:hidden"
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-[60] grid grid-cols-3 gap-1 border-t border-outline-variant bg-surface/95 px-2 pb-safe pt-2 shadow-2xl backdrop-blur xl:hidden">
        <button type="button" onClick={handleOpenNewEventPanel} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black text-primary hover:bg-primary/8">
          <Plus size={18} />
          追加
        </button>
        <button type="button" onClick={() => openMobileTool("csv")} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black text-on-surface-variant hover:bg-on-surface/8">
          <FileUp size={18} />
          CSV
        </button>
        <button type="button" onClick={() => openMobileTool("news")} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-black text-error hover:bg-error-container/70">
          <Megaphone size={18} />
          消去
        </button>
      </div>
    </AdminPageShell>
  );
}
