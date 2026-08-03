import { describe, expect, it } from "vitest";
import { calculateTotalAssets } from "./rankingValuation";

describe("calculateTotalAssets", () => {
  it("現金と各保有銘柄の現在価値を合計する", () => {
    const total = calculateTotalAssets(
      "1000",
      { alpha: "3", beta: "2" },
      new Map([["alpha", 120], ["beta", "250"]])
    );

    expect(total).toBe("1860");
  });

  it("存在しない銘柄は評価に含めない", () => {
    expect(calculateTotalAssets("1000", { removed: "5" }, new Map())).toBe("1000");
  });
});
