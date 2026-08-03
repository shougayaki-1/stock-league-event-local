import { useState, useEffect } from "react";
import { formatExact, toDisplayNumber, type ExactNumberInput } from "../../lib/exactNumber";

interface Props {
  value: ExactNumberInput;
  duration?: number;
}

export default function CountUp({ value, duration = 1000 }: Props) {
  const safeValue = toDisplayNumber(value);
  const canAnimate = formatExact(value) === safeValue.toLocaleString();
  const [displayValue, setDisplayValue] = useState(safeValue);

  useEffect(() => {
    if (!canAnimate) {
      return;
    }
    let startTimestamp: number | null = null;
    const startValue = displayValue;
    const endValue = safeValue;

    if (startValue === endValue) return;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // イージング (easeOutQuart) で徐々に遅くする
      const easeProgress = 1 - Math.pow(1 - progress, 4);
      
      setDisplayValue(Math.floor(startValue + (endValue - startValue) * easeProgress));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    const frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [canAnimate, displayValue, safeValue, duration]);

  return <>{canAnimate ? displayValue.toLocaleString() : formatExact(value)}</>;
}
