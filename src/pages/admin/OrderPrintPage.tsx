import { useEffect, useMemo, useState, type ElementType } from "react";
import QRCodeLib from "react-qr-code";
import { Layers, Package, Plus, Printer, RotateCcw, Trash2, TrendingUp } from "lucide-react";
import { useStocks } from "../../hooks/useFirebase";
import Button from "../../components/ui/Button";

const QRCode = (QRCodeLib as unknown as { default: ElementType }).default || QRCodeLib;

type PrintMode = "actions" | "stocks" | "amounts";

interface OrderCard {
  title: string;
  titleEn?: string;
  subtitle: string;
  subtitleEn: string;
  description: string;
  descriptionEn: string;
  payload: string;
  shape: string;
}

interface AmountPrintSettings {
  amounts: number[];
  includeMax: boolean;
}

const DEFAULT_AMOUNT_SETTINGS: AmountPrintSettings = {
  amounts: [1, 5, 10, 50, 100],
  includeMax: true,
};
const AMOUNT_SETTINGS_STORAGE_KEY = "insider_order_card_amount_settings";
const CARD_COPIES_PER_PAGE = 10;
const CARD_SIZE_CLASS = "w-[91mm] h-[55mm]";

const tabs: Array<{ id: PrintMode; label: string; icon: ElementType }> = [
  { id: "actions", label: "売買カード", icon: RotateCcw },
  { id: "stocks", label: "銘柄カード", icon: TrendingUp },
  { id: "amounts", label: "数量カード", icon: Package },
];

function normalizeAmounts(values: number[]) {
  return Array.from(new Set(values))
    .filter((amount) => Number.isInteger(amount) && amount > 0)
    .sort((a, b) => a - b);
}

function loadAmountSettings(): AmountPrintSettings {
  if (typeof window === "undefined") return DEFAULT_AMOUNT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(AMOUNT_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_AMOUNT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AmountPrintSettings>;
    const amounts = normalizeAmounts(Array.isArray(parsed.amounts) ? parsed.amounts.map(Number) : DEFAULT_AMOUNT_SETTINGS.amounts);
    return {
      amounts: amounts.length > 0 ? amounts : DEFAULT_AMOUNT_SETTINGS.amounts,
      includeMax: parsed.includeMax !== false,
    };
  } catch {
    return DEFAULT_AMOUNT_SETTINGS;
  }
}

function OrderCardFrame({ card, className = CARD_SIZE_CLASS }: { card: OrderCard; className?: string }) {
  return (
    <div className={`${className} relative border-[2.5px] rounded-md p-[3mm] flex gap-[4mm] items-center break-inside-avoid overflow-hidden border-black bg-white text-black`}>
      <div className="absolute right-[3mm] top-[2mm] text-[25px] font-black leading-none text-black">{card.shape}</div>
      <div className="bg-white w-[31mm] h-[31mm] p-[2mm] border-2 border-black shrink-0 flex items-center justify-center">
        <QRCode value={card.payload} size={102} fgColor="#000000" bgColor="#ffffff" level="H" />
      </div>
      <div className="min-w-0 flex-1 pr-[10mm]">
        <p className="text-[10px] font-black tracking-widest text-neutral-600">{card.subtitle}</p>
        <p className="text-[7px] font-black uppercase tracking-[0.16em] text-neutral-500">{card.subtitleEn}</p>
        <p className="text-[23px] font-black leading-tight break-words mt-1">{card.title}</p>
        {card.titleEn && <p className="text-[18px] font-black uppercase leading-none text-neutral-700">{card.titleEn}</p>}
        <p className="text-[8px] font-bold mt-2 text-neutral-500">{card.description}</p>
        <p className="text-[7px] font-bold text-neutral-500">{card.descriptionEn}</p>
      </div>
    </div>
  );
}

function CardPages({ title, cards }: { title: string; cards: OrderCard[] }) {
  const copies = Array.from({ length: CARD_COPIES_PER_PAGE });

  return (
    <>
      {cards.map((card, pageIndex) => (
        <section key={card.payload} className="print-page business-print-page w-[210mm] h-[297mm] bg-white relative border border-slate-300 shrink-0 print:border-none print:shadow-none box-border select-none" aria-label={`${title} ${card.title} ページ ${pageIndex + 1} / ${cards.length}`}>
          <div className="absolute left-[14mm] top-[11mm] grid grid-cols-2 grid-rows-5">
            {copies.map((_, copyIndex) => (
              <div key={`${card.payload}-${copyIndex}`} className={`${CARD_SIZE_CLASS} cut-cell p-[1.5mm]`}>
                <OrderCardFrame card={card} className="w-full h-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

export default function OrderPrintPage() {
  const stocks = useStocks();
  const [activeMode, setActiveMode] = useState<PrintMode>("actions");
  const [amountSettings, setAmountSettings] = useState<AmountPrintSettings>(() => loadAmountSettings());
  const [newAmountText, setNewAmountText] = useState("");
  const [amountMessage, setAmountMessage] = useState("");

  useEffect(() => {
    window.localStorage.setItem(AMOUNT_SETTINGS_STORAGE_KEY, JSON.stringify(amountSettings));
  }, [amountSettings]);

  const actionCards = useMemo<OrderCard[]>(() => [
    { title: "購入", titleEn: "BUY", subtitle: "売買カード", subtitleEn: "Action Card", description: "買う", descriptionEn: "Buy shares", payload: "ACTION:BUY", shape: "○" },
    { title: "売却", titleEn: "SELL", subtitle: "売買カード", subtitleEn: "Action Card", description: "売る", descriptionEn: "Sell shares", payload: "ACTION:SELL", shape: "○" },
  ], []);

  const stockCards = useMemo<OrderCard[]>(() => stocks.map((stock) => ({
    title: stock.name,
    titleEn: stock.id,
    subtitle: "銘柄カード",
    subtitleEn: "Stock Card",
    description: "会社を選ぶ",
    descriptionEn: "Choose a company",
    payload: `STOCK:${stock.id}`,
    shape: "☆",
  })), [stocks]);

  const amountPresets = useMemo(() => [
    ...amountSettings.amounts,
    ...(amountSettings.includeMax ? ["MAX" as const] : []),
  ], [amountSettings]);

  const amountCards = useMemo<OrderCard[]>(() => amountPresets.map((amount) => ({
    title: amount === "MAX" ? "最大数" : `${amount}株`,
    titleEn: amount === "MAX" ? "MAX" : `${amount} ${amount === 1 ? "SHARE" : "SHARES"}`,
    subtitle: "数量カード",
    subtitleEn: "Quantity Card",
    description: "株数を選ぶ",
    descriptionEn: "Choose the quantity",
    payload: `AMOUNT:${amount}`,
    shape: "□",
  })), [amountPresets]);

  const addAmount = () => {
    const nextAmount = Number(newAmountText);
    if (!Number.isInteger(nextAmount) || nextAmount <= 0) {
      setAmountMessage("追加する株数は1以上の整数で入力してください。");
      return;
    }
    setAmountSettings((prev) => ({
      ...prev,
      amounts: normalizeAmounts([...prev.amounts, nextAmount]),
    }));
    setNewAmountText("");
    setAmountMessage(`${nextAmount}株を追加しました。`);
    setActiveMode("amounts");
  };

  const removeAmount = (amount: number) => {
    if (amountSettings.amounts.length <= 1) {
      setAmountMessage("数量カードは最低1種類必要です。");
      return;
    }
    setAmountSettings((prev) => {
      const amounts = prev.amounts.filter((item) => item !== amount);
      return { ...prev, amounts: amounts.length > 0 ? amounts : prev.amounts };
    });
    setAmountMessage(`${amount}株を削除しました。`);
  };

  const resetAmounts = () => {
    setAmountSettings(DEFAULT_AMOUNT_SETTINGS);
    setNewAmountText("");
    setActiveMode("amounts");
  };

  return (
    <div className="min-h-dvh bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      <div className="no-print sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-6 py-4">
        <div className="max-w-[1800px] mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2"><Layers className="text-slate-700 dark:text-slate-200" /> 注文カード印刷</h2>
            <p className="text-sm text-slate-500 mt-1">表示中のタブだけを印刷します。3種類すべて刷る場合はタブごとに印刷してください。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveMode(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black border transition ${isActive ? "bg-white dark:bg-slate-950 text-slate-950 dark:text-white border-slate-950 dark:border-white shadow-sm" : "bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"}`}
                >
                  <Icon size={16} /> {tab.label}
                </button>
              );
            })}
            <Button variant="outline" onClick={() => window.print()} className="border-slate-950 text-slate-950 hover:bg-slate-100 dark:border-white dark:text-white dark:hover:bg-slate-800">
              <Printer size={16} className="mr-2" /> 印刷
            </Button>
          </div>
        </div>
        <div className="max-w-[1800px] mx-auto mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-black flex items-center gap-2"><Package size={16} /> 数量カード設定</p>
              <p className="text-xs text-slate-500 mt-1">ここで設定した株数が、数量カードの印刷ページに反映されます。</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 tracking-widest">追加する株数</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newAmountText}
                  onChange={(event) => setNewAmountText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") addAmount(); }}
                  className="w-32 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-black outline-none focus:border-slate-900 dark:focus:border-white"
                  placeholder="例: 20"
                />
              </label>
              <Button variant="outline" onClick={addAmount} className="border-slate-900 text-slate-900 dark:border-white dark:text-white">
                <Plus size={16} className="mr-2" /> 追加
              </Button>
              <label className="h-[42px] inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-sm font-black">
                <input
                  type="checkbox"
                  checked={amountSettings.includeMax}
                  onChange={(event) => setAmountSettings((prev) => ({ ...prev, includeMax: event.target.checked }))}
                  className="size-4 accent-slate-900"
                />
                最大数を印刷
              </label>
              <Button variant="ghost" onClick={resetAmounts} className="h-[42px]">
                <RotateCcw size={16} className="mr-2" /> 初期値
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {amountMessage && <p className="w-full text-xs font-bold text-slate-500">{amountMessage}</p>}
            {amountSettings.amounts.map((amount) => (
              <span key={amount} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-black">
                {amount}株
                <button
                  type="button"
                  onClick={() => removeAmount(amount)}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`${amount}株を削除`}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            ))}
            {amountSettings.includeMax && (
              <span className="inline-flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-black">
                最大数
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="print-area w-full max-w-[297mm] mx-auto flex flex-col items-center gap-8 py-8 print:py-0 print:block">
        {activeMode === "actions" && <CardPages title="売買カード" cards={actionCards} />}
        {activeMode === "stocks" && (stockCards.length > 0 ? <CardPages title="銘柄カード" cards={stockCards} /> : <div className="no-print rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900">銘柄カードはまだありません。銘柄管理で銘柄を登録してください。</div>)}
        {activeMode === "amounts" && <CardPages title="数量カード" cards={amountCards} />}
      </div>

      <style>{`
        @media print {
          @page businessCardPage { size: A4 portrait; margin: 0; }
          html, body, #root {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          .print-area {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            max-width: none !important;
          }
          .print-page {
            page-break-after: always;
            page-break-inside: avoid;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .business-print-page {
            page: businessCardPage;
            width: 210mm !important;
            height: 297mm !important;
            padding: 0 !important;
          }
          .cut-cell {
            outline: 0.25mm dashed #666;
            outline-offset: -0.2mm;
            box-sizing: border-box;
          }
          ::-webkit-scrollbar { display: none; }
        }
      `}</style>
    </div>
  );
}
