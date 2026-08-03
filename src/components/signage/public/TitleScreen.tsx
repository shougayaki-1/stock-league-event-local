import { TrendingUp } from "lucide-react";

/** Opening card for the public signage playlist. Kept data-independent so it is
 * usable before the market feed has finished loading. */
export default function TitleScreen() {
  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-[#07142d] text-white">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(96,165,250,.2)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,.2)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute -left-[12%] top-[12%] h-[42vw] w-[42vw] rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="absolute -bottom-[18%] -right-[8%] h-[48vw] w-[48vw] rounded-full bg-blue-600/30 blur-3xl" />

      <div className="absolute inset-x-0 bottom-[16%] h-[28%] opacity-50">
        <svg viewBox="0 0 1920 360" preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
          <path d="M0 300 L120 265 L240 290 L355 205 L480 245 L600 165 L720 220 L850 125 L970 175 L1090 85 L1210 150 L1340 95 L1470 130 L1600 45 L1730 105 L1920 15" fill="none" stroke="#38bdf8" strokeWidth="7" vectorEffect="non-scaling-stroke" />
          <path d="M0 300 L120 265 L240 290 L355 205 L480 245 L600 165 L720 220 L850 125 L970 175 L1090 85 L1210 150 L1340 95 L1470 130 L1600 45 L1730 105 L1920 15 L1920 360 L0 360 Z" fill="url(#chartGlow)" />
          <defs><linearGradient id="chartGlow" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#38bdf8" stopOpacity=".26" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient></defs>
        </svg>
      </div>

      <div className="relative z-10 flex h-full flex-col items-center justify-center px-10 text-center">
        <div className="mb-7 flex items-center gap-3 rounded-full border border-cyan-200/40 bg-cyan-300/10 px-6 py-2 text-lg font-black tracking-[0.28em] text-cyan-100 shadow-[0_0_40px_rgba(56,189,248,.22)]">
          <TrendingUp size={25} strokeWidth={3} />
          STOCK MARKET GAME
        </div>
        <p className="mb-2 text-xl font-bold tracking-[0.5em] text-blue-200 md:text-3xl">KAISEI PRESENTS</p>
        <h1 className="text-[clamp(4rem,12vw,13rem)] font-black leading-[.9] tracking-[-.08em] text-white [text-shadow:0_0_55px_rgba(96,165,250,.55)]">
          株価にドキリ！
        </h1>
        <div className="mt-9 h-1 w-48 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
        <p className="mt-7 text-2xl font-bold tracking-[0.16em] text-slate-100 md:text-4xl">知力と情報で、市場を動かせ。</p>
      </div>

      <div className="absolute bottom-8 left-10 right-10 flex items-center justify-between border-t border-white/20 pt-5 text-sm font-bold tracking-[0.2em] text-blue-100/80 md:text-lg">
        <span>MARKET OPENING</span>
        <span>KAISEI STOCK LEAGUE</span>
      </div>
    </section>
  );
}
