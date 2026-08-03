// =================================================================
// File: src/components/admin/scenario/AutoPilotSettings.tsx
// =================================================================

import { Zap } from "lucide-react";
import Button from "../../ui/Button";
import { Card, CardContent } from "../../ui/Card";

interface AutoPilotSettingsProps {
    loopEnabled: boolean;
    loopInterval: number;
    loopRepeatDelayMinutes: number;
    onToggle: () => void;
    onUpdateInterval: (val: number) => void;
    onUpdateRepeatDelay: (val: number) => void;
}

export default function AutoPilotSettings({
    loopEnabled,
    loopInterval,
    loopRepeatDelayMinutes,
    onToggle,
    onUpdateInterval,
    onUpdateRepeatDelay
}: AutoPilotSettingsProps) {
    return (
        <Card className={`border-2 transition-all duration-300 shrink-0 ${loopEnabled ? "border-emerald-500 shadow-[0_4px_20px_rgba(16,185,129,0.15)]" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="bg-slate-50/50 dark:bg-slate-800/20 p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-base font-black flex items-center gap-2 text-slate-800 dark:text-white">
                        <Zap size={20} className={loopEnabled ? "text-emerald-500 animate-pulse" : "text-slate-400"} />
                        オートパイロット (自動ループ周回)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">タイムラインに並んだ全イベントを実行し終えた後、最初に戻って再走行します。</p>
                </div>
                <Button
                    variant={loopEnabled ? "outline" : "primary"}
                    className={`w-full sm:w-36 font-black ${loopEnabled ? "border-red-500 text-red-500 hover:bg-red-50" : "bg-emerald-600 hover:bg-emerald-500"}`}
                    onClick={onToggle}
                >
                    {loopEnabled ? "ループを停止する" : "ループを有効化"}
                </Button>
            </div>

            <CardContent className="p-5 space-y-4 bg-slate-50/20 dark:bg-slate-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black text-slate-600 dark:text-slate-400">周回間隔 (1〜60分):</span>
                        <input
                            type="number"
                            value={loopInterval}
                            onChange={e => onUpdateInterval(Number(e.target.value))}
                            className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-center text-sm font-bold font-mono outline-hidden"
                            min="1"
                            max="60"
                        />
                        <span className="text-xs font-bold text-slate-400">分</span>
                    </div>

                    <input
                        type="range"
                        min="1"
                        max="60"
                        value={loopInterval}
                        onChange={e => onUpdateInterval(Number(e.target.value))}
                        className="flex-1 w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                </div>

                <div className="flex items-center gap-3 shrink-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-2.5 rounded-xl shadow-xs">
                    <span className="text-xs font-black text-slate-500">周回リピート待機:</span>
                    <input
                        type="number"
                        value={loopRepeatDelayMinutes}
                        onChange={e => onUpdateRepeatDelay(Number(e.target.value))}
                        className="w-12 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded p-1 text-xs text-center font-bold"
                        min="1"
                    />
                    <span className="text-xs font-bold text-slate-500">分後に最初に戻る</span>
                </div>
            </CardContent>
        </Card>
    );
}
