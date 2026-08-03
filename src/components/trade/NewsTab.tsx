import React from "react";
import Badge from "../ui/Badge";
import type { NewsItem, Stock } from "../../types/domain";

interface Props {
  news: NewsItem[];
  stocks: Stock[];
}

function NewsTab({ news, stocks }: Props) {
  return (
    <section className="animate-in fade-in duration-300">
      <h2 className="text-xs text-slate-400 font-black mb-4 uppercase tracking-widest">Latest News</h2>
      {news.length === 0 ? <p className="text-slate-400 text-sm text-center mt-8 font-bold">まだニュースはありません</p> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {news.map(n => (
              <div key={n.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border-l-4 border-l-emerald-500 shadow-sm dark:border-y dark:border-r dark:border-slate-800">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] text-slate-400 font-mono font-bold">{n.timestamp?.toDate().toLocaleTimeString()}</p>
                </div>
                <p className="text-lg font-black mb-2 leading-snug text-slate-800 dark:text-white">{n.title}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                {n.stockId && <Badge variant="info" className="mt-4">対象銘柄: {stocks.find(s=>s.id===n.stockId)?.name || n.stockId}</Badge>}
              </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default React.memo(NewsTab);
