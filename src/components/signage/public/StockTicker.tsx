import type { Stock } from "../../../types/domain";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

interface Props {
  stocks: Stock[];
  emergencyConfig: { type: "UP" | "DOWN"; message: string } | null;
}

export default function StockTicker({ stocks, emergencyConfig }: Props) {
  const isUp = emergencyConfig?.type === "UP";
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [repeatCount, setRepeatCount] = useState(2);
  const [marqueeDistance, setMarqueeDistance] = useState(0);
  const tickerItems = useMemo(() => Array.from({ length: repeatCount }, (_, groupIndex) => (
    stocks.map(stock => ({ ...stock, tickerKey: `${groupIndex}-${stock.id}` }))
  )).flat(), [repeatCount, stocks]);

  useEffect(() => {
    const updateRepeatCount = () => {
      const containerWidth = containerRef.current?.offsetWidth || 0;
      const contentWidth = contentRef.current?.scrollWidth || 0;
      if (!containerWidth || !contentWidth) return;
      const singleSetWidth = contentWidth / repeatCount;
      if (!singleSetWidth) return;
      setMarqueeDistance(singleSetWidth);
      setRepeatCount(Math.max(2, Math.ceil((containerWidth * 2) / singleSetWidth) + 1));
    };

    updateRepeatCount();
    const observer = new ResizeObserver(updateRepeatCount);
    if (containerRef.current) observer.observe(containerRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [repeatCount, stocks]);
  
  return (
    <div ref={containerRef} className={`z-20 flex h-14 shrink-0 items-center overflow-hidden whitespace-nowrap border-t transition-colors ${emergencyConfig ? (isUp ? "border-emerald-500 bg-emerald-600" : "border-red-500 bg-red-600") : "border-slate-800 bg-slate-950"}`}>
      <div
        ref={contentRef}
        className="animate-marquee"
        style={{ "--marquee-distance": `${marqueeDistance}px` } as CSSProperties}
      >
        {tickerItems.map(s => (
          <span key={s.tickerKey} className="mx-7 text-xl font-black">
            <span className={`${emergencyConfig ? "text-white/85" : "text-slate-400"}`}>{s.name}</span>
            <span className="ml-3 font-mono text-2xl text-white">{s.currentPrice}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
