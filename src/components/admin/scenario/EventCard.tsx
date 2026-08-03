// =================================================================
// File: src/components/admin/scenario/EventCard.tsx
// =================================================================

import React from "react";
import { CheckCircle, Clock, Copy, Edit2, Ghost, MapPin, Newspaper, RotateCcw, Trash2, TrendingUp, Tv, Zap } from "lucide-react";
import Badge from "../../ui/Badge";
import type { Stock } from "../../../types/domain";
import { getPostNews, getPublicNews, type ScenarioEvent } from "../../../types/scenario";
import type { NewsPreset } from "../../../types/newsPreset";
import AdminActionMenu from "../AdminActionMenu";

interface EventCardProps {
    event: ScenarioEvent;
    index: number;
    isNext: boolean;
    isPinned: boolean;
    isSelected: boolean;
    currentTime: Date;
    stocks: Stock[];
    videoNameById?: Record<string, string>;
    signageNameById?: Record<string, string>;
    newsPresetById?: Map<string, NewsPreset>;
    unstartedBaseTime: Date;
    onSetStartPin: (id: string) => void;
    onForceTrigger: (event: ScenarioEvent, e: React.MouseEvent) => void;
    onResetToPending: (event: ScenarioEvent, e: React.MouseEvent) => void;
    onToggleSelected: (event: ScenarioEvent, checked: boolean) => void;
    onCopy: (event: ScenarioEvent) => void;
    onUpdateOffset: (event: ScenarioEvent, nextOffsetSeconds: number) => void;
    onOpenEdit: (event: ScenarioEvent) => void;
    onDelete: (id: string) => void;
}

export default function EventCard({
    event,
    isNext,
    isPinned,
    isSelected,
    currentTime,
    stocks,
    videoNameById = {},
    signageNameById = {},
    newsPresetById = new Map(),
    unstartedBaseTime,
    onSetStartPin,
    onForceTrigger,
    onResetToPending,
    onToggleSelected,
    onCopy,
    onUpdateOffset,
    onOpenEdit,
    onDelete
}: EventCardProps) {
    const isPast = event.isProcessed || (event.time && event.time.toMillis() <= currentTime.getTime());

    const offsetM = Math.floor(event.offsetSeconds / 60).toString().padStart(2, "0");
    const offsetS = (event.offsetSeconds % 60).toString().padStart(2, "0");

    const absoluteTimeStr = event.time
        ? event.time.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : new Date(unstartedBaseTime.getTime() + event.offsetSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + " (予)";

    const diffSec = event.time ? Math.max(0, Math.floor((event.time.toMillis() - currentTime.getTime()) / 1000)) : 0;
    const countM = Math.floor(diffSec / 60).toString().padStart(2, "0");
    const countS = (diffSec % 60).toString().padStart(2, "0");
    const priceSummary = event.priceChanges?.flatMap(change => {
        const stockName = stocks.find(stock => stock.id === change.stockId)?.name || change.stockId;
        return change.branches.slice(0, 2).map(branch => {
            const label = branch.label ? `${branch.label}: ` : "";
            const percent = typeof branch.changePercent === "number" ? branch.changePercent : null;
            const deadline = branch.deadlineMinutes ?? 5;
            if (percent !== null) return `${stockName} ${label}${branch.probability}% -> ${percent > 0 ? "+" : ""}${percent}%/${deadline}分`;
            if (typeof branch.targetPrice === "number") return `${stockName} ${label}${branch.probability}% -> ${branch.targetPrice}pt`;
            return null;
        });
    }).filter(Boolean).join(" / ");
    const selectedBranchSummary = event.selectedBranches?.map(selected => {
        const stockName = stocks.find(stock => stock.id === selected.stockId)?.name || selected.stockId;
        const branch = event.priceChanges?.[selected.priceChangeIndex]?.branches?.[selected.branchIndex];
        return `${stockName}: ${selected.branchLabel || branch?.label || `結果${selected.branchIndex + 1}`}`;
    }).join(" / ");
    const publicPreset = event.publicNewsPresetId ? newsPresetById.get(event.publicNewsPresetId) : null;
    const presetDisplay = publicPreset?.signageDisplay;
    const signageSummary = presetDisplay
        ? `${presetDisplay.kind === "AD" ? "広告" : "サイネージ"}: ${signageNameById[event.signageTargetId || event.signageAction?.signageId || ""] || event.signageTargetId || event.signageAction?.signageId || "送出先未設定"} / ${presetDisplay.mode}${presetDisplay.videoAssetId ? ` / ${videoNameById[presetDisplay.videoAssetId] || presetDisplay.videoAssetId}` : ""}`
        : event.signageAction
        ? `${event.signageAction.kind === "AD" ? "広告" : "サイネージ"}: ${signageNameById[event.signageAction.signageId] || event.signageAction.signageId} / ${event.signageAction.mode}${event.signageAction.videoAssetId ? ` / ${videoNameById[event.signageAction.videoAssetId] || event.signageAction.videoAssetId}` : ""}`
        : "";
    const breakingVideoId = publicPreset?.breakingVideoId || event.breakingVideoId;
    const breakingSummary = breakingVideoId ? `速報動画: ${videoNameById[breakingVideoId] || breakingVideoId}` : "";
    const publicNews = getPublicNews(event, newsPresetById);
    const postNews = getPostNews(event, newsPresetById);

    const handleEditOffset = (e: React.MouseEvent) => {
        e.stopPropagation();
        const current = `${offsetM}:${offsetS}`;
        const input = window.prompt("予約時間を 分:秒 で入力してください", current);
        if (!input) return;
        const match = input.trim().match(/^(\d+)(?::(\d{1,2}))?$/);
        if (!match) return;
        const minutes = Number(match[1]);
        const seconds = Number(match[2] || 0);
        if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds < 0 || seconds > 59) return;
        onUpdateOffset(event, minutes * 60 + seconds);
    };

    return (
        <div className="@container flex items-stretch gap-3 @xl:gap-5 group transition-all duration-300 min-w-0 max-w-full">

            {/* 相対経過時間・推測時間 */}
            <div className="w-18 @xl:w-24 shrink-0 hidden @xl:flex flex-col justify-center items-end font-mono select-none">
                <div className="text-xs font-black text-purple-600 dark:text-purple-400">+{offsetM}:{offsetS}</div>
                <div className="text-[10px] font-bold text-slate-400 mt-0.5 max-w-full truncate">{absoluteTimeStr}</div>
            </div>

            {/* タイムラインの結合ドット */}
            <div className="relative shrink-0 items-center justify-center hidden @xl:flex w-6">
                <div className={`w-3 h-3 rounded-full border-2 z-10 transition-all ${isPinned
                        ? "bg-purple-500 border-purple-300 scale-125 shadow-[0_0_8px_#a855f7]"
                        : isNext
                            ? "bg-rose-500 border-rose-300 scale-125 shadow-[0_0_8px_#f43f5e]"
                            : isPast
                                ? "bg-emerald-500 border-emerald-300"
                                : "bg-white border-purple-300 dark:bg-slate-900"
                    }`} />
            </div>

            {/* メインカード本体 */}
            <div
                onClick={() => onOpenEdit(event)}
                className={`flex-1 min-w-0 max-w-full p-3 @md:p-4 border rounded-2xl cursor-pointer hover:scale-[1.005] @xl:hover:scale-[1.01] transition-all flex flex-col @xl:flex-row @xl:items-center justify-between gap-3 @xl:gap-4 bg-white dark:bg-slate-900 ${isPinned
                        ? "border-purple-500 bg-purple-500/5 shadow-[0_4px_15px_rgba(168,85,247,0.1)]"
                        : isSelected
                            ? "border-sky-400 bg-sky-50/60 shadow-[0_4px_18px_rgba(14,165,233,0.12)] dark:border-sky-700 dark:bg-sky-950/20"
                        : isNext
                            ? "border-rose-400 dark:border-rose-900 shadow-[0_4px_20px_rgba(244,63,94,0.1)]"
                            : isPast
                                ? "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 opacity-55 hover:opacity-100"
                                : "border-slate-100 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800"
                    }`}
            >
                <div className="min-w-0 max-w-full flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 mb-2 min-w-0">
                        <span className="inline-flex @xl:hidden items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-black font-mono text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                            <Clock size={10} /> +{offsetM}:{offsetS}
                        </span>
                        <span className="inline-flex @xl:hidden items-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold font-mono text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {absoluteTimeStr}
                        </span>
                        {isPast && (
                            <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle size={10} /> 実行完了
                            </span>
                        )}
                        {publicNews && <Badge variant="success" className="inline-flex items-center gap-1"><Newspaper size={10} /> 表</Badge>}
                        {postNews && <Badge variant="danger" className="inline-flex items-center gap-1"><Newspaper size={10} /> 事後</Badge>}
                        {event.priceChanges && <Badge variant="info" className="inline-flex items-center gap-1"><TrendingUp size={10} /> 株価</Badge>}
                        {breakingVideoId && <Badge variant="warning" className="inline-flex items-center gap-1"><Tv size={10} /> 動画</Badge>}
                        {(presetDisplay || event.signageAction) && <Badge variant="info" className="inline-flex items-center gap-1"><Tv size={10} /> サイネージ</Badge>}
                        {!publicNews && !postNews && !event.priceChanges?.length && !breakingVideoId && !presetDisplay && !event.signageAction && <Badge variant="default" className="inline-flex items-center gap-1"><Ghost size={10} /> サイレント</Badge>}
                        {isPinned && <Badge variant="warning" className="inline-flex items-center gap-1"><MapPin size={10} /> 起点</Badge>}
                        {!isPast && event.time && (
                            <span className="text-[9px] font-mono font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                                -{countM}:{countS}
                            </span>
                        )}
                    </div>
                    <h4 className="text-sm @lg:text-[15px] font-black text-slate-800 dark:text-slate-100 line-clamp-2 max-w-full leading-snug">
                        {publicNews?.title || postNews?.title || signageSummary || breakingSummary || "（隠れイベント）"}
                    </h4>
                    {publicNews?.body && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 max-w-full leading-relaxed">{publicNews.body}</p>
                    )}
                    {priceSummary && (
                        <p className="text-[10px] font-mono font-bold text-blue-500 line-clamp-2 mt-1 max-w-full break-words">{priceSummary}</p>
                    )}
                    {selectedBranchSummary && (
                        <p className="text-[10px] font-bold text-fuchsia-600 line-clamp-2 mt-1 max-w-full break-words">抽選結果: {selectedBranchSummary}</p>
                    )}
                    {breakingSummary && !publicNews?.title && !postNews?.title && (
                        <p className="text-[10px] font-mono font-bold text-amber-500 line-clamp-2 mt-1 max-w-full break-words">{breakingSummary}</p>
                    )}
                    {signageSummary && (
                        <p className="text-[10px] font-mono font-bold text-purple-500 line-clamp-2 mt-1 max-w-full break-words">{signageSummary}</p>
                    )}
                </div>

                {/* コントロールボタン群 */}
                <div className="flex flex-wrap items-center justify-end @max-lg:justify-start gap-2 shrink-0 self-stretch @xl:self-auto max-w-full border-t border-outline-variant pt-3 @xl:border-t-0 @xl:pt-0" onClick={e => e.stopPropagation()}>
                    <label
                        className={`h-11 min-w-11 px-2 rounded-lg border text-[10px] font-black inline-flex items-center justify-center gap-1 transition cursor-pointer active:scale-95 ${
                            isSelected
                                ? "bg-info-container border-info/30 text-on-info-container"
                                : "bg-surface-container border-outline-variant text-on-surface-variant hover:text-info"
                        }`}
                        title="一括操作対象に選択"
                    >
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => onToggleSelected(event, e.target.checked)}
                            className="h-3.5 w-3.5 accent-sky-600"
                        />
                    </label>

                    <button
                        type="button"
                        onClick={() => onOpenEdit(event)}
                        className="h-11 min-w-11 px-3 inline-flex items-center justify-center gap-1.5 bg-primary text-on-primary rounded-lg transition hover:brightness-105"
                        title="このイベント設定を編集"
                    >
                        <Edit2 size={14} />
                        <span className="hidden @md:inline text-[10px] font-black">編集</span>
                    </button>

                    <AdminActionMenu
                        items={[
                            { label: "このイベントをコピー", icon: <Copy size={14} />, tone: "info", onSelect: () => onCopy(event) },
                            { label: "予約時間を変更", icon: <Clock size={14} />, onSelect: () => handleEditOffset({ stopPropagation: () => undefined } as React.MouseEvent) },
                            { label: isPinned ? "開始地点に設定済み" : "ここを開始地点に設定", icon: <MapPin size={14} fill={isPinned ? "currentColor" : "none"} />, tone: "warning", onSelect: () => onSetStartPin(event.id) },
                            ...(isPast ? [{ label: "未処理に戻す", icon: <RotateCcw size={14} />, tone: "warning" as const, onSelect: () => onResetToPending(event, { stopPropagation: () => undefined } as React.MouseEvent) }] : []),
                            ...(!isPast && event.time ? [{ label: "今すぐ発動", icon: <Zap size={14} />, tone: "warning" as const, onSelect: () => onForceTrigger(event, { stopPropagation: () => undefined } as React.MouseEvent) }] : []),
                            { label: "削除", icon: <Trash2 size={14} />, tone: "danger", onSelect: () => onDelete(event.id) },
                        ]}
                    />
                </div>

            </div>
        </div>
    );
}
