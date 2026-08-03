import { useEffect, useState } from "react";
import { AlertCircle, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";
import Button from "../../ui/Button";
import FileButton from "../../ui/FileButton";
import { Card, CardHeader, CardTitle } from "../../ui/Card";
import { useDialog } from "../../../contexts/DialogContext";
import { importNewsPresets } from "../../../services/newsPresetService";
import type { NewsPreset, NewsPresetInput } from "../../../types/newsPreset";
import { subscribeScenarioVideoLibrary } from "../../../services/scenarioService";
import type { VideoLibraryItem } from "../../../types/videoLibrary";
import { PUBLIC_SIGNAGE_PRESETS } from "../../../lib/signagePresets";

interface NewsPresetCsvRow {
  "プリセット名"?: string;
  "見出し"?: string;
  "本文"?: string;
  "速報動画名"?: string;
  "サイネージ表示モード"?: string;
  "サイネージ動画名"?: string;
  "サイネージ表示秒数"?: string;
  "サイネージ種別"?: string;
}

interface PreviewRow extends NewsPresetInput {
  index: number;
  error?: string;
}

const CSV_HEADERS = ["プリセット名", "見出し", "本文"] as const;
const OPTIONAL_CSV_HEADERS = ["速報動画名", "サイネージ表示モード", "サイネージ動画名", "サイネージ表示秒数", "サイネージ種別"] as const;

const readFileAsArrayBuffer = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("CSVファイルを読み込めませんでした。"));
  reader.onerror = () => reject(reader.error || new Error("CSVファイルの読み込みに失敗しました。"));
  reader.readAsArrayBuffer(file);
});

const parseCsvText = (text: string) => Papa.parse<NewsPresetCsvRow>(text, {
  header: true,
  transformHeader: header => header.replace(/^\uFEFF/, "").trim(),
  skipEmptyLines: true,
});

const decodeAndParseCsv = (buffer: ArrayBuffer) => {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { results: parseCsvText(text), encoding: "UTF-8" };
  } catch {
    const text = new TextDecoder("shift_jis").decode(buffer);
    return { results: parseCsvText(text), encoding: "Shift_JIS" };
  }
};

export default function NewsPresetCsvImporter({ presets }: { presets: NewsPreset[] }) {
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [videoLibrary, setVideoLibrary] = useState<VideoLibraryItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const { alert, confirm } = useDialog();

  useEffect(() => {
    const unsub = subscribeScenarioVideoLibrary(setVideoLibrary);
    return () => unsub();
  }, []);

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const { results, encoding } = decodeAndParseCsv(await readFileAsArrayBuffer(file));
      const fields = results.meta.fields?.map(field => field.replace(/^\uFEFF/, "").trim()) || [];
      const missingHeaders = CSV_HEADERS.filter(header => !fields.includes(header));
      if (missingHeaders.length > 0) {
        await alert({ title: "CSVヘッダー不足", message: `不足列: ${missingHeaders.join(" / ")}`, variant: "danger" });
        return;
      }

      const existingNames = new Set(presets.map(preset => preset.name.trim()));
      const videoByName = new Map(videoLibrary.map(video => [video.name.trim(), video]));
      const signagePresetIds = new Set(PUBLIC_SIGNAGE_PRESETS.map(preset => preset.id));
      const csvNames = new Set<string>();
      const previewRows = results.data.map((row, index) => {
        const name = (row["プリセット名"] || "").trim();
        const title = (row["見出し"] || "").trim();
        const body = (row["本文"] || "").trim();
        const breakingVideoName = (row["速報動画名"] || "").trim();
        const signageMode = (row["サイネージ表示モード"] || "").trim();
        const signageVideoName = (row["サイネージ動画名"] || "").trim();
        const signageDurationText = (row["サイネージ表示秒数"] || "").trim();
        const signageKindText = (row["サイネージ種別"] || "").trim();
        const breakingVideo = breakingVideoName ? videoByName.get(breakingVideoName) : null;
        const signageVideo = signageVideoName ? videoByName.get(signageVideoName) : null;
        const hasSignageDisplay = Boolean(signageMode || signageVideoName || signageDurationText || signageKindText);
        const signageKind: "NORMAL" | "AD" = signageKindText === "AD" ? "AD" : "NORMAL";
        const signageDuration = signageDurationText ? Number(signageDurationText) : 30;
        let error = "";
        if (!name || !title || !body) error = "必須列に空欄があります。";
        else if (existingNames.has(name)) error = `プリセット名 [${name}] は既に登録されています。`;
        else if (csvNames.has(name)) error = `プリセット名 [${name}] がCSV内で重複しています。`;
        else if (breakingVideoName && !breakingVideo) error = `速報動画 [${breakingVideoName}] が動画ライブラリにありません。`;
        else if (hasSignageDisplay && !signageMode) error = "サイネージ表示モードを入力してください。";
        else if (hasSignageDisplay && !signagePresetIds.has(signageMode)) error = `サイネージ表示モード [${signageMode}] は未登録です。`;
        else if (hasSignageDisplay && (!Number.isFinite(signageDuration) || signageDuration < 5)) error = "サイネージ表示秒数は5秒以上で入力してください。";
        else if (signageVideoName && !signageVideo) error = `サイネージ動画 [${signageVideoName}] が動画ライブラリにありません。`;
        else if (hasSignageDisplay && signageKindText && signageKindText !== "NORMAL" && signageKindText !== "AD") error = "サイネージ種別は NORMAL または AD を入力してください。";
        csvNames.add(name);
        return {
          index: index + 1,
          name,
          title,
          body,
          breakingVideoId: breakingVideo?.id || null,
          signageDisplay: hasSignageDisplay ? {
            mode: signageMode,
            duration: Math.max(5, signageDuration || 30),
            videoAssetId: signageVideo?.id || null,
            kind: signageKind,
          } : null,
          ...(error ? { error } : {}),
        };
      });

      setRows(previewRows);
      setIsOpen(true);
      if (encoding === "Shift_JIS") {
        await alert({ title: "Shift_JISとして読み込みました", message: "CSVをShift_JISとして自動判定しました。", variant: "info" });
      }
    } catch (error) {
      console.error(error);
      await alert({ title: "CSVの読み込みに失敗しました", message: error instanceof Error ? error.message : "ファイルを読み込めませんでした。", variant: "danger" });
    }
  };

  const handleImport = async () => {
    const validRows = rows.filter(row => !row.error);
    if (validRows.length === 0) {
      await alert({ title: "取り込み対象なし", message: "正常な行がありません。", variant: "warning" });
      return;
    }
    const isOk = await confirm({
      title: "ニュースプリセットCSV取り込み",
      message: `正常な ${validRows.length} 件のみ登録します。よろしいですか？`,
      confirmText: "インポート",
    });
    if (!isOk) return;
    await importNewsPresets(validRows.map(({ name, title, body, breakingVideoId, signageDisplay }) => ({ name, title, body, breakingVideoId, signageDisplay })));
    setRows([]);
    setIsOpen(false);
  };

  const handleDownloadTemplate = () => {
    const sampleRows = [
      ["新製品発表 表", "A社が画期的な新製品を発表", "本日A社より市場を揺るがす画期的な製品が発表されました。", "", "STOCK_GRID", "", "30", "NORMAL"],
      ["好決算 事後", "好決算の背景", "予想を上回る受注が利益を押し上げました。", "", "", "", "", ""],
    ];
    const csvContent = "\uFEFF" + [
      [...CSV_HEADERS, ...OPTIONAL_CSV_HEADERS].join(","),
      ...sampleRows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "news_preset_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <FileButton accept=".csv" onChange={handleCSVUpload} variant="success" size="sm" className="w-full sm:w-auto">
          <FileSpreadsheet size={16} /> CSVインポート
        </FileButton>
        <Button onClick={handleDownloadTemplate} variant="soft" size="sm" className="w-full sm:w-auto">
          テンプレートDL
        </Button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-3">
          <Card className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden">
            <CardHeader className="flex-row items-center justify-between border-b border-outline-variant">
              <CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet size={18} /> CSVインポート確認</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>閉じる</Button>
            </CardHeader>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="bg-surface-variant text-on-surface-variant">
                  <tr>
                    <th className="p-3">No</th>
                    <th className="p-3">プリセット名</th>
                    <th className="p-3">見出し</th>
                    <th className="p-3">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {rows.map(row => (
                    <tr key={row.index} className={row.error ? "bg-error/10" : ""}>
                      <td className="p-3 font-mono">{row.index}</td>
                      <td className="p-3 font-black">{row.name || "未入力"}</td>
                      <td className="p-3">{row.title || "未入力"}</td>
                      <td className="p-3">
                        {row.error
                          ? <span className="inline-flex items-center gap-1 font-bold text-error"><AlertCircle size={12} />{row.error}</span>
                          : <span className="font-bold text-emerald-600">正常</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-outline-variant bg-surface-variant p-4">
              <Button variant="outline" onClick={() => setIsOpen(false)}>キャンセル</Button>
              <Button onClick={handleImport}>正常行をインポート</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
