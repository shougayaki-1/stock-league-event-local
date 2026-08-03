import Papa from "papaparse";
import type { Stock } from "../types/domain";
import type { PriceAnomaly } from "./priceAnomalyDetection";
import type { SimulationResult } from "./priceSimulation";

const anomalyTypeLabel: Record<PriceAnomaly["type"], string> = {
  CLAMP: "上下限クランプ",
  RAPID_CHANGE: "短時間急変動",
  UNREACHABLE_TARGET: "期限内到達不可",
  OVERLAP: "重複/近接",
};

export const buildSimulationCsv = (
  result: SimulationResult,
  stocks: Stock[],
  anomalies: PriceAnomaly[]
) => {
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const anomaliesByStock = anomalies.reduce<Record<string, PriceAnomaly[]>>((acc, anomaly) => {
    acc[anomaly.stockId] = [...(acc[anomaly.stockId] ?? []), anomaly];
    return acc;
  }, {});

  const rows = Object.entries(result.series).flatMap(([stockId, points]) => {
    const stock = stockById.get(stockId);
    const basePrice = stock?.basePrice && stock.basePrice > 0 ? stock.basePrice : stock?.currentPrice ?? 1;
    const stockAnomalies = anomaliesByStock[stockId] ?? [];
    return points.map((point) => ({
      "経過時間(分:秒)": point.time,
      "銘柄名": stock?.name ?? stockId,
      "シミュレート価格(中心値)": point.price,
      "下限(範囲)": point.min,
      "上限(範囲)": point.max,
      "基準価格に対する比率(%)": Math.round((point.price / Math.max(1, basePrice)) * 1000) / 10,
      "異常フラグ": stockAnomalies.length > 0 ? "あり" : "",
      "異常内容": stockAnomalies.map((anomaly) => `${anomalyTypeLabel[anomaly.type]}: ${anomaly.description}`).join(" / "),
    }));
  });

  return Papa.unparse(rows, {
    columns: [
      "経過時間(分:秒)",
      "銘柄名",
      "シミュレート価格(中心値)",
      "下限(範囲)",
      "上限(範囲)",
      "基準価格に対する比率(%)",
      "異常フラグ",
      "異常内容",
    ],
  });
};

export const downloadSimulationCsv = (
  result: SimulationResult,
  stocks: Stock[],
  anomalies: PriceAnomaly[]
) => {
  const csv = buildSimulationCsv(result, stocks, anomalies);
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "scenario_simulation_export.csv";
  link.click();
  URL.revokeObjectURL(link.href);
};
