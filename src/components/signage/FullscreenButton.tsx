import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

interface Props {
  className?: string;
}

const getFullscreenElement = () => {
  const doc = document as WebkitDocument;
  return document.fullscreenElement || doc.webkitFullscreenElement || null;
};

const canUseFullscreen = () => {
  const target = document.documentElement as WebkitElement;
  const doc = document as WebkitDocument;
  return Boolean(target.requestFullscreen || target.webkitRequestFullscreen || document.exitFullscreen || doc.webkitExitFullscreen);
};

export default function FullscreenButton({ className = "" }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(Boolean(getFullscreenElement()));

    setIsSupported(canUseFullscreen());
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as WebkitDocument;
    const target = document.documentElement as WebkitElement;

    try {
      if (getFullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
        return;
      }

      if (target.requestFullscreen) await target.requestFullscreen();
      else await target.webkitRequestFullscreen?.();
    } catch (error) {
      console.warn("Failed to toggle signage fullscreen.", error);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      disabled={!isSupported}
      aria-label={isFullscreen ? "最大化を解除" : "最大化"}
      title={isSupported ? (isFullscreen ? "最大化を解除" : "最大化") : "このブラウザでは最大化に対応していません"}
      className={`absolute top-6 right-6 z-[70] rounded-full border border-slate-200 bg-white/85 p-3 text-slate-500 shadow-md transition hover:bg-white hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-black/70 dark:hover:bg-black/85 ${className}`}
    >
      {isFullscreen ? <Minimize2 size={28} /> : <Maximize2 size={28} />}
    </button>
  );
}
