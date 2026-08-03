import { Timestamp } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import CountdownTimer from "../components/CountdownTimer";
import { useSignagePage } from "../hooks/useSignagePage";
import RankingBoard from "../components/signage/RankingBoard";
import MissionControlPanel from "../components/signage/MissionControlPanel";

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7"];

export default function Signage() {
  const {
    signageId, state,
    stocks, ranking, chartData, news, currentTime,
    riddleStep, setRiddleStep, opFileUrl, edFileUrl, localTimerEnd,
    handleFileSelect, startLocalTimer
  } = useSignagePage();

  if (!signageId) return <div className="min-h-dvh bg-black text-white flex items-center justify-center"><h1>サイネージIDが指定されていません (?id=xxxx)</h1></div>;
  if (!state) return <div className="min-h-dvh bg-black flex items-center justify-center"><div className="text-purple-500 animate-pulse font-bold text-2xl">株価にドキリ！ネットワークに接続中...</div></div>;

  const isRiddleMode = state.mode === "RIDDLE";

  return (
    <div className="min-h-dvh bg-gray-950 text-white font-sans overflow-hidden flex flex-col">
      {!isRiddleMode && (
        <header className="bg-gray-900 border-b-4 border-blue-600 p-4 flex justify-between items-center shadow-2xl z-10">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 text-white font-bold px-4 py-1 rounded animate-pulse tracking-widest">LIVE</div>
            <h1 className="text-3xl font-bold tracking-widest text-gray-100">{state.name}</h1>
          </div>
          <div className="text-3xl font-mono font-bold tracking-widest text-gray-300">
            {currentTime.toLocaleTimeString()}
          </div>
        </header>
      )}

      <main className="flex-1 w-full h-full relative">
        
        {state.mode === "CORRIDOR_CHART" && (
          <div className="absolute inset-0 p-6 flex gap-6 animate-in fade-in duration-500 h-full">
            <section className="w-2/3 bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col shadow-xl">
              <h2 className="text-2xl font-bold mb-6 text-gray-400 tracking-widest">📊 MARKET TREND</h2>
              <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="time" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", color: "#fff" }} />
                    <Legend wrapperStyle={{ paddingTop: "20px" }} />
                    {stocks.map((s, i) => (
                      <Line key={s.id} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={4} dot={false} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <div className="w-1/3"><RankingBoard ranking={ranking} /></div>
          </div>
        )}

        {state.mode === "CORRIDOR_NEWS" && (
          <div className="absolute inset-0 p-6 flex gap-6 animate-in fade-in duration-500 h-full">
            <section className="w-2/3 bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col shadow-xl overflow-hidden">
              <h2 className="text-2xl font-bold mb-6 text-emerald-500 tracking-widest">📰 LATEST NEWS</h2>
              <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                {news.map(n => (
                  <div key={n.id} className="bg-gray-950 p-6 rounded-xl border-l-4 border-emerald-500">
                    <span className="text-emerald-500 font-mono text-sm">{n.timestamp?.toDate().toLocaleTimeString()}</span>
                    <h3 className="text-2xl font-bold text-white mt-1 mb-2">{n.title}</h3>
                    <p className="text-gray-400">{n.body}</p>
                  </div>
                ))}
              </div>
            </section>
            <div className="w-1/3"><RankingBoard ranking={ranking} /></div>
          </div>
        )}

        {state.mode === "ROOM_INFO" && (
          <div className="absolute inset-0 p-6 flex flex-col gap-6 animate-in fade-in duration-500 h-full">
            <div className="grid grid-cols-3 gap-6">
              {stocks.map((stock, index) => (
                <div key={stock.id} className="bg-gray-900 p-6 rounded-2xl border border-gray-700 shadow-xl">
                  <p className="text-lg font-bold" style={{ color: COLORS[index % COLORS.length] }}>{stock.name}</p>
                  <p className="text-6xl font-mono font-bold mt-2">{stock.currentPrice}</p>
                </div>
              ))}
            </div>
            <section className="flex-1 bg-gray-900 rounded-2xl border border-gray-800 p-6 shadow-xl overflow-hidden flex flex-col">
              <h2 className="text-xl font-bold mb-4 text-orange-500 tracking-widest">📰 BREAKING NEWS</h2>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {news.map(n => (
                  <div key={n.id} className="bg-gray-950 p-4 rounded-xl border-l-4 border-orange-500">
                    <span className="text-orange-500 font-mono text-sm mr-4">{n.timestamp?.toDate().toLocaleTimeString()}</span>
                    <span className="text-xl font-bold text-white">{n.title}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {state.mode === "ROOM_NEWS_VIDEO" && (
          <div className="absolute inset-0 p-12 flex justify-center animate-in fade-in duration-500 h-full">
            <div className="w-full max-w-4xl"><RankingBoard ranking={ranking} /></div>
          </div>
        )}

        {isRiddleMode && (
          <div className="absolute inset-0 bg-black flex flex-col items-center justify-center animate-in fade-in duration-500 group">
            
            <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-white/10 to-transparent opacity-50 transition-opacity z-40 pointer-events-none"></div>
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-white/40 font-bold uppercase tracking-widest transition-opacity z-40 pointer-events-none">MISSION CONTROL</div>

            <MissionControlPanel 
              riddleStep={riddleStep}
              setRiddleStep={setRiddleStep}
              opFileUrl={opFileUrl}
              edFileUrl={edFileUrl}
              handleFileSelect={handleFileSelect}
              startLocalTimer={startLocalTimer}
            />

            {riddleStep === "STANDBY" && <div className="text-slate-700 font-bold text-4xl tracking-[0.5em] animate-pulse">SYSTEM STANDBY</div>}
            {riddleStep === "OP" && opFileUrl && <video src={opFileUrl} autoPlay controls className="w-full h-full object-contain" />}
            {riddleStep === "TIMER" && localTimerEnd && <CountdownTimer endTime={Timestamp.fromDate(localTimerEnd)} />}
            {riddleStep === "ED" && edFileUrl && <video src={edFileUrl} autoPlay controls className="w-full h-full object-contain" />}
          </div>
        )}

      </main>
    </div>
  );
}
