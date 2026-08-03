import type { Stock } from "../types/domain";
import type { PriceChangeBranch } from "../types/domain";
import type { ScenarioEvent } from "../types/scenario";
import { getPriceBounds, type PriceSegment, type SimulationResult } from "./priceSimulation";

export type PriceAnomalyType = "CLAMP" | "RAPID_CHANGE" | "UNREACHABLE_TARGET" | "OVERLAP";
export type PriceAnomalySeverity = "warning" | "danger";

export type PriceAnomalyFix =
  | {
      kind: "PRICE_BRANCH";
      eventId: string;
      priceChangeIndex: number;
      branchIndex: number;
      patch: Partial<PriceChangeBranch>;
      label: string;
    }
  | {
      kind: "OFFSET";
      eventId: string;
      newOffsetSeconds: number;
      label: string;
    };

export interface PriceAnomaly {
  id: string;
  type: PriceAnomalyType;
  stockId: string;
  eventIds: string[];
  severity: PriceAnomalySeverity;
  description: string;
  suggestedFix: PriceAnomalyFix;
}

export interface DetectAnomalyOptions {
  rapidChangeThresholdPercent: number;
  minEventGapSeconds: number;
  clampTolerancePercent?: number;
  shortDeadlinePercentPerMinute?: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

const getStockName = (stocksById: Map<string, Stock>, stockId: string) =>
  stocksById.get(stockId)?.name ?? stockId;

const changePercentForEndPrice = (startPrice: number, endPrice: number) =>
  round1(((endPrice - startPrice) / Math.max(1, startPrice)) * 100);

const detectClampAnomalies = (
  segments: PriceSegment[],
  stocksById: Map<string, Stock>,
  tolerancePercent: number
): PriceAnomaly[] => segments.flatMap<PriceAnomaly>((segment) => {
  const diff = Math.abs(segment.rawEndPrice - segment.endPrice);
  const diffRatio = diff / Math.max(1, Math.abs(segment.rawEndPrice)) * 100;
  if (diffRatio < tolerancePercent) return [];

  const bounds = getPriceBounds(segment.basePrice);
  const isNearBoundary = segment.endPrice <= bounds.min * (1 + tolerancePercent / 100)
    || segment.endPrice >= bounds.max * (1 - tolerancePercent / 100);
  if (!isNearBoundary) return [];

  const stockName = getStockName(stocksById, segment.stockId);
  const changePercent = changePercentForEndPrice(segment.startPrice, segment.endPrice);
  return [{
    id: `clamp-${segment.eventId}-${segment.stockId}-${segment.priceChangeIndex}-${segment.branchIndex}`,
    type: "CLAMP" as const,
    stockId: segment.stockId,
    eventIds: [segment.eventId],
    severity: "danger" as const,
    description: `${stockName} の目標 ${Math.round(segment.rawEndPrice)}pt は許容範囲を超え、${segment.endPrice}pt に補正されます。`,
    suggestedFix: {
      kind: "PRICE_BRANCH" as const,
      eventId: segment.eventId,
      priceChangeIndex: segment.priceChangeIndex,
      branchIndex: segment.branchIndex,
      patch: { changePercent, targetPrice: undefined },
      label: `変動率を ${changePercent}% に調整`,
    },
  }];
});

const detectRapidChangeAnomalies = (
  segments: PriceSegment[],
  stocksById: Map<string, Stock>,
  thresholdPercent: number
): PriceAnomaly[] => segments.flatMap<PriceAnomaly>((segment) => {
  const changePercent = changePercentForEndPrice(segment.startPrice, segment.endPrice);
  if (Math.abs(changePercent) <= thresholdPercent) return [];

  const limitedPercent = round1(Math.sign(changePercent) * thresholdPercent);
  const stockName = getStockName(stocksById, segment.stockId);
  return [{
    id: `rapid-${segment.eventId}-${segment.stockId}-${segment.priceChangeIndex}-${segment.branchIndex}`,
    type: "RAPID_CHANGE" as const,
    stockId: segment.stockId,
    eventIds: [segment.eventId],
    severity: Math.abs(changePercent) >= thresholdPercent * 1.5 ? "danger" as const : "warning" as const,
    description: `${stockName} が ${round1(changePercent)}% 変動します。しきい値 ${thresholdPercent}% を超えています。`,
    suggestedFix: {
      kind: "PRICE_BRANCH" as const,
      eventId: segment.eventId,
      priceChangeIndex: segment.priceChangeIndex,
      branchIndex: segment.branchIndex,
      patch: { changePercent: limitedPercent, targetPrice: undefined },
      label: `変動率を ${limitedPercent}% に抑制`,
    },
  }];
});

const detectUnreachableTargetAnomalies = (
  segments: PriceSegment[],
  stocksById: Map<string, Stock>,
  tolerancePercent: number,
  percentPerMinute: number
): PriceAnomaly[] => segments.flatMap<PriceAnomaly>((segment) => {
  const rawDiffRatio = Math.abs(segment.rawEndPrice - segment.endPrice) / Math.max(1, Math.abs(segment.rawEndPrice)) * 100;
  const deadlineMinutes = Math.max(1, (segment.endMillis - segment.startMillis) / 60000);
  const changePercent = Math.abs(changePercentForEndPrice(segment.startPrice, segment.endPrice));
  const requiredMinutes = Math.ceil(changePercent / Math.max(1, percentPerMinute));
  const stockName = getStockName(stocksById, segment.stockId);

  if (rawDiffRatio >= tolerancePercent) {
    const fixedPercent = changePercentForEndPrice(segment.startPrice, segment.endPrice);
    return [{
      id: `unreachable-clamp-${segment.eventId}-${segment.stockId}-${segment.priceChangeIndex}-${segment.branchIndex}`,
      type: "UNREACHABLE_TARGET" as const,
      stockId: segment.stockId,
      eventIds: [segment.eventId],
      severity: "danger" as const,
      description: `${stockName} の指定目標は価格レンジ外のため期限内に到達できません。`,
      suggestedFix: {
        kind: "PRICE_BRANCH" as const,
        eventId: segment.eventId,
        priceChangeIndex: segment.priceChangeIndex,
        branchIndex: segment.branchIndex,
        patch: { changePercent: fixedPercent, targetPrice: undefined },
        label: `到達可能な ${fixedPercent}% に変更`,
      },
    }];
  }

  if (requiredMinutes > deadlineMinutes) {
    return [{
      id: `unreachable-deadline-${segment.eventId}-${segment.stockId}-${segment.priceChangeIndex}-${segment.branchIndex}`,
      type: "UNREACHABLE_TARGET" as const,
      stockId: segment.stockId,
      eventIds: [segment.eventId],
      severity: "warning" as const,
      description: `${stockName} の ${round1(changePercent)}% 変動に対して期限 ${round1(deadlineMinutes)}分は短めです。`,
      suggestedFix: {
        kind: "PRICE_BRANCH" as const,
        eventId: segment.eventId,
        priceChangeIndex: segment.priceChangeIndex,
        branchIndex: segment.branchIndex,
        patch: { deadlineMinutes: requiredMinutes },
        label: `期限を ${requiredMinutes}分 に延長`,
      },
    }];
  }

  return [];
});

const detectOverlapAnomalies = (
  events: ScenarioEvent[],
  stocksById: Map<string, Stock>,
  minGapSeconds: number
): PriceAnomaly[] => {
  const candidates = events.flatMap((event) =>
    (event.priceChanges ?? []).flatMap((target) =>
      (target.branches ?? []).slice(0, 1).map((branch) => ({
        event,
        stockId: target.stockId,
        endOffsetSeconds: event.offsetSeconds + Math.max(1, branch.deadlineMinutes ?? 5) * 60,
      }))
    )
  ).sort((a, b) => a.stockId.localeCompare(b.stockId) || a.event.offsetSeconds - b.event.offsetSeconds);

  const anomalies: PriceAnomaly[] = [];
  for (let index = 1; index < candidates.length; index += 1) {
    const prev = candidates[index - 1];
    const next = candidates[index];
    if (prev.stockId !== next.stockId) continue;
    const gapSeconds = next.event.offsetSeconds - prev.endOffsetSeconds;
    if (gapSeconds >= minGapSeconds) continue;
    const newOffsetSeconds = prev.endOffsetSeconds + minGapSeconds;
    const stockName = getStockName(stocksById, next.stockId);
    anomalies.push({
      id: `overlap-${prev.event.id}-${next.event.id}-${next.stockId}`,
      type: "OVERLAP",
      stockId: next.stockId,
      eventIds: [prev.event.id, next.event.id],
      severity: gapSeconds < 0 ? "danger" : "warning",
      description: `${stockName} のイベント間隔が ${round1(gapSeconds)}秒です。前の値動きが中断されます。`,
      suggestedFix: {
        kind: "OFFSET",
        eventId: next.event.id,
        newOffsetSeconds,
        label: `開始を ${Math.floor(newOffsetSeconds / 60)}:${(newOffsetSeconds % 60).toString().padStart(2, "0")} に移動`,
      },
    });
  }
  return anomalies;
};

export const detectAllAnomalies = (
  result: SimulationResult,
  events: ScenarioEvent[],
  stocks: Stock[],
  options: DetectAnomalyOptions
): PriceAnomaly[] => {
  const stocksById = new Map(stocks.map((stock) => [stock.id, stock]));
  const clampTolerancePercent = options.clampTolerancePercent ?? 1;
  const shortDeadlinePercentPerMinute = options.shortDeadlinePercentPerMinute ?? options.rapidChangeThresholdPercent;
  return [
    ...detectClampAnomalies(result.segments, stocksById, clampTolerancePercent),
    ...detectRapidChangeAnomalies(result.segments, stocksById, options.rapidChangeThresholdPercent),
    ...detectUnreachableTargetAnomalies(result.segments, stocksById, clampTolerancePercent, shortDeadlinePercentPerMinute),
    ...detectOverlapAnomalies(events, stocksById, options.minEventGapSeconds),
  ];
};
