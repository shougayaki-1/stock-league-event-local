import { useCallback, useState } from "react";
import { DEFAULT_STOCK_PHASES } from "../lib/stockPhaseCsv";
import type { StockPriceDirection, StockPricePhase } from "../lib/marketPricing";

export type PhaseConfigs = Record<string, { phases: StockPricePhase[] }>;
export type PhaseDrafts = Record<string, StockPricePhase[]>;

const fallbackPhases = (stockId: string, drafts: PhaseDrafts, configs: PhaseConfigs) =>
  drafts[stockId] || configs[stockId]?.phases || DEFAULT_STOCK_PHASES;

export const phaseDraftChanged = (
  stockId: string,
  drafts: PhaseDrafts,
  configs: PhaseConfigs
) => Boolean(drafts[stockId]) && JSON.stringify(drafts[stockId]) !== JSON.stringify(configs[stockId]?.phases || DEFAULT_STOCK_PHASES);

export const omitPhaseDrafts = (drafts: PhaseDrafts, stockIds: string[]) => Object.fromEntries(
  Object.entries(drafts).filter(([stockId]) => !stockIds.includes(stockId))
) as PhaseDrafts;

export function useStockPhaseDrafts(initialConfigs: PhaseConfigs = {}) {
  const [phaseConfigs, setPhaseConfigs] = useState<PhaseConfigs>(initialConfigs);
  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDrafts>({});
  const [expandedPhaseStockId, setExpandedPhaseStockId] = useState<string | null>(null);

  const getPhaseDraft = useCallback(
    (stockId: string) => fallbackPhases(stockId, phaseDrafts, phaseConfigs),
    [phaseConfigs, phaseDrafts]
  );

  const openPhaseEditor = useCallback((stockId: string) => {
    setExpandedPhaseStockId(prev => prev === stockId ? null : stockId);
    setPhaseDrafts(prev => prev[stockId] ? prev : {
      ...prev,
      [stockId]: phaseConfigs[stockId]?.phases?.length ? phaseConfigs[stockId].phases : DEFAULT_STOCK_PHASES,
    });
  }, [phaseConfigs]);

  const addPhase = useCallback((stockId: string) => {
    setPhaseDrafts(prev => ({
      ...prev,
      [stockId]: [
        ...fallbackPhases(stockId, prev, phaseConfigs),
        {
          id: `phase-${Date.now()}`,
          startMinute: 0,
          endMinute: 60,
          direction: "FLAT",
          changePercent: 0,
        },
      ],
    }));
  }, [phaseConfigs]);

  const updatePhase = useCallback((stockId: string, index: number, field: keyof StockPricePhase, value: string | number) => {
    setPhaseDrafts(prev => ({
      ...prev,
      [stockId]: fallbackPhases(stockId, prev, phaseConfigs).map((phase, phaseIndex) => {
        if (phaseIndex !== index) return phase;
        if (field === "direction") return { ...phase, direction: value as StockPriceDirection };
        if (field === "id") return { ...phase, id: String(value) };
        return { ...phase, [field]: Number(value) };
      }),
    }));
  }, [phaseConfigs]);

  const removePhase = useCallback((stockId: string, index: number) => {
    setPhaseDrafts(prev => {
      const next = fallbackPhases(stockId, prev, phaseConfigs).filter((_, phaseIndex) => phaseIndex !== index);
      return { ...prev, [stockId]: next.length > 0 ? next : DEFAULT_STOCK_PHASES };
    });
  }, [phaseConfigs]);

  const clearPhaseDrafts = useCallback(() => setPhaseDrafts({}), []);

  const removePhaseDrafts = useCallback((stockIds: string[]) => {
    setPhaseDrafts(prev => omitPhaseDrafts(prev, stockIds));
  }, []);

  return {
    phaseConfigs,
    setPhaseConfigs,
    phaseDrafts,
    setPhaseDrafts,
    expandedPhaseStockId,
    getPhaseDraft,
    openPhaseEditor,
    addPhase,
    updatePhase,
    removePhase,
    clearPhaseDrafts,
    removePhaseDrafts,
  };
}
