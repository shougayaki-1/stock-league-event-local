import type { Timestamp } from "firebase/firestore";
import type { Stock } from "../types/domain";
import type { PriceChangeBranch } from "../types/domain";
import type { ScenarioEvent } from "../types/scenario";
import {
  DEFAULT_VOLATILITY_PERCENT,
  VOLATILITY_NOISE_INTERVAL_MS,
  VOLATILITY_SETTLE_MS,
  interpolatePrice,
  type PriceRuntimeState,
} from "./marketPricing";

// Cloud Functions 側の安全網と同じ値。シミュレーションと本番の到達価格を一致させる。
export const MIN_PRICE_RATIO = 0.01;
export const MAX_PRICE_RATIO = 100;

const MINUTE_MS = 60 * 1000;

export type BranchSelectionMode = "highestProbability" | "largestAbsoluteChange";

export interface PriceSegment {
  stockId: string;
  eventId: string;
  priceChangeIndex: number;
  branchIndex: number;
  startPrice: number;
  endPrice: number;
  rawEndPrice: number;
  basePrice: number;
  startMillis: number;
  endMillis: number;
  effectiveEndMillis: number;
  seed: number;
  fluctuationPercent?: number;
}

export interface PricePoint {
  stockId: string;
  millis: number;
  time: string;
  price: number;
  min: number;
  max: number;
}

export interface SimulationResult {
  series: Record<string, PricePoint[]>;
  segments: PriceSegment[];
  maxMillis: number;
}

export interface SimulateScenarioOptions {
  stocks: Stock[];
  events: ScenarioEvent[];
  sampleIntervalSeconds?: number;
  branchSelectionMode?: BranchSelectionMode;
}

export const formatSimulationTime = (millis: number) => {
  const totalSeconds = Math.max(0, Math.round(millis / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export const clampToBounds = (price: number, basePrice: number) => {
  const safeBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : price;
  const floor = Math.max(1, Math.round(safeBase * MIN_PRICE_RATIO));
  const ceil = Math.max(floor, Math.round(safeBase * MAX_PRICE_RATIO));
  return Math.min(ceil, Math.max(floor, Math.max(1, Math.round(price))));
};

export const getPriceBounds = (basePrice: number) => {
  const safeBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 1;
  const min = Math.max(1, Math.round(safeBase * MIN_PRICE_RATIO));
  const max = Math.max(min, Math.round(safeBase * MAX_PRICE_RATIO));
  return { min, max };
};

export const computeRawBranchEndPrice = (branch: PriceChangeBranch, currentPrice: number) => {
  const legacyTargetPrice = typeof branch.targetPrice === "number" ? branch.targetPrice : null;
  const changePercent = typeof branch.changePercent === "number"
    ? branch.changePercent
    : legacyTargetPrice !== null && currentPrice > 0
      ? ((legacyTargetPrice - currentPrice) / currentPrice) * 100
      : 0;
  return legacyTargetPrice !== null && typeof branch.changePercent !== "number"
    ? legacyTargetPrice
    : currentPrice * (1 + changePercent / 100);
};

export const computeBranchEndPrice = (branch: PriceChangeBranch, currentPrice: number, basePrice: number) =>
  clampToBounds(computeRawBranchEndPrice(branch, currentPrice), basePrice);

export const chooseDeterministicBranch = (
  branches: PriceChangeBranch[],
  mode: BranchSelectionMode = "highestProbability"
) => {
  if (branches.length === 0) return { branch: null, index: -1 };
  const indexed = branches.map((branch, index) => ({ branch, index }));
  if (mode === "largestAbsoluteChange") {
    return indexed.reduce((best, item) => {
      const bestValue = Math.abs(best.branch.changePercent ?? 0);
      const itemValue = Math.abs(item.branch.changePercent ?? 0);
      return itemValue > bestValue ? item : best;
    }, indexed[0]);
  }
  return indexed.reduce((best, item) =>
    (item.branch.probability ?? 0) > (best.branch.probability ?? 0) ? item : best
  , indexed[0]);
};

export const interpolateEnvelope = (
  startPrice: number,
  endPrice: number,
  startMillis: number,
  endMillis: number,
  nowMillis: number,
  _fluctuationPercent?: number
) => {
  void _fluctuationPercent;
  if (nowMillis >= endMillis || endMillis <= startMillis) {
    const rounded = Math.max(1, Math.round(endPrice));
    return { min: rounded, max: rounded };
  }
  const progress = Math.min(1, Math.max(0, (nowMillis - startMillis) / (endMillis - startMillis)));
  const smoothProgress = progress * progress * (3 - 2 * progress);
  const base = startPrice + (endPrice - startPrice) * smoothProgress;
  const remainingMillis = Math.max(0, endMillis - nowMillis);
  const settleFactor = Math.min(1, remainingMillis / VOLATILITY_SETTLE_MS);
  const elapsedMillis = Math.max(0, nowMillis - startMillis);
  const rampInFactor = Math.min(1, elapsedMillis / VOLATILITY_NOISE_INTERVAL_MS);
  const volatilityRatio = DEFAULT_VOLATILITY_PERCENT / 100;
  const jitterAmplitude = startPrice * volatilityRatio * rampInFactor * settleFactor;
  return {
    min: Math.max(1, Math.round(base - jitterAmplitude)),
    max: Math.max(1, Math.round(base + jitterAmplitude)),
  };
};

const timestampFromMillis = (millis: number) => ({ toMillis: () => millis }) as Timestamp;

const createRuntime = (segment: PriceSegment): PriceRuntimeState => ({
  mode: "SCENARIO",
  phaseId: null,
  startPrice: segment.startPrice,
  endPrice: segment.endPrice,
  startAt: timestampFromMillis(segment.startMillis),
  endAt: timestampFromMillis(segment.endMillis),
  seed: segment.seed,
  fluctuationPercent: segment.fluctuationPercent,
});

const getSegmentPrice = (segment: PriceSegment, millis: number) => {
  if (millis >= segment.endMillis) return Math.max(1, Math.round(segment.endPrice));
  return interpolatePrice(createRuntime(segment), millis);
};

const findActiveSegment = (segments: PriceSegment[], millis: number) => {
  let active: PriceSegment | null = null;
  for (const segment of segments) {
    if (segment.startMillis <= millis) active = segment;
    if (segment.startMillis > millis) break;
  }
  return active;
};

export const simulateScenario = ({
  stocks,
  events,
  sampleIntervalSeconds = 30,
  branchSelectionMode = "highestProbability",
}: SimulateScenarioOptions): SimulationResult => {
  const sortedEvents = [...events]
    .filter((event) => Number.isFinite(event.offsetSeconds))
    .sort((a, b) => a.offsetSeconds - b.offsetSeconds);
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const segmentsByStock: Record<string, PriceSegment[]> = {};
  const segments: PriceSegment[] = [];
  let maxMillis = 0;

  for (const stock of stocks) segmentsByStock[stock.id] = [];

  sortedEvents.forEach((event) => {
    const startMillis = Math.max(0, event.offsetSeconds) * 1000;
    maxMillis = Math.max(maxMillis, startMillis);
    event.priceChanges?.forEach((target, priceChangeIndex) => {
      const stock = stockById.get(target.stockId);
      if (!stock || !Array.isArray(target.branches) || target.branches.length === 0) return;

      const { branch, index: branchIndex } = chooseDeterministicBranch(target.branches, branchSelectionMode);
      if (!branch) return;

      const stockSegments = segmentsByStock[target.stockId] ?? [];
      const previous = stockSegments[stockSegments.length - 1];
      const currentPrice = previous ? getSegmentPrice(previous, startMillis) : stock.currentPrice;
      if (previous && startMillis < previous.effectiveEndMillis) {
        previous.effectiveEndMillis = startMillis;
      }

      const basePrice = stock.basePrice && stock.basePrice > 0 ? stock.basePrice : stock.currentPrice;
      const deadlineMinutes = typeof branch.deadlineMinutes === "number" && Number.isFinite(branch.deadlineMinutes)
        ? Math.max(1, branch.deadlineMinutes)
        : 5;
      const rawEndPrice = computeRawBranchEndPrice(branch, currentPrice);
      const endPrice = clampToBounds(rawEndPrice, basePrice);
      const endMillis = startMillis + deadlineMinutes * MINUTE_MS;
      const segment: PriceSegment = {
        stockId: target.stockId,
        eventId: event.id,
        priceChangeIndex,
        branchIndex,
        startPrice: currentPrice,
        endPrice,
        rawEndPrice,
        basePrice,
        startMillis,
        endMillis,
        effectiveEndMillis: endMillis,
        seed: (event.offsetSeconds + priceChangeIndex * 37 + branchIndex * 101) % 1000,
        fluctuationPercent: typeof branch.fluctuationPercent === "number" && Number.isFinite(branch.fluctuationPercent) && branch.fluctuationPercent >= 0
          ? branch.fluctuationPercent
          : undefined,
      };
      stockSegments.push(segment);
      segmentsByStock[target.stockId] = stockSegments;
      segments.push(segment);
      maxMillis = Math.max(maxMillis, endMillis);
    });
  });

  const intervalMillis = Math.max(1, sampleIntervalSeconds) * 1000;
  const pointCount = Math.max(1, Math.ceil(maxMillis / intervalMillis));
  const sampleMillis = Array.from({ length: pointCount + 1 }, (_, index) => Math.min(maxMillis, index * intervalMillis));
  if (!sampleMillis.includes(maxMillis)) sampleMillis.push(maxMillis);

  const series: Record<string, PricePoint[]> = {};
  stocks.forEach((stock) => {
    const stockSegments = segmentsByStock[stock.id] ?? [];
    series[stock.id] = sampleMillis.map((millis) => {
      const active = findActiveSegment(stockSegments, millis);
      if (!active) {
        const price = Math.max(1, Math.round(stock.currentPrice));
        return { stockId: stock.id, millis, time: formatSimulationTime(millis), price, min: price, max: price };
      }
      const price = getSegmentPrice(active, millis);
      const envelope = millis <= active.effectiveEndMillis
        ? interpolateEnvelope(active.startPrice, active.endPrice, active.startMillis, active.endMillis, millis, active.fluctuationPercent)
        : { min: Math.max(1, Math.round(active.endPrice)), max: Math.max(1, Math.round(active.endPrice)) };
      return { stockId: stock.id, millis, time: formatSimulationTime(millis), price, min: envelope.min, max: envelope.max };
    });
  });

  return { series, segments, maxMillis };
};
