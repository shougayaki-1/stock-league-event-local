import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import type { ChartData, Stock } from "../../types/domain";

const COLORS = ["#dc2626", "#2563eb", "#059669", "#ca8a04", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];

interface Props {
  chartData: ChartData[];
  stocks: Stock[];
  showAxis?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  margin?: { top: number; right: number; bottom: number; left: number };
  strokeWidth?: number;
  hideTooltip?: boolean;
}

export default function StockLineChart({ 
  chartData, stocks, showAxis = false, showLegend = false, showGrid = false, 
  margin = { top: 5, right: 5, bottom: 0, left: -25 }, strokeWidth = 4, hideTooltip = false 
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  
  const axisColor = isDark ? "#94a3b8" : "#64748b";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipColor = isDark ? "#ffffff" : "#1e293b";

  if (chartData.length === 0) {
    return <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm font-bold">チャート履歴がまだありません</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={margin}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={axisColor} opacity={0.2} />}
        
        {showAxis ? (
          <>
            <XAxis dataKey="time" stroke={axisColor} fontSize={10} tickMargin={5} />
            <YAxis stroke={axisColor} fontSize={10} domain={['auto', 'auto']} />
          </>
        ) : (
          <>
            <XAxis dataKey="time" hide />
            <YAxis domain={['auto', 'auto']} hide />
          </>
        )}
        
        {!hideTooltip && (
          <Tooltip 
            contentStyle={{ backgroundColor: tooltipBg, borderRadius: "8px", border: "1px solid #cbd5e1", color: tooltipColor, fontSize: "12px", fontWeight: "bold" }} 
            itemStyle={{ paddingBottom: "4px" }}
          />
        )}
        
        {showLegend && <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "14px", fontWeight: "bold", color: tooltipColor }} />}
        
        {stocks.map((s, i) => (
          // ★修正: connectNulls={true} を追加
          <Line key={s.id} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={strokeWidth} dot={false} isAnimationActive={false} connectNulls={true} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
