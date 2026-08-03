// src/pages/signage/PublicSignage.tsx

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { useAllUsersRanking, useClassroomUsers, useMarketData, useNewsWithStatus, useSystemSignal } from "../../hooks/useFirebase";
import type { ChartData, Stock } from "../../types/domain";
import { createHistoryPoint, createMarketHistory, materializeStocks } from "../../lib/marketPricing";
import { Settings, Volume2, TrendingDown, TrendingUp, Cloud, HardDrive, Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { useSound } from "../../hooks/useSound";
import { clampMediaElementGain, useMediaElementGain } from "../../hooks/useMediaElementGain";
import { useScreenWakeLock } from "../../hooks/useScreenWakeLock";
import { useServerClock } from "../../lib/serverTime";
import { formatVideoBytes, getCloudVideoObjectUrl, getOptimizedStatusLabel, getPreferredVideoAsset, pruneCloudVideoCache, type CloudVideoCacheResult } from "../../lib/cloudVideos";
import { getCloudImageObjectUrl, pruneCloudImageCache, type CloudImageCacheResult } from "../../lib/cloudImages";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";
import { IMAGE_LIBRARY_COLLECTION, type ImageLibraryItem } from "../../types/imageLibrary";
import type { ScenarioEvent } from "../../types/scenario";
import type { NewsPreset } from "../../types/newsPreset";
import type { ScheduleSession } from "../../types/schedule";
import { subscribeScheduleSessions } from "../../services/scenarioService";
import { FIRESTORE_COLLECTIONS, FIRESTORE_DOCS } from "../../lib/firestorePaths";
import { PLAYLIST_TIMING, PUBLIC_SIGNAGE_CACHE } from "../../lib/appConstants";
import { STORAGE_KEYS } from "../../lib/storageKeys";
import { DEFAULT_SIGNAGE_THEME, parseSignageTheme, type SignageTheme } from "../../lib/riddleConstants";
import {
  buildPublicSignageAutoSyncEntries,
  buildPublicSignagePredownloadEntries,
  type ManualOverrideForVideo,
  type ScenarioOverrideForVideo,
  type SignageVideoEntry,
} from "../../lib/publicSignageVideoEntries";

import SignageSettingsModal from "../../components/signage/SignageSettingsModal";
import FullscreenButton from "../../components/signage/FullscreenButton";
import RankingBoard from "../../components/signage/public/RankingBoard";
import NewsDashboard from "../../components/signage/public/NewsDashboard";
import StockGrid from "../../components/signage/public/StockGrid";
import SplitNewsStock from "../../components/signage/public/SplitNewsStock";
import MarketChartBoard from "../../components/signage/public/MarketChartBoard";
import TransactionMonitor from "../../components/signage/public/TransactionMonitor";
import AverageBoard from "../../components/signage/public/AverageBoard";
import HeatmapGrid from "../../components/signage/public/HeatmapGrid";
import StockTicker from "../../components/signage/public/StockTicker";
import ClassroomGridBoard from "../../components/signage/public/ClassroomGridBoard";
import McTradeCast from "../../components/signage/public/McTradeCast";
import DualNewsBoard from "../../components/signage/public/DualNewsBoard";
import TitleScreen from "../../components/signage/public/TitleScreen";

import type { PlaylistItem } from "../../lib/signagePresets";

interface CacheStatusEntry {
  label: string;
  message: string;
  progress: number;
  bytesTransferred?: number;
  totalBytes?: number;
  fileIndex?: number;
  fileCount?: number;
  stage?: string;
}

interface ScenarioOverride extends ScenarioOverrideForVideo {
  eventId: string;
  mode: string;
  duration: number;
  videoAssetId?: string | null;
  kind?: "NORMAL" | "AD";
  startedAt?: { toMillis?: () => number } | null;
}

interface ManualOverride extends ManualOverrideForVideo {
  mode: string;
  videoAssetId?: string | null;
  imageAssetId?: string | null;
  kind?: "NORMAL" | "AD";
  startedAt?: { toMillis?: () => number } | null;
}

const getManualOverrideKey = (override: ManualOverride | null) => {
  if (!override) return null;
  return [
    override.mode,
    override.videoAssetId || "",
    override.imageAssetId || "",
    override.startedAt?.toMillis?.() ?? "pending",
  ].join(":");
};

export default function PublicSignage() {
  const [searchParams] = useSearchParams();
  const signageId = searchParams.get("id");
  const isLoopPreview = searchParams.get("previewLoop") === "1";

  const [localStocks, setLocalStocks] = useState<Stock[]>([]);
  const [localHistory, setLocalHistory] = useState<ChartData[]>([]);
  const marketData = useMarketData();
  const { serverTimeOffsetMillis } = useServerClock();

  useEffect(() => {
    let timeoutId: number | null = null;
    if (!marketData?.stocks?.length) {
      timeoutId = window.setTimeout(() => {
        setLocalStocks([]);
        setLocalHistory([]);
      }, 0);
      return () => {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      };
    }

    timeoutId = window.setTimeout(() => {
      const serverNow = Date.now() + serverTimeOffsetMillis;
      const fetchedStocks = materializeStocks(marketData, serverNow);
      setLocalStocks(fetchedStocks);

      setLocalHistory((prev) => {
        if (prev.length === 0) {
          return createMarketHistory(marketData, 30, 10000, serverNow);
        }
        return prev;
      });
    }, 0);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [marketData, serverTimeOffsetMillis]);

  useEffect(() => {
    if (!marketData?.stocks?.length) return;
    const interval = setInterval(() => {
      const serverNow = Date.now() + serverTimeOffsetMillis;
      const currentStocks = materializeStocks(marketData, serverNow);
      if (currentStocks.length === 0) return;
      setLocalStocks(currentStocks);

      setLocalHistory((prev) => {
        const next = [...prev, createHistoryPoint(currentStocks, new Date(serverNow))];
        if (next.length > 30) {
          return next.slice(-30);
        }
        return next;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [marketData, serverTimeOffsetMillis]);

  const stocks = localStocks;
  const ranking = useAllUsersRanking();
  const classroomUsers = useClassroomUsers();
  const { news, hasLoaded: hasNewsLoaded } = useNewsWithStatus();
  const chartData = localHistory;
  const [currentTime, setCurrentTime] = useState(new Date());

  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [manualPlaylist, setManualPlaylist] = useState<PlaylistItem[] | null>(null);
  const effectivePlaylist = useMemo(
    () => (manualPlaylist && manualPlaylist.length > 0 ? manualPlaylist : playlist),
    [manualPlaylist, playlist]
  );
  const [signageName, setSignageName] = useState("廊下サイネージ");
  const [signageTheme, setSignageTheme] = useState<SignageTheme>(DEFAULT_SIGNAGE_THEME);
  const [liveMode, setLiveMode] = useState<string | null>(null);
  const [scenarioOverride, setScenarioOverride] = useState<ScenarioOverride | null>(null);
  const [manualOverride, setManualOverride] = useState<ManualOverride | null>(null);
  const [dismissedManualOverrideKey, setDismissedManualOverrideKey] = useState<string | null>(null);
  const activeScenarioOverride = useMemo(() => (
    scenarioOverride?.startedAt?.toMillis && currentTime.getTime() - scenarioOverride.startedAt.toMillis() < Math.max(5, scenarioOverride.duration || 30) * 1000
      ? scenarioOverride
      : null
  ), [currentTime, scenarioOverride]);
  const effectiveManualOverride = useMemo(() => (
    isLoopPreview || (manualOverride !== null && getManualOverrideKey(manualOverride) === dismissedManualOverrideKey)
      ? null
      : (manualOverride || (liveMode ? { mode: liveMode, kind: "NORMAL" as const } : null))
  ), [dismissedManualOverrideKey, isLoopPreview, liveMode, manualOverride]);
  const [allowInterrupt, setAllowInterrupt] = useState(true); 
  const [currentIndex, setCurrentIndex] = useState(0);

  const breakingSignal = useSystemSignal();
  const [isBreaking, setIsBreaking] = useState(false);
  const [breakingVideoId, setBreakingVideoId] = useState<string | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // 設定ボタン等の操作系オーバーレイ。普段は非表示で、マウス移動時に一定時間だけ表示する
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsHideTimerRef = useRef<number | null>(null);
  const [scheduleSessions, setScheduleSessions] = useState<ScheduleSession[]>([]);
  const [localVideos, setLocalVideos] = useState<Record<string, string>>({});
  const localVideosRef = useRef<Record<string, string>>({});
  const localVideoAssetSignatureRef = useRef<Record<string, string>>({});
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const localImagesRef = useRef<Record<string, string>>({});
  const localImageAssetSignatureRef = useRef<Record<string, string>>({});
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [imageLibrary, setImageLibrary] = useState<ImageLibraryItem[]>([]);
  const [cacheStatus, setCacheStatus] = useState<Record<string, CacheStatusEntry>>({});
  const [isPredownloading, setIsPredownloading] = useState(false);
  const [predownloadProgress, setPredownloadProgress] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const attachVideoRef = useCallback((element: HTMLVideoElement | null) => {
    const previous = videoRef.current;
    if (previous && previous !== element) {
      // React が次の動画要素を描画するまで、前の要素のデコーダー／音声出力を
      // 確実に止める。これをしないと古い Object URL の音声が残るブラウザがある。
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
    }
    videoRef.current = element;
  }, []);
  const [scenarioEvents, setScenarioEvents] = useState<ScenarioEvent[]>([]);
  const [newsPresets, setNewsPresets] = useState<NewsPreset[]>([]);

  const { playSound, initAudioContext } = useSound();
  const { applyTheme } = useTheme();
  const knownNewsIdsRef = useRef<Set<string> | null>(null);

  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);
  const [showEmergencyResolvedOverlay, setShowEmergencyResolvedOverlay] = useState(false);
  const [emergencyConfig, setEmergencyConfig] = useState<{type: "UP"|"DOWN", message: string} | null>(null);
  const previousEmergencyActiveRef = useRef(false);

  const [isStarted, setIsStarted] = useState(() => localStorage.getItem(STORAGE_KEYS.PUBLIC_SIGNAGE_STARTED) === "true");
  useScreenWakeLock(isStarted);
  const [videoError, setVideoError] = useState<{ key: string; hasError: boolean } | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const playlistSignatureRef = useRef("");
  const manualPlaylistSignatureRef = useRef("");
  const [prevVideoKey, setPrevVideoKey] = useState("");
  const handledVideoEndKeyRef = useRef("");
  const [isVideoTransitioning, setIsVideoTransitioning] = useState(false);

  const currentVideoKey = `${currentIndex}_${isBreaking}_${breakingVideoId}_${activeScenarioOverride?.eventId || ""}_${effectiveManualOverride?.mode || ""}_${effectiveManualOverride?.videoAssetId || ""}_${effectiveManualOverride?.imageAssetId || ""}_${effectivePlaylist[currentIndex]?.videoAssetId || effectivePlaylist[currentIndex]?.videoUrl || ""}`;
  const hasCurrentVideoError = videoError?.key === currentVideoKey && videoError.hasError;
  const getVideoVolumeGain = useCallback((videoId?: string | null) => {
    if (!videoId) return 1;
    return videoLibrary.find(video => video.id === videoId)?.volumeGain ?? 1;
  }, [videoLibrary]);

  useEffect(() => {
    if (currentVideoKey === prevVideoKey) return;
    setPrevVideoKey(currentVideoKey);
    handledVideoEndKeyRef.current = "";
    setIsVideoTransitioning(false);
    setVideoError(null);
  }, [currentVideoKey, prevVideoKey]);

  useEffect(() => {
    let overlayTimer: number | null = null;
    let hideTimer: number | null = null;
    let resolvedTimer: number | null = null;
    const unsub = onSnapshot(doc(db, ...FIRESTORE_DOCS.systemSettings), (snap) => {
      if (overlayTimer !== null) window.clearTimeout(overlayTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      if (snap.exists()) {
        const data = snap.data();
        const emg = data.emergencyState;
        const wasEmergencyActive = previousEmergencyActiveRef.current;
        const isEmergencyActive = Boolean(emg?.isActive);
        if (wasEmergencyActive && !isEmergencyActive) {
          setShowEmergencyResolvedOverlay(true);
          if (resolvedTimer !== null) window.clearTimeout(resolvedTimer);
          resolvedTimer = window.setTimeout(() => setShowEmergencyResolvedOverlay(false), PLAYLIST_TIMING.emergencyOverlayDurationMs);
        }
        previousEmergencyActiveRef.current = isEmergencyActive;

        if (emg && emg.isActive && emg.overlayExecuteAt) {
          setEmergencyConfig({ type: emg.type, message: emg.message });
          const now = Date.now();
          const executeTime = emg.overlayExecuteAt.toMillis();
          const delay = Math.max(0, executeTime - now);
          overlayTimer = window.setTimeout(() => {
            setShowEmergencyOverlay(true);
            hideTimer = window.setTimeout(() => setShowEmergencyOverlay(false), PLAYLIST_TIMING.emergencyOverlayDurationMs);
          }, delay);
        } else {
          setShowEmergencyOverlay(false);
          setEmergencyConfig(null);
        }
      }
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to systemSettings.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => {
      if (overlayTimer !== null) window.clearTimeout(overlayTimer);
      if (hideTimer !== null) window.clearTimeout(hideTimer);
      if (resolvedTimer !== null) window.clearTimeout(resolvedTimer);
      unsub();
    };
  }, []);

  const prevStocksRef = useRef<Record<string, number>>({});
  const [flashState, setFlashState] = useState<Record<string, "UP" | "DOWN">>({});

  useEffect(() => {
    if (stocks.length === 0) return;
    const newFlash: Record<string, "UP" | "DOWN"> = {};
    stocks.forEach(stock => {
      const prevPrice = prevStocksRef.current[stock.id];
      if (prevPrice !== undefined && prevPrice !== stock.currentPrice) {
        newFlash[stock.id] = stock.currentPrice > prevPrice ? "UP" : "DOWN";
      }
      prevStocksRef.current[stock.id] = stock.currentPrice;
    });
    if (Object.keys(newFlash).length > 0) {
      setFlashState(newFlash);
      setTimeout(() => setFlashState({}), 5000); 
    }
  }, [stocks]);

  useEffect(() => {
    if (!isStarted || !hasNewsLoaded) {
      knownNewsIdsRef.current = null;
      return;
    }

    const previousIds = knownNewsIdsRef.current;
    const currentIds = new Set(news.map(item => item.id));
    if (previousIds === null) {
      knownNewsIdsRef.current = currentIds;
      return;
    }

    if (news.some(item => !previousIds.has(item.id))) {
      playSound("NEWS_ALERT");
    }
    knownNewsIdsRef.current = currentIds;
  }, [news, playSound, isStarted, hasNewsLoaded]);

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t); },[]);

  // スケジュールセッションを購読（MC実況の残り時間算出に使用）
  useEffect(() => {
    const unsub = subscribeScheduleSessions(setScheduleSessions);
    return () => unsub();
  }, []);

  // 現在時刻が start〜end に入っている進行中セッション
  const activeSessionEndTime = useMemo(() => {
    const nowMillis = currentTime.getTime();
    const active = scheduleSessions.find(session => {
      const start = session.startAt?.toMillis?.();
      const end = session.endAt?.toMillis?.();
      return start != null && end != null && nowMillis >= start && nowMillis < end;
    });
    return active?.endAt ?? null;
  }, [scheduleSessions, currentTime]);

  // マウス移動で操作系オーバーレイを表示し、一定時間後に自動で隠す
  const handleControlsActivity = useCallback(() => {
    setControlsVisible(true);
    if (controlsHideTimerRef.current !== null) window.clearTimeout(controlsHideTimerRef.current);
    controlsHideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);
  useEffect(() => () => { if (controlsHideTimerRef.current !== null) window.clearTimeout(controlsHideTimerRef.current); }, []);

  useEffect(() => {
    if (!signageId) return;
    const unsub = onSnapshot(doc(db, FIRESTORE_COLLECTIONS.publicSignages, signageId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const nextPlaylist = data.playlist || [];
        const nextManualPlaylist: PlaylistItem[] | null = Array.isArray(data.manualPlaylist) && data.manualPlaylist.length > 0 ? data.manualPlaylist : null;
        const nextEffectivePlaylist = nextManualPlaylist && nextManualPlaylist.length > 0 ? nextManualPlaylist : nextPlaylist;
        const nextSignature = JSON.stringify(nextEffectivePlaylist.map((item: PlaylistItem) => ({
          mode: item.mode,
          duration: item.duration,
          videoUrl: item.videoUrl,
          videoAssetId: item.videoAssetId,
          imageAssetId: item.imageAssetId,
        })));
        const nextManualPlaylistSignature = JSON.stringify(nextManualPlaylist || []);
        setSignageName(typeof data.name === "string" && data.name.trim() ? data.name.trim() : signageId);
        setSignageTheme(parseSignageTheme(data.theme));
        setPlaylist(nextPlaylist);
        setManualPlaylist(nextManualPlaylist);
        setLiveMode(typeof data.liveMode === "string" ? data.liveMode : null);
        setScenarioOverride(data.scenarioOverride || null);
        const nextManualOverride = data.manualOverride || null;
        setManualOverride(nextManualOverride);
        if (!nextManualOverride) setDismissedManualOverrideKey(null);
        setAllowInterrupt(data.allowInterrupt ?? true);
        if (manualPlaylistSignatureRef.current !== nextManualPlaylistSignature) {
          setCurrentIndex(0);
        }
        if (playlistSignatureRef.current && playlistSignatureRef.current !== nextSignature) {
          setCurrentIndex(prev => Math.min(prev, Math.max(0, nextEffectivePlaylist.length - 1)));
        }
        playlistSignatureRef.current = nextSignature;
        manualPlaylistSignatureRef.current = nextManualPlaylistSignature;
      }
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to publicSignages doc.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => unsub();
  }, [signageId]);

  useEffect(() => {
    applyTheme(signageTheme);
  }, [signageTheme, applyTheme]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_LIBRARY_COLLECTION), (snap) => {
      setVideoLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoLibraryItem)));
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to videoLibrary.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, IMAGE_LIBRARY_COLLECTION), (snap) => {
      setImageLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as ImageLibraryItem)));
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to imageLibrary.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.events), (snap) => {
      setScenarioEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as ScenarioEvent)).filter(event => !event.isProcessed));
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to events.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, FIRESTORE_COLLECTIONS.newsPresets), (snap) => {
      setNewsPresets(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsPreset)));
      setSnapshotError(null);
    }, (error) => {
      console.error("Failed to subscribe to news presets.", error);
      setSnapshotError("データ更新エラー");
    });
    return () => unsub();
  }, []);

  const newsPresetsById = useMemo(() => new Map(newsPresets.map(preset => [preset.id, preset])), [newsPresets]);

  useEffect(() => {
    return () => {
      Object.values(localVideosRef.current).forEach(url => URL.revokeObjectURL(url));
      Object.values(localImagesRef.current).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const getVideoAssetSignature = useCallback((asset?: VideoLibraryItem["videoAsset"] | null) => {
    const preferred = getPreferredVideoAsset(asset);
    if (!preferred?.storagePath || !preferred.version) return null;
    return `${preferred.storagePath}:${preferred.version}`;
  }, []);

  const getImageAssetSignature = useCallback((asset?: ImageLibraryItem["imageAsset"] | null) => {
    if (!asset?.storagePath) return null;
    return `${asset.storagePath}:${asset.updatedAt}`;
  }, []);

  const buildAutoSyncEntries = useCallback((): SignageVideoEntry[] => {
    return buildPublicSignageAutoSyncEntries({
      playlist: effectivePlaylist,
      videoLibrary,
      breakingVideoId,
      scenarioOverride,
      manualOverride: effectiveManualOverride,
      scenarioEvents,
      newsPresetsById,
      signageId,
    });
  }, [effectivePlaylist, videoLibrary, breakingVideoId, scenarioOverride, effectiveManualOverride, scenarioEvents, newsPresetsById, signageId]);

  const buildPredownloadEntries = useCallback((): SignageVideoEntry[] => {
    return buildPublicSignagePredownloadEntries(buildAutoSyncEntries(), videoLibrary);
  }, [buildAutoSyncEntries, videoLibrary]);

  const setCacheProgress = useCallback((key: string, label: string, patch: Partial<CacheStatusEntry>) => {
    setCacheStatus(prev => ({
      ...prev,
      [key]: {
        label,
        message: patch.message || prev[key]?.message || "",
        progress: patch.progress ?? prev[key]?.progress ?? 0,
        bytesTransferred: patch.bytesTransferred ?? prev[key]?.bytesTransferred,
        totalBytes: patch.totalBytes ?? prev[key]?.totalBytes,
        fileIndex: patch.fileIndex ?? prev[key]?.fileIndex,
        fileCount: patch.fileCount ?? prev[key]?.fileCount,
        stage: patch.stage ?? prev[key]?.stage,
      },
    }));
  }, []);

  useEffect(() => {
    if (!signageId) return;
    let isCancelled = false;

    const syncVideos = async () => {
      const entries = buildPredownloadEntries();

      const activeKeys: string[] = [];
      const syncedAssets = new Map<string, CloudVideoCacheResult>();
      for (const [index, entry] of entries.entries()) {
        const cacheKey = `public_${signageId}_${entry.key}`;
        const assetSignature = getVideoAssetSignature(entry.asset);
        activeKeys.push(cacheKey);
        if (assetSignature && localVideosRef.current[entry.key] && localVideoAssetSignatureRef.current[entry.key] === assetSignature) {
          const preferred = getPreferredVideoAsset(entry.asset);
          if (!preferred) continue;
          const optimizedLabel = preferred !== entry.asset ? "軽量版" : getOptimizedStatusLabel(entry.asset);
          syncedAssets.set(assetSignature, {
            url: localVideosRef.current[entry.key],
            source: "cache",
            asset: preferred,
            isOptimized: preferred !== entry.asset,
          });
          setCacheProgress(entry.key, entry.label, {
            message: `端末キャッシュ / ${optimizedLabel} / ${formatVideoBytes(preferred?.size)}`,
            progress: 100,
            bytesTransferred: preferred?.size,
            totalBytes: preferred?.size,
            fileIndex: index + 1,
            fileCount: entries.length,
            stage: "complete",
          });
          continue;
        }
        const syncedAsset = assetSignature ? syncedAssets.get(assetSignature) : undefined;
        if (assetSignature && syncedAsset) {
          localVideosRef.current = { ...localVideosRef.current, [entry.key]: syncedAsset.url };
          localVideoAssetSignatureRef.current = { ...localVideoAssetSignatureRef.current, [entry.key]: assetSignature };
          setLocalVideos(prev => ({ ...prev, [entry.key]: syncedAsset.url }));
          const sourceLabel = syncedAsset.source === "network" ? "クラウド取得済" : syncedAsset.source === "cache" ? "端末キャッシュ" : syncedAsset.source === "direct-url" ? "クラウド直接再生" : "古い端末キャッシュ";
          const optimizedLabel = syncedAsset.isOptimized ? "軽量版" : getOptimizedStatusLabel(entry.asset);
          setCacheProgress(entry.key, entry.label, {
            message: `${sourceLabel} / ${optimizedLabel} / ${formatVideoBytes(syncedAsset.asset.size)}`,
            progress: 100,
            bytesTransferred: syncedAsset.asset.size,
            totalBytes: syncedAsset.asset.size,
            fileIndex: index + 1,
            fileCount: entries.length,
            stage: "complete",
          });
          continue;
        }
        setCacheProgress(entry.key, entry.label, {
          message: `同期中 ${index + 1} / ${entries.length}`,
          progress: 0,
          fileIndex: index + 1,
          fileCount: entries.length,
          stage: "downloading",
        });
        let failureMessage = "未取得";
        const result = await getCloudVideoObjectUrl(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.storeName, cacheKey, entry.asset, progress => {
          if (progress.stage === "failed") failureMessage = progress.message;
          setCacheProgress(entry.key, entry.label, {
            message: progress.message,
            progress: progress.progress,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes,
            stage: progress.stage,
          });
        });
        if (isCancelled) return;
        if (result) {
          const previousUrl = localVideosRef.current[entry.key];
          if (previousUrl && previousUrl !== result.url) URL.revokeObjectURL(previousUrl);
          localVideosRef.current = { ...localVideosRef.current, [entry.key]: result.url };
          localVideoAssetSignatureRef.current = { ...localVideoAssetSignatureRef.current, [entry.key]: `${result.asset.storagePath}:${result.asset.version}` };
          syncedAssets.set(`${result.asset.storagePath}:${result.asset.version}`, result);
          setLocalVideos(prev => ({ ...prev, [entry.key]: result.url }));
          const sourceLabel = result.source === "network" ? "クラウド取得済" : result.source === "cache" ? "端末キャッシュ" : result.source === "direct-url" ? "クラウド直接再生" : "古い端末キャッシュ";
          const optimizedLabel = result.isOptimized ? "軽量版" : getOptimizedStatusLabel(entry.asset);
          setCacheProgress(entry.key, entry.label, {
            message: `${sourceLabel} / ${optimizedLabel} / ${formatVideoBytes(result.asset.size)}`,
            progress: 100,
            bytesTransferred: result.asset.size,
            totalBytes: result.asset.size,
            stage: "complete",
          });
        } else {
          setCacheProgress(entry.key, entry.label, { message: failureMessage, progress: 0, stage: "failed" });
        }
      }
      if (!isCancelled) await pruneCloudVideoCache(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.storeName, activeKeys);
    };

    syncVideos();
    return () => {
      isCancelled = true;
    };
  }, [signageId, buildPredownloadEntries, getVideoAssetSignature, setCacheProgress]);

  const buildImageEntries = useCallback(() => {
    const entries: Array<{ key: string; label: string; asset: ImageLibraryItem["imageAsset"] }> = [];
    effectivePlaylist.forEach((item, index) => {
      if (item.mode !== "FULL_IMAGE" || !item.imageAssetId) return;
      const image = imageLibrary.find(candidate => candidate.id === item.imageAssetId);
      if (image?.imageAsset) entries.push({ key: index.toString(), label: image.name, asset: image.imageAsset });
    });
    if (effectiveManualOverride?.mode === "FULL_IMAGE" && effectiveManualOverride.imageAssetId) {
      const image = imageLibrary.find(candidate => candidate.id === effectiveManualOverride.imageAssetId);
      if (image?.imageAsset) entries.push({ key: `manual_image_${effectiveManualOverride.imageAssetId}`, label: image.name, asset: image.imageAsset });
    }
    return entries;
  }, [effectivePlaylist, effectiveManualOverride, imageLibrary]);

  useEffect(() => {
    if (!signageId) return;
    let isCancelled = false;

    const syncImages = async () => {
      const entries = buildImageEntries();
      const activeKeys: string[] = [];
      const syncedAssets = new Map<string, CloudImageCacheResult>();
      for (const entry of entries) {
        const cacheKey = `public_image_${signageId}_${entry.key}`;
        const assetSignature = getImageAssetSignature(entry.asset);
        activeKeys.push(cacheKey);
        if (assetSignature && localImagesRef.current[entry.key] && localImageAssetSignatureRef.current[entry.key] === assetSignature) {
          continue;
        }
        const syncedAsset = assetSignature ? syncedAssets.get(assetSignature) : undefined;
        if (assetSignature && syncedAsset) {
          localImagesRef.current = { ...localImagesRef.current, [entry.key]: syncedAsset.url };
          localImageAssetSignatureRef.current = { ...localImageAssetSignatureRef.current, [entry.key]: assetSignature };
          setLocalImages(prev => ({ ...prev, [entry.key]: syncedAsset.url }));
          continue;
        }
        const result = await getCloudImageObjectUrl(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.imageStoreName, cacheKey, entry.asset);
        if (isCancelled) return;
        if (result) {
          const previousUrl = localImagesRef.current[entry.key];
          if (previousUrl && previousUrl !== result.url) URL.revokeObjectURL(previousUrl);
          localImagesRef.current = { ...localImagesRef.current, [entry.key]: result.url };
          localImageAssetSignatureRef.current = { ...localImageAssetSignatureRef.current, [entry.key]: `${result.asset.storagePath}:${result.asset.updatedAt}` };
          syncedAssets.set(`${result.asset.storagePath}:${result.asset.updatedAt}`, result);
          setLocalImages(prev => ({ ...prev, [entry.key]: result.url }));
        }
      }
      if (!isCancelled) await pruneCloudImageCache(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.imageStoreName, activeKeys);
    };

    syncImages();
    return () => {
      isCancelled = true;
    };
  }, [signageId, buildImageEntries, getImageAssetSignature]);

  const predownloadImages = useCallback(async () => {
    if (!signageId) return;
    const activeKeys: string[] = [];
    for (const entry of buildImageEntries()) {
      const cacheKey = `public_image_${signageId}_${entry.key}`;
      activeKeys.push(cacheKey);
      const result = await getCloudImageObjectUrl(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.imageStoreName, cacheKey, entry.asset);
      if (result) {
        const previousUrl = localImagesRef.current[entry.key];
        if (previousUrl && previousUrl !== result.url) URL.revokeObjectURL(previousUrl);
        localImagesRef.current = { ...localImagesRef.current, [entry.key]: result.url };
        localImageAssetSignatureRef.current = { ...localImageAssetSignatureRef.current, [entry.key]: `${result.asset.storagePath}:${result.asset.updatedAt}` };
        setLocalImages(prev => ({ ...prev, [entry.key]: result.url }));
      }
    }
    await pruneCloudImageCache(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.imageStoreName, activeKeys);
  }, [buildImageEntries, signageId]);

  const handlePredownloadAll = async () => {
    if (!signageId) return;
    setIsPredownloading(true);
    setPredownloadProgress("");
    try {
      const entries = buildPredownloadEntries();

      const activeKeys: string[] = [];
      for (const [index, entry] of entries.entries()) {
        setPredownloadProgress(`${index + 1} / ${entries.length}`);
        const cacheKey = `public_${signageId}_${entry.key}`;
        activeKeys.push(cacheKey);
        setCacheProgress(entry.key, entry.label, { message: `事前ダウンロード中 ${index + 1} / ${entries.length}`, progress: 0, stage: "downloading" });
        let failureMessage = "未取得";
        const result = await getCloudVideoObjectUrl(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.storeName, cacheKey, entry.asset, progress => {
          if (progress.stage === "failed") failureMessage = progress.message;
          setCacheProgress(entry.key, entry.label, {
            message: progress.message,
            progress: progress.progress,
            bytesTransferred: progress.bytesTransferred,
            totalBytes: progress.totalBytes,
            stage: progress.stage,
          });
        });
        const sourceLabel = result?.source === "cache" ? "端末キャッシュ" : result?.source === "stale-cache" ? "古い端末キャッシュ" : result?.source === "direct-url" ? "クラウド直接再生" : result ? "クラウド取得済" : failureMessage;
        const optimizedLabel = result?.isOptimized ? "軽量版" : getOptimizedStatusLabel(entry.asset);
        setCacheProgress(entry.key, entry.label, {
          message: result ? `${sourceLabel} / ${optimizedLabel} / ${formatVideoBytes(result.asset.size)}` : sourceLabel,
          progress: result ? 100 : 0,
          bytesTransferred: result?.asset.size,
          totalBytes: result?.asset.size,
          stage: result ? "complete" : "failed",
        });
      }
      await pruneCloudVideoCache(PUBLIC_SIGNAGE_CACHE.dbName, PUBLIC_SIGNAGE_CACHE.storeName, activeKeys);
      await predownloadImages();
    } finally {
      setIsPredownloading(false);
      setPredownloadProgress("");
    }
  };

  useEffect(() => {
    if (!breakingSignal || !allowInterrupt) return;
    if (Date.now() - breakingSignal.timestamp > PLAYLIST_TIMING.breakingSignalValidMs) return;
    const timer = setTimeout(() => { setIsBreaking(true); setBreakingVideoId(breakingSignal.videoId); }, 0);
    return () => clearTimeout(timer);
  }, [breakingSignal, allowInterrupt]);

  const endBreaking = useCallback(() => {
    setIsBreaking(false);
    setBreakingVideoId(null);
  }, []);

  const returnToAutoMode = useCallback(async () => {
    setManualOverride(null);
    setLiveMode(null);
    setManualPlaylist(null);
    if (!signageId) return;
    try {
      await updateDoc(doc(db, FIRESTORE_COLLECTIONS.publicSignages, signageId), {
        manualOverride: null,
        liveMode: null,
        manualPlaylist: null,
        manualPlaylistName: null,
      });
    } catch (error) {
      console.error("Failed to return signage to auto mode.", error);
    }
  }, [signageId]);

  const nextItem = useCallback(() => {
    if (effectivePlaylist.length === 0) return;
    if (manualPlaylist && currentIndex >= effectivePlaylist.length - 1) {
      void returnToAutoMode();
      return;
    }
    setCurrentIndex(prev => (prev + 1) % effectivePlaylist.length);
  }, [currentIndex, effectivePlaylist.length, manualPlaylist, returnToAutoMode]);

  const handleVideoEnded = useCallback(() => {
    // Some browsers can dispatch duplicate ended events while the display is
    // re-rendering. Process each video instance only once so a manual ad cannot
    // be restarted by a second event.
    if (handledVideoEndKeyRef.current === currentVideoKey) return;
    handledVideoEndKeyRef.current = currentVideoKey;
    // Remove the finished video immediately. This prevents the browser from
    // showing the first frame again while React switches back to the signage.
    videoRef.current?.pause();
    setIsVideoTransitioning(true);

    if (effectiveManualOverride) {
      setDismissedManualOverrideKey(getManualOverrideKey(effectiveManualOverride));
    }

    if (activeScenarioOverride) {
      setScenarioOverride(null);
    } else if (isBreaking) {
      endBreaking();
    } else if (effectiveManualOverride) {
      void returnToAutoMode();
    } else {
      nextItem();
    }
  }, [activeScenarioOverride, currentVideoKey, effectiveManualOverride, endBreaking, isBreaking, nextItem, returnToAutoMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        if (isBreaking) {
          endBreaking();
        } else if (activeScenarioOverride?.mode === "FULL_MOVIE") {
          setScenarioOverride(null);
        } else if (!effectiveManualOverride && effectivePlaylist[currentIndex]?.mode === "FULL_MOVIE") {
          nextItem();
        } else if (effectiveManualOverride?.mode === "FULL_MOVIE") {
          void returnToAutoMode();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isBreaking, activeScenarioOverride, effectiveManualOverride, currentIndex, effectivePlaylist, nextItem, endBreaking, returnToAutoMode]);

  useEffect(() => {
    if (effectivePlaylist.length === 0 || isBreaking || activeScenarioOverride || effectiveManualOverride) return;
    const currentItem = effectivePlaylist[currentIndex];
    if (!currentItem || currentItem.mode === "FULL_MOVIE") return;
    const durationSeconds = Math.max(
      PLAYLIST_TIMING.minDurationSeconds,
      Number.isFinite(currentItem.duration) && currentItem.duration > 0 ? currentItem.duration : PLAYLIST_TIMING.defaultDurationSeconds
    );
    const timer = setTimeout(() => { nextItem(); }, durationSeconds * 1000);
    return () => clearTimeout(timer);
  }, [currentIndex, effectivePlaylist, isBreaking, activeScenarioOverride, effectiveManualOverride, nextItem]);

  useEffect(() => {
    const activeCacheKey = activeScenarioOverride?.mode === "FULL_MOVIE"
      ? `scenario_${activeScenarioOverride.eventId}`
      : effectiveManualOverride?.mode === "FULL_MOVIE" && effectiveManualOverride.videoAssetId
        ? `manual_${effectiveManualOverride.videoAssetId}`
        : (isBreaking && breakingVideoId)
          ? `breaking_${breakingVideoId}`
          : currentIndex.toString();
    const isActiveVideoDownloading = cacheStatus[activeCacheKey]?.stage === "downloading";
    const activeUrl = activeScenarioOverride?.mode === "FULL_MOVIE"
      ? localVideos[`scenario_${activeScenarioOverride.eventId}`]
      : effectiveManualOverride?.mode === "FULL_MOVIE" && effectiveManualOverride.videoAssetId
        ? localVideos[`manual_${effectiveManualOverride.videoAssetId}`]
        : (isBreaking && breakingVideoId)
          ? localVideos[`breaking_${breakingVideoId}`]
          : (effectivePlaylist[currentIndex]?.videoAssetId ? localVideos[currentIndex.toString()] : effectivePlaylist[currentIndex]?.videoUrl);

    if (effectivePlaylist.length > 0 && !isActiveVideoDownloading && (!activeUrl || hasCurrentVideoError) && (activeScenarioOverride?.mode === "FULL_MOVIE" || effectiveManualOverride?.mode === "FULL_MOVIE" || isBreaking || effectivePlaylist[currentIndex]?.mode === "FULL_MOVIE")) {
      const timer = setTimeout(() => {
        if (activeScenarioOverride) {
          setScenarioOverride(null);
        } else if (isBreaking) {
          endBreaking();
        } else if (effectiveManualOverride) {
          void returnToAutoMode();
        } else {
          nextItem();
        }
      }, PLAYLIST_TIMING.videoErrorSkipGraceMs);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, isBreaking, breakingVideoId, activeScenarioOverride, effectiveManualOverride, localVideos, effectivePlaylist, hasCurrentVideoError, nextItem, endBreaking, cacheStatus, returnToAutoMode]);

  const currentMode = isBreaking
    ? "FULL_MOVIE"
    : activeScenarioOverride
      ? activeScenarioOverride.mode
      : effectiveManualOverride
        ? effectiveManualOverride.mode
        : effectivePlaylist[currentIndex]?.mode;
  const activeVideoVolume = clampMediaElementGain(
    activeScenarioOverride?.mode === "FULL_MOVIE"
      ? getVideoVolumeGain(activeScenarioOverride.videoAssetId)
      : effectiveManualOverride?.mode === "FULL_MOVIE"
        ? getVideoVolumeGain(effectiveManualOverride.videoAssetId)
        : isBreaking
          ? getVideoVolumeGain(breakingVideoId)
          : getVideoVolumeGain(effectivePlaylist[currentIndex]?.videoAssetId)
  );
  useMediaElementGain(videoRef, activeVideoVolume);

  useEffect(() => () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.removeAttribute("src");
    video.load();
  }, []);

  if (!signageId || (effectivePlaylist.length === 0 && !activeScenarioOverride && !effectiveManualOverride)) {
    return (
      <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 transition-colors flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-xl font-black text-slate-700 dark:text-slate-200">
            {!signageId ? "サイネージIDが指定されていません" : "表示するプレイリストがありません"}
          </p>
          <p className="mt-3 text-sm font-bold text-slate-500">管理画面でURLとプレイリスト設定を確認してください。</p>
        </div>
      </div>
    );
  }

  const isUp = emergencyConfig?.type === "UP";
  const usesFullscreenLayout = currentMode === "TITLE_SCREEN" || currentMode === "AVERAGE_BOARD" || currentMode === "HEATMAP_GRID" || currentMode === "CLASSROOM_GRID" || currentMode === "MC_TRADE_CAST";

  return (
    <div onMouseMove={handleControlsActivity} className={`h-dvh w-screen text-slate-800 dark:text-white font-sans overflow-hidden flex flex-col relative transition-colors duration-300 ${emergencyConfig ? (isUp ? "bg-emerald-950" : "bg-red-950") : "bg-slate-100 dark:bg-slate-950"}`}>
      
      {showEmergencyOverlay && (
        <div className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center animate-[pulse_1.5s_infinite] ${isUp ? "bg-emerald-600" : "bg-red-600"}`}>
          <div className="absolute inset-0 bg-white/10 opacity-20 pointer-events-none"></div>
          {isUp ? <TrendingUp size={240} className="text-white mb-12 drop-shadow-lg" /> : <TrendingDown size={240} className="text-white mb-12 drop-shadow-lg" />}
          <h1 className="text-[12rem] font-black text-white tracking-tighter mb-4 italic leading-none drop-shadow-2xl">{isUp ? "MARKET BOOM" : "MARKET CRASH"}</h1>
          <p className="text-5xl font-black text-white uppercase tracking-[0.5em] animate-pulse">{isUp ? "株価急騰中！" : "株価暴落中！"}</p>
          <p className="mt-8 text-2xl font-bold text-white/80">{emergencyConfig?.message}</p>
        </div>
      )}

      {showEmergencyResolvedOverlay && (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-emerald-700 text-white animate-in fade-in duration-300">
          <ShieldCheck size={220} className="mb-12 drop-shadow-lg" />
          <h1 className="text-[10rem] font-black leading-none tracking-tighter drop-shadow-2xl">CLEAR</h1>
          <p className="mt-6 text-5xl font-black uppercase tracking-[0.35em]">事態収束</p>
          <p className="mt-8 text-2xl font-bold text-white/80">緊急事態が解除されました</p>
        </div>
      )}

      {!showEmergencyOverlay && emergencyConfig && (
        <div className={`absolute bottom-24 left-8 z-[100] px-6 py-4 rounded-2xl flex items-center gap-4 animate-bounce shadow-2xl ${isUp ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {isUp ? <TrendingUp size={40}/> : <TrendingDown size={40}/>}
          <div><p className="font-black text-3xl tracking-widest">{isUp ? "株価急騰中" : "株価暴落中"}</p><p className="font-bold text-sm opacity-80">{emergencyConfig.message}</p></div>
        </div>
      )}

      {!isBreaking && currentMode !== "FULL_MOVIE" && currentMode !== "FULL_IMAGE" && currentMode !== "TITLE_SCREEN" && (
        <button onClick={() => { setIsSettingsOpen(true); }} className={`absolute top-6 left-6 z-[60] bg-white/85 dark:bg-black/70 p-3 rounded-full hover:bg-white dark:hover:bg-black/85 text-slate-500 hover:text-blue-500 transition-opacity duration-300 shadow-md border border-slate-200 dark:border-white/10 ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}><Settings size={28} /></button>
      )}

      <FullscreenButton />

      {snapshotError && (
        <div className="absolute bottom-6 right-6 z-[90] flex items-center gap-2 rounded-full border border-amber-400/40 bg-slate-950/90 px-4 py-2 text-xs font-black text-amber-300 shadow-xl">
          <AlertTriangle size={16} />
          {snapshotError}
        </div>
      )}

      {!isStarted && (
        <button
          onClick={() => {
            initAudioContext();
            localStorage.setItem(STORAGE_KEYS.PUBLIC_SIGNAGE_STARTED, "true");
            setIsStarted(true);
          }}
          className="absolute bottom-6 left-6 z-[90] flex items-center gap-2 rounded-full border border-blue-400/40 bg-slate-950/90 px-5 py-3 text-sm font-black text-white shadow-xl transition hover:bg-blue-600"
        >
          <Volume2 size={18} />
          音声を有効化
        </button>
      )}

      {!isBreaking && currentMode !== "FULL_MOVIE" && currentMode !== "FULL_IMAGE" && currentMode !== "TITLE_SCREEN" && usesFullscreenLayout && (
        <div className="pointer-events-none absolute right-5 bottom-5 z-[55] rounded-md border border-white/15 bg-slate-950/90 px-4 py-2 text-right text-white shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">SIGNAGE</p>
          <p className="max-w-[22rem] truncate text-lg font-black">{signageName}</p>
        </div>
      )}

      <SignageSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title="端末動画キャッシュ" showThemeToggle={false}>
        <div className="bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6 flex items-center justify-between">
          <div><h3 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"><Volume2 size={18}/> 音声テスト</h3><p className="text-xs text-slate-500">スピーカーの音量を確認してください。</p></div>
          <button onClick={() => playSound("NEWS_ALERT")} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg">ニュース音を鳴らす</button>
        </div>
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-bold text-slate-700 dark:text-slate-300 px-1 flex items-center gap-2"><HardDrive size={18} /> キャッシュ状況</h3>
            <button
              onClick={handlePredownloadAll}
              disabled={isPredownloading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} />
              {isPredownloading ? `保存中 ${predownloadProgress}` : "すべて事前ダウンロード"}
            </button>
          </div>
          {Object.keys(cacheStatus).length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
              クラウド動画はまだ設定されていません。
            </div>
          ) : (
            Object.entries(cacheStatus).map(([key, status]) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-700 dark:text-slate-200">{status.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {status.fileIndex && status.fileCount ? `${status.fileIndex} / ${status.fileCount} ` : ""}{status.message}
                    </p>
                  </div>
                  <Cloud size={16} className={status.stage === "failed" ? "text-red-500" : "text-blue-500"} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className={`h-full transition-all ${status.stage === "failed" ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, Math.max(0, status.progress || 0))}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] font-black text-slate-400">
                  <span>{Math.round(status.progress || 0)}%</span>
                  <span>
                    {status.totalBytes
                      ? `${formatVideoBytes(status.bytesTransferred)} / ${formatVideoBytes(status.totalBytes)}`
                      : status.bytesTransferred
                        ? `${formatVideoBytes(status.bytesTransferred)} 取得済み`
                        : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </SignageSettingsModal>

      {!isBreaking && currentMode !== "FULL_MOVIE" && currentMode !== "FULL_IMAGE" && currentMode !== "TITLE_SCREEN" && currentMode !== "AVERAGE_BOARD" && currentMode !== "HEATMAP_GRID" && currentMode !== "CLASSROOM_GRID" && currentMode !== "MC_TRADE_CAST" && (
        <header className={`z-10 flex h-20 shrink-0 items-center justify-between border-b px-8 transition-colors ${emergencyConfig ? (isUp ? "border-emerald-500 bg-emerald-950 text-white" : "border-red-500 bg-red-950 text-white") : "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"}`}>
          <div className="flex items-baseline gap-5">
            <h1 className="text-4xl font-black leading-none">株価にドキリ！マーケット</h1>
            <span className="text-xl font-black text-slate-400 dark:text-slate-500">{signageName}</span>
          </div>
          <div className="font-mono text-4xl font-black tracking-wide text-slate-400 dark:text-slate-500">{currentTime.toLocaleTimeString()}</div>
        </header>
      )}

      <main className={`relative flex w-full flex-1 flex-col ${currentMode === "TITLE_SCREEN" || currentMode === "AVERAGE_BOARD" || currentMode === "HEATMAP_GRID" || currentMode === "CLASSROOM_GRID" || currentMode === "MC_TRADE_CAST" || currentMode === "FULL_IMAGE" ? 'p-0' : 'p-5'}`}>
        <div key={currentMode} className={`flex-1 w-full flex flex-col min-h-0 animate-in ${isBreaking ? 'zoom-in-110 fade-in duration-300' : 'fade-in zoom-in-95 duration-1000'}`}>
          {!isBreaking && currentMode === "RANKING_BOARD" && <RankingBoard ranking={ranking} stocks={stocks} />}
          {!isBreaking && currentMode === "NEWS_DASHBOARD" && <NewsDashboard stocks={stocks} news={news} chartData={chartData} flashState={flashState} />}
          {!isBreaking && currentMode === "DUAL_NEWS_BOARD" && <DualNewsBoard news={news} />}
          {!isBreaking && currentMode === "STOCK_GRID" && <StockGrid stocks={stocks} chartData={chartData} flashState={flashState} />}
          {!isBreaking && currentMode === "SPLIT_NEWS_STOCK" && <SplitNewsStock stocks={stocks} news={news} ranking={ranking} chartData={chartData} flashState={flashState} />}
          {!isBreaking && currentMode === "MARKET_CHART" && <MarketChartBoard stocks={stocks} chartData={chartData} />}
          {!isBreaking && currentMode === "TRANSACTION_MONITOR" && <TransactionMonitor stocks={stocks} />}
          {!isBreaking && currentMode === "CLASSROOM_GRID" && (
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_420px] gap-0 bg-slate-950">
              <ClassroomGridBoard users={classroomUsers} stocks={stocks} chartData={chartData} serverTimeOffsetMillis={serverTimeOffsetMillis} />
              <div className="min-h-0 border-l border-white/10 bg-slate-950">
                <TransactionMonitor stocks={stocks} limitCount={5} compact />
              </div>
            </div>
          )}
          {!isBreaking && currentMode === "MC_TRADE_CAST" && <McTradeCast users={classroomUsers} stocks={stocks} sessionEndTime={activeSessionEndTime} />}
          {!isBreaking && currentMode === "AVERAGE_BOARD" && <AverageBoard stocks={stocks} chartData={chartData} />}
          {!isBreaking && currentMode === "HEATMAP_GRID" && <HeatmapGrid stocks={stocks} chartData={chartData} />}
          {!isBreaking && currentMode === "TITLE_SCREEN" && <TitleScreen />}

          {currentMode === "FULL_MOVIE" && (() => {
            const activeUrl = activeScenarioOverride?.mode === "FULL_MOVIE"
              ? localVideos[`scenario_${activeScenarioOverride.eventId}`]
              : effectiveManualOverride?.mode === "FULL_MOVIE" && effectiveManualOverride.videoAssetId
                ? localVideos[`manual_${effectiveManualOverride.videoAssetId}`]
                : (isBreaking && breakingVideoId)
                  ? localVideos[`breaking_${breakingVideoId}`]
                  : (effectivePlaylist[currentIndex]?.videoAssetId ? localVideos[currentIndex.toString()] : effectivePlaylist[currentIndex]?.videoUrl);
            return (
              <div className="absolute inset-0 bg-black flex items-center justify-center z-50 group">
                <button onClick={() => setIsSettingsOpen(true)} className="absolute top-6 left-6 z-[60] bg-white/25 p-3 rounded-full hover:bg-white/40 text-white opacity-0 active:opacity-100 group-hover:opacity-100 transition"><Settings size={28} /></button>
                {activeUrl && !hasCurrentVideoError && !isVideoTransitioning ? (
                  <video
                    key={currentVideoKey}
                    ref={attachVideoRef}
                    src={activeUrl}
                    autoPlay
                    loop={false}
                    muted={false}
                    playsInline
                    onEnded={handleVideoEnded}
                    onError={() => setVideoError({ key: currentVideoKey, hasError: true })}
                    className="w-full h-full object-cover absolute top-0 left-0"
                  />
                ) : (
                  isVideoTransitioning ? null : (
                    <div className="flex flex-col items-center gap-6">
                      <div className="text-3xl font-bold text-slate-700 animate-pulse">
                        {activeScenarioOverride
                          ? "SCENARIO VIDEO NOT FOUND"
                          : effectiveManualOverride
                            ? "MANUAL VIDEO NOT FOUND"
                            : isBreaking
                              ? `BREAKING VIDEO NOT FOUND (${breakingVideoId || "NO ID"})`
                              : "PLAYLIST VIDEO NOT FOUND"}
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })()}
          {!isBreaking && currentMode === "FULL_IMAGE" && (() => {
            const activeKey = effectiveManualOverride?.mode === "FULL_IMAGE" && effectiveManualOverride.imageAssetId
              ? `manual_image_${effectiveManualOverride.imageAssetId}`
              : currentIndex.toString();
            const activeUrl = localImages[activeKey] || imageLibrary.find(image => image.id === effectivePlaylist[currentIndex]?.imageAssetId)?.imageAsset.downloadUrl;
            return (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black group">
                <button onClick={() => setIsSettingsOpen(true)} className="absolute top-6 left-6 z-[60] rounded-full bg-white/25 p-3 text-white opacity-0 transition hover:bg-white/40 active:opacity-100 group-hover:opacity-100"><Settings size={28} /></button>
                {activeUrl ? (
                  <img src={activeUrl} alt="" className="absolute left-0 top-0 h-full w-full object-cover" />
                ) : (
                  <div className="text-3xl font-bold text-slate-500 animate-pulse">PLAYLIST IMAGE NOT FOUND</div>
                )}
              </div>
            );
          })()}
        </div>
      </main>

      {!isBreaking && currentMode !== "FULL_MOVIE" && currentMode !== "FULL_IMAGE" && currentMode !== "TITLE_SCREEN" && currentMode !== "AVERAGE_BOARD" && currentMode !== "HEATMAP_GRID" && currentMode !== "CLASSROOM_GRID" && currentMode !== "MC_TRADE_CAST" && (
        <StockTicker stocks={stocks} emergencyConfig={emergencyConfig} />
      )}
    </div>
  );
}
