import { Fragment, useRef, useState, useEffect, type ChangeEvent } from "react";
import { useStocks } from "../../hooks/useFirebase";
import { useMarketActions, type StockPriceDirection } from "../../hooks/useMarketActions";
import type { Stock } from "../../types/domain";
import type { PriceRuntimeState } from "../../lib/marketPricing";
import { Play, Square, Zap, Save, AlertTriangle, TrendingUp, TrendingDown, X, Timer, Plus, Settings2, Trash2, ChevronDown, ChevronUp, Upload, Download, FileSpreadsheet } from "lucide-react";
import Papa from "papaparse";
import {
  DEFAULT_STOCK_PHASES,
  DIRECTION_LABELS,
  STOCK_PHASE_CSV_COLUMNS,
  groupStockPhasePreviewRows,
  parseStockPhaseCsvRows,
  validateStockPhases,
  type StockPhaseCsvRow,
  type StockPhasePreviewRow,
} from "../../lib/stockPhaseCsv";
import { subscribeMarketSystem, subscribePriceEngine } from "../../services/marketService";
import { phaseDraftChanged, useStockPhaseDrafts } from "../../hooks/useStockPhaseDrafts";

import Button from "../../components/ui/Button";
import UnsavedBar from "../../components/admin/UnsavedBar";
import { Card, CardContent } from "../../components/ui/Card";
import FileButton from "../../components/ui/FileButton";
import IconButton from "../../components/ui/IconButton";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";

const STATUS_RESET_MS = 3500;

const DIRECTION_TEXT_COLORS: Record<StockPriceDirection, string> = {
  UP: "text-emerald-600 dark:text-emerald-400",
  DOWN: "text-red-600 dark:text-red-400",
  FLAT: "text-slate-500 dark:text-slate-400"
};

export default function MarketControl() {
  const stocks = useStocks();
  const { setSystemPhase, triggerEmergency, stopEmergency, updateTargetPrice, addStock, editStock, saveStockPhases, deleteStock } = useMarketActions();
  
  const [globalPhase, setGlobalPhase] = useState<string>("LOADING...");
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [activeEmergencyType, setActiveEmergencyType] = useState<"UP"|"DOWN">("DOWN");
  const [statusMessage, setStatusMessage] = useState("待機中");
  const statusTimerRef = useRef<number | null>(null);
  
  const [editingData, setEditingData] = useState<Record<string, { price: number; delay: number }>>({});
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [emergencyType, setEmergencyType] = useState<"DOWN" | "UP">("DOWN");
  const [emergencyMsg, setEmergencyMsg] = useState("");
  const [overlayDelay, setOverlayDelay] = useState(0); 
  const [priceDelay, setPriceDelay] = useState(0); 

  // 銘柄追加モーダル用
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStockId, setNewStockId] = useState("");
  const [newStockName, setNewStockName] = useState("");
  const [newStockPrice, setNewStockPrice] = useState(100);

  // 銘柄編集・削除モーダル用
  const [editTarget, setEditTarget] = useState<Stock | null>(null);
  const [editStockName, setEditStockName] = useState("");
  const [priceRuntime, setPriceRuntime] = useState<Record<string, PriceRuntimeState | null>>({});
  const {
    phaseConfigs,
    setPhaseConfigs,
    phaseDrafts,
    expandedPhaseStockId,
    getPhaseDraft,
    openPhaseEditor,
    addPhase,
    updatePhase,
    removePhase,
    clearPhaseDrafts,
    removePhaseDrafts,
  } = useStockPhaseDrafts();
  const [csvPreviewRows, setCsvPreviewRows] = useState<StockPhasePreviewRow[]>([]);
  const [isCsvPreviewOpen, setIsCsvPreviewOpen] = useState(false);
  useBodyScrollLock(isEmergencyModalOpen || isAddModalOpen || Boolean(editTarget) || isCsvPreviewOpen);

  useEffect(() => {
    const unsub = subscribeMarketSystem((snapshot) => {
      setGlobalPhase(snapshot.globalPhase);
      setIsEmergencyActive(snapshot.isEmergencyActive);
      setActiveEmergencyType(snapshot.activeEmergencyType);
    });
    return () => unsub();
  }, []);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
  }, []);

  useEffect(() => {
    const unsub = subscribePriceEngine((snapshot) => {
      setPhaseConfigs(snapshot.configs);
      setPriceRuntime(snapshot.runtime);
    });
    return () => unsub();
  }, [setPhaseConfigs]);

  const handleDataChange = (id: string, field: "price" | "delay", val: string) => {
    const parsed = val === "" ? NaN : Number(val);
    setEditingData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: parsed,
        price: field === "price" ? parsed : (prev[id]?.price ?? stocks.find(s=>s.id===id)?.targetPrice ?? stocks.find(s=>s.id===id)?.currentPrice ?? 0),
        delay: field === "delay" ? parsed : (prev[id]?.delay ?? 0)
      }
    }));
  };

  const showStatus = (message: string) => {
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage("待機中"), STATUS_RESET_MS);
  };

  const handleSetPhase = async (phase: "STOP" | "RUNNING") => {
    if (phase === "STOP" && !window.confirm("市場を停止しますか？参加者側の売買受付が止まります。")) return;
    if (phase === "RUNNING" && isEmergencyActive && !window.confirm("緊急状態を解除してRUNNINGに戻しますか？")) return;
    await setSystemPhase(phase, { silent: true });
    if (phase === "RUNNING" && isEmergencyActive) await stopEmergency({ silent: true });
    showStatus(`System Phase を ${phase} に更新しました`);
  };

  const openEmergencyModal = (type: "DOWN" | "UP") => {
    setEmergencyType(type);
    setEmergencyMsg(type === "DOWN" ? "市場全体で株価が暴落し始めています" : "市場全体で株価が急騰し始めています");
    setOverlayDelay(0); setPriceDelay(0);
    setIsEmergencyModalOpen(true);
  };

  const executeEmergency = async () => {
    if (!Number.isFinite(overlayDelay) || overlayDelay < 0 || !Number.isFinite(priceDelay) || priceDelay < 0) {
      showStatus("緊急遅延は0秒以上で入力してください");
      return;
    }
    await triggerEmergency(emergencyType, emergencyMsg, overlayDelay, priceDelay, { silent: true });
    setIsEmergencyModalOpen(false);
    showStatus(`${emergencyType === "DOWN" ? "緊急暴落" : "緊急急騰"}を予約しました`);
  };

  const handleAddStock = async () => {
    if (!newStockId || !newStockName || newStockPrice <= 0) return;
    const ok = await addStock(newStockId, newStockName, newStockPrice);
    if (ok) {
      setIsAddModalOpen(false);
      setNewStockId("");
      setNewStockName("");
      setNewStockPrice(100);
    }
  };

  const openEditModal = (stock: Stock) => {
    setEditTarget(stock);
    setEditStockName(stock.name);
  };

  const handleEditStock = async () => {
    if (!editTarget || !editStockName) return;
    const ok = await editStock(editTarget.id, editStockName, { silent: true });
    if (ok) {
      setEditTarget(null);
      showStatus(`${editStockName} の銘柄名を保存しました`);
    }
  };

  const handleSaveAllChanges = async () => {
    const invalidPhaseStock = stocks.find(stock => validateStockPhases(getPhaseDraft(stock.id)));
    if (invalidPhaseStock) {
      showStatus(`${invalidPhaseStock.name}: ${validateStockPhases(getPhaseDraft(invalidPhaseStock.id))}`);
      return;
    }
    const invalidTarget = Object.entries(editingData).find(([, data]) =>
      !Number.isFinite(data.price) || data.price <= 0 || !Number.isFinite(data.delay) || data.delay < 0
    );
    if (invalidTarget) {
      showStatus("目標価格は1以上、遅延は0秒以上で入力してください");
      return;
    }

    setIsSavingChanges(true);
    try {
      const targetStocks = stocks.filter(stock => editingData[stock.id]);
      const targetResults = await Promise.all(targetStocks.map(stock => {
        const targetVal = editingData[stock.id]?.price ?? stock.targetPrice ?? stock.currentPrice;
        const delayVal = editingData[stock.id]?.delay ?? 0;
        return updateTargetPrice(stock.id, stock.name, targetVal, delayVal, { silent: true });
      }));
      const changedPhaseStocks = stocks.filter(stock => phaseDraftChanged(stock.id, phaseDrafts, phaseConfigs));
      const phaseResults = await Promise.all(changedPhaseStocks.map(stock => saveStockPhases(stock.id, getPhaseDraft(stock.id), { silent: true })));
      const targetSuccessCount = targetResults.filter(Boolean).length;
      const phaseSuccessCount = phaseResults.filter(Boolean).length;
      if (targetSuccessCount === targetStocks.length) setEditingData({});
      if (phaseSuccessCount === changedPhaseStocks.length) {
        setPhaseConfigs(prev => ({
          ...prev,
          ...Object.fromEntries(changedPhaseStocks.map(stock => [stock.id, { phases: getPhaseDraft(stock.id) }]))
        }));
        clearPhaseDrafts();
      }
      const targetMessage = targetStocks.length > 0
        ? `目標価格 ${targetSuccessCount}/${targetStocks.length} 件`
        : "目標価格 変更なし";
      const phaseMessage = changedPhaseStocks.length > 0 ? `価格フェーズ ${phaseSuccessCount}/${changedPhaseStocks.length} 件` : "価格フェーズ 変更なし";
      showStatus(`${targetMessage}、${phaseMessage}を保存しました`);
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleExportStockPhases = () => {
    const rows = stocks.flatMap(stock => getPhaseDraft(stock.id).map((phase, index) => ({
      "銘柄ID": stock.id,
      "フェーズID": phase.id || `${stock.id}-phase-${index + 1}`,
      "開始分": phase.startMinute,
      "終了分": phase.endMinute,
      "方向": DIRECTION_LABELS[phase.direction],
      "変動率(%)": phase.changePercent
    })));
    const csv = Papa.unparse(rows, { columns: STOCK_PHASE_CSV_COLUMNS });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock_price_phases.csv";
    link.click();
    URL.revokeObjectURL(url);
    showStatus(`${rows.length} 件の価格フェーズをCSV出力しました`);
  };

  const handleImportStockPhases = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const stockIds = new Set(stocks.map(stock => stock.id));
        const previewRows = parseStockPhaseCsvRows(results.data as StockPhaseCsvRow[]).map(row => ({
          ...row,
          error: row.error || (row.stockId && !stockIds.has(row.stockId) ? "登録されていない銘柄IDです" : undefined)
        }));
        setCsvPreviewRows(previewRows);
        setIsCsvPreviewOpen(true);
        showStatus(`${previewRows.length} 件のCSVをプレビューしています`);
      },
      error: () => {
        showStatus("CSVの読み込みに失敗しました");
      }
    });
  };

  const handleConfirmStockPhaseImport = async () => {
    const validRows = csvPreviewRows.filter(row => !row.error);
    if (validRows.length !== csvPreviewRows.length) {
      showStatus("CSVにエラーがあります。修正して再取込してください");
      return;
    }

    const grouped = groupStockPhasePreviewRows(validRows);

    const stockIds = Object.keys(grouped);
    const saveResults = await Promise.all(stockIds.map(stockId => saveStockPhases(stockId, grouped[stockId], { silent: true })));
    const successCount = saveResults.filter(Boolean).length;
    const savedStockIds = stockIds.filter((_, index) => saveResults[index]);
    setPhaseConfigs(prev => ({
      ...prev,
      ...Object.fromEntries(savedStockIds.map(stockId => [stockId, { phases: grouped[stockId] }]))
    }));
    removePhaseDrafts(savedStockIds);
    setCsvPreviewRows([]);
    setIsCsvPreviewOpen(false);
    showStatus(`${successCount}/${stockIds.length} 銘柄の価格フェーズをCSVから保存しました`);
  };

  const csvHasErrors = csvPreviewRows.some(row => row.error);
  const csvPreviewStockCount = new Set(csvPreviewRows.map(row => row.stockId).filter(Boolean)).size;

  const handleDeleteStock = async () => {
    if (!editTarget) return;
    const ok = await deleteStock(editTarget.id, editTarget.name);
    if (ok) setEditTarget(null);
  };

  const handleResetChanges = () => {
    setEditingData({});
    clearPhaseDrafts();
    showStatus("未保存の変更を元に戻しました");
  };

  const hasTargetChanges = Object.keys(editingData).length > 0;
  const hasPhaseChanges = stocks.some(stock => {
    if (!phaseDrafts[stock.id]) return false;
    return phaseDraftChanged(stock.id, phaseDrafts, phaseConfigs);
  });
  const hasChanges = hasTargetChanges || hasPhaseChanges;

  const getRuntimePhaseStatus = (stockId: string) => {
    if (globalPhase === "STOP") {
      return {
        label: "停止中",
        detail: "System Phase: STOP",
        className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      };
    }

    const runtime = priceRuntime[stockId];
    if (!runtime) {
      return {
        label: "待機中",
        detail: "runtimeなし",
        className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      };
    }

    if (runtime.mode === "SCENARIO") {
      return {
        label: "価格介入中",
        detail: `${runtime.endPrice} ptへ変動中`,
        className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      };
    }

    const phases = phaseConfigs[stockId]?.phases || DEFAULT_STOCK_PHASES;
    const activePhase = phases.find(phase => phase.id === runtime.phaseId);
    if (!activePhase) {
      return {
        label: runtime.phaseId || "フェーズ不明",
        detail: "設定に該当なし",
        className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
      };
    }

    return {
      label: activePhase.id,
      detail: `${DIRECTION_LABELS[activePhase.direction]} / ${activePhase.startMinute}-${activePhase.endMinute}分 / ${activePhase.changePercent}%`,
      direction: activePhase.direction,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
    };
  };

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full relative pb-32">
      <UnsavedBar
        hasChanges={hasChanges}
        onSave={handleSaveAllChanges}
        onReset={handleResetChanges}
        isSaving={isSavingChanges}
        message="マーケット制御に保存していない変更があります。"
        saveLabel="全変更を保存"
      />
      
      {/* 緊急事態発動モーダル */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-black flex items-center gap-2 ${emergencyType === "DOWN" ? "text-red-500" : "text-emerald-500"}`}>
                <AlertTriangle size={24}/> {emergencyType === "DOWN" ? "緊急暴落の実行" : "緊急急騰の実行"}
              </h3>
              <IconButton aria-label="緊急事態モーダルを閉じる" size="sm" onClick={() => setIsEmergencyModalOpen(false)} className="rounded-lg text-slate-400 hover:text-slate-600"><X /></IconButton>
            </div>
            <div className="space-y-4">
              <Input label="表示メッセージ" value={emergencyMsg} onChange={(e) => setEmergencyMsg(e.target.value)} />
              
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1"><Timer size={14}/> 遅延・猶予時間の設定 (秒)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "即時", overlay: 0, price: 0 },
                    { label: "演出5秒", overlay: 0, price: 5 },
                    { label: "10秒後", overlay: 10, price: 0 }
                  ].map(preset => (
                    <Button key={preset.label} variant="outline" size="sm" onClick={() => { setOverlayDelay(preset.overlay); setPriceDelay(preset.price); }} className="rounded-lg px-2 py-2 text-xs">
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300 w-32">① 演出開始まで:</span>
                  <Input type="number" value={overlayDelay.toString()} onChange={(e) => setOverlayDelay(Number(e.target.value))} className="font-mono text-center w-24" min="0" />
                </div>
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-300 w-32">② 価格変動まで<br/><span className="text-[10px] text-slate-400">(①の演出開始から)</span></span>
                  <Input type="number" value={priceDelay.toString()} onChange={(e) => setPriceDelay(Number(e.target.value))} className="font-mono text-center w-24" min="0" />
                </div>
              </div>

              <Button variant={emergencyType === "DOWN" ? "danger" : "success"} className="w-full py-4 text-lg" onClick={executeEmergency}>
                実行する
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 新規銘柄追加モーダル */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl w-full max-w-md shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black flex items-center gap-2">
                <Plus size={20}/> 新規銘柄の追加
              </h3>
              <IconButton aria-label="新規銘柄モーダルを閉じる" size="sm" onClick={() => setIsAddModalOpen(false)} className="rounded-lg text-slate-400 hover:text-slate-600"><X /></IconButton>
            </div>
            <div className="space-y-4">
              <Input label="銘柄ID (半角英数, 例: STOCK_A)" value={newStockId} onChange={(e) => setNewStockId(e.target.value)} />
              <Input label="企業名" value={newStockName} onChange={(e) => setNewStockName(e.target.value)} />
              <Input type="number" label="初期株価 (pt)" value={newStockPrice.toString()} onChange={(e) => setNewStockPrice(Number(e.target.value))} min="1" />
              <Button className="w-full py-4 text-lg" onClick={handleAddStock} disabled={!newStockId || !newStockName || newStockPrice <= 0}>追加する</Button>
            </div>
          </div>
        </div>
      )}

      {/* 銘柄編集・削除モーダル */}
      {editTarget && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black flex items-center gap-2">
                <Settings2 size={20}/> 銘柄の編集・設定
              </h3>
              <IconButton aria-label="銘柄編集モーダルを閉じる" size="sm" onClick={() => setEditTarget(null)} className="rounded-lg text-slate-400 hover:text-slate-600"><X /></IconButton>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 mb-1">銘柄ID (変更不可)</p>
                <p className="font-mono text-sm bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-600 dark:text-slate-300">{editTarget.id}</p>
              </div>
              <Input label="企業名" value={editStockName} onChange={(e) => setEditStockName(e.target.value)} />
              
              <div className="pt-4 flex flex-col gap-2">
                <Button className="w-full py-4 text-lg" onClick={handleEditStock} disabled={!editStockName}>変更を保存</Button>
                <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/30 dark:border-red-900/50" onClick={handleDeleteStock}>
                  <Trash2 size={16} className="mr-2"/> 上場廃止 (削除)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCsvPreviewOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl max-h-[88vh] overflow-hidden shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-emerald-500" /> フェーズCSVプレビュー
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  {csvPreviewRows.length} 行 / {csvPreviewStockCount} 銘柄
                  {csvHasErrors && <span className="ml-2 text-red-500">エラーあり</span>}
                </p>
              </div>
              <IconButton aria-label="CSVプレビューを閉じる" size="sm" onClick={() => setIsCsvPreviewOpen(false)} className="self-start sm:self-auto rounded-lg text-slate-400 hover:text-slate-600"><X /></IconButton>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-4 py-3 font-black">行</th>
                    <th className="px-4 py-3 font-black">銘柄ID</th>
                    <th className="px-4 py-3 font-black">フェーズID</th>
                    <th className="px-4 py-3 font-black text-right">開始</th>
                    <th className="px-4 py-3 font-black text-right">終了</th>
                    <th className="px-4 py-3 font-black">方向</th>
                    <th className="px-4 py-3 font-black text-right">変動率</th>
                    <th className="px-4 py-3 font-black">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {csvPreviewRows.map(row => (
                    <tr key={`${row.index}-${row.stockId}-${row.phaseId}`} className={row.error ? "bg-red-50/70 dark:bg-red-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                      <td className="px-4 py-3 font-mono text-slate-400">{row.index}</td>
                      <td className="px-4 py-3 font-mono font-black text-slate-700 dark:text-slate-200">{row.stockId || "-"}</td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">{row.phaseId}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.startMinute ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.endMinute ?? "-"}</td>
                      <td className="px-4 py-3 font-bold">{row.direction ? DIRECTION_LABELS[row.direction] : "-"}</td>
                      <td className="px-4 py-3 text-right font-mono">{row.changePercent !== null ? `${row.changePercent}%` : "-"}</td>
                      <td className={`px-4 py-3 font-bold ${row.error ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {row.error || "OK"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCsvPreviewOpen(false)}>キャンセル</Button>
              <Button onClick={handleConfirmStockPhaseImport} disabled={csvPreviewRows.length === 0 || csvHasErrors}>
                <Save size={16} className="mr-2" /> この内容で保存
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Zap className="text-yellow-500" /> 株価・マーケット制御
          </h2>
          <p className="text-slate-500 text-xs md:text-sm mt-1">市場全体の進行状態の切り替えと、目標株価・価格フェーズの保存を行います。</p>
          <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 mt-2">{statusMessage}</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="shrink-0 w-full sm:w-auto"><Plus size={18} className="mr-1"/> 新規銘柄上場</Button>
      </div>

      <Card className={`mb-8 border-2 transition-colors duration-500 ${globalPhase === "RUNNING" ? "border-blue-400 dark:border-blue-900/50" : isEmergencyActive ? (activeEmergencyType === "UP" ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.3)]" : "border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]") : "border-slate-300 dark:border-slate-800"}`}>
        <CardContent className="pt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
            <div className="flex items-center gap-6">
              <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shrink-0 ${globalPhase === "RUNNING" ? "bg-blue-100 text-blue-600 animate-pulse" : isEmergencyActive ? (activeEmergencyType === "UP" ? "bg-emerald-100 text-emerald-600 animate-bounce" : "bg-red-100 text-red-600 animate-bounce") : "bg-slate-100 text-slate-400"}`}>
                {globalPhase === "RUNNING" ? <Play size={40} fill="currentColor"/> : isEmergencyActive ? <AlertTriangle size={40}/> : <Square size={40} fill="currentColor"/>}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">System Phase</p>
                <h2 className={`text-4xl md:text-5xl font-black ${globalPhase === "RUNNING" ? "text-blue-600 dark:text-blue-400" : isEmergencyActive ? (activeEmergencyType === "UP" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400") : "text-slate-500"}`}>
                  {isEmergencyActive ? "EMERGENCY" : globalPhase}
                </h2>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 w-full md:w-auto">
               <Button variant={globalPhase === "STOP" ? "secondary" : "outline"} className="h-12 md:h-14 px-2 sm:px-4 text-xs sm:text-sm w-full md:w-auto" onClick={() => handleSetPhase("STOP")}>
                 <Square size={16} className="mr-1 sm:mr-2"/> STOP
               </Button>
               <Button variant={globalPhase === "RUNNING" ? "primary" : "outline"} className="h-12 md:h-14 px-2 sm:px-4 text-xs sm:text-sm w-full md:w-auto" onClick={() => handleSetPhase("RUNNING")}>
                 <Play size={16} className="mr-1 sm:mr-2"/> RUNNING
               </Button>
               
               {isEmergencyActive ? (
                 <Button variant="outline" className="h-12 md:h-14 px-2 sm:px-4 text-xs sm:text-sm w-full md:w-auto border-slate-300 text-slate-500 hover:bg-slate-100 col-span-2 md:col-span-1" onClick={async () => { await stopEmergency({ silent: true }); showStatus("緊急事態を解除しました"); }}>
                   緊急事態を解除
                 </Button>
               ) : (
                 <>
                   <Button variant="outline" className="h-12 md:h-14 px-2 sm:px-4 text-xs sm:text-sm w-full md:w-auto border-red-200 text-red-600 hover:bg-red-50" onClick={() => openEmergencyModal("DOWN")}>
                     <TrendingDown size={16} className="mr-1 sm:mr-2"/> 緊急暴落
                   </Button>
                   <Button variant="outline" className="h-12 md:h-14 px-2 sm:px-4 text-xs sm:text-sm w-full md:w-auto border-emerald-200 text-emerald-600 hover:bg-emerald-50" onClick={() => openEmergencyModal("UP")}>
                     <TrendingUp size={16} className="mr-1 sm:mr-2"/> 緊急急騰
                   </Button>
                 </>
               )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col sm:flex-row sm:justify-end gap-2">
        <Button variant="outline" onClick={handleExportStockPhases} disabled={stocks.length === 0}>
          <Download size={18} className="mr-2"/> フェーズCSV出力
        </Button>
        <FileButton accept=".csv,text/csv" onChange={handleImportStockPhases} variant="outline" className="w-full sm:w-auto">
          <Upload size={18} className="mr-2"/> フェーズCSV取込
        </FileButton>
        <Button variant="primary" onClick={handleSaveAllChanges} disabled={stocks.length === 0}>
          <Save size={18} className="mr-2"/> 全変更を保存
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] text-slate-500 dark:text-slate-400">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 font-black">銘柄</th>
                <th className="px-4 py-3 font-black text-right">現在価格</th>
                <th className="px-4 py-3 font-black text-right">目標価格</th>
                <th className="px-4 py-3 font-black text-right">遅延</th>
                <th className="px-4 py-3 font-black">現在フェーズ</th>
                <th className="px-4 py-3 font-black text-center">フェーズ</th>
                <th className="px-4 py-3 font-black text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {stocks.map(stock => {
                const targetVal = editingData[stock.id]?.price ?? stock.targetPrice ?? stock.currentPrice;
                const delayVal = editingData[stock.id]?.delay ?? 0;
                const phases = getPhaseDraft(stock.id);
                const isExpanded = expandedPhaseStockId === stock.id;
                const phaseStatus = getRuntimePhaseStatus(stock.id);
                return (
                  <Fragment key={stock.id}>
                    <tr key={stock.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <IconButton aria-label={`${stock.name}の価格フェーズを${isExpanded ? "閉じる" : "開く"}`} size="sm" variant="outline" onClick={() => openPhaseEditor(stock.id)} className="rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-200 dark:hover:border-blue-800">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </IconButton>
                          <div>
                            <p className="font-black text-slate-800 dark:text-white">{stock.name}</p>
                            <p className="font-mono text-[11px] font-bold text-slate-400">{stock.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-700 dark:text-slate-200">{stock.currentPrice} pt</td>
                      <td className="px-4 py-3">
                        <input type="number" value={targetVal.toString()} onChange={(e) => handleDataChange(stock.id, "price", e.target.value)} className="ml-auto block h-10 w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-right font-mono font-black text-blue-600 dark:text-blue-400 outline-none focus:border-blue-400" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min="0" value={delayVal.toString()} onChange={(e) => handleDataChange(stock.id, "delay", e.target.value)} className="ml-auto block h-10 w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-right font-mono font-black text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex max-w-[180px] items-center rounded-lg px-2.5 py-1 text-xs font-black ${phaseStatus.className}`}>
                            <span className="truncate">{phaseStatus.label}</span>
                          </span>
                          <span className={`max-w-[220px] truncate text-[11px] font-bold ${phaseStatus.direction ? DIRECTION_TEXT_COLORS[phaseStatus.direction] : "text-slate-400"}`}>
                            {phaseStatus.detail}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button variant="soft" size="sm" onClick={() => openPhaseEditor(stock.id)} className="rounded-lg px-3 py-1.5 text-xs hover:text-blue-600">
                          {phases.length} 件
                        </Button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <IconButton aria-label={`${stock.name}を編集`} size="sm" onClick={() => openEditModal(stock)} className="rounded-lg text-slate-400 hover:text-blue-500">
                            <Settings2 size={16} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${stock.id}-phases`} className="bg-slate-50/70 dark:bg-slate-950/40">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                              <p className="text-xs font-black text-slate-500">毎時価格フェーズ</p>
                              <Button size="xs" variant="ghost" onClick={() => addPhase(stock.id)} className="text-blue-600 hover:text-blue-500">+ 追加</Button>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[720px] text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                                  <tr className="border-b border-slate-100 dark:border-slate-800">
                                    <th className="px-3 py-2 text-left font-black">開始分</th>
                                    <th className="px-3 py-2 text-left font-black">終了分</th>
                                    <th className="px-3 py-2 text-left font-black">方向</th>
                                    <th className="px-3 py-2 text-left font-black">合計%</th>
                                    <th className="px-3 py-2 text-right font-black">削除</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {phases.map((phase, index) => (
                                    <tr key={phase.id || index}>
                                      <td className="px-3 py-2">
                                        <input type="number" min="0" max="60" value={phase.startMinute} onChange={e => updatePhase(stock.id, index, "startMinute", e.target.value)} className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min="0" max="60" value={phase.endMinute} onChange={e => updatePhase(stock.id, index, "endMinute", e.target.value)} className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <Select value={phase.direction} onChange={e => updatePhase(stock.id, index, "direction", e.target.value)} className="w-28 rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5 font-bold text-slate-700 dark:text-slate-200">
                                          <option value="UP">上昇</option>
                                          <option value="DOWN">下落</option>
                                          <option value="FLAT">横ばい</option>
                                        </Select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" min="0" value={phase.changePercent} onChange={e => updatePhase(stock.id, index, "changePercent", e.target.value)} className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-200 outline-none focus:border-blue-400" />
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <IconButton aria-label="価格フェーズを削除" size="sm" onClick={() => removePhase(stock.id, index)} className="rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 size={14} /></IconButton>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
