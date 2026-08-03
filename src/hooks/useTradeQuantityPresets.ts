import { useMemo } from "react";
import { useSystemSettings } from "./useFirebase";
import { normalizeTradeQuantityPresets } from "../lib/appConstants";

export function useTradeQuantityPresets() {
  const settings = useSystemSettings();
  return useMemo(() => normalizeTradeQuantityPresets(settings?.tradeQuantityPresets), [settings?.tradeQuantityPresets]);
}
