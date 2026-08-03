import { getPostNews, getPublicNews, type ScenarioEvent } from "../../../types/scenario";
import type { NewsPreset } from "../../../types/newsPreset";

export interface ScheduleEventLane {
  top: string;
  label: string;
  name: string;
  className: string;
  badgeClassName: string;
}

export const labelForEvent = (
  event: ScenarioEvent,
  videoNameById: Record<string, string> = {},
  signageNameById: Record<string, string> = {},
  presetsById: Map<string, NewsPreset> = new Map()
) => {
  const publicNews = getPublicNews(event, presetsById);
  if (publicNews?.title) return publicNews.title;
  const postNews = getPostNews(event, presetsById);
  if (postNews?.title) return postNews.title;
  const publicPreset = event.publicNewsPresetId ? presetsById.get(event.publicNewsPresetId) : null;
  if (publicPreset?.signageDisplay) {
    const signageId = event.signageTargetId || event.signageAction?.signageId || "";
    return `${publicPreset.signageDisplay.kind === "AD" ? "広告" : "サイネージ"} ${signageNameById[signageId] || signageId || "送出先未設定"}${publicPreset.signageDisplay.videoAssetId ? ` / ${videoNameById[publicPreset.signageDisplay.videoAssetId] || publicPreset.signageDisplay.videoAssetId}` : ""}`;
  }
  if (publicPreset?.breakingVideoId) return `速報動画 ${videoNameById[publicPreset.breakingVideoId] || publicPreset.breakingVideoId}`;
  if (event.signageAction) {
    return `${event.signageAction.kind === "AD" ? "広告" : "サイネージ"} ${signageNameById[event.signageAction.signageId] || event.signageAction.signageId}${event.signageAction.videoAssetId ? ` / ${videoNameById[event.signageAction.videoAssetId] || event.signageAction.videoAssetId}` : ""}`;
  }
  if (event.breakingVideoId) return `速報動画 ${videoNameById[event.breakingVideoId] || event.breakingVideoId}`;
  if (event.priceChanges?.length) return "株価変動";
  return "イベント";
};

export const laneForEvent = (event: ScenarioEvent, presetsById: Map<string, NewsPreset> = new Map()): ScheduleEventLane => {
  if (getPublicNews(event, presetsById) || getPostNews(event, presetsById)) {
    return {
      top: "24%",
      label: "N",
      name: "ニュース",
      className: "bg-emerald-600",
      badgeClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-900",
    };
  }
  if (event.priceChanges?.length) {
    return {
      top: "42%",
      label: "¥",
      name: "株価",
      className: "bg-blue-600",
      badgeClassName: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/45 dark:text-blue-200 dark:ring-blue-900",
    };
  }
  const publicPreset = event.publicNewsPresetId ? presetsById.get(event.publicNewsPresetId) : null;
  if (publicPreset?.breakingVideoId || event.breakingVideoId) {
    return {
      top: "60%",
      label: "▶",
      name: "動画",
      className: "bg-amber-600",
      badgeClassName: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-900",
    };
  }
  if (publicPreset?.signageDisplay || event.signageAction) {
    return {
      top: "78%",
      label: "TV",
      name: "サイネージ",
      className: "bg-purple-600",
      badgeClassName: "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/45 dark:text-purple-200 dark:ring-purple-900",
    };
  }
  return {
    top: "50%",
    label: "•",
    name: "その他",
    className: "bg-slate-600",
    badgeClassName: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
  };
};

export const eventMillisForSession = (event: ScenarioEvent, sessionStartMillis: number) => (
  event.time?.toMillis?.() ?? sessionStartMillis + (event.offsetSeconds || 0) * 1000
);
