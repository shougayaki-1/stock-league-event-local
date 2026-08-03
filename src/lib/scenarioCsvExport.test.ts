import { describe, expect, it } from "vitest";
import { buildScenarioCsvRows, formatScenarioOffsetTime, SCENARIO_CSV_COLUMNS } from "./scenarioCsvExport";
import type { ScenarioEvent } from "../types/scenario";

describe("scenarioCsvExport", () => {
  it("formats offsets as mm:ss", () => {
    expect(formatScenarioOffsetTime(0)).toBe("00:00");
    expect(formatScenarioOffsetTime(305)).toBe("05:05");
    expect(formatScenarioOffsetTime(-1)).toBe("00:00");
  });

  it("builds one row per branch and keeps configured columns", () => {
    const rows = buildScenarioCsvRows([{
      id: "e1",
      time: null,
      offsetSeconds: 90,
      publicNewsPresetId: "np-public",
      postNewsPresetId: "np-post",
      postNewsDelaySeconds: 30,
      priceChanges: [{
        stockId: "s1",
        branches: [
          {
            label: "成功",
            probability: 80,
            changePercent: 10,
            deadlineMinutes: 5,
            postNewsPresetId: "np-branch",
            postNewsDelaySeconds: 45,
          },
          { probability: 20, targetPrice: 120 },
        ],
      }],
      signageTargetId: "sig1",
      isProcessed: false,
    } as ScenarioEvent], { v1: "速報", v2: "動画" }, { "np-public": "表プリセット", "np-post": "裏プリセット", "np-branch": "成功後プリセット" });

    expect(SCENARIO_CSV_COLUMNS).toContain("経過時間(分:秒)");
    expect(rows).toHaveLength(2);
    expect(rows[0]["経過時間(分:秒)"]).toBe("01:30");
    expect(SCENARIO_CSV_COLUMNS).not.toContain("速報動画名");
    expect(rows[0]["サイネージID"]).toBe("sig1");
    expect(rows[0]["分岐名"]).toBe("成功");
    expect(rows[0]["表ニュースプリセット名"]).toBe("表プリセット");
    expect(rows[0]["事後ニュースプリセット名"]).toBe("裏プリセット");
    expect(rows[0]["分岐事後ニュースプリセット名"]).toBe("成功後プリセット");
    expect(rows[0]["分岐事後ニュース遅延秒数"]).toBe("45");
    expect(rows[1]["目標価格"]).toBe("120");
    expect(SCENARIO_CSV_COLUMNS).toContain("分岐事後ニュースプリセット名");
    expect(SCENARIO_CSV_COLUMNS).not.toContain("サイネージ表示モード");
  });
});
