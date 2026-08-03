import type { RiddleStep } from "./riddleConstants";

export const RIDDLE_TRANSITION_LABELS: Record<RiddleStep["autoTransitionType"], string> = {
  VIDEO_END: "動画終了で次へ",
  TIME_ELAPSED: "指定秒数で次へ",
  MANUAL_OR_TIMER: "手動またはタイマーで次へ",
};

export const formatRiddleDuration = (seconds?: number | null) => {
  const safeSeconds = Math.max(0, seconds ?? 0);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (mins === 0) return `${secs}秒`;
  if (secs === 0) return `${mins}分`;
  return `${mins}分${secs}秒`;
};

export const buildRiddleSignageUrl = (origin: string, roomId: string, role: string) => {
  const baseUrl = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${baseUrl}/signage/riddle?roomId=${encodeURIComponent(roomId)}&role=${encodeURIComponent(role)}`;
};
