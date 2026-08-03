import { useEffect, useRef, useState } from "react";

interface WakeLockSentinelLike extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [isWakeLockSupported] = useState(() => "wakeLock" in navigator);

  useEffect(() => {
    if (!enabled || !isWakeLockSupported) return;

    let isCancelled = false;

    const releaseCurrent = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      setIsWakeLockActive(false);
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
          // The browser may have already released it.
        }
      }
    };

    const requestWakeLock = async () => {
      if (document.visibilityState !== "visible" || sentinelRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen") as WakeLockSentinelLike;
        if (isCancelled) {
          await sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setIsWakeLockActive(true);
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
          setIsWakeLockActive(false);
        });
      } catch (error) {
        console.warn("Screen Wake Lockを取得できませんでした。", error);
        setIsWakeLockActive(false);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseCurrent();
    };
  }, [enabled, isWakeLockSupported]);

  return { isWakeLockActive, isWakeLockSupported };
}
