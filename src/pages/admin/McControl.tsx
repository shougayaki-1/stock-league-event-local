import { type ReactNode, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { Activity, CalendarClock, ExternalLink, Megaphone, MonitorPlay, Pause, Play, PlaySquare, RadioTower, RotateCcw, SkipForward, UsersRound } from "lucide-react";
import { db } from "../../lib/firebase";
import { callTriggerScenarioEvent, type TriggerScenarioPart } from "../../services/functions";
import { useClassroomActions } from "../../hooks/useClassroomActions";
import { useMarketActions } from "../../hooks/useMarketActions";
import { useSystemSettings } from "../../hooks/useFirebase";
import { getPostNews, getPublicNews, type ScenarioEvent } from "../../types/scenario";
import { PUBLIC_SIGNAGE_PRESETS } from "../../lib/signagePresets";
import { subscribeNewsPresets } from "../../services/newsPresetService";
import type { NewsPreset } from "../../types/newsPreset";
import EmergencyPanel from "../../components/admin/mc/EmergencyPanel";
import GameOpsPanel from "../../components/admin/mc/GameOpsPanel";
import NewsHistoryPanel from "../../components/admin/mc/NewsHistoryPanel";
import RankingPanel from "../../components/admin/mc/RankingPanel";
import StockTickerPanel from "../../components/admin/mc/StockTickerPanel";
import TradeFeedPanel from "../../components/admin/mc/TradeFeedPanel";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Select from "../../components/ui/Select";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { useDialog } from "../../contexts/DialogContext";
import { SCHEDULE_SESSIONS_COLLECTION, type ScheduleSession } from "../../types/schedule";
import ScheduleTimeline from "../../components/admin/schedule/ScheduleTimeline";
import SignageDeviceSwitcher from "../../components/admin/schedule/SignageDeviceSwitcher";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { VIDEO_GROUPS_COLLECTION, type VideoGroup } from "../../types/videoGroup";
import VideoPickerModal from "../../components/admin/video/VideoPickerModal";
import { UNSCHEDULED_SESSION_ID } from "../../lib/appConstants";
import { FIRESTORE_COLLECTIONS } from "../../lib/firestorePaths";
import type { SignagePlaylist } from "../../types/signagePlaylist";

interface PublicSignageDevice {
  id: string;
  name: string;
  location: string;
  liveMode?: string | null;
  manualOverride?: { mode: string; videoAssetId?: string | null; kind?: "NORMAL" | "AD" } | null;
  playlist?: { mode: string; duration: number }[];
  manualPlaylist?: { mode: string; duration: number }[] | null;
  manualPlaylistName?: string | null;
}

type McTab = "ops" | "progress" | "signage" | "monitor";

const formatEventTime = (event: ScenarioEvent, sessionStartMillis: number) => {
  if (event.time && "toDate" in event.time) {
    return event.time.toDate().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }
  return new Date(sessionStartMillis + (event.offsetSeconds || 0) * 1000)
    .toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
};

const getEventTitle = (event: ScenarioEvent, videoNameById: Record<string, string> = {}, signageNameById: Record<string, string> = {}, presetsById: Map<string, NewsPreset> = new Map()) => {
  const publicNews = getPublicNews(event, presetsById);
  if (publicNews?.title) return publicNews.title;
  const postNews = getPostNews(event, presetsById);
  if (postNews?.title) return postNews.title;
  if (event.priceChanges?.length) return "株価イベント";
  const publicPreset = event.publicNewsPresetId ? presetsById.get(event.publicNewsPresetId) : null;
  if (publicPreset?.breakingVideoId) return `速報動画 ${videoNameById[publicPreset.breakingVideoId] || publicPreset.breakingVideoId}`;
  if (publicPreset?.signageDisplay) {
    const signageId = event.signageTargetId || event.signageAction?.signageId || "";
    return `${publicPreset.signageDisplay.kind === "AD" ? "広告" : "サイネージ"} ${signageNameById[signageId] || signageId || "送出先未設定"}${publicPreset.signageDisplay.videoAssetId ? ` / ${videoNameById[publicPreset.signageDisplay.videoAssetId] || publicPreset.signageDisplay.videoAssetId}` : ""}`;
  }
  if (event.breakingVideoId) return `速報動画 ${videoNameById[event.breakingVideoId] || event.breakingVideoId}`;
  if (event.signageAction) return `${event.signageAction.kind === "AD" ? "広告" : "サイネージ"} ${signageNameById[event.signageAction.signageId] || event.signageAction.signageId}${event.signageAction.videoAssetId ? ` / ${videoNameById[event.signageAction.videoAssetId] || event.signageAction.videoAssetId}` : ""}`;
  return "無題のイベント";
};

const formatEventSummary = (event: ScenarioEvent, videoNameById: Record<string, string>, signageNameById: Record<string, string>, presetsById: Map<string, NewsPreset> = new Map()) => {
  const publicNews = getPublicNews(event, presetsById);
  const postNews = getPostNews(event, presetsById);
  const publicPreset = event.publicNewsPresetId ? presetsById.get(event.publicNewsPresetId) : null;
  const breakingVideoId = publicPreset?.breakingVideoId || event.breakingVideoId;
  const signageTargetId = publicPreset?.signageDisplay ? (event.signageTargetId || event.signageAction?.signageId || "") : event.signageAction?.signageId;
  return [
    `株価 ${event.priceChanges?.length || 0}件`,
    `表ニュース ${publicNews?.title ? "あり" : "-"}`,
    `ネタばらし ${postNews?.title ? (postNews.delaySeconds ? `${postNews.delaySeconds}秒後` : "あり") : "-"}`,
    `速報 ${breakingVideoId ? videoNameById[breakingVideoId] || breakingVideoId : "-"}`,
    `サイネージ ${signageTargetId ? signageNameById[signageTargetId] || signageTargetId : "-"}`
  ].join(" / ");
};

const getEventMillis = (event: ScenarioEvent) => {
  if (event.time && "toMillis" in event.time) return event.time.toMillis();
  return null;
};

const hasMainPart = (event: ScenarioEvent, presetsById: Map<string, NewsPreset> = new Map()) => Boolean(
  event.priceChanges?.length ||
  getPublicNews(event, presetsById)?.title ||
  (event.publicNewsPresetId && presetsById.get(event.publicNewsPresetId)?.breakingVideoId) ||
  (event.publicNewsPresetId && presetsById.get(event.publicNewsPresetId)?.signageDisplay) ||
  event.breakingVideoId ||
  (event.signageAction?.signageId && event.signageAction.mode)
);

const isMainProcessed = (event: ScenarioEvent, presetsById: Map<string, NewsPreset> = new Map()) => !hasMainPart(event, presetsById) || event.processedParts?.main === true || (event.isProcessed && !getPostNews(event, presetsById)?.title);
const isPostProcessed = (event: ScenarioEvent, presetsById: Map<string, NewsPreset> = new Map()) => !getPostNews(event, presetsById)?.title || event.processedParts?.postNews === true || event.isProcessed;

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
};

const formatClock = (millis: number | null) => {
  if (millis == null) return "--:--";
  return new Date(millis).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const getPresetName = (mode?: string | null) => PUBLIC_SIGNAGE_PRESETS.find(preset => preset.id === mode)?.name || mode || "未設定";
export default function McControl() {
  const systemSettings = useSystemSettings();
  const scenarioMode = systemSettings?.scenarioMode === "MANUAL" ? "MANUAL" : "AUTO";
  const globalPhase = systemSettings?.globalPhase || "STOP";
  const { alert, confirm } = useDialog();
  const { setSystemPhase } = useMarketActions();
  const { activeUsers, settings: classroomSettings, handlePhaseEnd, isProcessing } = useClassroomActions();

  const [events, setEvents] = useState<ScenarioEvent[]>([]);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [videoGroups, setVideoGroups] = useState<VideoGroup[]>([]);
  const [signagePlaylists, setSignagePlaylists] = useState<SignagePlaylist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [isVideoPickerOpen, setIsVideoPickerOpen] = useState(false);
  const [newsPresets, setNewsPresets] = useState<NewsPreset[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(UNSCHEDULED_SESSION_ID);
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<ScenarioEvent | null>(null);
  const [signages, setSignages] = useState<PublicSignageDevice[]>([]);
  const [selectedSignageId, setSelectedSignageId] = useState<string>("");
  const [selectedManualVideoId, setSelectedManualVideoId] = useState("");
  const [triggeringEventId, setTriggeringEventId] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(0.5);
  const [isLoopPreview, setIsLoopPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<McTab>("ops");
  const [nowMillis, setNowMillis] = useState(() => Date.now());
  const [, setIsLiveModeUpdating] = useState(false);
  const [isPhaseUpdating, setIsPhaseUpdating] = useState(false);
  const [isScenarioModeUpdating, setIsScenarioModeUpdating] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMillis(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(collection(db, SCHEDULE_SESSIONS_COLLECTION), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleSession));
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
    const unsub = onSnapshot(collection(db, "events"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ScenarioEvent));
      list.sort((a, b) => {
        const aTime = getEventMillis(a);
        const bTime = getEventMillis(b);
        if (aTime != null && bTime != null) return aTime - bTime;
        if (aTime != null) return -1;
        if (bTime != null) return 1;
        return (a.offsetSeconds || 0) - (b.offsetSeconds || 0);
      });
      setEvents(list);
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
    const unsub = onSnapshot(collection(db, VIDEO_GROUPS_COLLECTION), (snap) => {
      setVideoGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoGroup)));
    });
    return () => unsub();
  }, []);

  useEffect(() => subscribeNewsPresets(setNewsPresets), []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "public_signages"), (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "一般モニター",
          location: data.location || "",
          liveMode: typeof data.liveMode === "string" ? data.liveMode : null,
          manualOverride: data.manualOverride || null,
          playlist: Array.isArray(data.playlist) ? data.playlist : [],
          manualPlaylist: Array.isArray(data.manualPlaylist) && data.manualPlaylist.length > 0 ? data.manualPlaylist : null,
          manualPlaylistName: typeof data.manualPlaylistName === "string" ? data.manualPlaylistName : null
        };
      });
      setSignages(list);
      setSelectedSignageId(prev => prev || list[0]?.id || "");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.signagePlaylists), (snap) => {
      setSignagePlaylists(snap.docs.map(d => ({ id: d.id, ...d.data() } as SignagePlaylist)));
    });
    return () => unsub();
  }, []);

  const selectedSignage = useMemo(() => signages.find(sig => sig.id === selectedSignageId) || signages[0] || null, [selectedSignageId, signages]);
  const selectedManualVideo = useMemo(() => videoLibrary.find(video => video.id === selectedManualVideoId) || null, [selectedManualVideoId, videoLibrary]);
  const unscheduledSession = useMemo<ScheduleSession>(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { id: UNSCHEDULED_SESSION_ID, name: "未分類", startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), order: -1 };
  }, []);
  const displaySessions = useMemo(() => [unscheduledSession, ...sessions], [sessions, unscheduledSession]);
  const selectedSession = displaySessions.find(session => session.id === selectedSessionId) || displaySessions[0];
  const videoNameById = useMemo(() => Object.fromEntries(videoLibrary.map(video => [video.id, video.name])), [videoLibrary]);
  const newsPresetById = useMemo(() => new Map(newsPresets.map(preset => [preset.id, preset])), [newsPresets]);
  const signageNameById = useMemo(() => Object.fromEntries(signages.map(signage => [signage.id, signage.name || signage.id])), [signages]);
  const sessionEvents = useMemo(() => {
    if (selectedSessionId === UNSCHEDULED_SESSION_ID) return events.filter(event => !event.sessionId);
    return events.filter(event => event.sessionId === selectedSessionId);
  }, [events, selectedSessionId]);
  const previewUrl = selectedSignage ? `${window.location.origin}/signage/public?id=${selectedSignage.id}${isLoopPreview ? "&previewLoop=1" : ""}` : "";
  const previewViewportPercent = `${100 / previewScale}%`;
  const unprocessedEvents = useMemo(() => sessionEvents.filter(event => !event.isProcessed), [sessionEvents]);
  const scheduledEvents = useMemo(() => sessionEvents.filter(event => getEventMillis(event) != null), [sessionEvents]);
  const processedCount = sessionEvents.filter(event => event.isProcessed).length;
  const nextEvent = unprocessedEvents.find(event => {
    const millis = getEventMillis(event);
    return millis == null || millis >= nowMillis;
  }) || unprocessedEvents[0] || null;
  const lastStartedEvent = [...events].reverse().find(event => {
    const millis = getEventMillis(event);
    return millis != null && millis <= nowMillis;
  }) || null;
  const firstScheduledMillis = scheduledEvents[0] ? getEventMillis(scheduledEvents[0]) : null;
  const lastScheduledMillis = scheduledEvents[scheduledEvents.length - 1] ? getEventMillis(scheduledEvents[scheduledEvents.length - 1]) : null;
  const scenarioProgressPercent = sessionEvents.length > 0 ? Math.round((processedCount / sessionEvents.length) * 100) : 0;
  const timelineProgressPercent = firstScheduledMillis != null && lastScheduledMillis != null && lastScheduledMillis > firstScheduledMillis
    ? Math.min(100, Math.max(0, ((nowMillis - firstScheduledMillis) / (lastScheduledMillis - firstScheduledMillis)) * 100))
    : scenarioProgressPercent;
  const nextEventMillis = nextEvent ? getEventMillis(nextEvent) : null;
  const nextEventCountdown = nextEventMillis != null ? formatDuration((nextEventMillis - nowMillis) / 1000) : "--:--";
  const loopFirstItem = selectedSignage?.playlist?.[0] || null;
  const tabs: { id: McTab; label: string; icon: ReactNode }[] = [
    { id: "ops", label: "操作", icon: <Play size={16} /> },
    { id: "progress", label: "進行", icon: <CalendarClock size={16} /> },
    { id: "signage", label: "サイネージ", icon: <MonitorPlay size={16} /> },
    { id: "monitor", label: "モニター", icon: <Activity size={16} /> }
  ];

  const requestSystemPhase = async (phase: "RUNNING" | "STOP") => {
    if (globalPhase === phase) return;
    if (globalPhase === "EMERGENCY" && phase === "STOP") {
      await alert({ title: "緊急モード中です", message: "緊急状態の解除は同じ画面の「緊急操作」パネルから行ってください。", variant: "warning" });
      return;
    }

    const isStart = phase === "RUNNING";
    const ok = await confirm({
      title: isStart ? "市場を開始しますか？" : "市場を停止しますか？",
      message: isStart
        ? "参加者側の売買受付を開始します。本番進行中に押し間違いがないか確認してください。"
        : "参加者側の売買受付を停止します。本番進行中に押し間違いがないか確認してください。",
      confirmText: isStart ? "開始する" : "停止する",
      variant: isStart ? "warning" : "danger"
    });
    if (!ok) return;

    setIsPhaseUpdating(true);
    try {
      await setSystemPhase(phase);
    } catch (error) {
      await alert({ title: "市場フェーズ変更失敗", message: error instanceof Error ? error.message : "市場フェーズを変更できませんでした。", variant: "danger" });
    } finally {
      setIsPhaseUpdating(false);
    }
  };

  const updateScenarioMode = async (mode: "AUTO" | "MANUAL") => {
    if (scenarioMode === mode) return;

    const ok = await confirm({
      title: `シナリオを ${mode} に切り替えますか？`,
      message: mode === "AUTO"
        ? "予約時刻に沿った自動進行へ切り替えます。"
        : "MCの手動発火で進行するモードへ切り替えます。",
      confirmText: `${mode} にする`,
      variant: "warning"
    });
    if (!ok) return;

    setIsScenarioModeUpdating(true);
    try {
      await setDoc(doc(db, "settings", "system"), { scenarioMode: mode }, { merge: true });
    } catch (error) {
      await alert({ title: "モード変更失敗", message: error instanceof Error ? error.message : "シナリオモードを変更できませんでした。", variant: "danger" });
    } finally {
      setIsScenarioModeUpdating(false);
    }
  };

  const triggerEvent = async (event: ScenarioEvent, part: TriggerScenarioPart = "ALL") => {
    const partLabel = part === "POST_NEWS" ? "後出しニュース" : part === "MAIN" ? "表・株価・サイネージ" : "シナリオ";
    const ok = await confirm({
      title: `${partLabel}を発火しますか？`,
      message: `「${getEventTitle(event, videoNameById, signageNameById, newsPresetById)}」の${partLabel}を今すぐ発火します。`,
      confirmText: "発火する",
      variant: "warning"
    });
    if (!ok) return;

    const triggerKey = `${event.id}:${part}`;
    setTriggeringEventId(triggerKey);
    try {
      await callTriggerScenarioEvent({ eventId: event.id, part });
      await alert({ title: "発火完了", message: `${partLabel}を実行しました。`, variant: "success" });
    } catch (error) {
      await alert({ title: "発火失敗", message: error instanceof Error ? error.message : "イベントの実行に失敗しました。", variant: "danger" });
    } finally {
      setTriggeringEventId(null);
    }
  };

  const updateLiveModeForSignage = async (signageId: string, mode: string | null) => {
    setIsLiveModeUpdating(true);
    try {
      await updateDoc(doc(db, "public_signages", signageId), {
        manualOverride: mode
          ? {
              mode,
              videoAssetId: null,
              kind: "NORMAL",
              startedAt: serverTimestamp()
            }
          : null,
        liveMode: null,
        manualPlaylist: null,
        manualPlaylistName: null,
        manualModeUpdatedAt: serverTimestamp()
      });
    } catch (error) {
      await alert({ title: "サイネージ操作失敗", message: error instanceof Error ? error.message : "サイネージ表示を切り替えられませんでした。", variant: "danger" });
    } finally {
      setIsLiveModeUpdating(false);
    }
  };

  const sendVideoToSignage = async () => {
    if (!selectedSignage || !selectedManualVideoId) return;
    setIsLiveModeUpdating(true);
    try {
      await updateDoc(doc(db, "public_signages", selectedSignage.id), {
        manualOverride: {
          mode: "FULL_MOVIE",
          videoAssetId: selectedManualVideoId,
          kind: "AD",
          startedAt: serverTimestamp()
        },
        liveMode: null,
        manualPlaylist: null,
        manualPlaylistName: null,
        manualModeUpdatedAt: serverTimestamp()
      });
      await alert({ title: "動画を送出しました", message: `${selectedSignage.name} に「${selectedManualVideo?.name || selectedManualVideoId}」を流します。`, variant: "success" });
    } catch (error) {
      await alert({ title: "動画送出失敗", message: error instanceof Error ? error.message : "サイネージに動画を送出できませんでした。", variant: "danger" });
    } finally {
      setIsLiveModeUpdating(false);
    }
  };

  const sendPlaylistToSignage = async () => {
    if (!selectedSignage || !selectedPlaylistId) return;
    const playlist = signagePlaylists.find(item => item.id === selectedPlaylistId);
    if (!playlist || playlist.items.length === 0) return;
    setIsLiveModeUpdating(true);
    try {
      await updateDoc(doc(db, "public_signages", selectedSignage.id), {
        manualPlaylist: playlist.items,
        manualPlaylistName: playlist.name,
        manualOverride: null,
        liveMode: null,
        manualModeUpdatedAt: serverTimestamp()
      });
      await alert({ title: "プレイリストを送出しました", message: `${selectedSignage.name} で「${playlist.name}」を1回再生します。`, variant: "success" });
    } catch (error) {
      await alert({ title: "プレイリスト送出失敗", message: error instanceof Error ? error.message : "サイネージにプレイリストを送出できませんでした。", variant: "danger" });
    } finally {
      setIsLiveModeUpdating(false);
    }
  };

  const openPreviewWindow = () => {
    if (!previewUrl) return;
    const opened = window.open(previewUrl, "_blank", "width=1280,height=720");
    if (!opened) {
      void alert({ title: "別窓を開けませんでした", message: "ブラウザのポップアップブロック設定を確認してください。", variant: "warning" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 p-4 pb-32 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black text-on-surface"><RadioTower className="text-primary" /> MCコントロール</h2>
          <p className="mt-1 text-sm font-bold text-on-surface-variant">シナリオ、教室、一般モニターを本番進行用にまとめて操作します。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={globalPhase === "RUNNING" ? "success" : "warning"}>市場: {globalPhase === "RUNNING" ? "取引中" : globalPhase === "EMERGENCY" ? "緊急" : "停止中"}</Badge>
          <Badge variant={scenarioMode === "MANUAL" ? "info" : "success"}>シナリオ: {scenarioMode === "MANUAL" ? "手動発火" : "自動進行"}</Badge>
          <Badge variant={sessionEvents.length === 0 ? "warning" : unprocessedEvents.length === 0 ? "success" : "info"}>進行 {processedCount}/{sessionEvents.length}</Badge>
          <Badge variant="info">入室中 {activeUsers.length} 名</Badge>
        </div>
      </div>

      <Tabs role="tablist" aria-label="MC画面の表示切り替え" className="border-outline-variant">
        {tabs.map(tab => (
          <TabButton
            key={tab.id}
            id={`mc-tab-${tab.id}`}
            role="tab"
            aria-controls={`mc-panel-${tab.id}`}
            value={tab.id}
            activeValue={activeTab}
            onSelect={setActiveTab}
            tone="blue"
            icon={tab.icon}
            className="px-4 py-3 text-sm"
          >
            {tab.label}
          </TabButton>
        ))}
      </Tabs>

      {activeTab === "ops" && (
        <div
          id="mc-panel-ops"
          role="tabpanel"
          aria-labelledby="mc-tab-ops"
          className="flex flex-col gap-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Play size={20} /> 進行操作</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">市場フェーズ</p>
                <div className="mb-3 rounded-md bg-surface px-3 py-2">
                  <p className="text-[11px] font-black text-on-surface">{globalPhase === "RUNNING" ? "取引中" : globalPhase === "EMERGENCY" ? "緊急モード" : "停止中"}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant">{globalPhase === "RUNNING" ? "参加者の売買を受け付けています。" : "参加者側の取引は停止しています。"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-14 w-full whitespace-nowrap px-3 text-sm" variant={globalPhase === "RUNNING" ? "primary" : "outline"} disabled={isPhaseUpdating} isLoading={isPhaseUpdating && globalPhase !== "RUNNING"} onClick={() => requestSystemPhase("RUNNING")}>
                    <Play size={16} className="shrink-0" /> 開始
                  </Button>
                  <Button className="h-14 w-full whitespace-nowrap px-3 text-sm" variant={globalPhase === "STOP" ? "secondary" : "outline"} disabled={isPhaseUpdating} isLoading={isPhaseUpdating && globalPhase !== "STOP"} onClick={() => requestSystemPhase("STOP")}>
                    <Pause size={16} className="shrink-0" /> 停止
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-on-surface-variant">シナリオ進行モード</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-14 w-full whitespace-nowrap px-3 text-sm" variant={scenarioMode === "AUTO" ? "primary" : "outline"} disabled={isScenarioModeUpdating} onClick={() => updateScenarioMode("AUTO")}>自動進行</Button>
                  <Button className="h-14 w-full whitespace-nowrap px-3 text-sm" variant={scenarioMode === "MANUAL" ? "primary" : "outline"} disabled={isScenarioModeUpdating} onClick={() => updateScenarioMode("MANUAL")}>手動発火</Button>
                </div>
              </div>

              <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-on-surface-variant"><UsersRound size={14} /> フェーズ終了</p>
                <Button className="h-14 w-full whitespace-nowrap px-3 text-sm" variant="danger" disabled={!classroomSettings.autoCheckoutOnPhaseEnd || activeUsers.length === 0 || isProcessing} isLoading={isProcessing} onClick={handlePhaseEnd}>
                  全員退出
                </Button>
                {!classroomSettings.autoCheckoutOnPhaseEnd && <p className="mt-2 text-[10px] font-bold text-on-surface-variant">設定で自動退出が無効です。</p>}
                {classroomSettings.autoCheckoutOnPhaseEnd && activeUsers.length === 0 && <p className="mt-2 text-[10px] font-bold text-on-surface-variant">入室中のユーザーがいません。</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock size={20} /> 実行シナリオ</CardTitle>
              <p className="text-xs font-bold text-on-surface-variant">ここで選んだシナリオが、即座開戦・進行状況・未処理発火一覧の対象になります。</p>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
              <Select
                label="今回進行するシナリオ"
                value={selectedSessionId}
                onChange={e => {
                  setSelectedSessionId(e.target.value);
                  setSelectedTimelineEvent(null);
                }}
              >
                {displaySessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </Select>
              <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">選択中</p>
                <p className="mt-1 truncate text-lg font-black text-on-surface">{selectedSession.name}</p>
                <p className="mt-1 text-xs font-bold text-on-surface-variant">未処理 {unprocessedEvents.length} / 全 {sessionEvents.length}</p>
              </div>
            </CardContent>
          </Card>

          <GameOpsPanel events={sessionEvents} sessionName={selectedSession.name} />
          <EmergencyPanel emergencyState={systemSettings?.emergencyState} />
        </div>
      )}

      {activeTab === "progress" && (
        <div
          id="mc-panel-progress"
          role="tabpanel"
          aria-labelledby="mc-tab-progress"
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock size={20} /> AUTO進行状況</CardTitle>
              <p className="text-xs font-bold text-on-surface-variant">シナリオモードをAUTOにした場合の現在位置をMCから確認できます。</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">市場フェーズ</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{globalPhase === "RUNNING" ? "取引中" : globalPhase === "EMERGENCY" ? "緊急" : "停止中"}</p>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">処理済み</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{processedCount} / {sessionEvents.length}</p>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">次の発火</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{nextEventMillis != null ? nextEventCountdown : "未予約"}</p>
                </div>
                <div className="rounded-lg border border-outline-variant bg-surface-container p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">現在時刻</p>
                  <p className="mt-1 text-lg font-black text-on-surface">{formatClock(nowMillis)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {displaySessions.map(session => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-black ${selectedSessionId === session.id ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"}`}
                  >
                    {session.name}
                  </button>
                ))}
              </div>

              <ScheduleTimeline
                session={selectedSession}
                events={sessionEvents}
                now={new Date(nowMillis)}
                selectedEventId={selectedTimelineEvent?.id || null}
                videoNameById={videoNameById}
                signageNameById={signageNameById}
                newsPresetById={newsPresetById}
                onSelectEvent={setSelectedTimelineEvent}
              />
              {selectedTimelineEvent && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container p-3">
                  <p className="min-w-0 truncate text-xs font-black text-on-surface">{getEventTitle(selectedTimelineEvent, videoNameById, signageNameById, newsPresetById)}</p>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" disabled={scenarioMode !== "MANUAL" || isMainProcessed(selectedTimelineEvent, newsPresetById)} isLoading={triggeringEventId === `${selectedTimelineEvent.id}:MAIN`} onClick={() => triggerEvent(selectedTimelineEvent, "MAIN")}>
                      <SkipForward size={14} /> 表・株価
                    </Button>
                    {getPostNews(selectedTimelineEvent, newsPresetById)?.title && (
                      <Button size="sm" variant="danger" disabled={scenarioMode !== "MANUAL" || isPostProcessed(selectedTimelineEvent, newsPresetById)} isLoading={triggeringEventId === `${selectedTimelineEvent.id}:POST_NEWS`} onClick={() => triggerEvent(selectedTimelineEvent, "POST_NEWS")}>
                        <SkipForward size={14} /> 後出し
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-outline-variant bg-surface p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-black text-on-surface">タイムライン進行</p>
                  <p className="font-mono text-xs font-black text-on-surface-variant">{Math.round(timelineProgressPercent)}%</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-container-high">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${timelineProgressPercent}%` }} />
                </div>
                <div className="mt-3 grid gap-2 text-xs font-bold text-on-surface-variant md:grid-cols-2">
                  <p>直近: {lastStartedEvent ? `${formatClock(getEventMillis(lastStartedEvent))} / ${getEventTitle(lastStartedEvent, videoNameById, signageNameById, newsPresetById)}` : "まだ開始されていません"}</p>
                  <p>次回: {nextEvent ? `${formatClock(nextEventMillis)} / ${getEventTitle(nextEvent, videoNameById, signageNameById, newsPresetById)}` : "未処理イベントはありません"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarClock size={20} /> 未処理シナリオ</CardTitle>
              <p className="text-xs font-bold text-on-surface-variant">MANUAL時はここからニュース・株価イベントを発火します。</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {unprocessedEvents.map(event => (
                  <div key={event.id} className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface p-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-on-surface">{getEventTitle(event, videoNameById, signageNameById, newsPresetById)}</p>
                      <p className="text-xs font-bold text-on-surface-variant">目安 {formatEventTime(event, selectedSession.startAt.toMillis())} / {formatEventSummary(event, videoNameById, signageNameById, newsPresetById)}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {hasMainPart(event, newsPresetById) && (
                        <Button size="sm" className="h-11 shrink-0 whitespace-nowrap px-3" disabled={scenarioMode !== "MANUAL" || isMainProcessed(event, newsPresetById)} isLoading={triggeringEventId === `${event.id}:MAIN`} onClick={() => triggerEvent(event, "MAIN")}>
                          <SkipForward size={14} className="shrink-0" /> 表・株価
                        </Button>
                      )}
                      {getPostNews(event, newsPresetById)?.title && (
                        <Button size="sm" variant="danger" className="h-11 shrink-0 whitespace-nowrap px-3" disabled={scenarioMode !== "MANUAL" || isPostProcessed(event, newsPresetById)} isLoading={triggeringEventId === `${event.id}:POST_NEWS`} onClick={() => triggerEvent(event, "POST_NEWS")}>
                          <SkipForward size={14} className="shrink-0" /> 後出し
                        </Button>
                      )}
                      {!hasMainPart(event, newsPresetById) && !getPostNews(event, newsPresetById)?.title && (
                        <Button size="sm" className="h-11 shrink-0 whitespace-nowrap px-3" disabled={scenarioMode !== "MANUAL"} isLoading={triggeringEventId === `${event.id}:ALL`} onClick={() => triggerEvent(event, "ALL")}>
                          <SkipForward size={14} className="shrink-0" /> 発火
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {unprocessedEvents.length === 0 && <p className="py-10 text-center font-black text-on-surface-variant">未処理イベントはありません。</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "signage" && (
        <div
          id="mc-panel-signage"
          role="tabpanel"
          aria-labelledby="mc-tab-signage"
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_36rem]"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MonitorPlay size={20} /> サイネージ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SignageDeviceSwitcher
                signages={signages}
                selectedSignageId={selectedSignage?.id || ""}
                onSelectSignage={setSelectedSignageId}
                onSelectPreset={updateLiveModeForSignage}
              />
              <div className="rounded-lg border border-outline-variant bg-surface-container p-3">
                <p className="text-xs font-black text-on-surface">ループ復帰後の先頭表示</p>
                <p className="mt-1 text-xs font-bold text-on-surface-variant">{loopFirstItem ? `${getPresetName(loopFirstItem.mode)} / ${loopFirstItem.duration}秒` : "プレイリストが未設定です"}</p>
                <Button
                  variant={isLoopPreview ? "primary" : "outline"}
                  className="mt-3 h-10 w-full whitespace-nowrap"
                  disabled={!selectedSignage}
                  onClick={() => setIsLoopPreview(prev => !prev)}
                >
                  <MonitorPlay size={16} className="shrink-0" /> {isLoopPreview ? "通常プレビューに戻す" : "ループ復帰プレビュー"}
                </Button>
              </div>
              <div className="rounded-lg border border-outline-variant bg-surface-container p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-black text-on-surface"><Megaphone size={14} /> 動画送出</p>
                    <p className="mt-1 text-xs font-bold text-on-surface-variant">動画終了後は自動で元のサイネージ表示へ戻ります。</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 whitespace-nowrap"
                    disabled={!selectedSignage}
                    onClick={() => selectedSignage && updateLiveModeForSignage(selectedSignage.id, null)}
                  >
                    <RotateCcw size={14} /> 戻す
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="w-full">
                    <label className="mb-1.5 block text-xs font-medium text-on-surface-variant">流す動画</label>
                    <button
                      type="button"
                      onClick={() => setIsVideoPickerOpen(true)}
                      className="w-full truncate rounded-xl border border-outline px-4 py-3 text-left font-medium text-on-surface transition-colors hover:border-primary"
                    >
                      {selectedManualVideo?.name || "動画を選択"}
                    </button>
                  </div>
                  <Button
                    className="h-11 self-end whitespace-nowrap"
                    disabled={!selectedSignage || !selectedManualVideoId}
                    onClick={sendVideoToSignage}
                  >
                    <Play size={16} /> 送出
                  </Button>
                </div>
                {selectedSignage?.manualOverride?.mode === "FULL_MOVIE" && (
                  <p className="mt-2 text-xs font-bold text-on-surface-variant">
                    現在送出中: {selectedSignage.manualOverride.videoAssetId ? videoNameById[selectedSignage.manualOverride.videoAssetId] || selectedSignage.manualOverride.videoAssetId : "動画"}
                  </p>
                )}
                {videoLibrary.length === 0 && <p className="mt-2 text-xs font-bold text-on-surface-variant">動画ライブラリに動画がありません。</p>}
                <VideoPickerModal
                  isOpen={isVideoPickerOpen}
                  onClose={() => setIsVideoPickerOpen(false)}
                  videoLibrary={videoLibrary}
                  groups={videoGroups}
                  selectedVideoId={selectedManualVideoId}
                  onSelect={setSelectedManualVideoId}
                  title="流す動画を選択"
                />
                <div className="mt-4 border-t border-outline-variant pt-4">
                  <p className="flex items-center gap-2 text-xs font-black text-on-surface"><PlaySquare size={14} /> プレイリスト送出</p>
                  <p className="mt-1 text-xs font-bold text-on-surface-variant">選択したプレイリストを先頭から1回再生し、終了後は自動表示に戻ります。</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Select
                      aria-label="送出するプレイリスト"
                      value={selectedPlaylistId}
                      onChange={event => setSelectedPlaylistId(event.target.value)}
                    >
                      <option value="">プレイリストを選択</option>
                      {signagePlaylists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name}（{playlist.items.length}件）</option>)}
                    </Select>
                    <Button className="h-11 self-end whitespace-nowrap" disabled={!selectedSignage || !selectedPlaylistId} onClick={sendPlaylistToSignage}>
                      <Play size={16} /> 送出
                    </Button>
                  </div>
                  {selectedSignage?.manualPlaylist && (
                    <p className="mt-2 text-xs font-bold text-on-surface-variant">現在送出中: {selectedSignage.manualPlaylistName || `${selectedSignage.manualPlaylist.length}件のプレイリスト`}</p>
                  )}
                  {signagePlaylists.length === 0 && <p className="mt-2 text-xs font-bold text-on-surface-variant">プレイリストライブラリにプレイリストがありません。</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>プレビュー</CardTitle>
                  <p className="mt-1 text-xs font-bold text-on-surface-variant">初回はプレビュー内の START SIGNAGE 操作が必要です。ローカル動画は管理者ブラウザにキャッシュがない場合、再生されません。</p>
                </div>
                <Button variant="outline" size="sm" className="h-10 shrink-0 whitespace-nowrap" disabled={!previewUrl} onClick={openPreviewWindow}>
                  <ExternalLink size={14} className="shrink-0" /> 別窓
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container px-3 py-2">
                <span className="shrink-0 text-xs font-black text-on-surface-variant">縮小</span>
                <input
                  type="range"
                  min="0.35"
                  max="1"
                  step="0.05"
                  value={previewScale}
                  onChange={e => setPreviewScale(Number(e.target.value))}
                  className="min-w-0 flex-1 accent-primary"
                />
                <span className="w-12 text-right font-mono text-xs font-black text-on-surface-variant">{Math.round(previewScale * 100)}%</span>
              </div>
              <div className="aspect-video overflow-hidden rounded-lg border border-outline-variant bg-black">
                {previewUrl ? (
                  <iframe
                    title="public signage preview"
                    src={previewUrl}
                    className="origin-top-left border-0"
                    style={{
                      width: previewViewportPercent,
                      height: previewViewportPercent,
                      transform: `scale(${previewScale})`
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-black text-white/50">モニターがありません</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "monitor" && (
        <div
          id="mc-panel-monitor"
          role="tabpanel"
          aria-labelledby="mc-tab-monitor"
          className="grid gap-6 xl:grid-cols-2 2xl:grid-cols-3"
        >
          <NewsHistoryPanel />
          <StockTickerPanel />
          <RankingPanel />
          <TradeFeedPanel />
        </div>
      )}
    </div>
  );
}
