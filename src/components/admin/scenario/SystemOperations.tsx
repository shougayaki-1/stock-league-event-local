// =================================================================
// File: src/components/admin/scenario/SystemOperations.tsx
// =================================================================

import { useState } from "react";
import { AlertTriangle, Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "../../ui/Card";
import Button from "../../ui/Button";
import { useDialog } from "../../../contexts/DialogContext";

interface SystemOperationsProps {
    onResetAllPending: () => Promise<void>;
    onClearAllEvents: () => Promise<void>;
}

export default function SystemOperations({
    onResetAllPending,
    onClearAllEvents
}: SystemOperationsProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { prompt } = useDialog();

    const handleResetClick = async () => {
        const word = await prompt({
            title: "一括未実行リセット",
            message: "自動ループを停止し、全イベントを開始前の状態に戻し、配信済みニュースと自動生成イベントをすべて削除します。\n実行するには「RESET」と入力してください。",
            variant: "danger",
            placeholder: "RESET"
        });
        if (word === "RESET") {
            await onResetAllPending();
        }
    };

    const handleClearClick = async () => {
        const word = await prompt({
            title: "シナリオタイムライン全削除",
            message: "タイムスケジュールに登録されている予約データをすべて完全に消去します。\n実行するには「DELETE」と入力してください。",
            variant: "danger",
            placeholder: "DELETE"
        });
        if (word === "DELETE") {
            await onClearAllEvents();
        }
    };

    return (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10 overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-5 text-left outline-hidden"
            >
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                    <AlertTriangle size={20} />
                    <h3 className="text-base font-black">危険なシステム管理操作（誤操作注意）</h3>
                </div>
                <span className="text-red-500">
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </span>
            </button>

            {isOpen && (
                <CardContent className="pt-0 border-t border-red-100 dark:border-red-950 p-5 space-y-4 animate-in slide-in-from-top-4 duration-200">
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 leading-relaxed font-bold">
                        ※これらの操作はタイムスケジュールに直接破壊的な変更を加えます。
                        本番フェーズが稼働している間は、操作に十分に注意してください。
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100 dark:border-red-950">
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm mb-1">タイムスケジュールの一括未処理リセット</h4>
                            <p className="text-[10px] text-slate-500 mb-3">自動ループを停止し、手動イベントを開始前に戻し、配信済みニュースと自動生成イベントを削除します。</p>
                            <Button variant="danger" size="sm" className="w-full bg-red-600 text-xs py-2" onClick={handleResetClick}>
                                <RotateCcw size={14} className="mr-1" /> 一括未実行へ戻す
                            </Button>
                        </div>

                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100 dark:border-red-950">
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm mb-1">すべての予約イベントの完全消去</h4>
                            <p className="text-[10px] text-slate-500 mb-3">現在タイムラインに並んでいる全ての予約イベント・シナリオデータを物理削除します。</p>
                            <Button variant="danger" size="sm" className="w-full bg-red-700 text-xs py-2" onClick={handleClearClick}>
                                <Trash2 size={14} className="mr-1" /> 予約イベントを全消去
                            </Button>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
