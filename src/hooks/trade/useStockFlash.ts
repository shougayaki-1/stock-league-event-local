import { useEffect, useRef, useState } from "react";
import type { Stock } from "../../types/domain";

const FLASH_DURATION_MS = 5000;

export function useStockFlash(stocks: Stock[]) {
  const prevStocksRef = useRef<Record<string, number>>({});
  const timerRef = useRef<number | null>(null);
  const [flashState, setFlashState] = useState<Record<string, "UP" | "DOWN">>({});

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (stocks.length === 0) return;
    const newFlash: Record<string, "UP" | "DOWN"> = {};
    stocks.forEach(stock => {
      const prevPrice = prevStocksRef.current[stock.id];
      if (prevPrice !== undefined && prevPrice !== stock.currentPrice) {
        newFlash[stock.id] = stock.currentPrice > prevPrice ? "UP" : "DOWN";
      }
      prevStocksRef.current[stock.id] = stock.currentPrice;
    });
    if (Object.keys(newFlash).length > 0) {
      setFlashState(newFlash);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setFlashState({}), FLASH_DURATION_MS);
    }
  }, [stocks]);

  return flashState;
}
