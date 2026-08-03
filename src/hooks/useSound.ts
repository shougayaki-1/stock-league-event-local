import { useCallback, useRef } from "react";

// ※パブリックディレクトリ（public/sounds/）に以下の音源ファイルを用意してください。
// public/sounds/news_alert.mp3
// public/sounds/stock_up.mp3
// public/sounds/stock_down.mp3

export type SoundType = "NEWS_ALERT" | "STOCK_UP" | "STOCK_DOWN";

export function useSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      // ★修正: anyを使わずに型を定義して回避
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    // ブラウザの自動再生制限を解除するためにResumeを叩く
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, []);

  const playSound = useCallback((type: SoundType) => {
    initAudioContext();

    let src = "";
    switch (type) {
      case "NEWS_ALERT":
        src = "/sounds/news_alert.mp3";
        break;
      case "STOCK_UP":
        src = "/sounds/stock_up.mp3";
        break;
      case "STOCK_DOWN":
        src = "/sounds/stock_down.mp3";
        break;
    }

    if (!src) return;

    // 音声ファイルをフェッチして再生（AudioContextを使うと途切れにくい）
    fetch(src)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => audioContextRef.current?.decodeAudioData(arrayBuffer))
      .then(audioBuffer => {
        if (!audioBuffer || !audioContextRef.current) return;
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
      })
      .catch(error => console.error("音声の再生に失敗しました:", error));
  }, [initAudioContext]);

  return { playSound, initAudioContext };
}