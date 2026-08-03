import type { StockPriceDirection, StockPricePhase } from "./marketPricing";

export type StockPhaseCsvRow = {
  "銘柄ID"?: string;
  "フェーズID"?: string;
  "開始分"?: string;
  "終了分"?: string;
  "方向"?: string;
  "変動率(%)"?: string;
  stockId?: string;
  phaseId?: string;
  startMinute?: string;
  endMinute?: string;
  direction?: string;
  changePercent?: string;
};

export type StockPhasePreviewRow = {
  index: number;
  stockId: string;
  phaseId: string;
  startMinute: number | null;
  endMinute: number | null;
  direction: StockPriceDirection | null;
  changePercent: number | null;
  error?: string;
};

export const STOCK_PHASE_CSV_COLUMNS = ["銘柄ID", "フェーズID", "開始分", "終了分", "方向", "変動率(%)"];

export const DEFAULT_STOCK_PHASES: StockPricePhase[] = [
  { id: "default-flat", startMinute: 0, endMinute: 60, direction: "FLAT", changePercent: 0 }
];

export const DIRECTION_LABELS: Record<StockPriceDirection, string> = {
  UP: "上昇",
  DOWN: "下落",
  FLAT: "横ばい"
};

export const validateStockPhases = (phases: StockPricePhase[]) => {
  const invalidRange = phases.find((phase) =>
    !Number.isFinite(phase.startMinute) ||
    !Number.isFinite(phase.endMinute) ||
    phase.startMinute < 0 ||
    phase.endMinute > 60
  );
  if (invalidRange) return "価格フェーズは0〜60分の範囲で入力してください。";
  const invalidDownPhase = phases.find((phase) => phase.direction === "DOWN" && phase.changePercent >= 100);
  if (invalidDownPhase) return "下落フェーズの変動率は100%未満にしてください。";
  const invalidPercent = phases.find((phase) => !Number.isFinite(phase.changePercent) || phase.changePercent < 0);
  if (invalidPercent) return "価格フェーズの変動率は0以上で入力してください。";
  return null;
};

export const parseDirection = (value: string): StockPriceDirection | null => {
  const trimmed = value.trim();
  const normalized = trimmed.toUpperCase();
  if (normalized === "UP" || trimmed === "上昇") return "UP";
  if (normalized === "DOWN" || trimmed === "下落") return "DOWN";
  if (normalized === "FLAT" || trimmed === "横ばい") return "FLAT";
  return null;
};

export const parseFiniteNumber = (value: string | undefined) => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseStockPhaseCsvRows = (rows: StockPhaseCsvRow[]): StockPhasePreviewRow[] => rows.map((row, index) => {
  const rowNumber = index + 2;
  const stockId = (row["銘柄ID"] || row.stockId || "").trim();
  const phaseId = (row["フェーズID"] || row.phaseId || "").trim();
  const startMinute = parseFiniteNumber(row["開始分"] || row.startMinute);
  const endMinute = parseFiniteNumber(row["終了分"] || row.endMinute);
  const direction = parseDirection(row["方向"] || row.direction || "");
  const changePercent = parseFiniteNumber(row["変動率(%)"] || row.changePercent);
  const errors: string[] = [];

  if (!stockId) errors.push("銘柄IDが空です");
  if (startMinute === null || startMinute < 0 || startMinute > 60) errors.push("開始分は0から60");
  if (endMinute === null || endMinute < 0 || endMinute > 60) errors.push("終了分は0から60");
  if (!direction) errors.push("方向が不正");
  if (changePercent === null || changePercent < 0) errors.push("変動率は0以上");
  if (direction === "DOWN" && changePercent !== null && changePercent >= 100) errors.push("下落率は100%未満");

  return {
    index: rowNumber,
    stockId,
    phaseId: phaseId || `${stockId || "stock"}-csv-${index + 1}`,
    startMinute,
    endMinute,
    direction,
    changePercent,
    error: errors.length > 0 ? errors.join(" / ") : undefined
  };
});

export const groupStockPhasePreviewRows = (rows: StockPhasePreviewRow[]) =>
  rows.reduce<Record<string, StockPricePhase[]>>((acc, row) => {
    if (!row.stockId || row.startMinute === null || row.endMinute === null || !row.direction || row.changePercent === null) return acc;
    acc[row.stockId] = [
      ...(acc[row.stockId] || []),
      {
        id: row.phaseId,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        direction: row.direction,
        changePercent: row.changePercent
      }
    ];
    return acc;
  }, {});
