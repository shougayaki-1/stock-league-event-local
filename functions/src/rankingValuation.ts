import { toExactBigInt } from "./exact";

/** 現金と保有銘柄の現在価値を合算し、ランキング用の総資産を計算する。 */
export const calculateTotalAssets = (
  points: unknown,
  inventory: Record<string, unknown> | undefined,
  pricesByStockId: Map<string, unknown>
) => {
  let total = toExactBigInt(points);
  for (const [stockId, amount] of Object.entries(inventory || {})) {
    const price = pricesByStockId.get(stockId);
    if (price !== undefined) total += toExactBigInt(amount) * toExactBigInt(price);
  }
  return total.toString();
};
