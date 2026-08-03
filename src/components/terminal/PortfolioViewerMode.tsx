import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Camera, CircleDollarSign, Home, IdCard, QrCode, RefreshCw, ScanLine, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import QRScanner from "../admin/QRScanner";
import Button from "../ui/Button";
import { useStocks, useTransactions } from "../../hooks/useFirebase";
import { formatExact, isPositiveExact, toExactString } from "../../lib/exactNumber";
import { lookupUserByShortId } from "../../lib/terminalUtils";
import { extractShortIdFromQr } from "../../lib/utils";
import type { Stock, Transaction, User } from "../../types/domain";

interface Props {
  clearTimer: number;
  onReturnPortal: () => void;
}

type HoldingInsight = {
  stock: Stock;
  amount: string;
  value: bigint;
  averagePrice: number | null;
  difference: number | null;
  differencePercent: number | null;
};

export default function PortfolioViewerMode({ clearTimer, onReturnPortal }: Props) {
  const stocks = useStocks();
  const [manualId, setManualId] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(clearTimer);
  const acceptingScanRef = useRef(true);
  const transactions = useTransactions(user?.uid ?? null);

  const selectUser = useCallback(async (shortId: string) => {
    if (!acceptingScanRef.current || !shortId) return;
    acceptingScanRef.current = false;
    setIsLookingUp(true);
    setError("");
    try {
      const found = await lookupUserByShortId(shortId);
      if (!found) {
        acceptingScanRef.current = true;
        setError("IDが見つかりません。カードまたは入力内容を確認してください。");
        return;
      }
      setUser(found);
      setSecondsRemaining(clearTimer);
    } catch {
      acceptingScanRef.current = true;
      setError("情報を取得できませんでした。もう一度お試しください。");
    } finally {
      setIsLookingUp(false);
    }
  }, [clearTimer]);

  const reset = useCallback(() => {
    acceptingScanRef.current = true;
    setUser(null);
    setManualId("");
    setError("");
    setSecondsRemaining(clearTimer);
  }, [clearTimer]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          reset();
          return clearTimer;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clearTimer, reset, user]);

  const insights = useMemo(() => buildHoldingInsights(user, stocks, transactions), [stocks, transactions, user]);
  const holdingsValue = insights.reduce((sum, insight) => sum + insight.value, 0n);
  const totalAssets = user ? BigInt(toExactString(user.points)) + holdingsValue : 0n;

  const submitId = (event: FormEvent) => {
    event.preventDefault();
    const shortId = manualId.trim();
    if (!shortId) return;
    setManualId("");
    void selectUser(shortId);
  };

  return (
    <div className="min-h-dvh bg-[#f5f7fb] px-4 py-5 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-8 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><div className="rounded-2xl bg-indigo-600 p-3 text-white shadow-lg shadow-indigo-600/25"><WalletCards size={27} /></div><div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">ポートフォリオビューワー</h1><p className="text-xs font-bold text-slate-500">保有株・評価額・売買の目安を確認</p></div></div>
          <Button variant="outline" onClick={onReturnPortal}><Home size={16} className="mr-1" /> 戻る</Button>
        </header>

        {!user ? (
          <section className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
              <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 p-7 text-white sm:p-10"><div className="mb-10 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-black tracking-wider"><ScanLine size={15} className="mr-1.5" /> VIEW ONLY</div><h2 className="text-3xl font-black leading-tight sm:text-4xl">自分の資産を、<br />ひと目で確認。</h2><p className="mt-5 max-w-sm text-sm font-bold leading-relaxed text-blue-50">IDカードのQRをかざすか、エージェントIDを入力してください。取引は行われません。</p><div className="mt-10 grid grid-cols-3 gap-2 text-center text-xs font-black"><div className="rounded-2xl bg-white/15 p-3">保有株</div><div className="rounded-2xl bg-white/15 p-3">現在価格</div><div className="rounded-2xl bg-white/15 p-3">売買目安</div></div></div>
              <div className="p-6 sm:p-9"><div className="mb-5"><h3 className="flex items-center gap-2 text-lg font-black"><QrCode className="text-indigo-600" /> QRコードで読み取り</h3><p className="mt-1 text-xs font-bold text-slate-500">カードを枠内に1枚だけ入れてください</p></div><div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"><QRScanner cameraMode="rear-locked" onScan={(value) => { const shortId = extractShortIdFromQr(value); if (shortId) void selectUser(shortId); }} /></div><div className="my-6 flex items-center gap-3 text-xs font-black text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">または</div><form onSubmit={submitId} className="flex gap-2"><input value={manualId} onChange={(event) => setManualId(event.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 16))} inputMode="text" autoComplete="off" placeholder="エージェントID（例: 0001）" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-center font-mono text-base font-black outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-indigo-950" /><Button type="submit" isLoading={isLookingUp}><IdCard size={17} className="mr-1" /> 照会</Button></form>{error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600 dark:bg-rose-950/40">{error}</p>}</div>
            </div>
          </section>
        ) : (
          <div className="space-y-5">
            <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-xs font-black tracking-[0.2em] text-indigo-200">AGENT PORTFOLIO</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{user.nickname} <span className="text-base font-bold text-slate-400">#{user.shortId}</span></h2></div><div className="flex items-end gap-6"><div><p className="text-xs font-black text-slate-400">総資産</p><p className="mt-1 font-mono text-3xl font-black text-cyan-300 sm:text-4xl">{formatExact(totalAssets)}<span className="ml-1 text-base">pt</span></p></div><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={reset}><RefreshCw size={16} className="mr-1" /> 次の人</Button></div></div></section>
            <section className="grid gap-3 sm:grid-cols-3"><StatCard icon={<CircleDollarSign />} label="現金（ポイント）" value={`${formatExact(user.points)} pt`} tone="indigo" /><StatCard icon={<TrendingUp />} label="保有株の評価額" value={`${formatExact(holdingsValue)} pt`} tone="emerald" /><StatCard icon={<Camera />} label="保有銘柄数" value={`${insights.length} 銘柄`} tone="amber" /></section>
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"><div className="mb-5 flex items-end justify-between gap-4"><div><h3 className="text-xl font-black">保有銘柄</h3><p className="mt-1 text-xs font-bold text-slate-500">現在価格と購入時平均を比べた、目安です。最終判断は自分で行いましょう。</p></div><p className="hidden text-right text-xs font-black text-slate-400 sm:block">自動消去まで {secondsRemaining}秒</p></div>{insights.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-14 text-center dark:border-slate-700 dark:bg-slate-950"><WalletCards className="mx-auto text-slate-300" size={38} /><p className="mt-3 font-black text-slate-400">保有している株はありません</p></div> : <div className="grid gap-3 lg:grid-cols-2">{insights.map((insight) => <HoldingCard key={insight.stock.id} insight={insight} />)}</div>}<div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-indigo-500 transition-all duration-1000" style={{ width: `${(secondsRemaining / clearTimer) * 100}%` }} /></div><p className="mt-2 text-center text-xs font-bold text-slate-400 sm:hidden">自動消去まで {secondsRemaining}秒</p></section>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "indigo" | "emerald" | "amber" }) {
  const styles = { indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40", emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40", amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className={`mb-4 inline-flex rounded-xl p-2 ${styles[tone]}`}>{icon}</div><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-1 font-mono text-2xl font-black">{value}</p></div>;
}

function HoldingCard({ insight }: { insight: HoldingInsight }) {
  const isProfit = insight.difference !== null && insight.difference >= 0;
  const recommendation = insight.difference === null ? "取得価格を確認中" : isProfit ? "利益が出ています。売却を検討" : "購入時より低値。様子見を検討";
  return <article className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700"><div className="flex items-start justify-between gap-3"><div><h4 className="text-lg font-black">{insight.stock.name}</h4><p className="mt-1 text-sm font-black text-slate-500">{formatExact(insight.amount)} <span className="text-xs">株</span> <span className="mx-1 text-slate-300">×</span> {insight.stock.currentPrice} pt</p></div><div className={`rounded-xl px-3 py-2 text-right ${isProfit ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"}`}>{isProfit ? <TrendingUp size={18} className="ml-auto" /> : <TrendingDown size={18} className="ml-auto" />}<p className="mt-1 text-xs font-black">{recommendation}</p></div></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center text-xs dark:border-slate-800"><div><p className="font-bold text-slate-400">評価額</p><p className="mt-1 font-mono text-sm font-black">{formatExact(insight.value)}pt</p></div><div><p className="font-bold text-slate-400">購入時平均</p><p className="mt-1 font-mono text-sm font-black">{insight.averagePrice === null ? "−" : `${insight.averagePrice}pt`}</p></div><div><p className="font-bold text-slate-400">損益目安</p><p className={`mt-1 font-mono text-sm font-black ${isProfit ? "text-rose-600" : "text-blue-600"}`}>{insight.difference === null ? "−" : <>{isProfit ? <ArrowUpRight size={14} className="inline" /> : <ArrowDownRight size={14} className="inline" />}{isProfit ? "+" : ""}{insight.difference}pt</>}{insight.differencePercent !== null && <span className="ml-1 text-[10px]">({isProfit ? "+" : ""}{insight.differencePercent}%)</span>}</p></div></div></article>;
}

function buildHoldingInsights(user: User | null, stocks: Stock[], transactions: Transaction[]): HoldingInsight[] {
  if (!user) return [];
  return Object.entries(user.inventory || {}).flatMap(([stockId, amount]) => {
    const stock = stocks.find((item) => item.id === stockId);
    if (!stock || !isPositiveExact(amount)) return [];
    const purchases = transactions.filter((transaction) => transaction.stockId === stockId && transaction.type === "BUY" && !transaction.isUndone);
    const totals = purchases.reduce((sum, transaction) => ({ amount: sum.amount + BigInt(toExactString(transaction.amount)), points: sum.points + BigInt(Math.round(transaction.price)) * BigInt(toExactString(transaction.amount)) }), { amount: 0n, points: 0n });
    const averagePrice = totals.amount > 0n ? Number(totals.points / totals.amount) : null;
    const difference = averagePrice === null ? null : stock.currentPrice - averagePrice;
    return [{ stock, amount: toExactString(amount), value: BigInt(toExactString(amount)) * BigInt(Math.round(stock.currentPrice)), averagePrice, difference, differencePercent: averagePrice && difference !== null ? Math.round((difference / averagePrice) * 100) : null }];
  });
}
