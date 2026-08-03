import type { ElementType } from "react";
import QRCodeLib from "react-qr-code";

const QRCode = (QRCodeLib as unknown as { default: ElementType }).default || QRCodeLib;

const SLOTS = [
  { title: "売買カード", titleEn: "Action Card", description: "購入または売却のカードを貼る", shape: "○" },
  { title: "銘柄カード", titleEn: "Stock Card", description: "会社名のカードを貼る", shape: "☆" },
  { title: "数量カード", titleEn: "Quantity Card", description: "株数または最大数のカードを貼る", shape: "□" },
];

export default function OrderMatTemplate() {
  return (
    <div className="h-[1080px] w-[1920px] overflow-hidden bg-white p-[72px] text-black">
      <div className="flex h-full flex-col border-[5px] border-black p-12">
        <header className="flex items-end justify-between border-b-[5px] border-black pb-8">
          <div>
            <p className="text-4xl font-black tracking-[0.25em] text-neutral-600">注文カード貼付用</p>
            <h1 className="mt-4 text-[108px] font-black leading-none tracking-normal">注文台紙</h1>
          </div>
          <p className="text-7xl font-black tracking-[0.2em]">SAMPLE</p>
        </header>

        <main className="flex flex-1 flex-col py-10">
          <div className="grid grid-cols-3 gap-8">
            {SLOTS.map(slot => (
              <div key={slot.title} className="relative flex h-[300px] items-center gap-8 overflow-hidden rounded-[8px] border-[5px] border-dashed border-black p-7">
                <div className="absolute right-7 top-5 text-7xl font-black leading-none">{slot.shape}</div>
                <div className="flex h-40 w-40 shrink-0 items-center justify-center border-[4px] border-dashed border-black bg-white">
                  <div className="text-center">
                    <p className="text-6xl font-black leading-none">{slot.shape}</p>
                    <p className="mt-2 text-2xl font-black">貼付</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 pr-16">
                  <p className="text-2xl font-black tracking-widest text-neutral-600">{slot.title}</p>
                  <p className="mt-2 text-5xl font-black leading-tight">{slot.title}</p>
                  <p className="text-xl font-black uppercase tracking-[0.12em] text-neutral-500">{slot.titleEn}</p>
                  <p className="mt-5 text-2xl font-bold text-neutral-600">{slot.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-9 rounded-[8px] border-[3px] border-neutral-400 p-7">
            <p className="text-4xl font-black tracking-widest">使い方</p>
            <p className="mt-5 text-4xl font-bold leading-relaxed text-neutral-700">
              銘柄カード、数量カード、売買カードの3つを選び、台紙に並べたらスタッフを呼んでください。
            </p>
          </div>

          <div className="mt-8 grid flex-1 grid-cols-[260px_1fr_260px_260px] items-end gap-9 rounded-[8px] border-[3px] border-neutral-400 p-8">
            {[
              { label: "端末用ID", value: "SAMPLE-001", caption: "SAMPLE-001" },
              { label: "情報ページ", value: `${window.location.origin}/info`, caption: `${window.location.host}/info` },
              { label: "表示ページ", value: window.location.origin, caption: window.location.host },
            ].map((qr, index) => (
              <div key={qr.label} className={index === 0 ? "flex flex-col items-center gap-4" : "flex flex-col items-center gap-4"}>
                <p className="text-2xl font-black tracking-[0.14em] text-neutral-600">{qr.label}</p>
                <div className="flex h-[210px] w-[210px] items-center justify-center border-[4px] border-black bg-white p-4">
                  <QRCode value={qr.value} size={176} fgColor="#000000" bgColor="#ffffff" level="H" />
                </div>
                <p className="max-w-[240px] text-center text-xl font-bold leading-tight text-neutral-700">{qr.caption}</p>
              </div>
            ))}
            <div className="self-stretch rounded-[8px] border-[3px] border-neutral-500 p-6">
              <p className="text-3xl font-black tracking-[0.16em] text-neutral-600">謎解き用メモ</p>
              <div className="mt-5 grid h-[260px] grid-cols-2 grid-rows-4 border-[2px] border-neutral-500">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="border border-neutral-300 p-3">
                    <p className="text-xl font-black text-neutral-800">メモ {index + 1}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
