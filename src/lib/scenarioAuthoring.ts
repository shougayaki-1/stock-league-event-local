import { getPostNews, getPublicNews, type ScenarioEvent } from "../types/scenario";
import type { NewsPreset } from "../types/newsPreset";

export const TIME_BUCKET_SECONDS = 60;

export function formatOffsetSigned(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `+${mm}:${ss}`;
}

export interface TimeBucketGroup {
  bucketStart: number;
  label: string;
  events: ScenarioEvent[];
}

export function groupEventsByTimeBucket(
  events: ScenarioEvent[],
  bucketSeconds: number = TIME_BUCKET_SECONDS
): TimeBucketGroup[] {
  const safeBucketSeconds = Math.max(1, bucketSeconds);
  const sorted = [...events]
    .filter(event => typeof event.offsetSeconds === "number" && !Number.isNaN(event.offsetSeconds))
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds);
  const map = new Map<number, ScenarioEvent[]>();

  for (const event of sorted) {
    const offset = Math.max(0, event.offsetSeconds);
    const bucketStart = Math.floor(offset / safeBucketSeconds) * safeBucketSeconds;
    const list = map.get(bucketStart) ?? [];
    list.push(event);
    map.set(bucketStart, list);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketStart, groupEvents]) => ({
      bucketStart,
      label: formatOffsetSigned(bucketStart).slice(1),
      events: groupEvents,
    }));
}

export type EventWarning = "DUPLICATE_TIME" | "EMPTY_TITLE" | "EMPTY_EVENT";

const eventTitle = (event: ScenarioEvent, presetsById: Map<string, NewsPreset>): string =>
  getPublicNews(event, presetsById)?.title || getPostNews(event, presetsById)?.title || "";

const hasAnyContent = (event: ScenarioEvent, presetsById: Map<string, NewsPreset>): boolean =>
  Boolean(getPublicNews(event, presetsById)?.title) ||
  Boolean(getPostNews(event, presetsById)?.title) ||
  Boolean(event.priceChanges?.length) ||
  Boolean(event.publicNewsPresetId && presetsById.get(event.publicNewsPresetId)?.breakingVideoId) ||
  Boolean(event.publicNewsPresetId && presetsById.get(event.publicNewsPresetId)?.signageDisplay) ||
  Boolean(event.breakingVideoId) ||
  Boolean(event.signageAction);

export function detectEventWarnings(
  events: ScenarioEvent[],
  presetsById: Map<string, NewsPreset> = new Map()
): Map<string, EventWarning[]> {
  const result = new Map<string, EventWarning[]>();
  const offsetCounts = new Map<number, number>();

  for (const event of events) {
    const offset = Number.isFinite(event.offsetSeconds) ? event.offsetSeconds : 0;
    offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
  }

  for (const event of events) {
    const warnings: EventWarning[] = [];
    const offset = Number.isFinite(event.offsetSeconds) ? event.offsetSeconds : 0;
    if ((offsetCounts.get(offset) ?? 0) > 1) warnings.push("DUPLICATE_TIME");

    const title = eventTitle(event, presetsById).trim();
    if (title.length <= 2 || title.includes("{企業名}")) warnings.push("EMPTY_TITLE");
    if (!hasAnyContent(event, presetsById)) warnings.push("EMPTY_EVENT");

    if (warnings.length > 0) result.set(event.id, warnings);
  }

  return result;
}

export type OverviewCategory = "news" | "price" | "video" | "signage" | "other";

export function categoryForEvent(event: ScenarioEvent, presetsById: Map<string, NewsPreset> = new Map()): OverviewCategory {
  if (getPublicNews(event, presetsById)?.title || getPostNews(event, presetsById)?.title) return "news";
  if (event.priceChanges?.length) return "price";
  const publicPreset = event.publicNewsPresetId ? presetsById.get(event.publicNewsPresetId) : null;
  if (publicPreset?.breakingVideoId) return "video";
  if (publicPreset?.signageDisplay) return "signage";
  if (event.breakingVideoId) return "video";
  if (event.signageAction) return "signage";
  return "other";
}

export interface OverviewCluster {
  binIndex: number;
  ratio: number;
  count: number;
  category: OverviewCategory;
  eventIds: string[];
}

export function buildOverviewClusters(
  events: ScenarioEvent[],
  rangeSeconds: number,
  binCount: number = 40,
  presetsById: Map<string, NewsPreset> = new Map()
): OverviewCluster[] {
  if (rangeSeconds <= 0 || binCount <= 0) return [];
  const bins = new Map<number, { count: number; categories: OverviewCategory[]; eventIds: string[] }>();

  for (const event of events) {
    const clamped = Math.min(rangeSeconds, Math.max(0, event.offsetSeconds || 0));
    const binIndex = Math.min(binCount - 1, Math.floor((clamped / rangeSeconds) * binCount));
    const bin = bins.get(binIndex) ?? { count: 0, categories: [], eventIds: [] };
    bin.count += 1;
    bin.categories.push(categoryForEvent(event, presetsById));
    bin.eventIds.push(event.id);
    bins.set(binIndex, bin);
  }

  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([binIndex, bin]) => ({
      binIndex,
      ratio: binCount === 1 ? 0 : binIndex / (binCount - 1),
      count: bin.count,
      category: mostFrequent(bin.categories),
      eventIds: bin.eventIds,
    }));
}

function mostFrequent(categories: OverviewCategory[]): OverviewCategory {
  const counts = new Map<OverviewCategory, number>();
  let best: OverviewCategory = "other";
  let bestCount = 0;

  for (const category of categories) {
    const next = (counts.get(category) ?? 0) + 1;
    counts.set(category, next);
    if (next > bestCount) {
      bestCount = next;
      best = category;
    }
  }

  return best;
}
