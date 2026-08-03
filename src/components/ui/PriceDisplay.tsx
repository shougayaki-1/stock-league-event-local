import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Props {
  price: number;
  flashState?: "UP" | "DOWN" | null;
  className?: string;
  iconSize?: number;
}

export default function PriceDisplay({ price, flashState, className = "", iconSize = 24 }: Props) {
  const colorClass = flashState === "UP"
    ? "text-red-500"
    : flashState === "DOWN"
      ? "text-blue-500"
      : "text-slate-950 dark:text-white";
  
  return (
    <span className={`font-mono font-black flex items-center justify-end gap-1 transition-colors duration-300 ${colorClass} ${className}`}>
      {flashState === "UP" && <ArrowUpRight size={iconSize} className="animate-bounce text-red-500" />}
      {flashState === "DOWN" && <ArrowDownRight size={iconSize} className="animate-bounce text-blue-500" />}
      {price.toLocaleString()}
    </span>
  );
}
