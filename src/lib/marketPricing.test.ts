import { describe, expect, it } from "vitest";
import type { Stock } from "../types/domain";
import type { ScenarioEvent } from "../types/scenario";
import { computeTeaseFactor, interpolatePrice, type PriceRuntimeState } from "./marketPricing";
import { simulateScenario } from "./priceSimulation";
import {
  computeTeaseFactor as computeServerTeaseFactor,
  interpolatePrice as interpolateServerPrice,
} from "../../functions/src/pricing";

const timestamp = (millis: number) => ({ toMillis: () => millis });

const runtime = (overrides: Partial<PriceRuntimeState> = {}): PriceRuntimeState => ({
  mode: "SCENARIO",
  phaseId: null,
  startPrice: 100,
  endPrice: 250,
  startAt: timestamp(1_000) as PriceRuntimeState["startAt"],
  endAt: timestamp(11_000) as PriceRuntimeState["endAt"],
  seed: 0.42,
  ...overrides,
});

describe("marketPricing parity with Functions pricing", () => {
  it("keeps scenario tease factors identical", () => {
    [0, 0.3, 0.6, 0.85, 0.925, 1].forEach(progress => {
      expect(computeTeaseFactor(progress, 0.42)).toBe(computeServerTeaseFactor(progress, 0.42));
    });
  });

  it("keeps interpolated prices identical for scenario and phase runtimes", () => {
    const scenarios = [
      runtime({ endAt: timestamp(121_000) as PriceRuntimeState["endAt"] }),
      runtime({ mode: "PHASE", phaseId: "flat", startPrice: 180, endPrice: 180, endAt: timestamp(121_000) as PriceRuntimeState["endAt"] }),
      runtime({ mode: "PHASE", phaseId: "up", startPrice: 100, endPrice: 140, endAt: timestamp(121_000) as PriceRuntimeState["endAt"] }),
    ];

    scenarios.forEach(item => {
      [0, 1_000, 4_000, 9_500, 15_000, 45_000, 121_000].forEach(nowMillis => {
        expect(interpolatePrice(item, nowMillis)).toBe(interpolateServerPrice(item as never, nowMillis));
      });
    });
  });
});

const simulationStocks: Stock[] = [
  { id: "alpha", name: "アルファ", currentPrice: 100, basePrice: 100 },
];

const simulationEvent: ScenarioEvent = {
  id: "event-1",
  time: null,
  offsetSeconds: 10,
  priceChanges: [
    {
      stockId: "alpha",
      branches: [
        { probability: 80, changePercent: 50, deadlineMinutes: 1, fluctuationPercent: 25 },
        { probability: 20, changePercent: -30, deadlineMinutes: 1 },
      ],
    },
  ],
  isProcessed: false,
};

describe("scenario price simulation", () => {
  it("uses the highest-probability branch as the representative path", () => {
    const result = simulateScenario({ stocks: simulationStocks, events: [simulationEvent], sampleIntervalSeconds: 10 });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].branchIndex).toBe(0);
    expect(result.segments[0].endPrice).toBe(150);
  });

  it("uses the fixed ±5% volatility model and stays aligned with production", () => {
    const result = simulateScenario({ stocks: simulationStocks, events: [simulationEvent], sampleIntervalSeconds: 7 });
    const segment = result.segments[0];
    const point = result.series.alpha.find(item => item.millis === 35_000);

    expect(segment.fluctuationPercent).toBe(25);
    expect(point).toBeDefined();

    const runtime: PriceRuntimeState = {
      mode: "SCENARIO",
      phaseId: null,
      startPrice: segment.startPrice,
      endPrice: segment.endPrice,
      startAt: timestamp(segment.startMillis) as PriceRuntimeState["startAt"],
      endAt: timestamp(segment.endMillis) as PriceRuntimeState["endAt"],
      seed: segment.seed,
      fluctuationPercent: segment.fluctuationPercent,
    };

    expect(point?.price).toBe(interpolatePrice(runtime, 35_000));

    expect(interpolatePrice({ ...runtime, fluctuationPercent: 1 }, 15_000))
      .toBe(interpolatePrice({ ...runtime, fluctuationPercent: 80 }, 15_000));
  });
});
