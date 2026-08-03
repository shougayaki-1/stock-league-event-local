import { Newspaper, TrendingUp, Search, ShoppingCart } from "lucide-react";

export default function StockPredictionTemplate() {
  return (
    <div className="relative h-[1080px] w-[1920px] overflow-hidden bg-[#0b1020] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(22,163,74,0.28),transparent_34%),radial-gradient(circle_at_84%_28%,rgba(59,130,246,0.24),transparent_30%),linear-gradient(135deg,#101827_0%,#111827_45%,#052e2b_100%)]" />
      <div className="absolute left-20 top-20 flex items-center gap-5 rounded-full border border-white/15 bg-white/10 px-8 py-4">
        <Newspaper size={44} className="text-emerald-300" />
        <p className="text-3xl font-black tracking-[0.18em] text-white/80">MARKET NEWS</p>
      </div>
      <main className="relative z-10 flex h-full flex-col justify-center px-24">
        <h1 className="max-w-[1320px] text-[126px] font-black leading-[1.05] tracking-normal">
          ニュースをチェック！
          <span className="mt-8 block text-emerald-300">株価の動きを予想して</span>
          あなたも株主になろう
        </h1>
        <div className="mt-20 grid w-[1200px] grid-cols-3 gap-7">
          {[
            { icon: <Search size={58} />, label: "ニュースを見る" },
            { icon: <TrendingUp size={58} />, label: "値動きを予想" },
            { icon: <ShoppingCart size={58} />, label: "株を買う" },
          ].map(step => (
            <div key={step.label} className="flex h-44 items-center gap-6 rounded-[8px] border border-white/15 bg-white/10 px-8">
              <div className="flex h-24 w-24 items-center justify-center rounded-[8px] bg-emerald-300 text-slate-950">
                {step.icon}
              </div>
              <p className="text-3xl font-black leading-tight">{step.label}</p>
            </div>
          ))}
        </div>
      </main>
      <div className="absolute bottom-20 right-20 rounded-[8px] bg-white px-10 py-6 text-4xl font-black text-slate-950">
        株価にドキリ！マーケット
      </div>
    </div>
  );
}
