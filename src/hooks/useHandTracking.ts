// src/hooks/useHandTracking.ts

import { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver, type HandLandmarkerResult } from "@mediapipe/tasks-vision";

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isActive: boolean,
  facingMode: "user" | "environment" = "user" // facingModeを受け取れるように拡張
) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);

  const [handResult, setHandResult] = useState<HandLandmarkerResult | null>(null);

  useEffect(() => {
    if (!isActive) return;

    let active = true;

    const initAI = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "/mediapipe/wasm"
        );

        let landmarker = null;
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/mediapipe/models/hand_landmarker.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
        } catch (err) {
          console.warn("GPU Fallback: CPUモードで再試行します", err);
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/mediapipe/models/hand_landmarker.task",
              delegate: "CPU"
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
        }

        if (active) {
          landmarkerRef.current = landmarker;
          setIsReady(true);
        }
      } catch (e: unknown) {
        console.error("AI Initialization Error:", e);
        if (active) {
          const errorMessage = e instanceof Error ? e.message : "不明なエラー";
          setError("AIの初期化エラー: " + errorMessage);
        }
      }
    };

    initAI();

    return () => {
      active = false;
      setIsReady(false);
      setHandResult(null);
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !isReady || !videoRef.current) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    let isDisposed = false;
    let cameraStream: MediaStream | null = null;
    let lastVideoTime = -1;
    let lastInferenceTime = 0;

    const detectTasks = () => {
      if (isDisposed) return;

      const now = performance.now();
      if (video.readyState >= 2) {
        if (video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime;

          if (now - lastInferenceTime >= 66) {
            lastInferenceTime = now;

            if (landmarkerRef.current) {
              try {
                setHandResult(landmarkerRef.current.detectForVideo(video, now));
              } catch { /* ignore */ }
            }
          }
        }
      }
      requestRef.current = requestAnimationFrame(detectTasks);
    };

    const startCamera = async () => {
      const baseVideoConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
      };

      try {
        // A string facingMode is only an "ideal" preference.  On iPad Safari it
        // can therefore keep selecting the front camera.  Request the selected
        // direction as a required constraint first, then fall back for devices
        // that do not expose that capability.
        let nextStream: MediaStream;
        try {
          nextStream = await navigator.mediaDevices.getUserMedia({
            video: { ...baseVideoConstraints, facingMode: { exact: facingMode } },
          });
        } catch (error: unknown) {
          if (!(error instanceof DOMException) || error.name !== "OverconstrainedError") throw error;
          nextStream = await navigator.mediaDevices.getUserMedia({
            video: { ...baseVideoConstraints, facingMode: { ideal: facingMode } },
          });
        }

        if (isDisposed) {
          nextStream.getTracks().forEach(track => track.stop());
          return;
        }

        cameraStream = nextStream;
        setStream(nextStream);
        setError(null);
        video.srcObject = nextStream;
        video.onloadedmetadata = () => {
          if (isDisposed) return;
          void video.play().then(detectTasks).catch(error => {
            if (!isDisposed) setError("カメラ映像を開始できませんでした: " + error.message);
          });
        };
      } catch (error: unknown) {
        if (!isDisposed) {
          const message = error instanceof Error ? error.message : "不明なエラー";
          setError("カメラへのアクセスに失敗しました: " + message);
        }
      }
    };

    void startCamera();

    return () => {
      isDisposed = true;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
      if (video.srcObject === cameraStream) {
        video.srcObject = null;
      }
      setStream(currentStream => currentStream === cameraStream ? null : currentStream);
    };
  }, [isReady, isActive, videoRef, facingMode]); // facingModeの変化でストリームを自動再起動します

  return { isReady, error, handResult, stream };
}
