// src/components/admin/system/PrizeSettingsCard.tsx

import React from "react";
import { Gift, Save, Plus, Trash2 } from "lucide-react";
import Button from "../../ui/Button";
import Input from "../../ui/Input";
import type { PrizeGrade } from "../../../types/domain";
import { toExactString } from "../../../lib/exactNumber";

interface PrizeSettingsCardProps {
    editingPrizes: PrizeGrade[];
    setEditingPrizes: React.Dispatch<React.SetStateAction<PrizeGrade[]>>;
    onSave: () => void;
    hasChanges: boolean;
}

export default function PrizeSettingsCard({
    editingPrizes,
    setEditingPrizes,
    onSave,
    hasChanges
}: PrizeSettingsCardProps) {
    return (
        <div className="bg-white dark:bg-slate-900 p-4 md:p-8 rounded-[24px] md:rounded-[32px] shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b dark:border-slate-800 pb-4">
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Gift className="text-pink-500" /> 景品グレード設定
                    </h2>
                    <p className="text-slate-500 text-xs mt-1">利益確定時に表示される景品を設定します。ポイントが高い順に判定されます。</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 self-stretch sm:self-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPrizes([...editingPrizes, { id: "新設", threshold: 0, desc: "" }])}
                        className="w-full sm:w-auto"
                    >
                        <Plus size={16} className="mr-1" /> 賞を追加
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={!hasChanges}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-lg"
                    >
                        <Save size={18} /> 設定を保存
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {editingPrizes.map((prize, index) => (
                    <div key={`${prize.id}-${index}`} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 relative group">
                        <button
                            onClick={() => setEditingPrizes(editingPrizes.filter((_, i) => i !== index))}
                            className="absolute top-3 right-3 text-slate-400 hover:text-red-500 active:text-red-500 opacity-70 hover:opacity-100 active:opacity-100 transition"
                        >
                            <Trash2 size={16} />
                        </button>
                        <div className="space-y-3">
                            <Input
                                label="賞の名前"
                                value={prize.id}
                                onChange={(e) => { const newP = editingPrizes.map((p, i) => i === index ? { ...p, id: e.target.value } : p); setEditingPrizes(newP); }}
                            />
                            <Input
                                label="必要ポイント (閾値)"
                                type="number"
                                value={toExactString(prize.threshold)}
                                onChange={(e) => { const newP = editingPrizes.map((p, i) => i === index ? { ...p, threshold: e.target.value } : p); setEditingPrizes(newP); }}
                            />
                            <Input
                                label="景品内容"
                                value={prize.desc}
                                onChange={(e) => { const newP = editingPrizes.map((p, i) => i === index ? { ...p, desc: e.target.value } : p); setEditingPrizes(newP); }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
