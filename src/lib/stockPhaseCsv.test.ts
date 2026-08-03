import { describe, expect, it } from "vitest";
import { groupStockPhasePreviewRows, parseStockPhaseCsvRows, validateStockPhases } from "./stockPhaseCsv";

describe("stockPhaseCsv", () => {
  it("parses Japanese CSV headers and direction labels", () => {
    expect(parseStockPhaseCsvRows([{
      "銘柄ID": "sample",
      "フェーズID": "phase-1",
      "開始分": "0",
      "終了分": "10",
      "方向": "上昇",
      "変動率(%)": "12.5",
    }])).toEqual([{
      index: 2,
      stockId: "sample",
      phaseId: "phase-1",
      startMinute: 0,
      endMinute: 10,
      direction: "UP",
      changePercent: 12.5,
      error: undefined,
    }]);
  });

  it("reports invalid rows", () => {
    const rows = parseStockPhaseCsvRows([{
      stockId: "",
      startMinute: "20",
      endMinute: "10",
      direction: "DOWN",
      changePercent: "100",
    }]);

    expect(rows[0].error).toContain("銘柄IDが空です");
    expect(rows[0].error).toContain("下落率は100%未満");
  });

  it("validates reusable phase rules", () => {
    expect(validateStockPhases([{ id: "x", startMinute: 0, endMinute: 60, direction: "FLAT", changePercent: 0 }])).toBeNull();
    expect(validateStockPhases([{ id: "x", startMinute: 50, endMinute: 10, direction: "UP", changePercent: 1 }])).toBeNull();
    expect(validateStockPhases([{ id: "x", startMinute: 10, endMinute: 10, direction: "UP", changePercent: 1 }])).toBeNull();
    expect(validateStockPhases([{ id: "x", startMinute: -1, endMinute: 10, direction: "UP", changePercent: 1 }])).toContain("0〜60分");
  });

  it("accepts wrap-around and full-hour phase rows to match Functions pricing", () => {
    const rows = parseStockPhaseCsvRows([
      { stockId: "s1", phaseId: "wrap", startMinute: "50", endMinute: "10", direction: "UP", changePercent: "5" },
      { stockId: "s1", phaseId: "full", startMinute: "10", endMinute: "10", direction: "FLAT", changePercent: "0" },
    ]);

    expect(rows[0].error).toBeUndefined();
    expect(rows[1].error).toBeUndefined();
  });

  it("groups preview rows by stock id", () => {
    expect(groupStockPhasePreviewRows([{
      index: 2,
      stockId: "s1",
      phaseId: "p1",
      startMinute: 0,
      endMinute: 30,
      direction: "DOWN",
      changePercent: 5,
    }])).toEqual({
      s1: [{ id: "p1", startMinute: 0, endMinute: 30, direction: "DOWN", changePercent: 5 }]
    });
  });
});
