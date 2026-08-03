import { useEffect, type RefObject } from "react";

export const MAX_MEDIA_ELEMENT_GAIN = 2;

export const clampMediaElementGain = (volumeGain?: number) =>
  Math.min(MAX_MEDIA_ELEMENT_GAIN, Math.max(0, Number.isFinite(volumeGain) ? volumeGain ?? 1 : 1));

const gainSourceByElement = new WeakMap<HTMLMediaElement, {
  context: AudioContext;
  gainNode: GainNode;
  sourceNode: MediaElementAudioSourceNode;
}>();

export function useMediaElementGain(mediaRef: RefObject<HTMLMediaElement | null>, volumeGain?: number) {
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const gain = clampMediaElementGain(volumeGain);

    if (gain <= 1 && !gainSourceByElement.has(media)) {
      media.volume = gain;
      return;
    }

    media.volume = 1;
    let audioGraph = gainSourceByElement.get(media);
    if (!audioGraph) {
      const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        media.volume = Math.min(1, gain);
        return;
      }
      const context = new AudioContextClass();
      const sourceNode = context.createMediaElementSource(media);
      const gainNode = context.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(context.destination);
      audioGraph = { context, gainNode, sourceNode };
      gainSourceByElement.set(media, audioGraph);
    }

    audioGraph.gainNode.gain.value = gain;
    const resumeAudio = () => {
      if (audioGraph.context.state === "suspended") void audioGraph.context.resume();
    };
    media.addEventListener("play", resumeAudio);
    resumeAudio();

    return () => {
      media.removeEventListener("play", resumeAudio);
    };
  }, [mediaRef, volumeGain]);
}
