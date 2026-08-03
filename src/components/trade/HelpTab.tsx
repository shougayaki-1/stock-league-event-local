import React from "react";
import { HelpCircle, ArrowUpRight, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import type { User } from "../../types/domain";

function HelpTab({ user }: { user: User }) {
  return (
    <section className="max-w-xl mx-auto space-y-8 animate-in fade-in duration-300 pt-4">
      <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2 mb-6">
        <HelpCircle className="text-blue-500" /> 遊び方ガイド
      </h3>

      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">💰 ゲームの目的</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            与えられた初期ポイントを使って株を売買し、<strong className="text-blue-600 dark:text-blue-400">資産を限界まで増やす</strong>ことがあなたの任務です。
            増やした資産に応じて、豪華な景品と交換することができます。
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-4">📉 株の買い方・売り方</h3>
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 relative pointer-events-none">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white leading-tight">サンプル物産</h3>
                <Badge variant="default" className="mt-1.5 font-mono">SAMPLE</Badge>
              </div>
              <p className="text-4xl font-mono font-black text-red-500 flex items-center gap-1"><ArrowUpRight size={24}/>147</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 text-red-600 border-red-200 bg-red-50/50 py-3"><TrendingUp size={16} className="mr-1" /> 買う</Button>
              <Button variant="outline" className="flex-1 text-blue-600 border-blue-200 bg-blue-50/50 py-3"><TrendingDown size={16} className="mr-1" /> 売る</Button>
            </div>
            <div className="absolute -bottom-6 left-12 transform rotate-[160deg] text-slate-400"><ArrowRight size={24}/></div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-6">
            <strong className="text-red-500">赤色（↑）</strong>の時は株価が上がっており、<strong className="text-blue-500">青色（↓）</strong>の時は株価が下がっています。
            <br/>安く買って、高く売るのが基本です。
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 dark:text-white mb-4">📰 ニュースを読んで予測する</h3>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-4 rounded-xl border-l-4 border-emerald-500 shadow-sm mb-4 pointer-events-none">
            <p className="text-[10px] text-slate-400 font-mono font-bold mb-2">12:34:56</p>
            <p className="text-lg font-black text-slate-800 dark:text-white mb-2">大ヒット商品の発表</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">サンプル物産が発表した新商品が話題沸騰中です。</p>
            <Badge variant="info" className="mt-4">対象銘柄: サンプル物産</Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            定期的に配信されるニュースは、今後の株価を予測する最大のヒントになります。
            <br/>Newsタブや、廊下のサイネージを常にチェックしましょう。
          </p>
        </div>

        {user.courseType === "INSIDER" && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-black text-rose-600 dark:text-rose-500 mb-2">🕵️ インサイダー情報とは？</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              あなたは「謎解きミッション」に参加しているため、一般には公開されていない<strong className="text-rose-600">「極秘情報」</strong>を手に入れることができます。
            </p>
            <div className="bg-rose-50 dark:bg-rose-950/20 p-4 rounded-xl border-l-4 border-rose-500 shadow-sm pointer-events-none">
              <div className="flex justify-between items-start mb-2">
                <p className="text-[10px] text-slate-400 font-mono font-bold">12:35:01</p>
                <Badge variant="danger" className="text-[8px]">極秘情報</Badge>
              </div>
              <p className="text-lg font-black text-rose-600 dark:text-rose-400 mb-2">データ偽装の発覚</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">先ほどの新商品はデータが偽装されていました。まもなく大暴落します。</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(HelpTab);
