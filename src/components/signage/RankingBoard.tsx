import type { User } from "../../types/domain";
import { formatExact } from "../../lib/exactNumber";

interface RankingBoardProps {
  ranking: User[];
}

export default function RankingBoard({ ranking }: RankingBoardProps) {
  return (
    <section className="flex-1 bg-gray-900 rounded-2xl border border-gray-800 p-6 flex flex-col shadow-xl overflow-hidden h-full">
      <h2 className="text-2xl font-bold mb-6 text-yellow-500 tracking-widest">🏆 TOP AGENTS</h2>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {ranking.slice(0, 10).map((u, i) => (
          <div key={u.uid} className="flex justify-between items-center p-4 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700/50 transition-colors">
            <div className="flex items-center gap-4">
              <span className={`text-3xl font-black ${i === 0 ? 'text-yellow-500 drop-shadow-md' : i === 1 ? 'text-gray-300 drop-shadow-sm' : i === 2 ? 'text-orange-400 drop-shadow-sm' : 'text-gray-500'}`}>{i + 1}</span>
              <span className="text-xl font-bold text-gray-200">{u.nickname}</span>
            </div>
            <span className="text-2xl font-mono font-bold text-red-400">{formatExact(u.totalAssets ?? u.points)} pt</span>
          </div>
        ))}
      </div>
    </section>
  );
}
