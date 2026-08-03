import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, ChevronLeft, Home, RotateCcw, Store, UserRound } from "lucide-react";
import QRScanner from "../admin/QRScanner";
import Button from "../ui/Button";
import { useStocks } from "../../hooks/useFirebase";
import { useTradeQuantityPresets } from "../../hooks/useTradeQuantityPresets";
import { useWindowActions } from "../../hooks/useWindowActions";
import { isPositiveIntegerInput, toExactString } from "../../lib/exactNumber";
import { lookupUserByShortId } from "../../lib/terminalUtils";
import { extractShortIdFromQr } from "../../lib/utils";
import type { User } from "../../types/domain";

type OrderType = "BUY" | "SELL";
type Step = "ID" | "TYPE" | "STOCK" | "AMOUNT" | "CONFIRM" | "SUCCESS";

interface Props {
  onReturnPortal: () => void;
}

export default function BrokerCounterMode({ onReturnPortal }: Props) {
  const stocks = useStocks();
  const quantityPresets = useTradeQuantityPresets();
  const { executeTerminalTrade, isLoading } = useWindowActions();
  const [step, setStep] = useState<Step>("ID");
  const [manualId, setManualId] = useState("");
  const [idError, setIdError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [type, setType] = useState<OrderType | null>(null);
  const [stockId, setStockId] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [isMaxAmount, setIsMaxAmount] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const acceptingScanRef = useRef(true);

  useEffect(() => {
    acceptingScanRef.current = step === "ID";
  }, [step]);

  const selectUser = useCallback(async (shortId: string) => {
    if (!acceptingScanRef.current) return;
    acceptingScanRef.current = false;
    setIdError("");
    const found = await lookupUserByShortId(shortId);
    if (!found) {
      acceptingScanRef.current = true;
      setIdError("IDが見つかりません。もう一度確認してください。");
      return;
    }
    setUser(found);
    setStep("TYPE");
  }, []);

  const submitId = (event: FormEvent) => {
    event.preventDefault();
    const shortId = manualId.trim();
    if (!shortId) return;
    setManualId("");
    void selectUser(shortId);
  };

  const reset = () => {
    acceptingScanRef.current = true;
    setStep("ID");
    setUser(null);
    setType(null);
    setStockId(null);
    setAmount("1");
    setIsMaxAmount(false);
    setIdError("");
    setTradeError("");
  };

  const setPresetAmount = (value: string) => {
    setAmount(value);
    setIsMaxAmount(false);
  };

  const execute = async () => {
    if (!user || !type || !stockId || (!isMaxAmount && !isPositiveIntegerInput(amount))) return;
    setTradeError("");
    const result = await executeTerminalTrade(user.uid, stockId, type, isMaxAmount ? "1" : toExactString(amount), isMaxAmount);
    if (!result.success) {
      setTradeError(result.errorMsg || "取引に失敗しました。");
      return;
    }
    setStep("SUCCESS");
  };

  const selectedStock = stocks.find((stock) => stock.id === stockId);
  const stepIndex = ["ID", "TYPE", "STOCK", "AMOUNT", "CONFIRM"].indexOf(step);
  const back = () => {
    if (step === "TYPE") reset();
    if (step === "STOCK") setStep("TYPE");
    if (step === "AMOUNT") setStep("STOCK");
    if (step === "CONFIRM") setStep("AMOUNT");
  };

  return (
    <div className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white sm:p-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Store className="text-purple-600" size={30} /><div><h1 className="text-2xl font-black">証券窓口</h1><p className="text-xs font-bold text-slate-500">一項目ずつ入力して注文を確定します</p></div></div>
          <Button variant="outline" onClick={onReturnPortal}><Home size={16} className="mr-1" /> 戻る</Button>
        </header>

        {step !== "SUCCESS" && (
          <div className="mb-6 grid grid-cols-5 gap-1" aria-label="注文手順">
            {["ID", "売買", "銘柄", "数量", "確認"].map((label, index) => <div key={label} className={`rounded-full px-2 py-2 text-center text-xs font-black ${index <= stepIndex ? "bg-purple-600 text-white" : "bg-slate-200 text-slate-400 dark:bg-slate-800"}`}>{label}</div>)}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          {step === "ID" && <div className="space-y-5">
            <div><h2 className="text-xl font-black">1. エージェントID</h2><p className="mt-1 text-sm font-bold text-slate-500">QRを1枚だけ読み取るか、IDを入力してください。認証後にカメラは閉じます。</p></div>
            <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800"><QRScanner cameraMode="rear-locked" onScan={(value) => { const shortId = extractShortIdFromQr(value); if (shortId) void selectUser(shortId); }} /></div>
            <form onSubmit={submitId} className="mx-auto flex max-w-sm gap-2"><input value={manualId} onChange={(event) => setManualId(event.target.value.replace(/[^\dA-Za-z-]/g, "").slice(0, 16))} inputMode="numeric" autoComplete="off" placeholder="例: 0001" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-center font-mono text-xl font-black outline-none focus:border-purple-500 dark:bg-slate-950" /><Button type="submit">認証</Button></form>
            {idError && <p className="text-center text-sm font-bold text-red-500">{idError}</p>}
          </div>}

          {step === "TYPE" && <div className="space-y-5"><div><h2 className="text-xl font-black">2. 売買を選択</h2><p className="text-sm font-bold text-slate-500">{user?.nickname} さんの注文</p></div><div className="grid grid-cols-2 gap-4"><button onClick={() => { setType("BUY"); setStep("STOCK"); }} className="rounded-2xl bg-rose-600 px-5 py-10 text-3xl font-black text-white">買う</button><button onClick={() => { setType("SELL"); setStep("STOCK"); }} className="rounded-2xl bg-blue-600 px-5 py-10 text-3xl font-black text-white">売る</button></div></div>}

          {step === "STOCK" && <div className="space-y-5"><div><h2 className="text-xl font-black">3. 銘柄を選択</h2><p className="text-sm font-bold text-slate-500">{type === "BUY" ? "買い" : "売り"}注文</p></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{stocks.map((stock) => <button key={stock.id} onClick={() => { setStockId(stock.id); setStep("AMOUNT"); }} className="rounded-2xl border-2 border-slate-200 p-5 text-left transition hover:border-purple-500 dark:border-slate-700"><p className="text-lg font-black">{stock.name}</p><p className="mt-1 font-mono font-bold text-slate-500">{stock.currentPrice} pt</p></button>)}</div></div>}

          {step === "AMOUNT" && <div className="space-y-5"><div><h2 className="text-xl font-black">4. 数量を入力</h2><p className="text-sm font-bold text-slate-500">{selectedStock?.name} / {type === "BUY" ? "買い" : "売り"}</p></div><input value={amount} onChange={(event) => { setAmount(event.target.value); setIsMaxAmount(false); }} inputMode="numeric" pattern="[0-9]*" className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-5 text-center font-mono text-4xl font-black outline-none focus:border-purple-500 dark:bg-slate-950" /><div className="grid grid-cols-4 gap-2">{quantityPresets.map((preset) => <Button key={preset} variant="soft" className="py-4" onClick={() => setPresetAmount(preset)}>{preset}株</Button>)}</div><Button variant={isMaxAmount ? "primary" : "outline"} className="w-full py-4" onClick={() => { setIsMaxAmount(true); setAmount("1"); }}>{type === "BUY" ? "MAX（全額）" : "MAX（全株）"}</Button><Button className="w-full py-4" disabled={!isMaxAmount && !isPositiveIntegerInput(amount)} onClick={() => setStep("CONFIRM")}>確認へ</Button></div>}

          {step === "CONFIRM" && <div className="space-y-6 text-center"><h2 className="text-xl font-black">5. 注文を確認</h2><div className="rounded-2xl bg-slate-50 p-6 text-left dark:bg-slate-950"><p className="text-sm font-bold text-slate-500">エージェント</p><p className="text-2xl font-black">{user?.nickname}</p><p className="mt-4 text-sm font-bold text-slate-500">注文内容</p><p className="text-2xl font-black">{type === "BUY" ? "買い" : "売り"} / {selectedStock?.name} / {isMaxAmount ? "最大数" : `${toExactString(amount)}株`}</p></div>{tradeError && <p className="font-bold text-red-500">{tradeError}</p>}<Button className="w-full py-5 text-xl" variant={type === "BUY" ? "danger" : "primary"} isLoading={isLoading} onClick={() => void execute()}>この内容で確定</Button></div>}

          {step === "SUCCESS" && <div className="flex flex-col items-center gap-5 py-10 text-center"><CheckCircle size={64} className="text-emerald-500" /><h2 className="text-3xl font-black">取引完了</h2><p className="font-bold text-slate-500">次のエージェントを受け付けできます。</p><Button className="w-full py-4" onClick={reset}><UserRound size={18} className="mr-2" /> 次の受付へ</Button></div>}

          {step !== "ID" && step !== "SUCCESS" && <div className="mt-8 flex justify-between border-t border-slate-100 pt-5 dark:border-slate-800"><Button variant="outline" onClick={back}><ChevronLeft size={18} className="mr-1" /> 戻る</Button><Button variant="outline" onClick={reset}><RotateCcw size={16} className="mr-1" /> 最初から</Button></div>}
        </section>
      </div>
    </div>
  );
}
