import { Clock, Newspaper, SearchCheck } from "lucide-react";
import type { ReactNode } from "react";
import { getLatestNewsByKind } from "../../../lib/news";
import type { NewsItem } from "../../../types/domain";

function NewsPane({
  title,
  accentClass,
  icon,
  item,
}: {
  title: string;
  accentClass: string;
  icon: ReactNode;
  item: NewsItem | null;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border-4 bg-white p-8 shadow-sm dark:bg-slate-900 ${accentClass}`}>
      <div className="mb-6 flex shrink-0 items-center justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-4">
          {icon}
          <h2 className="text-5xl font-black text-slate-950 dark:text-white">{title}</h2>
        </div>
        <span className="font-mono text-3xl font-black text-slate-400">
          {item?.timestamp?.toDate().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--:--"}
        </span>
      </div>

      {item ? (
        <article className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="mb-6 flex items-center gap-3 font-mono text-2xl font-black text-slate-400">
            <Clock size={28} />
            <span>{item.timestamp?.toDate().toLocaleString("ja-JP") ?? "配信時刻不明"}</span>
          </div>
          <h3 className="text-balance text-6xl font-black leading-tight text-slate-950 dark:text-white">
            {item.title}
          </h3>
          <p className="mt-8 whitespace-pre-wrap text-4xl font-bold leading-normal text-slate-700 dark:text-slate-200">
            {item.body || "本文はありません。"}
          </p>
        </article>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-5xl font-black text-slate-300 dark:text-slate-700">
          ニュース待機中
        </div>
      )}
    </section>
  );
}

export default function DualNewsBoard({ news }: { news: NewsItem[] }) {
  const publicNews = getLatestNewsByKind(news, "PUBLIC");
  const postNews = getLatestNewsByKind(news, "POST");

  return (
    <div className={`grid h-full min-h-0 gap-5 overflow-hidden ${postNews ? "grid-cols-2" : "grid-cols-1"}`}>
      <NewsPane
        title="ニュース"
        accentClass="border-emerald-500"
        icon={<Newspaper size={58} className="text-emerald-600 dark:text-emerald-400" />}
        item={publicNews}
      />
      {postNews && (
        <NewsPane
          title="続報"
          accentClass="border-rose-500"
          icon={<SearchCheck size={58} className="text-rose-600 dark:text-rose-400" />}
          item={postNews}
        />
      )}
    </div>
  );
}
