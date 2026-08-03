import type { CsvScenarioRow, ScenarioEvent } from "../types/scenario";

export const SCENARIO_CSV_COLUMNS = [
  "経過時間(分:秒)",
  "対象銘柄",
  "変動率(%)",
  "到達期限(分)",
  "目標価格",
  "変動確率(%)",
  "分岐名",
  "分岐事後ニュースプリセット名",
  "分岐事後ニュース遅延秒数",
  "サイネージID",
  "イベント名",
  "表ニュースプリセット名",
  "事後ニュースプリセット名",
  "事後ニュース遅延秒数",
  "裏ニュースプリセット名",
] as const;

export const formatScenarioOffsetTime = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
};

const buildBaseScenarioCsvRow = (
  event: ScenarioEvent,
  _videoNameById: Record<string, string>,
  newsPresetNameById: Record<string, string>
) => {
  return {
    "経過時間(分:秒)": formatScenarioOffsetTime(event.offsetSeconds || 0),
    "サイネージID": event.signageTargetId || event.signageAction?.signageId || "",
    "イベント名": "CSVイベント",
    "表ニュースプリセット名": event.publicNewsPresetId ? newsPresetNameById[event.publicNewsPresetId] || "" : "",
    "事後ニュースプリセット名": event.postNewsPresetId ? newsPresetNameById[event.postNewsPresetId] || "" : "",
    "事後ニュース遅延秒数": String(event.postNewsDelaySeconds ?? 0),
    "裏ニュースプリセット名": event.insiderNewsPresetId ? newsPresetNameById[event.insiderNewsPresetId] || "" : "",
  };
};

export function buildScenarioCsvRows(
  events: ScenarioEvent[],
  videoNameById: Record<string, string>,
  newsPresetNameById: Record<string, string> = {}
): CsvScenarioRow[] {
  return events.flatMap((event) => {
    const baseRow = buildBaseScenarioCsvRow(event, videoNameById, newsPresetNameById);
    const priceChanges = event.priceChanges || [];
    if (priceChanges.length === 0) {
      return [{
        ...baseRow,
        "対象銘柄": "",
        "変動率(%)": "",
        "到達期限(分)": "",
        "目標価格": "",
        "変動確率(%)": "",
        "分岐名": "",
        "分岐事後ニュースプリセット名": "",
        "分岐事後ニュース遅延秒数": "",
      }];
    }

    return priceChanges.flatMap((change) => {
      const branches = change.branches?.length ? change.branches : [{ probability: 100, changePercent: 0, deadlineMinutes: 5 }];
      return branches.map((branch) => ({
        ...baseRow,
        "対象銘柄": change.stockId,
        "変動率(%)": branch.changePercent === undefined ? "" : String(branch.changePercent),
        "到達期限(分)": String(branch.deadlineMinutes ?? 5),
        "目標価格": branch.targetPrice === undefined ? "" : String(branch.targetPrice),
        "変動確率(%)": String(branch.probability ?? 100),
        "分岐名": branch.label || "",
        "分岐事後ニュースプリセット名": branch.postNewsPresetId ? newsPresetNameById[branch.postNewsPresetId] || "" : "",
        "分岐事後ニュース遅延秒数": branch.postNewsDelaySeconds === undefined || branch.postNewsDelaySeconds === null ? "" : String(branch.postNewsDelaySeconds),
      }));
    });
  });
}
