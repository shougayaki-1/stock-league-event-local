// functions/src/pricing.test.ts
//
// 価格補間・平均回帰・フェーズ正規化ロジックのユニットテスト。
// tradeStock がここで生成された currentPrice を BigInt に変換するため、
// interpolatePrice が常に整数を返すことは重要な不変条件。

import * as admin from "firebase-admin";
import { describe, expect, it } from "vitest";
import {
  applyMeanReversion,
  clampMinute,
  clampToBounds,
  computeTeaseFactor,
  createPhaseRuntime,
  DEFAULT_PHASES,
  getActivePhase,
  getPhaseEndPrice,
  getPhaseWindow,
  interpolatePrice,
  normalizePhases,
} from "./pricing";
import { PriceRuntimeState, StockPricePhase } from "./types";

const Timestamp = admin.firestore.Timestamp;

describe("clampToBounds", () => {
  it("基準価格の1%〜10,000%という非常時の安全網にだけ収める", () => {
    expect(clampToBounds(20_000, 100)).toBe(10_000); // 上限10,000%
    expect(clampToBounds(0, 100)).toBe(1); // 下限1%
    expect(clampToBounds(5, 100)).toBe(5); // 旧30%下限より低い価格も許可
    expect(clampToBounds(5_000, 100)).toBe(5_000); // 旧300%上限を超える価格も許可
    expect(clampToBounds(100, 100)).toBe(100);
  });

  it("最低でも1を返す", () => {
    expect(clampToBounds(-50, 10)).toBeGreaterThanOrEqual(1);
    expect(clampToBounds(0, 0)).toBe(1);
  });

  it("常に整数を返す（四捨五入）", () => {
    const result = clampToBounds(100.6, 1000);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("applyMeanReversion", () => {
  it("基準価格から離れているほど強く引き戻す", () => {
    const nearBase = applyMeanReversion(110, 105, 100); // extensionが小さい
    const farFromBase = applyMeanReversion(400, 300, 100); // extensionが大きい
    // farFromBaseのほうが基準価格100に強く引き戻されるはず
    expect(Math.abs(farFromBase - 100)).toBeLessThan(Math.abs(400 - 100));
    expect(nearBase).not.toBe(110);
  });

  it("basePriceが不正な場合はtargetをそのまま返す", () => {
    expect(applyMeanReversion(150, 100, 0)).toBe(150);
    expect(applyMeanReversion(150, 100, -10)).toBe(150);
    expect(applyMeanReversion(150, 100, NaN)).toBe(150);
  });
});

describe("clampMinute", () => {
  it("0〜60の範囲にクランプする", () => {
    expect(clampMinute(-5, 0)).toBe(0);
    expect(clampMinute(70, 0)).toBe(60);
    expect(clampMinute(30, 0)).toBe(30);
  });

  it("NaN/Infinityはfallbackを返す", () => {
    expect(clampMinute(NaN, 15)).toBe(15);
    expect(clampMinute(Infinity, 20)).toBe(20);
  });
});

describe("normalizePhases", () => {
  it("空/未定義の場合はDEFAULT_PHASESにフォールバックする", () => {
    expect(normalizePhases(undefined)).toEqual(DEFAULT_PHASES);
    expect(normalizePhases(null)).toEqual(DEFAULT_PHASES);
    expect(normalizePhases([])).toEqual(DEFAULT_PHASES);
  });

  it("不正なdirectionはFLATに矯正される", () => {
    const phases = normalizePhases([
      { id: "p1", startMinute: 0, endMinute: 30, direction: "SIDEWAYS" as StockPricePhase["direction"], changePercent: 10 },
    ]);
    expect(phases[0].direction).toBe("FLAT");
  });

  it("DOWNのchangePercentは99%を超えないようにクランプされる", () => {
    const phases = normalizePhases([
      { id: "p1", startMinute: 0, endMinute: 30, direction: "DOWN", changePercent: 150 },
    ]);
    expect(phases[0].changePercent).toBe(99);
  });

  it("changePercentは常に非負になる", () => {
    const phases = normalizePhases([
      { id: "p1", startMinute: 0, endMinute: 30, direction: "UP", changePercent: -20 },
    ]);
    expect(phases[0].changePercent).toBe(20);
  });
});

describe("getActivePhase / getPhaseWindow", () => {
  it("該当フェーズが無い場合はDEFAULT_PHASESにフォールバックする", () => {
    const phase = getActivePhase([], Date.now());
    expect(phase).toEqual(DEFAULT_PHASES[0]);
  });

  it("開始>終了（日をまたぐ）フェーズのウィンドウも計算できる", () => {
    const phase: StockPricePhase = { id: "wrap", startMinute: 50, endMinute: 10, direction: "FLAT", changePercent: 0 };
    const window = getPhaseWindow(phase, Date.now());
    expect(window.endMillis).toBeGreaterThan(window.startMillis);
  });

  it("開始=終了は1時間通しのフェーズとして扱う", () => {
    const phase: StockPricePhase = { id: "full", startMinute: 10, endMinute: 10, direction: "FLAT", changePercent: 0 };
    const window = getPhaseWindow(phase, Date.now());
    expect(window.endMillis - window.startMillis).toBe(60 * 60 * 1000);
  });
});

describe("getPhaseEndPrice", () => {
  it("FLATまたはchangePercent 0のときは開始価格をクランプして返す", () => {
    const phase: StockPricePhase = { id: "flat", startMinute: 0, endMinute: 30, direction: "FLAT", changePercent: 0 };
    expect(getPhaseEndPrice(100, phase, 100)).toBe(100);
  });

  it("UPフェーズは価格を上昇させる方向に作用する", () => {
    const phase: StockPricePhase = { id: "up", startMinute: 0, endMinute: 30, direction: "UP", changePercent: 10 };
    const end = getPhaseEndPrice(100, phase, 100);
    expect(end).toBeGreaterThanOrEqual(100);
  });

  it("DOWNフェーズは価格を下降させる方向に作用する", () => {
    const phase: StockPricePhase = { id: "down", startMinute: 0, endMinute: 30, direction: "DOWN", changePercent: 10 };
    const end = getPhaseEndPrice(100, phase, 100);
    expect(end).toBeLessThanOrEqual(100);
  });
});

describe("interpolatePrice — tradeStockがBigInt変換する値の不変条件", () => {
  const makeRuntime = (overrides: Partial<PriceRuntimeState>): PriceRuntimeState => ({
    mode: "SCENARIO",
    phaseId: null,
    startPrice: 100,
    endPrice: 200,
    startAt: Timestamp.fromMillis(0),
    endAt: Timestamp.fromMillis(10_000),
    seed: 1,
    ...overrides,
  });

  it("終了時刻以降は常に整数のendPriceを返す（最低1）", () => {
    const runtime = makeRuntime({ endPrice: 150.7 });
    const price = interpolatePrice(runtime, 20_000);
    expect(Number.isInteger(price)).toBe(true);
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it("SCENARIOモードはレンジ外の明示目標でも期限後にendPriceへ到達する", () => {
    const runtime = makeRuntime({ endPrice: 1000 });
    expect(interpolatePrice(runtime, 20_000)).toBe(1000);
  });

  it("進行中は常に整数を返す（線形補間+ジッター含む）", () => {
    const runtime = makeRuntime({});
    for (let t = 0; t <= 10_000; t += 1000) {
      const price = interpolatePrice(runtime, t);
      expect(Number.isInteger(price)).toBe(true);
      expect(price).toBeGreaterThanOrEqual(1);
    }
  });

  it("PHASEモードでstartPrice===endPriceのときもランダム補間で整数を返す", () => {
    const runtime = makeRuntime({ mode: "PHASE", startPrice: 500, endPrice: 500 });
    for (let t = 0; t <= 10_000; t += 500) {
      const price = interpolatePrice(runtime, t);
      expect(Number.isInteger(price)).toBe(true);
    }
  });

  it("同じseed・時刻ではランダムな価格を再現し、銘柄別seedでは独立する", () => {
    const runtime = makeRuntime({ mode: "PHASE", startPrice: 100, endPrice: 100, endAt: Timestamp.fromMillis(120_000), seed: 42 });
    const otherRuntime = makeRuntime({ mode: "PHASE", startPrice: 100, endPrice: 100, endAt: Timestamp.fromMillis(120_000), seed: 99 });

    expect(interpolatePrice(runtime, 15_000)).toBe(interpolatePrice(runtime, 15_000));
    expect(interpolatePrice(runtime, 15_000)).not.toBe(interpolatePrice(otherRuntime, 15_000));
  });

  it("開始時と到達期限ではゆらぎを収束させ、終了時は目標価格へ到達する", () => {
    const runtime = makeRuntime({ startPrice: 100, endPrice: 100, endAt: Timestamp.fromMillis(60_000) });

    expect(interpolatePrice(runtime, 0)).toBe(100);
    expect(interpolatePrice(runtime, 60_000)).toBe(100);
  });

  it("全ランタイムで最大±5%の固定幅を使い、個別設定では上振れしない", () => {
    const common = { mode: "PHASE" as const, startPrice: 100, endPrice: 100, endAt: Timestamp.fromMillis(120_000) };
    const price = interpolatePrice(makeRuntime({ ...common, fluctuationPercent: 0 }), 15_000);
    expect(price).toBeGreaterThanOrEqual(95);
    expect(price).toBeLessThanOrEqual(105);
    expect(interpolatePrice(makeRuntime({ ...common, fluctuationPercent: 1 }), 15_000))
      .toBe(interpolatePrice(makeRuntime({ ...common, fluctuationPercent: 80 }), 15_000));
  });

  it("endMillis <= startMillisの異常データでもendPriceにフォールバックする", () => {
    const runtime = makeRuntime({ startAt: Timestamp.fromMillis(5000), endAt: Timestamp.fromMillis(1000) });
    const price = interpolatePrice(runtime, 3000);
    expect(Number.isInteger(price)).toBe(true);
  });

  it("SCENARIOモードは開始時から目標方向へ進む", () => {
    const factor = computeTeaseFactor(0.3, 1);
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(0.3);

    const runtime = makeRuntime({ startPrice: 100, endPrice: 200, seed: 1 });
    const price = interpolatePrice(runtime, 3000);
    expect(price).toBeGreaterThanOrEqual(100);
  });

  it("SCENARIOモード終盤は目標価格へ収束する", () => {
    const before = computeTeaseFactor(0.85, 1);
    const middle = computeTeaseFactor(0.925, 1);
    const end = computeTeaseFactor(1, 1);

    expect(before).toBeLessThan(middle);
    expect(middle).toBeLessThan(end);
    expect(end).toBe(1);
  });
});

describe("createPhaseRuntime", () => {
  it("生成したruntimeのstartAt/endAtが正しい順序になっている", () => {
    const phase: StockPricePhase = { id: "p1", startMinute: 0, endMinute: 30, direction: "UP", changePercent: 5 };
    const runtime = createPhaseRuntime(100, phase, Date.now(), 100);
    expect(runtime.endAt.toMillis()).toBeGreaterThan(runtime.startAt.toMillis());
    expect(runtime.mode).toBe("PHASE");
  });
});
