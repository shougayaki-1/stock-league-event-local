export const UNSCHEDULED_SESSION_ID = "__unscheduled__";

export const DEFAULT_TRADE_QUANTITY_PRESETS = ["1", "5", "10", "50"] as const;

/** Shared quantity choices used by every trade surface. */
export function normalizeTradeQuantityPresets(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_TRADE_QUANTITY_PRESETS];

  const presets = value
    .map((item) => typeof item === "string" || typeof item === "number" ? String(item).trim() : "")
    .filter((item) => /^\d+$/.test(item) && BigInt(item) > 0n)
    .map((item) => BigInt(item).toString())
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 8);

  return presets.length > 0 ? presets : [...DEFAULT_TRADE_QUANTITY_PRESETS];
}

export const PUBLIC_SIGNAGE_CACHE = {
  dbName: "insider_signage_db",
  storeName: "cloud_videos",
  imageStoreName: "cloud_images",
} as const;

export const PLAYLIST_TIMING = {
  defaultDurationSeconds: 30,
  minDurationSeconds: 5,
  emergencyOverlayDurationMs: 5000,
  breakingSignalValidMs: 10000,
  videoErrorSkipGraceMs: 5000,
} as const;
