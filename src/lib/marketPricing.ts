import type { Timestamp } from "firebase/firestore";
import type { Stock } from "../types/domain";
import {
  interpolatePrice,
} from "../../functions/src/pricingCore";
export {
  computeTeaseFactor,
  DEFAULT_VOLATILITY_PERCENT,
  interpolatePrice,
  VOLATILITY_NOISE_INTERVAL_MS,
  VOLATILITY_SETTLE_MS,
} from "../../functions/src/pricingCore";

export type StockPriceDirection = "UP" | "DOWN" | "FLAT";

export interface StockPricePhase {
  id: string;
  startMinute: number;
  endMinute: number;
  direction: StockPriceDirection;
  changePercent: number;
}

export interface PriceRuntimeState {
  mode: "PHASE" | "SCENARIO";
  phaseId?: string | null;
  startPrice: number;
  endPrice: number;
  startAt: Timestamp;
  endAt: Timestamp;
  seed: number;
  fluctuationPercent?: number;
}

export interface PublicMarketData {
  stocks?: Stock[];
  runtime?: Record<string, PriceRuntimeState | null>;
  updatedAt?: Timestamp;
}

export interface ChartData {
  time: string;
  [key: string]: string | number;
}

export const formatHistoryTime = (date: Date) =>
  `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;

export const materializeStocks = (market: PublicMarketData | null, nowMillis = Date.now()): Stock[] => {
  const baseStocks = market?.stocks || [];
  const runtime = market?.runtime || {};
  return baseStocks.map((stock) => {
    const state = runtime[stock.id];
    if (!state) return stock;
    return { ...stock, currentPrice: interpolatePrice(state, nowMillis) };
  });
};

export const createHistoryPoint = (stocks: Stock[], now = new Date()): ChartData => {
  const item: ChartData = { time: formatHistoryTime(now) };
  stocks.forEach((stock) => {
    item[stock.name] = stock.currentPrice;
  });
  return item;
};

export const createMarketHistory = (
  market: PublicMarketData,
  pointCount = 30,
  intervalMillis = 10000,
  nowMillis = Date.now()
): ChartData[] => Array.from({ length: pointCount }, (_, index) => {
  const pointMillis = nowMillis - (pointCount - 1 - index) * intervalMillis;
  return createHistoryPoint(
    materializeStocks(market, pointMillis),
    new Date(pointMillis)
  );
});
