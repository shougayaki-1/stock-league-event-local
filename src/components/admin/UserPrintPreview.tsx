// src/components/admin/UserPrintPreview.tsx

import React from "react";
import QRCodeLib from "react-qr-code";
import Button from "../ui/Button";
import { buildLoginQrUrl } from "../../lib/utils";

const QRCode = (QRCodeLib as unknown as { default: React.ElementType }).default || QRCodeLib;

interface UserPrintPreviewProps {
    printIds: string[];
    onBack: () => void;
}

export default function UserPrintPreview({ printIds, onBack }: UserPrintPreviewProps) {
    return (
        <div className="fixed inset-0 z-[500] bg-slate-200 overflow-y-auto font-sans flex flex-col items-center print:static print:bg-white print:overflow-visible print:block">

            <div className="no-print p-4 bg-white shadow-sm flex items-center justify-between w-full sticky top-0 z-10 border-b border-slate-300">
                <div>
                    <h2 className="text-xl font-black text-slate-800">印刷プレビュー</h2>
                    <p className="text-sm text-slate-500">{printIds.length}枚のIDカードを印刷します。</p>
                </div>
                <div className="flex gap-4">
                    <Button onClick={() => window.print()} className="px-8 py-3 text-lg">🖨️ 印刷する</Button>
                    <Button variant="secondary" onClick={onBack}>戻る</Button>
                </div>
            </div>

            <div className="print-area w-full max-w-[297mm] flex flex-col items-center py-8 print:py-0 print:block">
                {printIds.map(id => {
                    const loginUrl = buildLoginQrUrl(id);
                    return (
                        <div key={id} className="print-page w-[297mm] h-[210mm] bg-white my-4 shadow-2xl relative overflow-hidden flex items-center justify-center border border-slate-300 shrink-0 print:my-0 print:border-none print:shadow-none print:w-full print:h-[100vh]">

                            <div className="absolute top-0 left-0 w-full h-8 bg-black"></div>
                            <div className="absolute bottom-0 left-0 w-full h-16 bg-black flex items-center justify-center">
                                <p className="text-white font-bold tracking-[0.3em] text-2xl">AGENT ID CARD / 株価にドキリ！</p>
                            </div>

                            <div className="w-full flex items-center justify-center gap-8 px-12">

                                <div className="flex flex-col items-start w-1/2 pl-4">
                                    <p className="text-[5rem] font-black tracking-tighter leading-none mb-4 italic">株価にドキリ！</p>
                                    <p className="text-2xl font-bold text-gray-500 tracking-widest mb-16">Stock Trading Simulation</p>

                                    <p className="text-xl font-bold text-gray-400 mb-2 tracking-widest">AGENT ID</p>
                                    <p className="text-[6rem] font-mono font-black leading-none tracking-widest border-b-8 border-black inline-block pb-4 mb-4">
                                        {id.split('-')[0]}
                                    </p>
                                    <p className="text-3xl font-mono text-gray-500 tracking-widest">{id}</p>
                                </div>

                                <div className="flex flex-col items-center w-1/2 pr-4">
                                    <div className="border-[16px] border-black p-4 rounded-[2.5rem] bg-white mb-6">
                                        <QRCode value={loginUrl} size={340} fgColor="#000000" bgColor="#ffffff" level="H" />
                                    </div>
                                    <div className="text-center w-full">
                                        <p className="text-xl font-bold bg-black text-white px-6 py-2 rounded-full inline-block mb-4">スマホのカメラでスキャン</p>
                                        <p className="text-base font-bold text-gray-500 mb-2">読めない場合はブラウザで以下のURLを開く</p>
                                        <p className="text-xl font-mono font-black text-black bg-gray-100 px-4 py-3 rounded-xl border-2 border-gray-300 inline-block break-all w-[90%]">
                                            {loginUrl}
                                        </p>
                                    </div>
                                </div>

                            </div>
                        </div>
                    );
                })}
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
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            width: 100vw !important;
            height: 100vh !important;
            overflow: hidden !important; 
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
