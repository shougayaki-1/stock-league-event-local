import { useState, useRef, useEffect, useCallback } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

export function useHandCursor(
  handResult: HandLandmarkerResult | null,
  isActive: boolean,
  targetDuration: number = 600 // 800ms -> 600msに短縮しUX向上
) {
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [hoveredButtonId, setHoveredButtonId] = useState<string | null>(null);
  const [hoverProgress, setHoverProgress] = useState(0);
  
  // モードC用: 掴んでいるか
  const [isGrabbing, setIsGrabbing] = useState(false);
  const grabStartRef = useRef({ x: 0, y: 0 });

  const currentHoverRef = useRef<string | null>(null);
  const hoverDurationRef = useRef<Record<string, number>>({});
  const lastPosRef = useRef({ x: -100, y: -100 });
  
  // クールダウン（ボタン押下後の待機時間）
  const cooldownUntilRef = useRef<number>(0);

  const resetCursor = useCallback(() => {
    setCursorPos({ x: -100, y: -100 });
    setHoverProgress(0);
    setHoveredButtonId(null);
    currentHoverRef.current = null;
    hoverDurationRef.current = {};
    setIsGrabbing(false);
  }, []);

  const triggerCooldown = useCallback((ms: number = 600) => {
    cooldownUntilRef.current = Date.now() + ms;
    resetCursor();
  }, [resetCursor]);

  useEffect(() => {
    const now = Date.now();

    if (!isActive || now < cooldownUntilRef.current) {
      setTimeout(() => setHoverProgress(0), 0);
      return;
    }

    if (!handResult || handResult.landmarks.length === 0) {
      setTimeout(resetCursor, 0);
      return;
    }

    const lm = handResult.landmarks[0];
    const idxFing = lm[8];
    const currentX = (1 - idxFing.x) * window.innerWidth;
    const currentY = idxFing.y * window.innerHeight;

    // 手ぶれ補正
    if (Math.sqrt(Math.pow(currentX - lastPosRef.current.x, 2) + Math.pow(currentY - lastPosRef.current.y, 2)) > 50) {
      lastPosRef.current = { x: currentX, y: currentY };
    }

    // 掴み判定 (Mode C用): AIの誤認識を防ぐため、小指の判定を除外し、
    // 人差し指、中指、薬指が付け根より下にあれば「掴んでいる」とする
    const grabDetected = lm[8].y > lm[5].y && lm[12].y > lm[9].y && lm[16].y > lm[13].y;

    setTimeout(() => {
      setCursorPos({ x: currentX, y: currentY });
      if (grabDetected !== isGrabbing) {
        setIsGrabbing(grabDetected);
        if (grabDetected) grabStartRef.current = { x: lm[9].x, y: lm[9].y };
      }
    }, 0);

  // エラー修正: 依存配列に isGrabbing を追加
  }, [handResult, isActive, resetCursor, isGrabbing]); 

  return {
    cursorPos,
    hoveredButtonId,
    setHoveredButtonId,
    hoverProgress,
    setHoverProgress,
    isGrabbing,
    grabStartRef,
    currentHoverRef,
    hoverDurationRef,
    targetDuration,
    triggerCooldown,
    resetCursor
  };
}