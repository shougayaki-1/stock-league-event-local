// src/components/admin/OrderBoardPrintPreview.tsx

import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import QRCodeLib from "react-qr-code";
import type { User } from "../../types/domain";
import { getLoginId } from "../../lib/utils";
import Button from "../ui/Button";

const QRCode = (QRCodeLib as unknown as { default: ElementType }).default || QRCodeLib;
const HEADER_QR_SIZE = 116;
const HEADER_QR_BOX_CLASS = "bg-white w-[34mm] h-[34mm] p-[1.5mm] border-2 border-black shrink-0 flex items-center justify-center";
const BOARD_QR_CAPTION_CLASS = "h-[6mm] max-w-[34mm] text-center text-[7px] font-bold leading-tight text-neutral-700";
const MEMO_LABELS = [
  "小会議室の情報①",
  "小会議室の情報②",
  "大会議室の情報①",
  "大会議室の情報②",
  "資料室の情報①",
  "資料室の情報②",
  "社長室の情報①",
  "社長室の情報②",
];
const PUBLIC_INFO_URL = `${window.location.origin}/info`;
const PUBLIC_DISPLAY_URL = window.location.origin;
const DEFAULT_PRINT_BATCH_SIZE = 100;

const SLOTS = [
  { title: "売買カード", titleEn: "Action Card", description: "購入または売却のカードを貼る", descriptionEn: "Place a BUY or SELL card.", shape: "○" },
  { title: "銘柄カード", titleEn: "Stock Card", description: "会社名のカードを貼る", descriptionEn: "Place a company card.", shape: "☆" },
  { title: "数量カード", titleEn: "Quantity Card", description: "株数または最大数のカードを貼る", descriptionEn: "Place a quantity or MAX card.", shape: "□" },
];

interface OrderBoardPrintPreviewProps {
  printUsers: User[];
  onBack: () => void;
}

function PersonalOrderBoard({ user }: { user: User }) {
  const loginId = getLoginId(user);

  return (
    <section className="print-page board-print-page w-[297mm] h-[210mm] bg-white text-black p-[8mm] relative overflow-hidden border border-slate-300 shrink-0 print:border-none print:shadow-none box-border select-none">
      <div className="relative z-10 h-full flex flex-col">
        <header className="flex items-end justify-between border-b-2 border-black pb-[4mm]">
          <div>
            <p className="text-[11px] font-black tracking-[0.25em] text-neutral-600">注文カード貼付用</p>
            <h1 className="text-[30px] font-black tracking-tight leading-none mt-2">注文台紙</h1>
          </div>
          <p className="text-[25px] font-mono font-black leading-none tracking-widest">{loginId}</p>
        </header>

        <main className="relative flex-1 py-[6mm] flex flex-col">
          <div className="grid grid-cols-3 gap-[4mm]">
            {SLOTS.map((slot) => (
              <div key={slot.title} className="w-[91mm] h-[55mm] relative border-[2.5px] border-dashed border-black rounded-md p-[3mm] flex gap-[4mm] items-center break-inside-avoid overflow-hidden">
                <div className="absolute right-[3mm] top-[2mm] text-[25px] font-black leading-none text-black">{slot.shape}</div>
                <div className="bg-white w-[31mm] h-[31mm] p-[2mm] border-2 border-dashed border-black shrink-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[20px] font-black leading-none">{slot.shape}</p>
                    <p className="text-[9px] font-black mt-1">貼付</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 pr-[10mm]">
                  <p className="text-[10px] font-black tracking-widest text-neutral-600">{slot.title}</p>
                  <p className="text-[22px] font-black leading-tight break-words mt-1">{slot.title}</p>
                  <p className="text-[8px] font-black uppercase tracking-[0.12em] text-neutral-500">{slot.titleEn}</p>
                  <p className="text-[8px] font-bold mt-2 text-neutral-500">{slot.description}</p>
                  <p className="text-[7px] font-bold text-neutral-500">{slot.descriptionEn}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-[6mm] border border-neutral-400 rounded-md p-[3mm]">
            <p className="text-[12px] font-black tracking-widest">使い方</p>
            <div className="mt-[3mm] text-[11px] font-bold text-neutral-700 leading-relaxed">
              銘柄カード、数量カード、売買カードの３つを選び、台紙に並べた上で、スタッフを呼んでください。
              <p className="mt-[1.5mm] text-[9px] font-bold text-neutral-500">
                Choose one stock card, one quantity card, and one BUY/SELL card. Place them on this board, then call a staff member.
              </p>
            </div>
          </div>

          <div className="mt-[2mm] flex-1 grid grid-cols-[38mm_1fr_38mm] gap-[7mm] items-end border border-neutral-400 rounded-md p-[4mm] min-h-[62mm]">
            <div className="flex flex-col items-center gap-[1.5mm]">
              <p className="text-[8px] font-black tracking-[0.18em] text-neutral-600">端末用ID</p>
              <div className={HEADER_QR_BOX_CLASS}>
                <QRCode value={loginId} size={HEADER_QR_SIZE} fgColor="#000000" bgColor="#ffffff" level="H" />
              </div>
              <p className={BOARD_QR_CAPTION_CLASS}>{loginId}</p>
            </div>

            <div className="self-stretch flex flex-col">
              <p className="text-[11px] font-black tracking-[0.16em] text-neutral-600">謎解き用メモ</p>
              <div className="mt-[2mm] grid flex-1 grid-cols-2 grid-rows-4 border border-neutral-500">
                {MEMO_LABELS.map((label) => (
                  <div key={label} className="relative border border-neutral-300 px-[2mm] py-[1.5mm]">
                    <p className="text-[9px] font-black tracking-[0.02em] text-neutral-800">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-[1.5mm]">
              <p className="text-[8px] font-black tracking-[0.08em] text-neutral-600">帰ったら読み込んでみよう</p>
              <div className={HEADER_QR_BOX_CLASS}>
                <QRCode value={PUBLIC_INFO_URL} size={HEADER_QR_SIZE} fgColor="#000000" bgColor="#ffffff" level="H" />
              </div>
              <p className={BOARD_QR_CAPTION_CLASS}>
                {PUBLIC_DISPLAY_URL}
              </p>
            </div>
          </div>
        </main>

        <footer className="relative z-10 flex items-center justify-between border-t border-neutral-300 pt-[4mm] text-[10px] font-black tracking-[0.24em] text-neutral-500">
          <span>注文台紙</span>
        </footer>
      </div>
    </section>
  );
}

export default function OrderBoardPrintPreview({ printUsers, onBack }: OrderBoardPrintPreviewProps) {
  const [batchSize, setBatchSize] = useState(DEFAULT_PRINT_BATCH_SIZE);
  const [batchIndex, setBatchIndex] = useState(0);
  const safeBatchSize = Math.max(1, batchSize);
  const batchCount = Math.max(1, Math.ceil(printUsers.length / safeBatchSize));
  const startIndex = batchIndex * safeBatchSize;
  const visiblePrintUsers = useMemo(
    () => printUsers.slice(startIndex, startIndex + safeBatchSize),
    [printUsers, startIndex, safeBatchSize]
  );
  const endIndex = startIndex + visiblePrintUsers.length;

  useEffect(() => {
    setBatchIndex(prev => Math.min(prev, Math.max(0, batchCount - 1)));
  }, [batchCount]);

  const handleBatchSizeChange = (value: number) => {
    const nextSize = Number.isFinite(value) ? Math.min(500, Math.max(1, Math.floor(value))) : DEFAULT_PRINT_BATCH_SIZE;
    setBatchSize(nextSize);
    setBatchIndex(0);
  };

  const handlePrint = () => {
    requestAnimationFrame(() => window.print());
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-200 overflow-y-auto font-sans flex flex-col items-center print:static print:bg-white print:overflow-visible print:block">
      <div className="no-print p-4 bg-white shadow-sm flex flex-col gap-4 w-full sticky top-0 z-10 border-b border-slate-300">
        <div>
          <h2 className="text-xl font-black text-slate-800">印刷プレビュー</h2>
          <p className="text-sm text-slate-500">
            全{printUsers.length}枚中 {startIndex + 1}〜{endIndex}枚目を表示しています。大量印刷時は分割ごとに印刷してください。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
            分割枚数
            <input
              type="number"
              min={1}
              max={500}
              value={batchSize}
              onChange={event => handleBatchSizeChange(Number(event.target.value))}
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-black outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBatchIndex(prev => Math.max(0, prev - 1))} disabled={batchIndex === 0}>前の分割</Button>
            <span className="text-sm font-black text-slate-500">{batchIndex + 1} / {batchCount}</span>
            <Button variant="secondary" onClick={() => setBatchIndex(prev => Math.min(batchCount - 1, prev + 1))} disabled={batchIndex >= batchCount - 1}>次の分割</Button>
          </div>
          <Button onClick={handlePrint} className="px-8 py-3 text-lg">表示中を印刷する</Button>
          <Button variant="secondary" onClick={onBack}>戻る</Button>
        </div>
      </div>

      <div className="print-area w-full max-w-[297mm] flex flex-col items-center gap-8 py-8 print:py-0 print:block">
        {visiblePrintUsers.map((user) => <PersonalOrderBoard key={user.uid} user={user} />)}
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
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
            width: 297mm !important;
            height: 210mm !important;
            padding: 8mm !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-page:last-child {
            page-break-after: auto;
          }
          ::-webkit-scrollbar { display: none; }
        }
      `}</style>
    </div>
  );
}
