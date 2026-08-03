// File: src/components/admin/scenario/TimelineView.tsx
import React, { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Clock, ArrowDown, ArrowUp, Search, SlidersHorizontal, Activity, Download, Copy, MoveRight, X, Trash2 } from "lucide-react";
import { writeBatch, doc, Timestamp } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Card, CardHeader, CardTitle } from "../../ui/Card";
import Button from "../../ui/Button";
import EventCard from "./EventCard";
import { useDialog } from "../../../contexts/DialogContext";
import type { Stock } from "../../../types/domain";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { simulateScenario } from "../../../lib/priceSimulation";
import { detectAllAnomalies, type PriceAnomalyType } from "../../../lib/priceAnomalyDetection";
import { downloadSimulationCsv } from "../../../lib/exportSimulationCsv";
import AnomalyPanel from "./AnomalyPanel";
import { getPostNews, getPublicNews, type ScenarioEvent } from "../../../types/scenario";
import type { NewsPreset } from "../../../types/newsPreset";
import type { ScheduleSession } from "../../../types/schedule";
import { getTimelineContentWidth, getTimelineX } from "../schedule/timelineScale";
import {
    categoryForEvent,
    detectEventWarnings,
    formatOffsetSigned,
    groupEventsByTimeBucket,
    type EventWarning,
    type OverviewCategory,
} from "../../../lib/scenarioAuthoring";

const CHART_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#eab308", "#a855f7", "#ec4899", "#f97316"];
const FILTER_OPTIONS: Array<{ id: "ALL" | "PENDING" | "PROCESSED"; name: string }> = [
    { id: "ALL", name: "全て" },
    { id: "PENDING", name: "未処理のみ" },
    { id: "PROCESSED", name: "実行済" }
];
const CATEGORY_FILTER_OPTIONS: Array<{ id: "ALL" | OverviewCategory; name: string }> = [
    { id: "ALL", name: "種別すべて" },
    { id: "news", name: "ニュース" },
    { id: "price", name: "株価" },
    { id: "video", name: "動画" },
    { id: "signage", name: "TV" },
];
const WARNING_LABEL: Record<EventWarning, string> = {
    DUPLICATE_TIME: "同時刻重複",
    EMPTY_TITLE: "見出し確認",
    EMPTY_EVENT: "空イベント",
};

interface TimelineViewProps {
    events: ScenarioEvent[];
    stocks: Stock[];
    videoNameById?: Record<string, string>;
    signageNameById?: Record<string, string>;
    newsPresetById?: Map<string, NewsPreset>;
    sessions: ScheduleSession[];
    selectedSessionId: string;
    startPinEventId: string;
    onSetStartPin: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteEvents: (events: ScenarioEvent[]) => void | Promise<void>;
    onUpdateOffset: (event: ScenarioEvent, nextOffsetSeconds: number) => void;
    onOpenEdit: (event: ScenarioEvent) => void;
    onCopyEvents: (events: ScenarioEvent[], targetSessionId: string) => void | Promise<void>;
    onMoveEvents: (events: ScenarioEvent[], targetSessionId: string) => void | Promise<void>;
    session?: ScheduleSession;
}

interface SimulationData {
    time: string;
    [key: string]: number | string;
}

export default function TimelineView({
    events,
    stocks,
    videoNameById = {},
    signageNameById = {},
    newsPresetById = new Map(),
    sessions,
    selectedSessionId,
    startPinEventId,
    onSetStartPin,
    onDelete,
    onDeleteEvents,
    onUpdateOffset,
    onOpenEdit,
    onCopyEvents,
    onMoveEvents,
    session
}: TimelineViewProps) {
    const [currentTime, setCurrentTime] = useState(new Date());
    const [searchText, setSearchInput] = useState("");
    const [filterType, setFilterType] = useState<"ALL" | "PENDING" | "PROCESSED">("ALL");
    const [categoryFilter, setCategoryFilter] = useState<"ALL" | OverviewCategory>("ALL");
    const [warningOnly, setWarningOnly] = useState(false);
    const [showSimulation, setShowSimulation] = useState(false);
    const [showTimelineTools, setShowTimelineTools] = useState(false);
    const [showEnvelope, setShowEnvelope] = useState(false);
    const [showAnomalyDetails, setShowAnomalyDetails] = useState(false);
    const [rapidChangeThresholdPercent, setRapidChangeThresholdPercent] = useState(15);
    const [minEventGapSeconds, setMinEventGapSeconds] = useState(10);
    const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
    const [copyTargetSessionId, setCopyTargetSessionId] = useState<string | null>(null);

    const { alert, confirm } = useDialog();

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const sortedEvents = useMemo(() => {
        return [...events]
            .filter(ev => typeof ev.offsetSeconds === "number" && !isNaN(ev.offsetSeconds))
            .sort((a, b) => a.offsetSeconds - b.offsetSeconds);
    }, [events]);

    const warningMap = useMemo(() => detectEventWarnings(sortedEvents, newsPresetById), [sortedEvents, newsPresetById]);

    const stockNameById = useMemo(() => Object.fromEntries(stocks.map(stock => [stock.id, stock.name])), [stocks]);

    const filteredEvents = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        return sortedEvents.filter(ev => {
            const publicNews = getPublicNews(ev, newsPresetById);
            const postNews = getPostNews(ev, newsPresetById);
            const stockNames = ev.priceChanges
                ?.map(change => stockNameById[change.stockId] || change.stockId)
                .join(" ")
                .toLowerCase() ?? "";
            const matchSearch = query
                ? (publicNews?.title?.toLowerCase().includes(query) ||
                    postNews?.title?.toLowerCase().includes(query) ||
                    stockNames.includes(query))
                : true;

            const isPast = ev.isProcessed || (ev.time && ev.time.toMillis() <= currentTime.getTime());
            const matchFilter = filterType === "ALL"
                ? true
                : filterType === "PENDING" ? !isPast : isPast;
            const matchCategory = categoryFilter === "ALL" ? true : categoryForEvent(ev, newsPresetById) === categoryFilter;
            const matchWarning = warningOnly ? warningMap.has(ev.id) : true;

            return matchSearch && matchFilter && matchCategory && matchWarning;
        });
    }, [sortedEvents, searchText, filterType, currentTime, stockNameById, categoryFilter, warningOnly, warningMap, newsPresetById]);

    const groupedEvents = useMemo(() => groupEventsByTimeBucket(filteredEvents), [filteredEvents]);

    const nextPendingEventId = useMemo(() => {
        const nowMillis = currentTime.getTime();
        return sortedEvents.find(ev => !ev.isProcessed && ev.time && ev.time.toMillis() > nowMillis)?.id ?? null;
    }, [sortedEvents, currentTime]);

    const selectedEvents = useMemo(() => {
        const selectedIds = new Set(selectedEventIds);
        return sortedEvents.filter(event => selectedIds.has(event.id));
    }, [selectedEventIds, sortedEvents]);
    const filteredEventIds = useMemo(() => filteredEvents.map(event => event.id), [filteredEvents]);
    const allFilteredSelected = filteredEventIds.length > 0 && filteredEventIds.every(id => selectedEventIds.includes(id));
    const effectiveCopyTargetSessionId = copyTargetSessionId ?? selectedSessionId;
    const canMoveSelected = selectedEvents.length > 0 && effectiveCopyTargetSessionId !== selectedSessionId;

    useEffect(() => {
        const eventIds = new Set(sortedEvents.map(event => event.id));
        setSelectedEventIds(prev => prev.filter(id => eventIds.has(id)));
    }, [sortedEvents]);

    const unstartedBaseTime = useMemo(() => {
        return new Date();
    }, []);

    const simulationResult = useMemo(() => {
        if (stocks.length === 0 || sortedEvents.length === 0) return null;
        return simulateScenario({ stocks, events: sortedEvents, sampleIntervalSeconds: 30 });
    }, [stocks, sortedEvents]);

    const simulationChartData = useMemo(() => {
        if (!simulationResult) return [];
        const firstSeries = simulationResult.series[stocks[0]?.id] ?? [];
        return firstSeries.map((point, index) => {
            const item: SimulationData = { time: point.time };
            stocks.forEach(stock => {
                const stockPoint = simulationResult.series[stock.id]?.[index];
                if (!stockPoint) return;
                item[stock.name] = stockPoint.price;
                item[`${stock.name} 下限`] = stockPoint.min;
                item[`${stock.name} 上限`] = stockPoint.max;
            });
            return item;
        });
    }, [simulationResult, stocks]);

    const simulationAnomalies = useMemo(() => {
        if (!simulationResult) return [];
        return detectAllAnomalies(simulationResult, sortedEvents, stocks, {
            rapidChangeThresholdPercent,
            minEventGapSeconds,
        });
    }, [simulationResult, sortedEvents, stocks, rapidChangeThresholdPercent, minEventGapSeconds]);

    const anomalyCounts = useMemo(() => {
        return simulationAnomalies.reduce<Record<PriceAnomalyType, number>>((acc, anomaly) => {
            acc[anomaly.type] += 1;
            return acc;
        }, { CLAMP: 0, RAPID_CHANGE: 0, UNREACHABLE_TARGET: 0, OVERLAP: 0 });
    }, [simulationAnomalies]);

    const handleShiftAllPending = async (minutes: number) => {
        const pendingEvents = sortedEvents.filter(ev => !ev.isProcessed);
        if (pendingEvents.length === 0) {
            await alert({ title: "お知らせ", message: "シフト可能な未処理の予約イベントはありません。", variant: "info" });
            return;
        }

        const directionText = minutes > 0 ? `${minutes}分遅らせる` : `${Math.abs(minutes)}分前倒しにする`;
        const isOk = await confirm({
            title: `タイムラインの一括シフト`,
            message: `未処理のイベント ${pendingEvents.length} 件の発生予定を ${directionText} に変更しますか？`,
            confirmText: "一括シフト"
        });

        if (!isOk) return;

        try {
            const batch = writeBatch(db);
            pendingEvents.forEach(ev => {
                const newOffset = Math.max(0, ev.offsetSeconds + minutes * 60);
                batch.update(doc(db, "events", ev.id), {
                    offsetSeconds: newOffset
                });
            });
            await batch.commit();
            await alert({ title: "完了", message: "タイムスケジュールを一括シフトしました。", variant: "success" });
        } catch {
            await alert({ title: "エラー", message: "シフトに失敗しました。", variant: "danger" });
        }
    };

    const handleForceTrigger = async (event: ScenarioEvent, e: React.MouseEvent) => {
        e.stopPropagation();
        const isOk = await confirm({
            title: "予約イベントの即時実行",
            message: "このイベントを「今すぐこの場」で発動させますか？",
            confirmText: "今すぐ発動",
            variant: "warning"
        });

        if (!isOk) return;

        try {
            await writeBatch(db)
                .update(doc(db, "events", event.id), {
                    time: Timestamp.now(),
                    isProcessed: false
                })
                .commit();
            await alert({ title: "発動", message: "即時実行を配信キューに投げました。", variant: "success" });
        } catch {
            await alert({ title: "エラー", message: "発動に失敗しました。", variant: "danger" });
        }
    };

    const handleResetToPending = async (event: ScenarioEvent, e: React.MouseEvent) => {
        e.stopPropagation();
        const isOk = await confirm({
            title: "イベントを未処理状態に戻す",
            message: `このイベントを「未実行（予約待ち）」の状態に戻しますか？`,
            confirmText: "未処理に戻す",
            variant: "warning"
        });

        if (!isOk) return;

        try {
            const batch = writeBatch(db);
            batch.update(doc(db, "events", event.id), {
                isProcessed: false,
                time: null,
                processedParts: null,
                selectedBranches: null
            });
            await batch.commit();
            await alert({ title: "リセット完了", message: "イベントを未実行に戻しました。", variant: "success" });
        } catch {
            await alert({ title: "エラー", message: "リセット処理に失敗しました。", variant: "danger" });
        }
    };

    const handleToggleSelected = (event: ScenarioEvent, checked: boolean) => {
        setSelectedEventIds(prev => {
            if (checked) return prev.includes(event.id) ? prev : [...prev, event.id];
            return prev.filter(id => id !== event.id);
        });
    };

    const handleToggleAllFiltered = () => {
        setSelectedEventIds(prev => {
            if (allFilteredSelected) {
                const filteredIds = new Set(filteredEventIds);
                return prev.filter(id => !filteredIds.has(id));
            }
            return Array.from(new Set([...prev, ...filteredEventIds]));
        });
    };

    const handleCopySingle = async (event: ScenarioEvent) => {
        const targetSessionId = event.sessionId || selectedSessionId;
        await onCopyEvents([event], targetSessionId);
    };

    const handleCopySelected = async () => {
        if (selectedEvents.length === 0) return;
        await onCopyEvents(selectedEvents, effectiveCopyTargetSessionId);
        setSelectedEventIds([]);
        setCopyTargetSessionId(null);
    };

    const handleMoveSelected = async () => {
        if (selectedEvents.length === 0) return;
        if (!canMoveSelected) {
            await alert({ title: "移動先を選択", message: "現在とは別のセッションを選んでから移動してください。", variant: "info" });
            return;
        }
        await onMoveEvents(selectedEvents, effectiveCopyTargetSessionId);
        setSelectedEventIds([]);
        setCopyTargetSessionId(null);
    };

    const handleDeleteSelected = async () => {
        if (selectedEvents.length === 0) return;
        await onDeleteEvents(selectedEvents);
        setSelectedEventIds([]);
        setCopyTargetSessionId(null);
    };

    const timelineWindow = useMemo(() => {
        const firstOffset = sortedEvents[0]?.offsetSeconds ?? 0;
        const lastOffset = sortedEvents[sortedEvents.length - 1]?.offsetSeconds ?? 3600;
        if (session) {
            return {
                startMs: session.startAt.toMillis(),
                endMs: session.endAt.toMillis(),
            };
        }
        const baseMs = unstartedBaseTime.getTime();
        return {
            startMs: baseMs + firstOffset * 1000,
            endMs: baseMs + Math.max(firstOffset + 60, lastOffset) * 1000,
        };
    }, [session, sortedEvents, unstartedBaseTime]);

    const timelineContentWidth = useMemo(() => {
        const eventTimes = filteredEvents.map(event => event.time?.toMillis?.() ?? timelineWindow.startMs + (event.offsetSeconds || 0) * 1000);
        return getTimelineContentWidth({
            startMs: timelineWindow.startMs,
            endMs: timelineWindow.endMs,
            eventTimesMs: eventTimes,
            minWidthPx: 760,
        });
    }, [filteredEvents, timelineWindow]);

    const timelineListMinHeight = useMemo(() => {
        if (filteredEvents.length === 0) return 320;
        return Math.max(460, filteredEvents.length * 124 + 40);
    }, [filteredEvents.length]);

    return (
        <Card className="@container flex flex-col overflow-hidden border-slate-200 dark:border-slate-800 shadow-xl min-w-0 max-w-full">

            {/* タイムラインヘッダー制御 */}
            <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 py-4 px-4 @lg:px-6 border-b border-slate-100 dark:border-slate-800 flex flex-col @lg:flex-row justify-between items-start @lg:items-center gap-4 shrink-0 min-w-0">
                <CardTitle className="text-sm @lg:text-base flex items-center gap-2 min-w-0 leading-snug">
                    <Clock size={18} /> タイムスケジュール（{filteredEvents.length}件表示）
                </CardTitle>
                <div className="grid grid-cols-2 @lg:flex @lg:flex-wrap gap-2 w-full @lg:w-auto justify-start @lg:justify-end min-w-0">
                    <Button variant="tonal" size="sm" onClick={() => setShowTimelineTools(prev => !prev)} className="col-span-2 @lg:hidden text-[10px] py-1 justify-center">
                        <SlidersHorizontal size={12} className="mr-1" /> 検索・分析
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowSimulation(!showSimulation)} className="col-span-2 @lg:col-span-1 text-[10px] py-1 border-slate-200 dark:border-slate-800 justify-center">
                        <Activity size={12} className="mr-1" /> シミュレータ: {showSimulation ? "ON" : "OFF"}
                    </Button>
                    <div className="w-px bg-slate-200 dark:bg-slate-700 h-6 hidden @lg:block"></div>
                    <Button variant="outline" size="sm" onClick={() => handleShiftAllPending(-5)} className="text-[10px] py-1 text-slate-500 border-slate-200 dark:border-slate-800 justify-center @lg:flex-none">
                        <ArrowUp size={12} className="mr-1" />-5分
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleShiftAllPending(5)} className="text-[10px] py-1 text-slate-500 border-slate-200 dark:border-slate-800 justify-center @lg:flex-none">
                        <ArrowDown size={12} className="mr-1" />+5分
                    </Button>
                </div>
            </CardHeader>

            {/* ★ 擬似価格シミュレーターチャート表示エリア */}
            {showSimulation && simulationChartData.length > 0 && (
                <div className="p-3 @lg:p-4 bg-slate-50/60 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 w-full animate-in slide-in-from-top-4">
                    <div className="mb-3 flex flex-col @xl:flex-row @xl:items-center justify-between gap-3">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12} /> シナリオ価格シミュレーション</div>
                        <div className="grid grid-cols-2 @lg:flex @lg:flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-lg bg-white px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                                <input type="checkbox" checked={showEnvelope} onChange={e => setShowEnvelope(e.target.checked)} />
                                範囲
                            </label>
                            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-lg bg-white px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                                急変
                                <input
                                    type="number"
                                    min={1}
                                    value={rapidChangeThresholdPercent}
                                    onChange={e => setRapidChangeThresholdPercent(Math.max(1, Number(e.target.value) || 1))}
                                    className="h-7 w-14 rounded-md border border-slate-200 bg-white px-2 text-[10px] dark:border-slate-800 dark:bg-slate-950"
                                />
                                %
                            </label>
                            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 rounded-lg bg-white px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
                                間隔
                                <input
                                    type="number"
                                    min={0}
                                    value={minEventGapSeconds}
                                    onChange={e => setMinEventGapSeconds(Math.max(0, Number(e.target.value) || 0))}
                                    className="h-7 w-14 rounded-md border border-slate-200 bg-white px-2 text-[10px] dark:border-slate-800 dark:bg-slate-950"
                                />
                                秒
                            </label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => simulationResult && downloadSimulationCsv(simulationResult, stocks, simulationAnomalies)}
                                className="h-8 px-2 text-[10px] justify-center"
                            >
                                <Download size={12} className="mr-1" />
                                CSVダウンロード
                            </Button>
                        </div>
                    </div>
                    <div className="h-44 @lg:h-48 min-w-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={simulationChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                <XAxis dataKey="time" fontSize={9} />
                                <YAxis fontSize={9} domain={['auto', 'auto']} />
                                <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '8px' }} />
                                {stocks.map((s, idx) => (
                                    <React.Fragment key={s.id}>
                                        {showEnvelope && (
                                            <>
                                                <Line type="monotone" dataKey={`${s.name} 下限`} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={1} strokeOpacity={0.18} dot={false} isAnimationActive={false} />
                                                <Line type="monotone" dataKey={`${s.name} 上限`} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={1} strokeOpacity={0.18} dot={false} isAnimationActive={false} />
                                            </>
                                        )}
                                        <Line type="monotone" dataKey={s.name} stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={3} dot={false} isAnimationActive={false} />
                                    </React.Fragment>
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-3 space-y-3">
                        <button
                            type="button"
                            onClick={() => setShowAnomalyDetails(prev => !prev)}
                            className="flex w-full flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-black text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                        >
                            異常検知 {simulationAnomalies.length}件
                            {anomalyCounts.CLAMP > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300">上下限 {anomalyCounts.CLAMP}</span>}
                            {anomalyCounts.RAPID_CHANGE > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">急変 {anomalyCounts.RAPID_CHANGE}</span>}
                            {anomalyCounts.UNREACHABLE_TARGET > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300">到達不可 {anomalyCounts.UNREACHABLE_TARGET}</span>}
                            {anomalyCounts.OVERLAP > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">重複 {anomalyCounts.OVERLAP}</span>}
                        </button>
                        {showAnomalyDetails && (
                            <AnomalyPanel anomalies={simulationAnomalies} events={sortedEvents} stocks={stocks} />
                        )}
                    </div>
                </div>
            )}

            {/* フィルタ & 検索 */}
            <div className={`${showTimelineTools ? "grid" : "hidden"} @lg:grid p-3 @lg:p-4 bg-surface-container border-b border-outline-variant grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_auto] gap-3 shrink-0 min-w-0`}>
                <div className="relative flex-1 min-w-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="タイトル・銘柄検索..."
                        value={searchText}
                        onChange={e => setSearchInput(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-hidden text-slate-700 dark:text-slate-300"
                    />
                </div>
                <div className="grid grid-cols-3 @md:flex @md:flex-wrap items-center gap-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-1 rounded-lg shrink-0 max-w-full">
                    <SlidersHorizontal size={12} className="hidden @md:block text-slate-400 mx-2" />
                    {FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setFilterType(opt.id)}
                            className={`px-2 @lg:px-3 py-1.5 @lg:py-1 rounded text-[10px] font-bold transition-all ${filterType === opt.id
                                ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400"
                                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                }`}
                        >
                            {opt.name}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-3 @md:flex @md:flex-wrap items-center gap-1 @lg:col-span-2">
                    {CATEGORY_FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setCategoryFilter(opt.id)}
                            className={`rounded-lg border px-2 py-1.5 text-[10px] font-black transition ${
                                categoryFilter === opt.id
                                    ? "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300"
                                    : "border-slate-200 bg-white text-slate-500 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                            }`}
                        >
                            {opt.name}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setWarningOnly(prev => !prev)}
                        className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black transition ${
                            warningOnly
                                ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                                : "border-slate-200 bg-white text-slate-500 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                        }`}
                    >
                        <AlertTriangle size={12} />
                        要確認
                    </button>
                </div>
            </div>

            {filteredEvents.length > 0 && (
                <div className="border-b border-sky-100 bg-sky-50/80 p-3 dark:border-sky-900/60 dark:bg-sky-950/20 @lg:p-4">
                    <div className="grid grid-cols-1 gap-2 @lg:grid-cols-[auto_auto_minmax(180px,280px)_auto_auto_auto_auto] @lg:items-center">
                        <label className="flex h-10 items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 text-xs font-black text-sky-700 dark:border-sky-900 dark:bg-slate-950 dark:text-sky-300">
                            <input
                                type="checkbox"
                                checked={allFilteredSelected}
                                onChange={handleToggleAllFiltered}
                                className="h-3.5 w-3.5 accent-sky-600"
                            />
                            表示中を全選択
                        </label>
                        <p className="flex h-10 items-center text-xs font-black text-sky-700 dark:text-sky-300">
                            {selectedEvents.length}件を選択中
                        </p>
                        {selectedEvents.length > 0 && (
                            <>
                                <select
                                    value={effectiveCopyTargetSessionId}
                                    onChange={e => setCopyTargetSessionId(e.target.value)}
                                    className="h-10 rounded-lg border border-sky-200 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden dark:border-sky-900 dark:bg-slate-950 dark:text-slate-200"
                                    aria-label="コピーまたは移動先セッション"
                                >
                                    {sessions.map(targetSession => (
                                        <option key={targetSession.id} value={targetSession.id}>
                                            {targetSession.name}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleCopySelected}
                                    className="h-10 justify-center gap-1.5 bg-sky-600 hover:bg-sky-500"
                                >
                                    <Copy size={14} />
                                    コピー
                                </Button>
                                <Button
                                    variant="tonal"
                                    size="sm"
                                    onClick={handleMoveSelected}
                                    disabled={!canMoveSelected}
                                    className="h-10 justify-center gap-1.5"
                                >
                                    <MoveRight size={14} />
                                    セッションへ移動
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDeleteSelected}
                                    className="h-10 justify-center gap-1.5 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                                >
                                    <Trash2 size={14} />
                                    削除
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSelectedEventIds([]);
                                        setCopyTargetSessionId(null);
                                    }}
                                    className="h-10 justify-center gap-1.5 border-sky-200 text-sky-700 dark:border-sky-900 dark:text-sky-300"
                                >
                                    <X size={14} />
                                    選択解除
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="border-b border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30 @lg:p-4 shrink-0">
                <div className="relative h-24 overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-950">
                    <div className="relative h-full" style={{ width: timelineContentWidth }}>
                        <div className="absolute left-16 right-16 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-300 dark:bg-slate-800" />
                        {currentTime.getTime() >= timelineWindow.startMs && currentTime.getTime() <= timelineWindow.endMs && (
                            <div
                                className="absolute top-3 bottom-3 w-0.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                                style={{ left: getTimelineX(currentTime.getTime(), timelineWindow.startMs, timelineWindow.endMs, timelineContentWidth) }}
                            >
                                <span className="absolute -top-1 left-2 whitespace-nowrap rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-black text-white">
                                    現在
                                </span>
                            </div>
                        )}
                        {filteredEvents.map((event) => {
                            const eventMs = event.time?.toMillis?.() ?? timelineWindow.startMs + (event.offsetSeconds || 0) * 1000;
                            const left = getTimelineX(eventMs, timelineWindow.startMs, timelineWindow.endMs, timelineContentWidth);
                            const publicNews = getPublicNews(event, newsPresetById);
                            const postNews = getPostNews(event, newsPresetById);
                            const publicPreset = event.publicNewsPresetId ? newsPresetById.get(event.publicNewsPresetId) : null;
                            const label = publicNews?.title || postNews?.title || (event.priceChanges?.length ? "株価" : publicPreset?.breakingVideoId || event.breakingVideoId ? "動画" : publicPreset?.signageDisplay || event.signageAction ? "TV" : "イベント");
                            return (
                                <button
                                    key={event.id}
                                    type="button"
                                    onClick={() => onOpenEdit(event)}
                                    className={`absolute top-1/2 h-9 max-w-36 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border-2 px-3 text-[10px] font-black shadow-sm transition hover:scale-105 ${
                                        event.id === nextPendingEventId
                                            ? "border-rose-200 bg-rose-500 text-white"
                                            : event.isProcessed
                                                ? "border-emerald-200 bg-emerald-600 text-white opacity-75"
                                                : "border-white bg-purple-600 text-white dark:border-slate-950"
                                    }`}
                                    style={{ left }}
                                    title={`${formatOffsetSigned(event.offsetSeconds || 0)} ${label}`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                        <div className="absolute bottom-2 left-16 text-[9px] font-bold text-slate-400">
                            {new Date(timelineWindow.startMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="absolute bottom-2 right-16 text-[9px] font-bold text-slate-400">
                            {new Date(timelineWindow.endMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </div>
                </div>
            </div>

            {/* タイムラインリスト */}
            <div
                className="overflow-x-hidden bg-slate-50/20 dark:bg-slate-950/5 p-3 @lg:p-6 relative min-w-0"
                style={{ minHeight: timelineListMinHeight }}
            >
                <div className="relative space-y-4 min-w-0 max-w-full">
                    <div className="absolute left-[110px] top-6 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800 hidden @xl:block"></div>

                    {filteredEvents.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <Clock size={48} className="text-slate-300 mb-2" />
                            <p className="font-bold text-xs">表示できるイベントはありません</p>
                        </div>
                    ) : (
                        groupedEvents.map(group => (
                            <section key={group.bucketStart} data-offset-bucket={String(group.bucketStart)} className="space-y-3 scroll-mt-6">
                                <div className="sticky top-0 z-10 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-xs backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
                                    <span className="font-mono text-sm font-black text-purple-700 dark:text-purple-300">{group.label}</span>
                                    <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{group.events.length}件</span>
                                </div>
                                {group.events.map((ev, idx) => {
                                    const isPinned = startPinEventId === ev.id;
                                    const isNext = ev.id === nextPendingEventId;
                                    const warnings = warningMap.get(ev.id) ?? [];

                                    return (
                                        <div key={ev.id}>
                                            {isNext && ev.time && (
                                                <div className="flex items-center gap-2 my-4 pl-0 @xl:pl-[112px] relative">
                                            {/* ドット上の交差点に配置される輝くインジケーター */}
                                            <div className="absolute left-[104px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-rose-500 border-2 border-white dark:border-slate-950 shadow-[0_0_10px_#f43f5e] z-20 hidden @xl:block animate-ping" />
                                            <div className="absolute left-[104px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-rose-500 border-2 border-white dark:border-slate-950 shadow-[0_0_10px_#f43f5e] z-20 hidden @xl:block" />
                                            
                                            {/* 横断する現在進行ライン */}
                                            <div className="h-0.5 bg-gradient-to-r from-rose-500 to-purple-600 flex-1 relative">
                                                <span className="absolute -top-2.5 left-4 bg-rose-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 z-20 select-none">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                                                    現在地 ({currentTime.toLocaleTimeString()})
                                                </span>
                                            </div>
                                                </div>
                                            )}

                                            {warnings.length > 0 && (
                                                <div className="mb-2 flex flex-wrap gap-1 pl-0 @xl:pl-[112px]">
                                                    {warnings.map(warning => (
                                                        <span key={warning} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                                            <AlertTriangle size={10} />
                                                            {WARNING_LABEL[warning]}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <EventCard
                                                event={ev}
                                                index={idx}
                                                isNext={isNext}
                                                isPinned={isPinned}
                                                isSelected={selectedEventIds.includes(ev.id)}
                                                currentTime={currentTime}
                                                stocks={stocks}
                                                videoNameById={videoNameById}
                                                signageNameById={signageNameById}
                                                newsPresetById={newsPresetById}
                                                unstartedBaseTime={unstartedBaseTime}
                                                onSetStartPin={onSetStartPin}
                                                onForceTrigger={handleForceTrigger}
                                                onResetToPending={handleResetToPending}
                                                onToggleSelected={handleToggleSelected}
                                                onCopy={handleCopySingle}
                                                onUpdateOffset={onUpdateOffset}
                                                onOpenEdit={onOpenEdit}
                                                onDelete={onDelete}
                                            />
                                        </div>
                                    );
                                })}
                            </section>
                        ))
                    )}
                </div>
            </div>

        </Card>
    );
}
