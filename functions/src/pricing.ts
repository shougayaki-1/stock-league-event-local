// functions/src/pricing.ts

import * as admin from "firebase-admin";
import type { PriceRuntimeState, StockPricePhase } from "./types";
import { ECO_RUNTIME_MS } from "./ecoConfig";
export {
  computeTeaseFactor,
  DEFAULT_VOLATILITY_PERCENT,
  interpolatePrice,
  VOLATILITY_NOISE_INTERVAL_MS,
  VOLATILITY_SETTLE_MS,
} from "./pricingCore";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const DEFAULT_PHASES: StockPricePhase[] = [
  { id: "default-flat", startMinute: 0, endMinute: 60, direction: "FLAT", changePercent: 0 },
];

// 基準価格（初期価格）に対する非常時の安全網。運営が設定した大きな
// 値動きを止めないよう、通常の演出では到達しない範囲まで緩和している。
export const MIN_PRICE_RATIO = 0.01; // 基準価格の 1%
export const MAX_PRICE_RATIO = 100;  // 基準価格の 10,000%

// 平均回帰の強さ。基準から離れているほど戻ろうとする力が強くなる。
const REVERSION_BASE = 0.1;
const REVERSION_PER_EXTENSION = 0.5;
const REVERSION_MAX = 0.9;

// 価格を基準価格まわりの許容レンジ（MIN_PRICE_RATIO〜MAX_PRICE_RATIO）に収める。
export const clampToBounds = (price: number, basePrice: number) => {
  const safeBase = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : price;
  const floor = Math.max(1, Math.round(safeBase * MIN_PRICE_RATIO));
  const ceil = Math.max(floor, Math.round(safeBase * MAX_PRICE_RATIO));
  return Math.min(ceil, Math.max(floor, Math.max(1, Math.round(price))));
};

// 目標価格を基準価格へ引き戻す（平均回帰）。基準から離れているほど強く戻す。
export const applyMeanReversion = (target: number, startPrice: number, basePrice: number) => {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return target;
  const extension = Math.abs(startPrice - basePrice) / basePrice;
  const strength = Math.min(REVERSION_MAX, REVERSION_BASE + extension * REVERSION_PER_EXTENSION);
  return target + (basePrice - target) * strength;
};

export const clampMinute = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(60, Math.max(0, Math.round(value)));
};

const normalizeChangePercent = (direction: StockPricePhase["direction"], value: number) => {
  const changePercent = Number.isFinite(value) ? Math.max(0, Math.abs(value)) : 0;
  return direction === "DOWN" ? Math.min(99, changePercent) : changePercent;
};

export const normalizePhases = (phases?: StockPricePhase[] | null): StockPricePhase[] => {
  if (!Array.isArray(phases) || phases.length === 0) return DEFAULT_PHASES;
  return phases.map((phase, index) => {
    const direction = phase.direction === "UP" || phase.direction === "DOWN" || phase.direction === "FLAT" ? phase.direction : "FLAT";
    return {
      id: phase.id || `phase-${index + 1}`,
      startMinute: clampMinute(phase.startMinute, 0),
      endMinute: clampMinute(phase.endMinute, 60),
      direction,
      changePercent: normalizeChangePercent(direction, phase.changePercent),
    };
  });
};

const getJstMinute = (nowMillis: number) => {
  const nowJst = new Date(nowMillis + JST_OFFSET_MS);
  return nowJst.getUTCMinutes();
};

const getJstHourStartMillis = (nowMillis: number) => {
  const nowJst = new Date(nowMillis + JST_OFFSET_MS);
  return Date.UTC(
    nowJst.getUTCFullYear(),
    nowJst.getUTCMonth(),
    nowJst.getUTCDate(),
    nowJst.getUTCHours(),
    0,
    0,
    0
  ) - JST_OFFSET_MS;
};

const isMinuteInPhase = (minute: number, phase: StockPricePhase) => {
  const start = clampMinute(phase.startMinute, 0);
  const end = clampMinute(phase.endMinute, 60);
  if (start === end) return true;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
};

export const getActivePhase = (phases: StockPricePhase[], nowMillis: number) => {
  const minute = getJstMinute(nowMillis);
  return phases.find((phase) => isMinuteInPhase(minute, phase)) || DEFAULT_PHASES[0];
};

export const getPhaseWindow = (phase: StockPricePhase, nowMillis: number) => {
  const startMinute = clampMinute(phase.startMinute, 0);
  const endMinute = clampMinute(phase.endMinute, 60);
  const hourStart = getJstHourStartMillis(nowMillis);
  const minute = getJstMinute(nowMillis);

  if (startMinute === endMinute) {
    return { startMillis: nowMillis, endMillis: nowMillis + 60 * MINUTE_MS };
  }

  if (startMinute < endMinute) {
    return {
      startMillis: hourStart + startMinute * MINUTE_MS,
      endMillis: hourStart + endMinute * MINUTE_MS,
    };
  }

  if (minute >= startMinute) {
    return {
      startMillis: hourStart + startMinute * MINUTE_MS,
      endMillis: hourStart + (endMinute + 60) * MINUTE_MS,
    };
  }

  return {
    startMillis: hourStart - (60 - startMinute) * MINUTE_MS,
    endMillis: hourStart + endMinute * MINUTE_MS,
  };
};

export const getPhaseEndPrice = (startPrice: number, phase: StockPricePhase, basePrice = startPrice) => {
  if (phase.direction === "FLAT" || phase.changePercent === 0) return clampToBounds(startPrice, basePrice);
  const signedPercent = phase.direction === "DOWN" ? -phase.changePercent : phase.changePercent;
  const rawTarget = startPrice * (1 + signedPercent / 100);
  // 平均回帰で基準価格へ引き戻したうえで、許容レンジにクランプして発散を防ぐ。
  const reverted = applyMeanReversion(rawTarget, startPrice, basePrice);
  return clampToBounds(reverted, basePrice);
};

// 1本のランタイムで動かす目標変動幅の上限（±%）。純フラットにせず緩やかに
// ドリフトさせることで、10秒ゆらぎに加えて評価額もじわじわ動く。
const ECO_DRIFT_MAX_PERCENT = 3;

/**
 * ecoMode 用の長尺ランタイムを生成する。現在価格から緩やかなランダムドリフト
 * （±ECO_DRIFT_MAX_PERCENT%）を目標に、平均回帰＋レンジクランプで発散を防ぐ。
 * ECO_RUNTIME_MS の間、クライアント側補間で10秒ごとの値動きが継続する。
 */
export const createEcoRuntime = (
  currentPrice: number,
  nowMillis: number,
  basePrice = currentPrice,
  seed = Math.random() * 1000
): PriceRuntimeState => {
  const signedPercent = (Math.random() * 2 - 1) * ECO_DRIFT_MAX_PERCENT;
  const rawTarget = currentPrice * (1 + signedPercent / 100);
  const reverted = applyMeanReversion(rawTarget, currentPrice, basePrice);
  return {
    mode: "PHASE",
    phaseId: "eco",
    startPrice: currentPrice,
    endPrice: clampToBounds(reverted, basePrice),
    startAt: admin.firestore.Timestamp.fromMillis(nowMillis),
    endAt: admin.firestore.Timestamp.fromMillis(nowMillis + ECO_RUNTIME_MS),
    seed,
  };
};

export const createPhaseRuntime = (
  currentPrice: number,
  phase: StockPricePhase,
  nowMillis: number,
  basePrice = currentPrice,
  seed = Math.random() * 1000
): PriceRuntimeState => {
  const window = getPhaseWindow(phase, nowMillis);
  const startMillis = Math.max(nowMillis, window.startMillis);
  return {
    mode: "PHASE",
    phaseId: phase.id,
    startPrice: currentPrice,
    endPrice: getPhaseEndPrice(currentPrice, phase, basePrice),
    startAt: admin.firestore.Timestamp.fromMillis(startMillis),
    endAt: admin.firestore.Timestamp.fromMillis(Math.max(startMillis + MINUTE_MS, window.endMillis)),
    seed,
  };
};
