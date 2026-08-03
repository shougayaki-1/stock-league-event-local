import { describe, expect, it } from "vitest";
import { DEFAULT_STOCK_PHASES } from "../lib/stockPhaseCsv";
import { omitPhaseDrafts, phaseDraftChanged, type PhaseDrafts } from "./useStockPhaseDrafts";

describe("useStockPhaseDrafts helpers", () => {
  it("detects draft changes against config fallback", () => {
    const drafts: PhaseDrafts = {
      s1: [{ ...DEFAULT_STOCK_PHASES[0], direction: "UP", changePercent: 5 }],
      s2: DEFAULT_STOCK_PHASES,
    };
    const configs = { s2: { phases: DEFAULT_STOCK_PHASES } };

    expect(phaseDraftChanged("s1", drafts, configs)).toBe(true);
    expect(phaseDraftChanged("s2", drafts, configs)).toBe(false);
    expect(phaseDraftChanged("s3", drafts, configs)).toBe(false);
  });

  it("omits saved phase drafts", () => {
    expect(omitPhaseDrafts({ s1: DEFAULT_STOCK_PHASES, s2: DEFAULT_STOCK_PHASES }, ["s1"])).toEqual({
      s2: DEFAULT_STOCK_PHASES,
    });
  });
});
