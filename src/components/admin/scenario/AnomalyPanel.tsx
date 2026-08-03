import { CheckCircle2, Wand2 } from "lucide-react";
import type { Stock } from "../../../types/domain";
import { useMarketActions } from "../../../hooks/useMarketActions";
import type { PriceAnomaly, PriceAnomalyType } from "../../../lib/priceAnomalyDetection";
import type { ScenarioEvent } from "../../../types/scenario";
import { useDialog } from "../../../contexts/DialogContext";
import Badge from "../../ui/Badge";
import Button from "../../ui/Button";

interface AnomalyPanelProps {
  anomalies: PriceAnomaly[];
  events: ScenarioEvent[];
  stocks: Stock[];
}

const typeLabels: Record<PriceAnomalyType, string> = {
  CLAMP: "上下限",
  RAPID_CHANGE: "急変動",
  UNREACHABLE_TARGET: "到達不可",
  OVERLAP: "重複/近接",
};

const typeOrder: PriceAnomalyType[] = ["CLAMP", "RAPID_CHANGE", "UNREACHABLE_TARGET", "OVERLAP"];

export default function AnomalyPanel({ anomalies, events, stocks }: AnomalyPanelProps) {
  const { confirm } = useDialog();
  const { applyScenarioAnomalyFix, applyScenarioAnomalyFixes } = useMarketActions();
  const eventById = new Map(events.map((event) => [event.id, event]));
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 size={14} />
        異常は検出されていません
      </div>
    );
  }

  const handleApplyAll = async () => {
    const isOk = await confirm({
      title: "補正案を一括適用",
      message: `検出された補正案 ${anomalies.length} 件をイベントへ適用しますか？`,
      confirmText: "すべて適用",
      variant: "warning",
    });
    if (!isOk) return;
    await applyScenarioAnomalyFixes(events, anomalies.map((anomaly) => anomaly.suggestedFix));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {typeOrder.map((type) => {
            const count = anomalies.filter((anomaly) => anomaly.type === type).length;
            if (count === 0) return null;
            return (
              <Badge key={type} variant={type === "CLAMP" || type === "UNREACHABLE_TARGET" ? "danger" : "warning"}>
                {typeLabels[type]} {count}
              </Badge>
            );
          })}
        </div>
        <Button size="sm" variant="outline" onClick={handleApplyAll} className="min-h-11 px-3 text-[11px]">
          <Wand2 size={12} className="mr-1" />
          すべて適用
        </Button>
      </div>

      <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
        {anomalies.map((anomaly) => {
          const stockName = stockById.get(anomaly.stockId)?.name ?? anomaly.stockId;
          const event = eventById.get(anomaly.suggestedFix.eventId);
          return (
            <div key={anomaly.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={anomaly.severity === "danger" ? "danger" : "warning"}>{typeLabels[anomaly.type]}</Badge>
                <span className="font-black text-slate-700 dark:text-slate-200">{stockName}</span>
                <span className="text-[10px] text-slate-400">events: {anomaly.eventIds.join(", ")}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{anomaly.description}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{anomaly.suggestedFix.label}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => applyScenarioAnomalyFix(event, anomaly.suggestedFix)}
                  className="min-h-11 px-3 text-[11px]"
                >
                  この修正を適用
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
