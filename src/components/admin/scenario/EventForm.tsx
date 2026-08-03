// File: src/components/admin/scenario/EventForm.tsx
import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Clock, Plus, Zap, Tv, Trash2, Dices, Target, Percent, Sparkles, AlertTriangle, Cloud, Wrench, Newspaper, TrendingUp } from "lucide-react";
import Button from "../../ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "../../ui/Card";
import IconButton from "../../ui/IconButton";
import Input from "../../ui/Input";
import Select from "../../ui/Select";
import type { Stock } from "../../../types/domain";
import type { PriceChangeTarget, PriceChangeBranch } from "../../../types/domain";
import { getPostNews, type ScenarioEvent } from "../../../types/scenario";
import { formatVideoBytes, getOptimizedStatusLabel, getPreferredVideoAsset, type CloudVideoAsset } from "../../../lib/cloudVideos";
import type { VideoLibraryItem } from "../../../types/videoLibrary";
import { PUBLIC_SIGNAGE_PRESETS } from "../../../lib/signagePresets";
import VideoPreviewModal, { VideoAssetActions } from "../video/VideoPreviewModal";
import { subscribeScenarioVideoLibrary } from "../../../services/scenarioService";
import type { ScheduleSession } from "../../../types/schedule";
import type { NewsPreset } from "../../../types/newsPreset";

const compactInputClass = "h-11 rounded-lg px-3 py-2 text-sm";
const compactSelectClass = "h-11 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:bg-slate-950 dark:text-slate-300";
type NumericBranchField = "probability" | "changePercent" | "deadlineMinutes" | "targetPrice" | "fluctuationPercent";
type OptionalPart = "postNews" | "price" | "signage";

interface Props {
    stocks: Stock[];
    publicSignages: Array<{ id: string; name: string; location?: string }>;
    newsPresets: NewsPreset[];
    newsPresetById: Map<string, NewsPreset>;
    sessions: ScheduleSession[];
    selectedSessionId: string;
    editingEvent?: ScenarioEvent | null;
    onSessionChange: (sessionId: string) => void;
    onScheduleRelative: (offsetSeconds: number, priceChanges: PriceChangeTarget[], publicNewsPresetId: string | null, postNewsPresetId: string | null, postNewsDelaySeconds: number | null, insiderNewsPresetId: string | null, signageTargetId: string | null, sessionId: string) => void;
    onPublishNow: (priceChanges: PriceChangeTarget[], publicNewsPresetId: string | null, postNewsPresetId: string | null, postNewsDelaySeconds: number | null, insiderNewsPresetId: string | null, signageTargetId: string | null) => void;
    onCancelEdit?: () => void;
}

function NewsPresetSelect({
    label,
    value,
    presets,
    presetsById,
    onChange,
    toneClassName = "border-slate-200",
}: {
    label: string;
    value: string;
    presets: NewsPreset[];
    presetsById: Map<string, NewsPreset>;
    onChange: (id: string) => void;
    toneClassName?: string;
}) {
    const preset = value ? presetsById.get(value) : null;
    return (
        <div className="space-y-2">
            <label className="text-xs font-black text-slate-500 block">{label}</label>
            <Select value={value} onChange={e => onChange(e.target.value)} className={`${compactSelectClass} ${toneClassName}`}>
                <option value="">なし</option>
                {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </Select>
            {preset && (
                <div className="rounded-lg border border-outline-variant bg-white p-3 text-xs dark:bg-slate-950">
                    <p className="font-black text-on-surface">{preset.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-on-surface-variant">{preset.body}</p>
                </div>
            )}
        </div>
    );
}

export default function EventForm({ stocks, publicSignages, newsPresets, newsPresetById, sessions, selectedSessionId, editingEvent, onSessionChange, onScheduleRelative, onPublishNow, onCancelEdit }: Props) {
    const isEditingExistingEvent = Boolean(editingEvent?.id);
    const initialOffset = editingEvent?.offsetSeconds ?? 300;
    const [offsetMinutes, setOffsetMinutes] = useState(() => Math.floor(initialOffset / 60));
    const [offsetSecondsVal, setOffsetSecondsVal] = useState(() => initialOffset % 60);

    const [priceChanges, setPriceChanges] = useState<PriceChangeTarget[]>(() => editingEvent?.priceChanges ?? []);
    const [publicNewsPresetId, setPublicNewsPresetId] = useState(() => editingEvent?.publicNewsPresetId || "");
    const [postNewsPresetId, setPostNewsPresetId] = useState(() => editingEvent?.postNewsPresetId || "");
    const [postNewsDelaySeconds, setPostNewsDelaySeconds] = useState(() => editingEvent?.postNewsDelaySeconds ?? 0);
    const [insiderNewsPresetId, setInsiderNewsPresetId] = useState(() => editingEvent?.insiderNewsPresetId || "");
    const [signageEnabled, setSignageEnabled] = useState(() => Boolean(editingEvent?.signageTargetId || editingEvent?.signageAction?.signageId));
    const [signageTargetId, setSignageTargetId] = useState(() => editingEvent?.signageTargetId || editingEvent?.signageAction?.signageId || "");

    const [expandedParts, setExpandedParts] = useState<Record<OptionalPart, boolean>>(() => ({
        postNews: Boolean(editingEvent && getPostNews(editingEvent, newsPresetById)),
        price: Boolean(editingEvent?.priceChanges?.length),
        signage: Boolean(editingEvent?.signageTargetId || editingEvent?.signageAction),
    }));

    const [breakingVideos, setBreakingVideos] = useState<VideoLibraryItem[]>([]);
    const [preview, setPreview] = useState<{ asset: CloudVideoAsset; title: string } | null>(null);

    useEffect(() => {
        const unsub = subscribeScenarioVideoLibrary(setBreakingVideos);
        return () => unsub();
    }, []);

    const totalOffsetInSeconds = (offsetMinutes * 60) + offsetSecondsVal;
    const selectedPublicPreset = publicNewsPresetId ? newsPresetById.get(publicNewsPresetId) : null;
    const selectedBreakingVideo = breakingVideos.find(video => video.id === selectedPublicPreset?.breakingVideoId);
    const selectedSignageDisplay = selectedPublicPreset?.signageDisplay || null;
    const selectedSignageVideo = breakingVideos.find(video => video.id === selectedSignageDisplay?.videoAssetId);
    const signageModeName = PUBLIC_SIGNAGE_PRESETS.find(preset => preset.id === selectedSignageDisplay?.mode)?.name || selectedSignageDisplay?.mode || "";

    const isFormValid = (() => {
        if (priceChanges.length > 0) {
            for (const pc of priceChanges) {
                const total = pc.branches.reduce((sum, b) => sum + b.probability, 0);
                if (total !== 100) return false;
            }
        }
        if (!publicNewsPresetId && !postNewsPresetId && !insiderNewsPresetId && priceChanges.length === 0) {
            return false;
        }
        if (selectedSignageDisplay && signageEnabled && !signageTargetId) return false;
        return true;
    })();

    const resetForm = () => {
        setOffsetMinutes(5);
        setOffsetSecondsVal(0);
        setPriceChanges([]);
        setSignageEnabled(false);
        setSignageTargetId("");
        setPublicNewsPresetId("");
        setPostNewsPresetId("");
        setPostNewsDelaySeconds(0);
        setInsiderNewsPresetId("");
        setExpandedParts({ postNews: false, price: false, signage: false });
    };

    const setQuickRelativeTime = (minutes: number) => {
        setOffsetMinutes(minutes);
        setOffsetSecondsVal(0);
    };


    const addPriceChange = () => {
        if (stocks.length === 0) return;
        setExpandedParts(prev => ({ ...prev, price: true }));
        setPriceChanges(prev => [...prev, {
            stockId: stocks[0].id,
            branches: [{ label: "結果1", probability: 100, changePercent: 10, deadlineMinutes: 5 }]
        }]);
    };

    const removePriceChange = (index: number) => {
        setPriceChanges(prev => prev.filter((_, i) => i !== index));
    };

    const updateStockId = (index: number, stockId: string) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => (
            changeIndex === index ? { ...change, stockId } : change
        )));
    };

    const addBranch = (stockIndex: number) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => {
            if (changeIndex !== stockIndex) return change;
            const remainingProb = Math.max(0, 100 - change.branches.reduce((sum, b) => sum + b.probability, 0));
            return {
                ...change,
                branches: [
                    ...change.branches,
                    { label: `結果${change.branches.length + 1}`, probability: remainingProb, changePercent: 0, deadlineMinutes: 5 }
                ]
            };
        }));
    };

    const removeBranch = (stockIndex: number, branchIndex: number) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => (
            changeIndex === stockIndex
                ? { ...change, branches: change.branches.filter((_, i) => i !== branchIndex) }
                : change
        )));
    };

    const updateBranch = (stockIndex: number, branchIndex: number, field: NumericBranchField, value: number | undefined) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => {
            if (changeIndex !== stockIndex) return change;

            const branches = change.branches.map((branch, currentBranchIndex) => {
                if (field === "probability" && change.branches.length === 2) {
                    const targetProb = Math.min(100, Math.max(0, value ?? 0));
                    if (currentBranchIndex === branchIndex) return { ...branch, probability: targetProb };
                    return { ...branch, probability: 100 - targetProb };
                }

                if (currentBranchIndex !== branchIndex) return branch;
                if (field === "probability") {
                    return { ...branch, probability: Math.min(100, Math.max(0, value ?? 0)) };
                }

                const nextBranch: PriceChangeBranch = { ...branch };
                if (value === undefined) {
                    delete nextBranch[field];
                } else {
                    nextBranch[field] = value;
                }
                if (field === "targetPrice" && value !== undefined) delete nextBranch.changePercent;
                if (field === "changePercent" && value !== undefined) delete nextBranch.targetPrice;
                return nextBranch;
            });

            return { ...change, branches };
        }));
    };

    const updateBranchLabel = (stockIndex: number, branchIndex: number, label: string) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => (
            changeIndex === stockIndex
                ? {
                    ...change,
                    branches: change.branches.map((branch, currentBranchIndex) => (
                        currentBranchIndex === branchIndex ? { ...branch, label } : branch
                    ))
                }
                : change
        )));
    };

    const updateBranchPostNewsPreset = (stockIndex: number, branchIndex: number, presetId: string) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => {
            if (changeIndex !== stockIndex) return change;
            return {
                ...change,
                branches: change.branches.map((branch, currentBranchIndex) => {
                    if (currentBranchIndex !== branchIndex) return branch;
                    return { ...branch, postNewsPresetId: presetId || null };
                })
            };
        }));
    };

    const updateBranchPostNewsDelay = (stockIndex: number, branchIndex: number, delaySeconds: number) => {
        setPriceChanges(prev => prev.map((change, changeIndex) => (
            changeIndex === stockIndex
                ? {
                    ...change,
                    branches: change.branches.map((branch, currentBranchIndex) => (
                        currentBranchIndex === branchIndex
                            ? { ...branch, postNewsDelaySeconds: Math.max(0, Number(delaySeconds) || 0) }
                            : branch
                    ))
                }
                : change
        )));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onScheduleRelative(totalOffsetInSeconds, priceChanges, publicNewsPresetId || null, postNewsPresetId || null, postNewsPresetId ? postNewsDelaySeconds : null, insiderNewsPresetId || null, selectedSignageDisplay && signageEnabled ? signageTargetId || null : null, selectedSessionId);
        resetForm();
    };

    const togglePart = (part: OptionalPart) => {
        setExpandedParts(prev => ({ ...prev, [part]: !prev[part] }));
    };
    const showPart = (part: OptionalPart) => setExpandedParts(prev => ({ ...prev, [part]: true }));
    const branchSummary = (branch: PriceChangeBranch, index: number) => {
        const label = branch.label || `結果${index + 1}`;
        const destination = typeof branch.changePercent === "number"
            ? `${branch.changePercent > 0 ? "+" : ""}${branch.changePercent}%`
            : typeof branch.targetPrice === "number"
                ? `${branch.targetPrice}pt`
                : "変動なし";
        return `${label} ${branch.probability}% -> ${destination} / ${branch.deadlineMinutes ?? 5}分`;
    };
    const isPriceInvalid = priceChanges.some(pc => pc.branches.reduce((sum, b) => sum + b.probability, 0) !== 100);
    const isSignageInvalid = Boolean(selectedSignageDisplay && signageEnabled && !signageTargetId);
    const invalidByPart: Partial<Record<OptionalPart, boolean>> = { price: isPriceInvalid, signage: isSignageInvalid };

    const AddPartButton = ({ part, icon, label }: { part: OptionalPart; icon: React.ReactNode; label: string }) => {
        const invalid = Boolean(invalidByPart[part]);
        return (
            <button
                type="button"
                onClick={() => showPart(part)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed px-3 text-[11px] font-black transition ${
                    invalid
                        ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-slate-300 bg-white text-slate-600 hover:border-purple-300 hover:text-purple-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                }`}
            >
                {invalid ? <AlertTriangle size={13} /> : icon}
                {label}
                {invalid && <span className="text-[9px] font-black uppercase">要確認</span>}
            </button>
        );
    };

    const SectionToggle = ({ part, icon, label }: { part: OptionalPart; icon: React.ReactNode; label: string }) => (
        <button
            type="button"
            onClick={() => togglePart(part)}
            className="flex w-full items-center justify-between gap-3 text-left text-sm font-black text-slate-700 dark:text-slate-300"
        >
            <span className="flex items-center gap-2 leading-snug">{icon}{label}</span>
            {expandedParts[part] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
    );

    return (
        <div className="@container space-y-6">
            <Card className={`border-2 shadow-xl ${isEditingExistingEvent ? 'border-amber-300 dark:border-amber-900/50' : 'border-purple-200 dark:border-purple-900/50'}`}>
                <CardHeader className={`border-b ${isEditingExistingEvent ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/50' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/50'} py-4 px-4 @lg:px-6`}>
                    <CardTitle className={`text-sm flex flex-col @lg:flex-row @lg:items-center justify-between gap-3 ${isEditingExistingEvent ? 'text-amber-700 dark:text-amber-400' : 'text-purple-700 dark:text-purple-400'}`}>
                        <span className="flex items-center gap-2 min-w-0 leading-snug">
                            {isEditingExistingEvent ? <><Wrench size={18} /> イベント編集モード (相対時間: +{Math.floor((editingEvent?.offsetSeconds || 0) / 60)}分{(editingEvent?.offsetSeconds || 0) % 60}秒)</> : <><Plus size={18} /> 新規イベントセット作成</>}
                        </span>
                        {!isEditingExistingEvent && (
                            <div className="grid grid-cols-2 @lg:flex gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="text-[10px] py-1 text-purple-500 justify-center">クリア</Button>
                            </div>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 px-4 @lg:px-6 space-y-6">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

                        <div className="order-1">
                            <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 mb-3 flex items-start justify-between gap-3">
                                <span className="flex items-center gap-2 leading-snug"><Clock size={16} className="shrink-0" /> セッションと発生タイミング</span>
                            </h3>
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 grid grid-cols-1 @sm:grid-cols-3 gap-4 items-end">
                                <div className="min-w-0 @sm:col-span-3">
                                    <label className="text-xs font-black text-slate-500 block mb-1">対象セッション</label>
                                    <Select
                                        value={selectedSessionId}
                                        onChange={e => onSessionChange(e.target.value)}
                                        className={compactSelectClass}
                                    >
                                        {sessions.map(session => (
                                            <option key={session.id} value={session.id}>{session.name}</option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="min-w-0">
                                    <label className="text-xs font-black text-slate-500 block mb-1">経過分（分）</label>
                                    <Input type="number" value={offsetMinutes} onChange={e => setOffsetMinutes(Number(e.target.value))} min="0" className={`${compactInputClass} font-mono text-center font-bold`} />
                                </div>
                                <div className="min-w-0">
                                    <label className="text-xs font-black text-slate-500 block mb-1">経過秒（秒）</label>
                                    <Input type="number" value={offsetSecondsVal} onChange={e => setOffsetSecondsVal(Number(e.target.value))} min="0" max="59" className={`${compactInputClass} font-mono text-center font-bold`} />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                                <span className="text-[11px] font-black text-slate-400 self-center mr-1">クイックタイマー予約:</span>
                                {[5, 10, 20, 30].map((minutes) => (
                                    <Button key={minutes} onClick={() => setQuickRelativeTime(minutes)} variant="soft" size="xs" className="rounded-lg">
                                        +{minutes}分後
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="order-2">
                            <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 mb-3 flex justify-between gap-3">
                                <span className="flex items-center gap-2 leading-snug"><Newspaper size={16} className="shrink-0" /> ニュース</span>
                            </h3>
                            <div className="grid grid-cols-1 gap-4 font-sans">
                                <div className="bg-emerald-50/50 dark:bg-emerald-950/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/50 space-y-3">
                                    <NewsPresetSelect
                                        label="一般公開 (表ニュース)"
                                        value={publicNewsPresetId}
                                        presets={newsPresets}
                                        presetsById={newsPresetById}
                                        onChange={setPublicNewsPresetId}
                                        toneClassName="border-emerald-200"
                                    />
                                </div>

                                {expandedParts.postNews && <div className="bg-rose-50/50 dark:bg-rose-950/10 p-4 rounded-xl border border-rose-100 dark:border-rose-900/50 space-y-3">
                                    <div>
                                        <SectionToggle part="postNews" icon={<Newspaper size={16} className="shrink-0" />} label="全結果共通の事後ニュース" />
                                        <p className="mt-1 text-[11px] font-bold leading-relaxed text-rose-500/80 dark:text-rose-300/80">分岐側に事後ニュースがある場合は、当選した分岐の内容を優先します。</p>
                                    </div>
                                    <NewsPresetSelect
                                        label="共通事後ニュース"
                                        value={postNewsPresetId}
                                        presets={newsPresets}
                                        presetsById={newsPresetById}
                                        onChange={setPostNewsPresetId}
                                        toneClassName="border-rose-200"
                                    />
                                    <Input type="number" min="0" value={postNewsDelaySeconds} onChange={e => setPostNewsDelaySeconds(Math.max(0, Number(e.target.value) || 0))} label="発火からの遅延秒数" className={`border-rose-200 bg-white font-mono ${compactInputClass}`} />
                                    <NewsPresetSelect
                                        label="裏ニュース（インサイダー）"
                                        value={insiderNewsPresetId}
                                        presets={newsPresets}
                                        presetsById={newsPresetById}
                                        onChange={setInsiderNewsPresetId}
                                        toneClassName="border-rose-200"
                                    />
                                </div>}
                            </div>
                        </div>

                        {(!expandedParts.postNews || !expandedParts.price || !expandedParts.signage) && (
                            <div className="order-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <p className="mb-2 text-[11px] font-black text-slate-400">必要な部品を追加</p>
                                <div className="flex flex-wrap gap-2">
                                    {!expandedParts.postNews && <AddPartButton part="postNews" icon={<Newspaper size={13} />} label="事後ニュース" />}
                                    {!expandedParts.price && <AddPartButton part="price" icon={<TrendingUp size={13} />} label="株価変動" />}
                                    {!expandedParts.signage && <AddPartButton part="signage" icon={<Tv size={13} />} label="サイネージ" />}
                                </div>
                            </div>
                        )}

                        {expandedParts.price && <div className="order-4">
                            <div className="flex flex-col @lg:flex-row @lg:justify-between @lg:items-center gap-3 mb-3">
                                <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 flex gap-2">
                                    <SectionToggle part="price" icon={<TrendingUp size={16} className="shrink-0" />} label="株価ガチャ" />
                                </h3>
                                <Button type="button" variant="outline" size="sm" onClick={addPriceChange} className="justify-center @lg:justify-start"><Plus size={14} className="mr-1" />対象株式を追加</Button>
                            </div>
                            <p className="mb-3 text-[11px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">
                                各分岐は確率抽選で1つ選ばれ、選ばれた分岐の変動率(または目標価格)へ到達期限(分)かけて推移します。確率の合計は100%必須。ゆらぎ%は推移中のランダム振れ幅です。
                            </p>

                            <div className="space-y-4">
                                {priceChanges.length === 0 ? (
                                    <div className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-center text-slate-400 font-bold text-xs bg-slate-50/50">
                                        株価変動は紐付けられていません (ニュース発信のみとなります)
                                    </div>
                                ) : (
                                    priceChanges.map((change, sIdx) => {
                                        const totalProb = change.branches.reduce((acc, b) => acc + b.probability, 0);
                                        const isSuccessProb = totalProb === 100;
                                        const currentStockData = stocks.find(s => s.id === change.stockId);

                                        return (
                                            <div key={sIdx} className="bg-slate-50 dark:bg-slate-900/40 p-4 @lg:p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4 relative">
                                                <IconButton aria-label="株価変動を削除" size="sm" onClick={() => removePriceChange(sIdx)} className="absolute top-4 right-4 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={16} /></IconButton>

                                                <div className="flex flex-col @lg:flex-row gap-3 items-start @lg:items-center pr-10">
                                                    <Select
                                                        value={change.stockId}
                                                        onChange={e => updateStockId(sIdx, e.target.value)}
                                                        containerClassName="w-full @lg:w-2/3"
                                                        className={compactSelectClass}
                                                    >
                                                        <option value="">対象の企業を選択</option>
                                                        {stocks.map(s => <option key={s.id} value={s.id}>{s.name} (現在: {s.currentPrice}pt)</option>)}
                                                    </Select>
                                                    {currentStockData && (
                                                        <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-black rounded-lg border border-blue-200/50">
                                                            現在価格: {currentStockData.currentPrice} pt
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-3 mt-1">
                                                    <div className="flex flex-col @md:flex-row @md:justify-between @md:items-center gap-1 text-xs font-black">
                                                        <span className="text-slate-500">変動分岐 (ガチャ) 設定</span>
                                                        <span className={isSuccessProb ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 flex items-center gap-1"}>
                                                            {!isSuccessProb && <AlertTriangle size={14} />} 分岐確率合計: {totalProb} % (100%必須)
                                                        </span>
                                                    </div>

                                                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden flex shadow-inner">
                                                        {change.branches.map((branch, bIdx) => {
                                                            const colors = ["bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500"];
                                                            if (branch.probability <= 0) return null;
                                                            return (
                                                                <div
                                                                    key={bIdx}
                                                                    className={`${colors[bIdx % colors.length]} h-full border-r border-black/10 transition-all duration-300 flex items-center justify-center text-[8px] font-black text-white overflow-hidden`}
                                                                    style={{ width: `${branch.probability}%` }}
                                                                >
                                                                    {branch.probability >= 10 ? `${branch.probability}%` : ""}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="space-y-2">
                                                        {change.branches.map((branch, bIdx) => (
                                                            <div key={bIdx} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                                                                <details className="group" {...(isEditingExistingEvent ? { open: true } : {})}>
                                                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                                                        <span className="truncate">{branchSummary(branch, bIdx)}</span>
                                                                        <ChevronDown size={14} className="transition group-open:rotate-180" />
                                                                    </summary>
                                                                    <div className="mt-3">
                                                                <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-[minmax(0,1.2fr)_repeat(5,minmax(0,0.8fr))_auto] @2xl:items-end">
                                                                    <Input
                                                                        label="分岐名"
                                                                        value={branch.label || ""}
                                                                        onChange={e => updateBranchLabel(sIdx, bIdx, e.target.value)}
                                                                        placeholder={`結果${bIdx + 1}`}
                                                                        className={compactInputClass}
                                                                    />
                                                                    <label className="block">
                                                                        <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">確率</span>
                                                                        <span className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                                            <Dices size={14} className="text-slate-400 shrink-0" />
                                                                            <input type="number" value={branch.probability} onChange={e => updateBranch(sIdx, bIdx, "probability", Number(e.target.value))} className="min-w-0 flex-1 bg-transparent text-right font-mono font-bold outline-none" min="0" max="100" />
                                                                            <span className="text-slate-400">%</span>
                                                                        </span>
                                                                    </label>
                                                                    <label className="block">
                                                                        <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">変動率</span>
                                                                        <span className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                                            <Percent size={14} className="text-blue-500 shrink-0" />
                                                                            <input
                                                                                type="number"
                                                                                value={branch.changePercent ?? ""}
                                                                                onChange={e => updateBranch(sIdx, bIdx, "changePercent", e.target.value === "" ? undefined : Number(e.target.value))}
                                                                                disabled={branch.targetPrice !== undefined}
                                                                                className="min-w-0 flex-1 bg-transparent text-right font-mono font-bold text-blue-600 outline-none disabled:text-slate-400 dark:text-blue-400"
                                                                                placeholder="任意"
                                                                                step="0.1"
                                                                            />
                                                                            <span className="text-slate-400">%</span>
                                                                        </span>
                                                                    </label>
                                                                    <label className="block">
                                                                        <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">目標価格</span>
                                                                        <span className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                                            <Target size={14} className="text-amber-500 shrink-0" />
                                                                            <input
                                                                                type="number"
                                                                                value={branch.targetPrice ?? ""}
                                                                                onChange={e => updateBranch(sIdx, bIdx, "targetPrice", e.target.value === "" ? undefined : Number(e.target.value))}
                                                                                disabled={branch.changePercent !== undefined}
                                                                                className="min-w-0 flex-1 bg-transparent text-right font-mono font-bold text-amber-600 outline-none disabled:text-slate-400 dark:text-amber-400"
                                                                                placeholder="任意"
                                                                                min="0"
                                                                            />
                                                                            <span className="text-slate-400">pt</span>
                                                                        </span>
                                                                    </label>
                                                                    <label className="block">
                                                                        <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">到達期限</span>
                                                                        <span className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                                            <Clock size={14} className="text-emerald-500 shrink-0" />
                                                                            <input type="number" value={branch.deadlineMinutes ?? 5} onChange={e => updateBranch(sIdx, bIdx, "deadlineMinutes", Number(e.target.value))} className="min-w-0 flex-1 bg-transparent text-right font-mono font-bold text-emerald-600 outline-none" min="1" />
                                                                            <span className="text-slate-400">分</span>
                                                                        </span>
                                                                    </label>
                                                                    <label className="block">
                                                                        <span className="mb-1.5 block text-xs font-medium text-on-surface-variant">ゆらぎ</span>
                                                                        <span className="flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                                                            <Sparkles size={14} className="text-purple-500 shrink-0" />
                                                                            <input
                                                                                type="number"
                                                                                value={branch.fluctuationPercent ?? ""}
                                                                                onChange={e => updateBranch(sIdx, bIdx, "fluctuationPercent", e.target.value === "" ? undefined : Number(e.target.value))}
                                                                                className="min-w-0 flex-1 bg-transparent text-right font-mono font-bold text-purple-600 outline-none dark:text-purple-400"
                                                                                placeholder="未入力時 10"
                                                                                min="0"
                                                                                step="0.1"
                                                                            />
                                                                            <span className="text-slate-400">%</span>
                                                                        </span>
                                                                    </label>
                                                                    <IconButton aria-label="分岐を削除" size="sm" onClick={() => removeBranch(sIdx, bIdx)} disabled={change.branches.length === 1} className="h-11 w-11 rounded-lg text-slate-300 hover:text-red-500 disabled:opacity-20 @2xl:self-end"><Trash2 size={16} /></IconButton>
                                                                </div>
                                                                <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-950/10">
                                                                    <p className="mb-3 text-xs font-black text-rose-600 dark:text-rose-300">この結果の時だけ発表する事後ニュース</p>
                                                                    <div className="grid grid-cols-1 gap-3 @lg:grid-cols-[minmax(0,1fr)_8rem]">
                                                                        <div className="@lg:col-span-2">
                                                                            <NewsPresetSelect
                                                                                label="分岐別事後ニュース"
                                                                                value={branch.postNewsPresetId || ""}
                                                                                presets={newsPresets}
                                                                                presetsById={newsPresetById}
                                                                                onChange={presetId => updateBranchPostNewsPreset(sIdx, bIdx, presetId)}
                                                                                toneClassName="border-rose-200"
                                                                            />
                                                                        </div>
                                                                        <Input
                                                                            type="number"
                                                                            min="0"
                                                                            value={branch.postNewsDelaySeconds ?? 0}
                                                                            onChange={e => updateBranchPostNewsDelay(sIdx, bIdx, Number(e.target.value))}
                                                                            label="遅延秒数"
                                                                            className={`border-rose-200 bg-white font-mono ${compactInputClass}`}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                    </div>
                                                                </details>
                                                            </div>
                                                        ))}
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => addBranch(sIdx)} className="w-full text-[11px] py-2 text-slate-500 border border-dashed border-slate-300 dark:border-slate-800 hover:bg-slate-100">+ 分岐を追加</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>}

                        {expandedParts.signage && <div className="order-4 bg-blue-50/70 dark:bg-blue-950/20 p-5 rounded-xl border border-blue-200 dark:border-blue-900/50 space-y-4">
                            <SectionToggle part="signage" icon={<Tv size={16} />} label="プリセット連動の速報 / サイネージ" />

                            <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                                <div className="rounded-lg border border-purple-200 bg-white p-3 dark:border-purple-900/40 dark:bg-slate-950">
                                    <p className="text-[11px] font-black text-slate-400">速報動画</p>
                                    <p className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {selectedPublicPreset?.breakingVideoId
                                            ? <><Cloud size={12} className="mr-1 inline text-purple-500" />{selectedBreakingVideo?.name || selectedPublicPreset.breakingVideoId}</>
                                            : "選択中の表ニュースプリセットに速報動画はありません。"}
                                    </p>
                                    {selectedBreakingVideo?.videoAsset && (
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                            <p className="truncate text-[10px] font-black text-purple-500">
                                                {getOptimizedStatusLabel(selectedBreakingVideo.videoAsset)} / {formatVideoBytes(getPreferredVideoAsset(selectedBreakingVideo.videoAsset)?.size)}
                                            </p>
                                            <VideoAssetActions asset={selectedBreakingVideo.videoAsset} title={selectedBreakingVideo.name} onPreview={(asset, title) => setPreview({ asset, title })} />
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg border border-blue-100 bg-white p-3 dark:border-blue-900/40 dark:bg-slate-950">
                                    <p className="text-[11px] font-black text-slate-400">サイネージ表示内容</p>
                                    {selectedSignageDisplay ? (
                                        <div className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                                            <p>{signageModeName} / {Math.max(5, selectedSignageDisplay.duration || 30)}秒 / {selectedSignageDisplay.kind === "AD" ? "広告" : "通常"}</p>
                                            <p className="truncate">{selectedSignageDisplay.videoAssetId ? `動画: ${selectedSignageVideo?.name || selectedSignageDisplay.videoAssetId}` : "動画指定なし"}</p>
                                        </div>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-500">選択中の表ニュースプリセットにサイネージ表示はありません。</p>
                                    )}
                                    {selectedSignageVideo?.videoAsset && (
                                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                            <p className="truncate text-[10px] font-black text-blue-500">
                                                {getOptimizedStatusLabel(selectedSignageVideo.videoAsset)} / {formatVideoBytes(getPreferredVideoAsset(selectedSignageVideo.videoAsset)?.size)}
                                            </p>
                                            <VideoAssetActions asset={selectedSignageVideo.videoAsset} title={selectedSignageVideo.name} onPreview={(asset, title) => setPreview({ asset, title })} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedSignageDisplay && <label className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white p-3 text-sm font-black text-slate-700 dark:border-blue-900/40 dark:bg-slate-950 dark:text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={signageEnabled}
                                    onChange={e => setSignageEnabled(e.target.checked)}
                                    className="h-4 w-4 accent-blue-600"
                                />
                                このプリセットのサイネージ表示を送出する
                            </label>}

                            {selectedSignageDisplay && signageEnabled && (
                                <div className="animate-in zoom-in-95">
                                    <Select value={signageTargetId} onChange={e => setSignageTargetId(e.target.value)} className={compactSelectClass}>
                                        <option value="">対象モニターを選択</option>
                                        {publicSignages.map(signage => (
                                            <option key={signage.id} value={signage.id}>{signage.name}{signage.location ? ` (${signage.location})` : ""}</option>
                                        ))}
                                    </Select>
                                </div>
                            )}
                        </div>}

                        <div className="sticky bottom-0 order-6 z-20 -mx-4 grid grid-cols-1 gap-3 border-t border-outline-variant bg-surface/95 px-4 py-3 backdrop-blur @lg:static @lg:mx-0 @lg:grid-cols-3 @lg:bg-transparent @lg:px-0 @lg:pt-6 @lg:backdrop-blur-none">
                            {isEditingExistingEvent ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border border-slate-300 dark:border-slate-700 h-12 font-black justify-center"
                                        onClick={onCancelEdit}
                                    >
                                        キャンセル
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="w-full @lg:col-span-2 bg-warning text-[#1f1f1f] hover:brightness-105 border-none h-14 font-black justify-center"
                                        disabled={!isFormValid}
                                    >
                                        <Wrench size={18} className="mr-2" /> 変更を保存する
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300 h-12 font-black justify-center"
                                        onClick={() => {
                                            onPublishNow(priceChanges, publicNewsPresetId || null, postNewsPresetId || null, postNewsPresetId ? postNewsDelaySeconds : null, insiderNewsPresetId || null, selectedSignageDisplay && signageEnabled ? signageTargetId || null : null);
                                            resetForm();
                                        }}
                                        disabled={!isFormValid}
                                    >
                                        <Zap size={18} className="mr-2 text-yellow-500" /> 今すぐ発動
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="w-full @lg:col-span-2 bg-primary hover:brightness-105 border-none h-14 font-black justify-center"
                                        disabled={!isFormValid}
                                    >
                                        <Clock size={18} className="mr-2" /> 保存（タイムラインに予約）
                                    </Button>
                                </>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>
            <VideoPreviewModal asset={preview?.asset} title={preview?.title || ""} isOpen={!!preview} onClose={() => setPreview(null)} />
        </div>
    );
}
