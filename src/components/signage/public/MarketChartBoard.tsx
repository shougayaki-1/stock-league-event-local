import type { Stock, ChartData } from "../../../types/domain";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Symbols } from "recharts";
import { Activity } from "lucide-react";
import { useTheme } from "../../../contexts/ThemeContext";

// カラーユニバーサルデザイン (Okabe–Ito) パレット。色覚多様性に配慮した8色。
// 8色目の黒は暗背景では見えないため、ダークモードでは明色に差し替える。
const getColors = (isDark: boolean) => [
  "#E69F00", "#56B4E9", "#009E73", "#F0E442",
  "#0072B2", "#D55E00", "#CC79A7", isDark ? "#E5E7EB" : "#111827",
];

// 系列ごとの記号（凡例とグラフ上の両方で使用）。recharts の legendType / Symbols type に対応。
const SYMBOLS = ["circle", "cross", "diamond", "square", "star", "triangle", "wye"] as const;

export default function MarketChartBoard({ stocks, chartData }: { stocks: Stock[], chartData: ChartData[] }) {
  const { theme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const axisColor = isDark ? "#94a3b8" : "#64748b";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipColor = isDark ? "#fff" : "#1e293b";
  const COLORS = getColors(isDark);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex shrink-0 items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Activity size={36} className="text-blue-600 dark:text-blue-300" />
          <h2 className="text-4xl font-black text-slate-900 dark:text-white">全体株価チャート</h2>
        </div>
        <span className="text-2xl font-black text-slate-400">{stocks.length}銘柄</span>
      </div>

      <div className="min-h-0 flex-1">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-3xl font-black text-slate-400">
            株価更新後にチャート履歴が表示されます
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 16, right: 36, left: 4, bottom: 12 }}>
              <CartesianGrid strokeDasharray="4 8" stroke={axisColor} opacity={0.38} vertical={false} />
              <XAxis dataKey="time" stroke={axisColor} fontSize={18} tickMargin={12} />
              <YAxis stroke={axisColor} fontSize={18} domain={['auto', 'auto']} tickMargin={12} width={88} />
              <Tooltip 
                contentStyle={{ backgroundColor: tooltipBg, borderRadius: "8px", border: "none", color: tooltipColor, fontSize: "20px", fontWeight: "bold", padding: "16px", boxShadow: "0 10px 24px rgb(15 23 42 / 0.12)" }}
                itemStyle={{ paddingBottom: "8px" }}
              />
              <Legend wrapperStyle={{ paddingTop: "24px", fontSize: "18px", fontWeight: "bold", color: tooltipColor }} iconSize={18} />
              {stocks.map((s, i) => {
                const color = COLORS[i % COLORS.length];
                const symbol = SYMBOLS[i % SYMBOLS.length];
                return (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.name}
                    stroke={color}
                    strokeWidth={7}
                    legendType={symbol}
                    dot={(props) => {
                      const { cx, cy, index, value } = props as { cx?: number; cy?: number; index: number; value?: number | null };
                      if (cx == null || cy == null || value == null) return <g key={`${s.id}-${index}`} />;
                      return <Symbols key={`${s.id}-${index}`} cx={cx} cy={cy} type={symbol} size={190} fill={color} stroke="#ffffff" strokeWidth={2} />;
                    }}
                    isAnimationActive={false}
                    connectNulls={true}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
