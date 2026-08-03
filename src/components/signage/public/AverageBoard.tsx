import type { Stock, ChartData } from "../../../types/domain";

export default function AverageBoard({ stocks, chartData }: { stocks: Stock[], chartData: ChartData[] }) {
  if (stocks.length === 0 || chartData.length === 0) {
    return <div className="h-full w-full bg-[#2563eb] flex items-center justify-center text-white text-3xl font-bold animate-pulse">データを取得中...</div>;
  }

  const currentTotal = stocks.reduce((acc, s) => acc + s.currentPrice, 0);
  const currentAvg = currentTotal / stocks.length;

  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : chartData[chartData.length - 1];
  const prevAvg = stocks.reduce((acc, s) => acc + (Number(prevData[s.name]) || s.currentPrice), 0) / stocks.length;
  
  const diff = currentAvg - prevAvg;
  const isUp = diff >= 0;

  const firstData = chartData[0];
  const openAvg = stocks.reduce((acc, s) => acc + (Number(firstData[s.name]) || s.currentPrice), 0) / stocks.length;

  let highAvg = currentAvg;
  let lowAvg = currentAvg;
  chartData.forEach(data => {
    const avg = stocks.reduce((acc, s) => acc + (Number(data[s.name]) || 0), 0) / stocks.length;
    if (avg > highAvg) highAvg = avg;
    if (avg < lowAvg) lowAvg = avg;
  });

  const formatNum = (num: number) => num.toFixed(2);

  const MAIN_BG = "#2563eb"; 
  const ROW_BORDER = "#1d4ed8";
  const LABEL_W = "w-[35%]";
  const bgClass = isUp ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div className="flex-1 w-full flex flex-col p-4 md:p-8 font-sans select-none overflow-hidden" style={{ backgroundColor: MAIN_BG }}>
      
      <div className="flex items-end gap-6 mb-6 text-white border-b-2 pb-2 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.4)' }}>
        <h1 className="text-5xl md:text-7xl font-bold tracking-widest leading-none">イベント平均株価</h1>
        <span className="text-2xl md:text-4xl font-bold tracking-widest mb-1 opacity-90 leading-none pb-1">Stock {stocks.length}</span>
      </div>

      <div className="flex-1 flex flex-col gap-2 rounded-xl overflow-hidden p-2" style={{ border: `2px solid ${ROW_BORDER}` }}>
        
        <div className="flex flex-row items-stretch flex-[2.5]">
          <div className={`${LABEL_W} flex flex-col justify-center px-4 md:px-8 border-r-2`} style={{ borderColor: ROW_BORDER }}>
            <h2 className="text-4xl md:text-[5rem] font-bold text-white tracking-widest leading-none drop-shadow">現在値</h2>
            <span className="text-xl md:text-3xl text-white font-bold leading-none mt-2 drop-shadow">Current</span>
          </div>
          <div className="flex-1 bg-white text-[#2563eb] rounded-lg mx-2 flex items-center justify-end px-4 md:px-8 shadow-inner border" style={{ borderColor: ROW_BORDER }}>
            <span className="text-6xl md:text-[9rem] font-bold leading-none tracking-tight">
              {formatNum(currentAvg)}
            </span>
          </div>
        </div>

        <div className="flex flex-row items-stretch flex-[1.5]">
          <div className={`${LABEL_W} flex items-center gap-4 px-4 md:px-8 border-r-2`} style={{ borderColor: ROW_BORDER }}>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-widest drop-shadow">前回比</h2>
            <span className="text-lg md:text-2xl text-white font-bold drop-shadow">Change</span>
          </div>
          <div className={`flex-1 rounded-lg mx-2 flex items-center justify-end px-4 md:px-8 shadow-md border border-black/10 ${bgClass}`}>
            <span className="text-5xl md:text-[6rem] font-bold text-white leading-none tracking-tight">
              {isUp ? `+${formatNum(diff)}` : formatNum(diff)}
            </span>
          </div>
        </div>

        <div className="flex flex-row items-stretch flex-1">
          <div className={`${LABEL_W} flex items-center gap-4 px-4 md:px-8 border-r-2`} style={{ borderColor: ROW_BORDER }}>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-widest drop-shadow">始値</h2>
            <span className="text-lg md:text-2xl text-white font-bold drop-shadow">Open</span>
          </div>
          <div className="flex-1 mx-2 flex items-center justify-end px-4 md:px-8" style={{ backgroundColor: ROW_BORDER, borderRadius: '0.5rem' }}>
            <span className="text-4xl md:text-[5rem] font-bold text-white leading-none tracking-tight">{formatNum(openAvg)}</span>
          </div>
        </div>

        <div className="flex flex-row items-stretch flex-1">
          <div className={`${LABEL_W} flex items-center gap-4 px-4 md:px-8 border-r-2`} style={{ borderColor: ROW_BORDER }}>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-widest drop-shadow">高値</h2>
            <span className="text-lg md:text-2xl text-white font-bold drop-shadow">High</span>
          </div>
          <div className="flex-1 mx-2 flex items-center justify-end px-4 md:px-8" style={{ backgroundColor: ROW_BORDER, borderRadius: '0.5rem' }}>
            <span className="text-4xl md:text-[5rem] font-bold text-white leading-none tracking-tight">{formatNum(highAvg)}</span>
          </div>
        </div>

        <div className="flex flex-row items-stretch flex-1">
          <div className={`${LABEL_W} flex items-center gap-4 px-4 md:px-8 border-r-2`} style={{ borderColor: ROW_BORDER }}>
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-widest drop-shadow">安値</h2>
            <span className="text-lg md:text-2xl text-white font-bold drop-shadow">Low</span>
          </div>
          <div className="flex-1 mx-2 flex items-center justify-end px-4 md:px-8" style={{ backgroundColor: ROW_BORDER, borderRadius: '0.5rem' }}>
            <span className="text-4xl md:text-[5rem] font-bold text-white leading-none tracking-tight">{formatNum(lowAvg)}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
