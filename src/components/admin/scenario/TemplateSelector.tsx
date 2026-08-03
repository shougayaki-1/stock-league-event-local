// =================================================================
// File: src/components/admin/scenario/TemplateSelector.tsx
// =================================================================

import React, { useState, useEffect } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { collection, onSnapshot, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useDialog } from "../../../contexts/DialogContext";
import type { Stock } from "../../../types/domain";
import type { CustomTemplate } from "../../../types/scenario";

interface TemplateSelectorProps {
  stocks: Stock[];
  onSelect: (template: CustomTemplate, targetStock: Stock) => void;
}

const SYSTEM_PRESETS: CustomTemplate[] = [
  {
    id: "good_news",
    name: "[好材料] 新製品発表",
    publicTitle: "{企業名}が新商品を発表、話題沸騰！",
    publicBody: "{企業名}は本日、業界をリードする画期的な新商品を発表しました。市場からは非常に大きな期待が寄せられています。",
    insiderTitle: "【極秘】新商品の先行受注がパンク状態",
    insiderBody: "{企業名}の新商品はすでに想定の5倍を超える初期注文を獲得しており、次期の純利益は2倍以上に跳ね上がることが確実視されています。",
    targetMultiplier: 1.5,
  },
  {
    id: "bad_news",
    name: "[悪材料] 検査データ偽装疑惑",
    publicTitle: "{企業名}、製品検査データに一部不整合か",
    publicBody: "{企業名}の出荷製品において、検査データの一部に疑義が生じているとの報道がありました。同社は現在、事実関係を緊急調査中です。",
    insiderTitle: "【極秘】データ偽装は経営陣ぐるみの隠蔽",
    insiderBody: "データ改ざんは過去3年間にわたり常態化しており、まもなく公的機関による家宅捜索が入る見込みです。株価の大暴落は不可避です。",
    targetMultiplier: 0.3,
  }
];

export default function TemplateSelector({ stocks, onSelect }: TemplateSelectorProps) {
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [targetStockId, setTargetStockId] = useState("");

  const { confirm, alert } = useDialog();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "templates"), (snap) => {
      setCustomTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomTemplate)));
    });
    return () => unsub();
  }, []);

  const handleApply = () => {
    const template = SYSTEM_PRESETS.find(t => t.id === selectedId) || customTemplates.find(t => t.id === selectedId);
    const stock = stocks.find(s => s.id === targetStockId);
    if (!template || !stock) return;

    onSelect(template, stock);

    // 選択をクリア
    setSelectedId("");
    setTargetStockId("");
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isOk = await confirm({
      title: "ひな形の削除",
      message: `ひな形「${name}」を削除してよろしいですか？`,
      variant: "danger"
    });
    if (isOk) {
      try {
        await deleteDoc(doc(db, "templates", id));
        setSelectedId("");
      } catch {
        await alert({ title: "エラー", message: "削除に失敗しました。", variant: "danger" });
      }
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/50 space-y-4 shadow-xs">
      <p className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
        <Sparkles size={16} /> 1ステップ・ひな形ストーリーのロード
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-hidden"
          >
            <option value="">ストーリーひな形を選択...</option>
            <optgroup label="システム標準">
              {SYSTEM_PRESETS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </optgroup>
            {customTemplates.length > 0 && (
              <optgroup label="登録されたひな形">
                {customTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
          {selectedId && !SYSTEM_PRESETS.some(t => t.id === selectedId) && (
            <button
              type="button"
              onClick={(e) => handleDelete(selectedId, customTemplates.find(ct => ct.id === selectedId)?.name || "", e)}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-[10px] font-bold"
              title="削除"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        <select
          value={targetStockId}
          onChange={(e) => setTargetStockId(e.target.value)}
          disabled={!selectedId}
          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 outline-hidden disabled:opacity-50"
        >
          <option value="">対象企業を決定...</option>
          {stocks.map(s => <option key={s.id} value={s.id}>{s.name} (現在: {s.currentPrice}pt)</option>)}
        </select>

        <button
          type="button"
          onClick={handleApply}
          disabled={!selectedId || !targetStockId}
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 text-xs font-bold rounded-xl transition disabled:opacity-50 shrink-0"
        >
          適用
        </button>
      </div>
    </div>
  );
}
