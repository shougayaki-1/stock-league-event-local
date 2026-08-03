import React from "react";
import { BookOpenCheck, ShieldAlert } from "lucide-react";
import { useSystemSettings } from "../../hooks/useFirebase";
import { DEFAULT_INFO_PAGE_MARKDOWN, MarkdownContent } from "../info/infoPageContent";
import type { User } from "../../types/domain";

function InfoTab({ user }: { user: User }) {
  const systemSettings = useSystemSettings();
  const isInsider = user.courseType === "INSIDER";
  const infoPageMarkdown = systemSettings?.infoPageMarkdown?.trim() || DEFAULT_INFO_PAGE_MARKDOWN;

  return (
    <section className="mx-auto max-w-xl animate-in fade-in space-y-6 pt-4 duration-300">
      <div className={`rounded-3xl border p-6 shadow-sm ${isInsider ? "border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20" : "border-blue-200 bg-white dark:border-blue-900/60 dark:bg-slate-900"}`}>
        <div className="mb-6 flex items-start gap-3">
          <div className={`rounded-full p-3 ${isInsider ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400" : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"}`}>
            {isInsider ? <ShieldAlert size={28} /> : <BookOpenCheck size={28} />}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">株価にドキリ！</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800 dark:text-white">
              {isInsider ? "コンプライアンス違反を検知" : "この企画について"}
            </h2>
          </div>
        </div>

        {isInsider ? (
          <div className="space-y-5 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 md:text-base">
            <p>エージェント {user.nickname || "Unknown"} は、一般に公開されていない「機密情報」を悪用した形跡が認められました。</p>
            <p>今回のイベントでは、謎解きミッションをクリアしたあなたに、他の参加者にはまだ届いていない企業の未公開ニュースが特別に共有されていました。その情報をもとに株を売買していた場合、それは通常の取引とは異なる、著しく有利な立場からの取引だったことになります。</p>
            <p>現実の社会では、これを「インサイダー取引」と呼びます。会社の内部関係者だけが知りうる未公開の重要事実をもとに売買を行うことは、金融商品取引法で固く禁じられている重大な違法行為です。発覚した場合は、5年以下の懲役、もしくは500万円以下の罰金という厳しい罰則が科せられます。</p>
            <p>今回はゲーム上の設定として「インサイダー」という特別な役割を体験してもらいましたが、これはあくまで学校祭の演出です。現実の投資の世界でこうした行為に手を染めることは絶対にあってはなりません。</p>
            <p>謎を解き明かした観察力と行動力は、本物でした。その力を、これからはぜひ正々堂々とした形で活かしてください。ご参加ありがとうございました。</p>
          </div>
        ) : (
          <MarkdownContent markdown={infoPageMarkdown} className="space-y-5 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300 md:text-base" />
        )}
      </div>
    </section>
  );
}

export default React.memo(InfoTab);
