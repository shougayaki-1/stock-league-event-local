// src/components/signage/riddle/SignageVideo.tsx

import { useCallback, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useMediaElementGain } from "../../../hooks/useMediaElementGain";

interface SignageVideoProps {
  videoId: string;
  url: string | undefined;
  videoError: boolean;
  isWaiting?: boolean;
  status?: string;
  volumeGain?: number;
  muted?: boolean;
  setVideoError: (val: boolean) => void;
  handleVideoEnded: () => void;
}

export default function SignageVideo({
  videoId,
  url,
  videoError,
  isWaiting,
  status,
  volumeGain,
  muted = false,
  setVideoError,
  handleVideoEnded,
}: SignageVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasHandledEndRef = useRef(false);
  const hasStartedRef = useRef(false);
  useMediaElementGain(videoRef, volumeGain);

  const handleEnded = useCallback(() => {
    if (hasHandledEndRef.current) return;
    hasHandledEndRef.current = true;
    handleVideoEnded();
  }, [handleVideoEnded]);

  useEffect(() => {
    hasHandledEndRef.current = false;
    hasStartedRef.current = false;
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url || videoError) return;

    video.muted = muted;
    video.pause();

    const startFromBeginning = () => {
      // キャッシュ済みの場合は readyState の即時判定と loadeddata の両方が
      // 発火し得る。開始処理を一度に限定して動画の重複・再スタートを防ぐ。
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      // Object URL を差し替えた直後にブラウザが以前の再生位置を復元する場合があるため、
      // 最初のフレームが利用可能になってから改めて 0 秒へ合わせて再生する。
      try {
        video.currentTime = 0;
      } catch {
        // シーク可能になる前は loadeddata 側で再試行する。
      }
      void video.play().catch(error => {
        console.warn("リドルサイネージ動画の自動再生に失敗しました", error);
      });
    };

    const prepareStart = () => {
      try {
        video.currentTime = 0;
      } catch {
        // loadeddata イベントで再試行する。
      }
    };

    video.addEventListener("loadedmetadata", prepareStart, { once: true });
    video.addEventListener("loadeddata", startFromBeginning, { once: true });
    video.load();

    // キャッシュ済みの動画ではイベント登録前に読み込み済みになることがある。
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) startFromBeginning();

    return () => {
      video.removeEventListener("loadedmetadata", prepareStart);
      video.removeEventListener("loadeddata", startFromBeginning);
      video.pause();
    };
  }, [url, videoError, muted]);

  return (
    <div className="flex-1 w-full h-full relative">
      {url && !videoError ? (
        <video
          key={url}
          ref={videoRef}
          src={url}
          preload="auto"
          playsInline
          muted={muted}
          onEnded={handleEnded}
          onError={() => setVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="flex-1 h-full flex flex-col items-center justify-center bg-black">
          {isWaiting ? (
            <>
              <Loader2 size={48} className="mb-4 animate-spin text-slate-600" />
              <p className="text-sm font-bold text-slate-500">動画を準備しています</p>
              {status && <p className="mt-2 text-[10px] font-bold text-slate-700">{status}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-600">表示を準備できませんでした</p>
              <p className="mt-2 text-[10px] text-slate-700">管理端末で動画設定を確認してください ({videoId || "未選択"}{status ? ` / ${status}` : ""})</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
