// =================================================================
// File: src/components/admin/scenario/CsvImporter.tsx
// =================================================================

import React, { useEffect, useState } from "react";
import { FileSpreadsheet, AlertCircle, AlertTriangle } from "lucide-react";
import Papa from "papaparse";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import Button from "../../ui/Button";
import { Card, CardHeader, CardTitle } from "../../ui/Card";
import FileButton from "../../ui/FileButton";
import { useDialog } from "../../../contexts/DialogContext";
import type { Stock } from "../../../types/domain";
import type { PriceChangeTarget } from "../../../types/domain";
import type { CsvScenarioRow } from "../../../types/scenario";
import { useBodyScrollLock } from "../../../hooks/useBodyScrollLock";
import type { NewsPreset } from "../../../types/newsPreset";

const CSV_HEADERS = [
    "経過時間(分:秒)",
    "対象銘柄",
    "変動率(%)",
    "到達期限(分)",
    "目標価格",
    "変動確率(%)",
    "分岐名",
    "分岐事後ニュースプリセット名",
    "分岐事後ニュース遅延秒数",
    "サイネージID",
    "イベント名",
    "表ニュースプリセット名",
    "事後ニュースプリセット名",
    "事後ニュース遅延秒数",
    "裏ニュースプリセット名"
] as const;

const REQUIRED_CSV_HEADERS = ["経過時間(分:秒)", "対象銘柄", "イベント名"] as const;

const readFileAsArrayBuffer = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
        } else {
            reject(new Error("CSVファイルを読み込めませんでした。"));
        }
    };
    reader.onerror = () => reject(reader.error || new Error("CSVファイルの読み込みに失敗しました。"));
    reader.readAsArrayBuffer(file);
});

const decodeCsvText = (buffer: ArrayBuffer) => {
    try {
        return {
            text: new TextDecoder("utf-8", { fatal: true }).decode(buffer),
            encoding: "UTF-8"
        };
    } catch {
        return {
            text: new TextDecoder("shift_jis").decode(buffer),
            encoding: "Shift_JIS"
        };
    }
};

const parseCsvText = (text: string) => Papa.parse<CsvScenarioRow>(text, {
    header: true,
    transformHeader: header => header.replace(/^\uFEFF/, "").trim(),
    skipEmptyLines: true
});

const hasKnownHeader = (fields?: string[]) => (
    fields?.some(field => REQUIRED_CSV_HEADERS.includes(field.replace(/^\uFEFF/, "").trim() as typeof REQUIRED_CSV_HEADERS[number])) ?? false
);

const decodeAndParseCsv = (buffer: ArrayBuffer) => {
    const primary = decodeCsvText(buffer);
    const results = parseCsvText(primary.text);

    if (hasKnownHeader(results.meta.fields)) {
        return { results, encoding: primary.encoding };
    }

    if (primary.encoding === "UTF-8") {
        const shiftJisText = new TextDecoder("shift_jis").decode(buffer);
        const shiftJisResults = parseCsvText(shiftJisText);
        if (hasKnownHeader(shiftJisResults.meta.fields)) {
            return { results: shiftJisResults, encoding: "Shift_JIS" };
        }
    }

    return { results, encoding: primary.encoding };
};

const formatParseErrors = (errors: Papa.ParseError[]) => errors.slice(0, 5).map(error => {
    const rowNumber = typeof error.row === "number" ? `${error.row + 2}行目: ` : "";
    return `${rowNumber}${error.message}`;
}).join("\n");

const parseOffsetSeconds = (offsetTime: string) => {
    const match = offsetTime.trim().match(/^(\d+):([0-5]?\d)$/);
    if (!match) return NaN;
    return (Number(match[1]) * 60) + Number(match[2]);
};

interface CSVPreviewRow {
    index: number;
    offsetTime: string;
    offsetSeconds: number;
    name: string;
    publicNewsPresetName: string;
    publicNewsPresetId: string | null;
    postNewsPresetName: string;
    postNewsPresetId: string | null;
    postDelaySeconds: number;
    insiderNewsPresetName: string;
    insiderNewsPresetId: string | null;
    stockId: string;
    targetPrice?: number;
    changePercent?: number;
    deadlineMinutes: number;
    probability: number;
    branchLabel: string;
    branchPostNewsPresetName: string;
    branchPostNewsPresetId: string | null;
    branchPostDelaySeconds: number;
    signageTargetId: string | null;
    signageLabel: string;
    error?: string;
}

interface CsvImporterProps {
    stocks: Stock[];
    newsPresets: NewsPreset[];
    onImportComplete: (events: {
        offsetSeconds: number;
        priceChanges: PriceChangeTarget[];
        publicNewsPresetId: string | null;
        postNewsPresetId: string | null;
        postNewsDelaySeconds: number | null;
        insiderNewsPresetId: string | null;
        signageTargetId: string | null;
    }[]) => void;
}

export default function CsvImporter({ stocks, newsPresets, onImportComplete }: CsvImporterProps) {
    const [csvRows, setCsvRows] = useState<CSVPreviewRow[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const [publicSignages, setPublicSignages] = useState<Array<{ id: string; name: string; location?: string }>>([]);
    const [isPublicSignageLoaded, setIsPublicSignageLoaded] = useState(false);
    const { alert, confirm } = useDialog();
    useBodyScrollLock(showPreview);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "public_signages"), (snap) => {
            setPublicSignages(snap.docs.map(d => {
                const data = d.data();
                return { id: d.id, name: data.name || d.id, location: data.location || "" };
            }));
            setIsPublicSignageLoaded(true);
        }, (error) => {
            console.error(error);
            setIsPublicSignageLoaded(true);
        });
        return () => unsub();
    }, []);

    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        if (!isPublicSignageLoaded) {
            await alert({ title: "CSVインポート準備中", message: "サイネージ情報の読み込み完了後にもう一度お試しください。", variant: "warning" });
            return;
        }

        try {
            const buffer = await readFileAsArrayBuffer(file);
            const { results, encoding } = decodeAndParseCsv(buffer);

            if (!hasKnownHeader(results.meta.fields)) {
                await alert({
                    title: "CSVヘッダーを認識できません",
                    message: "文字コードを判定できませんでした。CSVはUTF-8またはShift_JISで保存し、テンプレートのヘッダー行を変更せずに再度インポートしてください。",
                    variant: "danger"
                });
                return;
            }

            if (!Array.isArray(results.data) || results.data.length === 0) {
                await alert({ title: "CSVが空です", message: "インポートできる行がありません。CSVの内容を確認してください。", variant: "warning" });
                return;
            }

            if (results.errors.length > 0) {
                await alert({
                    title: "CSVの一部を正しく解析できませんでした",
                    message: `${formatParseErrors(results.errors)}${results.errors.length > 5 ? "\n..." : ""}\n\n該当行はプレビューでエラー表示されます。`,
                    variant: "warning"
                });
            }

            const parseErrorsByRow = new Map<number, string>();
            results.errors.forEach(error => {
                if (typeof error.row === "number") {
                    parseErrorsByRow.set(error.row, `CSVパースエラー: ${error.message}`);
                }
            });

            const parsedRows: CSVPreviewRow[] = [];
            const newsPresetByName = new Map(newsPresets.map(preset => [preset.name.trim(), preset]));
            results.data.forEach((row, idx) => {
                const offsetTime = row["経過時間(分:秒)"] || "05:00";
                const offsetSeconds = parseOffsetSeconds(offsetTime);

                const stockId = (row["対象銘柄"] || "").trim();
                const targetPrice = row["目標価格"] ? Number(row["目標価格"]) : undefined;
                const parsedChangePercent = row["変動率(%)"] !== undefined && row["変動率(%)"] !== ""
                    ? Number(row["変動率(%)"])
                    : undefined;
                const deadlineMinutes = row["到達期限(分)"] ? Number(row["到達期限(分)"]) : 5;
                const probability = parseInt(row["変動確率(%)"] || "100", 10);
                const branchLabel = row["分岐名"] || "";
                const branchPostNewsPresetName = (row["分岐事後ニュースプリセット名"] || "").trim();
                const branchPostNewsPreset = branchPostNewsPresetName ? newsPresetByName.get(branchPostNewsPresetName) : null;
                const branchPostDelaySeconds = row["分岐事後ニュース遅延秒数"] ? Math.max(0, Number(row["分岐事後ニュース遅延秒数"]) || 0) : 0;
                const publicNewsPresetName = (row["表ニュースプリセット名"] || "").trim();
                const publicNewsPreset = publicNewsPresetName ? newsPresetByName.get(publicNewsPresetName) : null;
                const postNewsPresetName = (row["事後ニュースプリセット名"] || "").trim();
                const postNewsPreset = postNewsPresetName ? newsPresetByName.get(postNewsPresetName) : null;
                const insiderNewsPresetName = (row["裏ニュースプリセット名"] || "").trim();
                const insiderNewsPreset = insiderNewsPresetName ? newsPresetByName.get(insiderNewsPresetName) : null;
                const requestedSignageId = (row["サイネージID"] || "").trim();
                const signageDevice = requestedSignageId ? publicSignages.find(signage => signage.id === requestedSignageId) : null;

                let error = parseErrorsByRow.get(idx);
                if (!error && stockId && !stocks.find(s => s.id === stockId)) {
                    error = `銘柄ID [${stockId}] が登録されていません。`;
                } else if (!error && (isNaN(offsetSeconds) || offsetSeconds < 0)) {
                    error = "経過時間のフォーマットが正しくありません。(例: 05:00)";
                } else if (!error && targetPrice !== undefined && parsedChangePercent !== undefined) {
                    error = "目標価格と変動率はどちらか一方だけ入力してください。";
                } else if (!error && requestedSignageId && !signageDevice) {
                    error = `サイネージID [${requestedSignageId}] が登録されていません。`;
                } else if (!error && publicNewsPresetName && !publicNewsPreset) {
                    error = `表ニュースプリセット [${publicNewsPresetName}] が登録されていません。`;
                } else if (!error && postNewsPresetName && !postNewsPreset) {
                    error = `事後ニュースプリセット [${postNewsPresetName}] が登録されていません。`;
                } else if (!error && insiderNewsPresetName && !insiderNewsPreset) {
                    error = `裏ニュースプリセット [${insiderNewsPresetName}] が登録されていません。`;
                } else if (!error && branchPostNewsPresetName && !branchPostNewsPreset) {
                    error = `分岐事後ニュースプリセット [${branchPostNewsPresetName}] が登録されていません。`;
                }

                parsedRows.push({
                    index: idx + 1,
                    offsetTime,
                    offsetSeconds,
                    name: row["イベント名"] || "CSVイベント",
                    publicNewsPresetName,
                    publicNewsPresetId: publicNewsPreset?.id || null,
                    postNewsPresetName,
                    postNewsPresetId: postNewsPreset?.id || null,
                    postDelaySeconds: row["事後ニュース遅延秒数"] ? Math.max(0, Number(row["事後ニュース遅延秒数"]) || 0) : 0,
                    insiderNewsPresetName,
                    insiderNewsPresetId: insiderNewsPreset?.id || null,
                    stockId,
                    targetPrice,
                    changePercent: parsedChangePercent,
                    deadlineMinutes,
                    probability,
                    branchLabel,
                    branchPostNewsPresetName,
                    branchPostNewsPresetId: branchPostNewsPreset?.id || null,
                    branchPostDelaySeconds,
                    signageTargetId: requestedSignageId || null,
                    signageLabel: requestedSignageId ? `${signageDevice?.name || requestedSignageId}` : "",
                    error
                });
            });

            setCsvRows(parsedRows);
            setShowPreview(true);
            if (encoding === "Shift_JIS") {
                await alert({ title: "Shift_JISとして読み込みました", message: "CSVをShift_JISとして自動判定し、プレビューを表示しました。", variant: "info" });
            }
        } catch (error) {
            console.error(error);
            await alert({ title: "CSVの読み込みに失敗しました", message: error instanceof Error ? error.message : "ファイルを読み込めませんでした。", variant: "danger" });
        }
    };

    const handleImportConfirm = async () => {
        const hasError = csvRows.some(row => row.error !== undefined);
        if (hasError) {
            await alert({ title: "インポート不可", message: "エラーが発生している行があります。修正または削除してください。", variant: "danger" });
            return;
        }

        const isOk = await confirm({
            title: "CSV一括取り込み",
            message: `プレビュー中の ${csvRows.length} 件のイベントを一括登録します。よろしいですか？`,
            confirmText: "インポート"
        });

        if (!isOk) return;

        const formattedEvents = csvRows.map(row => {
            const branch = row.targetPrice !== undefined
                ? { probability: row.probability, targetPrice: row.targetPrice, deadlineMinutes: row.deadlineMinutes, ...(row.branchLabel ? { label: row.branchLabel } : {}) }
                : { probability: row.probability, changePercent: row.changePercent ?? 0, deadlineMinutes: row.deadlineMinutes, ...(row.branchLabel ? { label: row.branchLabel } : {}) };
            const branchWithNews = row.branchPostNewsPresetId
                ? {
                    ...branch,
                    postNewsPresetId: row.branchPostNewsPresetId,
                    postNewsDelaySeconds: row.branchPostDelaySeconds
                }
                : branch;
            const pc: PriceChangeTarget[] = row.stockId ? [{
                stockId: row.stockId,
                branches: [branchWithNews]
            }] : [];

            return {
                offsetSeconds: row.offsetSeconds,
                priceChanges: pc,
                publicNewsPresetId: row.publicNewsPresetId,
                postNewsPresetId: row.postNewsPresetId,
                postNewsDelaySeconds: row.postNewsPresetId ? row.postDelaySeconds : null,
                insiderNewsPresetId: row.insiderNewsPresetId,
                signageTargetId: row.signageTargetId
            };
        });

        onImportComplete(formattedEvents);
        setCsvRows([]);
        setShowPreview(false);
    };

    const handleDownloadTemplate = () => {
        const headers = [...CSV_HEADERS];
        
        const sampleStockId1 = stocks[0]?.id || "9901";
        const sampleStockId2 = stocks[1]?.id || stocks[0]?.id || "9902";

        const sampleSignageId = publicSignages[0]?.id || "";
        const sampleRows = [
            ["01:30", sampleStockId1, "25", "5", "", "80", "成功", newsPresets[1]?.name || "", "180", "", "新製品発表", newsPresets[0]?.name || "", "", "0", ""],
            ["03:00", sampleStockId2, "-20", "5", "", "100", "悪材料", "", "0", sampleSignageId, "不祥事発生", newsPresets[0]?.name || "", newsPresets[1]?.name || "", "180", ""],
            ["04:30", "", "", "", "", "100", "", "", "0", sampleSignageId, "表示切替", newsPresets[0]?.name || "", "", "0", ""]
        ];

        const csvContent = "\uFEFF" + [
            headers.join(","),
            ...sampleRows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "scenario_timeline_template.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <>
            <div className="flex flex-col sm:flex-row items-center gap-3">
                <FileButton
                    accept=".csv"
                    onChange={handleCSVUpload}
                    variant="success"
                    size="sm"
                    disabled={!isPublicSignageLoaded}
                    className="w-full sm:w-auto select-none"
                >
                    <FileSpreadsheet size={16} /> CSVインポート
                </FileButton>
                <Button
                    onClick={handleDownloadTemplate}
                    variant="soft"
                    size="sm"
                    className="w-full sm:w-auto"
                >
                    テンプレートDL
                </Button>
            </div>

            {showPreview && (
                <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
                    <Card className="max-w-4xl w-full max-h-[94dvh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 py-4 shrink-0 flex flex-row justify-between items-center">
                            <CardTitle className="text-base flex items-center gap-2">
                                <FileSpreadsheet className="text-emerald-500" /> CSVインポート確認（プレビュー）
                            </CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600">
                                閉じる
                            </Button>
                        </CardHeader>

                        <div className="flex-1 overflow-auto p-4 space-y-2">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 text-slate-500 font-black tracking-widest">
                                        <th className="p-3 w-16">No</th>
                                        <th className="p-3 w-24">経過時間</th>
                                        <th className="p-3">イベント名 / 見出し</th>
                                        <th className="p-3 w-32">対象銘柄</th>
                                        <th className="p-3 w-32 text-right">変動率 / 期限</th>
                                        <th className="p-3 w-40">プリセット演出の送出先</th>
                                        <th className="p-3 w-20 text-center">状態</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                                    {csvRows.map((row, idx) => (
                                        <tr key={idx} className={row.error ? "bg-red-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-900/50"}>
                                            <td className="p-3 font-mono text-slate-400">{row.index}</td>
                                            <td className="p-3 font-mono font-bold text-blue-600">{row.offsetTime}</td>
                                            <td className="p-3">
                                                <div className="font-bold text-slate-800 dark:text-slate-200">{row.name}</div>
                                                {row.publicNewsPresetName && <div className="text-[10px] text-emerald-600 mt-1">【表】{row.publicNewsPresetName}</div>}
                                                {row.postNewsPresetName && <div className="text-[10px] text-rose-500">【事後】{row.postNewsPresetName}（+{row.postDelaySeconds}秒）</div>}
                                                {row.insiderNewsPresetName && <div className="text-[10px] text-amber-600">【裏】{row.insiderNewsPresetName}</div>}
                                                {row.branchPostNewsPresetName && <div className="text-[10px] text-fuchsia-600">【分岐事後】{row.branchLabel ? `${row.branchLabel}: ` : ""}{row.branchPostNewsPresetName}（+{row.branchPostDelaySeconds}秒）</div>}
                                                {row.error && <div className="text-[10px] text-red-500 font-bold mt-1 flex items-center gap-1"><AlertCircle size={12} /> {row.error}</div>}
                                            </td>
                                            <td className="p-3 font-bold">
                                                {stocks.find(s => s.id === row.stockId)?.name || (row.stockId ? <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle size={12} /> 不正なID</span> : "なし")}
                                            </td>
                                            <td className="p-3 font-mono text-right font-bold">
                                                {row.stockId
                                                    ? row.targetPrice !== undefined
                                                        ? `${row.branchLabel ? `${row.branchLabel}: ` : ""}${row.targetPrice}pt / ${row.deadlineMinutes}分`
                                                        : `${row.branchLabel ? `${row.branchLabel}: ` : ""}${(row.changePercent ?? 0) > 0 ? "+" : ""}${row.changePercent ?? 0}% / ${row.deadlineMinutes}分`
                                                    : "-"}
                                            </td>
                                            <td className="p-3">
                                                <div className="space-y-1 text-[10px] font-black">
                                                    {row.signageTargetId && <div className="text-blue-600">{row.signageLabel}</div>}
                                                    {!row.signageTargetId && <div className="text-slate-400">なし</div>}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                {row.error ? <span className="text-red-500 font-bold">エラー</span> : <span className="text-emerald-500 font-bold">正常</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
                            <Button variant="outline" onClick={() => setShowPreview(false)}>キャンセル</Button>
                            <Button onClick={handleImportConfirm} className="bg-emerald-600 hover:bg-emerald-500">インポートを確定する</Button>
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
}
