import type { ScenarioEvent } from "../../../types/scenario";
import type { ScheduleSession } from "../../../types/schedule";
import type { NewsPreset } from "../../../types/newsPreset";
import { buildOverviewClusters, formatOffsetSigned, type OverviewCategory } from "../../../lib/scenarioAuthoring";
import { eventMillisForSession, labelForEvent } from "./scheduleDisplay";
import { getTimelineContentWidth, getTimelineX } from "./timelineScale";

interface Props {
  session: ScheduleSession;
  events: ScenarioEvent[];
  now: Date;
  selectedEventId: string | null;
  videoNameById?: Record<string, string>;
  signageNameById?: Record<string, string>;
  newsPresetById?: Map<string, NewsPreset>;
  onSelectEvent: (event: ScenarioEvent) => void;
  onJumpToOffset?: (offsetSeconds: number) => void;
}

const CATEGORY_COLOR: Record<OverviewCategory, string> = {
  news: "#639922",
  price: "#BA7517",
  video: "#534AB7",
  signage: "#534AB7",
  other: "#888780",
};

const CATEGORY_LABEL: Record<OverviewCategory, string> = {
  news: "ニュース",
  price: "株価",
  video: "動画",
  signage: "TV",
  other: "その他",
};

export default function ScheduleTimeline({
  session,
  events,
  now,
  selectedEventId,
  videoNameById = {},
  signageNameById = {},
  newsPresetById = new Map(),
  onSelectEvent,
  onJumpToOffset,
}: Props) {
  const start = session.startAt.toMillis();
  const end = session.endAt.toMillis();
  const eventTimes = events.map(event => eventMillisForSession(event, start));
  const rangeSeconds = Math.max(1, Math.round((end - start) / 1000));
  const contentWidth = getTimelineContentWidth({
    startMs: start,
    endMs: end,
    eventTimesMs: eventTimes,
    minWidthPx: 760,
  });
  const nowX = getTimelineX(now.getTime(), start, end, contentWidth);
  const clusters = buildOverviewClusters(events, rangeSeconds, Math.max(24, Math.floor(contentWidth / 28)), newsPresetById);
  const tickStepSeconds = rangeSeconds <= 30 * 60 ? 5 * 60 : rangeSeconds <= 2 * 60 * 60 ? 15 * 60 : 30 * 60;
  const ticks = Array.from({ length: Math.floor(rangeSeconds / tickStepSeconds) + 1 }, (_, index) => index * tickStepSeconds);
  const xForOffset = (offsetSeconds: number) => getTimelineX(start + Math.max(0, offsetSeconds) * 1000, start, end, contentWidth);

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface p-3 shadow-xs md:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-purple-600 dark:text-purple-300">{session.name}</p>
          <p className="text-[10px] font-bold text-slate-400">{session.startAt.toDate().toLocaleString()} - {session.endAt.toDate().toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(["news", "price", "video"] as OverviewCategory[]).map(category => (
            <span key={category} className="inline-flex items-center gap-1 text-[9px] font-black text-slate-500 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[category] }} />
              {CATEGORY_LABEL[category]}
            </span>
          ))}
          <span className="rounded-full bg-surface-container px-2 py-1 text-[10px] font-black text-slate-500">{events.length}件</span>
        </div>
      </div>
      <div className="touch-scroll overflow-x-auto rounded-xl bg-surface-container px-3">
        <div className="relative h-28 md:h-36" style={{ width: contentWidth }}>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-300 dark:bg-slate-700" />
          <div className="absolute left-0 right-0 top-[32%] h-px border-t border-dashed border-slate-300/70 dark:border-slate-700/70" />
          <div className="absolute left-0 right-0 top-[68%] h-px border-t border-dashed border-slate-300/70 dark:border-slate-700/70" />
          <div className="absolute bottom-2 top-2 w-0.5 bg-rose-500" style={{ left: nowX }} />
          {clusters.map(cluster => {
            const representativeOffset = Math.round(cluster.ratio * rangeSeconds);
            const left = xForOffset(representativeOffset);
            const selected = cluster.eventIds.some(id => id === selectedEventId);
            const firstEvent = events.find(event => event.id === cluster.eventIds[0]);
            const title = firstEvent
              ? `${formatOffsetSigned(representativeOffset)} ${cluster.count}件: ${labelForEvent(firstEvent, videoNameById, signageNameById, newsPresetById)}`
              : `${formatOffsetSigned(representativeOffset)} ${cluster.count}件`;
            return (
              <button
                key={`${cluster.binIndex}-${cluster.category}`}
                type="button"
                onClick={() => {
                  if (onJumpToOffset) onJumpToOffset(representativeOffset);
                  else if (firstEvent) onSelectEvent(firstEvent);
                }}
                className={`absolute top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface text-[10px] font-black text-white shadow-sm transition hover:scale-110 ${
                  selected ? "ring-4 ring-primary/30" : ""
                } ${cluster.count > 1 ? "h-8 min-w-8 px-2" : "h-4 w-4"}`}
                style={{ left, backgroundColor: CATEGORY_COLOR[cluster.category] }}
                title={title}
              >
                {cluster.count > 1 ? cluster.count : ""}
              </button>
            );
          })}
          {ticks.map(tick => {
            const left = xForOffset(tick);
            return (
              <button
                key={tick}
                type="button"
                onClick={() => onJumpToOffset?.(tick)}
                className="absolute bottom-0 -translate-x-1/2 text-[9px] font-black text-slate-400 hover:text-purple-600"
                style={{ left }}
              >
                <span className="mx-auto mb-1 block h-2 w-px bg-slate-300 dark:bg-slate-700" />
                {formatOffsetSigned(tick).slice(1)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
