// src/pages/signage/RiddleSignage.tsx

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { Cloud, Download, HardDrive, Settings } from "lucide-react";
import { db } from "../../lib/firebase";
import { useTheme } from "../../contexts/ThemeContext";
import { useServerClock } from "../../lib/serverTime";
import { useRiddleActions, type RiddleRoom } from "../../hooks/useRiddleActions";
import { useScreenWakeLock } from "../../hooks/useScreenWakeLock";
import { formatVideoBytes, getCloudVideoObjectUrl, getOptimizedStatusLabel, getPreferredVideoAsset, pruneCloudVideoCache } from "../../lib/cloudVideos";
import { DEFAULT_SIGNAGE_THEME, RIDDLE_DB_NAME, RIDDLE_STORE_NAME, VIDEO_ERROR_SKIP_GRACE_MS, parseSignageTheme } from "../../lib/riddleConstants";
import { VIDEO_LIBRARY_COLLECTION, type VideoLibraryItem } from "../../types/videoLibrary";

import SignageSettingsModal from "../../components/signage/SignageSettingsModal";
import FullscreenButton from "../../components/signage/FullscreenButton";
import SignageStandby from "../../components/signage/riddle/SignageStandby";
import SignageDark from "../../components/signage/riddle/SignageDark";
import SignageVideo from "../../components/signage/riddle/SignageVideo";
import SignageTimer from "../../components/signage/riddle/SignageTimer";
import SignageNextRoom from "../../components/signage/riddle/SignageNextRoom";


export default function RiddleSignage() {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const role = searchParams.get("role");

  const [room, setRoom] = useState<RiddleRoom | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const videoUrlsRef = useRef<Record<string, string>>({});
  const videoAssetSignatureRef = useRef<Record<string, string>>({});
  const [cacheStatus, setCacheStatus] = useState<Record<string, string>>({});
  const [failedVideoIds, setFailedVideoIds] = useState<Record<string, boolean>>({});
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [isPredownloading, setIsPredownloading] = useState(false);
  const [predownloadProgress, setPredownloadProgress] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  useScreenWakeLock(isStarted);

  const { serverTimeOffsetMillis, getServerNowMillis } = useServerClock();
  const { proceedToNextStepSecure } = useRiddleActions();
  const [videoError, setVideoError] = useState(false);
  const { applyTheme } = useTheme();

  const currentStepVideoId = useMemo(() => {
    if (!room || room.phase !== "RUNNING" || !role) return null;
    const currentStep = room.steps?.[room.currentStepIndex];
    const action = currentStep?.tvActions?.[role];
    return action?.mode === "VIDEO" ? action.videoAssetId || null : null;
  }, [room, role]);

  const orderedVideoIds = useMemo(() => {
    const roomVideoIds = room ? (room.steps || []).flatMap(step =>
      Object.values(step.tvActions || {}).map(action => action.videoAssetId).filter((id): id is string => !!id)
    ) : [];
    const libraryVideoIds = videoLibrary.map(video => video.id);
    const allVideoIds = Array.from(new Set([...roomVideoIds, ...libraryVideoIds]));
    if (!currentStepVideoId) return allVideoIds;
    return [currentStepVideoId, ...allVideoIds.filter(videoId => videoId !== currentStepVideoId)];
  }, [room, currentStepVideoId, videoLibrary]);

  // ホイスティング対策 & 依存性解決: 参照される関数を最上部で宣言
  const handleTransitionTrigger = useCallback(async () => {
    if (!roomId || !room) return;
    await proceedToNextStepSecure(roomId, room.currentStepIndex);
  }, [roomId, room, proceedToNextStepSecure]);

  const handleVideoEnded = useCallback(() => {
    if (!room) return;
    const currentStep = room.steps?.[room.currentStepIndex];
    if (
      currentStep &&
      currentStep.autoTransitionType === "VIDEO_END" &&
      currentStep.triggerTvRole === role
    ) {
      handleTransitionTrigger();
    }
  }, [room, role, handleTransitionTrigger]);

  // M-5 (ESLint対応): エフェクトを削除し、レンダーフェーズ中での同期状態の調整に移行
  const [prevStepKey, setPrevStepKey] = useState("");
  const currentStepKey = `${room?.currentStepIndex}_${role}`;

  useEffect(() => {
    if (currentStepKey === prevStepKey) return;
    setPrevStepKey(currentStepKey);
    setVideoError(false);
  }, [currentStepKey, prevStepKey]);

  // set-state-in-effect 対策: timeLeft の初期同調（同期的 setState）をレンダー中で同期
  const [prevTimerState, setPrevTimerState] = useState("");
  const [prevTimerEndTime, setPrevTimerEndTime] = useState<number | null>(null);

  if (room) {
    const currentTimerState = room.timerState;
    const currentTimerEndTime = room.timerEndTime ? room.timerEndTime.toMillis() : null;

    if (currentTimerState !== prevTimerState || currentTimerEndTime !== prevTimerEndTime) {
      setPrevTimerState(currentTimerState);
      setPrevTimerEndTime(currentTimerEndTime);

      if (currentTimerState === "PAUSED" && room.timerRemainingAtPause != null) {
        setTimeLeft(room.timerRemainingAtPause);
      } else if (currentTimerState !== "RUNNING") {
        setTimeLeft(room.duration);
      }
    }
  }

  useEffect(() => {
    if (!roomId || !role) return;
    const unsub = onSnapshot(doc(db, "riddle_rooms", roomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoom({
          id: docSnap.id,
          ...data,
          theme: parseSignageTheme(data.theme),
        } as RiddleRoom);
      }
    });
    return () => unsub();
  }, [roomId, role]);

  useEffect(() => {
    applyTheme(room?.theme || DEFAULT_SIGNAGE_THEME);
  }, [room?.theme, applyTheme]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, VIDEO_LIBRARY_COLLECTION), (snap) => {
      setVideoLibrary(snap.docs.map(d => ({ id: d.id, ...d.data() } as VideoLibraryItem)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(videoUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const getVideoAssetSignature = useCallback((asset?: VideoLibraryItem["videoAsset"] | null) => {
    const preferred = getPreferredVideoAsset(asset);
    if (!preferred?.storagePath || !preferred.version) return null;
    return `${preferred.storagePath}:${preferred.version}`;
  }, []);

  useEffect(() => {
    if (!roomId || !role || !room) return;
    let isCancelled = false;

    const syncVideos = async () => {
      const activeKeys: string[] = [];
      for (const videoId of orderedVideoIds) {
        const asset = videoLibrary.find(video => video.id === videoId)?.videoAsset;
        const cacheKey = `riddle_${roomId}_${role}_${videoId}`;
        const assetSignature = getVideoAssetSignature(asset);
        activeKeys.push(cacheKey);
        if (!asset) {
          setCacheStatus(prev => ({ ...prev, [videoId]: "ライブラリ未取得" }));
          setFailedVideoIds(prev => ({ ...prev, [videoId]: true }));
          continue;
        }
        if (assetSignature && videoUrlsRef.current[videoId] && videoAssetSignatureRef.current[videoId] === assetSignature) {
          const preferred = getPreferredVideoAsset(asset);
          const optimizedLabel = preferred !== asset ? "軽量版" : getOptimizedStatusLabel(asset);
          setFailedVideoIds(prev => ({ ...prev, [videoId]: false }));
          setCacheStatus(prev => ({ ...prev, [videoId]: `再生準備済み / ${optimizedLabel} / ${formatVideoBytes(preferred?.size)}` }));
          continue;
        }
        setFailedVideoIds(prev => ({ ...prev, [videoId]: false }));
        setCacheStatus(prev => ({ ...prev, [videoId]: "同期中" }));
        let failureMessage = "取得失敗";
        const result = await getCloudVideoObjectUrl(RIDDLE_DB_NAME, RIDDLE_STORE_NAME, cacheKey, asset, progress => {
          if (progress.stage === "failed") failureMessage = progress.message;
          setCacheStatus(prev => ({ ...prev, [videoId]: progress.message }));
        });
        if (isCancelled) return;
        if (result) {
          const previousUrl = videoUrlsRef.current[videoId];
          if (previousUrl && previousUrl !== result.url) URL.revokeObjectURL(previousUrl);
          videoUrlsRef.current = { ...videoUrlsRef.current, [videoId]: result.url };
          videoAssetSignatureRef.current = { ...videoAssetSignatureRef.current, [videoId]: `${result.asset.storagePath}:${result.asset.version}` };
          setVideoUrls(prev => ({ ...prev, [videoId]: result.url }));
          const sourceLabel = result.source === "network" ? "クラウド取得済" : result.source === "cache" ? "端末キャッシュ" : result.source === "direct-url" ? "クラウド直接再生" : "古い端末キャッシュ";
          const optimizedLabel = result.isOptimized ? "軽量版" : getOptimizedStatusLabel(asset);
          setCacheStatus(prev => ({ ...prev, [videoId]: `${sourceLabel} / ${optimizedLabel} / ${formatVideoBytes(result.asset.size)}` }));
        } else {
          setFailedVideoIds(prev => ({ ...prev, [videoId]: true }));
          setCacheStatus(prev => ({ ...prev, [videoId]: failureMessage }));
        }
      }
      if (!isCancelled) await pruneCloudVideoCache(RIDDLE_DB_NAME, RIDDLE_STORE_NAME, activeKeys);
    };

    syncVideos();
    return () => {
      isCancelled = true;
    };
  }, [roomId, role, room, orderedVideoIds, videoLibrary, getVideoAssetSignature]);

  const handlePredownloadAll = async () => {
    if (!roomId || !role || !room) return;
    setIsPredownloading(true);
    setPredownloadProgress("");
    try {
      const videoIds = orderedVideoIds;
      const activeKeys: string[] = [];
      for (const [index, videoId] of videoIds.entries()) {
        setPredownloadProgress(`${index + 1} / ${videoIds.length}`);
        const asset = videoLibrary.find(video => video.id === videoId)?.videoAsset;
        if (!asset) {
          setFailedVideoIds(prev => ({ ...prev, [videoId]: true }));
          setCacheStatus(prev => ({ ...prev, [videoId]: "ライブラリ未取得" }));
          continue;
        }
        const cacheKey = `riddle_${roomId}_${role}_${videoId}`;
        activeKeys.push(cacheKey);
        setFailedVideoIds(prev => ({ ...prev, [videoId]: false }));
        setCacheStatus(prev => ({ ...prev, [videoId]: "事前ダウンロード中" }));
        let failureMessage = "取得失敗";
        const result = await getCloudVideoObjectUrl(RIDDLE_DB_NAME, RIDDLE_STORE_NAME, cacheKey, asset, progress => {
          if (progress.stage === "failed") failureMessage = progress.message;
          setCacheStatus(prev => ({ ...prev, [videoId]: progress.message }));
        });
        if (result) {
          const previousUrl = videoUrlsRef.current[videoId];
          if (previousUrl && previousUrl !== result.url) URL.revokeObjectURL(previousUrl);
          videoUrlsRef.current = { ...videoUrlsRef.current, [videoId]: result.url };
          setVideoUrls(prev => ({ ...prev, [videoId]: result.url }));
          const sourceLabel = result.source === "cache" ? "端末キャッシュ" : result.source === "stale-cache" ? "古い端末キャッシュ" : result.source === "direct-url" ? "クラウド直接再生" : "クラウド取得済";
          const optimizedLabel = result.isOptimized ? "軽量版" : getOptimizedStatusLabel(asset);
          setCacheStatus(prev => ({ ...prev, [videoId]: `${sourceLabel} / ${optimizedLabel} / ${formatVideoBytes(result.asset.size)}` }));
        } else {
          setFailedVideoIds(prev => ({ ...prev, [videoId]: true }));
          setCacheStatus(prev => ({ ...prev, [videoId]: failureMessage }));
        }
      }
      await pruneCloudVideoCache(RIDDLE_DB_NAME, RIDDLE_STORE_NAME, activeKeys);
    } finally {
      setIsPredownloading(false);
      setPredownloadProgress("");
    }
  };

  // set-state-in-effect 対策: エフェクト内は非同期なカウントダウン処理のみに制限
  useEffect(() => {
    if (!room) return;
    if (room.timerState === "RUNNING" && room.timerEndTime) {
      const endTime = room.timerEndTime;
      const interval = setInterval(() => {
        const now = getServerNowMillis();
        const end = endTime.toMillis();
        const diff = Math.max(0, Math.floor((end - now) / 1000));
        setTimeLeft(diff);

        if (diff === 0) {
          clearInterval(interval);
          const currentStep = room.steps?.[room.currentStepIndex];
          if (currentStep && currentStep.autoTransitionType === "MANUAL_OR_TIMER") {
            handleTransitionTrigger();
          }
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [room, serverTimeOffsetMillis, getServerNowMillis, handleTransitionTrigger]);

  useEffect(() => {
    if (!room || room.phase !== "RUNNING" || !room.stepStartedAt) return;
    const currentStep = room.steps?.[room.currentStepIndex];
    if (!currentStep || currentStep.autoTransitionType !== "TIME_ELAPSED" || !currentStep.durationSeconds) return;

    const stepStartedAt = room.stepStartedAt;
    const interval = setInterval(() => {
      const now = getServerNowMillis();
      const startedAt = stepStartedAt.toMillis();
      const elapsedSeconds = Math.floor((now - startedAt) / 1000);

      if (elapsedSeconds >= currentStep.durationSeconds!) {
        clearInterval(interval);
        handleTransitionTrigger();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [room, serverTimeOffsetMillis, getServerNowMillis, handleTransitionTrigger]);

  // handleVideoEnded の実行時安全性確保のための判定変数
  const isRunningTemp = room ? room.phase === "RUNNING" : false;
  const currentStepTemp = room ? room.steps?.[room.currentStepIndex] : null;
  const isVideoMode = isRunningTemp && currentStepTemp ? currentStepTemp.tvActions?.[role || ""]?.mode === "VIDEO" : false;

  // 動画が読み込みエラーになった場合だけスキップする。同期中は待機する。
  useEffect(() => {
    if (isVideoMode && currentStepTemp) {
      if (videoError) {
        const timer = setTimeout(() => {
          handleVideoEnded();
        }, VIDEO_ERROR_SKIP_GRACE_MS);
        return () => clearTimeout(timer);
      }
    }
  }, [isVideoMode, currentStepTemp, role, videoUrls, videoError, handleVideoEnded]);

  // --- TS18047 / TS2538 対策: 早期リターンを一番上に移動し、これより下部での room と role の非nullを保証 ---
  if (!roomId || !role) return <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 flex items-center justify-center font-bold">パラメータ(roomId, role)が不足しています</div>;
  if (!room) return <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 flex items-center justify-center font-bold animate-pulse">Loading Room...</div>;

  if (!isStarted) {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center text-white z-[9999]">
        <h1 className="text-4xl font-black mb-8 animate-pulse text-purple-500">START TERMINAL READY</h1>
        <p className="text-sm text-slate-400 mb-8 font-mono">ROOM: {room.name} | ROLE: {role}</p>
        <button
          onClick={() => setIsStarted(true)}
          className="bg-purple-600 hover:bg-purple-500 px-12 py-6 rounded-2xl text-2xl font-black shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all hover:scale-105"
        >
          START TERMINAL (音声を有効化)
        </button>
        <p className="mt-6 text-sm font-bold text-slate-400">電源復帰やブラウザ再読み込み後は、このボタンを押して表示を再開してください。</p>
      </div>
    );
  }

  // ここで room、role が絶対に null にならないことがコンパイラにより保証されます
  const isRunning = room.phase === "RUNNING";
  const currentStep = room.steps?.[room.currentStepIndex];
  const myAction = isRunning && currentStep ? currentStep.tvActions?.[role] : { mode: "STANDBY" as const };

  const isTimerMode = myAction?.mode === "TIMER";
  const isStandbyMode = myAction?.mode === "STANDBY";
  const isDarkMode = myAction?.mode === "DARK";
  const isLiveVideoMode = myAction?.mode === "VIDEO";
  const isNextRoomMode = myAction?.mode === "NEXT_ROOM";
  const activeVideoVolumeGain = myAction?.mode === "VIDEO" && myAction.videoAssetId
    ? videoLibrary.find(video => video.id === myAction.videoAssetId)?.volumeGain ?? 1
    : 1;

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-white font-sans overflow-hidden flex flex-col relative transition-colors duration-300 select-none">

      {!isLiveVideoMode && (
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-6 left-6 z-[60] bg-white/80 dark:bg-black/40 p-3 rounded-full hover:bg-white dark:hover:bg-black/80 text-slate-400 hover:text-blue-500 transition-all opacity-30 hover:opacity-100 shadow-md border border-slate-200 dark:border-white/10"
        >
          <Settings size={24} />
        </button>
      )}

      <FullscreenButton />

      <SignageSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} title={`TV端末 (${role}) 設定`} showThemeToggle={false}>
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-slate-800 dark:text-slate-100"><HardDrive size={16} /> 動画キャッシュ状況</p>
                <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                  管理画面で設定されたクラウド動画を、この端末の IndexedDB に自動保存します。
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                <div className="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                  登録済み {Object.keys(videoUrls).length}
                </div>
                <button
                  onClick={handlePredownloadAll}
                  disabled={isPredownloading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-black text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download size={14} />
                  {isPredownloading ? `保存中 ${predownloadProgress}` : "すべて事前ダウンロード"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {orderedVideoIds.map((videoId) => {
              const video = videoLibrary.find(item => item.id === videoId);
              const asset = video?.videoAsset;
              const hasVideo = !!videoUrls[videoId];
              return (
                <div key={videoId} className={`rounded-xl border p-4 transition-colors ${hasVideo ? "border-purple-200 bg-purple-50/60 dark:border-purple-900/70 dark:bg-purple-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800">
                        <Cloud size={17} />
                      </span>
                      <div>
                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">{video?.name || videoId}</p>
                        <p className="max-w-[12rem] truncate text-[10px] font-bold text-slate-400">{asset?.fileName || "ライブラリ未取得"}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-black ${hasVideo ? "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                      {cacheStatus[videoId] || "待機中"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SignageSettingsModal>

      {isStandbyMode && <SignageStandby />}

      {isDarkMode && <SignageDark />}

      {isNextRoomMode && <SignageNextRoom />}

      {isLiveVideoMode && (
        <SignageVideo
          videoId={myAction.videoAssetId || ""}
          url={myAction.videoAssetId ? videoUrls[myAction.videoAssetId] : undefined}
          videoError={videoError}
          isWaiting={!videoError && !!myAction.videoAssetId && !videoUrls[myAction.videoAssetId] && !failedVideoIds[myAction.videoAssetId]}
          status={myAction.videoAssetId ? cacheStatus[myAction.videoAssetId] : undefined}
          volumeGain={activeVideoVolumeGain}
          muted={myAction.audioEnabled === false}
          setVideoError={setVideoError}
          handleVideoEnded={handleVideoEnded}
        />
      )}

      {isTimerMode && (
        <SignageTimer 
          timeLeft={timeLeft} 
          timerState={room.timerState} 
          roomName={room.name}
        />
      )}

    </div>
  );
}
